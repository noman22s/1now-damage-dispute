"use client";

import { useState, useRef, useMemo } from "react";
import { generateDisputePDF } from "./lib/pdf";
import {
  Upload,
  X,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Sparkles,
  FileWarning,
  Loader2,
  Download,
  ArrowRight,
} from "lucide-react";

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

type AnalyzeResponse = {
  new_damage_detected: boolean;
  findings: DamageFinding[];
  summary: string;
  total_estimate_low_usd: number;
  total_estimate_high_usd: number;
};

type DisputeResponse = {
  subject: string;
  body: string;
  requested_amount_low_usd: number;
  requested_amount_high_usd: number;
  next_steps: string[];
};

type UploadedPhoto = {
  preview: string;
  base64: string;
  mediaType: string;
  name: string;
};

function fileToPayload(file: File): Promise<UploadedPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return reject(new Error("Bad image format"));
      resolve({
        preview: result,
        mediaType: match[1],
        base64: match[2],
        name: file.name,
      });
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function severityColor(s: DamageFinding["severity"]) {
  if (s === "severe") return "bg-red-100 text-red-800 border-red-200";
  if (s === "moderate") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-yellow-100 text-yellow-800 border-yellow-200";
}

function PhotoDropzone({
  label,
  hint,
  photos,
  setPhotos,
  accentColor,
}: {
  label: string;
  hint: string;
  photos: UploadedPhoto[];
  setPhotos: (p: UploadedPhoto[]) => void;
  accentColor: "blue" | "purple";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const payloads = await Promise.all(arr.map(fileToPayload));
    setPhotos([...photos, ...payloads]);
  };

  const removeAt = (i: number) => {
    setPhotos(photos.filter((_, idx) => idx !== i));
  };

  const borderClass =
    accentColor === "blue"
      ? "border-blue-200 hover:border-blue-400 bg-blue-50/30"
      : "border-purple-200 hover:border-purple-400 bg-purple-50/30";

  const badgeClass =
    accentColor === "blue"
      ? "bg-blue-100 text-blue-700"
      : "bg-purple-100 text-purple-700";

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">{label}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClass}`}>
            {photos.length}
          </span>
        </div>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-xl ${borderClass} transition-colors cursor-pointer p-6 min-h-32`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-slate-500 py-4">
            <Upload className="w-7 h-7 mb-2" />
            <p className="text-sm font-medium">Drag photos here or click to browse</p>
            <p className="text-xs mt-1">JPEG / PNG / WebP, multiple OK</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.preview}
                  alt={p.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  #{i + 1}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(i);
                  }}
                  className="absolute top-1 right-1 bg-white/90 text-slate-700 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remove photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div
              className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              <Upload className="w-5 h-5" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [pickupPhotos, setPickupPhotos] = useState<UploadedPhoto[]>([]);
  const [returnPhotos, setReturnPhotos] = useState<UploadedPhoto[]>([]);
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [renterName, setRenterName] = useState("");
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [operatorNotes, setOperatorNotes] = useState("");

  const [stage, setStage] = useState<
    "idle" | "analyzing" | "analyzed" | "drafting" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [dispute, setDispute] = useState<DisputeResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const canAnalyze = pickupPhotos.length > 0 && returnPhotos.length > 0;

  const totalEstimate = useMemo(() => {
    if (!analysis) return null;
    return {
      low: analysis.total_estimate_low_usd ?? 0,
      high: analysis.total_estimate_high_usd ?? 0,
    };
  }, [analysis]);

  async function runAnalysis() {
    setError(null);
    setAnalysis(null);
    setDispute(null);
    setStage("analyzing");

    const payload = {
      pickupPhotos: pickupPhotos.map((p) => ({
        mediaType: p.mediaType,
        base64: p.base64,
      })),
      returnPhotos: returnPhotos.map((p) => ({
        mediaType: p.mediaType,
        base64: p.base64,
      })),
    };

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AnalyzeResponse;
      setAnalysis(data);
      setStage("analyzed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStage("idle");
    }
  }

  async function generateDispute() {
    if (!analysis) return;
    setError(null);
    setDispute(null);
    setStage("drafting");

    try {
      const res = await fetch("/api/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleLabel: vehicleLabel || "Vehicle",
          renterName: renterName || "Renter",
          tripStartDate: tripStartDate || "(trip start)",
          tripEndDate: tripEndDate || "(trip end)",
          pickupPhotoCount: pickupPhotos.length,
          returnPhotoCount: returnPhotos.length,
          findings: analysis.findings,
          operatorNotes: operatorNotes || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as DisputeResponse;
      setDispute(data);
      setStage("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStage("analyzed");
    }
  }

  async function copyDispute() {
    if (!dispute) return;
    await navigator.clipboard.writeText(`${dispute.subject}\n\n${dispute.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [generatingPdf, setGeneratingPdf] = useState(false);

  async function downloadPdf() {
    if (!dispute || !analysis) return;
    setGeneratingPdf(true);
    try {
      await generateDisputePDF({
        trip: {
          vehicleLabel: vehicleLabel || "Vehicle",
          renterName: renterName || "Renter",
          tripStartDate: tripStartDate || "trip start",
          tripEndDate: tripEndDate || "trip end",
        },
        analysis: {
          findings: analysis.findings,
          summary: analysis.summary,
          total_estimate_low_usd: analysis.total_estimate_low_usd,
          total_estimate_high_usd: analysis.total_estimate_high_usd,
        },
        dispute,
        pickupPhotos,
        returnPhotos,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingPdf(false);
    }
  }

  function reset() {
    setPickupPhotos([]);
    setReturnPhotos([]);
    setAnalysis(null);
    setDispute(null);
    setError(null);
    setStage("idle");
    setCopied(false);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Damage Dispute Pack
            </h1>
          </div>
          <p className="text-slate-600 max-w-2xl">
            Upload pickup and return photos, get an AI-detected damage report and a
            ready-to-paste Turo dispute message. Built for 1Now operators.
          </p>
        </div>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              STEP 1
            </span>
            <h2 className="text-lg font-semibold text-slate-900">
              Upload your photos
            </h2>
          </div>
          <div className="flex flex-col lg:flex-row gap-6">
            <PhotoDropzone
              label="Pickup photos"
              hint="Before the trip"
              photos={pickupPhotos}
              setPhotos={setPickupPhotos}
              accentColor="blue"
            />
            <PhotoDropzone
              label="Return photos"
              hint="After the trip"
              photos={returnPhotos}
              setPhotos={setReturnPhotos}
              accentColor="purple"
            />
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              STEP 2
            </span>
            <h2 className="text-lg font-semibold text-slate-900">
              Trip details
            </h2>
            <span className="text-xs text-slate-500">(optional but better)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-700 mb-1 block">
                Vehicle
              </span>
              <input
                type="text"
                value={vehicleLabel}
                onChange={(e) => setVehicleLabel(e.target.value)}
                placeholder="2021 Honda Civic LX"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700 mb-1 block">
                Renter name (first name OK)
              </span>
              <input
                type="text"
                value={renterName}
                onChange={(e) => setRenterName(e.target.value)}
                placeholder="Sarah K."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700 mb-1 block">
                Trip start
              </span>
              <input
                type="date"
                value={tripStartDate}
                onChange={(e) => setTripStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700 mb-1 block">
                Trip end
              </span>
              <input
                type="date"
                value={tripEndDate}
                onChange={(e) => setTripEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-700 mb-1 block">
                Operator notes (anything Claude should know)
              </span>
              <textarea
                value={operatorNotes}
                onChange={(e) => setOperatorNotes(e.target.value)}
                placeholder="e.g. renter said they hit a pothole. I noticed it during inspection."
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 resize-none"
              />
            </label>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={runAnalysis}
              disabled={!canAnalyze || stage === "analyzing" || stage === "drafting"}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-lg font-medium disabled:bg-slate-300 disabled:cursor-not-allowed transition"
            >
              {stage === "analyzing" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Comparing photos with Claude vision...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Analyze damage
                </>
              )}
            </button>
            {(analysis || dispute || error) && (
              <button
                type="button"
                onClick={reset}
                className="px-4 py-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm"
              >
                Start over
              </button>
            )}
          </div>
          {!canAnalyze && (
            <p className="text-xs text-slate-500 mt-2">
              Add at least one pickup and one return photo to analyze.
            </p>
          )}
          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <strong>Error:</strong> {error}
            </div>
          )}
        </section>

        {analysis && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                RESULT
              </span>
              <h2 className="text-lg font-semibold text-slate-900">
                Damage analysis
              </h2>
            </div>

            {!analysis.new_damage_detected ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-900">
                    No new damage detected
                  </p>
                  <p className="text-sm text-green-800 mt-1">
                    {analysis.summary || "The return photos match the pickup photos."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4 flex items-start gap-3">
                  <FileWarning className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900">
                      {analysis.findings.length} new damage finding
                      {analysis.findings.length === 1 ? "" : "s"} detected
                    </p>
                    <p className="text-sm text-amber-800 mt-1">{analysis.summary}</p>
                    {totalEstimate && (
                      <p className="text-sm font-semibold text-amber-900 mt-2">
                        Estimated total repair: ${totalEstimate.low} to $
                        {totalEstimate.high}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4 mb-5">
                  {analysis.findings.map((f, idx) => {
                    const pickupIdx =
                      typeof f.comparison_pickup_index === "number" &&
                      f.comparison_pickup_index >= 0 &&
                      f.comparison_pickup_index < pickupPhotos.length
                        ? f.comparison_pickup_index
                        : 0;
                    const returnPhoto = returnPhotos[f.evidence_photo_index];
                    const pickupPhoto = pickupPhotos[pickupIdx];

                    return (
                      <div
                        key={f.id || idx}
                        className="border border-slate-200 rounded-xl p-4 bg-slate-50/50"
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold text-slate-500">
                                FINDING {idx + 1}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${severityColor(f.severity)}`}
                              >
                                {f.severity.toUpperCase()}
                              </span>
                            </div>
                            <p className="font-semibold text-slate-900 text-sm">
                              {f.location}
                            </p>
                            <p className="text-sm text-slate-700">
                              {f.description}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase">
                              Estimate
                            </p>
                            <p className="text-sm font-bold text-slate-900">
                              ${f.estimated_repair_low_usd} - $
                              {f.estimated_repair_high_usd}
                            </p>
                          </div>
                        </div>

                        {/* Side-by-side pickup vs return with bbox overlay */}
                        <div className="grid grid-cols-2 gap-3 items-start">
                          <div className="relative">
                            <p className="text-[10px] font-bold uppercase text-blue-700 mb-1">
                              Pickup (before)
                            </p>
                            {pickupPhoto ? (
                              <div className="relative rounded-lg overflow-hidden border border-blue-200 bg-blue-50">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={pickupPhoto.preview}
                                  alt={`Pickup ${pickupIdx + 1}`}
                                  className="w-full h-auto block"
                                />
                                <div className="absolute top-1 left-1 bg-blue-700 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                                  Pickup #{pickupIdx + 1}
                                </div>
                              </div>
                            ) : (
                              <div className="aspect-square rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                                no photo
                              </div>
                            )}
                          </div>

                          <div className="relative">
                            <p className="text-[10px] font-bold uppercase text-purple-700 mb-1 flex items-center gap-1">
                              <ArrowRight className="w-3 h-3" />
                              Return (after, damage marked)
                            </p>
                            {returnPhoto ? (
                              <div className="relative rounded-lg overflow-hidden border-2 border-red-300 bg-purple-50">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={returnPhoto.preview}
                                  alt={`Return ${f.evidence_photo_index + 1}`}
                                  className="w-full h-auto block"
                                />
                                {/* SVG bbox overlay */}
                                {f.bbox ? (
                                  <svg
                                    viewBox="0 0 100 100"
                                    preserveAspectRatio="none"
                                    className="absolute inset-0 w-full h-full pointer-events-none"
                                  >
                                    <rect
                                      x={Math.max(0, f.bbox.x * 100)}
                                      y={Math.max(0, f.bbox.y * 100)}
                                      width={Math.min(100, f.bbox.width * 100)}
                                      height={Math.min(100, f.bbox.height * 100)}
                                      fill="rgba(239, 68, 68, 0.18)"
                                      stroke="#ef4444"
                                      strokeWidth="0.6"
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  </svg>
                                ) : null}
                                <div className="absolute top-1 left-1 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                                  Return #{f.evidence_photo_index + 1}
                                </div>
                              </div>
                            ) : (
                              <div className="aspect-square rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                                no photo
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={generateDispute}
                  disabled={stage === "drafting"}
                  className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-lg font-medium disabled:bg-slate-400 transition"
                >
                  {stage === "drafting" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Drafting dispute message...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      Generate Turo dispute message
                    </>
                  )}
                </button>
              </>
            )}
          </section>
        )}

        {dispute && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  READY
                </span>
                <h2 className="text-lg font-semibold text-slate-900">
                  Dispute message
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={generatingPdf}
                  className="inline-flex items-center gap-1.5 text-sm bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg font-medium disabled:bg-slate-400"
                >
                  {generatingPdf ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Building PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download dispute pack PDF
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={copyDispute}
                  className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                Subject
              </p>
              <p className="text-sm font-semibold text-slate-900 mb-3">
                {dispute.subject}
              </p>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                Message body
              </p>
              <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                {dispute.body}
              </pre>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-emerald-700 uppercase mb-1">
                  Requested amount
                </p>
                <p className="text-lg font-bold text-emerald-900">
                  ${dispute.requested_amount_low_usd} to $
                  {dispute.requested_amount_high_usd}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-700 uppercase mb-1">
                  Next steps
                </p>
                <ul className="text-sm text-slate-800 list-disc list-inside space-y-0.5">
                  {dispute.next_steps?.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-slate-400 mt-8">
          Built for 1Now operators. Powered by Claude.
        </footer>
      </div>
    </main>
  );
}
