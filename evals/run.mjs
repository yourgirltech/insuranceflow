#!/usr/bin/env node
// Runs the golden set through the FNOL coverage pipeline and writes results, a summary and a
// Markdown report to evals/runs/<run_id>/. Exits non-zero when a gate in thresholds.json fails.
//
//   GEMINI_API_KEY=... node evals/run.mjs                      full run with the workflow's model
//   node evals/run.mjs --model gemini-2.5-pro --repeats 3       compare a model, check stability
//   node evals/run.mjs --only injection,policy_status           ids, categories or tags
//   node evals/run.mjs --replay evals/runs/<id>/results.jsonl   re-score without calling the API
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createGemini, withEmbeddingCache } from './lib/gemini.mjs'
import { buildKnowledgeBase } from './lib/kb.mjs'
import { checkGates, computeMetrics, statusOf } from './lib/metrics.mjs'
import { loadWorkflow } from './lib/n8n.mjs'
import { createPipeline } from './lib/pipeline.mjs'
import { renderReport } from './lib/report.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values: args } = parseArgs({
  options: {
    cases: { type: 'string', default: join(root, 'evals/golden/claims.jsonl') },
    policies: { type: 'string', default: join(root, 'evals/golden/policies.json') },
    workflow: { type: 'string', default: join(root, 'n8n/insurance-fnol-claims-pipeline.json') },
    ingestion: { type: 'string', default: join(root, 'n8n/policy-kb-ingestion.json') },
    kb: { type: 'string' },
    model: { type: 'string' },
    repeats: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '2' },
    only: { type: 'string' },
    out: { type: 'string', default: join(root, 'evals/runs') },
    baseline: { type: 'string' },
    replay: { type: 'string' },
    thresholds: { type: 'string', default: join(root, 'evals/thresholds.json') },
    'label-status': { type: 'string', default: 'draft' },
    'no-gate': { type: 'boolean', default: false },
  },
})

const readJsonl = p => readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))

let cases = readJsonl(args.cases)
if (args.only) {
  const keep = new Set(args.only.split(',').map(s => s.trim()))
  cases = cases.filter(c => keep.has(c.id) || keep.has(c.category) || c.tags.some(t => keep.has(t)))
}
if (!cases.length) throw new Error('No cases selected.')

async function pool(tasks, size, fn) {
  const results = new Array(tasks.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, async () => {
    while (next < tasks.length) { const i = next++; results[i] = await fn(tasks[i], i) }
  }))
  return results
}

let rows, meta
if (args.replay) {
  const caseById = new Map(cases.map(c => [c.id, c]))
  // Re-attach the current labels so edited expectations are re-scored against old outputs.
  rows = readJsonl(args.replay).filter(r => caseById.has(r.id)).map(r => ({ ...r, ...pickCase(caseById.get(r.id)) }))
  const metaPath = join(dirname(args.replay), 'meta.json')
  meta = { ...(existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {}), replayed_from: args.replay }
} else {
  const client = withEmbeddingCache(createGemini({ apiKey: process.env.GEMINI_API_KEY }), join(root, 'evals/.cache/embeddings.json'))
  const kb = await buildKnowledgeBase({ ingestion: loadWorkflow(args.ingestion), gemini: client, docsPath: args.kb })
  const policies = JSON.parse(readFileSync(args.policies, 'utf8')).policies
  const pipeline = createPipeline({
    workflowPath: args.workflow,
    gemini: client,
    kb,
    policies,
    configOverrides: args.model ? { chatModel: args.model } : {},
  })
  const repeats = Number(args.repeats)
  const tasks = cases.flatMap(c => Array.from({ length: repeats }, (_, run) => ({ c, run: run + 1 })))
  console.log(`Running ${cases.length} cases × ${repeats} on ${pipeline.config.chatModel} (KB: ${kb.size} chunks, top-${pipeline.limit})`)

  let done = 0
  rows = await pool(tasks, Number(args.concurrency), async ({ c, run }) => {
    const trace = await pipeline.runCase(c.input)
    const row = { id: c.id, run, ...pickCase(c), ...trace }
    const ok = c.expected.acceptable.includes(statusOf(row))
    console.log(`${String(++done).padStart(3)}/${tasks.length} ${ok ? 'ok  ' : 'FAIL'} ${c.id.padEnd(18)} expected ${c.expected.status.padEnd(12)} got ${statusOf(row)}`)
    return row
  })
  client.save()

  meta = {
    model: pipeline.config.chatModel,
    embedding_model: pipeline.config.embeddingModel,
    top_k: pipeline.limit,
    kb_size: kb.size,
    kb_source: args.kb ?? 'n8n/policy-kb-ingestion.json',
    started_at: new Date().toISOString(),
  }
}

function pickCase(c) {
  return { category: c.category, tags: c.tags, expected: c.expected, rationale: c.rationale }
}

const runId = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${meta.model ?? 'replay'}`
meta = { ...meta, run_id: runId, label_status: args['label-status'], cases: cases.length }

const summary = computeMetrics(rows)
const gates = checkGates(summary, JSON.parse(readFileSync(args.thresholds, 'utf8')))
const baseline = args.baseline ? JSON.parse(readFileSync(args.baseline, 'utf8')) : null

const outDir = join(args.out, runId)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'results.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ _run_id: runId, _model: meta.model, ...summary }, null, 2))
writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2))
writeFileSync(join(outDir, 'report.md'), renderReport({ meta, summary, gates, rows, baseline }))

const d = summary.decisions
console.log(`\nAcceptable ${(d.acceptable_accuracy * 100).toFixed(1)}% · unsafe approvals ${d.unsafe_approvals} · wrongful denials ${d.wrongful_denials} · retrieval hit ${summary.retrieval.hit_rate == null ? 'n/a' : (summary.retrieval.hit_rate * 100).toFixed(1) + '%'}`)
for (const g of gates) console.log(`${g.pass ? 'pass' : 'FAIL'}  ${g.metric} = ${g.value}`)
console.log(`\nReport: ${join(outDir, 'report.md')}`)
if (!args['no-gate'] && gates.some(g => !g.pass)) process.exitCode = 1
