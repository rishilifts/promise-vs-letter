import { getStore, type Store } from "@netlify/blobs";

// Shared abuse limits for the public deployment.
//
// Backing mechanism: Netlify Blobs (strong consistency), so counters persist
// across serverless instances and restarts. On Netlify, if the blob store is
// unavailable the limiter fails CLOSED (503) rather than falling back to
// per-instance memory. Off Netlify (local dev) it uses in-memory state.
//
// Client IP: Netlify sets x-nf-client-connection-ip at the edge and strips
// client-supplied values, so it is preferred over the spoofable
// x-forwarded-for.
//
// Daily budget: a pre-reservation of WORST_CASE_RUN_CREDITS is taken before
// any paid API call and reconciled to the actual spend afterwards, so
// concurrent runs cannot collectively exceed the cap through the normal
// path. Reset boundary is the UTC calendar day. Blob writes are not
// transactional, so a simultaneous burst can overshoot by at most
// (in-flight reservations x worst case); the hard backstop below that is the
// Clocked account itself: free trial with overage disabled, so spend can
// never exceed the remaining trial credits and can never cost money.
//
// Worst case per run (route makes up to 31 paid calls; a full text run was
// measured at 59 credits on 2026-10-31): 200 credits reservation.

export const PER_IP_MAX_RUNS = 5;
export const DAILY_CREDIT_CAP = Number(process.env.PUBLIC_DAILY_CREDIT_CAP || 800);
export const WORST_CASE_RUN_CREDITS = 200;

type DayDoc = { reserved: number; used: number };
type IpDoc = { count: number };

const mem = { day: new Map<string, DayDoc>(), ip: new Map<string, IpDoc>() };

function store(): Store | null {
  try {
    return getStore({ name: "public-limits", consistency: "strong" });
  } catch {
    return null;
  }
}

const onNetlify = () => process.env.NETLIFY === "true";

async function getDay(s: Store | null, key: string): Promise<DayDoc> {
  if (s) return ((await s.get(key, { type: "json" })) as DayDoc) || { reserved: 0, used: 0 };
  return mem.day.get(key) || { reserved: 0, used: 0 };
}
async function setDay(s: Store | null, key: string, d: DayDoc) {
  if (s) await s.setJSON(key, d);
  else mem.day.set(key, d);
}
async function getIp(s: Store | null, key: string): Promise<IpDoc> {
  if (s) return ((await s.get(key, { type: "json" })) as IpDoc) || { count: 0 };
  return mem.ip.get(key) || { count: 0 };
}
async function setIp(s: Store | null, key: string, d: IpDoc) {
  if (s) await s.setJSON(key, d);
  else mem.ip.set(key, d);
}

export function clientIp(headers: Headers): string {
  const nf = headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

const clean = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 120);
const dayKey = (now: Date) => `day-${now.toISOString().slice(0, 10)}`;
const ipKey = (ip: string, now: Date) => `ip-${clean(ip)}-${now.toISOString().slice(0, 13)}`;

export type LimitResult =
  | { ok: true; dayKey: string }
  | { ok: false; status: number; error: string };

// Counts one attempt against the per-IP hourly window. Call for every
// request, including ones that fail validation.
export async function checkPerIp(ip: string, now = new Date()): Promise<LimitResult> {
  const s = store();
  if (!s && onNetlify()) return { ok: false, status: 503, error: "Service temporarily unavailable." };
  const key = ipKey(ip, now);
  const cur = await getIp(s, key);
  if (cur.count >= PER_IP_MAX_RUNS) {
    return { ok: false, status: 429, error: "Too many checks from this connection - please try again in about an hour." };
  }
  await setIp(s, key, { count: cur.count + 1 });
  return { ok: true, dayKey: dayKey(now) };
}

// Reserves the worst-case run cost against the daily budget. Call only after
// the request has passed validation; reconcile with settleReservation.
export async function reserveDaily(now = new Date()): Promise<LimitResult> {
  const s = store();
  if (!s && onNetlify()) return { ok: false, status: 503, error: "Service temporarily unavailable." };
  const key = dayKey(now);
  const cur = await getDay(s, key);
  if (cur.used + cur.reserved + WORST_CASE_RUN_CREDITS > DAILY_CREDIT_CAP) {
    return { ok: false, status: 429, error: "The public demo's daily limit is reached - it protects a finite free API budget. Please try again tomorrow." };
  }
  await setDay(s, key, { reserved: cur.reserved + WORST_CASE_RUN_CREDITS, used: cur.used });
  return { ok: true, dayKey: key };
}

export async function settleReservation(key: string, actualCredits: number): Promise<void> {
  const s = store();
  try {
    const cur = await getDay(s, key);
    await setDay(s, key, {
      reserved: Math.max(0, cur.reserved - WORST_CASE_RUN_CREDITS),
      used: cur.used + Math.max(0, actualCredits),
    });
  } catch {
    // Reconciliation is best-effort; a lost settle leaves the reservation in
    // place until the UTC day resets, which fails safe (tighter budget).
  }
}
