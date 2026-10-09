-- InsureFlow schema: policies, claims and the policy-wording knowledge base used by the
-- FNOL pipeline (n8n/insurance-fnol-claims-pipeline.json). Run in the Supabase SQL editor.

create extension if not exists vector;

create table if not exists policies (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text,
  policy_number    text not null unique,
  policyholder_name text not null,
  policyholder_email text,
  line_of_business text not null check (line_of_business in ('auto', 'property', 'commercial')),
  status           text not null default 'active' check (status in ('active', 'lapsed', 'cancelled')),
  coverage_limit   numeric(12, 2),
  deductible       numeric(12, 2),
  effective_date   date not null,
  expiry_date      date not null,
  created_at       timestamptz not null default now()
);

create table if not exists claims (
  id                   uuid primary key default gen_random_uuid(),
  claim_ref            text not null unique,
  tenant_id            text,
  policy_number        text not null,
  policyholder_email   text,
  incident_description text,
  line_of_business     text,
  coverage_status      text check (coverage_status in ('covered', 'needs_review', 'denied')),
  confidence           numeric(4, 3),
  reasoning            text,
  cited_sources        jsonb not null default '[]',
  risk_flags           jsonb not null default '[]',
  damage_score         numeric(4, 3),
  damage_summary       text,
  status               text not null default 'pending_review'
                       check (status in ('pending_review', 'approved', 'flagged_for_senior_review', 'closed')),
  created_at           timestamptz not null default now(),
  reviewed_at          timestamptz
);
create index if not exists claims_status_idx on claims (status, created_at desc);

-- Policy wording chunks for RAG. 768 dims = gemini-embedding-001 with outputDimensionality 768.
create table if not exists policy_documents (
  id               bigserial primary key,
  tenant_id        text,                 -- null = shared wording for every tenant
  document_type    text not null,
  source           text not null unique, -- citation label shown to adjusters
  line_of_business text,
  chunk_text       text not null,
  embedding        vector(768) not null,
  active           boolean not null default true,
  updated_at       timestamptz not null default now()
);
create index if not exists policy_documents_embedding_idx
  on policy_documents using hnsw (embedding vector_cosine_ops);

-- n8n connects with the service role (bypasses RLS); the browser anon key gets read-only access.
alter table policies enable row level security;
alter table claims enable row level security;
alter table policy_documents enable row level security;
drop policy if exists "read policies" on policies;
drop policy if exists "read claims" on claims;
create policy "read policies" on policies for select to anon, authenticated using (true);
create policy "read claims" on claims for select to anon, authenticated using (true);

-- Demo data
insert into policies (policy_number, policyholder_name, policyholder_email, line_of_business, status,
                      coverage_limit, deductible, effective_date, expiry_date)
values
  ('PAP-100234', 'Dana Ruiz',    'dana@example.com',   'auto',     'active', 50000,  500,  '2026-01-01', '2026-12-31'),
  ('HO3-554120', 'Marcus Lee',   'marcus@example.com', 'property', 'active', 350000, 1000, '2026-03-15', '2027-03-14'),
  ('PAP-100871', 'Priya Nair',   'priya@example.com',  'auto',     'lapsed', 25000,  1000, '2025-06-01', '2026-05-31')
on conflict (policy_number) do nothing;
