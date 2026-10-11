// Renders a run as Markdown: gates first, then the numbers an adjuster or hiring manager asks
// about, then every failure with what the pipeline saw, so each one can be investigated.
import { statusOf } from './metrics.mjs'

const pct = v => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`)
const num = v => (v === null || v === undefined ? 'n/a' : String(v))
const ids = xs => (xs?.length ? xs.map(x => `\`${x}\``).join(', ') : 'none')

function delta(cur, base, { asPct = true, lowerIsBetter = false } = {}) {
  if (cur == null || base == null) return ''
  const d = cur - base
  if (Math.abs(d) < 1e-9) return ' (=)'
  const better = lowerIsBetter ? d < 0 : d > 0
  const shown = asPct ? `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)} pts` : `${d > 0 ? '+' : ''}${d}`
  return ` (${shown} ${better ? '▲' : '▼'})`
}

export function renderReport({ meta, summary: s, gates, rows, baseline: b }) {
  const out = []
  const line = (...xs) => out.push(xs.join(''))
  const B = b ?? {}

  line(`# InsureFlow coverage-check evals`)
  line()
  line(`Run \`${meta.run_id}\` · model \`${meta.model}\` · ${s.counts.cases} cases × ${s.counts.runs_per_case} run(s) · knowledge base: ${meta.kb_size} chunks · top-k ${meta.top_k}`)
  line()
  line(`> Golden labels: **${meta.label_status}**. ${meta.label_status === 'reviewed' ? '' : 'Numbers are indicative until a licensed adjuster has reviewed the expected outcomes in `evals/golden/claims.jsonl`.'}`)
  if (s.counts.call_failures) line(`>`, `\n> ⚠️ **${s.counts.call_failures} of ${s.counts.rows} rows had a failed model or embedding call** and are left out of the quality metrics (the pipeline sends them to review). Rerun before trusting accuracy numbers.`)
  if (b) line(`>`, `\n> Compared with baseline \`${b._run_id ?? 'baseline'}\` (${b._model ?? 'unknown model'}).`)
  line()

  const failed = gates.filter(g => !g.pass)
  line(`## Gates: ${failed.length ? `❌ ${failed.length} failing` : '✅ all passing'}`)
  line()
  line(`| Metric | Value | Rule | Result |`, `\n|---|---|---|---|`)
  for (const g of gates) {
    const rule = [('min' in g.rule ? `≥ ${g.rule.min}` : ''), ('max' in g.rule ? `≤ ${g.rule.max}` : '')].filter(Boolean).join(', ')
    const isRate = /rate|accuracy|precision|recall/.test(g.metric)
    line(`| \`${g.metric}\` | ${isRate ? pct(g.value) : num(g.value)} | ${rule} | ${g.pass ? 'pass' : '**fail**'} |`)
  }
  line()

  const d = s.decisions, bd = B.decisions ?? {}
  line(`## Decisions (final status after guardrails)`)
  line()
  line(`| | Value |`, `\n|---|---|`)
  line(`| Acceptable outcome | ${pct(d.acceptable_accuracy)}${delta(d.acceptable_accuracy, bd.acceptable_accuracy)} |`)
  line(`| Exact match with the primary label | ${pct(d.exact_accuracy)}${delta(d.exact_accuracy, bd.exact_accuracy)} |`)
  line(`| **Unsafe approvals** (covered when it shouldn't be) | **${d.unsafe_approvals}**${delta(d.unsafe_approvals, bd.unsafe_approvals, { asPct: false, lowerIsBetter: true })} — ${ids(d.unsafe_approval_ids)} |`)
  line(`| Wrongful denials (denied when it shouldn't be) | ${d.wrongful_denials}${delta(d.wrongful_denials, bd.wrongful_denials, { asPct: false, lowerIsBetter: true })} — ${ids(d.wrongful_denial_ids)} |`)
  line(`| Over-escalations (sent to review needlessly) | ${d.over_escalations} — ${ids(d.over_escalation_ids)} |`)
  line(`| Auto-decision rate on clear-cut claims | ${pct(d.auto_decision_rate)}${delta(d.auto_decision_rate, bd.auto_decision_rate)} |`)
  line(`| Share of decided claims sent to review | ${pct(d.needs_review_rate)} |`)
  line()
  const st = ['covered', 'needs_review', 'denied', 'rejected', 'error']
  line(`Confusion matrix (rows = expected, columns = pipeline):`)
  line()
  line(`| expected \\ got | ${st.join(' | ')} |`, `\n|---|${st.map(() => '---').join('|')}|`)
  for (const g of st) if (Object.values(d.confusion[g]).some(Boolean)) line(`| **${g}** | ${st.map(p => d.confusion[g][p] || '·').join(' | ')} |`)
  line()

  const r = s.retrieval, br = B.retrieval ?? {}
  line(`## Retrieval (pgvector top-${meta.top_k}, similarity floor 0.35)`)
  line()
  line(`| | Value |`, `\n|---|---|`)
  line(`| Governing section kept for the model (hit rate) | ${pct(r.hit_rate)}${delta(r.hit_rate, br.hit_rate)} |`)
  line(`| Recall of governing sections | ${pct(r.recall)}${delta(r.recall, br.recall)} |`)
  line(`| MRR (rank of first governing section) | ${r.mrr == null ? 'n/a' : r.mrr.toFixed(3)} |`)
  line(`| Misses | ${ids(r.miss_ids)} |`)
  line(`| Retrieved but cut by the similarity floor | ${ids(r.floor_drop_ids)} |`)
  line()

  const c = s.citations, bc = B.citations ?? {}
  line(`## Citations`)
  line()
  line(`| | Value |`, `\n|---|---|`)
  line(`| Precision (cited sections that govern the claim) | ${pct(c.precision)}${delta(c.precision, bc.precision)} |`)
  line(`| Recall (governing sections that were cited) | ${pct(c.recall)}${delta(c.recall, bc.recall)} |`)
  line(`| Covered/denied decisions with no citation | ${c.uncited_decisions} — ${ids(c.uncited_decision_ids)} |`)
  line(`| Model cited a source it wasn't given (stripped by guardrail) | ${c.raw_fabricated} — ${ids(c.raw_fabricated_ids)} |`)
  line()

  const g = s.guardrails
  line(`## Guardrails`)
  line()
  line(`| | Value |`, `\n|---|---|`)
  line(`| Required risk flags raised | ${pct(g.flag_accuracy)} of ${g.flag_cases} — missing: ${ids(g.missing_flag_ids)} |`)
  line(`| Model verdicts downgraded to needs_review | ${g.downgrades} |`)
  line(`| …where the downgrade prevented a wrong outcome | ${g.downgrade_saves} — ${ids(g.downgrade_save_ids)} |`)
  line(`| …where the downgrade turned a right answer wrong | ${g.downgrade_costs} |`)
  line(`| Prompt-injection cases handled safely | ${pct(s.robustness.injection_pass_rate)} of ${s.robustness.injection_cases} |`)
  line()

  line(`## Calibration (model confidence vs. correctness, before guardrails)`)
  line()
  line(`| Confidence | Claims | Correct |`, `\n|---|---|---|`)
  for (const k of s.calibration) line(`| ${k.bucket} | ${k.n} | ${pct(k.accuracy)} |`)
  line()

  if (s.consistency) {
    line(`## Consistency across ${s.counts.runs_per_case} runs`)
    line()
    line(`Mean agreement with each case's most common outcome: **${pct(s.consistency.mean_agreement)}**. Unstable cases: ${ids(s.consistency.unstable_ids)}`)
    line()
  }

  const o = s.ops
  line(`## Operations`)
  line()
  line(`Pipeline errors ${o.pipeline_errors} · API errors ${o.api_errors} · unparseable model output ${o.unparseable} · latency p50 ${num(o.latency_p50_ms)} ms, p95 ${num(o.latency_p95_ms)} ms · tokens ${o.prompt_tokens} in / ${o.output_tokens} out`)
  line()

  line(`## By category`)
  line()
  line(`| Category | Rows | Acceptable | Exact |`, `\n|---|---|---|---|`)
  for (const [cat, v] of Object.entries(s.by_category).sort()) line(`| ${cat} | ${v.n} | ${pct(v.acceptable)} | ${pct(v.exact)} |`)
  line()

  const failures = rows.filter(row => !row.expected.acceptable.includes(statusOf(row)))
  line(`## Failures (${failures.length})`)
  line()
  if (!failures.length) line(`None.`)
  for (const f of failures) {
    line(`### \`${f.id}\` (run ${f.run}) — expected ${f.expected.acceptable.join(' / ')}, got **${statusOf(f)}**`)
    line()
    line(`- Why this label: ${f.rationale}`)
    if (f.outcome === 'decided') {
      line(`- Model said: ${f.raw?.coverage_status ?? 'unparseable'} (confidence ${f.raw?.confidence ?? 'n/a'}) → final ${f.final.coverage_status}; flags: ${f.final.risk_flags.join(', ') || 'none'}`)
      line(`- Reasoning: ${f.final.reasoning}`)
      line(`- Retrieved: ${f.retrieved.map(x => `${x.source} (${x.similarity.toFixed(2)})`).join('; ') || 'nothing'}`)
      line(`- Cited: ${f.final.cited_sources.join('; ') || 'nothing'}`)
    } else {
      line(`- ${f.outcome}: ${f.error ?? f.errors?.join('; ')}`)
    }
    line()
  }

  return out.join('\n')
}
