import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

type DamageFinding = {
  id: string;
  location: string;
  description: string;
  severity: "minor" | "moderate" | "severe";
  evidence_photo_index: number;
  estimated_repair_low_usd: number;
  estimated_repair_high_usd: number;
};

type DisputeMode = "guest_direct" | "turo_claim";

type DisputeRequest = {
  vehicleLabel: string;
  renterName: string;
  tripStartDate: string;
  tripEndDate: string;
  pickupPhotoCount: number;
  returnPhotoCount: number;
  findings: DamageFinding[];
  operatorNotes?: string;
  mode?: DisputeMode;
};

const SYSTEM_TURO_CLAIM = `You write Turo damage disputes for independent car rental operators (1Now's customers). This is the FORMAL escalation to Turo's claims team after the guest refused to pay directly.

A great Turo dispute message has these traits:
- Polite, factual, never angry
- Cites the evidence (photos, dates, comparison)
- Asks for a specific dollar amount (low+high range)
- Mentions the protection plan and reimbursement policy without being preachy
- Easy for a Turo claims agent to read in under 60 seconds and approve
- 250-400 words. No filler. No emoji. No em-dashes (use commas).

Output STRICT JSON only with shape:
{
  "subject": "string — short headline e.g. 'Damage report for trip ending 2026-05-22'",
  "body": "string — the full dispute message ready to paste into Turo",
  "requested_amount_low_usd": number,
  "requested_amount_high_usd": number,
  "next_steps": ["string", "string"]
}

No preamble, no markdown fences.`;

const SYSTEM_GUEST_DIRECT = `You write FIRST-CONTACT damage messages for independent car rental operators (1Now's customers) to send DIRECTLY to their guest before escalating to Turo. Turo gives guests and hosts 20 days to resolve damage between themselves before involving Turo claims — and resolving directly is cheaper for both sides (no Turo appraisal fee, no processing fee).

This message must:
- Open warmly and assume the guest didn't intentionally hide the damage
- Describe the damage factually with photo evidence cited
- Offer a clear, fair dollar request (low+high range, reasonable for the severity)
- Suggest direct payment via Turo's "Resolve directly" option to save BOTH sides money
- Invite a quick conversation if the guest disagrees
- NEVER threaten or mention "claims," "lawsuit," "small claims," or "escalation"
- 180-280 words. Conversational, polite, no em-dashes (use commas), no emoji.

Output STRICT JSON only with shape:
{
  "subject": "string — friendly subject like 'Quick note about the trip ending 2026-05-22'",
  "body": "string — the full message ready to paste into the Turo guest chat",
  "requested_amount_low_usd": number,
  "requested_amount_high_usd": number,
  "next_steps": ["string", "string"]
}

No preamble, no markdown fences.`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DisputeRequest;
    if (!body.findings?.length) {
      return NextResponse.json(
        { error: "No findings to dispute" },
        { status: 400 }
      );
    }

    const findingsBlock = body.findings
      .map(
        (f, i) =>
          `${i + 1}. ${f.location}: ${f.description} (severity: ${f.severity}, repair estimate: $${f.estimated_repair_low_usd}-$${f.estimated_repair_high_usd}, evidence in return photo #${f.evidence_photo_index + 1})`
      )
      .join("\n");

    const totalLow = body.findings.reduce(
      (s, f) => s + (f.estimated_repair_low_usd || 0),
      0
    );
    const totalHigh = body.findings.reduce(
      (s, f) => s + (f.estimated_repair_high_usd || 0),
      0
    );

    const mode: DisputeMode = body.mode === "guest_direct" ? "guest_direct" : "turo_claim";
    const system = mode === "guest_direct" ? SYSTEM_GUEST_DIRECT : SYSTEM_TURO_CLAIM;

    const audienceLabel =
      mode === "guest_direct"
        ? `the guest directly (first-contact message, before involving Turo)`
        : `Turo's claims team (formal escalation)`;

    const prompt = `Write a damage message addressed to ${audienceLabel} for this rental.

Vehicle: ${body.vehicleLabel}
Renter (guest first name): ${body.renterName}
Trip: ${body.tripStartDate} to ${body.tripEndDate}
Pickup photos on file: ${body.pickupPhotoCount}
Return photos on file: ${body.returnPhotoCount}

New damage found:
${findingsBlock}

Total estimate: $${totalLow} to $${totalHigh}

${body.operatorNotes ? `Operator's notes: ${body.operatorNotes}` : ""}

Write the message. Output JSON only.`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Claude returned non-JSON", raw: text },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
