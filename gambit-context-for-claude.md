# Gambit — Context Brief for a Site & Offering Rethink

> Paste this at the top of a fresh Claude conversation. Attach `index.html` and
> `outbound-worker.html` alongside it so Claude can see the current build. This brief
> carries the strategy, roster, information architecture, and design system that the
> raw HTML doesn't make explicit.

---

## 1. Who we are

**Gambit Technology Inc. (GambitCo)** — founded 2023, Canada. We build **custom AI
workers** that run business operations, not chatbots and not copilots.

The core positioning thesis, stated everywhere:

> **Agents assist. Workers operate.**
> A worker has a job title, a scope, and accountability to an outcome. Each one is
> custom-built for a specific operation and runs 24/7 across web, SMS, voice, and phone.

Tagline: **"We put AI to work."**

### Proof points we currently claim
- 15+ AI workers deployed in production
- Operations in 100+ countries
- 100,000+ conversations handled
- 50+ languages
- Member of NVIDIA Inception Program; SOC 2 compliant infrastructure
- Clients: Cigna, HPE, Town of Vail, Primary People Group, Logistics Alliance, Pulse Law, Spearhead, Geotab, Bobit Media, Infiniti Group
- Tech partners: HPE (Unleash AI program), TD SYNNEX

### Leadership
- Patrick Belliveau — CEO
- Chris Silivestru — CTO
- Ryan Burgio — Creative Director (owner of this site)

---

## 2. The worker roster (the actual offering today)

Organized the way the homepage groups them, by industry. Status is live unless noted.

| Worker | Role | Client / Context | Industry |
|---|---|---|---|
| **AskEllyn** | Breast cancer support companion | Cigna Healthcare | Health & Wellness |
| **AskShan** | Parkinson's support | Thrive Well Together | Health & Wellness |
| **Chaddict / AskEvaMarie** | Addiction & recovery | Infiniti Group | Health & Wellness |
| **AskAyla** | Companion for parents of children with disabilities | (free, lived-experience) | Health & Wellness |
| Urology Tool | Medical support | — | Health & Wellness (in progress) |
| **Chloe / VailOS** | Municipal voice concierge | Town of Vail | Government |
| **AskAshleigh** | Caregiver support | Area Agency on Aging / Primary People Group | Government |
| **AskTodd** | Legal strategist | PulseLaw LLP | Legal & Finance |
| **Bogan** | Outbound / M&A origination worker | Spearhead Corporate Development | Legal & Finance / Sales |
| **Harlo** | Freight coordinator (load confirmation) | Logistics Alliance | Logistics |
| **AskAmber** | Fan engagement | NASCAR / Daytona | Entertainment |
| **Sam / GillisOS** | Hospitality / hotel sales | Gillis | Entertainment / Sales |
| **Demi** | HR advisor & coach | Primary People Group | Business Services |
| **AskBibi** | Media buying | Bobit Media | Business Services |
| **Geotab Assistant** | Sponsorship sales | Streetwise / Geotab | Business Services |
| **AskGambit** | General Gambit assistant (the site chatbot) | gambitco.io | — |

Note the naming convention: most consumer/support workers are "Ask\<Name>"; the
sales/ops workers have standalone names (Bogan, Harlo, Demi, Chloe, Sam).

---

## 3. Information architecture (current site)

Static HTML site, no framework. Each page is a standalone `.html` file. Deployed on
Vercel. There's a chat API (`api/chat.js`) and a feedback API (`api/feedback.js`).

**Primary pages**
- `index.html` — homepage (attached)
- `outbound-worker.html` — the Outbound Worker product page (attached)
- `about-us.html`, `case-studies.html`, `faqs.html`, `insights.html`, `get-started.html`
- `what-is-an-ai-worker.html`, `ai-terms-explained.html`, `where-to-start-with-ai.html`
- `style-guide.html` — internal design reference

**Case studies** (`/case-study/*.html`): askellyn, asktodd, askbibi, askevamarie,
askashleigh, chaddict-and-askevamarie, geotab, gillisos, harlo

**Insights / news posts** (~15): launch announcements, partner news, explainers.

**Per-client microsites / tools** live in the repo too (asktwb, drneil, hieddy,
joelle, friday-harbour, vail-emergency, chloe-feedback, sms-consent-flow,
dejero-proposal, etc.) — many are one-off client deliverables, not core marketing.

`llms.txt` exists at root as an AI-crawler summary.

---

## 4. The homepage today (index.html) — section by section

1. **Hero** — dark photo bg. H1: *"Agents assist. Workers operate."* Sub reinforces
   "Not agents. Not copilots." Two CTAs: "See the workers" / "How it works". A glass
   strip shows 3 live workers with running counters (AskTodd, Harlo, Demi).
2. **Logo strip** — "Workers deployed at" (Cigna, Vail, Infiniti, Spearhead, LA,
   Geotab) + "Technology partners" (HPE, TD SYNNEX).
3. **Manifesto** — "Complex operations need more than agents." Paired with a fake
   worker-terminal UI showing an inbound request being scoped, researched, drafted,
   delivered (2.4s, no escalation).
4. **Industry toggle** — tabbed: Health & Wellness / Government / Legal & Finance /
   Logistics / Entertainment / Business Services. Each tab lists its workers + a
   branded panel with stats and a "Chat with X" CTA.
5. **Benefits** ("What you get") — 6 cards: conversations→operations, 24/7 every
   channel, built on your business, you control it, measured in outcomes, gets
   smarter every week.
6. **Ask Gambit** — embedded live chatbot iframe + suggested prompts.
7. **Latest** — insights/news feed.
8. **CTA** — "Ready to put AI to work?" → "Book a 30-min scope call."

How-it-works framing: **Discovery → Build → Deploy → Operate.**

---

## 5. The Outbound Worker page today (outbound-worker.html) — section by section

This is the most product-specific / commercially aggressive page, built around
**Bogan** (the outbound worker, first deployed at Spearhead).

1. **Hero** — *"Signal to sale. Faster than the market moves."* Lead: turns public
   buying signals into booked conversations the same week they surface. Shows a live
   worker terminal (signal → scope → research → draft → ready) and a drafted email card.
2. **How it works** — interactive 4-stage run: **Signal → Research → Conversation →
   Close.** Research stage shows an 8-tile "dossier" (decision-maker, company profile,
   market context, operating pressure, the trigger, where you fit, personal hooks,
   disqualifiers). Statement: "Outbound at machine speed, so your people spend their
   hours where only people win."
3. **Cases / UI showcase** — filterable product mockups: **Spearhead (Origination,
   live)**, **GillisOS (Hotel Sales, live)**, **Wealth & Advisory (roadmap)**,
   **Private Capital (roadmap)**. Each shows a realistic app interface + a drafted email.
4. **Integrations** — Salesforce, HubSpot, ZoomInfo, Slack, Apollo, Crunchbase, Clay.
   "Works inside the stack you already sell in. No rip and replace."
5. **The Factory** — *"Start with one worker. Build your factory."* Interactive
   factory-floor dashboard. Pitch: workers share one engine and compound. Moat claims:
   build one→many, **runs locally**, **open source / lower cost**, **data stays private**.
6. **Proof / case study** — *"One county. Two weeks. Zero dollars."* Spearhead/Florida:
   ingested one county's public divorce filings, joined to the state business registry,
   verified owners, drafted outreach. 12 verified owners, $0 on data, fully repeatable.
7. **Testimonials → CTA** — "Put an outbound worker on your funnel" → scope call.

Strategic signal in this page: it leans into a **product/platform** story (the
Factory, local/open-source/private infra) more than the rest of the site, which is
more **services/bespoke**. This tension is worth resolving in the rethink.

---

## 6. Design system (extracted from the CSS)

**Color tokens**
```
--black: #0a0a0a    --ink: #141414      --surface: #1a1a1e
--secondary: #52525b --muted: #a1a1aa   --border: #e4e4e7
--border-light: #f0f0f2 --page: #fafafa --white: #ffffff
--working: #16a34a  (green "live/active" status, used with a pulsing dot)
```
Light, near-white canvas (`#fafafa`) with near-black ink. Dark sections (hero, CTA,
footer, app mockups) invert to `#0a0a0a`. A warm sand accent (`#c9c2b8`) appears on
the manifesto and Ask-Gambit blocks.

**Type**
- Body/UI: **General Sans** (Fontshare), weights 300–600, tight tracking on headings
  (`letter-spacing: -0.02 to -0.035em`), weight 500 for most headings.
- Display/logo: **Orbitron** (the GAMBIT wordmark, 700, wide tracking 0.12em).
- Mono: **JetBrains Mono** (timestamps, terminal/log UI).

**Signature components / motifs**
- "Worker terminal" cards: a fake macOS window (red/yellow/green dots) showing a
  timestamped activity log → a green "Resolved/Drafted" result block. This is the
  visual heart of the brand — it dramatizes a worker *doing the job*.
- Green pulsing "Working/Active/Live" status dots everywhere.
- Glassmorphic stat strips over dark photography.
- Rounded corners (12–16px), 1px hairline borders, subtle hover lifts.
- Pill buttons (border-radius 100px). Solid dark = primary, outline = secondary.
- Realistic product/app mockups built in pure HTML/CSS (tables, rails, dashboards).

**Voice**
Confident, declarative, short. Two-beat slogans ("Agents assist. Workers operate."
/ "Signal to sale."). Outcome-led, not feature-led. Avoids hype words; leans on
"operate," "scope," "accountability," "outcome."

**Standard CTA**: "Book a 30-min scope call" → `/get-started`.

---

## 7. Open questions for the rethink (prompts for the conversation)

These are the tensions I'd want Claude to help resolve — feel free to edit/add:

1. **Services vs. product.** Are we a bespoke build shop ("we build you a worker") or
   a platform ("the Factory" — buy the engine, deploy many)? The site currently says
   both. Which story leads?
2. **One offering or a portfolio?** 15+ named workers across 6 industries reads as a
   portfolio. Does the new site sell *outcomes by industry*, *named workers as
   products*, or *one horizontal capability* (build-a-worker)?
3. **Who is the buyer?** Consumer-support workers (AskEllyn, AskAyla) vs. revenue/ops
   workers (Bogan, Harlo, Demi) imply very different buyers and sales motions. Should
   the brand split, or unify under "AI workers"?
4. **The Outbound Worker as a wedge.** It has the sharpest commercial story (signal→
   sale, the Factory, the $0/12-owners proof). Should it become the flagship product
   the whole company leads with, or stay one worker among many?
5. **The "Factory" concept.** Worth elevating to the top-level brand architecture
   (Gambit builds the Factory; workers are the output), or keep it as an outbound-page
   subsection?
6. **Architecture.** Static per-page HTML has scaled to ~40 files with heavy
   duplication (header/footer/CSS copied into each). A rethink is a chance to decide:
   stay static (templated), or move to a framework/CMS? Keep this in mind for any IA
   proposal.
7. **Proof & trust.** We claim big numbers and big logos. The rethink should decide
   how hard to lean on named enterprise clients (Cigna, HPE) vs. outcome metrics.

---

## 8. How to use this with Claude

Good opening asks for the chat:
- "Given this, propose 2–3 distinct positioning architectures for the new site, each
  with a homepage IA and a one-line thesis."
- "Rewrite the homepage narrative if we lead with the Outbound Worker / the Factory."
- "Audit the current worker roster and tell me what to cut, merge, or feature."
- "Design a new top-level nav and page map for each positioning option."
