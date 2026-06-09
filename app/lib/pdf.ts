import { jsPDF } from "jspdf";

type BoundingBox = {
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
  comparison_pickup_index: number;
  bbox: BoundingBox | null;
  estimated_repair_low_usd: number;
  estimated_repair_high_usd: number;
};

type UploadedPhoto = {
  preview: string; // data URL
  base64: string;
  mediaType: string;
  name: string;
};

type DisputeData = {
  subject: string;
  body: string;
  requested_amount_low_usd: number;
  requested_amount_high_usd: number;
  next_steps: string[];
};

type AnalysisData = {
  findings: DamageFinding[];
  summary: string;
  total_estimate_low_usd: number;
  total_estimate_high_usd: number;
};

type Trip = {
  vehicleLabel: string;
  renterName: string;
  tripStartDate: string;
  tripEndDate: string;
};

const PAGE_W = 210; // A4 mm
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

function drawHeader(doc: jsPDF, trip: Trip) {
  doc.setFillColor(99, 102, 241); // indigo-500
  doc.rect(0, 0, PAGE_W, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("DAMAGE DISPUTE PACK", MARGIN, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `${trip.vehicleLabel || "Vehicle"} — Trip: ${trip.tripStartDate} to ${trip.tripEndDate}`,
    MARGIN,
    18
  );
  doc.setTextColor(30, 30, 30);
}

function drawFooter(doc: jsPDF, page: number, total: number) {
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Damage Dispute Pack  |  Generated for 1Now operators  |  Page ${page} of ${total}`,
    PAGE_W / 2,
    290,
    { align: "center" }
  );
  doc.setTextColor(30, 30, 30);
}

function wrapText(
  doc: jsPDF,
  text: string,
  width: number,
  fontSize: number
): string[] {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(text, width);
}

async function imageDimsForPDF(
  dataUrl: string,
  maxW: number,
  maxH: number
): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      resolve({ w, h });
    };
    img.onerror = () => resolve({ w: maxW, h: maxH });
    img.src = dataUrl;
  });
}

/**
 * Render a return photo with the damage bounding box drawn on it, return a data URL.
 */
async function renderPhotoWithBBox(
  dataUrl: string,
  bbox: BoundingBox | null
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0);
      if (bbox) {
        const x = Math.max(0, bbox.x * img.width);
        const y = Math.max(0, bbox.y * img.height);
        const w = Math.min(img.width - x, bbox.width * img.width);
        const h = Math.min(img.height - y, bbox.height * img.height);
        ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = Math.max(3, Math.round(img.width / 250));
        ctx.strokeRect(x, y, w, h);
      }
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function generateDisputePDF({
  trip,
  analysis,
  dispute,
  pickupPhotos,
  returnPhotos,
}: {
  trip: Trip;
  analysis: AnalysisData;
  dispute: DisputeData;
  pickupPhotos: UploadedPhoto[];
  returnPhotos: UploadedPhoto[];
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // PAGE 1 — DISPUTE LETTER
  drawHeader(doc, trip);
  let y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DISPUTE LETTER", MARGIN, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Subject: ${dispute.subject}`, MARGIN, y);
  y += 8;

  // dispute body
  doc.setFontSize(10);
  const bodyLines = wrapText(doc, dispute.body, CONTENT_W, 10);
  for (const line of bodyLines) {
    if (y > 270) {
      drawFooter(doc, doc.getNumberOfPages(), 0);
      doc.addPage();
      drawHeader(doc, trip);
      y = 32;
    }
    doc.text(line, MARGIN, y);
    y += 5;
  }
  y += 4;

  // Requested amount box
  if (y > 250) {
    doc.addPage();
    drawHeader(doc, trip);
    y = 32;
  }
  doc.setFillColor(220, 252, 231); // emerald-100
  doc.rect(MARGIN, y, CONTENT_W, 14, "F");
  doc.setTextColor(6, 95, 70); // emerald-800
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("REQUESTED AMOUNT", MARGIN + 3, y + 5);
  doc.setFontSize(14);
  doc.text(
    `$${dispute.requested_amount_low_usd} - $${dispute.requested_amount_high_usd} USD`,
    MARGIN + 3,
    y + 11
  );
  doc.setTextColor(30, 30, 30);
  y += 20;

  // PAGE 2+ — FINDINGS TABLE
  doc.addPage();
  drawHeader(doc, trip);
  y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("FINDINGS", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(analysis.summary || "", MARGIN, y);
  y += 8;

  for (let i = 0; i < analysis.findings.length; i++) {
    const f = analysis.findings[i];
    if (y > 250) {
      drawFooter(doc, doc.getNumberOfPages(), 0);
      doc.addPage();
      drawHeader(doc, trip);
      y = 32;
    }
    // finding header
    doc.setFillColor(248, 250, 252);
    doc.rect(MARGIN, y, CONTENT_W, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      `${i + 1}. ${f.location}  [${f.severity.toUpperCase()}]`,
      MARGIN + 2,
      y + 5.5
    );
    doc.setFont("helvetica", "normal");
    doc.text(
      `$${f.estimated_repair_low_usd} - $${f.estimated_repair_high_usd}`,
      PAGE_W - MARGIN - 2,
      y + 5.5,
      { align: "right" }
    );
    y += 10;

    doc.setFontSize(9);
    const descLines = wrapText(doc, f.description, CONTENT_W, 9);
    for (const line of descLines) {
      doc.text(line, MARGIN, y);
      y += 4.5;
    }
    y += 2;
    doc.setTextColor(110, 110, 110);
    doc.setFontSize(8);
    doc.text(
      `Evidence: Pickup photo #${(f.comparison_pickup_index ?? 0) + 1} vs Return photo #${f.evidence_photo_index + 1}`,
      MARGIN,
      y
    );
    doc.setTextColor(30, 30, 30);
    y += 8;
  }

  // PAGE 3+ — PHOTO EVIDENCE
  for (let i = 0; i < analysis.findings.length; i++) {
    const f = analysis.findings[i];
    const pickupIdx = Math.min(
      Math.max(0, f.comparison_pickup_index ?? 0),
      pickupPhotos.length - 1
    );
    const pickup = pickupPhotos[pickupIdx];
    const ret = returnPhotos[f.evidence_photo_index];
    if (!pickup && !ret) continue;

    doc.addPage();
    drawHeader(doc, trip);
    y = 32;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`FINDING ${i + 1} — EVIDENCE`, MARGIN, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${f.location} — ${f.description}`, MARGIN, y, {
      maxWidth: CONTENT_W,
    });
    y += 10;

    const photoMaxW = (CONTENT_W - 6) / 2;
    const photoMaxH = 110;

    if (pickup) {
      const dims = await imageDimsForPDF(pickup.preview, photoMaxW, photoMaxH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(29, 78, 216); // blue-700
      doc.text(`PICKUP #${pickupIdx + 1} (BEFORE)`, MARGIN, y);
      doc.setTextColor(30, 30, 30);
      try {
        doc.addImage(
          pickup.preview,
          "JPEG",
          MARGIN,
          y + 2,
          dims.w,
          dims.h
        );
      } catch {
        // ignore
      }
    }

    if (ret) {
      const dims = await imageDimsForPDF(ret.preview, photoMaxW, photoMaxH);
      const xPos = MARGIN + photoMaxW + 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(220, 38, 38); // red-600
      doc.text(`RETURN #${f.evidence_photo_index + 1} (AFTER)`, xPos, y);
      doc.setTextColor(30, 30, 30);
      try {
        const annotated = await renderPhotoWithBBox(ret.preview, f.bbox);
        doc.addImage(annotated, "JPEG", xPos, y + 2, dims.w, dims.h);
      } catch {
        // ignore
      }
    }
  }

  // PAGE — NEXT STEPS
  doc.addPage();
  drawHeader(doc, trip);
  y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("NEXT STEPS", MARGIN, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const step of dispute.next_steps || []) {
    if (y > 270) {
      doc.addPage();
      drawHeader(doc, trip);
      y = 32;
    }
    const lines = wrapText(doc, `•  ${step}`, CONTENT_W, 10);
    for (const ln of lines) {
      doc.text(ln, MARGIN, y);
      y += 5;
    }
    y += 2;
  }

  // Update all footers with correct total
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total);
  }

  const safeName = (trip.vehicleLabel || "vehicle")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  const filename = `dispute_${safeName}_${trip.tripEndDate || "trip"}.pdf`;
  doc.save(filename);
}
