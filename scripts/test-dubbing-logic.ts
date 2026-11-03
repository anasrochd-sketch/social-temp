/**
 * Internal verification for the voice-room dubbing / translation / control
 * logic. Run:  node scripts/test-dubbing-logic.ts   (or: npx tsx scripts/...)
 *
 * It imports the REAL source modules (langs, roomControl, dubModel,
 * useCaptionView's translate) and mirrors the exact matching expressions used
 * by VoiceCaptions.tsx / useCaptionView.ts (asserted against the source below
 * so the model cannot drift).
 */
import { readFileSync } from "node:fs";
import { LANGS, findLang } from "../src/lib/langs";
import { ctlVerifyDecision } from "../src/components/voicing/roomControl";
import {
  dubIsOn,
  nextFacing,
  shouldRestartRecognition,
} from "../src/components/voicing/dubModel";
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
ok(findLang("ar-MA")?.code === "ar", "regional tag ar-MA falls back to the ar entry");
ok(
  speechLang("ar") === "ar-SA" && speechLang("fr") === "fr-FR" && speechLang("en") === "en-US",
  "speechLang maps all UI locales",
);
ok(isRtlLang("ar-SA") && !isRtlLang("en-US") && isRtlLang("ur"), "RTL detection (ar/ur yes, en no)");

/* ---------------- 2. exclusive remote control ---------------- */
console.log("2) Remote control: the one who entered the code controls ALONE");
const base = { allowed: false, code: null, controlledBy: null };
ok(ctlVerifyDecision(base, "B", "123456") === "off", "control not enabled -> OFF (never 'wrong code')");
ok(ctlVerifyDecision({ ...base, allowed: true }, "B", "123456") === "off", "allowed but no code yet -> OFF");
const host = { allowed: true, code: "123456", controlledBy: null };
ok(ctlVerifyDecision(host, "B", "123456") === "grant", "correct code -> granted");
ok(ctlVerifyDecision(host, "B", "999999") === "wrong", "wrong code -> rejected");
ok(ctlVerifyDecision({ ...host, controlledBy: "A" }, "B", "123456") === "busy",
  "correct code while ANOTHER user controls -> busy (exclusive!) NOT granted");
ok(ctlVerifyDecision({ ...host, controlledBy: "A" }, "A", "123456") === "grant",
  "the current controller re-verifying is still granted");

/* ---------------- 2b. dubbing state machine (dubModel) ---------------- */
console.log("2b) Dubbing state machine");
ok(dubIsOn(false, "fr") === false, "dub off when transcription not running");
ok(dubIsOn(true, "") === false, "dub off when no dub language picked");
ok(dubIsOn(true, "fr") === true, "dub ON only when listening AND language set");
ok(shouldRestartRecognition("ar", "ar", true) === false, "same language: no recognition restart");
ok(shouldRestartRecognition("ar", "en", true) === true, "CHANGED language while listening: restart (fixes 'same speech comes out')");
ok(shouldRestartRecognition("ar", "en", false) === false, "changed language while idle: nothing to restart");
ok(nextFacing("user") === "environment" && nextFacing("environment") === "user",
  "camera flip alternates front <-> back");

/* ---------------- 3. two-way dubbing / translation matching ----------------
 * The expressions below are copied verbatim from the source; the includes()
 * assertions prove they cannot drift apart.
 */
console.log("3) Two-way dubbing: speak-dub, listen-dub, own line");
const capSrc = readFileSync("src/components/voicing/VoiceCaptions.tsx", "utf8");
const viewSrc = readFileSync("src/components/voicing/useCaptionView.ts", "utf8");
const meshSrc = readFileSync("src/components/voicing/useVoiceMesh.ts", "utf8");
const roomSrc = readFileSync("src/components/voicing/VoiceRoom.tsx", "utf8");
const overlaySrc = readFileSync("src/components/voicing/ScreenShareOverlay.tsx", "utf8");
const stripSrc = readFileSync("src/components/voicing/CameraStrip.tsx", "utf8");
const runtimeSrc = readFileSync("src/components/voicing/RoomRuntime.tsx", "utf8");
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

/* ---------------- 3b. the dubbing button + engine wiring ---------------- */
console.log("3b) Dubbing button / language restart wiring (source guard)");
ok(capSrc.includes("shouldRestartRecognition(prev, srcLang, wantRef.current)"),
  "panel restarts recognition when 'I speak' changes mid-session");
ok(capSrc.includes("onDubRef.current?.(dubOn, findLang(voiceOut)?.code ?? \"\")"),
  "panel reports dub state (on + language) to the control bar");
ok(capSrc.includes("if (wantRef.current) stop();") && capSrc.includes("else if (voiceOutRef.current) start();"),
  "panel honours the control bar's دبلجة toggle");
ok(roomSrc.includes("dubToggleN"), "control bar passes the dub toggle to the panel");
ok(roomSrc.includes('data-testid="dub-button"') && roomSrc.includes('t("room.dub")'),
  "a visible Dubbing button exists in the control bar");
ok(roomSrc.includes("dubPick") && roomSrc.includes('t("room.dubPick")'),
  "first Dubbing press opens the panel + tells the user to pick a language");

/* ---------------- 3c. control-code flow wiring (source guard) ---------------- */
console.log("3c) Control-code flow wiring");
ok(meshSrc.includes('t: "ctl-state"') && meshSrc.includes("broadcastCtlState"),
  "host broadcasts allowed/code/controller to every viewer");
ok(overlaySrc.includes("ctl.remoteAllowed") && overlaySrc.includes('data-testid="ctl-code-form"'),
  "viewer sees a BIG always-present code form while the sharer allows control");
ok(overlaySrc.includes("ctlActions.submitCode(codeDraft, first)"),
  "the form submits the code straight to the sharer (no hidden two-step)");
ok(overlaySrc.includes("room.ctlHeldBy"), "viewer sees who holds the control (exclusive seat)");
ok(meshSrc.includes('why: d === "busy" ? "busy" : d === "off" ? "off" : "wrong"'),
  "deny reasons distinguish busy / off / wrong");
ok(meshSrc.includes("String(Math.floor(100000 + Math.random() * 900000))"),
  "code is a fresh random 6-digit number per session");

/* ---------------- 3d. camera wiring (source guard) ---------------- */
console.log("3d) Camera wiring");
ok(meshSrc.includes("camTransceiver: pc.addTransceiver("), "a dedicated camera m-line exists per peer");
ok(meshSrc.includes("e.transceiver === peer.camTransceiver"),
  "receiver tells camera video apart from screen video by transceiver");
ok(meshSrc.includes("p.videoTransceiver.sender.replaceTrack(track)"),
  "screen share rides the screen m-line only");
ok(meshSrc.includes("p.camTransceiver.sender.replaceTrack(track)"),
  "camera rides the camera m-line");
ok(meshSrc.includes("facingMode: { exact: next }"), "flip re-opens the device with the other facing");
ok(stripSrc.includes("onFlip") && stripSrc.includes("remoteCams"),
  "stage shows my preview (flip/stop) + everyone's camera tiles");
ok(runtimeSrc.includes("toggleCam") && runtimeSrc.includes("remoteCamFacing"),
  "runtime exposes camera state to the room page");

/* ---------------- 3e. i18n keys for the new UI ---------------- */
console.log("3e) i18n keys (en/fr/ar)");
const spacesSrc = readFileSync("src/i18n/spaces.ts", "utf8");
for (const key of [
  "room.dub", "room.dubPick", "room.cam", "room.camStop", "room.camFlip",
  "room.camDenied", "room.camFlipFail", "room.camYou", "room.camBack",
  "room.ctlEnterTitle", "room.ctlWatch", "room.ctlHeldBy", "room.ctlOff",
  "cap.dubOn", "cap.empty",
]) {
  const n = spacesSrc.split(`"${key}"`).length - 1;
  ok(n >= 3, `"${key}" defined in all 3 locales (${n}/3)`);
}

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
