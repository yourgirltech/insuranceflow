#!/usr/bin/env node
// Runs the golden set a few cases at a time, for API keys on a daily free-tier quota. Each call runs
// the next batch of cases that don't yet have a clean answer (no API or embedding failure), then
// re-scores every clean answer so far into evals/runs/cumulative/. Schedule it once a day after the
// quota resets; it reports "complete" once every case has a clean answer.
//
//   node evals/batch.mjs                         next 18 pending cases on gemini-3.8-flash
//   node evals/batch.mjs --size 10 --model gemini-3.5-flash
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values: args } = parseArgs({
  options: {
    model: { type: 'string', default: 'gemini-3.8-flash' },
    size: { type: 'string', default: '18' },
  },
})

const runsDir = join(root, 'evals/runs')
const cumulativeDir = join(runsDir, 'cumulative')
const readJsonl = p => readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
const clean = r => r.outcome !== 'decided' || !(r.api_error || r.embed_error)

// Latest clean row per case, across every live run on this model.
function cleanRows() {
  const best = new Map()
  if (!existsSync(runsDir)) return best
  for (const dir of readdirSync(runsDir).sort()) {
    const metaPath = join(runsDir, dir, 'meta.json')
    const resultsPath = join(runsDir, dir, 'results.jsonl')
    if (!existsSync(metaPath) || !existsSync(resultsPath)) continue
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
    if (meta.model !== args.model || meta.replayed_from || meta.cumulative) continue
    for (const r of readJsonl(resultsPath)) if (clean(r)) best.set(r.id, r)
  }
  return best
}

const ids = readJsonl(join(root, 'evals/golden/claims.jsonl')).map(c => c.id)
let done = cleanRows()
const pending = ids.filter(id => !done.has(id))
const stamp = new Date().toISOString().slice(0, 16)

const batch = pending.slice(0, Number(args.size))
if (batch.length) {
  console.log(`[${stamp}] ${done.size}/${ids.length} cases have clean answers; running ${batch.length} more on ${args.model}`)
  const env = { ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env['GEMINI-API-KEY'] }
  spawnSync(process.execPath, [join(root, 'evals/run.mjs'), '--model', args.model, '--concurrency', '1', '--no-gate', '--only', batch.join(',')], { stdio: 'inherit', env, cwd: root })
  done = cleanRows()
}

// Re-score every clean answer so far as one cumulative run.
mkdirSync(cumulativeDir, { recursive: true })
const rows = ids.filter(id => done.has(id)).map(id => done.get(id))
writeFileSync(join(cumulativeDir, 'results.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
writeFileSync(join(cumulativeDir, 'meta.json'), JSON.stringify({ model: args.model, cumulative: true, clean_cases: rows.length, total_cases: ids.length }, null, 2))
spawnSync(process.execPath, [join(root, 'evals/run.mjs'), '--replay', join(cumulativeDir, 'results.jsonl'), '--out', join(cumulativeDir, 'reports'), '--no-gate'], { stdio: 'inherit', cwd: root })

const status = rows.length === ids.length ? 'complete' : 'in progress'
console.log(`[${stamp}] ${rows.length}/${ids.length} cases scored (${status}). Latest report: evals/runs/cumulative/reports/`)
