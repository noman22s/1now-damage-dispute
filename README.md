# Damage Dispute Pack

An AI tool for independent car rental operators (1Now's customers, including Turo hosts).

Upload your pickup photos and your return photos. Claude vision compares them, flags new damage, and Claude text generates a polished, evidence-cited dispute message ready to paste straight into Turo.

This solves a real, expensive problem. Damage disputes are how Turo operators win or lose hundreds of dollars per trip. Most operators write rushed, weak disputes because each one takes 30 to 90 minutes. Mine writes itself in about 30 seconds.

## Why this project

1Now's brief said: "spot a 1Now problem in your domain, point Claude at it, ship the result. Owners impress us more than completers."

I picked the highest-pain operational problem I could find for an independent fleet operator: damage disputes. Every Turo host loses 200 to 2000 dollars per dispute they don't file well. This tool:

- Compares pickup and return photos using Claude Sonnet 4.5 vision
- Detects only NEW damage (ignores pre-existing scratches, dirt, shadows)
- Generates a fact-based dispute letter citing specific photos as evidence
- Outputs a copyable Turo message in the format claims agents actually approve

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Anthropic SDK (Claude Sonnet 4.5 for both vision and text)
- Lucide React icons
- Deployable on Vercel in one command

## Run locally

```bash
git clone <this-repo>
cd 1now-dispute
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Open http://localhost:3000.

## How it works

```
Pickup photos + Return photos
            |
            v
POST /api/analyze ---> Claude Sonnet 4.5 (vision)
            |          System prompt: compare strictly,
            |          ignore pre-existing damage, dirt, shadows.
            |          Returns JSON: findings[], summary,
            |          repair estimates.
            v
Damage report rendered in UI
            |
            v   operator clicks "Generate dispute"
            |
POST /api/dispute ---> Claude Sonnet 4.5 (text)
            |          System prompt: write a 250-400 word
            |          Turo dispute, polite, factual,
            |          citing each finding.
            v
Ready-to-paste dispute message + requested amount range
```

## Code structure

```
app/
  page.tsx                  Main UI: upload, analyze, generate, copy
  layout.tsx                Page chrome
  api/
    analyze/route.ts        Claude vision: photos -> findings JSON
    dispute/route.ts        Claude text: findings -> dispute message
```

Both API routes:
- Accept JSON, return JSON
- Use strict prompts that force JSON output (no markdown fences, no preamble)
- Strip code fences defensively in case Claude wraps the response
- Surface clean error messages to the UI

## Design decisions

**Vision and text both go to Claude.** No OCR, no custom CV models, no fine-tuning. The 1Now brief specifically said "every role at 1Now directs Claude" — the point is taste in problems, not building parallel ML infra.

**Strict JSON output.** Both prompts demand strict JSON only. The UI assumes valid JSON and the API routes strip fences defensively. Predictable, debuggable, no parsing acrobatics.

**Conservative damage detection.** The system prompt explicitly says "false positives cost operators credibility." Better to under-report than over-report. A single wrongly-cited damage finding gets the whole dispute thrown out by Turo's claims team.

**Trip metadata is optional.** Vehicle, renter name, dates, notes — all optional. The tool works on photos alone. Filling in details just makes the dispute letter better.

**No database, no auth.** Photos live in memory for the request, never persisted. An operator can use this 50 times a day and we store nothing.

## Next things I'd build

- Draw a bounding box on the return photo when Claude finds damage (currently shows the photo as evidence without highlighting)
- Save dispute history to localStorage so operators can re-open past disputes
- Direct Turo API integration so the dispute submits with one click
- Multi-vehicle support: pick which car from a 1Now-style fleet list
- Auto-fetch repair cost averages by zip code

## Journey

See `JOURNEY.md` for the why, the stuck moments, and what I would do with more time.
