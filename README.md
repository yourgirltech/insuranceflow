# InsureFlow

An insurance operations platform: a Next.js + Supabase workspace for policyholders, claims, underwriting and documents, plus an **n8n claims pipeline** that takes a First Notice of Loss (FNOL) from intake to an adjuster decision. AI makes a recommendation, and a human always makes the decision.

> **In production for a client.** The live system runs on the client's own domain and isn't linked here. This repository is the build record: the full source, with client data, credentials and URLs removed.

## FNOL & claims pipeline (n8n)

```
POST /webhook/fnol-intake
  → validate & normalize (400 with reasons if invalid, otherwise 202 + claimRef straight away)
  → policy lookup (Supabase)  ┐
  → embed incident → pgvector search over policy wording ┘→ coverage check (Gemini, JSON mode)
  → deterministic guardrails (missing/lapsed policy, no retrieved wording, low confidence → needs_review)
  → photo damage assessment (Gemini vision, optional)
  → claim saved as pending_review
  → adjuster approves / flags by email (no reply in 48h → escalates)
  → status update + policyholder confirmation or senior-adjuster escalation
```

**Design choices**

- **Retrieval-grounded coverage decisions.** The model sees the policy wording that matches the incident (RAG over `policy_documents`), not just a policy record, and must cite the sources it relied on. Citations that weren't actually retrieved are removed.
- **The AI never decides.** Its output is clamped and validated in code. Anything uncertain is downgraded to `needs_review`, and every claim goes to an adjuster.
- **Nothing gets lost.** The claim is written to the database *before* the human-approval wait, so the dashboard sees it immediately, and an approval that never comes escalates instead of hanging.
- **Fast intake response.** The caller gets a `claimRef` in milliseconds; the slow AI and human steps run afterwards.
- **One place to configure.** Addresses, models, the confidence threshold and the approval timeout all live in the `Config` node.

| File | Purpose |
|---|---|
| `n8n/insurance-fnol-claims-pipeline.json` | The FNOL pipeline (26 nodes) |
| `n8n/policy-kb-ingestion.json` | Embeds policy wording (`gemini-embedding-001`, 768 dims) into pgvector |
| `supabase/schema.sql` | `policies`, `claims`, `policy_documents` (pgvector + HNSW), RLS, sample policies |

### Run it

1. Run `supabase/schema.sql` in your Supabase SQL editor.
2. In n8n, import both workflow files and create these credentials: **Supabase API** (service role), **Postgres** (Supabase connection string), **Query Auth** (`key` = your Gemini API key) and **SMTP**.
3. Set your email addresses in the `Config` node.
4. Run **Policy KB Ingestion** once, then activate the FNOL workflow.
5. Submit a claim:

```bash
curl -X POST http://localhost:5678/webhook/fnol-intake \
  -H "Content-Type: application/json" \
  -d '{"policyNumber":"PAP-100234","policyholderEmail":"dana@example.com",
       "lineOfBusiness":"auto","incidentDate":"2026-10-01",
       "incidentDescription":"Rear-ended at a red light; rear bumper and trunk lid crushed.",
       "photos":[]}'
# → 202 {"ok":true,"claimRef":"CLM-20261009-XXXXX","status":"received"}
```

Try `PAP-100871` (a lapsed policy) to watch the guardrails force `needs_review`.

### Evals

`npm run eval` runs a 60-claim golden set through the workflow's own code and scores verdicts, unsafe approvals, retrieval, citations, guardrails and prompt-injection handling. See [`evals/README.md`](evals/README.md).

## Web app

Next.js 15 (App Router), React 19, Tailwind and Supabase JS. The pages are dashboard, policyholders, claims, underwriting, documents, reports, an AI chat assistant and settings.

```bash
cp .env.example .env.local   # add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install && npm run dev
```

In this repository the UI pages render sample data, so the code can be shared without client records. The pipeline writes claims to the `claims` table that the production deployment reads.

## Security

- No keys in the repo: the web app reads the public anon key from `.env.local` (gitignored), and n8n uses its own credential store. The exported workflows contain credential *names* only.
- The service-role key is used only by n8n on the server, never in the browser. RLS is enabled on every table.
