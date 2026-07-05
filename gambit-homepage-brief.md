# Gambit — Homepage Build Brief (for Claude chat)

> **How to use this:** paste this whole file at the top of a fresh Claude conversation,
> and **attach two files** from the repo so Claude sees the exact current code:
> - `financial-services.html` — the canonical current design system: the shared megamenu
>   header, the footer, the `:root` tokens, the reveal-on-scroll JS, and the component
>   patterns (logo strip, feature rows, suite cards, dark band, results, CTA). **Copy the
>   header and footer from this file verbatim.**
> - `home-banner.html` — the full-bleed video hero concept (Sierra-scale) that is the
>   intended top of the new homepage.
>
> This brief carries the strategy, IA, brand rules, and homepage section spec that the
> raw HTML does not make explicit. Where this brief and any older doc disagree, **this
> brief wins** — it reflects the current rearchitecture (branch `feature/rearchitecture`).
>
> ⚠️ Ignore the older `gambit-context-for-claude.md` for design details. It describes the
> retired dark `--black/--ink` system and poses positioning questions that are now settled.
> Its *proof points and roster* (below, re-stated) are still accurate.

---

## 0. Non-negotiable brand rules (read first)

These are hard. Breaking any one is a defect, not a style choice.

1. **No em dashes or en dashes anywhere** — not in copy, not in code, not in comments.
   Use commas, periods, "to", or a middot (`&middot;`). Only the plain hyphen `-` is allowed
   (e.g. phone numbers, `24/7`).
2. **Workers are never called "agents", "copilots", or "bots".** They are **workers**
   (or "AI workers"). The whole positioning is *workers, not agents*.
3. **Green (`#3ec46d`, `--status`) is reserved for live/status only** — the pulsing "Live"
   dot, an active indicator. Never decorative, never a brand accent.
4. **Lead with the role, then the name** — "Buy-side Worker, Bogan", not "Bogan the tool".
5. **Fonts:** General Sans = body + display. Orbitron = the GAMBIT wordmark **only**
   (never body text). JetBrains Mono = labels, eyebrows, timestamps, terminal UI.
6. **Voice:** confident, declarative, short. Two-beat lines ("Agents assist. Workers
   operate."). Outcome-led, not feature-led. No hype words.

---

## 1. Who Gambit is

**Gambit Technology Inc. (GambitCo)** — founded 2023, Canada. We build **custom AI workers**
that run business operations. A worker has a job title, a scope, and accountability to an
outcome, and it runs 24/7 across web, SMS, voice, and phone.

- Core thesis: **"Agents assist. Workers operate."**
- Tagline: **"We put AI to work."**
- Leadership: Patrick Belliveau (CEO), Chris Silivestru (CTO), Ryan Burgio (Creative Director, owner of this site).

**Proof points (real, currently claimed):**
- 15+ AI workers deployed in production · 100+ countries · 100,000+ conversations · 50+ languages
- NVIDIA Inception Program member · SOC 2 compliant infrastructure
- Clients: Cigna, HPE, Town of Vail, Primary People Group, Logistics Alliance, PulseLaw, Spearhead, Geotab, Bobit Media, Infiniti Group
- Technology partners: **HPE** (Unleash AI program) and **TD SYNNEX** (both are real, documented partnerships — there are press pages for each in the repo)

---

## 2. Current information architecture (the four doors)

The site nav is a shared **megamenu header** (in the attached file). Four top-level doors:

- **Products → Workers.** The engine is "The Factory"; each worker is configured from it.
  Current suite (this is the committed lineup, 5 workers):
  - **Mira** — Research (GTM market/account research)
  - **Bogan** — Buy-side M&A origination (Live)
  - **Atlas** — Sell-side M&A
  - **Deal Room** — Post-LOI, diligence to close
  - **Reed** — Customer support
  - Plus platform: **The Factory**, Integrations, Security.
- **Solutions → Industries.** Financial Services (Live), Healthcare, Public Sector, Legal,
  Logistics, Hospitality & Entertainment, Business Services. An industry page just links to
  the workers tagged to it. **A worker has one home at `/workers/[name]`, never nested under an industry.**
- **Partners.** Resellers & VARs, Agencies & consultancies, Technology partners. (Page is built: `/partners`.)
- **Company.** About, Vision, Customers, Case studies, Insights.

**Routing:** static HTML, Vercel clean URLs — a page at `name.html` serves at `/name`. All
internal links are extensionless (`/financial-services`, `/workers/bogan`, `/partners`).

**Pages already built on the new system (models to match):** `financial-services.html`,
`workers/bogan.html`, `partners.html`. The new homepage should feel like these.

---

## 3. Design system (current — the warm system)

Paste these tokens into the new page's `:root` (they match the attached files). The homepage
is the front door, so use the **core neutral palette with the clay accent** — do **not** use
the Financial-Services industry accent (navy/vermilion). That navy/vermilion is per-industry.

```css
:root{
  --ink:#15110d; --ink-2:#1f1a14;
  --paper:#ffffff; --bone:#f8f5ef; --bone-2:#f1ebe2;
  --sand:#d8cebd; --sand-deep:#cabca6;
  --clay:#b8957a; --clay-deep:#a07c61;
  --line:#e8e1d6; --line-2:#efeae1;
  --muted:#6f675c; --muted-2:#938b7f;
  --status:#3ec46d; --status-d:#1f9e54;      /* live/status ONLY */
  --accent:#a07c61; --accent-2:#cbb49c; --accent-deep:#8a6a52;  /* warm clay */
  --display:'General Sans','Helvetica Neue',Arial,sans-serif;
  --mark:'Orbitron',sans-serif;               /* GAMBIT wordmark only */
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --maxw:1140px;
  --ease:cubic-bezier(.16,1,.3,1);
  --ease-hero:cubic-bezier(0,.55,.45,1);
}
```

**Signature motifs to reuse (all pure HTML/CSS, no images needed):**
- **"Worker terminal" cards** — a small window showing a timestamped activity log ending in a
  green "Resolved / Drafted / Live" block. This dramatizes a worker *doing the job* and is the
  visual heart of the brand.
- Greyed client logo strip (grayscale, colorize on hover).
- Warm bone cards with hairline borders, soft resting shadows, gentle hover lift.
- Pill buttons (radius 100px): solid dark `--ink` = primary, outline = secondary.
- Reveal-on-scroll via IntersectionObserver, with a `prefers-reduced-motion` guard (copy the
  pattern from the attached file's `<script>`).

---

## 4. The homepage — recommended section spec

A front door that says *what Gambit is*, proves it, and routes people into the four doors.
Recommended top-to-bottom (adjust freely):

1. **Hero (full-bleed video).** Use the `home-banner.html` concept: full-viewport video band,
   transparent-over-hero header that solidifies on scroll, minimal headline + one primary CTA,
   and the animated worker-chat overlay. See open decision (a) on the headline.
   ⚠️ The current banner video (`video/home-hero.mp4`) is stitched from **Filmsupply comp clips
   that carry a visible watermark** — fine for preview, must be swapped for licensed footage
   before production.
2. **Logo strip** — real greyed client + partner logos (assets listed in §6). "Deployed at"
   clients + "Technology partners" HPE / TD SYNNEX.
3. **The thesis / manifesto** — "Agents assist. Workers operate." expanded, paired with a
   worker-terminal card scoping → researching → drafting → delivering an outcome.
4. **What a worker is / how it works** — Discovery → Build → Deploy → Operate. Or the shorter
   "one engine, configured per deployment (The Factory)".
5. **Meet the workers** — the 5-worker suite as cards (role then name), each linking to
   `/workers/[name]`. Mirror the suite-card component from the attached files.
6. **By industry** — the seven Solutions doors, each linking to its industry page (only
   Financial Services is Live; others are coming).
7. **Proof** — headline metrics (15+ workers, 100+ countries, 100k+ conversations, 50+ langs)
   and/or a flagship case study (e.g. Bogan/Spearhead: "one county, two weeks, zero dollars").
8. **Partners** — one band pointing to `/partners` (you own the client, we run the workers).
9. **Ask Gambit** — the live site assistant / CTA to chat.
10. **Final CTA** — "Ready to put AI to work?" → "Book a 30-min scope call" → `/get-started`.
11. **Footer** — copy verbatim from the attached file.

**Standard primary CTA:** "Book a 30-min scope call" → `/get-started`.

---

## 5. Open decisions to resolve in the chat

Flag these to Claude and decide before building:

- **(a) Hero headline.** The live homepage still leads with **"Agents assist. Workers operate."**
  The banner concept switched to **"Delivering outcomes that matter."** Pick one for the hero
  (they can coexist: outcomes line as the hero, thesis line as section 3).
- **(b) Which roster leads.** The committed nav suite is **5 focused workers** (Mira, Bogan,
  Atlas, Deal Room, Reed — an M&A/GTM/support story). But 15+ workers are actually deployed
  across 6 industries (AskEllyn, Chloe, Harlo, Demi, AskBibi, etc.). Recommendation: **sell the
  5-worker suite as the product, use the broad deployed roster + logos as proof.** Confirm.
- **(c) Product vs. services story.** Are we "we build you a worker" (bespoke) or "buy the
  Factory, deploy many" (platform)? The site says both. Decide which leads on the homepage.
- **(d) Buyer.** Revenue/ops workers (Bogan, Harlo, Demi) and consumer-support workers
  (AskEllyn, AskAyla) imply different buyers. The homepage should pick a primary audience.

---

## 6. Assets available in the repo (`/img`, `/video`)

Claude chat can't see these, but you can drop them in. Notable ones:
- **Client/partner logos** (for the strip): `HPE.png`, `TD SYNNEX.png`, `Geotab (2).png`,
  `Town of Vail.png`, `Spearhead.png`, `OceanPark.png`, `Cigna.png`, `Infiniti Group.png`,
  `bobit.png`, `LA.png`. (Grayscale + colorize-on-hover pattern is in the attached file.)
- **Campaign image:** `Chloe and Bogan AI Workers Vegas.png` — real HPE Discover 2026 graphic
  (already used as the Partners hero, converted to `partners-hero-vegas.jpg`).
- **Team photos:** `team-ryan.jpg`, `team-alex.jpg`, `team-chris.png`, `team-pat.png`, `team-sarah.png`.
- **Industry photos:** `ind-finance.jpg`, `ind-freight.jpg`, `ind-vail.jpg`, `ind-legal.jpg`,
  `ind-caregiver.jpg`, and more `ind-*.jpg`.
- **Video:** `video/home-hero.mp4` (+ `home-hero-poster.jpg`) — the stitched banner reel
  (watermarked comps, replace for production); `video/fs-hero.mp4` (30MB, needs compression).
- **Wordmark/logo:** `img/gambit-logo.png` (header), `img/favicon.png`.

---

## 7. Good opening asks for the chat

- "Given this brief and the two attached files, propose a homepage IA and copy that matches
  the warm design system exactly, reusing the megamenu header and footer verbatim."
- "Draft the hero, the worker-suite section, and the proof section as production HTML on the
  `:root` tokens above. No em/en dashes, workers never called agents, green only for status."
- "Resolve open decisions (a)-(d) with a recommendation and a one-line rationale each."
