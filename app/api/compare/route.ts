import { NextRequest, NextResponse } from "next/server";
import { checkPerIp, clientIp, reserveDaily, settleReservation, WORST_CASE_RUN_CREDITS } from "../../../lib/limits";

const BASE = "https://clocked.rezolve.ai/clocked";
const KEY = process.env.CLOCKED_API_KEY || "";
const MAX_TEXT = 20000;

type ClockResult = { data: any; credits: number };

async function clocked(endpoint: string, body: Record<string, any>): Promise<ClockResult> {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const credits = Number(res.headers.get("x-clocked-credits") || 0);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Clocked ${endpoint} failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return { data, credits };
}

const FIELDS: Record<string, { label: string; description: string }> = {
  salary: { label: "Salary / stipend", description: "the complete sentence(s) stating the salary, stipend, CTC or pay amount, including any condition in the same or the immediately following sentence (such as 'may be revised')" },
  fees: { label: "Fees / deposit", description: "the complete sentence(s) about any fee, deposit or payment the candidate must make, or an explicit statement that none is required, including any conditions" },
  joining_date: { label: "Joining date", description: "the complete sentence stating the joining or start date, including any conditions" },
  location: { label: "Work location", description: "the complete sentence stating the work location or office city, including any conditions" },
  role: { label: "Role / title", description: "the complete sentence stating the job title or role, including any conditions" },
  training: { label: "Training / probation", description: "the complete sentence(s) stating the training or probation duration and what happens after it, including any conditions" },
  notice: { label: "Notice period", description: "the complete sentence(s) stating the notice period, bond or exit terms, including any conditions" },
  benefits: { label: "Other benefits", description: "complete sentence(s) about other material benefits or promises (accommodation, bonus, laptop, visa, etc.), including any conditions" },
};

const PROMISE_INSTRUCTIONS =
  "These are messages or notes recording what a recruiter promised a candidate about a job. Extract exactly what was promised, verbatim where possible. Always keep any qualifying or conditional words attached to a value (such as 'may be revised', 'subject to performance', 'if applicable', 'expected', 'up to') - never strip a condition from its value. Leave any field that is not mentioned empty.";
const LETTER_INSTRUCTIONS =
  "This is a formal offer letter or contract. Extract exactly what the document states, verbatim where possible. Always keep any qualifying or conditional words attached to a value (such as 'may be revised', 'subject to performance', 'if applicable', 'expected', 'up to') - never strip a condition from its value. Leave any field that is not mentioned empty.";

function fieldsPayload() {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(FIELDS)) out[k] = v.description;
  return out;
}

// Text extracts return {fields: {k: {value}}}; image extracts return {result: {k: value}}.
function extractValues(data: any): Record<string, any> {
  const out: Record<string, any> = {};
  const src = data?.fields || data?.result || {};
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v) && "value" in (v as any)) out[k] = (v as any).value;
    else out[k] = v;
  }
  return out;
}

function normVal(v: any): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.filter(Boolean).join("; ");
  return String(v).trim();
}

async function fileToDataUrl(f: File): Promise<string> {
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = f.type || "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function fileToB64(f: File): Promise<string> {
  const buf = Buffer.from(await f.arrayBuffer());
  return buf.toString("base64");
}

// Shared abuse limits are serialized by a Google Apps Script web app
// (LockService) and fail closed when the limiter is unavailable - see
// lib/limits.ts. Live processing is open to the public under those limits.
export async function POST(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "Server is not configured (missing API key)." }, { status: 500 });
  const ip = clientIp(req.headers);
  const perIp = await checkPerIp(ip);
  if (!perIp.ok) {
    return NextResponse.json({ error: perIp.error }, { status: perIp.status, headers: { "Cache-Control": "no-store" } });
  }
  let totalCredits = 0;
  let reservationKey: string | null = null;
  const track = (r: ClockResult) => {
    totalCredits += r.credits || 0;
    if (totalCredits > WORST_CASE_RUN_CREDITS) {
      throw new Error("This check used more processing than expected and was stopped. Please try again with shorter documents.");
    }
  };
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Send the promise and letter as form fields (promiseText/letterText or a file upload)." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const promiseText = String(form.get("promiseText") || "").slice(0, MAX_TEXT);
    const letterText = String(form.get("letterText") || "").slice(0, MAX_TEXT);
    const promiseImage = form.get("promiseImage");
    const promisePdf = form.get("promisePdf");
    const letterPdf = form.get("letterPdf");

    const promiseImgUrl = promiseImage instanceof File && promiseImage.size > 0 ? await fileToDataUrl(promiseImage) : null;
    const promisePdfB64 = promisePdf instanceof File && promisePdf.size > 0 ? await fileToB64(promisePdf) : null;
    const letterPdfB64 = letterPdf instanceof File && letterPdf.size > 0 ? await fileToB64(letterPdf) : null;

    // Validate uploads before any paid call.
    const MAX_BYTES = 4 * 1024 * 1024;
    if (promiseImage instanceof File && promiseImage.size > 0) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(promiseImage.type)) return NextResponse.json({ error: "Screenshot must be a PNG, JPEG or WebP image." }, { status: 400 });
      if (promiseImage.size > MAX_BYTES) return NextResponse.json({ error: "Screenshot is too large (4 MB max)." }, { status: 400 });
    }
    for (const f of [promisePdf, letterPdf]) {
      if (f instanceof File && f.size > 0) {
        if (f.type !== "application/pdf") return NextResponse.json({ error: "Letter upload must be a PDF file." }, { status: 400 });
        if (f.size > MAX_BYTES) return NextResponse.json({ error: "PDF is too large (4 MB max)." }, { status: 400 });
      }
    }

    const hasPromise = promiseText.trim() || promiseImgUrl || promisePdfB64;
    const hasLetter = letterText.trim() || letterPdfB64;
    if (!hasPromise || !hasLetter) {
      return NextResponse.json({ error: "Both sides are needed: what was promised, and the offer letter." }, { status: 400 });
    }

    // Reserve the worst-case cost of this run against the daily budget
    // before any paid call; reconciled to actual spend in the finally below.
    const reservation = await reserveDaily();
    if (!reservation.ok) {
      return NextResponse.json({ error: reservation.error }, { status: reservation.status, headers: { "Cache-Control": "no-store" } });
    }
    reservationKey = reservation.dayKey;

    // 1. Guard text inputs (fail-closed). Image input is guarded as an image.
    if (promiseText.trim()) {
      const g = await clocked("injection", { text: promiseText }); track(g);
      if (g.data?.verdict !== "benign") return NextResponse.json({ error: "The promise text looks like it contains injected instructions. Please paste only the conversation." }, { status: 422 });
    }
    if (letterText.trim()) {
      const g = await clocked("injection", { text: letterText }); track(g);
      if (g.data?.verdict !== "benign") return NextResponse.json({ error: "The letter text looks like it contains injected instructions. Please paste only the letter." }, { status: 422 });
    }

    // 2. Extract the same fields from both sides.
    const promiseReq: Record<string, any> = { fields: fieldsPayload(), instructions: PROMISE_INSTRUCTIONS };
    if (promiseImgUrl) promiseReq.images = [promiseImgUrl];
    else if (promisePdfB64) promiseReq.pdf = promisePdfB64;
    else promiseReq.text = promiseText;
    const letterReq: Record<string, any> = { fields: fieldsPayload(), instructions: LETTER_INSTRUCTIONS };
    if (letterPdfB64) letterReq.pdf = letterPdfB64;
    else letterReq.text = letterText;

    const pe = await clocked("extract", promiseReq); track(pe);
    const le = await clocked("extract", letterReq); track(le);
    const pFields = extractValues(pe.data);
    const lFields = extractValues(le.data);

    // Guard the extracted values from image/PDF inputs - this is the text that
    // actually enters the downstream prompts (image-modality guard false-positives
    // on ordinary chat screenshots).
    if (promiseImgUrl || promisePdfB64 || letterPdfB64) {
      const joined = [...Object.values(pFields), ...Object.values(lFields)].filter(Boolean).join("\n");
      if (joined) {
        const g = await clocked("injection", { text: joined }); track(g);
        if (g.data?.verdict !== "benign") return NextResponse.json({ error: "The uploaded file looks like it contains injected instructions. Please check the file and try again." }, { status: 422 });
      }
    }

    // 3. Per-field comparison.
    const conflicts: any[] = [];
    const notInLetter: any[] = [];
    const newInLetter: any[] = [];
    const agreed: string[] = [];
    for (const [key, meta] of Object.entries(FIELDS)) {
      const pv = normVal(pFields[key]);
      const lv = normVal(lFields[key]);
      if (pv && !lv) { notInLetter.push({ field: meta.label, promised: pv }); continue; }
      if (!pv && lv) { newInLetter.push({ field: meta.label, stated: lv }); continue; }
      if (!pv && !lv) continue;
      const cr = await clocked("compare", {
        documents: [
          { id: "promise", text: `What the recruiter promised about ${meta.label}: "${pv}"` },
          { id: "letter", text: `What the formal offer letter states about ${meta.label}: "${lv}"` },
        ],
        instructions: `Decide whether what the recruiter promised about ${meta.label} conflicts with what the offer letter states. A real difference in amount, date, place, duration or obligation is a conflict. A condition or contingency that weakens an otherwise matching value (for example 'may be revised', 'subject to change', 'up to', 'if applicable' on one side but not the other) is also a conflict. Pure wording-only differences are not. Quote both sides exactly.`,
        evidence: "all",
      });
      track(cr);
      const found: any[] = [];
      for (const pair of cr.data?.pairs || []) {
        for (const cn of pair.conflicts || []) {
          if ((cn.confidence ?? 0) < 0.5) continue;
          const a = cn.a?.document === "promise" ? cn.a : cn.b;
          const b = cn.b?.document === "letter" ? cn.b : cn.a;
          if (!a?.quote || !b?.quote) continue;
          found.push({ promiseQuote: a.quote, letterQuote: b.quote, score: cn.confidence });
        }
      }
      if (found.length === 0) { agreed.push(meta.label); continue; }
      // One conflict per field: the compare call can double-report the same
      // semantic conflict with slightly different quote spans - keep the
      // highest-confidence one.
      found.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      conflicts.push({ field: meta.label, fieldKey: key, promised: pv, stated: lv, ...found[0] });
    }

    // 4. Rank conflicts (money / job security first).
    let ranked = conflicts;
    if (conflicts.length > 1) {
      const rr = await clocked("rerank", {
        query: "Which of these changes costs the employee the most money, time or job security?",
        documents: conflicts.map((c, i) => ({ id: `c${i}`, text: `${c.field}: promised "${c.promised}", letter states "${c.stated}".` })),
        top_n: conflicts.length,
      });
      track(rr);
      const order = (rr.data?.results || []).map((r: any) => Number(String(r.id).slice(1))).filter((n: number) => Number.isInteger(n) && n >= 0 && n < conflicts.length);
      if (order.length === conflicts.length) ranked = order.map((i: number) => conflicts[i]);
    }

    // 5. Verify each side's quote against its own source (cap at 8 conflicts).
    const capped = ranked.slice(0, 8);
    for (const c of capped) {
      // Deterministic verbatim check: is the displayed value a literal substring
      // of the pasted source text? (null = source was a file upload, no raw text)
      c.promiseExact = promiseText.trim() ? promiseText.includes(c.promised) : null;
      c.letterExact = letterText.trim() ? letterText.includes(c.stated) : null;
      const pClaim = `The recruiter promised about ${c.field}: "${c.promised}"`;
      const lClaim = `The offer letter states about ${c.field}: "${c.stated}"`;
      const pSrc: Record<string, any> = promiseImgUrl
        ? { images: [promiseImgUrl] }
        : promiseText.trim()
          ? { documents: [{ id: "promise", text: promiseText }] }
          : { pdf: promisePdfB64 };
      const lSrc: Record<string, any> = letterText.trim()
        ? { documents: [{ id: "letter", text: letterText }] }
        : { pdf: letterPdfB64 };
      try {
        const gp = await clocked("grounding", { ...pSrc, answer: pClaim, evidence: "none" }); track(gp);
        const cp = gp.data?.claims?.[0];
        c.promiseGrounded = cp ? { verdict: cp.verdict, supported: cp.supported } : null;
      } catch { c.promiseGrounded = null; }
      try {
        const gl = await clocked("grounding", { ...lSrc, answer: lClaim, evidence: "none" }); track(gl);
        const cl = gl.data?.claims?.[0];
        c.letterGrounded = cl ? { verdict: cl.verdict, supported: cl.supported } : null;
      } catch { c.letterGrounded = null; }
    }

    // 6. Build the report, then mask personal details for sharing.
    const lines: string[] = ["Promise vs Letter - conflict report", ""];
    capped.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.field}: promised "${c.promised}" - letter states "${c.stated}".`);
    });
    notInLetter.forEach((n) => lines.push(`- Not in the letter: ${n.field} was promised ("${n.promised}") but the letter does not mention it.`));
    newInLetter.forEach((n) => lines.push(`- New in the letter: ${n.field} ("${n.stated}") appears only in the letter.`));
    if (capped.length === 0 && notInLetter.length === 0 && newInLetter.length === 0) lines.push("No conflicts detected between the two documents.");
    lines.push("", "Detected items only - a 'not detected' result does not prove a term is fair or absent. Review the original documents.");
    const report = lines.join("\n");

    let maskedReport = report;
    let maskedEntities: Record<string, number> = {};
    try {
      const pr = await clocked("pii", { text: report }); track(pr);
      const entities = (pr.data?.entities || []).slice().sort((a: any, b: any) => (b.start ?? 0) - (a.start ?? 0));
      maskedReport = report;
      for (const e of entities) {
        if (typeof e.start === "number" && typeof e.end === "number" && e.end > e.start) {
          maskedReport = maskedReport.slice(0, e.start) + "[" + (e.type || "redacted") + "]" + maskedReport.slice(e.end);
        }
      }
      for (const e of entities) maskedEntities[e.type || "unknown"] = (maskedEntities[e.type || "unknown"] || 0) + 1;
    } catch { /* masking optional; report stays unshared */ }

    return NextResponse.json({
      conflicts: capped,
      overflowConflicts: ranked.length - capped.length,
      notInLetter,
      newInLetter,
      agreed,
      report,
      maskedReport,
      maskedEntities,
      creditsUsed: totalCredits,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Comparison failed." }, { status: 502 });
  } finally {
    if (reservationKey) await settleReservation(reservationKey, totalCredits);
  }
}
