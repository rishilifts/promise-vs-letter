"use client";

import { useEffect, useState } from "react";
import { SAMPLE, SAMPLE_LABEL } from "./sampleData";

type Side = { mode: "text" | "image" | "pdf"; text: string; file: File | null };

const EXAMPLE_PROMISE = `Priya (HR, TechNova Solutions) on WhatsApp:
"Hi Amit! Great news - selected for Junior Analyst."
"Stipend: Rs 15,000/month, no fees or deposit."
"Joining: 5 Jan 2026, Bengaluru office."
"3 months training, then permanent role."
"Offer letter will match everything discussed here."`;

const EXAMPLE_LETTER = `TechNova Solutions Pvt. Ltd. - Offer Letter
Date: 28 Dec 2025

Dear Amit Kumar,
We are pleased to offer you the position of Support Associate at TechNova Solutions.
Stipend: Rs 9,000 per month during the training period of 6 months.
A refundable security deposit of Rs 2,000 will be collected on joining.
Date of joining: 1 February 2026, Hyderabad office.
Notice period: 3 months from either side.
This letter supersedes all prior verbal or written commitments.

Sincerely,
Priya Sharma, HR Manager`;

function GroundBadge({ g, who }: { g: any; who: string }) {
  if (!g) return <span className="badge warn">{who}: model check unavailable</span>;
  if (g.verdict === "supported")
    return <span className="badge">{who}: model check says supported by source</span>;
  return <span className="badge warn">{who}: model check says {g.verdict}</span>;
}

function ExactBadge({ exact, who }: { exact: boolean | null; who: string }) {
  if (exact === true) return <span className="badge ok">{who}: exact substring of your pasted text</span>;
  if (exact === false) return <span className="badge warn">{who}: model-extracted value, not a verbatim substring</span>;
  return <span className="badge">{who}: from file upload, no verbatim check</span>;
}

function Results({ r, sample }: { r: any; sample?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {sample && <div className="sample-banner">{SAMPLE_LABEL}</div>}
      <div className="summary">
        <div>
          <div className="big">{r.conflicts.length}</div>
          <div className="lbl">conflicts detected</div>
        </div>
        <div>
          <div className="big">{r.notInLetter.length + r.newInLetter.length}</div>
          <div className="lbl">one-sided terms</div>
        </div>
        {r.creditsUsed != null && (
          <div>
            <div className="big">{r.creditsUsed}</div>
            <div className="lbl">Clocked credits</div>
          </div>
        )}
      </div>

      <div className="steps" style={{ marginBottom: 18 }}>
        Only these terms are checked: salary/stipend, fees/deposit, role/title, joining date, work location,
        training/probation, notice period. Any other term in the documents is not compared.
      </div>

      {r.conflicts.map((c: any, i: number) => (
        <div className="diffrow" key={i}>
          <div className="field">Detected difference {i + 1} · {c.field}</div>
          <div className="vs">
            <div className="side promise">
              <span className="who">Promised</span>
              {c.promised}
            </div>
            <div className="side letter">
              <span className="who">Offer letter</span>
              {c.stated}
            </div>
          </div>
          <div className="badges">
            <ExactBadge exact={c.promiseExact ?? null} who="promise line" />
            <ExactBadge exact={c.letterExact ?? null} who="letter line" />
            <GroundBadge g={c.promiseGrounded} who="promise side" />
            <GroundBadge g={c.letterGrounded} who="letter side" />
          </div>
          <div className="diag">diagnostic scores (uncalibrated model outputs): match {(c.score ?? 0).toFixed(3)}, promise support {(c.promiseGrounded?.supported ?? 0).toFixed(3)}, letter support {(c.letterGrounded?.supported ?? 0).toFixed(3)}</div>
        </div>
      ))}
      {r.overflowConflicts > 0 && (
        <div className="note">{r.overflowConflicts} further lower-ranked conflict(s) were detected but not shown (display cap of 8).</div>
      )}

      {(r.notInLetter.length > 0 || r.newInLetter.length > 0) && (
        <div className="list-block">
          <h3>One-sided terms</h3>
          <ul>
            {r.notInLetter.map((n: any, i: number) => (
              <li key={`p${i}`}><strong>{n.field}</strong> was promised (&quot;{n.promised}&quot;) but the letter does not mention it.</li>
            ))}
            {r.newInLetter.map((n: any, i: number) => (
              <li key={`l${i}`}><strong>{n.field}</strong> (&quot;{n.stated}&quot;) appears only in the letter - it was not in the promise.</li>
            ))}
          </ul>
        </div>
      )}

      {r.conflicts.length === 0 && r.notInLetter.length === 0 && r.newInLetter.length === 0 && (
        <div className="list-block">No conflicts detected between the two documents. This does not prove the letter is fair - only that no difference was detected.</div>
      )}

      <h3 style={{ margin: "26px 0 8px" }}>Shareable report</h3>
      <div className="steps" style={{ marginBottom: 8 }}>
        {Object.keys(r.maskedEntities || {}).length > 0
          ? `Personal details found in the report were masked: ${Object.entries(r.maskedEntities).map(([k, v]) => `${v} ${k}`).join(", ")}. Check the text yourself before sharing - masking is a model pass, not a guarantee.`
          : "No personal details were detected in this report text. Check it yourself before sharing - absence of a detection is not proof of absence."}
      </div>
      <div className="report">{r.maskedReport}</div>
      <div className="actions">
        <button
          className="ghost"
          onClick={() => {
            navigator.clipboard.writeText(r.maskedReport).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy report"}
        </button>
        {Object.keys(r.maskedEntities || {}).length > 0 && (
          <span className="steps">masked: {Object.entries(r.maskedEntities).map(([k, v]) => `${v} ${k}`).join(", ")}</span>
        )}
      </div>

      <div className="note">
        Detected items only: a &quot;not detected&quot; result does not prove a term is fair, present or absent. Scores are uncalibrated model
        scores, not certainties. Nothing here is legal advice - review the original documents before you act.
      </div>
    </div>
  );
}

export default function Home() {
  const [promise, setPromise] = useState<Side>({ mode: "text", text: "", file: null });
  const [letter, setLetter] = useState<Side>({ mode: "text", text: "", file: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [sampleMode, setSampleMode] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("sample") === "1" && SAMPLE) {
      setSampleMode(true);
    }
  }, []);

  const canRun =
    (promise.text.trim() || promise.file) && (letter.text.trim() || letter.file) && !busy;

  function panel(side: Side, setSide: (s: Side) => void, title: string, hint: string, modes: { key: Side["mode"]; label: string }[]) {
    return (
      <div className="panel">
        <h2>{title}</h2>
        <p className="hint">{hint}</p>
        <div className="tabs">
          {modes.map((m) => (
            <button key={m.key} className={`tab ${side.mode === m.key ? "active" : ""}`} onClick={() => setSide({ ...side, mode: m.key })}>
              {m.label}
            </button>
          ))}
        </div>
        {side.mode === "text" ? (
          <textarea
            placeholder={title.startsWith("What was promised") ? "Paste the recruiter's chat messages or your notes here..." : "Paste the offer letter text here..."}
            value={side.text}
            onChange={(e) => setSide({ ...side, text: e.target.value })}
          />
        ) : (
          <label className="drop">
            {side.file ? <>File selected<span className="fname">{side.file.name}</span></> : side.mode === "image" ? "Choose a screenshot (PNG / JPG / WebP)" : "Choose the letter PDF"}
            <input
              type="file"
              hidden
              accept={side.mode === "image" ? "image/png,image/jpeg,image/webp" : "application/pdf"}
              onChange={(e) => setSide({ ...side, file: e.target.files?.[0] || null })}
            />
          </label>
        )}
      </div>
    );
  }

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      if (promise.mode === "text") fd.set("promiseText", promise.text);
      else if (promise.mode === "image" && promise.file) fd.set("promiseImage", promise.file);
      else if (promise.mode === "pdf" && promise.file) fd.set("promisePdf", promise.file);
      if (letter.mode === "text") fd.set("letterText", letter.text);
      else if (letter.mode === "pdf" && letter.file) fd.set("letterPdf", letter.file);
      const res = await fetch("/api/compare", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Comparison failed.");
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <div className="eyebrow">Clocked Build Challenge</div>
      <h1>Promise vs Letter</h1>
      <p className="sub">
        The recruiter promised one thing in chat. The offer letter says another. Paste both - detected differences are shown with the lines the model extracted from each side, checked against
        their source, and string-matched when you paste text.
      </p>

      {!sampleMode && (
        <>
          <div className="panels">
            {panel(promise, setPromise, "What was promised", "Chat messages, email or your own notes about the offer.", [
              { key: "text", label: "Paste text" },
              { key: "image", label: "Screenshot" },
              { key: "pdf", label: "PDF" },
            ])}
            {panel(letter, setLetter, "The offer letter", "The formal letter or contract you received.", [
              { key: "text", label: "Paste text" },
              { key: "pdf", label: "PDF" },
            ])}
          </div>
          <div className="actions">
            <button className="primary" disabled={!canRun} onClick={run}>
              {busy ? <><span className="spin" />Comparing...</> : "Find the conflicts"}
            </button>
            <button
              className="ghost"
              onClick={() => {
                setPromise({ ...promise, mode: "text", text: EXAMPLE_PROMISE, file: null });
                setLetter({ ...letter, mode: "text", text: EXAMPLE_LETTER, file: null });
              }}
            >
              Load synthetic example
            </button>
          </div>
          {busy && <p className="steps">guard &rarr; extract &rarr; compare &rarr; rank &rarr; verify quotes &rarr; mask report</p>}
          {error && <div className="err">{error}</div>}
          {result && <Results r={result} />}
        </>
      )}
      {sampleMode && SAMPLE && <Results r={SAMPLE} sample />}

      <div className="foot">
        Everything you paste or upload is sent to the Clocked API (Rezolve AI) for processing; their data retention is unknown to us -
        do not upload documents you cannot share with a third party. Only the 7 terms listed above are checked; scores are uncalibrated
        model outputs; detections are model findings, not proof. Example data is synthetic.
      </div>
    </main>
  );
}
