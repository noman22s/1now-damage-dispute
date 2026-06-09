import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

type ImagePayload = { mediaType: string; base64: string };

type AnalyzeRequest = {
  pickupPhotos: ImagePayload[];
  returnPhotos: ImagePayload[];
};

type BoundingBox = {
  // normalized 0-1 coordinates on the return photo
  x: number;
  y: number;
  width: number;
  height: number;
};

type DamageFinding = {
  id: string;
  location: string;
  description: string;
  severity: "minor" | "moderate" | "severe";
  evidence_photo_index: number;
  comparison_pickup_index: number; // matching pickup photo for side-by-side
  bbox: BoundingBox | null;
  estimated_repair_low_usd: number;
  estimated_repair_high_usd: number;
};

type AnalyzeResponse = {
  new_damage_detected: boolean;
  findings: DamageFinding[];
  summary: string;
  total_estimate_low_usd: number;
  total_estimate_high_usd: number;
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

const SYSTEM = `You are an expert car-rental damage assessor. You compare PICKUP photos (vehicle condition before a rental) with RETURN photos (after the rental) for an independent car rental operator (Turo host).

IMPORTANT CONTEXT: Pickup and return photos are taken by busy operators at different times, often from slightly different angles and lighting. They will NOT match pixel-for-pixel. Your job is to spot CLEARLY VISIBLE damage in the return photos that does not appear in any pickup photo of a similar area.

Your job:
1. Look carefully at every return photo. Identify any CLEARLY VISIBLE damage (scratches, dents, broken parts, cracks, missing trim, body panel gaps, wheel scuffs, broken lights).
2. For each piece of damage, check whether any pickup photo shows the same damage. If yes, skip it (pre-existing). If no pickup photo shows that area at all, flag it as new (the pickup baseline didn't cover that side, which is itself useful info for an operator).
3. Ignore: dirt that can be washed off, water droplets, shadows, reflections, license plate variation.
4. Skip only if return photos appear genuinely undamaged.
5. For each finding, briefly describe location ("front bumper, driver side"), what it is ("4cm scratch"), severity, and a rough repair cost in USD.
6. Cite which return photo index (0-based) shows the damage clearly.
7. Pick which pickup photo index (0-based) is most useful as a "before" comparison for that area (best-effort: the one whose framing is closest to the damaged area). If pickup coverage is missing for that side, still pick the most relevant pickup index.
8. Give a normalized bounding box on the RETURN photo at the damage location, with x, y, width, height each between 0 and 1 (origin top-left).

Output STRICT JSON only, matching this schema:
{
  "new_damage_detected": boolean,
  "findings": [
    {
      "id": "d1",
      "location": "string",
      "description": "string",
      "severity": "minor" | "moderate" | "severe",
      "evidence_photo_index": number,
      "comparison_pickup_index": number,
      "bbox": { "x": number, "y": number, "width": number, "height": number },
      "estimated_repair_low_usd": number,
      "estimated_repair_high_usd": number
    }
  ],
  "summary": "one-sentence summary suitable for the dispute letter intro",
  "total_estimate_low_usd": number,
  "total_estimate_high_usd": number
}

If no new damage is found, return findings:[] and new_damage_detected:false.
If you cannot determine an exact bbox, set bbox to null. Otherwise return tight coordinates (the box should hug the damage, not the whole car).
Output ONLY the JSON, no preamble, no markdown fences.`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeRequest;
    if (!body.pickupPhotos?.length || !body.returnPhotos?.length) {
      return NextResponse.json(
        { error: "Need both pickupPhotos and returnPhotos" },
        { status: 400 }
      );
    }

    // Build the message with labels so Claude can reference photo indices later
    const content: Anthropic.MessageParam["content"] = [
      {
        type: "text",
        text: `PICKUP PHOTOS (vehicle condition before the rental). Count: ${body.pickupPhotos.length}.`,
      },
      ...body.pickupPhotos.map(toImageBlock),
      {
        type: "text",
        text: `RETURN PHOTOS (vehicle condition after the rental). Count: ${body.returnPhotos.length}. These are 0-indexed for your "evidence_photo_index" field.`,
      },
      ...body.returnPhotos.map(toImageBlock),
      {
        type: "text",
        text: `Compare and output the JSON described in the system prompt.`,
      },
    ];

    const resp = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });

    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();

    // Strip code fences just in case
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: AnalyzeResponse;
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
