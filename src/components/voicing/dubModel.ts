/**
 * Pure decision helpers for the voice-room dubbing engine, imported by
 * VoiceCaptions.tsx and covered by scripts/test-dubbing-logic.ts — keeping the
 * rules here means the behaviour is checkable without a browser.
 */

export type Facing = "user" | "environment";

/** Dubbing is audible exactly when transcription runs AND a dub language is set. */
export function dubIsOn(listening: boolean, voiceOut: string): boolean {
  return listening && voiceOut !== "";
}

/**
 * Changing "I speak" must take effect immediately: a running SpeechRecognition
 * session keeps the language it was started with, so it has to be restarted
 * when the chosen language changes while it is running.
 */
export function shouldRestartRecognition(
  prev: string,
  next: string,
  listening: boolean,
): boolean {
  return listening && prev !== next;
}

/** Front <-> back camera toggle. */
export function nextFacing(f: Facing): Facing {
  return f === "user" ? "environment" : "user";
}
