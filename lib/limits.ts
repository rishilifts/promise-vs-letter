import { getStore, type Store } from "@netlify/blobs";

// Shared abuse limits for the public deployment.
//
// Atomicity: all counter updates are compare-and-swap against Netlify Blobs
// (strong-consistency read of value+etag, conditional write with onlyIfMatch /
// onlyIfNew, retry on conflict). No read-modify-write races: two concurrent
// writers cannot both succeed on the same etag, so no lost updates and the
// daily budget check-and-reserve is a single atomic step. Sustained
// contention or a store error fails CLOSED (the request is rejected), never
// falls back to per-instance memory on Netlify. The in-memory store below
// implements the same CAS semantics and is used only off-Netlify (local dev
// and tests).
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

const STORE_NAME = process.env.LIMITS_STORE_NAME || "public-limits";
const RETRIES = 8;

type DayDoc = { reserved: number; used: number };
type IpDoc = { count: number };

// ---- store access ---------------------------------------------------------

interface CasStore {
  getJson(key: string): Promise<{ data: any; etag?: string } | null>;
  setJson(key: string, data: unknown, onlyIfMatch?: string, onlyIfNew?: boolean): Promise<boolean>;
}

class MemoryStore implements CasStore {
  private map = new Map<string, { data: string; etag: string }>();
  async getJson(key: string) {
    const e = this.map.get(key);
    return e ? { data: JSON.parse(e.data), etag: e.etag } : null;
  }
  // check-and-set runs to completion synchronously, so it is atomic across
  // async callers - the same semantics the real backend provides per write.
  async setJson(key: string, data: unknown, onlyIfMatch?: string, onlyIfNew?: boolean) {
    const cur = this.map.get(key);
    if (onlyIfNew && cur) return false;
    if (onlyIfMatch !== undefined && (!cur || cur.etag !== onlyIfMatch)) return false;
    this.map.set(key, { data: JSON.stringify(data), etag: crypto.randomUUID() });
    return true;
  }
}

class BlobsStore implements CasStore {
  constructor(private s: Store) {}
  async getJson(key: string) {
    const r = await this.s.getWithMetadata(key, { type: "json", consistency: "strong" });
    return r ? { data: r.data, etag: r.etag } : null;
  }
  async setJson(key: string, data: unknown, onlyIfMatch?: string, onlyIfNew?: boolean) {
    const opts = onlyIfMatch !== undefined ? { onlyIfMatch } : onlyIfNew ? { onlyIfNew: true } : {};
    const wr = await this.s.setJSON(key, data, opts as any);
    if (!wr.modified) return false;
    // The SDK reports modified:true for ANY non-412 status when conditions
    // are set, so verify the write really landed before trusting it.
    const check = await this.getJson(key);
    return !!check && JSON.stringify(check.data) === JSON.stringify(data);
  }
}

const memStores = new Map<string, MemoryStore>();
const blobStores = new Map<string, CasStore | null>();

function store(name?: string): CasStore | null {
  const storeName = name || STORE_NAME;
  const hit = blobStores.get(storeName);
  if (hit !== undefined) return hit;
  let s: CasStore | null;
  try {
    const opts: Record<string, any> = { name: storeName, consistency: "strong" };
    if (process.env.NETLIFY_BLOBS_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
      opts.siteID = process.env.NETLIFY_BLOBS_SITE_ID;
      opts.token = process.env.NETLIFY_BLOBS_TOKEN;
    }
    s = new BlobsStore(getStore(opts as any));
  } catch {
    if (process.env.NETLIFY === "true") {
      s = null;
    } else {
      let m = memStores.get(storeName);
      if (!m) { m = new MemoryStore(); memStores.set(storeName, m); }
      s = m;
    }
  }
  blobStores.set(storeName, s);
  return s;
}

const onNetlify = () => process.env.NETLIFY === "true";

// ---- atomic update helper -------------------------------------------------

type Outcome = "ok" | "rejected" | "unavailable";

async function casUpdate<T>(key: string, init: T, fn: (cur: T) => T | null, storeName?: string): Promise<Outcome> {
  const s = store(storeName);
  if (!s) return "unavailable";
  for (let i = 0; i < RETRIES; i++) {
    let cur: T, etag: string | undefined;
    try {
      const res = await s.getJson(key);
      cur = res ? (res.data as T) : init;
      etag = res?.etag;
    } catch {
      return "unavailable";
    }
    const next = fn(cur);
    if (next === null) return "rejected";
    try {
      const ok = etag !== undefined ? await s.setJson(key, next, etag) : await s.setJson(key, next, undefined, true);
      if (ok) return "ok";
    } catch {
      return "unavailable";
    }
    await new Promise((r) => setTimeout(r, 25 + Math.random() * 60 * (i + 1)));
  }
  return "unavailable"; // sustained contention - fail closed
}

// ---- public API -----------------------------------------------------------

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

const fail = (o: Outcome, rejected: LimitResult): LimitResult =>
  o === "rejected" ? rejected : { ok: false, status: 503, error: "Service temporarily unavailable." };

// Counts one attempt against the per-IP hourly window. Call for every
// request, including ones that fail validation.
export async function checkPerIp(ip: string, now = new Date(), storeName?: string): Promise<LimitResult> {
  const key = ipKey(ip, now);
  const o = await casUpdate<IpDoc>(key, { count: 0 }, (d) => (d.count >= PER_IP_MAX_RUNS ? null : { count: d.count + 1 }), storeName);
  if (o === "ok") return { ok: true, dayKey: dayKey(now) };
  return fail(o, { ok: false, status: 429, error: "Too many checks from this connection - please try again in about an hour." });
}

// Atomically checks the daily budget and reserves the worst-case run cost.
// Call only after validation; reconcile with settleReservation.
export async function reserveDaily(now = new Date(), storeName?: string): Promise<LimitResult> {
  const key = dayKey(now);
  const o = await casUpdate<DayDoc>(key, { reserved: 0, used: 0 }, (d) =>
    d.used + d.reserved + WORST_CASE_RUN_CREDITS > DAILY_CREDIT_CAP
      ? null
      : { reserved: d.reserved + WORST_CASE_RUN_CREDITS, used: d.used },
  storeName);
  if (o === "ok") return { ok: true, dayKey: key };
  return fail(o, { ok: false, status: 429, error: "The public demo's daily limit is reached - it protects a finite free API budget. Please try again tomorrow." });
}

export async function settleReservation(key: string, actualCredits: number, storeName?: string): Promise<void> {
  await casUpdate<DayDoc>(key, { reserved: 0, used: 0 }, (d) => ({
    reserved: Math.max(0, d.reserved - WORST_CASE_RUN_CREDITS),
    used: d.used + Math.max(0, actualCredits),
  }), storeName);
  // A failed settle leaves the reservation in place until the UTC day
  // resets, which fails safe (tighter budget).
}

// Test-only: read the raw counters.
export async function debugRead(key: string, storeName?: string): Promise<any> {
  const s = store(storeName);
  if (!s) return null;
  return (await s.getJson(key))?.data ?? null;
}
