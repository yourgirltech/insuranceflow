// Offline tests: the real workflow code runs against a fake Gemini, so these need no API key.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildKnowledgeBase } from '../lib/kb.mjs'
import { checkGates, computeMetrics } from '../lib/metrics.mjs'
import { loadWorkflow, readSetNode, runCodeNode } from '../lib/n8n.mjs'
import { createPipeline } from '../lib/pipeline.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WORKFLOW = join(root, 'n8n/insurance-fnol-claims-pipeline.json')
const INGESTION = join(root, 'n8n/policy-kb-ingestion.json')
const policies = JSON.parse(readFileSync(join(root, 'evals/golden/policies.json'), 'utf8')).policies

// Bag-of-words vectors: enough for retrieval to behave sensibly without a real embedding model.
const DIMS = 512
function embedText(text) {
  const v = new Array(DIMS).fill(0)
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    let h = 0
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    v[h % DIMS] += 1
  }
  return v
}

function fakeGemini(verdictFor) {
  return {
    async post(url, body) {
      const b = typeof body === 'string' ? JSON.parse(body) : body
      if (url.includes(':embedContent')) return { json: { embedding: { values: embedText(b.content.parts[0].text) } }, ms: 1 }
      const verdict = verdictFor(b.contents[0].parts[0].text)
      if (verdict instanceof Error) throw verdict
      return { json: { candidates: [{ content: { parts: [{ text: typeof verdict === 'string' ? verdict : JSON.stringify(verdict) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }, ms: 5 }
    },
  }
}

const claim = (overrides = {}) => ({
  policyNumber: 'PAP-100234',
  policyholderEmail: 'dana@example.com',
  lineOfBusiness: 'auto',
  incidentDate: '2026-09-12',
  incidentDescription: 'Collision with another car caused direct and accidental loss to my covered auto.',
  photos: [],
  ...overrides,
})

async function makePipeline(verdictFor) {
  const gemini = fakeGemini(verdictFor)
  const kb = await buildKnowledgeBase({ ingestion: loadWorkflow(INGESTION), gemini })
  return createPipeline({ workflowPath: WORKFLOW, gemini, kb, policies })
}

describe('guardrails from the exported workflow', () => {
  const wf = loadWorkflow(WORKFLOW)
  const outputs = (policy, sources, tenantId = '') => ({
    Config: [readSetNode(wf.node('Config'))],
    'Validate & Normalize': [{ tenantId }],
    'Policy Lookup (Supabase)': [policy],
    'Assemble RAG Context': [{ retrievedContext: '...', chunkCount: sources.length, sources }],
  })
  const parse = (policy, sources, text, tenantId) =>
    runCodeNode(wf.node('Parse Coverage Response'), { outputs: outputs(policy, sources, tenantId), input: [{ candidates: [{ content: { parts: [{ text }] } }] }] })[0]
  const active = { policy_number: 'PAP-100234', status: 'active' }

  it("treats another tenant's policy as not found", () => {
    const covered = JSON.stringify({ coverage_status: 'covered', confidence: 0.95, reasoning: 'ok', cited_sources: ['A'] })
    const other = parse({ ...active, tenant_id: 'tenant-b' }, ['A'], covered, 'tenant-a')
    assert.equal(other.coverage_status, 'needs_review')
    assert.ok(other.risk_flags.includes('policy_not_found'))
    assert.equal(parse({ ...active, tenant_id: 'tenant-a' }, ['A'], covered, 'tenant-a').coverage_status, 'covered')
    assert.equal(parse({ ...active, tenant_id: 'tenant-a' }, ['A'], covered, '').coverage_status, 'covered')
  })

  it('routes unparseable model output to human review', () => {
    const r = parse(active, ['A'], 'not json')
    assert.equal(r.coverage_status, 'needs_review')
    assert.equal(r.confidence, 0)
  })

  it('downgrades a covered verdict on a lapsed policy and flags it', () => {
    const r = parse({ policy_number: 'PAP-100871', status: 'lapsed' }, ['A'], '{"coverage_status":"covered","confidence":0.95,"reasoning":"ok","cited_sources":["A"]}')
    assert.equal(r.coverage_status, 'needs_review')
    assert.deepEqual(r.risk_flags, ['policy_not_active'])
  })

  it('strips citations that were not retrieved', () => {
    const r = parse(active, ['A'], '{"coverage_status":"covered","confidence":0.9,"reasoning":"ok","cited_sources":["A","Invented Endorsement"]}')
    assert.deepEqual(r.cited_sources, ['A'])
  })

  it('downgrades low-confidence verdicts', () => {
    const r = parse(active, ['A'], '{"coverage_status":"denied","confidence":0.4,"reasoning":"unsure","cited_sources":["A"]}')
    assert.equal(r.coverage_status, 'needs_review')
    assert.ok(r.risk_flags.includes('low_confidence'))
  })
})

describe('pipeline end to end (fake model)', () => {
  it('rejects invalid intake before any model call', async () => {
    const p = await makePipeline(() => assert.fail('model should not be called'))
    const r = await p.runCase(claim({ incidentDescription: 'crash' }))
    assert.equal(r.outcome, 'rejected')
  })

  it('retrieves the governing section and passes it to the model', async () => {
    let prompt = ''
    const p = await makePipeline(text => { prompt = text; return { coverage_status: 'covered', confidence: 0.9, reasoning: 'Collision.', cited_sources: ['PAP-2026 Section II - Collision'] } })
    const r = await p.runCase(claim({ incidentDescription: 'The car hit another object and overturn followed; whether or not I am at fault, apply the deductible.' }))
    assert.equal(r.outcome, 'decided')
    assert.equal(r.retrieved[0].source, 'PAP-2026 Section II - Collision')
    assert.ok(prompt.includes('source: PAP-2026 Section II - Collision'))
    assert.equal(r.final.coverage_status, 'covered')
    assert.equal(p.limit, 6)
  })

  it('flags an unknown policy even when the model says covered', async () => {
    const p = await makePipeline(() => ({ coverage_status: 'covered', confidence: 0.99, reasoning: 'ok', cited_sources: [] }))
    const r = await p.runCase(claim({ policyNumber: 'PAP-999999' }))
    assert.equal(r.final.coverage_status, 'needs_review')
    assert.ok(r.final.risk_flags.includes('policy_not_found'))
    assert.equal(r.policy_found, false)
  })

  it('fails closed when the coverage call errors', async () => {
    const p = await makePipeline(() => new Error('HTTP 503'))
    const r = await p.runCase(claim())
    assert.equal(r.final.coverage_status, 'needs_review')
    assert.match(r.api_error, /503/)
  })

  it('keeps the claim and sends it to review when the embedding call fails', async () => {
    let prompt = ''
    const gemini = fakeGemini(text => { prompt = text; return { coverage_status: 'needs_review', confidence: 0.4, reasoning: 'No policy language.', cited_sources: [] } })
    const kb = await buildKnowledgeBase({ ingestion: loadWorkflow(INGESTION), gemini })
    const failing = { post: async (url, body) => { if (url.includes(':embedContent')) throw new Error('HTTP 500'); return gemini.post(url, body) } }
    const p = createPipeline({ workflowPath: WORKFLOW, gemini: failing, kb, policies })
    const r = await p.runCase(claim())
    assert.equal(r.outcome, 'decided')
    assert.match(r.embed_error, /500/)
    assert.deepEqual(r.retrieved, [])
    assert.ok(prompt.includes('NO RELEVANT POLICY LANGUAGE FOUND.'))
    assert.equal(r.final.coverage_status, 'needs_review')
  })
})

describe('metrics', () => {
  const row = (id, expected, final, extra = {}) => ({
    id, run: 1, category: 'test', tags: extra.tags ?? [], rationale: '',
    expected: { status: expected[0], acceptable: expected, sources: extra.sources ?? ['S'], flags: extra.flags ?? [] },
    outcome: 'decided',
    final: { coverage_status: final, confidence: 0.9, reasoning: '', cited_sources: extra.cited ?? ['S'], risk_flags: extra.risk_flags ?? [] },
    raw: { coverage_status: extra.raw ?? final, confidence: 0.9, cited_sources: extra.rawCited ?? extra.cited ?? ['S'] },
    retrieved: (extra.retrieved ?? ['S']).map(s => ({ source: s, similarity: 0.8 })),
    kept_sources: extra.retrieved ?? ['S'],
    usage: { prompt_tokens: 10, output_tokens: 5 },
    ms: { total: 100 },
  })

  it('counts an unsafe approval and fails the safety gate', () => {
    const s = computeMetrics([row('a', ['denied', 'needs_review'], 'covered'), row('b', ['covered'], 'covered')])
    assert.equal(s.decisions.unsafe_approvals, 1)
    assert.deepEqual(s.decisions.unsafe_approval_ids, ['a'])
    assert.equal(s.decisions.acceptable_accuracy, 0.5)
    const [gate] = checkGates(s, { 'decisions.unsafe_approvals': { max: 0 } })
    assert.equal(gate.pass, false)
  })

  it('scores retrieval, citations, fabricated sources and guardrail saves', () => {
    const s = computeMetrics([
      row('hit', ['covered'], 'covered'),
      row('miss', ['covered'], 'covered', { retrieved: ['X'], cited: ['X'] }),
      row('fab', ['needs_review'], 'needs_review', { raw: 'covered', rawCited: ['Made Up'], cited: [] }),
    ])
    assert.equal(s.retrieval.hit_rate, 2 / 3)
    assert.deepEqual(s.retrieval.miss_ids, ['miss'])
    assert.equal(s.citations.precision, 0.5)
    assert.deepEqual(s.citations.raw_fabricated_ids, ['fab'])
    assert.equal(s.guardrails.downgrade_saves, 1)
  })

  it('measures agreement across repeats', () => {
    const r1 = row('x', ['covered'], 'covered')
    const r2 = { ...row('x', ['covered'], 'needs_review'), run: 2 }
    const s = computeMetrics([r1, r2])
    assert.equal(s.consistency.mean_agreement, 0.5)
    assert.deepEqual(s.consistency.unstable_ids, ['x'])
  })
})
