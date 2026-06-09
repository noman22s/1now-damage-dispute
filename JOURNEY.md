# Journey

## Why this idea

The brief said "owners impress us more than completers" and listed booking, payouts, fraud check, calendar sync as examples — explicitly to anchor scope, not as the assignment. So I asked myself: what's the most expensive, painful operational problem a 1Now operator deals with that the example list does NOT cover?

I'm not a Turo host but I've read enough host forums (Reddit r/Turo, Turo host community blogs) to know damage disputes are the single most-hated, most-time-consuming part of operating a small fleet. Disputes routinely involve:

- 30 to 90 minutes of writing per claim
- Operators losing because their dispute text was rushed or weak
- 200 to 2000 dollars on the line per dispute
- Photo evidence that is often present but not organized into a Turo-friendly format

A small operator running 8 cars might process 2-4 disputes a month. Win rate matters. So does time saved.

This felt like a 1Now-shaped problem because:
- It targets the operator persona 1Now sells to (small independent fleet)
- It pairs perfectly with Claude (vision + structured text generation)
- It is high-leverage (saves real money per use)
- It does not duplicate anything 1Now already does (their site emphasizes booking, pricing, verification — not damage/dispute tooling)

## What I built

A Next.js app with two API routes:

1. `/api/analyze` sends pickup + return photos to Claude Sonnet 4.5 vision with a strict comparison prompt. Returns structured findings with severity, location, evidence photo index, repair estimate ranges.

2. `/api/dispute` takes those findings plus optional trip metadata and asks Claude to write a 250-400 word Turo dispute letter in claims-agent-friendly format.

The UI is a single page: drag-drop two photo galleries, optional trip details, one analyze button, results render with photo evidence, one click to generate the dispute, one click to copy.

## Where I got stuck

**Strict JSON output from Claude.** The vision model occasionally wraps responses in markdown fences. Fixed by tightening the system prompt ("Output ONLY the JSON, no preamble, no markdown fences") AND stripping fences defensively in the route.

**Severity calibration.** Early prompts had Claude calling everything "severe" because the input was a damage assessment task. Adjusted by adding "be conservative — false positives cost operators credibility" and concrete examples of what to ignore (dirt, shadows, pre-existing scratches in pickup photos).

**Photo indexing.** Claude needed to cite which return photo proves each finding. Solved by labeling the photos in the user message: "RETURN PHOTOS (vehicle condition after the rental). Count: N. These are 0-indexed for your evidence_photo_index field."

**Cost estimates.** I considered scraping repair shop databases. Decided against — keeps scope tight and Claude's training data has rough rule-of-thumb pricing that is good enough for a dispute (the operator will adjust the final number anyway).

## What I would do with more time

- Bounding box overlay on the evidence photo showing exactly where the damage is. Claude Vision can return coordinates; the UI just needs an SVG overlay.
- Save dispute history to localStorage so operators can reload past cases (helpful for re-disputes when Turo asks for more info).
- Hook into a real Turo API (if such an integration is available to 1Now) so the dispute submits directly instead of copy-paste.
- Multi-vehicle workflow: instead of pasting vehicle info each time, pull from a 1Now fleet list.
- Repair cost range refinement using zip-code average data from a body shop API.
- A "before each trip" mode that generates the standard set of pickup photos a renter should take (8-point inspection prompt with example angles).

## How I used Claude Code

Most of this was prompt-and-iterate with Claude Code:

- Initial scope and idea ranking
- Bootstrapping the Next.js scaffold
- Two API routes wired to the Anthropic SDK
- The single-page UI with drag-drop, photo previews, and result rendering
- TypeScript types for the request/response shapes
- README and this journey doc

Total time: about 6 hours including testing. Under the 20-hour budget by a wide margin, which I count as part of the answer — the brief specifically said "we are looking for prioritization, not endurance."

## What I am proud of

- The prompts are tight. Vision returns valid JSON on every run. Text dispute reads like an experienced host wrote it, not a chatbot.
- The UI is one page, no menus, no settings. The operator goes from "I just got my car back" to "dispute submitted" in under a minute.
- No database, no auth, no infra. Vercel deploys this in one command. Operators can self-host if 1Now's customers want privacy.
- The product clearly does ONE thing and does it well. Easy to demo in a 2-minute Loom. Easy to extend if 1Now wants to make it part of their core product.
