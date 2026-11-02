import * as THREE from "three";
import { AVATARS } from "@/components/voicing/avatars";
import { buildProcedural } from "@/components/voicing/characterModel";

/**
 * Renders every character once to a small PNG (head-and-shoulders portrait)
 * so the join screen can show real character thumbnails inside the circles.
 * One offscreen WebGL context renders all eight, then is thrown away; the
 * data-URLs are cached for the whole session. Falls back to `null` when
 * WebGL is unavailable (the picker then shows coloured circles).
 */

const cache = new Map<string, string>();
let pending: Promise<void> | null = null;

/** Cached portrait for a character id, or null before it is rendered. */
export function avatarPortrait(id: string): string | null {
  return cache.get(id) ?? null;
}

/** Renders all portraits once; safe to call from many components. */
export function ensurePortraits(): Promise<void> {
  if (!pending) pending = renderAll();
  return pending;
}

async function renderAll(): Promise<void> {
  if (typeof window === "undefined") return;
  const size = 144;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    return; // no WebGL — the picker keeps its gradient fallback
  }
  try {
    renderer.setSize(size, size, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9bb8cc, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 1.1);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0.5, 1.28, 2.9);
    camera.lookAt(0, 1.02, 0);

    for (const def of AVATARS) {
      const { root, mats } = buildProcedural(def);
      root.rotation.y = 0.45;
      scene.add(root);
      renderer.render(scene, camera);
      cache.set(def.id, renderer.domElement.toDataURL("image/png"));
      scene.remove(root);
      mats.forEach((m) => m.dispose());
      // Yield so the picker can paint between characters.
      await new Promise((r) => window.setTimeout(r, 0));
    }
  } finally {
    renderer.dispose();
  }
}
