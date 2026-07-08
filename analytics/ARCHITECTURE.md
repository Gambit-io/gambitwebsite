# Gambit Sales & Marketing Platform — Architecture & Build Brief

> Status: foundation. Prototyped in the marketing repo; destined for its own
> project at **analytics.gambitco.io**. This doc is the source of truth — hand it
> to any Claude Code session that builds a piece of this.

## The verdict (arbiter of truth)

Build a **marketing/sales SYSTEM**, not campaigns. One database, two shapes of
data. Capture the data you own directly and now; pipe in the data you don't own
later. Ship the owned layer before touching the hard third-party APIs.

### Decisions locked
- **Database: Supabase (Postgres).** Not a new bet — the marketing repo already
  writes to Supabase via raw PostgREST in [`api/traces.js`](../api/traces.js)
  (`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`, in-memory fallback). Every ingest
  function clones that pattern. Nothing new to learn.
- **Data model: entity/event split.**
  - ENTITIES — `companies`, `contacts`, `deals`. Mutable, current truth.
  - HISTORY — `events` (discrete touchpoints), `channel_metrics` (daily platform
    aggregates). Append-only, never edited.
  - CRM screen = entities joined. Dashboard = history counted up.
- **Home: `analytics.gambitco.io` as its own Vercel project.** A stateful, authed
  dashboard does not belong interleaved with the static marketing site (strict
  CSP, `X-Frame-Options: DENY`). The `analytics/` folder here holds the schema +
  build brief only; it lifts cleanly into the new repo.

### Decisions deliberately deferred
- **Ad/social aggregation (Google Ads, LinkedIn Company Page, Instagram):**
  v2, not v1. When built, use **Airbyte → Supabase** (native Postgres
  destination; avoids Supermetrics' ~$1.5–2.5k/mo warehouse tier and its
  can't-write-to-Postgres wall). Supermetrics→Looker is allowed ONLY as a
  throwaway "prove the campaign this week" view, discarded once the real
  dashboard exists.
- **Personal LinkedIn profile analytics:** no API exists from any tool. Champion
  posts on personal profiles are **manual entry or skipped** — decide per person.
  LinkedIn *Company Page* pulls fine.

## The metric spec (get this right first — Alex's point)

Every number is one of two shapes:

**Owned — exact, real-time (write directly to `events`):**
- Emails sent — by product, by sender (Ryan vs Pat)
- Replies, reply rate, positive-reply rate
- Meetings booked
- Pipeline: contacts per stage, stage→stage conversion, velocity (time in stage)
- Content posted — by channel + champion (the Ryan/Pat competition scoreboard)
- Website: landing-page views, form-fills, conversions (GA4 is live site-wide +
  a first-party beacon → `events`)

**Borrowed — daily, approximate (land in `channel_metrics` later):**
- Google Ads: spend, impressions, clicks, CPC, conversions
- LinkedIn Company Page: organic reach/engagement
- Instagram Business: reach/engagement

## Schema

See [`schema.sql`](schema.sql). Five tables + three convenience views
(`v_pipeline`, `v_daily_outbound`, `v_reply_rate`). Run it in the Supabase SQL
editor; it's idempotent.

## Build order (nothing blocks the hard parts)

1. **Stand up the schema** — run `schema.sql` in the existing Supabase project.
2. **Ingest endpoint** — `/api/crm` (or in the new project), cloned from
   `traces.js`. Bogan's outbound calls it on every send → upserts a company +
   contact, opens/advances a deal, writes an `email_sent` event. Capturing from
   day one, which is the whole point of doing this before the campaign.
3. **Gmail reply sync** — scheduled function. Google Workspace, so per-account
   OAuth (domain-wide delegation). Match inbound by `email` → write
   `email_replied` events. This is the killer CRM feature: "did Pat's personal
   email get a response?" Owned data, high signal, v1.
4. **Dashboard** — the `analytics.gambitco.io` app reading live from Supabase.
   Start with the three numbers you fully own (sent, replied, meetings), then
   layer pipeline, then borrowed channels.
5. **Borrowed data** — Airbyte connectors → `channel_metrics`. Last, not first.

## The workstation angle

Give the AI workstation the **read-only** role in `schema.sql` (same "read-only
keys to production" pattern used with Harlo). Then it answers "who do we contact
today" / "has Pat already emailed this person" against live data, never mutating.
This is the seed of the "machine that makes machines" — `launch [product]` reads
the repo and spins up dashboard + emails + landing pages against this same store.

## Env vars (per the traces.js pattern)
- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_KEY` — service role (server-side writes, bypasses RLS)
- (dashboard, later) `SUPABASE_ANON_KEY` — for authed browser reads once RLS
  SELECT policies exist

## Open questions to resolve before v1 code
- **Bogan ICP** — the exact firmographic filter for the PE-firm target list, so
  ingest can tag companies consistently (`companies.tags`).
- **Gmail auth** — confirm Workspace admin will grant domain-wide delegation for
  the reply-sync service account.
- **Deal auto-advance rules** — does an `email_replied` event auto-move the deal
  `contacted → replied`, or is stage always human-set? (Recommend: auto-advance
  forward only, never backward.)
