"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Signal } from "@/lib/spaces-client";
import { injectKey, injectPointer, injectWheel, ctlVerifyDecision } from "./roomControl";

/**
 * Full-mesh WebRTC audio for voice rooms, hardened for cross-device calls:
 *
 * - Perfect negotiation (polite = larger uid): both sides may offer, glare is
 *   resolved with rollback. Fixes PC<->phone calls where the second side's
 *   microphone arrived after the first answer and could never be renegotiated.
 * - Audio AND video transceivers are pre-created sendrecv, so a late mic
 *   (permission prompt on phones) or a screen share reuses the same m-lines.
 * - Free public TURN relays: PC on home Wi-Fi <-> phone on cellular now
 *   connects even when STUN cannot punch through a symmetric NAT.
 * - Remote audio elements live in the DOM with playsinline and are unlocked
 *   on the join tap + on the next tap anywhere — mobile browsers only allow
 *   playback after a user gesture.
 * - The microphone can be re-requested (retryMic) if the first ask failed.
 *
 * Extras: moderator deafen (all incoming volumes to zero), per-peer volume
 * (dubbing ducks a speaker's raw microphone while their translated voice
 * plays), screen sharing through the same peer connections and a per-pair
 * data channel carrying the remote-control handshake + input events.
 */

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 4,
};

interface Peer {
  pc: RTCPeerConnection;
  /** Hidden <audio> pinned to the DOM so mobile browsers will play it. */
  audio: HTMLAudioElement;
  /** Pre-created sendrecv senders: late mic / screen tracks reuse them. */
  audioTransceiver: RTCRtpTransceiver;
  videoTransceiver: RTCRtpTransceiver;
  /** Second video m-line, reserved for the camera (screen share uses the first). */
  camTransceiver: RTCRtpTransceiver;
  ctl: RTCDataChannel | null;
  analyser: AnalyserNode | null;
  pendingIce: RTCIceCandidateInit[];
  /** Perfect-negotiation bookkeeping (per pair). */
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswerPending: boolean;
  /** Viewer-set volume 0..1 (dubbing ducks it); deafen forces 0. */
  baseVolume: number;
  level: number;
  data: Uint8Array<ArrayBuffer>;
}

/** Remote-control session state (one controller at a time, room-wide). */
export interface RoomVoiceCtl {
  /** Host: I allow control and show this verification code. */
  allowed: boolean;
  code: string | null;
  /** Host: uid of the person controlling my page right now. */
  controlledBy: string | null;
  /** Viewer: uid whose screen I control. */
  controlling: string | null;
  /** Viewer: uid I asked for (waiting to type the code). */
  requested: string | null;
  /** Viewer: the sharer allowed control (broadcast over the data channel). */
  remoteAllowed: boolean;
  /** Viewer: the code the sharer published — the form shows only when set. */
  remoteCode: string | null;
  /** Viewer: uid of whoever controls the sharer's screen right now. */
  remoteCtlBy: string | null;
  /** i18n key of the last problem / status, shown by the overlay. */
  notice: string | null;
}

/** Viewer/host actions exposed by the mesh for the screen-share overlay. */
export interface RoomVoiceCtlActions {
  enableControl: () => void;
  disableControl: () => void;
  requestControl: (uid: string) => void;
  submitCode: (code: string, uid: string) => void;
  cancelRequest: () => void;
  clearNotice: () => void;
  /** Viewer-side input injection toward the peer being controlled. */
  pointer: (x: number, y: number) => void;
  down: (x: number, y: number) => void;
  up: (x: number, y: number) => void;
  wheel: (x: number, y: number, dx: number, dy: number) => void;
  key: (kind: "kd" | "ku", key: string) => void;
}

type CtlMsg =
  | { t: "share"; on: boolean }
  | { t: "ctl-req" }
  | { t: "ctl-verify"; code: string }
  | { t: "ctl-grant" }
  | { t: "ctl-deny"; why?: "wrong" | "busy" | "off" }
  | { t: "ctl-revoke" }
  | { t: "ctl-state"; allowed: boolean; code: string | null; controlledBy: string | null }
  | { t: "cam"; on: boolean; facing: "user" | "environment" }
  | { t: "pt" | "pd" | "pu"; x: number; y: number }
  | { t: "wh"; x: number; y: number; dx: number; dy: number }
  | { t: "kd" | "ku"; key: string };

const EMPTY_CTL: RoomVoiceCtl = {
  allowed: false,
  code: null,
  controlledBy: null,
  controlling: null,
  requested: null,
  remoteAllowed: false,
  remoteCode: null,
  remoteCtlBy: null,
  notice: null,
};

interface Opts {
  enabled: boolean;
  meUid: string;
  peerUids: string[];
  sendSignal: (to: string, payload: unknown) => void;
  onSignal: (fn: (s: Signal) => void) => () => void;
}

export function useVoiceMesh({ enabled, meUid, peerUids, sendSignal, onSignal }: Opts) {
  const [micError, setMicError] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [deafened, setDeafenedState] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteVideos, setRemoteVideos] = useState<Record<string, MediaStream>>({});
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [camFacing, setCamFacing] = useState<"user" | "environment">("user");
  const [remoteCams, setRemoteCams] = useState<Record<string, MediaStream>>({});
  const [remoteCamFacing, setRemoteCamFacing] = useState<Record<string, "user" | "environment">>({});
  const [ctl, setCtl] = useState<RoomVoiceCtl>(EMPTY_CTL);

  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const camFacingRef = useRef<"user" | "environment">("user");
  const retryRef = useRef<(() => void) | null>(null);
  const deafRef = useRef(false);
  const ctlRef = useRef<RoomVoiceCtl>(EMPTY_CTL);
  const sendRef = useRef(sendSignal);
  const meRef = useRef(meUid);
  useEffect(() => {
    sendRef.current = sendSignal;
    meRef.current = meUid;
  });

  const patchCtl = useCallback((part: Partial<RoomVoiceCtl>) => {
    ctlRef.current = { ...ctlRef.current, ...part };
    setCtl(ctlRef.current);
  }, []);

  const measure = (an: AnalyserNode, data: Uint8Array<ArrayBuffer>, prev: number) => {
    an.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const target = Math.min(1, Math.max(0, (rms - 0.015) * 7));
    return prev + (target - prev) * 0.5;
  };

  const mineRef = useRef<{
    analyser: AnalyserNode;
    data: Uint8Array<ArrayBuffer>;
    level: number;
  } | null>(null);

  const getLevel = useCallback((uid: string): number => {
    if (uid === meRef.current) {
      const m = mineRef.current;
      if (!m) return 0;
      m.level = measure(m.analyser, m.data, m.level);
      return m.level;
    }
    const p = peers.current.get(uid);
    if (!p?.analyser) return 0;
    p.level = measure(p.analyser, p.data, p.level);
    return p.level;
  }, []);

  const applyVolume = useCallback((p: Peer) => {
    p.audio.volume = deafRef.current ? 0 : p.baseVolume;
  }, []);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !value));
  }, []);

  /** Moderator deafen: every incoming audio element goes silent. */
  const setDeafened = useCallback(
    (value: boolean) => {
      deafRef.current = value;
      setDeafenedState(value);
      peers.current.forEach(applyVolume);
    },
    [applyVolume],
  );

  /** Duck / restore one speaker's raw microphone (dubbing). */
  const setPeerVolume = useCallback(
    (uid: string, v: number) => {
      const p = peers.current.get(uid);
      if (!p) return;
      p.baseVolume = Math.min(1, Math.max(0, v));
      applyVolume(p);
    },
    [applyVolume],
  );

  /** Unlocks audio playback on phones: must run inside a user gesture. */
  const unlock = useCallback(() => {
    void ctx.current?.resume().catch(() => undefined);
    peers.current.forEach((p) => {
      const pr = p.audio.play();
      if (pr) pr.catch(() => undefined);
    });
  }, []);

  /* ---------------- data channel: share + remote control ---------------- */

  const ctlSend = useCallback((uid: string, msg: CtlMsg): void => {
    const ch = peers.current.get(uid)?.ctl;
    if (ch && ch.readyState === "open") {
      try {
        ch.send(JSON.stringify(msg));
      } catch {
        /* channel closing */
      }
    }
  }, []);

  const ctlBroadcast = useCallback(
    (msg: CtlMsg): void => {
      peers.current.forEach((_p, uid) => ctlSend(uid, msg));
    },
    [ctlSend],
  );

  /** Host: publish allowed/code/controlledBy to every peer (data channels). */
  const broadcastCtlState = useCallback(
    (state: { allowed: boolean; code: string | null; controlledBy: string | null }) => {
      ctlBroadcast({
        t: "ctl-state",
        allowed: state.allowed,
        code: state.code,
        controlledBy: state.controlledBy,
      });
    },
    [ctlBroadcast],
  );

  const handleCtl = useCallback(
    (msg: CtlMsg, uid: string) => {
      const cur = ctlRef.current;
      switch (msg.t) {
        case "share": {
          if (!msg.on && (cur.controlling === uid || cur.requested === uid)) {
            patchCtl({
              controlling: cur.controlling === uid ? null : cur.controlling,
              requested: cur.requested === uid ? null : cur.requested,
              notice: cur.controlling === uid ? "room.ctlRevoked" : cur.notice,
            });
          }
          return;
        }
        case "ctl-req": {
          // I am the host: the viewer will send the code next; nothing to do
          // here beyond a polite rejection when control is not allowed.
          if (!cur.allowed || !cur.code) ctlSend(uid, { t: "ctl-deny" });
          return;
        }
        case "ctl-verify": {
          // Exclusive by design: exactly one controller holds the screen.
          const d = ctlVerifyDecision(cur, uid, msg.code);
          if (d === "grant") {
            ctlSend(uid, { t: "ctl-grant" });
            patchCtl({ controlledBy: uid });
            // Everyone must see the seat is taken, not just the host.
            broadcastCtlState({ ...cur, controlledBy: uid });
          } else {
            ctlSend(uid, {
              t: "ctl-deny",
              why: d === "busy" ? "busy" : d === "off" ? "off" : "wrong",
            });
          }
          return;
        }
        case "ctl-state": {
          // The sharer publishes allowed / code / who controls, so every
          // viewer sees the code-entry form without asking first.
          patchCtl({
            remoteAllowed: !!msg.allowed,
            remoteCode: msg.code ?? null,
            remoteCtlBy: msg.controlledBy ?? null,
          });
          return;
        }
        case "cam": {
          setRemoteCamFacing((prev) => {
            if (msg.on) return { ...prev, [uid]: msg.facing };
            if (!(uid in prev)) return prev;
            const next = { ...prev };
            delete next[uid];
            return next;
          });
          return;
        }
        case "ctl-grant": {
          if (cur.requested === uid) patchCtl({ controlling: uid, requested: null, notice: null });
          return;
        }
        case "ctl-deny": {
          if (cur.requested === uid)
            patchCtl({
              requested: null,
              notice: msg.why === "busy" ? "room.ctlBusy" : "room.ctlWrong",
            });
          return;
        }
        case "ctl-revoke": {
          if (cur.controlling === uid) patchCtl({ controlling: null, notice: "room.ctlRevoked" });
          if (cur.requested === uid) patchCtl({ requested: null });
          return;
        }
        // Input events from the controlling peer — only accepted from them.
        case "pt":
        case "pd":
        case "pu": {
          if (cur.controlledBy !== uid) return;
          injectPointer(
            msg.t === "pt" ? "move" : msg.t === "pd" ? "down" : "up",
            Number(msg.x) * window.innerWidth,
            Number(msg.y) * window.innerHeight,
          );
          return;
        }
        case "wh": {
          if (cur.controlledBy !== uid) return;
          injectWheel(
            Number(msg.x) * window.innerWidth,
            Number(msg.y) * window.innerHeight,
            Number(msg.dx),
            Number(msg.dy),
          );
          return;
        }
        case "kd":
        case "ku": {
          if (cur.controlledBy !== uid) return;
          injectKey(msg.t === "kd" ? "keydown" : "keyup", String(msg.key ?? ""));
          return;
        }
        default:
          return;
      }
    },
    [ctlSend, patchCtl, ctlBroadcast, broadcastCtlState],
  );

  const wireCtl = useCallback(
    (ch: RTCDataChannel, uid: string) => {
      const p = peers.current.get(uid);
      if (!p) return;
      p.ctl = ch;
      ch.onmessage = (event) => {
        try {
          handleCtl(JSON.parse(String(event.data)) as CtlMsg, uid);
        } catch {
          /* malformed message */
        }
      };
      ch.onclose = () => {
        if (p.ctl === ch) p.ctl = null;
        const cur = ctlRef.current;
        if (cur.controlling === uid || cur.requested === uid || cur.controlledBy === uid) {
          const next = {
            controlling: cur.controlling === uid ? null : cur.controlling,
            requested: cur.requested === uid ? null : cur.requested,
            controlledBy: cur.controlledBy === uid ? null : cur.controlledBy,
            notice: cur.controlling === uid ? "room.ctlRevoked" : cur.notice,
          };
          patchCtl(next);
          // I was the host and my controller vanished: re-publish the seat.
          if (cur.controlledBy === uid) broadcastCtlState({ ...cur, controlledBy: null });
        }
      };
    },
    [handleCtl, patchCtl, broadcastCtlState],
  );

  /* ------------------------------ peers ------------------------------ */

  const addVideo = useCallback((uid: string, s: MediaStream) => {
    setRemoteVideos((prev) => (prev[uid] === s ? prev : { ...prev, [uid]: s }));
  }, []);
  const dropVideo = useCallback((uid: string) => {
    setRemoteVideos((prev) => {
      if (!(uid in prev)) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, []);
  const addCam = useCallback((uid: string, s: MediaStream) => {
    setRemoteCams((prev) => (prev[uid] === s ? prev : { ...prev, [uid]: s }));
  }, []);
  const dropCam = useCallback((uid: string) => {
    setRemoteCams((prev) => {
      if (!(uid in prev)) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, []);

  const ensurePeer = useCallback(
    (uid: string): Peer => {
      const existing = peers.current.get(uid);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE);
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);

      const peer: Peer = {
        pc,
        audio,
        audioTransceiver: pc.addTransceiver("audio", { direction: "sendrecv" }),
        videoTransceiver: pc.addTransceiver("video", { direction: "sendrecv" }),
        camTransceiver: pc.addTransceiver("video", { direction: "sendrecv" }),
        ctl: null,
        analyser: null,
        pendingIce: [],
        makingOffer: false,
        ignoreOffer: false,
        settingRemoteAnswerPending: false,
        baseVolume: 1,
        level: 0,
        data: new Uint8Array(new ArrayBuffer(512)),
      };
      peers.current.set(uid, peer);
      applyVolume(peer);

      // Perfect negotiation: the peer with the larger uid is polite.
      const polite = meRef.current > uid;
      const sendDescription = (d: RTCSessionDescriptionInit) =>
        sendRef.current(uid, { kind: "sdp", description: d });

      pc.onnegotiationneeded = () => {
        const work = async () => {
          try {
            peer.makingOffer = true;
            await pc.setLocalDescription();
            if (pc.localDescription) sendDescription(pc.localDescription);
          } catch {
            /* negotiation can fail if the peer vanished */
          } finally {
            peer.makingOffer = false;
          }
        };
        void work();
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) sendRef.current(uid, { kind: "ice", candidate: e.candidate.toJSON() });
      };

      pc.ontrack = (e) => {
        const track = e.track;
        const remote = e.streams[0] ?? new MediaStream([track]);
        if (track.kind === "audio") {
          peer.audio.srcObject = remote;
          const pr = peer.audio.play();
          if (pr) pr.catch(() => undefined);
          if (ctx.current && !peer.analyser) {
            const an = ctx.current.createAnalyser();
            an.fftSize = 512;
            ctx.current.createMediaStreamSource(remote).connect(an);
            peer.analyser = an;
            peer.data = new Uint8Array(new ArrayBuffer(an.fftSize));
          }
          return;
        }
        // Two video m-lines exist: the first carries a shared screen, the
        // second a camera. The transceiver object is the unambiguous label.
        if (e.transceiver === peer.camTransceiver) {
          addCam(uid, remote);
          track.onended = () => dropCam(uid);
          track.onmute = () => dropCam(uid);
          track.onunmute = () => addCam(uid, remote);
        } else {
          addVideo(uid, remote);
          track.onended = () => dropVideo(uid);
          track.onmute = () => dropVideo(uid);
          track.onunmute = () => addVideo(uid, remote);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          try {
            pc.restartIce();
          } catch {
            /* older browsers */
          }
        }
      };

      // Exactly one control channel per pair: the impolite side creates it,
      // the polite side picks it up. It rides in the first SDP either way.
      if (!polite) wireCtl(pc.createDataChannel("cova-ctl"), uid);
      pc.ondatachannel = (event) => wireCtl(event.channel, uid);

      return peer;
    },
    [addVideo, applyVolume, dropVideo, wireCtl],
  );

  /* --------------------- microphone (with retry) --------------------- */

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    ctx.current = ac;

    const use = (s: MediaStream) => {
      if (cancelled) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = s;
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(s).connect(an);
      mineRef.current = {
        analyser: an,
        data: new Uint8Array(new ArrayBuffer(an.fftSize)),
        level: 0,
      };
      const track = s.getAudioTracks()[0] ?? null;
      peers.current.forEach((p) => {
        // addTrack reuses the pre-created sendrecv audio transceiver — no new
        // m-line, and perfect negotiation fixes the direction even if needed.
        if (track && !p.pc.getSenders().some((snd) => snd.track === track))
          try {
            p.pc.addTrack(track, s);
          } catch {
            /* peer closing */
          }
      });
      setMicError(false);
    };

    const request = () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicError(true);
        return;
      }
      navigator.mediaDevices
        .getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        })
        .then(use)
        .catch(() => {
          if (!cancelled) setMicError(true);
        });
    };
    request();
    retryRef.current = () => {
      if (!cancelled) request();
    };

    const peerMap = peers.current;
    return () => {
      cancelled = true;
      retryRef.current = null;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      mineRef.current = null;
      // Leaving the room also drops sharing / camera / control / remote state.
      const sTrack = screenTrack.current;
      screenTrack.current = null;
      if (sTrack) sTrack.stop();
      const cTrack = camTrackRef.current;
      camTrackRef.current = null;
      if (cTrack) cTrack.stop();
      peerMap.forEach((p) => {
        p.pc.close();
        p.audio.srcObject = null;
        p.audio.remove();
      });
      peerMap.clear();
      void ac.close().catch(() => undefined);
      if (ctx.current === ac) ctx.current = null;
      setSharing(false);
      setShareNotice(null);
      setRemoteVideos({});
      setCamStream(null);
      setCamFacing("user");
      camFacingRef.current = "user";
      setRemoteCams({});
      setRemoteCamFacing({});
      ctlRef.current = EMPTY_CTL;
      setCtl(EMPTY_CTL);
    };
  }, [enabled]);

  const retryMic = useCallback(() => {
    retryRef.current?.();
  }, []);

  /* --------------------- open/close with membership --------------------- */

  const peerKey = peerUids.join("|");
  useEffect(() => {
    if (!enabled) return;
    const want = new Set(peerUids.filter((u) => u !== meUid));
    want.forEach((uid) => {
      ensurePeer(uid);
      const p = peers.current.get(uid);
      // Existing members already receive my mic/screen through addTrack above.
      if (stream.current) {
        const track = stream.current.getAudioTracks()[0];
        if (track && p && !p.pc.getSenders().some((snd) => snd.track === track)) {
          try {
            p.pc.addTrack(track, stream.current);
          } catch {
            /* peer closing */
          }
        }
      }
      if (screenTrack.current && p) {
        try {
          p.videoTransceiver.sender.replaceTrack(screenTrack.current);
        } catch {
          /* peer closing */
        }
      }
      if (camTrackRef.current && p) {
        try {
          p.camTransceiver.sender.replaceTrack(camTrackRef.current);
        } catch {
          /* peer closing */
        }
      }
    });
    peers.current.forEach((p, uid) => {
      if (!want.has(uid)) {
        p.pc.close();
        p.audio.srcObject = null;
        p.audio.remove();
        peers.current.delete(uid);
        dropVideo(uid);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, peerKey, meUid, ensurePeer, dropVideo]);

  /* --------------------------- signaling --------------------------- */

  useEffect(() => {
    if (!enabled) return;
    const handler = async ({ from, payload }: Signal) => {
      const msg = payload as
        | { kind: "sdp"; description: RTCSessionDescriptionInit }
        | { kind: "ice"; candidate: RTCIceCandidateInit };
      const p = ensurePeer(from);
      try {
        if (msg.kind === "sdp") {
          const description = msg.description;
          const readyForOffer =
            !p.makingOffer &&
            (p.pc.signalingState === "stable" || p.settingRemoteAnswerPending);
          const offerCollision = description.type === "offer" && !readyForOffer;
          const polite = meRef.current > from;
          p.ignoreOffer = !polite && offerCollision;
          if (p.ignoreOffer) return;
          const answering = description.type === "answer";
          p.settingRemoteAnswerPending = answering;
          try {
            await p.pc.setRemoteDescription(description);
            for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c);
            if (description.type === "offer") {
              await p.pc.setLocalDescription();
              if (p.pc.localDescription)
                sendRef.current(from, { kind: "sdp", description: p.pc.localDescription });
            }
          } finally {
            p.settingRemoteAnswerPending = false;
          }
        } else {
          if (p.pc.remoteDescription) await p.pc.addIceCandidate(msg.candidate);
          else p.pendingIce.push(msg.candidate);
        }
      } catch {
        /* stale signal for a closed connection */
      }
    };
    return onSignal((s) => void handler(s));
  }, [enabled, ensurePeer, onSignal]);

  /* ------------------------ screen sharing ------------------------ */

  const stopShare = useCallback(() => {
    const track = screenTrack.current;
    screenTrack.current = null;
    setScreenStream(null);
    if (track) track.stop();
    peers.current.forEach((p) => {
      const sender = p.videoTransceiver.sender; // screen m-line only, not the camera
      if (sender.track) {
        try {
          p.pc.removeTrack(sender); // remote track ends -> overlay disappears
        } catch {
          /* peer closing */
        }
      }
    });
    setSharing(false);
    ctlBroadcast({ t: "share", on: false });
    // Sharing stopped -> remote control must stop with it.
    const cur = ctlRef.current;
    if (cur.controlledBy) ctlSend(cur.controlledBy, { t: "ctl-revoke" });
    if (cur.allowed || cur.controlledBy) {
      patchCtl({ allowed: false, code: null, controlledBy: null });
      broadcastCtlState({ allowed: false, code: null, controlledBy: null });
    }
  }, [ctlBroadcast, ctlSend, patchCtl, broadcastCtlState]);

  const toggleShare = useCallback(async () => {
    if (sharing) {
      stopShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setShareNotice("room.shareDenied");
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screen.getVideoTracks()[0] ?? null;
      if (!track) return;
      screenTrack.current = track;
      setScreenStream(screen);
      peers.current.forEach((p) => {
        try {
          // Explicit screen m-line: the camera has its own transceiver.
          p.videoTransceiver.sender.replaceTrack(track);
        } catch {
          /* peer closing */
        }
      });
      track.onended = () => stopShare();
      setSharing(true);
      setShareNotice(null);
      ctlBroadcast({ t: "share", on: true });
    } catch {
      setScreenStream(null);
      setShareNotice("room.shareDenied");
    }
  }, [ctlBroadcast, sharing, stopShare]);

  /* ----------------------------- camera ----------------------------- */

  const stopCam = useCallback(() => {
    const track = camTrackRef.current;
    camTrackRef.current = null;
    setCamStream(null);
    if (track) track.stop();
    peers.current.forEach((p) => {
      try {
        p.camTransceiver.sender.replaceTrack(null); // remote track mutes -> tile disappears
      } catch {
        /* peer closing */
      }
    });
    ctlBroadcast({ t: "cam", on: false, facing: camFacingRef.current });
  }, [ctlBroadcast]);

  /** Opens my camera and streams it to the whole room (screen share keeps working). */
  const toggleCam = useCallback(async () => {
    if (camTrackRef.current) {
      stopCam();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setShareNotice("room.camDenied");
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: camFacingRef.current, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const track = cam.getVideoTracks()[0] ?? null;
      if (!track) {
        cam.getTracks().forEach((tr) => tr.stop());
        setShareNotice("room.camDenied");
        return;
      }
      camTrackRef.current = track;
      setCamStream(cam);
      setShareNotice(null);
      peers.current.forEach((p) => {
        try {
          p.camTransceiver.sender.replaceTrack(track);
        } catch {
          /* peer closing */
        }
      });
      ctlBroadcast({ t: "cam", on: true, facing: camFacingRef.current });
    } catch {
      setShareNotice("room.camDenied");
    }
  }, [ctlBroadcast, stopCam]);

  /** Front <-> back camera (phones): re-opens the device and swaps the track. */
  const flipCam = useCallback(async () => {
    if (!camTrackRef.current) return;
    const next = camFacingRef.current === "user" ? "environment" : "user";
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: next }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const track = cam.getVideoTracks()[0] ?? null;
      if (!track) {
        cam.getTracks().forEach((tr) => tr.stop());
        return;
      }
      camTrackRef.current?.stop();
      camTrackRef.current = track;
      camFacingRef.current = next;
      setCamFacing(next);
      setCamStream(cam);
      peers.current.forEach((p) => {
        try {
          p.camTransceiver.sender.replaceTrack(track);
        } catch {
          /* peer closing */
        }
      });
      ctlBroadcast({ t: "cam", on: true, facing: next });
    } catch {
      // One-camera devices (most laptops) cannot flip — keep the current view.
      setShareNotice("room.camFlipFail");
    }
  }, [ctlBroadcast]);

  /* ----------------------- remote control API ----------------------- */

  const ctlActions: RoomVoiceCtlActions = {
    /** Host: show the verification code and allow one controller. */
    enableControl: () => {
      if (!screenTrack.current) {
        patchCtl({ notice: "room.ctlNeedShare" });
        return;
      }
      const next = {
        allowed: true,
        code: String(Math.floor(100000 + Math.random() * 900000)),
        controlledBy: ctlRef.current.controlledBy,
      };
      patchCtl(next);
      // Publish so every viewer sees the code-entry form immediately.
      broadcastCtlState(next);
    },
    /** Host: stop allowing control and kick the controller out. */
    disableControl: () => {
      const cur = ctlRef.current;
      if (cur.controlledBy) ctlSend(cur.controlledBy, { t: "ctl-revoke" });
      patchCtl({ allowed: false, code: null, controlledBy: null });
      broadcastCtlState({ allowed: false, code: null, controlledBy: null });
    },
    /** Viewer: ask to control; the host verifies the code shown on screen. */
    requestControl: (uid: string) => {
      const p = peers.current.get(uid);
      if (!p?.ctl || p.ctl.readyState !== "open") {
        patchCtl({ notice: "room.ctlUnavailable" });
        return;
      }
      ctlSend(uid, { t: "ctl-req" });
      patchCtl({ requested: uid, notice: null });
    },
    /** Viewer: send the 6-digit code to the named sharer (one controller max). */
    submitCode: (code: string, uid: string) => {
      const clean = code.replace(/\D/g, "").slice(0, 6);
      if (clean.length !== 6) return;
      patchCtl({ requested: uid, notice: null });
      ctlSend(uid, { t: "ctl-verify", code: clean });
    },
    cancelRequest: () => patchCtl({ requested: null }),
    clearNotice: () => {
      if (ctlRef.current.notice) patchCtl({ notice: null });
      if (shareNotice) setShareNotice(null);
    },
    pointer: (x, y) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: "pt", x, y });
    },
    down: (x, y) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: "pd", x, y });
    },
    up: (x, y) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: "pu", x, y });
    },
    wheel: (x, y, dx, dy) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: "wh", x, y, dx, dy });
    },
    key: (kind, key) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: kind, key });
    },
  };

  /* -------- one-time tap-anywhere audio unlock (mobile autoplay) -------- */
  useEffect(() => {
    if (!enabled) return;
    let done = false;
    const h = () => {
      if (done) return;
      done = true;
      unlock();
    };
    window.addEventListener("pointerdown", h, { once: true });
    return () => window.removeEventListener("pointerdown", h);
  }, [enabled, unlock]);

  return {
    getLevel,
    micError,
    muted,
    setMuted,
    retryMic,
    deafened,
    setDeafened,
    setPeerVolume,
    unlock,
    sharing,
    toggleShare,
    shareNotice,
    screenStream,
    remoteVideos,
    camOn: !!camStream,
    camStream,
    camFacing,
    toggleCam,
    flipCam,
    remoteCams,
    remoteCamFacing,
    ctl,
    ctlActions,
  };
}
