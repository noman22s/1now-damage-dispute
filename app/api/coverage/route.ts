import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

type ImagePayload = { mediaType: string; base64: string };
type CoverageRequest = { pickupPhotos: ImagePayload[] };

type CoverageResponse = {
  coverage_score: number; // 0-100
  covered_angles: string[];
  missing_angles: string[];
  recommendations: string[];
  summary: string;
};

function toImageBlock(p: ImagePayload) {
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: (p.mediaType || "image/jpeg") as
        | "image/jpeg"
        | "image/png"
        | "image/webp"
        | "image/gif",
      data: p.base64,
    },
  };
}

const SYSTEM = `You are auditing pickup photo coverage for a car rental operator (Turo host). Turo will deny damage claims if the pickup photos don't cover the area where damage is later found.

The 8 standard pickup angles Turo recommends:
1. Front (head-on)
2. Rear (head-on)
3. Driver side (full length)
4. Passenger side (full length)
5. Wheels (close-up of each rim/tire)
6. Interior (dashboard + seats)
7. Mileage / odometer reading
8. Fuel gauge

Look at the pickup photos and decide which of these 8 angles ARE covered and which are MISSING. Be generous — a single side photo can count as covering that side. Be specific about what's missing.

Score the coverage 0-100 (100 = all 8 angles covered).

Output STRICT JSON only:
{
  "coverage_score": number,
  "covered_angles": ["string", ...],
  "missing_angles": ["string", ...],
  "recommendations": ["specific actionable string", ...],
  "summary": "one-line readable summary"
}

No preamble, no markdown fences.`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CoverageRequest;
    if (!body.pickupPhotos?.length) {
      return NextResponse.json(
        { error: "Need at least one pickup photo" },
        { status: 400 }
      );
    }

    const content: Anthropic.MessageParam["content"] = [
      {
        type: "text",
        text: `Audit these ${body.pickupPhotos.length} pickup photo(s) against the 8 standard Turo angles. Return JSON.`,
      },
      ...body.pickupPhotos.map(toImageBlock),
    ];

    const resp = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content }],
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

    let parsed: CoverageResponse;
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
