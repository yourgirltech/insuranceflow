// Runs one claim through the AI path of the FNOL workflow, node by node, using the workflow's own
// code and request builders. Intake validation, the policy lookup, query embedding, pgvector search,
// RAG assembly, the coverage call and the guardrails all match production. The adjuster email and
// database writes are not run; they don't affect the coverage decision.
import { evalParam, loadWorkflow, readSetNode, runCodeNode } from './n8n.mjs'

const NODE = {
  config: 'Config',
  webhook: 'FNOL Intake Webhook',
  validate: 'Validate & Normalize',
  policy: 'Policy Lookup (Supabase)',
  embed: 'Generate Query Embedding',
  search: 'Vector Search - Policy KB (pgvector)',
  rag: 'Assemble RAG Context',
  coverage: 'Coverage Check (Gemini + RAG)',
  guardrails: 'Parse Coverage Response',
}

const parseBody = b => (typeof b === 'string' ? JSON.parse(b) : b)

/** The model's verdict before guardrails, parsed the same way the Parse Coverage node does. */
function readRawVerdict(response) {
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return null
  try {
    const p = JSON.parse(text.replace(/```json|```/g, '').trim())
    return {
      coverage_status: p.coverage_status ?? null,
      confidence: Number(p.confidence),
      cited_sources: Array.isArray(p.cited_sources) ? p.cited_sources.map(String) : [],
    }
  } catch {
    return { unparseable: true }
  }
}

export function createPipeline({ workflowPath, gemini, kb, policies, configOverrides = {} }) {
  const wf = loadWorkflow(workflowPath)
  const config = { ...readSetNode(wf.node(NODE.config)), ...configOverrides }
  const limit = Number(wf.node(NODE.search).parameters.query.match(/LIMIT\s+(\d+)/i)?.[1] ?? 6)
  // Supabase getAll with "Always Output Data" yields one empty item when nothing matches.
  const lookupPolicy = number => {
    const row = policies.find(p => p.policy_number === number)
    if (!row) return {}
    const { eval_only, ...columns } = row
    return columns
  }

  async function runCase(input) {
    const started = Date.now()
    const outputs = { [NODE.config]: [config], [NODE.webhook]: [{ body: input }] }

    const intake = runCodeNode(wf.node(NODE.validate), { outputs })[0]
    outputs[NODE.validate] = [intake]
    if (!intake.valid) return { outcome: 'rejected', errors: intake.errors, ms: { total: Date.now() - started } }

    const policy = lookupPolicy(intake.policyNumber)
    outputs[NODE.policy] = [policy]

    // Follows the export: without "continue on error" here (and on the vector search, which reads the
    // embedding), a failure stops the run before the claim is saved and counts as a pipeline error.
    // With both set, the error item reaches the RAG code node as an empty retrieval.
    const embedNode = wf.node(NODE.embed)
    const continuesOnError = n => n.onError === 'continueRegularOutput' || n.continueOnFail === true
    let embedding = null, embedError = null
    try {
      embedding = await gemini.post(evalParam(embedNode.parameters.url, { outputs }), parseBody(evalParam(embedNode.parameters.jsonBody, { outputs })))
    } catch (err) {
      if (!continuesOnError(embedNode) || !continuesOnError(wf.node(NODE.search))) {
        return { outcome: 'pipeline_error', error_stage: 'embedding', error: err.message, ms: { total: Date.now() - started } }
      }
      embedError = err.message
    }

    const rows = embedding ? kb.search(intake.tenantId, embedding.json.embedding.values, limit) : []
    // The Postgres node also has "Always Output Data": zero rows arrive as one empty item.
    const rag = runCodeNode(wf.node(NODE.rag), { outputs, input: rows.length ? rows : [{}] })[0]
    outputs[NODE.rag] = [rag]

    // The coverage node continues on error, so a failed call reaches the guardrails as an error item.
    const coverageNode = wf.node(NODE.coverage)
    let response, apiError = null, coverageMs = 0
    try {
      const res = await gemini.post(evalParam(coverageNode.parameters.url, { outputs }), parseBody(evalParam(coverageNode.parameters.jsonBody, { outputs })))
      response = res.json
      coverageMs = res.ms
    } catch (err) {
      apiError = err.message
      response = { error: { message: err.message } }
    }

    const final = runCodeNode(wf.node(NODE.guardrails), { outputs, input: [response] })[0]
    const usage = response?.usageMetadata ?? {}

    return {
      outcome: 'decided',
      model: config.chatModel,
      policy_found: Boolean(policy.policy_number),
      policy_status: policy.status ?? null,
      retrieved: rows.map(r => ({ source: r.source, similarity: Number(r.similarity.toFixed(4)) })),
      kept_sources: rag.sources,
      raw: readRawVerdict(response),
      final,
      api_error: apiError,
      embed_error: embedError,
      usage: { prompt_tokens: usage.promptTokenCount ?? 0, output_tokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) },
      ms: { embed: embedding?.ms ?? 0, coverage: coverageMs, total: Date.now() - started },
    }
  }

  return { runCase, config, limit }
}
