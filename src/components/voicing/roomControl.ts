"use client";

/**
 * Remote-control input primitives for voice rooms (shared by the mesh and the
 * screen-share overlay). Mirrors the DM-call implementation in src/lib/call.ts:
 * the viewer sends normalized 0..1 coordinates, the host converts them to its
 * own window pixels and injects synthetic events into ITS page — browsers only
 * let a page drive itself, never the OS outside the document.
 */

export function injectPointer(type: "move" | "down" | "up", x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "down" ? 1 : 0,
  };
  if (type === "move") {
    el.dispatchEvent(new MouseEvent("mousemove", init));
    return;
  }
  el.dispatchEvent(new MouseEvent(type === "down" ? "mousedown" : "mouseup", init));
  if (type === "up") el.dispatchEvent(new MouseEvent("click", init));
}

export function injectWheel(x: number, y: number, dx: number, dy: number): void {
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  el.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      deltaX: dx,
      deltaY: dy,
      deltaMode: 0,
    }),
  );
}

export function injectKey(type: "keydown" | "keyup", key: string): void {
  if (!key || key.length > 32) return;
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Maps a pointer event on the letterboxed video to 0..1 screen coordinates. */
export function normalizedVideoPoint(
  el: HTMLVideoElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const vw = el.videoWidth || 16;
  const vh = el.videoHeight || 9;
  const scale = Math.min(rect.width / vw, rect.height / vh); // object-contain
  const dispW = vw * scale;
  const dispH = vh * scale;
  const offX = (rect.width - dispW) / 2;
  const offY = (rect.height - dispH) / 2;
  return {
    x: clamp01((clientX - rect.left - offX) / dispW),
    y: clamp01((clientY - rect.top - offY) / dispH),
  };
}

/**
 * Pure decision for a control-code verification, used by the voice mesh and
 * covered by scripts/test-dubbing-logic.ts. Exclusive on purpose: exactly ONE
 * controller may hold the screen — a second correct code is rejected with
 * "busy" while someone is already controlling, and a code sent before the
 * sharer enabled control is rejected with "off" (never "wrong", so the viewer
 * is not told their code is bad when the feature is simply off).
 */
export function ctlVerifyDecision(
  cur: { allowed: boolean; code: string | null; controlledBy: string | null },
  uid: string,
  code: unknown,
): "grant" | "busy" | "off" | "wrong" {
  if (!cur.allowed || !cur.code) return "off";
  if (cur.controlledBy && cur.controlledBy !== uid) return "busy";
  return String(code ?? "") === cur.code ? "grant" : "wrong";
}
