/**
 * The 52 languages supported by "translate for me" and speaker TTS.
 * `code` is the machine-translation code, `tag` the BCP-47 tag used for
 * speech recognition / synthesis, `label` the native name shown in the UI.
 */
export interface LangDef {
  code: string;
  tag: string;
  label: string;
  rtl?: boolean;
}

export const LANGS: LangDef[] = [
  { code: "ar", tag: "ar-SA", label: "العربية", rtl: true },
  { code: "en", tag: "en-US", label: "English" },
  { code: "fr", tag: "fr-FR", label: "Français" },
  { code: "es", tag: "es-ES", label: "Español" },
  { code: "de", tag: "de-DE", label: "Deutsch" },
  { code: "it", tag: "it-IT", label: "Italiano" },
  { code: "pt", tag: "pt-PT", label: "Português" },
  { code: "ru", tag: "ru-RU", label: "Русский" },
  { code: "tr", tag: "tr-TR", label: "Türkçe" },
  { code: "zh-CN", tag: "zh-CN", label: "中文" },
  { code: "ja", tag: "ja-JP", label: "日本語" },
  { code: "ko", tag: "ko-KR", label: "한국어" },
  { code: "hi", tag: "hi-IN", label: "हिन्दी" },
  { code: "ur", tag: "ur-PK", label: "اردو", rtl: true },
  { code: "fa", tag: "fa-IR", label: "فارسی", rtl: true },
  { code: "id", tag: "id-ID", label: "Bahasa Indonesia" },
  { code: "ms", tag: "ms-MY", label: "Bahasa Melayu" },
  { code: "th", tag: "th-TH", label: "ไทย" },
  { code: "vi", tag: "vi-VN", label: "Tiếng Việt" },
  { code: "nl", tag: "nl-NL", label: "Nederlands" },
  { code: "pl", tag: "pl-PL", label: "Polski" },
  { code: "uk", tag: "uk-UA", label: "Українська" },
  { code: "sv", tag: "sv-SE", label: "Svenska" },
  { code: "no", tag: "nb-NO", label: "Norsk" },
  { code: "da", tag: "da-DK", label: "Dansk" },
  { code: "fi", tag: "fi-FI", label: "Suomi" },
  { code: "el", tag: "el-GR", label: "Ελληνικά" },
  { code: "he", tag: "he-IL", label: "עברית", rtl: true },
  { code: "bn", tag: "bn-BD", label: "বাংলা" },
  { code: "sw", tag: "sw-KE", label: "Kiswahili" },
  { code: "cs", tag: "cs-CZ", label: "Čeština" },
  { code: "hu", tag: "hu-HU", label: "Magyar" },
  { code: "ro", tag: "ro-RO", label: "Română" },
  { code: "bg", tag: "bg-BG", label: "Български" },
  { code: "sk", tag: "sk-SK", label: "Slovenčina" },
  { code: "sr", tag: "sr-RS", label: "Српски" },
  { code: "hr", tag: "hr-HR", label: "Hrvatski" },
  { code: "sl", tag: "sl-SI", label: "Slovenščina" },
  { code: "lt", tag: "lt-LT", label: "Lietuvių" },
  { code: "lv", tag: "lv-LV", label: "Latviešu" },
  { code: "et", tag: "et-EE", label: "Eesti" },
  { code: "ca", tag: "ca-ES", label: "Català" },
  { code: "is", tag: "is-IS", label: "Íslenska" },
  { code: "sq", tag: "sq-AL", label: "Shqip" },
  { code: "mk", tag: "mk-MK", label: "Македонски" },
  { code: "fil", tag: "fil-PH", label: "Filipino" },
  { code: "af", tag: "af-ZA", label: "Afrikaans" },
  { code: "ka", tag: "ka-GE", label: "ქართული" },
  { code: "az", tag: "az-AZ", label: "Azərbaycan" },
  { code: "uz", tag: "uz-UZ", label: "Oʻzbek" },
  { code: "ta", tag: "ta-IN", label: "தமிழ்" },
];

const LANG_SET = new Set(LANGS.map((l) => l.code));

export const isSupportedLang = (code: string): boolean => LANG_SET.has(code);

/** Finds the LANGS entry for a translation code or a BCP-47 tag like "ar-MA". */
export function findLang(codeOrTag: string): LangDef | null {
  const lower = (codeOrTag || "").toLowerCase();
  const exact = LANGS.find((l) => l.code.toLowerCase() === lower || l.tag.toLowerCase() === lower);
  if (exact) return exact;
  const base = lower.split("-")[0] ?? "";
  return LANGS.find((l) => l.code.toLowerCase() === base) ?? null;
}

/** Best available TTS voice for a BCP-47 tag (falls back to the language base). */
export function pickVoice(tag: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const lower = tag.toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === lower) ??
    voices.find((v) => v.lang.toLowerCase().split("-")[0] === lower.split("-")[0]) ??
    null
  );
}

/** Speaks a short text in the given language; resolves when the utterance ends. */
export function speakText(text: string, tag: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const clean = text.trim();
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean.slice(0, 300));
  u.lang = tag;
  const voice = pickVoice(tag);
  if (voice) u.voice = voice;
  u.rate = 1;
  window.speechSynthesis.cancel(); // one line at a time
  window.speechSynthesis.speak(u);
}
