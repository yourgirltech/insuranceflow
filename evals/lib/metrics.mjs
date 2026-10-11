// Scores pipeline results against the golden set. Every metric is computed per result row, so a
// run with --repeats counts each repeat; id lists are de-duplicated for the report.

export const statusOf = r =>
  r.outcome === 'rejected' ? 'rejected' : r.outcome === 'pipeline_error' ? 'error' : r.final.coverage_status

const rate = (num, den) => (den ? num / den : null)
const uniq = xs => [...new Set(xs)]
const percentile = (xs, p) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
}

// A row whose model or embedding call failed never got an answer. The pipeline routes it to review,
// which is safe, but scoring it would measure the API rather than the model, so quality metrics skip
// it. Safety (unsafe approvals) and ops still count every row.
const callFailed = r => r.outcome === 'decided' && Boolean(r.api_error || r.embed_error)

export function computeMetrics(allRows) {
  const rows = allRows.filter(r => !callFailed(r))
  const decided = rows.filter(r => r.outcome === 'decided')
  const allDecided = allRows.filter(r => r.outcome === 'decided')
  const statuses = ['covered', 'needs_review', 'denied', 'rejected', 'error']

  // Decisions: the final status after guardrails, which is what the adjuster sees.
  const confusion = Object.fromEntries(statuses.map(g => [g, Object.fromEntries(statuses.map(p => [p, 0]))]))
  const acceptable = r => r.expected.acceptable.includes(statusOf(r))
  for (const r of rows) confusion[r.expected.status][statusOf(r)]++

  const unsafe = allRows.filter(r => statusOf(r) === 'covered' && !r.expected.acceptable.includes('covered'))
  const wrongfulDenials = rows.filter(r => statusOf(r) === 'denied' && !r.expected.acceptable.includes('denied'))
  const overEscalations = rows.filter(r => statusOf(r) === 'needs_review' && !r.expected.acceptable.includes('needs_review'))
  const autoDecidable = rows.filter(r => r.expected.status === 'covered' || r.expected.status === 'denied')

  // Retrieval: were the policy sections that govern the claim retrieved and kept above the floor?
  const withGold = decided.filter(r => r.expected.sources.length)
  let hits = 0, recallSum = 0, rrSum = 0
  const floorDrops = [], misses = []
  for (const r of withGold) {
    const gold = new Set(r.expected.sources)
    const kept = new Set(r.kept_sources)
    const found = [...gold].filter(s => kept.has(s))
    if (found.length) hits++
    else misses.push(r.id)
    recallSum += found.length / gold.size
    const rank = r.retrieved.findIndex(x => gold.has(x.source))
    rrSum += rank >= 0 ? 1 / (rank + 1) : 0
    if (r.retrieved.some(x => gold.has(x.source) && !kept.has(x.source))) floorDrops.push(r.id)
  }

  // Citations: final citations (after the guardrail strips unretrieved ones) against the gold sections.
  let citedTotal = 0, citedCorrect = 0, goldTotal = 0, goldCited = 0
  const uncited = [], fabricated = []
  for (const r of decided) {
    const gold = new Set(r.expected.sources)
    const cited = r.final.cited_sources
    if (gold.size) {
      citedTotal += cited.length
      citedCorrect += cited.filter(s => gold.has(s)).length
      goldTotal += gold.size
      goldCited += [...gold].filter(s => cited.includes(s)).length
    }
    if (['covered', 'denied'].includes(r.final.coverage_status) && cited.length === 0) uncited.push(r.id)
    if (r.raw?.cited_sources?.some(s => !r.kept_sources.includes(s))) fabricated.push(r.id)
  }

  // Guardrails: required risk flags, and what the downgrade to needs_review changed.
  const flagCases = decided.filter(r => r.expected.flags.length)
  const missingFlags = flagCases.filter(r => !r.expected.flags.every(f => r.final.risk_flags.includes(f)))
  const parsedRaw = decided.filter(r => r.raw && !r.raw.unparseable && r.raw.coverage_status)
  const downgraded = parsedRaw.filter(r => r.raw.coverage_status !== r.final.coverage_status)
  const saves = downgraded.filter(r => !r.expected.acceptable.includes(r.raw.coverage_status) && acceptable(r))
  const costs = downgraded.filter(r => r.expected.acceptable.includes(r.raw.coverage_status) && !acceptable(r))

  // Calibration: is the model right more often when it says it is confident?
  const buckets = [[0, 0.5], [0.5, 0.7], [0.7, 0.85], [0.85, 1.0001]]
  const calibration = buckets.map(([lo, hi]) => {
    const inB = parsedRaw.filter(r => r.raw.confidence >= lo && r.raw.confidence < hi)
    return {
      bucket: `${lo.toFixed(2)}–${Math.min(hi, 1).toFixed(2)}`,
      n: inB.length,
      accuracy: rate(inB.filter(r => r.expected.acceptable.includes(r.raw.coverage_status)).length, inB.length),
    }
  })

  const injection = rows.filter(r => r.tags.includes('injection'))

  // Consistency across --repeats: share of runs agreeing with each case's most common status.
  const byId = Object.groupBy(rows, r => r.id)
  const runsPerCase = Math.max(...Object.values(byId).map(g => g.length))
  let agreementSum = 0
  const unstable = []
  for (const [id, group] of Object.entries(byId)) {
    const counts = Object.values(Object.groupBy(group, statusOf)).map(g => g.length)
    const share = Math.max(...counts) / group.length
    agreementSum += share
    if (share < 1) unstable.push(id)
  }

  const byCategory = Object.fromEntries(
    Object.entries(Object.groupBy(rows, r => r.category)).map(([c, g]) => [
      c,
      { n: g.length, acceptable: rate(g.filter(acceptable).length, g.length), exact: rate(g.filter(r => statusOf(r) === r.expected.status).length, g.length) },
    ]),
  )

  const latencies = decided.map(r => r.ms.total)
  return {
    counts: { rows: allRows.length, scored: rows.length, call_failures: allRows.length - rows.length, cases: Object.keys(byId).length, runs_per_case: runsPerCase, decided: decided.length },
    decisions: {
      acceptable_accuracy: rate(rows.filter(acceptable).length, rows.length),
      exact_accuracy: rate(rows.filter(r => statusOf(r) === r.expected.status).length, rows.length),
      unsafe_approvals: unsafe.length,
      unsafe_approval_ids: uniq(unsafe.map(r => r.id)),
      wrongful_denials: wrongfulDenials.length,
      wrongful_denial_ids: uniq(wrongfulDenials.map(r => r.id)),
      over_escalations: overEscalations.length,
      over_escalation_ids: uniq(overEscalations.map(r => r.id)),
      // Of the claims a human would decide outright, how many did the AI decide correctly itself?
      auto_decision_rate: rate(autoDecidable.filter(r => statusOf(r) === r.expected.status).length, autoDecidable.length),
      needs_review_rate: rate(decided.filter(r => r.final.coverage_status === 'needs_review').length, decided.length),
      confusion,
    },
    retrieval: {
      cases: withGold.length,
      hit_rate: rate(hits, withGold.length),
      recall: rate(recallSum, withGold.length),
      mrr: rate(rrSum, withGold.length),
      miss_ids: uniq(misses),
      floor_drop_ids: uniq(floorDrops),
    },
    citations: {
      precision: rate(citedCorrect, citedTotal),
      recall: rate(goldCited, goldTotal),
      uncited_decisions: uncited.length,
      uncited_decision_ids: uniq(uncited),
      raw_fabricated: fabricated.length,
      raw_fabricated_ids: uniq(fabricated),
    },
    guardrails: {
      flag_cases: flagCases.length,
      flag_accuracy: rate(flagCases.length - missingFlags.length, flagCases.length),
      missing_flag_ids: uniq(missingFlags.map(r => r.id)),
      downgrades: downgraded.length,
      downgrade_saves: saves.length,
      downgrade_save_ids: uniq(saves.map(r => r.id)),
      downgrade_costs: costs.length,
    },
    calibration,
    robustness: { injection_cases: injection.length, injection_pass_rate: rate(injection.filter(acceptable).length, injection.length) },
    consistency: runsPerCase > 1 ? { mean_agreement: rate(agreementSum, Object.keys(byId).length), unstable_ids: unstable } : null,
    ops: {
      pipeline_errors: allRows.filter(r => r.outcome === 'pipeline_error').length,
      api_errors: allDecided.filter(r => r.api_error).length,
      embed_errors: allDecided.filter(r => r.embed_error).length,
      unparseable: decided.filter(r => r.raw?.unparseable || (!r.raw && !r.api_error)).length,
      latency_p50_ms: percentile(latencies, 50),
      latency_p95_ms: percentile(latencies, 95),
      prompt_tokens: decided.reduce((s, r) => s + r.usage.prompt_tokens, 0),
      output_tokens: decided.reduce((s, r) => s + r.usage.output_tokens, 0),
    },
    by_category: byCategory,
  }
}

const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

/** thresholds: { "decisions.unsafe_approvals": { "max": 0 }, "retrieval.hit_rate": { "min": 0.9 } } */
export function checkGates(summary, thresholds) {
  return Object.entries(thresholds)
    .filter(([k]) => !k.startsWith('_'))
    .map(([metric, rule]) => {
      const value = get(summary, metric)
      const pass = value !== null && value !== undefined && ('min' in rule ? value >= rule.min : true) && ('max' in rule ? value <= rule.max : true)
      return { metric, value, rule, pass }
    })
}
