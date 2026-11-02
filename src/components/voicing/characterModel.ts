import * as THREE from "three";
import type { AvatarDef } from "@/components/voicing/avatars";

/**
 * Procedural voice-room characters, shared by the live stage and the
 * join-screen portrait thumbnails.
 *
 * Design goals (feedback round 2): compact "chibi" proportions (big head,
 * short body) so the models read small on stage, and a sharper look — the
 * boys wear a dark suit with a white shirt and a coloured tie (Corporate
 * Dude style), while the girls keep their fantasy outfits.
 */

export interface BuiltCharacter {
  root: THREE.Group;
  /** Animated while the person speaks. */
  mouth: THREE.Mesh | null;
  /** Materials to dispose (and to pulse with loudness). */
  mats: THREE.MeshStandardMaterial[];
}

export function buildProcedural(def: AvatarDef): BuiltCharacter {
  const root = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const mat = (color: number, opts?: { metal?: number; rough?: number }) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts?.rough ?? 0.45,
      metalness: opts?.metal ?? 0.05,
      emissive: color,
      emissiveIntensity: 0,
    });
    mats.push(m);
    return m;
  };

  const skin = mat(def.skin);
  const hairMat = mat(def.hair);
  const accent = mat(def.color);
  const gold = mat(0xf5c542, { metal: 0.6, rough: 0.3 });
  const dark = mat(0x14202e, { rough: 0.35 });
  // One dark suit shared by the suit-wearing boys (Corporate Dude style).
  const suit = mat(0x232833, { rough: 0.55 });
  const shirt = mat(0xf6f6f2, { rough: 0.6 });
  const tie = mat(def.color, { rough: 0.5 });

  // ---- compact chibi skeleton ------------------------------------------
  // body: capsule r0.34 h0.5 centred at y 0.40  ·  head: sphere r0.46 at y 1.15
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 6, 18), outfitMatFor(def));
  body.position.y = 0.4;
  root.add(body);

  function outfitMatFor(d: AvatarDef): THREE.MeshStandardMaterial {
    // Saleh keeps the white thobe; the other boys get the dark suit; girls
    // wear their own outfit colour.
    return d.shape === "saleh"
      ? mat(0xf2ede2, { rough: 0.65 })
      : d.shape === "omar" || d.shape === "khalid" || d.shape === "yousef"
        ? suit
        : mat(d.color);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 32, 24), skin);
  head.position.y = 1.15;
  root.add(head);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14202e, roughness: 0.3 });
  const eyeGeo = new THREE.SphereGeometry(0.062, 16, 12);
  for (const x of [-0.17, 0.17]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 1.2, 0.4);
    root.add(eye);
  }

  // Serious little eyebrows (the Corporate Dude look).
  for (const x of [-0.17, 0.17]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.028, 0.03), hairMat);
    brow.position.set(x, 1.3, 0.41);
    brow.rotation.z = x < 0 ? -0.12 : 0.12;
    root.add(brow);
  }

  // The mouth is what the stage animates while the person speaks.
  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 12),
    new THREE.MeshStandardMaterial({ color: 0x3a1620, roughness: 0.6 }),
  );
  mouth.scale.set(0.13, 0.03, 0.05);
  mouth.position.set(0, 1.0, 0.43);
  root.add(mouth);

  /** Hair cap: the upper half of a slightly larger sphere. */
  const hairCap = (y = 1.28, r = 0.48, mat2 = hairMat) => {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      mat2,
    );
    cap.position.y = y;
    root.add(cap);
    return cap;
  };
  const hairBack = (y = 1.05, r = 0.42) => {
    const back = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), hairMat);
    back.position.set(0, y, -0.2);
    back.scale.set(0.95, 1.05, 0.8);
    root.add(back);
  };

  /** Suit details: white shirt panel + coloured tie + lapel shadows. */
  const suitUp = () => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.05), shirt);
    panel.position.set(0, 0.55, 0.32);
    root.add(panel);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), tie);
    knot.position.set(0, 0.68, 0.35);
    root.add(knot);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.03), tie);
    blade.position.set(0, 0.52, 0.35);
    root.add(blade);
    for (const x of [-0.2, 0.2]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.06), suit);
      lapel.position.set(x, 0.58, 0.3);
      lapel.rotation.z = x < 0 ? 0.3 : -0.3;
      root.add(lapel);
    }
  };

  switch (def.shape) {
    // ---- boys ------------------------------------------------------
    case "omar": {
      // Maverick mohawk strip, like the reference model.
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.42), hairMat);
      strip.position.set(0, 1.5, -0.02);
      root.add(strip);
      const shave = new THREE.Mesh(
        new THREE.SphereGeometry(0.465, 24, 16, 0, Math.PI * 2, Math.PI / 2.4, Math.PI / 3),
        skin,
      );
      shave.position.y = 1.15;
      root.add(shave);
      suitUp();
      break;
    }
    case "khalid": {
      // Flat-top with a clean fade.
      const flat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.2, 20), hairMat);
      flat.position.y = 1.5;
      root.add(flat);
      hairCap(1.22, 0.47);
      suitUp();
      break;
    }
    case "yousef": {
      // Curly puff + round glasses.
      for (const [x, z] of [
        [-0.16, 0.05],
        [0.16, 0.05],
        [0, 0.22],
      ] as const) {
        const curl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), hairMat);
        curl.position.set(x, 1.52 + (x === 0 ? 0.04 : 0), z);
        root.add(curl);
      }
      hairCap(1.24, 0.47);
      for (const x of [-0.17, 0.17]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 20), dark);
        rim.position.set(x, 1.2, 0.42);
        root.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.11), dark);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(0, 1.22, 0.43);
      root.add(bridge);
      suitUp();
      break;
    }
    case "saleh": {
      // White thobe + shemagh + beard.
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 20), accent);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.72;
      root.add(collar);
      const cloth = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 24, 18),
        mat(0xf2ede2, { rough: 0.7 }),
      );
      cloth.position.y = 1.2;
      cloth.scale.set(1, 0.92, 1);
      root.add(cloth);
      for (const y of [1.5, 1.55]) {
        const agal = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.032, 8, 24), hairMat);
        agal.rotation.x = Math.PI / 2;
        agal.position.y = y;
        root.add(agal);
      }
      const beard = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.055, 8, 20, Math.PI), hairMat);
      beard.rotation.set(0.35, 0, Math.PI);
      beard.position.set(0, 0.94, 0.22);
      root.add(beard);
      break;
    }
    // ---- fantasy girls ----------------------------------------------
    case "luna": {
      // Translucent fairy wings.
      for (const x of [-0.44, 0.44]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), accent);
        wing.position.set(x, 0.7, -0.24);
        wing.scale.set(0.55, 1.05, 0.1);
        wing.rotation.z = x < 0 ? 0.55 : -0.55;
        root.add(wing);
      }
      hairCap(1.26, 0.49);
      hairBack(0.92);
      const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.022, 8, 24), gold);
      tiara.rotation.x = Math.PI / 2 - 0.25;
      tiara.position.y = 1.52;
      root.add(tiara);
      const petalDress = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.72, 20), mat(def.color));
      petalDress.position.y = 0.18;
      root.add(petalDress);
      break;
    }
    case "aria": {
      hairCap(1.28, 0.48);
      hairBack(0.94);
      // Long pointed elf ears.
      for (const x of [-0.44, 0.44]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 8), skin);
        ear.position.set(x, 1.22, 0.02);
        ear.rotation.z = x < 0 ? -Math.PI / 2 + 0.35 : Math.PI / 2 - 0.35;
        root.add(ear);
      }
      const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 8, 24), gold);
      circlet.rotation.x = Math.PI / 2 - 0.2;
      circlet.position.y = 1.48;
      root.add(circlet);
      const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.7, 20), mat(def.color));
      cloak.position.y = 0.2;
      root.add(cloak);
      break;
    }
    case "nova": {
      hairCap(1.24, 0.48);
      hairBack(0.9);
      // Sorceress hat: brim + tall tilted cone + star.
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.6, 0.05, 24), mat(def.color));
      brim.position.y = 1.44;
      root.add(brim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.8, 20), mat(def.color));
      cone.position.set(0.05, 1.84, 0);
      cone.rotation.z = -0.12;
      root.add(cone);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), accent);
      star.position.set(0.12, 2.26, 0.05);
      root.add(star);
      const gown = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.7, 20), mat(def.accent));
      gown.position.y = 0.18;
      root.add(gown);
      break;
    }
    case "yara": {
      hairCap(1.26, 0.5);
      hairBack(0.86);
      for (const x of [-0.3, 0.3]) {
        const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.045, 0.7, 10), hairMat);
        lock.position.set(x, 0.78, 0.1);
        root.add(lock);
      }
      // Crown with small spikes.
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.09, 20), gold);
      band.position.y = 1.54;
      root.add(band);
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 6), gold);
        spike.position.set(Math.cos(ang) * 0.24, 1.64, Math.sin(ang) * 0.24);
        root.add(spike);
      }
      const gown = new THREE.Mesh(new THREE.ConeGeometry(0.54, 0.74, 22), mat(def.color));
      gown.position.y = 0.16;
      root.add(gown);
      break;
    }
  }

  return { root, mouth, mats };
}
