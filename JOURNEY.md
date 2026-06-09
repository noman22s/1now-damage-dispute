# Journey

## Why this idea

The brief said "owners impress us more than completers" and listed booking, payouts, fraud check, calendar sync as examples — explicitly to anchor scope, not as the assignment. So I asked: what's the most expensive, painful operational problem a 1Now operator deals with that the example list does NOT cover?

I'm not a Turo host but I read enough host forums, Turo's own help docs, and competitor positioning to know damage disputes are the single most-hated, most-time-consuming part of operating a small fleet. Disputes routinely involve:

- 30 to 90 minutes of writing per claim
- Operators losing because their dispute was rushed or weak
- $200 to $2000 on the line per dispute
- A strict 24-hour reporting window that can void a claim entirely
- Photo evidence that is often present but not organized in a Turo-friendly format
- A two-stage workflow (guest direct → Turo escalation) that operators do every week but no tool helps with

This felt like a 1Now-shaped problem because:
- It targets the operator persona 1Now sells to (small independent fleet, not enterprise)
- It pairs perfectly with Claude (vision + structured text generation)
- It is high-leverage (saves real money per use)
- It does not duplicate anything 1Now already does (their site emphasizes booking, pricing, verification — not damage tooling)
- Competitors (DAMAGE iD, Wenn, DeGould) stop at detection — nobody ships the full operator workflow

## What I built

A Next.js app with three API routes, three Claude system prompts, two client libraries, and a single-page UI:

**1. `/api/analyze`** sends pickup + return photos to Claude Sonnet 4.5 vision with a strict comparison prompt. Returns structured findings with severity, location, evidence photo index, bounding box coordinates, matching pickup photo index, and repair estimate ranges.

**2. `/api/coverage`** sends pickup photos only to a separate Claude vision audit. Returns a 0-100 coverage score against Turo's 8 standard angles, which angles are covered, which are missing, and specific recommendations. Bad pickup coverage is the #1 reason Turo denies claims.

**3. `/api/dispute`** takes the findings plus optional trip metadata and a `mode` flag, and uses one of two system prompts:
  - `guest_direct` — friendly first-contact message, fits the 20-day direct resolution window, never threatens escalation
  - `turo_claim` — formal escalation letter, claims-agent-ready, cites photos by number

**4. `lib/countdown.ts`** does the 24-hour Turo deadline math client-side. Ticks every minute. The badge color-codes from safe (>12h) to urgent (<12h) to critical (<3h) to expired with appropriate copy.

**5. `lib/history.ts`** writes every generated dispute to localStorage. Operator can browse past cases from a History button without any backend.

**6. `lib/pdf.ts`** generates a multi-page A4 PDF with the dispute letter, findings table, and annotated photos (bounding box redrawn onto the photo via Canvas before embedding).

**7. UI** — single page, drag-drop photo zones, optional trip details, live deadline countdown, coverage check button + result panel, analyze button, side-by-side comparison with SVG bbox overlay, mode toggle (Guest direct vs Turo claim), generate + download + copy buttons.

## Where I got stuck

**Strict JSON output from Claude.** The vision model occasionally wraps responses in markdown fences. Fixed by tightening the system prompt ("Output ONLY the JSON, no preamble, no markdown fences") AND stripping fences defensively in every route.

**Severity calibration.** Early prompts had Claude calling everything "severe" because the input was a damage assessment task. Adjusted by adding "be conservative — false positives cost operators credibility" and concrete examples of what to ignore (dirt, shadows, pre-existing scratches in pickup photos).

**Photo indexing.** Claude needed to cite which return photo proves each finding AND which pickup photo to show as "before". Solved by labeling photos in the user message: "RETURN PHOTOS (vehicle condition after the rental). Count: N. These are 0-indexed for your evidence_photo_index field." Then upgraded the schema to also include `comparison_pickup_index` for the side-by-side view.

**Bounding box rendering.** Claude returns normalized (0-1) coordinates. The UI uses `<svg viewBox="0 0 100 100" preserveAspectRatio="none">` with a `<rect vectorEffect="non-scaling-stroke">` so the box scales correctly when the image is responsive. For the PDF, I redraw the bbox onto the photo via HTML Canvas before embedding the JPEG into jsPDF.

**Same-car requirement for demo.** Claude (correctly) refuses to compare obviously different vehicles. For an evaluator who doesn't have real Turo photos handy, I bundled sample photos AND a "Try with a sample case" button that pre-bakes realistic findings so the visual UI flow can be evaluated without needing perfect photo pairs. The dispute generation, PDF export, history save, and countdown all stay 100% real on the sample case path.

**Vercel deploy and GitHub link.** Vercel CLI's first link rejected the GitHub connection because the Vercel account hadn't added GitHub as a login method. Worked around by deploying via direct file upload (`vercel deploy --prod`) and skipping the auto-push integration. Site is live, manual `vercel deploy --prod` redeploys on each push.

**Color-scheme dark mode bug.** Tailwind v4 with the default Geist template inherits `prefers-color-scheme: dark`, which made input text invisible on the light card backgrounds. Fixed in `globals.css` by forcing `color-scheme: light` and explicitly setting input text color.

## What I would do with more time

- **Regional repair pricing** — operator enters zip code, the repair estimate range narrows using local body-shop averages.
- **Photo upload from camera** — turn this into a phone-friendly PWA so operators can shoot pickup photos directly into the coverage check.
- **Direct Turo API integration** — if 1Now has access to Turo's dispute API, submit the message and PDF directly instead of copy-paste.
- **Multi-vehicle workflow** — pull from a 1Now-style fleet list so operators don't retype vehicle info on every dispute.
- **Auto-extracted repair estimates** — operator uploads a body-shop quote PDF, Claude reads it, the final dispute amount auto-updates.
- **Dispute outcome tracking** — after the operator files, mark won/lost/partial in the history. Over time this becomes a personal win-rate dashboard.
- **Email integration** — one click sends the dispute pack PDF and message to the guest's email or to Turo's claims address.

## How I used Claude Code

Most of this was prompt-and-iterate with Claude Code:

- Brief analysis and idea ranking against the example list
- Bootstrapping the Next.js scaffold
- Three API routes wired to the Anthropic SDK
- Three distinct Claude system prompts (vision-compare, vision-coverage, text-dispute with mode switch)
- The single-page UI with drag-drop, photo previews, SVG bbox overlay, side-by-side comparison, mode toggle, deadline countdown, history panel
- jsPDF generation logic with Canvas-baked bbox annotations
- TypeScript types for every request/response shape
- This journey doc and the README

Total time: about 8 hours including testing, three deploys, and a UI polish pass. Under the 20-hour budget by a wide margin, which I count as part of the answer — the brief specifically said "we are looking for prioritization, not endurance."

## What I am proud of

- **The taste.** I didn't just build the example. I picked the right problem — the one that actually costs operators money every week — and I shipped the full workflow around it.
- **The depth.** Vision + text + countdown + coverage audit + history + PDF + two-stage tone-switching. Each piece adds real operator-side value, not just feature count.
- **The polish.** Single page, no menus, no settings. Drag photos to dispute filed in under a minute. The Loom audience sees a working product, not a slide deck.
- **The reality check.** Bad pickup coverage and the 24-hour deadline are not visible from a competitor landing page. I read the Turo help docs and the host forums and built around what the operator's day actually looks like.
- **The Claude orchestration.** Three system prompts, two vision passes, structured JSON every time, defensive fence-stripping, mode-switched text generation, client-side Canvas + PDF pipeline. This is what "directing Claude" looks like when you take it seriously.
