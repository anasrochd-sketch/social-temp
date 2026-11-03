"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Languages, Mic, MicOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useI18n } from "@/i18n/client";
import { useS } from "@/i18n/spaces";
import { LANGS, findLang, speakText } from "@/lib/langs";
import {
  isRtlLang,
  speechLang,
  translate,
  useTargetLang,
} from "@/components/voicing/useCaptionView";
import type { Caption } from "@/server/spaces-store";
import { cn } from "@/lib/utils";

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

const shortLang = (lang: string) => (lang.split("-")[0] || "?").toUpperCase();

const MODE_KEY = "cova-cap-mode";
const SRCLANG_KEY = "cova-cap-srclang";

function readMode(): "text" | "voice" {
  try {
    return window.localStorage.getItem(MODE_KEY) === "voice" ? "voice" : "text";
  } catch {
    return "text";
  }
}

function readSrcLang(): string {
  try {
    return window.localStorage.getItem(SRCLANG_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Live captions + the two-way dubbing engine for voice rooms.
 *
 * LISTEN DUBBING (everyone): pick "translate for me" — every line from the
 * others is translated into that language and, in auto-voice mode, spoken by
 * MY browser only. The speaker's raw microphone is ducked while the dub
 * plays, so the dub is what you actually hear.
 *
 * SPEAK DUBBING (speaker): pick a "dub my voice into" language — every final
 * recognition result is machine-translated, spoken on MY device and shared
 * pre-translated (tt + tlang), so the whole room can hear my chosen language
 * and read it under my character.
 *
 * The component stays mounted even when the panel is hidden (expanded=false):
 * translation and dubbing keep running in the background.
 */
export function VoiceCaptions({
  captions,
  meUid,
  send,
  expanded,
  setPeerVolume,
}: {
  captions: Caption[];
  meUid: string;
  send: Send;
  /** Panel visibility only — translation/dubbing stay active when false. */
  expanded: boolean;
  setPeerVolume: (uid: string, v: number) => void;
}) {
  const t = useS();
  const { locale } = useI18n();

  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState("");
  /** "Translate for me" target — shared with the speech bubbles. */
  const [target, setTarget] = useTargetLang();
  /** The language I actually speak (recognition input). */
  const [srcLang, setSrcLang] = useState(readSrcLang);
  /** Speaker voice-out language (translation code, "" = off). */
  const [voiceOut, setVoiceOut] = useState("");
  /** Listen to incoming translations automatically, or read them only. */
  const [autoDub, setAutoDub] = useState<"text" | "voice">(readMode);
  /** `${captionId}:${target}` -> translated text (panel-local). */
  const [translated, setTranslated] = useState<Record<string, string>>({});

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const lastSentRef = useRef({ text: "", at: 0 });
  const requestedRef = useRef(new Set<string>());
  const spokenRef = useRef(new Set<string>());
  const duckedRef = useRef(new Set<string>());
  const duckTimers = useRef(new Map<string, number>());
  const listRef = useRef<HTMLDivElement | null>(null);
  const voiceOutRef = useRef(voiceOut);
  useEffect(() => {
    voiceOutRef.current = voiceOut;
  }, [voiceOut]);
  const autoDubRef = useRef(autoDub);
  useEffect(() => {
    autoDubRef.current = autoDub;
    try {
      window.localStorage.setItem(MODE_KEY, autoDub);
    } catch {
      /* storage unavailable */
    }
  }, [autoDub]);
  const srcLangRef = useRef(srcLang);
  useEffect(() => {
    srcLangRef.current = srcLang;
    try {
      window.localStorage.setItem(SRCLANG_KEY, srcLang);
    } catch {
      /* storage unavailable */
    }
  }, [srcLang]);
  const setPVRef = useRef(setPeerVolume);
  useEffect(() => {
    setPVRef.current = setPeerVolume;
  }, [setPeerVolume]);
  const localeTag = speechLang(locale);

  const supported =
    typeof window !== "undefined" &&
    !!(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  /** Lowers a speaker's raw microphone while their dub line plays. */
  const duckSpeaker = useCallback((uid: string, ms: number) => {
    setPVRef.current(uid, 0.06);
    const prev = duckTimers.current.get(uid);
    if (prev) window.clearTimeout(prev);
    duckTimers.current.set(
      uid,
      window.setTimeout(() => {
        duckTimers.current.delete(uid);
        setPVRef.current(uid, 1);
      }, ms),
    );
  }, []);

  const pushCaption = useCallback(
    (text: string) => {
      const clean = text.trim().slice(0, 300);
      if (!clean) return;
      const now = Date.now();
      const last = lastSentRef.current;
      if (clean === last.text && now - last.at < 4000) return; // recognition repeats itself
      if (now - last.at < 600) return; // throttle bursts
      lastSentRef.current = { text: clean, at: now };

      const spokenTag = findLang(srcLangRef.current)?.tag ?? localeTag;
      const out = voiceOutRef.current;
      if (out) {
        // Speaker dubbing: translate, speak it here, share the translation.
        void (async () => {
          const tt = await translate(clean, out, "auto");
          const lang = findLang(out)?.tag ?? out;
          if (tt) speakText(tt, lang);
          void send({
            type: "caption",
            text: clean,
            lang: spokenTag,
            tt: tt ?? undefined,
            tlang: tt ? lang : undefined,
          });
        })();
      } else {
        void send({ type: "caption", text: clean, lang: spokenTag });
      }
    },
    [send, localeTag],
  );

  const stop = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const start = useCallback(() => {
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!Ctor) {
      setNotice(t("cap.unsupported"));
      return;
    }
    setNotice("");
    const rec = new Ctor();
    rec.lang = findLang(srcLangRef.current)?.tag ?? localeTag;
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
  }, [localeTag, pushCaption, t]);

  useEffect(() => () => stop(), [stop]);

  // "Translate for me" target (a translation code).
  const targetCode = target || locale;
  const targetTag = findLang(targetCode)?.tag ?? localeTag;

  // Translate new lines from other people into my chosen target language,
  // duck their raw microphone while their dub plays, and (in voice mode)
  // read the translated line aloud once.
  useEffect(() => {
    for (const c of captions) {
      if (c.uid === meUid) continue;
      const isNew = !duckedRef.current.has(c.id);
      if (isNew) duckedRef.current.add(c.id);
      // A speaker with dubbing on: their raw mic ducks while the dub plays.
      if (isNew && c.tt) duckSpeaker(c.uid, 6000);
      // A dub that already arrives in my language needs no request.
      const dubMatchesMe = !!c.tt && (findLang(c.tlang ?? "")?.code ?? "") === targetCode;
      const key = `${c.id}:${targetCode}`;
      if (!dubMatchesMe) {
        const spoken = (c.lang.split("-")[0] || "").toLowerCase();
        if (spoken === targetCode) continue; // already my language
        if (requestedRef.current.has(key)) continue;
        requestedRef.current.add(key);
        void (async () => {
          const out = await translate(c.text, targetCode, spoken || "auto");
          if (out) {
            setTranslated((prev) => ({ ...prev, [key]: out }));
            if (autoDubRef.current === "voice" && !spokenRef.current.has(key)) {
              spokenRef.current.add(key);
              if (isNew) duckSpeaker(c.uid, 5000);
              speakText(out, targetTag);
            }
          }
        })();
      } else if (autoDubRef.current === "voice" && !spokenRef.current.has(key)) {
        spokenRef.current.add(key);
        if (isNew) duckSpeaker(c.uid, 6000);
        speakText(c.tt!, targetTag);
      }
    }
  }, [captions, targetCode, meUid, targetTag, duckSpeaker]);

  // Keep the newest line in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [captions.length, translated]);

  const selectCls =
    "mt-1 h-9 w-full rounded-lg border border-cova-line bg-white px-2 text-xs font-medium";

  // The panel can be closed — the hooks above keep translating and dubbing.
  if (!expanded) return null;

  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Languages className="h-4 w-4" aria-hidden="true" />
          {t("cap.title")}
        </h3>

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-xs font-medium text-cova-mute">
            {t("cap.forMe")}
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={selectCls}
            >
              <option value="">{t("cap.interfaceLang")}</option>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-cova-mute">
            {t("cap.speakLang")}
            <select
              value={srcLang}
              onChange={(e) => setSrcLang(e.target.value)}
              className={selectCls}
            >
              <option value="">{t("cap.interfaceLang")}</option>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-cova-mute">
            {t("cap.voiceOut")}
            <select
              value={voiceOut}
              onChange={(e) => setVoiceOut(e.target.value)}
              className={selectCls}
            >
              <option value="">{t("cap.voiceOutOff")}</option>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-[11px] leading-snug text-cova-mute">{t("cap.dubHint")}</p>

        <div className="flex items-center gap-2" role="group" aria-label={t("cap.mode")}>
          <span className="text-xs font-medium text-cova-mute">{t("cap.mode")}</span>
          <div className="ms-auto flex overflow-hidden rounded-lg border border-cova-line">
            {(["text", "voice"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={autoDub === m}
                onClick={() => setAutoDub(m)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors",
                  autoDub === m ? "bg-cova-ink text-white" : "bg-white hover:bg-cova-bg",
                )}
              >
                {m === "voice" ? <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                {m === "voice" ? t("cap.modeVoice") : t("cap.modeText")}
              </button>
            ))}
          </div>
        </div>

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
          aria-live={autoDub === "voice" ? "off" : "polite"}
          aria-label={t("cap.title")}
        >
          {captions.length === 0 ? (
            <p className="py-2 text-center text-xs text-cova-mute">{t("cap.empty")}</p>
          ) : (
            captions.map((c) => {
              const mine = c.uid === meUid;
              const dubMatchesMe = !!c.tt && (findLang(c.tlang ?? "")?.code ?? "") === targetCode;
              const trans = mine
                ? (c.tt ?? undefined)
                : dubMatchesMe
                  ? c.tt!
                  : translated[`${c.id}:${targetCode}`];

              // Main line: my own words, or the best translation available.
              const mainText = mine ? (c.tt ?? c.text) : (trans ?? c.text);
              const mainLang = mine
                ? (c.tt ? (c.tlang ?? c.lang) : c.lang)
                : trans
                  ? targetTag
                  : (c.tlang ?? c.lang);
              const sub = mine ? (c.tt ? c.text : null) : trans ? c.text : null;
              const subLang = mine ? c.lang : c.lang;

              const speak = () => speakText(trans ?? c.text, mainLang);

              return (
                <div key={c.id} className="rounded-lg bg-cova-bg px-2.5 py-2">
                  <p className="flex items-center gap-1.5 text-[11px] text-cova-mute">
                    <span className="truncate font-medium">{mine ? t("cap.you") : c.name}</span>
                    <span className="shrink-0 rounded bg-cova-pale px-1 font-mono text-[10px]">
                      {shortLang(mainLang)}
                    </span>
                    <button
                      type="button"
                      onClick={speak}
                      aria-label={t("cap.listen")}
                      className="ms-auto rounded p-0.5 hover:bg-cova-pale"
                    >
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </p>
                  <p className="mt-0.5 text-sm" dir={isRtlLang(mainLang) ? "rtl" : "ltr"}>
                    {mainText}
                  </p>
                  {sub !== null && (
                    <p
                      className="mt-0.5 text-[11px] text-cova-mute"
                      dir={isRtlLang(subLang) ? "rtl" : "ltr"}
                    >
                      {mine ? `🎙 ${sub}` : sub}
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
