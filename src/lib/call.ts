import { useSyncExternalStore } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabase } from "@/lib/supabase/client";

import type { Tone } from "@/types";

/**
 * One-to-one WebRTC calls (voice, video and screen share) for direct messages.
 *
 * Media flows browser-to-browser; Supabase only carries the short signaling messages
 * (SDP offer/answer + ICE candidates) through the `call_signals` table, protected by RLS
 * and delivered live by Realtime. See supabase/migrations/20261102000006_call_signals.sql.
 *
 * Screens are shared by replacing the camera track, so screen share is offered in video
 * calls (no renegotiation needed). TURN is not configured, so calls need a network path
 * that STUN can punch through (fine for typical home/mobile networks).
 */

export type CallKind = "audio" | "video";

export type CallPhase = "idle" | "ringing-in" | "ringing-out" | "connecting" | "connected";

export interface CallPeer {
  publicId: string;
  displayName: string;
  tone: Tone;
  avatarUrl?: string | null;
}

export interface CallState {
  phase: CallPhase;
  kind: CallKind;
  peer: CallPeer | null;
  micOn: boolean;
  cameraOn: boolean;
  sharing: boolean;
  /** Unix time when the call became connected; null until then (drives the duration timer). */
  connectedAt: number | null;
  /** i18n key describing the last problem or end reason; shown by the overlay. */
  notice: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] },
];

const RING_TIMEOUT_MS = 45_000;

let state: CallState = {
  phase: "idle",
  kind: "audio",
  peer: null,
  micOn: true,
  cameraOn: true,
  sharing: false,
  connectedAt: null,
  notice: null,
  localStream: null,
  remoteStream: null,
};

const listeners = new Set<() => void>();

function notify() {
  state = { ...state };
  for (const listener of listeners) listener();
}

function patch(part: Partial<CallState>) {
  state = { ...state, ...part };
  notify();
}

/* ------------------------------------------------------------------ ringer */

let audioCtx: AudioContext | null = null;
let ringerTimer: ReturnType<typeof setInterval> | null = null;

function startRinger() {
  if (ringerTimer) return;
  const beep = () => {
    try {
      audioCtx ??= new AudioContext();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 620;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch {
      // No sound is fine; the overlay still shows the ring.
    }
  };
  beep();
  ringerTimer = setInterval(beep, 2000);
}

function stopRinger() {
  if (ringerTimer) {
    clearInterval(ringerTimer);
    ringerTimer = null;
  }
}

/* ----------------------------------------------------------------- manager */

let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let screenTrack: MediaStreamTrack | null = null;
let incomingOffer: RTCSessionDescriptionInit | null = null;

let meUuid: string | null = null;
let peerUuid: string | null = null;
let channel: ReturnType<SupabaseClient["channel"]> | null = null;

let pendingCandidates: RTCIceCandidateInit[] = [];
let remoteDescriptionSet = false;
let ringTimeout: ReturnType<typeof setTimeout> | null = null;
const uuidCache: Map<string, string> = new Map();

interface SignalRow {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  payload: Record<string, unknown>;
}

async function lookupUuid(sb: SupabaseClient, publicId: string): Promise<string | null> {
  const cached = uuidCache.get(publicId);
  if (cached) return cached;
  const { data } = await sb
    .from("profiles")
    .select("id")
    .eq("public_id", publicId)
    .maybeSingle<{ id: string }>();
  if (!data?.id) return null;
  uuidCache.set(publicId, data.id);
  return data.id;
}

async function sendSignal(kind: string, payload: Record<string, unknown> = {}): Promise<void> {
  if (!peerUuid) return;
  await getSupabase().from("call_signals").insert({ to_id: peerUuid, kind, payload });
}

async function ensureMe(sb: SupabaseClient): Promise<string | null> {
  if (meUuid) return meUuid;
  const { data } = await sb.auth.getUser();
  meUuid = data.user?.id ?? null;
  return meUuid;
}

function ensureSubscribed(): void {
  if (channel || !meUuid) return;
  const ch = getSupabase().channel(`cova-call-${meUuid}`);

  ch.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "call_signals", filter: `to_id=eq.${meUuid}` },
    (change) => void handleSignal(change.new as SignalRow),
  );

  ch.subscribe();
  channel = ch;
}

/**
 * Starts listening for incoming calls. Called once the app knows someone is signed in
 * (from the global CallOverlay), so calls ring on every page, not just /messages.
 */
export async function ensureCallSubscription(): Promise<void> {
  if (channel) return;
  const sb = getSupabase();
  const me = await ensureMe(sb);
  if (!me) return;
  ensureSubscribed();
}

async function handleSignal(row: SignalRow): Promise<void> {
  const sb = getSupabase();

  // A signal from someone else while we are already in a call: politely decline it.
  if (row.kind === "offer") {
    if (state.phase !== "idle") {
      await sb.from("call_signals").insert({
        to_id: row.from_id,
        kind: "decline",
        payload: { reason: "busy" },
      });
      return;
    }

    const { data } = await sb
      .from("profiles")
      .select("id,user_code,display_name,tone,avatar_url")
      .eq("id", row.from_id)
      .maybeSingle<{
        id: string;
        user_code: string;
        display_name: string;
        tone: Tone;
        avatar_url: string | null;
      }>();
    if (!data) return;

    uuidCache.set(data.user_code, data.id);
    peerUuid = data.id;
    remoteDescriptionSet = false;
    pendingCandidates = [];

    patch({
      phase: "ringing-in",
      kind: (row.payload.call as CallKind) ?? "audio",
      peer: {
        publicId: data.user_code,
        displayName: data.display_name,
        tone: data.tone,
        avatarUrl: data.avatar_url,
      },
      micOn: true,
      cameraOn: true,
      sharing: false,
      connectedAt: null,
      notice: null,
    });
    incomingOffer = row.payload.sdp as RTCSessionDescriptionInit;
    startRinger();
    return;
  }

  if (!state.peer) return; // No call in progress on this side.

  if (row.kind === "answer") {
    if (!pc) return;
    stopRinger();
    if (ringTimeout) clearTimeout(ringTimeout);
    ringTimeout = null;
    try {
      await pc.setRemoteDescription(row.payload.sdp as RTCSessionDescriptionInit);
      remoteDescriptionSet = true;
      for (const candidate of pendingCandidates.splice(0)) {
        await pc.addIceCandidate(candidate);
      }
      patch({ phase: "connected", connectedAt: Date.now() });
    } catch {
      endCall("call.unavailable");
    }
    return;
  }

  // Candidates may trickle in before the peer connection exists (while the phone is
  // still ringing), so they are queued and flushed once the remote description is set.
  if (row.kind === "candidate") {
    const candidate = row.payload.candidate as RTCIceCandidateInit | undefined;
    if (!candidate) return;
    if (pc && remoteDescriptionSet) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // Late or duplicated candidate; the connection survives.
      }
    } else {
      pendingCandidates.push(candidate);
    }
    return;
  }

  if (row.kind === "decline") {
    endCall("call.declined");
    return;
  }

  if (row.kind === "hangup") {
    endCall(state.phase === "connected" ? null : "call.noAnswer");
  }
}

function createPeerConnection(): RTCPeerConnection {
  const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  if (localStream) {
    for (const track of localStream.getTracks()) {
      connection.addTrack(track, localStream);
    }
  }

  connection.onicecandidate = (event) => {
    if (event.candidate) void sendSignal("candidate", { candidate: event.candidate.toJSON() });
  };

  connection.ontrack = (event) => {
    remoteStream = event.streams[0] ?? null;
    patch({ remoteStream });
  };

  connection.onconnectionstatechange = () => {
    if (connection.connectionState === "failed") endCall("call.unavailable");
  };

  return connection;
}

async function getMedia(kind: CallKind): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(
    kind === "video"
      ? { audio: true, video: { width: { ideal: 1280 }, facingMode: "user" } }
      : { audio: true, video: false },
  );
}

/** Ends the call locally, optionally telling the other side, and shows a notice. */
function endCall(notice?: string | null): void {
  stopRinger();
  if (ringTimeout) clearTimeout(ringTimeout);
  ringTimeout = null;

  localStream?.getTracks().forEach((track) => track.stop());
  screenTrack?.stop();
  try {
    pc?.close();
  } catch {
    // Already closed.
  }

  pc = null;
  localStream = null;
  remoteStream = null;
  screenTrack = null;
  incomingOffer = null;
  peerUuid = null;
  pendingCandidates = [];
  remoteDescriptionSet = false;

  patch({
    phase: "idle",
    peer: null,
    micOn: true,
    cameraOn: true,
    sharing: false,
    connectedAt: null,
    notice: notice ?? null,
    localStream: null,
    remoteStream: null,
  });
}

/* ------------------------------------------------------------------ actions */

async function startCall(peer: CallPeer, kind: CallKind): Promise<void> {
  if (state.phase !== "idle") return;
  if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    patch({ notice: "call.notSupported" });
    return;
  }

  const sb = getSupabase();
  const me = await ensureMe(sb);
  if (!me) {
    patch({ notice: "call.signin" });
    return;
  }

  const other = await lookupUuid(sb, peer.publicId);
  if (!other) {
    patch({ notice: "call.unavailable" });
    return;
  }

  peerUuid = other;
  uuidCache.set(peer.publicId, other);
  patch({ phase: "ringing-out", kind, peer, notice: null });
  ensureSubscribed();

  try {
    localStream = await getMedia(kind);
  } catch {
    endCall("call.needMedia");
    return;
  }

  patch({ localStream, micOn: true, cameraOn: kind === "video" });

  try {
    pc = createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal("offer", { sdp: offer, call: kind });

    ringTimeout = setTimeout(() => endCall("call.noAnswer"), RING_TIMEOUT_MS);
  } catch {
    endCall("call.unavailable");
  }
}

async function acceptCall(): Promise<void> {
  const offer = incomingOffer;
  const kind = state.kind;
  const peer = state.peer;
  if (!offer || !peer || state.phase !== "ringing-in") return;

  stopRinger();
  if (ringTimeout) clearTimeout(ringTimeout);
  ringTimeout = null;
  patch({ phase: "connecting" });
  ensureSubscribed();

  try {
    localStream = await getMedia(kind);
  } catch {
    void sendSignal("decline", { reason: "busy" });
    endCall("call.needMedia");
    return;
  }

  patch({ localStream, micOn: true, cameraOn: kind === "video" });

  try {
    pc = createPeerConnection();
    await pc.setRemoteDescription(offer);
    remoteDescriptionSet = true;
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal("answer", { sdp: answer });
    for (const candidate of pendingCandidates.splice(0)) {
      await pc.addIceCandidate(candidate);
    }
  } catch {
    endCall("call.unavailable");
  }
}

async function declineCall(): Promise<void> {
  if (state.phase !== "ringing-in") return;
  await sendSignal("decline", { reason: "declined" }).catch(() => undefined);
  endCall(null);
}

async function hangUp(): Promise<void> {
  await sendSignal("hangup").catch(() => undefined);
  endCall(null);
}

function toggleMic(): void {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  patch({ micOn: track.enabled });
}

function toggleCamera(): void {
  const track = localStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  patch({ cameraOn: track.enabled });
}

/** Replaces the outgoing camera with the screen; only offered in video calls. */
async function toggleShare(): Promise<void> {
  if (state.phase !== "connected" && state.phase !== "connecting") return;

  if (state.sharing) {
    stopSharing();
    return;
  }

  const videoSender = pc?.getSenders().find((s) => s.track?.kind === "video");
  if (!videoSender || !navigator.mediaDevices?.getDisplayMedia) {
    patch({ notice: "call.shareUnavailable" });
    return;
  }

  try {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    screenTrack = screen.getVideoTracks()[0] ?? null;
    if (!screenTrack) return;
    await videoSender.replaceTrack(screenTrack);
    screenTrack.onended = () => stopSharing();
    patch({ sharing: true });
  } catch {
    patch({ notice: "call.shareDenied" });
  }
}

function stopSharing(): void {
  if (!state.sharing) return;
  const cameraTrack = localStream?.getVideoTracks()[0] ?? null;
  const videoSender = pc?.getSenders().find((s) => s.track?.kind === "video");
  if (videoSender) void videoSender.replaceTrack(cameraTrack);
  screenTrack?.stop();
  screenTrack = null;
  patch({ sharing: false });
}

function clearNotice(): void {
  if (state.notice) patch({ notice: null });
}

export const callActions = {
  startCall,
  acceptCall,
  declineCall,
  hangUp,
  toggleMic,
  toggleCamera,
  toggleShare,
  clearNotice,
};

/* --------------------------------------------------------------------- hooks */

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): CallState {
  return state;
}

function serverSnapshot(): CallState {
  return state;
}

export function useCall(): { call: CallState; actions: typeof callActions } {
  const call = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { call, actions: callActions };
}
