/**
 * Internal verification for the voice-room dubbing / translation / control
 * logic. Run:  npx tsx scripts/test-dubbing-logic.ts
 *
 * It imports the REAL source modules (langs, roomControl, useCaptionView's
 * translate) and mirrors the exact matching expressions used by
 * VoiceCaptions.tsx / useCaptionView.ts (asserted against the source below so
 * the model cannot drift).
 */
import { readFileSync } from "node:fs";
import { LANGS, findLang } from "../src/lib/langs";
import { ctlVerifyDecision } from "../src/components/voicing/roomControl";
import { isRtlLang, speechLang, translate } from "../src/components/voicing/useCaptionView";

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

/* ---------------- 1. languages catalogue ---------------- */
console.log("1) Languages catalogue (\"لا توجد لغات\" guard)");
ok(LANGS.length >= 50, `LANGS has ${LANGS.length} entries (>= 50)`);
const codes = new Set(LANGS.map((l) => l.code));
ok(codes.size === LANGS.length, "all language codes unique");
ok(LANGS.every((l) => findLang(l.code)?.code === l.code), "findLang round-trips every code");
ok(LANGS.every((l) => !!l.tag && !!l.label), "every lang has a BCP-47 tag and a label");
ok(findLang("ar")?.tag === "ar-SA", "ar -> ar-SA (recognition/TTS tag)");
ok(findLang("fr")?.tag === "fr-FR", "fr -> fr-FR");
ok(speechLang("ar") === "ar-SA" && speechLang("fr") === "fr-FR" && speechLang("en") === "en-US",
  "speechLang maps all UI locales");
ok(isRtlLang("ar-SA") && !isRtlLang("en-US") && isRtlLang("ur"), "RTL detection (ar/ur yes, en no)");

/* ---------------- 2. exclusive remote control ---------------- */
console.log("2) Remote control: the one who entered the code controls ALONE");
const base = { allowed: false, code: null, controlledBy: null };
ok(ctlVerifyDecision(base, "B", "123456") === "wrong", "no sharing yet -> rejected");
ok(ctlVerifyDecision({ ...base, allowed: true }, "B", "123456") === "wrong", "allowed but no code -> rejected");
const host = { allowed: true, code: "123456", controlledBy: null };
ok(ctlVerifyDecision(host, "B", "123456") === "grant", "correct code -> granted");
ok(ctlVerifyDecision(host, "B", "999999") === "wrong", "wrong code -> rejected");
ok(ctlVerifyDecision({ ...host, controlledBy: "A" }, "B", "123456") === "busy",
  "correct code while ANOTHER user controls -> busy (exclusive!) NOT granted");
ok(ctlVerifyDecision({ ...host, controlledBy: "A" }, "A", "123456") === "grant",
  "the current controller re-verifying is still granted");

/* ---------------- 3. two-way dubbing / translation matching ----------------
 * The expressions below are copied verbatim from the source; the includes()
 * assertions prove they cannot drift apart.
 */
console.log("3) Two-way dubbing: speak-dub, listen-dub, own line");
const capSrc = readFileSync("src/components/voicing/VoiceCaptions.tsx", "utf8");
const viewSrc = readFileSync("src/components/voicing/useCaptionView.ts", "utf8");
const EXPR =
  '(findLang(c.tlang ?? "")?.code ?? "") === targetCode';
const EXPR_VIEW = '(findLang(c.tlang ?? "")?.code ?? "") === effective';
ok(capSrc.includes(EXPR), "VoiceCaptions dub-match expression present");
ok(viewSrc.includes(EXPR_VIEW), "useCaptionView dub-match expression present");

// A speaker (uid "S") talks Arabic with dubbing into French.
const c = { id: "c1", uid: "S", name: "Sami", text: "مرحبا", lang: "ar-SA", tt: "Bonjour", tlang: "fr-FR" };

function model(targetCode: string, isMine: boolean, translatedIn: string | undefined) {
  const dubMatchesMe = !!c.tt && (findLang(c.tlang ?? "")?.code ?? "") === targetCode;
  const spoken = (c.lang.split("-")[0] || "").toLowerCase();
  const skip =
    !dubMatchesMe &&
    (spoken === targetCode ||
      translatedIn !== undefined); // requestedRef / translated cache hit
  const trans = isMine
    ? (c.tt ?? undefined)
    : dubMatchesMe
      ? c.tt!
      : translatedIn;
  const mainText = isMine ? (c.tt ?? c.text) : (trans ?? c.text);
  return { dubMatchesMe, skip, mainText, spoken };
}

const frViewer = model("fr", false, undefined);
ok(frViewer.dubMatchesMe && frViewer.mainText === "Bonjour",
  "listen-dub: viewer wanting FRENCH gets the pre-translated dub directly");
const enViewer = model("en", false, undefined);
ok(!enViewer.dubMatchesMe && !enViewer.skip && enViewer.mainText === "مرحبا",
  "listen-dub: viewer wanting ENGLISH triggers a translation request (not skipped)");
ok(model("en", false, "Hello").mainText === "Hello",
  "listen-dub: once translated, the English line replaces the original");
const arViewer = model("ar", false, undefined);
ok(arViewer.skip && arViewer.mainText === "مرحبا",
  "listen-dub: viewer already speaking ARABIC skips (line is already their language)");
const me = model("fr", true, undefined);
ok(me.mainText === "Bonjour",
  "speak-dub: my own bubble shows my dub line (what the room hears from me)");
ok(model("fr", false, undefined).spoken === "ar",
  "recognition tag 'ar-SA' -> base code 'ar' for the skip check");

/* ---------------- 4. translate() response handling ---------------- */
console.log("4) translate() client");
const realFetch = global.fetch;
global.fetch = (async () =>
  new Response(JSON.stringify({ ok: true, translated: "Hello" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;
translate("مرحبا", "en", "ar").then(async (out) => {
  ok(out === "Hello", "translate() parses {ok, translated} correctly");
  global.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  const bad = await translate("مرحبا", "en", "ar");
  ok(bad === null, "translate() returns null on a failed call (original text stays)");
  global.fetch = realFetch;

  /* ---------------- summary ---------------- */
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
