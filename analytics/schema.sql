-- Gambit Sales & Marketing platform — Supabase (Postgres) schema
-- =============================================================================
-- One store, two shapes of data:
--   ENTITIES (companies, contacts, deals) = current truth, MUTABLE. Updated over time.
--   HISTORY  (events, channel_metrics)    = permanent record, APPEND-ONLY. Never edited.
--
-- The CRM screen is entities joined. The dashboard is history counted up.
-- Getting this split clean now is the thing that stops it breaking later.
--
-- Reuses the house pattern already proven in the marketing repo (api/traces.js):
-- server-side writes via the Supabase service key over PostgREST. Because the
-- service role bypasses RLS, RLS is enabled with no permissive policies — the
-- tables are locked to anon/authed clients until the dashboard needs read access.
--
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).
-- =============================================================================

create extension if not exists pgcrypto;  -- for gen_random_uuid()

-- Auto-touch updated_at on any row change.
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ─── ENTITIES (mutable) ──────────────────────────────────────────────────────

create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null,
  domain      text,
  industry    text,
  description text,
  -- Loose container the AI can stuff anything into (enrichment, meta, "why we
  -- disqualified them") WITHOUT a schema change. Structure stays fixed where it
  -- matters, flexible where you're still figuring it out.
  tags        jsonb not null default '{}'::jsonb
);
create unique index if not exists companies_domain_key on companies (lower(domain)) where domain is not null;
drop trigger if exists companies_touch on companies;
create trigger companies_touch before update on companies for each row execute function set_updated_at();

create table if not exists contacts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  company_id      uuid references companies(id) on delete set null,
  name            text,
  email           text,
  title           text,
  linkedin_url    text,
  persona         jsonb,          -- Bogan's synthetic-personality layer
  readiness_score int,            -- the 9/10 "will they reply" score
  tags            jsonb not null default '{}'::jsonb
);
create unique index if not exists contacts_email_key on contacts (lower(email)) where email is not null;
create index if not exists contacts_company_idx on contacts (company_id);
drop trigger if exists contacts_touch on contacts;
create trigger contacts_touch before update on contacts for each row execute function set_updated_at();

create table if not exists deals (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  company_id  uuid references companies(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  product     text,               -- Bogan, Dawn, Gillis, Atlas...
  -- Funnel position. Keep the vocabulary small and fixed.
  stage       text not null default 'contacted'
              check (stage in ('contacted','replied','meeting','applied','won','lost')),
  owner       text,               -- who owns this deal (Ryan, Pat...)
  value_usd   numeric,
  tags        jsonb not null default '{}'::jsonb
);
create index if not exists deals_stage_idx   on deals (stage);
create index if not exists deals_company_idx on deals (company_id);
create index if not exists deals_product_idx on deals (product);
drop trigger if exists deals_touch on deals;
create trigger deals_touch before update on deals for each row execute function set_updated_at();

-- ─── HISTORY (append-only) ───────────────────────────────────────────────────

-- Every discrete touchpoint, ever. You only ever INSERT here.
-- The dashboard's "owned, exact, real-time" numbers are all just SELECTs off this.
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  type        text not null,      -- email_sent | email_replied | email_opened |
                                   -- meeting_booked | post_published | page_view |
                                   -- form_submit | ad_click | disqualified
  company_id  uuid,
  contact_id  uuid,
  deal_id     uuid,
  channel     text,               -- gmail | linkedin | instagram | website | google_ads
  source      text,               -- free-form origin (campaign id, worker name...)
  actor       text,               -- which person: Ryan, Pat (drives the champion metrics)
  data        jsonb not null default '{}'::jsonb
);
create index if not exists events_occurred_idx on events (occurred_at desc);
create index if not exists events_type_idx     on events (type);
create index if not exists events_contact_idx  on events (contact_id);
create index if not exists events_company_idx  on events (company_id);
create index if not exists events_actor_idx    on events (actor);

-- Borrowed daily aggregates from platforms you don't own (ads, org social).
-- These are a daily time-series per channel, NOT per-contact touchpoints — which
-- is why they live apart from events (avoids the "events ladder up to everything"
-- trap). Landed here by Airbyte (or a scheduled function) in v2.
create table if not exists channel_metrics (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  metric_date date not null,
  channel     text not null,      -- google_ads | linkedin_page | instagram
  campaign    text,
  metrics     jsonb not null default '{}'::jsonb,  -- {spend, impressions, clicks, ...}
  unique (metric_date, channel, campaign)
);
create index if not exists channel_metrics_date_idx on channel_metrics (metric_date desc);

-- ─── CONVENIENCE VIEWS (dashboard = history counted up) ──────────────────────

-- Live pipeline: how many deals sit in each stage, per product.
create or replace view v_pipeline as
select product, stage, count(*) as deals, coalesce(sum(value_usd),0) as value_usd
from deals group by product, stage;

-- Daily outbound by sender — powers the Ryan-vs-Pat champion scoreboard.
create or replace view v_daily_outbound as
select date_trunc('day', occurred_at)::date as day, actor, channel, count(*) as sent
from events where type = 'email_sent'
group by 1, 2, 3;

-- Reply rate by actor: replies over sends. The headline "are we landing" number.
create or replace view v_reply_rate as
select
  s.actor,
  s.sent,
  coalesce(r.replied,0) as replied,
  round(coalesce(r.replied,0)::numeric / nullif(s.sent,0) * 100, 1) as reply_rate_pct
from (select actor, count(*) sent    from events where type='email_sent'    group by actor) s
left join (select actor, count(*) replied from events where type='email_replied' group by actor) r
  using (actor);

-- ─── SECURITY ────────────────────────────────────────────────────────────────
-- Enable RLS on everything. Server writes use the service role (bypasses RLS),
-- exactly like api/traces.js. Add SELECT policies later when the dashboard reads
-- with an authed/anon key.
alter table companies       enable row level security;
alter table contacts        enable row level security;
alter table deals           enable row level security;
alter table events          enable row level security;
alter table channel_metrics enable row level security;

-- The "workstation gets read-only keys to production" pattern (same as Harlo).
-- Create once, hand the credentials to the AI so it can answer "who do we contact
-- today" / "has Pat already emailed this person" without ever mutating data.
--   create role workstation_readonly login password '<set-me>';
--   grant usage on schema public to workstation_readonly;
--   grant select on all tables in schema public to workstation_readonly;
--   alter default privileges in schema public grant select on tables to workstation_readonly;
