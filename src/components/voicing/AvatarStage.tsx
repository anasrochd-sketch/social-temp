"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getAvatar, type AvatarDef } from "@/components/voicing/avatars";

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
  level: number;
  phase: number;
  target: THREE.Vector3;
  scale: number;
  def: AvatarDef;
}

function buildProcedural(def: AvatarDef) {
  const root = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const mat = (color: number, opts?: { metal?: number; glass?: boolean }) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: opts?.metal ?? 0.05,
      emissive: color,
      emissiveIntensity: 0,
      transparent: !!opts?.glass,
      opacity: opts?.glass ? 0.55 : 1,
    });
    mats.push(m);
    return m;
  };
  const skin = mat(def.skin);
  const hairMat = mat(def.hair);
  const outfit = mat(def.color);
  const accent = mat(def.accent);
  const gold = mat(0xf5c542, { metal: 0.6 });
  const dark = mat(0x14202e, { metal: 0.2 });

  // Shared body + head so every character fills the stage the same way.
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.6, 6, 16), outfit);
  body.position.y = 0.55;
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), skin);
  head.position.y = 1.5;
  root.add(head);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14202e, roughness: 0.3 });
  const eyeGeo = new THREE.SphereGeometry(0.07, 16, 12);
  for (const x of [-0.19, 0.19]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 1.58, 0.42);
    root.add(eye);
  }

  // The mouth is what the stage animates while the person speaks.
  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 12),
    new THREE.MeshStandardMaterial({ color: 0x3a1620, roughness: 0.6 }),
  );
  mouth.scale.set(0.15, 0.03, 0.05);
  mouth.position.set(0, 1.36, 0.47);
  root.add(mouth);

  /** Hair cap: the upper half of a slightly larger sphere. */
  const hairCap = (y = 1.66, r = 0.52) => {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      hairMat,
    );
    cap.position.y = y;
    root.add(cap);
    return cap;
  };
  const hairBack = (y = 1.42) => {
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 14), hairMat);
    back.position.set(0, y, -0.22);
    back.scale.set(0.95, 1.05, 0.8);
    root.add(back);
  };

  switch (def.shape) {
    // ---- boys ------------------------------------------------------
    case "omar": {
      hairCap();
      // Hoodie hood folded around the neck.
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.13, 10, 24), outfit);
      hood.rotation.x = Math.PI / 2.15;
      hood.position.y = 1.08;
      root.add(hood);
      // Kangaroo pocket line.
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.06), accent);
      pocket.position.set(0, 0.52, 0.4);
      root.add(pocket);
      break;
    }
    case "khalid": {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.52, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2.2),
        hairMat,
      );
      dome.position.y = 1.7;
      root.add(dome);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 20), hairMat);
      brim.position.set(0, 1.72, 0.42);
      root.add(brim);
      const zip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.04), accent);
      zip.position.set(0, 0.72, 0.41);
      root.add(zip);
      break;
    }
    case "yousef": {
      hairCap(1.63, 0.51);
      hairBack(1.5);
      // Round glasses.
      for (const x of [-0.19, 0.19]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 20), dark);
        rim.position.set(x, 1.58, 0.47);
        root.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12), dark);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(0, 1.6, 0.48);
      root.add(bridge);
      break;
    }
    case "saleh": {
      // White thobe collar.
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 20), accent);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 1.02;
      root.add(collar);
      // Shemagh cloth over the head with the black agal on top.
      const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 18), mat(0xf2ede2));
      cloth.position.y = 1.58;
      cloth.scale.set(1, 0.92, 1);
      root.add(cloth);
      for (const y of [1.9, 1.95]) {
        const agal = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24), hairMat);
        agal.rotation.x = Math.PI / 2;
        agal.position.y = y;
        root.add(agal);
      }
      break;
    }
    // ---- fantasy girls ----------------------------------------------
    case "luna": {
      // Translucent fairy wings.
      for (const x of [-0.55, 0.55]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), accent);
        wing.position.set(x, 0.95, -0.3);
        wing.scale.set(0.55, 1.05, 0.1);
        wing.rotation.z = x < 0 ? 0.55 : -0.55;
        root.add(wing);
      }
      hairCap(1.62, 0.54);
      hairBack(1.3);
      // Golden tiara.
      const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 24), gold);
      tiara.rotation.x = Math.PI / 2 - 0.25;
      tiara.position.y = 1.92;
      root.add(tiara);
      const petalDress = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 20), outfit);
      petalDress.position.y = 0.28;
      root.add(petalDress);
      break;
    }
    case "aria": {
      hairCap(1.64, 0.52);
      hairBack(1.32);
      // Long pointed elf ears.
      for (const x of [-0.5, 0.5]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 8), skin);
        ear.position.set(x, 1.6, 0.02);
        ear.rotation.z = x < 0 ? -Math.PI / 2 + 0.35 : Math.PI / 2 - 0.35;
        root.add(ear);
      }
      const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.022, 8, 24), gold);
      circlet.rotation.x = Math.PI / 2 - 0.2;
      circlet.position.y = 1.86;
      root.add(circlet);
      const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.85, 20), outfit);
      cloak.position.y = 0.3;
      root.add(cloak);
      break;
    }
    case "nova": {
      hairCap(1.6, 0.52);
      hairBack(1.28);
      // Sorceress hat: brim + tall tilted cone + star.
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.05, 24), outfit);
      brim.position.y = 1.8;
      root.add(brim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 20), outfit);
      cone.position.set(0.05, 2.28, 0);
      cone.rotation.z = -0.12;
      root.add(cone);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), accent);
      star.position.set(0.12, 2.8, 0.05);
      root.add(star);
      break;
    }
    case "yara": {
      hairCap(1.62, 0.54);
      hairBack(1.2);
      for (const x of [-0.34, 0.34]) {
        const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.85, 10), hairMat);
        lock.position.set(x, 1.1, 0.12);
        root.add(lock);
      }
      // Crown with small spikes.
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 20), gold);
      band.position.y = 1.95;
      root.add(band);
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), gold);
        spike.position.set(Math.cos(ang) * 0.28, 2.06, Math.sin(ang) * 0.28);
        root.add(spike);
      }
      const gown = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.95, 22), outfit);
      gown.position.y = 0.25;
      root.add(gown);
      break;
    }
  }
  return { root, mouth, mats };
}

export function AvatarStage({ members, meUid, getLevel, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const membersRef = useRef<StageMember[]>(members);
  const levelRef = useRef(getLevel);
  const syncRef = useRef<(() => void) | null>(null);
  const meRef = useRef(meUid);

  useEffect(() => {
    membersRef.current = members;
    levelRef.current = getLevel;
    meRef.current = meUid;
    syncRef.current?.();
  }, [members, getLevel, meUid]);

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
    camera.position.set(0, 1.6, 11);
    camera.lookAt(0, 1.2, 0);
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
        "absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-cova-ink shadow-sm";
      labels!.appendChild(label);
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
        const scale = Math.min(1, 2.3 / rows);
        sideList.forEach((m, i) => {
          const a = avatars.get(m.uid);
          if (!a) return;
          const col = i % 2;
          const row = Math.floor(i / 2);
          const dir = side === "left" ? -1 : 1;
          a.target.set(
            dir * (2.9 + col * 1.9 * scale),
            (rows - 1 - row) * 2.3 * scale - (rows - 1) * 1.15 * scale,
            -col * 0.8,
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
          .add(new THREE.Vector3(0, -0.15 * a.scale, 0))
          .project(camera);
        a.label.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`;
        a.label.style.top = `${(-tmp.y * 0.5 + 0.5) * h + 4}px`;
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
