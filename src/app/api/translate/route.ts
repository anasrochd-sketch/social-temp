/**
 * Lightweight machine translation for live voice captions.
 *
 * Tries a chain of free, key-less public endpoints from the server (the browser
 * never talks to them directly, so CORS is not an issue):
 *   1. translate.googleapis.com  (classic gtx endpoint)
 *   2. clients5.google.com       (dict-chrome-ex client, usually reachable)
 *   3. api.mymemory.translated.net
 * Every result is cached in memory and a small per-IP rate limit protects the
 * route. If every upstream fails the client falls back to the original text —
 * the feature degrades, it never breaks.
 */

export const runtime = "nodejs";

const TARGETS = new Set(["en", "fr", "ar"]);
const TEXT_MAX = 500;
const CACHE_MAX = 500;
const RATE_MAX = 60; // requests per window per IP
const RATE_WINDOW_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 5000;

const cache = new Map<string, string>();
const rate = new Map<string, { n: number; resetAt: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  let entry = rate.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { n: 0, resetAt: now + RATE_WINDOW_MS };
    rate.set(ip, entry);
  }
  entry.n += 1;
  return entry.n > RATE_MAX;
}

function remember(key: string, value: string) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  return res.json();
}

/** translate.googleapis.com/translate_a/single → [[["Hola","hello",...],...],...] */
function parseGtx(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
  return (data[0] as unknown[])
    .map((chunk) => (Array.isArray(chunk) ? String(chunk[0] ?? "") : ""))
    .join("")
    .trim();
}

/** clients5.google.com/translate_a/t → [["Hola","en"],...] or ["Hola",...] */
function parseClients5(data: unknown): string {
  if (!Array.isArray(data)) return "";
  if (Array.isArray(data[0])) {
    return (data as unknown[])
      .map((item) => (Array.isArray(item) ? String(item[0] ?? "") : ""))
      .join("")
      .trim();
  }
  return (data as unknown[]).map((item) => String(item ?? "")).join("").trim();
}

/** api.mymemory.translated.net → { responseData: { translatedText } } */
function parseMyMemory(data: unknown): string {
  const text = (data as { responseData?: { translatedText?: unknown } })?.responseData
    ?.translatedText;
  if (typeof text !== "string") return "";
  if (/MYMEMORY WARNING/i.test(text)) return ""; // quota exhausted
  return text.trim();
}

async function translateUpstream(text: string, to: string, from: string): Promise<string> {
  const q = encodeURIComponent(text);

  // 1. Classic gtx endpoint.
  const gtx = parseGtx(
    await getJson(
      `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${from}&tl=${to}&q=${q}`,
    ),
  );
  if (gtx) return gtx;

  // 2. Chrome dictionary client (different frontend, often reachable from servers).
  const c5 = parseClients5(
    await getJson(
      `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${from}&tl=${to}&q=${q}`,
    ),
  );
  if (c5) return c5;

  // 3. MyMemory (needs an explicit source language).
  const src = from && from !== "auto" ? from : "en";
  const mm = parseMyMemory(
    await getJson(`https://api.mymemory.translated.net/get?q=${q}&langpair=${src}|${to}`),
  );
  if (mm) return mm;

  throw new Error("all_providers_failed");
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  if (limited(ip)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: { text?: unknown; to?: unknown; from?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, TEXT_MAX) : "";
  const to = typeof body.to === "string" ? body.to.slice(0, 8) : "";
  const from = typeof body.from === "string" ? body.from.slice(0, 8) : "auto";
  if (!text || !TARGETS.has(to)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const key = `${from}|${to}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Response.json({ ok: true, translated: hit });

  try {
    const translated = await translateUpstream(text, to, from);
    if (!translated) throw new Error("empty");
    remember(key, translated);
    return Response.json({ ok: true, translated });
  } catch (err) {
    console.error("translate failed:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, error: "translate_failed" }, { status: 502 });
  }
}
