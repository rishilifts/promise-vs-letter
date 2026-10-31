// Shared abuse limits for the public deployment.
//
// Backend: a Google Apps Script web app (APPS_SCRIPT_LIMITS_URL). Every
// counter mutation is one POST; the script serializes ALL mutations with
// LockService.getScriptLock() and stores state in ScriptProperties, so
// check-and-reserve is genuinely atomic across instances with no
// read-modify-write race (Netlify Blobs conditional writes were verified
// not honored on 2026-10-31 and are no longer used). Any error or timeout
// from the limiter fails CLOSED (the request is rejected). Off-Netlify
// (local dev/tests) an in-memory store with the same semantics is used.
//
// Cross-process proof (2026-10-31, real web app, 0 Clocked calls):
// 3 processes x 8 concurrent reserves at cap 800/reserve 200 admitted
// exactly 4 (reserved=800); settle 4x59 reconciled to reserved=0/used=236;
// 8 concurrent per-IP counts admitted exactly 5 (hourly max).
//
// Client IP: Netlify sets x-nf-client-connection-ip at the edge and strips
// client-supplied values, so it is preferred over the spoofable
// x-forwarded-for.
//
// Daily budget: reserving WORST_CASE_RUN_CREDITS is atomic with the budget
// check, so granted reservations can never push used+reserved over the cap,
// and every reservation is reconciled to actual spend afterwards. Reset
// boundary is the UTC calendar day. The reservation is a real upper bound
// for a run: measured full runs were 59 credits (text), 44-51 (PDF) and 97
// (image) on 2026-10-31, and the route additionally aborts any run that
// exceeds the reservation mid-flight, so per-run overshoot is at most one
// call. Inputs are capped (20k chars text, 4 MB files) to bound call cost.
//
// Hard backstop below all of this: the Clocked account is a free trial with
// overage disabled and no payment method, so spend can never cost money.

export const PER_IP_MAX_RUNS = 5;
export const DAILY_CREDIT_CAP = Number(process.env.PUBLIC_DAILY_CREDIT_CAP || 800);
export const WORST_CASE_RUN_CREDITS = 200;

const LIMITS_URL = process.env.APPS_SCRIPT_LIMITS_URL || "";
const LIMITS_SECRET = process.env.APPS_SCRIPT_LIMITS_SECRET || "";
const FETCH_TIMEOUT_MS = 10000;

type DayDoc = { reserved: number; used: number };
type LimitResultOk = { ok: true; dayKey: string };
export type LimitResult = LimitResultOk | { ok: false; status: number; error: string };

const dayKey = (now: Date) => `day-${now.toISOString().slice(0, 10)}`;

// ---- Apps Script backend ---------------------------------------------------

// One serialized action per call. Returns the script's JSON body, or null on
// any network/parse failure (callers fail closed).
async function gasCall(payload: Record<string, unknown>): Promise<any | null> {
  if (!LIMITS_URL || !LIMITS_SECRET) return null;
  try {
    const res = await fetch(LIMITS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret: LIMITS_SECRET }),
      redirect: "follow", // 302 to script.googleusercontent.com becomes GET per spec
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    return await res.json();
  } catch {
    return null;
  }
}

// ---- in-memory backend (local dev/tests only) ------------------------------

class MemoryStore {
  private days = new Map<string, DayDoc>();
  private ips = new Map<string, number>();
  // each method runs to completion synchronously: atomic across async callers
  perip(key: string): boolean {
    const c = this.ips.get(key) || 0;
    if (c >= PER_IP_MAX_RUNS) return false;
    this.ips.set(key, c + 1);
    return true;
  }
  reserve(key: string): boolean {
    const d = this.days.get(key) || { reserved: 0, used: 0 };
    if (d.used + d.reserved + WORST_CASE_RUN_CREDITS > DAILY_CREDIT_CAP) return false;
    d.reserved += WORST_CASE_RUN_CREDITS;
    this.days.set(key, d);
    return true;
  }
  settle(key: string, credits: number): void {
    const d = this.days.get(key) || { reserved: 0, used: 0 };
    d.reserved = Math.max(0, d.reserved - WORST_CASE_RUN_CREDITS);
    d.used += Math.max(0, credits);
    this.days.set(key, d);
  }
  read(key: string): DayDoc | null {
    return this.days.get(key) ?? null;
  }
}
const mem = new MemoryStore();
const useGas = () => process.env.NETLIFY === "true" || (!!LIMITS_URL && !!LIMITS_SECRET);

// ---- public API ------------------------------------------------------------

export function clientIp(headers: Headers): string {
  const nf = headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

const unavailable = (): LimitResult => ({ ok: false, status: 503, error: "Service temporarily unavailable." });

// Counts one attempt against the per-IP hourly window. Call for every
// request, including ones that fail validation.
export async function checkPerIp(ip: string, now = new Date()): Promise<LimitResult> {
  if (useGas()) {
    const r = await gasCall({ action: "perip", ip });
    if (!r) return unavailable();
    if (r.ok) return { ok: true, dayKey: dayKey(now) };
    return { ok: false, status: r.status || 429, error: r.error || "Too many checks from this connection - please try again in about an hour." };
  }
  const key = `ip-${ip}-${now.toISOString().slice(0, 13)}`;
  return mem.perip(key) ? { ok: true, dayKey: dayKey(now) } : { ok: false, status: 429, error: "Too many checks from this connection - please try again in about an hour." };
}

// Atomically checks the daily budget and reserves the worst-case run cost.
// Call only after validation; reconcile with settleReservation.
export async function reserveDaily(now = new Date()): Promise<LimitResult> {
  if (useGas()) {
    const r = await gasCall({ action: "reserve" });
    if (!r) return unavailable();
    if (r.ok) return { ok: true, dayKey: r.dayKey || dayKey(now) };
    return { ok: false, status: r.status || 429, error: r.error || "The public demo's daily limit is reached - it protects a finite free API budget. Please try again tomorrow." };
  }
  const key = dayKey(now);
  return mem.reserve(key) ? { ok: true, dayKey: key } : { ok: false, status: 429, error: "The public demo's daily limit is reached - it protects a finite free API budget. Please try again tomorrow." };
}

export async function settleReservation(key: string, actualCredits: number): Promise<void> {
  if (useGas()) {
    await gasCall({ action: "settle", dayKey: key, credits: actualCredits });
    // A failed settle leaves the reservation in place until the UTC day
    // resets, which fails safe (tighter budget).
    return;
  }
  mem.settle(key, actualCredits);
}

// Test-only: read the raw counters.
export async function debugRead(key: string): Promise<any> {
  if (useGas()) return (await gasCall({ action: "read" }))?.day ?? null;
  return mem.read(key);
}
