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

const SYSTEM = `You are an expert car-rental damage assessor for an independent car rental operator (Turo host). The operator is showing you PICKUP photos (the vehicle BEFORE a rental) and RETURN photos (AFTER the rental).

IMPORTANT CONTEXT: Operators take pickup and return photos quickly, from different angles, in different lighting. The vehicles in pickup vs return MAY appear visually different due to angle/lighting/crop. You should NOT refuse to analyze just because the photos do not look identical. Assume the operator knows what they are comparing.

YOUR JOB IS TO EXAMINE THE RETURN PHOTOS for any clearly visible damage and report it. The pickup photos are just baseline coverage — if the same damage is also clearly visible in a pickup photo, treat it as pre-existing and skip. Otherwise, flag it as new.

Specifically:
1. For each RETURN photo, identify any clearly visible damage: scratches, dents, broken parts, cracks, missing trim, body panel gaps, wheel scuffs, broken lights, dings, scrapes, peeling paint, rust spots, broken mirrors.
2. For each piece of damage, scan the pickup photos. If a pickup photo CLEARLY shows the same damage in the same spot, skip it. Otherwise, flag it as new damage.
3. Do NOT refuse the comparison because the pickup and return appear to be different vehicles or angles. The operator is asserting they are the same. Just report what damage is visible in the return.
4. Ignore: dirt that can be washed off, water droplets, shadows, reflections, license plate variation, normal road grime.
5. Be confident in your findings. If you see damage in the return, flag it.
6. For each finding, briefly describe location ("front bumper, driver side"), what it is ("4cm scratch through paint"), severity, and a rough repair cost in USD.
7. Cite which return photo index (0-based) shows the damage clearly.
8. Pick which pickup photo index (0-based) is the best "before" comparison (closest framing to the damaged area).
9. Give a normalized bounding box on the RETURN photo at the damage location: x, y, width, height each between 0 and 1, origin top-left. The box should hug the damage tightly, not the whole car.

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
