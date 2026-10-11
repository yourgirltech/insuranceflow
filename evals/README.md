# Coverage-check evals

Measures how well the FNOL pipeline's AI coverage check does its job: does it retrieve the right policy wording, reach the right verdict, cite real sources, and send anything uncertain to a human?

## How it works

The harness doesn't re-implement the pipeline. It loads the exported workflow (`n8n/insurance-fnol-claims-pipeline.json`) and runs its own code for each claim:

```
golden claim → Validate & Normalize      (workflow code)
             → Policy Lookup             (fixture rows, same shape as Supabase)
             → Generate Query Embedding  (workflow request, real Gemini call)
             → Vector Search             (same filter, ordering and LIMIT as the pgvector SQL)
             → Assemble RAG Context      (workflow code, incl. the 0.35 similarity floor)
             → Coverage Check            (workflow prompt and model, real Gemini call)
             → Parse Coverage Response   (workflow guardrails)
             → scored against the golden label
```

The knowledge base is embedded from the **Policy KB Ingestion** workflow the same way production does it. Edit a prompt, the threshold or a guardrail in n8n, re-export the JSON, and the next eval run tests the new version. The emails, approval wait and database writes aren't run, because they don't change the coverage decision.

## Run it

Needs Node 22+ and a Gemini API key. No npm install is required.

```bash
export GEMINI_API_KEY=...            # PowerShell: $env:GEMINI_API_KEY="..."
npm run eval                         # all cases on the workflow's model
npm run eval -- --repeats 3          # run each case 3 times to measure stability
npm run eval -- --model gemini-2.5-pro --baseline evals/runs/<id>/summary.json
npm run eval -- --only injection,policy_status
npm run eval -- --kb client-wording.json   # evaluate against a client's real policy wording
npm run eval -- --replay evals/runs/<id>/results.jsonl   # re-score without API calls
npm run eval:test                    # offline tests of the harness itself
```

Each run writes `evals/runs/<run_id>/` with `report.md`, `summary.json`, `results.jsonl` (the full trace per claim) and `meta.json`. The command exits non-zero if a gate in `thresholds.json` fails, so it can run in CI before a workflow change ships. Embeddings are cached in `evals/.cache/`, so repeat runs only pay for coverage calls.

## What it measures

| Area | Metrics |
|---|---|
| **Decisions** | Acceptable-outcome rate, exact match, **unsafe approvals** (covered when it shouldn't be), wrongful denials, over-escalation, auto-decision rate on clear-cut claims, confusion matrix |
| **Retrieval** | Hit rate and recall of the governing policy sections after the similarity floor, MRR, sections retrieved but cut by the floor |
| **Citations** | Precision and recall against the governing sections, covered/denied decisions with no citation, sources the model invented (stripped by the guardrail) |
| **Guardrails** | Required risk flags raised (lapsed, cancelled, not found), downgrades that prevented a wrong outcome vs. ones that caused one |
| **Robustness** | Prompt-injection cases handled safely |
| **Calibration** | Accuracy per model-confidence band, to check the 0.7 auto-route threshold |
| **Consistency** | Agreement across `--repeats` runs, and which cases flip |
| **Operations** | Pipeline and API errors, unparseable output, latency p50/p95, tokens |

## Golden set

`golden/claims.jsonl` has 60 synthetic claims across 14 categories (20 covered, 18 denied, 19 needs review, 3 invalid intake): covered collision and comprehensive losses, auto and home exclusions, late police reports, lapsed, cancelled and unknown policies, coverage-period gaps, line mismatches, CG-7 referrals, vague reports, prompt injection, a Spanish-language claim and invalid intake. Each case has the exact webhook body plus:

- `expected.status`: the best answer. `expected.acceptable` lists every outcome an adjuster would accept. For example, sending an excluded claim to review instead of denying it is acceptable, but approving it is not.
- `expected.sources`: the policy sections that govern the claim, used for retrieval and citation scoring.
- `expected.flags`: risk flags the guardrails must raise.
- `rationale`: why the label is what it is.

**The labels are drafts written from the policy wording in this repo.** Before quoting results, have a licensed adjuster review `claims.jsonl`, then run with `--label-status reviewed`. To evaluate against a client's real policy wording, pass it with `--kb` and add cases that reflect their claim mix.

`golden/policies.json` mirrors the demo rows in `supabase/schema.sql`, plus a cancelled and a commercial policy used only by the evals.

## Found while building this

- **A failed embedding call loses the claim.** `Generate Query Embedding` retries but has no error branch. If Gemini's embedding API is still failing after the retries, the run stops after the caller has received `202 claimRef` but before `Save Claim - Pending Review`, so the claim is never stored and no adjuster is told. The harness reports these as `pipeline_error`. Fix: set the node to continue on error and let the guardrails send the claim to review with `no_policy_language_retrieved`, as the coverage node already does.
