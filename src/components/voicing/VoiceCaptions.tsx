"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Languages, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useI18n } from "@/i18n/client";
import { useS } from "@/i18n/spaces";
import { LOCALE_DIR, type Locale } from "@/i18n/config";
import type { Caption } from "@/server/spaces-store";

type Send = (body: Record<string, unknown>) => Promise<unknown>;

/* Minimal typings for the Web Speech API (not in every TS lib target). */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult;
}
interface SpeechEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

/** UI locale -> speech recognition language. */
const SPEECH_LANG: Record<Locale, string> = {
  en: "en-US",
  fr: "fr-FR",
  ar: "ar-SA",
};

const shortLang = (lang: string) => (lang.split("-")[0] || "?").toUpperCase();
const isRtlLang = (lang: string) => lang.toLowerCase().startsWith("ar");

/**
 * Live captions for voice rooms: your speech is transcribed by the browser,
 * relayed through the room, and every participant reads each line translated
 * into the interface language they picked. Best in Chrome / Edge.
 */
export function VoiceCaptions({
  captions,
  meUid,
  send,
}: {
  captions: Caption[];
  meUid: string;
  send: Send;
}) {
  const t = useS();
  const { locale } = useI18n();

  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState("");
  const [translated, setTranslated] = useState<Record<string, string>>({});

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const lastSentRef = useRef({ text: "", at: 0 });
  const requestedRef = useRef(new Set<string>());
  const listRef = useRef<HTMLDivElement | null>(null);

  const supported =
    typeof window !== "undefined" &&
    !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  const pushCaption = useCallback(
    (text: string) => {
      const clean = text.trim().slice(0, 300);
      if (!clean) return;
      const now = Date.now();
      const last = lastSentRef.current;
      if (clean === last.text && now - last.at < 4000) return; // recognition repeats itself
      if (now - last.at < 600) return; // throttle bursts
      lastSentRef.current = { text: clean, at: now };
      void send({ type: "caption", text: clean, lang: SPEECH_LANG[locale] });
    },
    [send, locale],
  );

  const stop = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const start = useCallback(() => {
    const Ctor =
      ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition);
    if (!Ctor) {
      setNotice(t("cap.unsupported"));
      return;
    }
    setNotice("");
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[locale];
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r?.isFinal) pushCaption(r[0]?.transcript ?? "");
      }
    };
    // Chrome ends the session after silence — quietly restart while enabled.
    rec.onend = () => {
      if (wantRef.current) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setNotice(t("cap.denied"));
        wantRef.current = false;
        setListening(false);
      }
    };

    recRef.current = rec;
    wantRef.current = true;
    setListening(true);
    try {
      rec.start();
    } catch {
      /* start called twice */
    }
  }, [locale, pushCaption, t]);

  useEffect(() => () => stop(), [stop]);

  // Translate new lines from other people into my interface language.
  useEffect(() => {
    for (const c of captions) {
      if (c.uid === meUid || requestedRef.current.has(c.id)) continue;
      const spoken = (c.lang.split("-")[0] || "").toLowerCase();
      if (spoken === locale) continue; // already my language
      requestedRef.current.add(c.id);
      void (async () => {
        try {
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: c.text, to: locale, from: spoken || "auto" }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            translated?: string;
          };
          if (data.ok && data.translated) {
            setTranslated((prev) => ({ ...prev, [c.id]: data.translated! }));
          }
        } catch {
          /* offline / rate limited: the original text stays visible */
        }
      })();
    }
  }, [captions, locale, meUid]);

  // Keep the newest line in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [captions.length, translated]);

  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Languages className="h-4 w-4" aria-hidden="true" />
          {t("cap.title")}
        </h3>
        <p className="text-xs text-cova-mute">{t("cap.hint")}</p>

        <Button
          size="sm"
          variant={listening ? "danger" : "secondary"}
          className="w-full"
          disabled={!supported}
          onClick={() => (listening ? stop() : start())}
        >
          {listening ? (
            <MicOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Mic className="h-4 w-4" aria-hidden="true" />
          )}
          {listening ? t("cap.stop") : t("cap.start")}
        </Button>

        {notice && (
          <p className="rounded-lg bg-cova-pale px-3 py-2 text-xs" role="status">
            {notice}
          </p>
        )}

        <div
          ref={listRef}
          className="max-h-56 space-y-2.5 overflow-y-auto"
          aria-live="polite"
          aria-label={t("cap.title")}
        >
          {captions.length === 0 ? (
            <p className="py-2 text-center text-xs text-cova-mute">{t("cap.empty")}</p>
          ) : (
            captions.map((c) => {
              const mine = c.uid === meUid;
              const trans = mine ? undefined : translated[c.id];
              const spokenDir = isRtlLang(c.lang) ? "rtl" : "ltr";
              return (
                <div key={c.id} className="rounded-lg bg-cova-bg px-2.5 py-2">
                  <p className="flex items-center gap-1.5 text-[11px] text-cova-mute">
                    <span className="truncate font-medium">
                      {mine ? t("cap.you") : c.name}
                    </span>
                    <span className="shrink-0 rounded bg-cova-pale px-1 font-mono text-[10px]">
                      {shortLang(c.lang)}
                    </span>
                  </p>
                  {trans !== undefined && (
                    <p className="mt-0.5 text-sm font-medium" dir={LOCALE_DIR[locale]}>
                      {trans}
                    </p>
                  )}
                  {trans === undefined && !mine && (
                    <p className="mt-0.5 text-sm" dir={spokenDir}>
                      {c.text}
                    </p>
                  )}
                  {mine && <p className="mt-0.5 text-sm" dir={spokenDir}>{c.text}</p>}
                  {trans !== undefined && (
                    <p className="mt-0.5 text-[11px] text-cova-mute" dir={spokenDir}>
                      {c.text}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardBody>
    </Card>
  );
}
