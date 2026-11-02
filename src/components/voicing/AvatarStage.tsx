"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getAvatar, type AvatarDef } from "@/components/voicing/avatars";
import { buildProcedural } from "@/components/voicing/characterModel";

export interface StageMember {
  uid: string;
  name: string;
  avatar: string;
  side: "left" | "right";
  role: "owner" | "mod" | "member";
  muted: boolean;
}

interface Props {
  members: StageMember[];
  meUid: string;
  /** 0..1 loudness of a participant right now (read every frame). */
  getLevel: (uid: string) => number;
  /** uid -> latest spoken line (translated into the viewer's language). */
  bubbles?: Record<string, string>;
  className?: string;
}

interface AvatarObj {
  uid: string;
  group: THREE.Group;
  body: THREE.Object3D;
  mouth: THREE.Mesh | null;
  morphs: THREE.Mesh[];
  mats: THREE.MeshStandardMaterial[];
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  particles: THREE.Points;
  label: HTMLDivElement;
  bubble: HTMLDivElement;
  level: number;
  phase: number;
  target: THREE.Vector3;
  scale: number;
  def: AvatarDef;
}

export function AvatarStage({ members, meUid, getLevel, bubbles, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const membersRef = useRef<StageMember[]>(members);
  const levelRef = useRef(getLevel);
  const syncRef = useRef<(() => void) | null>(null);
  const meRef = useRef(meUid);
  const bubblesRef = useRef(bubbles);

  useEffect(() => {
    membersRef.current = members;
    levelRef.current = getLevel;
    meRef.current = meUid;
    bubblesRef.current = bubbles;
    syncRef.current?.();
  }, [members, getLevel, meUid, bubbles]);

  useEffect(() => {
    const host = hostRef.current;
    const labels = labelsRef.current;
    if (!host || !labels) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 1.4, 11.5);
    camera.lookAt(0, 0.9, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9bb8cc, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 6, 6);
    scene.add(key);

    const ringGeo = new THREE.TorusGeometry(0.75, 0.035, 12, 64);
    const loader = new GLTFLoader();
    const avatars = new Map<string, AvatarObj>();
    const tmp = new THREE.Vector3();

    function makeParticles() {
      const n = 28;
      const pos = new Float32Array(n * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ size: 0.07, transparent: true, opacity: 0, depthWrite: false }),
      );
      pts.frustumCulled = false;
      return pts;
    }

    function create(m: StageMember): AvatarObj {
      const def = getAvatar(m.avatar);
      const { root, mouth, mats } = buildProcedural(def);
      const group = new THREE.Group();
      group.add(root);
      const ringMat = new THREE.MeshBasicMaterial({
        color: def.accent,
        transparent: true,
        opacity: 0.25,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      group.add(ring);
      const particles = makeParticles();
      (particles.material as THREE.PointsMaterial).color.setHex(def.accent);
      group.add(particles);
      scene.add(group);
      const label = document.createElement("div");
      label.className =
        "absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-cova-ink shadow-sm";
      labels!.appendChild(label);
      // Speech bubble shown under the character while they have a line.
      const bubble = document.createElement("div");
      bubble.className =
        "absolute hidden max-w-44 -translate-x-1/2 rounded-xl bg-cova-ink/90 px-2.5 py-1.5 text-center text-[11px] leading-snug text-white shadow-md";
      labels!.appendChild(bubble);
      const obj: AvatarObj = {
        uid: m.uid,
        group,
        body: root,
        mouth,
        morphs: [],
        mats,
        ring,
        ringMat,
        particles,
        label,
        bubble,
        level: 0,
        phase: Math.random() * 6,
        target: new THREE.Vector3(),
        scale: 1,
        def,
      };

      if (def.glb) {
        loader.load(def.glb, (gltf) => {
          if (!avatars.has(m.uid)) return;
          root.clear();
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const h = box.max.y - box.min.y || 1;
          model.scale.setScalar(2.2 / h);
          model.position.y = -box.min.y * (2.2 / h);
          root.add(model);
          obj.mouth = null;
          obj.mats = [];
          model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            const dict = mesh.morphTargetDictionary;
            if (dict && mesh.morphTargetInfluences) {
              const hit = Object.keys(dict).find((k) => /jaw|mouthopen|viseme_aa/i.test(k));
              if (hit) obj.morphs.push(mesh);
            }
          });
        });
      }
      return obj;
    }

    function layout() {
      const list = membersRef.current;
      (["left", "right"] as const).forEach((side) => {
        const sideList = list.filter((m) => m.side === side);
        const rows = Math.max(1, Math.ceil(sideList.length / 2));
        const scale = Math.min(0.85, 1.9 / rows);
        sideList.forEach((m, i) => {
          const a = avatars.get(m.uid);
          if (!a) return;
          const col = i % 2;
          const row = Math.floor(i / 2);
          const dir = side === "left" ? -1 : 1;
          a.target.set(
            dir * (2.4 + col * 1.55 * scale),
            (rows - 1 - row) * 1.9 * scale - (rows - 1) * 0.95 * scale,
            -col * 0.7,
          );
          a.scale = scale;
        });
      });
    }

    function sync() {
      const list = membersRef.current;
      const ids = new Set(list.map((m) => m.uid));
      for (const [uid, a] of avatars) {
        if (!ids.has(uid)) {
          scene.remove(a.group);
          a.label.remove();
          a.bubble.remove();
          a.mats.forEach((m) => m.dispose());
          a.ringMat.dispose();
          avatars.delete(uid);
        }
      }
      for (const m of list) {
        const existing = avatars.get(m.uid);
        if (existing && existing.def.id !== m.avatar) {
          scene.remove(existing.group);
          existing.label.remove();
          existing.bubble.remove();
          avatars.delete(m.uid);
        }
        if (!avatars.has(m.uid)) {
          const a = create(m);
          a.group.position.set(m.side === "left" ? -9 : 9, 0, 0);
          avatars.set(m.uid, a);
        }
        const a = avatars.get(m.uid)!;
        const crown = m.role === "owner" ? "👑 " : m.role === "mod" ? "🛡 " : "";
        a.label.textContent = `${crown}${m.name}${m.uid === meRef.current ? " •" : ""}${m.muted ? " 🔇" : ""}`;
      }
      layout();
    }
    syncRef.current = sync;
    sync();

    function resize() {
      const w = host!.clientWidth;
      const h = host!.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(h, 1);
      camera.position.z = camera.aspect < 1.1 ? 15 : 11;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const clock = new THREE.Clock();
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function frame() {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const w = host!.clientWidth;
      const h = host!.clientHeight;

      for (const a of avatars.values()) {
        const raw = levelRef.current(a.uid);
        a.level += (raw - a.level) * Math.min(1, dt * 14);
        const speaking = a.level > 0.08;
        const lv = a.level;

        a.group.position.lerp(a.target, Math.min(1, dt * 5));
        const s = a.scale * (1 + (reduce ? 0 : lv * 0.07));
        a.group.scale.setScalar(s);
        a.body.position.y = reduce
          ? 0
          : Math.sin(t * 1.6 + a.phase) * 0.03 +
            (speaking ? Math.abs(Math.sin(t * 9)) * lv * 0.06 : 0);
        a.group.rotation.y = (a.group.position.x < 0 ? 0.35 : -0.35) * 0.6;

        if (a.mouth) {
          const open =
            0.03 + lv * 0.2 + (speaking ? Math.abs(Math.sin(t * 14 + a.phase)) * 0.05 * lv : 0);
          a.mouth.scale.y = open;
        }
        for (const mesh of a.morphs) {
          const infl = mesh.morphTargetInfluences;
          const dict = mesh.morphTargetDictionary;
          if (!infl || !dict) continue;
          for (const k of Object.keys(dict))
            if (/jaw|mouthopen|viseme_aa/i.test(k)) infl[dict[k]!] = Math.min(1, lv * 1.4);
        }
        for (const m of a.mats) m.emissiveIntensity = lv * 0.55;

        a.ringMat.opacity = 0.2 + lv * 0.8;
        a.ring.scale.setScalar(1 + lv * 0.5 + (speaking && !reduce ? Math.sin(t * 6) * 0.05 : 0));

        const pm = a.particles.material as THREE.PointsMaterial;
        pm.opacity = Math.min(1, lv * 1.6);
        const arr = a.particles.geometry.getAttribute("position") as THREE.BufferAttribute;
        const n = arr.count;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + t * (0.8 + (i % 3) * 0.25);
          const r = 0.9 + ((t * 0.9 + i * 0.37) % 1) * (0.5 + lv);
          arr.setXYZ(
            i,
            Math.cos(ang) * r,
            0.2 + ((t * 0.7 + i * 0.21) % 1) * 2.0,
            Math.sin(ang) * r * 0.5,
          );
        }
        arr.needsUpdate = true;

        tmp
          .copy(a.group.position)
          .add(new THREE.Vector3(0, 1.75 * a.scale, 0))
          .project(camera);
        a.label.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`;
        a.label.style.top = `${(-tmp.y * 0.5 + 0.5) * h + 2}px`;

        const line = bubblesRef.current?.[a.uid] ?? "";
        if (line) {
          a.bubble.textContent = line;
          a.bubble.style.display = "block";
          tmp
            .copy(a.group.position)
            .add(new THREE.Vector3(0, -0.55 * a.scale, 0))
            .project(camera);
          a.bubble.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`;
          a.bubble.style.top = `${(-tmp.y * 0.5 + 0.5) * h + 2}px`;
        } else {
          a.bubble.style.display = "none";
        }
      }
      renderer.render(scene, camera);
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      syncRef.current = null;
      for (const a of avatars.values()) {
        a.label.remove();
        a.bubble.remove();
        a.mats.forEach((m) => m.dispose());
        a.ringMat.dispose();
      }
      ringGeo.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={hostRef} className={`relative overflow-hidden ${className ?? ""}`}>
      <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
    </div>
  );
}
