"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { findLang } from "@/lib/langs";
import type { Caption } from "@/server/spaces-store";

/**
 * Shared caption-translation state for voice rooms:
 *  - the viewer's "translate for me" language (persisted, shared by the
 *    captions panel AND the speech bubbles under the 3D characters),
 *  - a module-level translation cache so the panel and the bubbles never
 *    request the same line twice,
 *  - useCaptionView(): the latest line of every speaker, in the viewer's
 *    language, ready to render under each character.
 */

const TARGET_KEY = "cova-cap-target";

let target = "";
try {
  target = window.localStorage.getItem(TARGET_KEY) ?? "";
} catch {
  /* storage unavailable */
}
const subs = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

function getSnapshot(): string {
  return target;
}

function getServerSnapshot(): string {
  return "";
}

export function setTargetLang(next: string): void {
  target = next;
  try {
    window.localStorage.setItem(TARGET_KEY, next);
  } catch {
    /* storage unavailable */
  }
  subs.forEach((fn) => fn());
}

/** [targetCode, setTargetCode] — "" means "my interface language". */
export function useTargetLang(): [string, (v: string) => void] {
  const set = useCallback((v: string) => setTargetLang(v), []);
  return [useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot), set];
}

const SPEECH_LANG: Record<Locale, string> = {
  en: "en-US",
  fr: "fr-FR",
  ar: "ar-SA",
};

/** UI locale -> speech recognition language. */
export function speechLang(locale: Locale): string {
  return SPEECH_LANG[locale];
}

export function isRtlLang(lang: string): boolean {
  const base = (lang.split("-")[0] ?? "").toLowerCase();
  return base === "ar" || base === "ur" || base === "fa" || base === "he";
}

export async function translate(text: string, to: string, from: string): Promise<string | null> {
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, to, from }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; translated?: string };
    return data.ok && data.translated ? data.translated : null;
  } catch {
    return null; // offline / rate limited: the original text stays visible
  }
}

/** `${captionId}:${target}` -> translated text (shared across consumers). */
const translated = new Map<string, string>();
const requested = new Set<string>();

/**
 * Latest spoken line per uid, in the viewer's chosen language. Used for the
 * speech bubbles rendered under each 3D character.
 */
export function useCaptionView(captions: Caption[], meUid: string): Record<string, string> {
  const { locale } = useI18n();
  const [targetCode] = useTargetLang();
  const effective = targetCode || locale;
  const [lines, setLines] = useState<Record<string, string>>({});
  const sigRef = useRef("");

  const recompute = useCallback(() => {
    const next: Record<string, string> = {};
    const seen = new Set<string>();
    for (let i = captions.length - 1; i >= 0; i--) {
      const c = captions[i]!;
      if (seen.has(c.uid)) continue;
      seen.add(c.uid);
      const dubMatches = !!c.tt && (findLang(c.tlang ?? "")?.code ?? "") === effective;
      const key = `${c.id}:${effective}`;
      // My own bubble shows my chosen dub line when I speak with dubbing on —
      // that is exactly what the room hears from me.
      const text =
        c.uid === meUid
          ? (c.tt ?? c.text)
          : dubMatches
            ? c.tt!
            : (translated.get(key) ?? c.text);
      next[c.uid] = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    }
    const sig = Object.entries(next)
      .map(([k, v]) => `${k}:${v}`)
      .join("|");
    if (sig !== sigRef.current) {
      sigRef.current = sig;
      setLines(next);
    }
  }, [captions, effective, meUid]);

  useEffect(() => {
    recompute();
    for (const c of captions) {
      const dubMatches = !!c.tt && (findLang(c.tlang ?? "")?.code ?? "") === effective;
      const key = `${c.id}:${effective}`;
      if (dubMatches) continue;
      const spoken = (c.lang.split("-")[0] || "").toLowerCase();
      if (spoken === effective || translated.has(key) || requested.has(key)) continue;
      requested.add(key);
      void (async () => {
        const out = await translate(c.text, effective, spoken || "auto");
        if (out) {
          translated.set(key, out);
          recompute(); // repaint once the line arrives
        }
      })();
    }
  }, [captions, effective, meUid, recompute]);

  return lines;
}
