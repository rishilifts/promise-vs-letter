import { NextRequest, NextResponse } from "next/server";

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
  salary: { label: "Salary / stipend", description: "salary, stipend, CTC or pay amount with its period" },
  fees: { label: "Fees / deposit", description: "any fee, deposit or payment the candidate must make, or an explicit statement that none is required" },
  joining_date: { label: "Joining date", description: "joining or start date" },
  location: { label: "Work location", description: "work location or office city" },
  role: { label: "Role / title", description: "job title or role" },
  training: { label: "Training / probation", description: "training or probation duration and what happens after it" },
  notice: { label: "Notice period", description: "notice period, bond or exit terms" },
  benefits: { label: "Other benefits", description: "other material benefits or promises (accommodation, bonus, laptop, visa, etc.)" },
};

const PROMISE_INSTRUCTIONS =
  "These are messages or notes recording what a recruiter promised a candidate about a job. Extract exactly what was promised, verbatim where possible. Leave any field that is not mentioned empty.";
const LETTER_INSTRUCTIONS =
  "This is a formal offer letter or contract. Extract exactly what the document states, verbatim where possible. Leave any field that is not mentioned empty.";

function fieldsPayload() {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(FIELDS)) out[k] = v.description;
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

export async function POST(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "Server is not configured (missing API key)." }, { status: 500 });
  let totalCredits = 0;
  const track = (r: ClockResult) => { totalCredits += r.credits || 0; };
  try {
    const form = await req.formData();
    const promiseText = String(form.get("promiseText") || "").slice(0, MAX_TEXT);
    const letterText = String(form.get("letterText") || "").slice(0, MAX_TEXT);
    const promiseImage = form.get("promiseImage");
    const promisePdf = form.get("promisePdf");
    const letterPdf = form.get("letterPdf");

    const promiseImgUrl = promiseImage instanceof File && promiseImage.size > 0 ? await fileToDataUrl(promiseImage) : null;
    const promisePdfB64 = promisePdf instanceof File && promisePdf.size > 0 ? await fileToB64(promisePdf) : null;
    const letterPdfB64 = letterPdf instanceof File && letterPdf.size > 0 ? await fileToB64(letterPdf) : null;

    const hasPromise = promiseText.trim() || promiseImgUrl || promisePdfB64;
    const hasLetter = letterText.trim() || letterPdfB64;
    if (!hasPromise || !hasLetter) {
      return NextResponse.json({ error: "Both sides are needed: what was promised, and the offer letter." }, { status: 400 });
    }

    // 1. Guard text inputs (fail-closed). Image input is guarded as an image.
    if (promiseText.trim()) {
      const g = await clocked("injection", { text: promiseText }); track(g);
      if (g.data?.verdict !== "benign") return NextResponse.json({ error: "The promise text looks like it contains injected instructions. Please paste only the conversation." }, { status: 422 });
    }
    if (letterText.trim()) {
      const g = await clocked("injection", { text: letterText }); track(g);
      if (g.data?.verdict !== "benign") return NextResponse.json({ error: "The letter text looks like it contains injected instructions. Please paste only the letter." }, { status: 422 });
    }
    if (promiseImgUrl) {
      const g = await clocked("injection", { images: [promiseImgUrl] }); track(g);
      if (g.data?.verdict !== "benign") return NextResponse.json({ error: "The screenshot looks like it contains injected instructions." }, { status: 422 });
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
    const pFields = pe.data?.result || {};
    const lFields = le.data?.result || {};

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
        instructions: `Decide whether what the recruiter promised about ${meta.label} conflicts with what the offer letter states. A real difference in amount, date, place, duration or obligation is a conflict; wording-only differences are not. Quote both sides exactly.`,
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
      for (const f of found) {
        conflicts.push({ field: meta.label, fieldKey: key, promised: pv, stated: lv, ...f });
      }
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Comparison failed." }, { status: 502 });
  }
}
