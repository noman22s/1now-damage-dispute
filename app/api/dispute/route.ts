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

type DisputeRequest = {
  vehicleLabel: string; // e.g. "2021 Honda Civic LX"
  renterName: string;
  tripStartDate: string; // ISO or human
  tripEndDate: string;
  pickupPhotoCount: number;
  returnPhotoCount: number;
  findings: DamageFinding[];
  operatorNotes?: string;
};

const SYSTEM = `You write Turo damage disputes for independent car rental operators (1Now's customers).

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

    const prompt = `Write a Turo dispute for this rental.

Vehicle: ${body.vehicleLabel}
Renter: ${body.renterName}
Trip: ${body.tripStartDate} to ${body.tripEndDate}
Pickup photos on file: ${body.pickupPhotoCount}
Return photos on file: ${body.returnPhotoCount}

New damage found:
${findingsBlock}

Total estimate: $${totalLow} to $${totalHigh}

${body.operatorNotes ? `Operator's notes: ${body.operatorNotes}` : ""}

Write the dispute. Output JSON only.`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: SYSTEM,
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
