# Damage Dispute Pack

**Live demo:** https://1now-damage-dispute.vercel.app

End-to-end damage dispute workflow for independent car rental operators (1Now's customers, including Turo hosts). Drop in pickup and return photos, get a Claude-vision damage report with bounding boxes, generate a Turo-ready dispute message in the right tone for the right stage, and export a multi-page PDF dispute pack ready to file. Plus three pieces of operator-side intelligence most competitors skip.

## Why this project

1Now's brief said: "spot a 1Now problem in your domain, point Claude at it, ship the result. Owners impress us more than completers."

Damage disputes are the single most expensive recurring pain for small fleet operators. A weak dispute loses $200-$2000. The 24-hour reporting deadline is unforgiving. Existing AI tools (DAMAGE iD, Wenn, DeGould) stop at damage detection. No one ships the full operator workflow: detect, draft, file, track.

This does all of it.

## What's in the box

1. **Claude vision damage detection** — compare pickup and return photos, identify new damage with bounding boxes drawn on the return photo, side-by-side with the matching pickup photo for proof.

2. **Two-stage dispute generator** — switch between *Resolve with guest* (Stage 1: friendly first-contact message, 20-day window, saves Turo fees) and *Escalate to Turo claims* (Stage 2: formal escalation letter). Each uses a tuned system prompt.

3. **24-hour Turo deadline countdown** — live timer based on the trip end date. Color-coded warning when under 12 hours, critical alert under 3 hours, and an expired state explaining why a claim is likely doomed.

4. **Pickup photo coverage check** — separate Claude vision audit of the pickup photos against Turo's 8 standard angles (front, rear, both sides, wheels, interior, mileage, fuel). Returns a coverage score, what's covered, what's missing, and specific recommendations. Bad pickup coverage is the #1 reason Turo denies claims.

5. **PDF dispute pack export** — multi-page A4 PDF with the dispute letter, findings table, and annotated photos. Ready to email or file.

6. **Dispute history** — every generated dispute auto-saves to local browser storage. Operator can browse past cases without any backend.

7. **Sample case button** — instantly loads a pre-vetted demo scenario so the product can be evaluated in 30 seconds.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- Anthropic SDK with Claude Sonnet 4.5 (vision + text, 3 distinct system prompts)
- jsPDF for client-side PDF generation
- Lucide React icons
- Deployed on Vercel

## Local setup

```bash
git clone https://github.com/noman22s/1now-damage-dispute.git
cd 1now-damage-dispute
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Open http://localhost:3000.

## API

| Route | Method | Purpose |
|---|---|---|
| `/api/analyze` | POST | Compare pickup vs return photos. Returns findings with bbox + comparison_pickup_index + severity + repair estimates. |
| `/api/coverage` | POST | Audit pickup photos against Turo's 8 standard angles. Returns coverage score + missing angles + recommendations. |
| `/api/dispute` | POST | Generate the dispute message. Accepts `mode: "guest_direct" | "turo_claim"` to switch between Stage 1 friendly and Stage 2 formal. |

All routes return strict JSON. System prompts force JSON-only output and the routes strip code fences defensively.

## How it works

```
Operator drops in pickup + return photos
            |
            +--> [Optional] /api/coverage --> coverage score + missing angles + tips
            |
            v
Operator enters trip end date  --> live 24-hour countdown badge
            |
            v
Click "Analyze damage"  --> /api/analyze (Claude Sonnet 4.5 vision)
            |          findings: [{location, description, severity, bbox,
            |                     comparison_pickup_index, evidence_photo_index,
            |                     estimate}]
            v
Side-by-side comparison rendered with SVG red bounding box overlay
            |
            v
Operator picks dispute mode: [Resolve with guest] or [Escalate to Turo]
Click "Generate dispute"  --> /api/dispute (different system prompt per mode)
            |
            v
Polished message + auto-save to localStorage history
            |
            v
"Download dispute pack" --> client-side jsPDF (letter + photos + findings + bbox overlays)
            |
            v
Past disputes available from the History button (top right)
```

## Code structure

```
app/
  page.tsx                    Main UI: hero, history panel, photo upload, coverage,
                              countdown, analysis result, dispute mode toggle,
                              dispute output, PDF download
  layout.tsx                  Page chrome
  globals.css                 Forced light theme, input visibility fixes
  api/
    analyze/route.ts          Claude vision: pickup + return photos -> findings JSON
    coverage/route.ts         Claude vision: pickup-only audit vs 8 standard angles
    dispute/route.ts          Claude text: findings -> message (mode-specific prompt)
  lib/
    countdown.ts              24-hour Turo deadline math + severity buckets
    history.ts                localStorage history (load/save/delete/clear)
    pdf.ts                    jsPDF generation with bbox-annotated photos
public/samples/               Pre-bundled demo photos for the Try-with-a-sample-case flow
```

## Design decisions

**Vision + text both go through Claude.** No custom CV models, no OCR, no fine-tuning. The 1Now brief specifically said "every role at 1Now directs Claude" — the point is taste in problems, not building parallel ML infra.

**Three distinct system prompts.** One for vision damage comparison (be conservative on real photo pairs), one for coverage audit (8 standard angles), one each for guest-direct vs Turo-claim messages (different tone, different stakes). All force strict JSON output, all strip fences defensively.

**24-hour countdown is computed client-side and ticks every minute.** Trip end date is treated as 23:59 local (most generous reading) plus 24 hours. The badge re-renders without a network call.

**Coverage check runs separately from damage analysis.** A small operator may want to check pickup coverage at pickup time (before the trip) — it doesn't require return photos.

**Two-stage dispute is the actual Turo workflow.** Hosts can resolve damage directly with guests in a 20-day window. Doing so skips Turo's appraisal fee and processing fee. Only after the guest stops responding or disputes the amount do hosts escalate. The product mirrors this.

**Local history, no backend.** localStorage stores up to 20 most recent disputes. No accounts, no PII server-side. An operator can use this all day and nothing leaves their browser except the photos sent to Claude for the actual analysis.

## Sources informing the product

Research that shaped the feature set:

- Turo help center, damage claim workflow (https://help.turo.com/reporting-and-resolving-damage-or-us-hosts-SymY8VlN5)
- Turo help center, resolving damage directly with guest (https://help.turo.com/en_us/resolving-damage-with-your-host-Hy4fBNlN5)
- Travel Bay 2026, claims process timeline (https://travelbay.org/turo-claims-process-step-by-step/)
- FleetBold 2026, Turo insurance guide
- 1Now's own product page (https://1now.ai/)
- Existing competitor positioning: DAMAGE iD, Wenn, DeGould (all stop at detection)

## Journey

See `JOURNEY.md` for the why, the stuck moments, and what I would do with more time.
