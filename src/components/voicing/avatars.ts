/**
 * Voice-room characters. Each entry is built procedurally in AvatarStage
 * (no external models needed): body outfit + head + hair + character pieces.
 *
 * `color` drives the outfit, `skin`/`hair` the head, `accent` the ring,
 * particles and small details. `glb` stays reserved for future real models.
 */
export interface AvatarDef {
  id: string;
  label: string;
  /** Outfit color. */
  color: number;
  /** Ring / particles / details. */
  accent: number;
  skin: number;
  hair: number;
  shape: "omar" | "khalid" | "yousef" | "saleh" | "luna" | "aria" | "nova" | "yara";
  glb?: string;
}

export const AVATARS: AvatarDef[] = [
  // ---- The four boys -------------------------------------------------
  {
    id: "omar",
    label: "عمر",
    color: 0x3f9e6e,
    accent: 0x9fd8b8,
    skin: 0xe8b98a,
    hair: 0x2b2118,
    shape: "omar",
  },
  {
    id: "khalid",
    label: "خالد",
    color: 0x2f6fb0,
    accent: 0xa9c8ee,
    skin: 0xc98e63,
    hair: 0x14100c,
    shape: "khalid",
  },
  {
    id: "yousef",
    label: "يوسف",
    color: 0xe8843c,
    accent: 0xffd9ae,
    skin: 0xf0c8a0,
    hair: 0x4a3220,
    shape: "yousef",
  },
  {
    id: "saleh",
    label: "صالح",
    color: 0xf5f2ea,
    accent: 0xf0d9c0,
    skin: 0xd9a06f,
    hair: 0x1a1a1a,
    shape: "saleh",
  },
  // ---- The four fantasy girls ---------------------------------------
  {
    id: "luna",
    label: "لونا",
    color: 0xa78bda,
    accent: 0xd9c5ff,
    skin: 0xf2cdb4,
    hair: 0x9fe8d8,
    shape: "luna",
  },
  {
    id: "aria",
    label: "آريا",
    color: 0x3f7d4e,
    accent: 0xbfe8c8,
    skin: 0xefc9a8,
    hair: 0x8a4b2a,
    shape: "aria",
  },
  {
    id: "nova",
    label: "نوفا",
    color: 0x4b3f9e,
    accent: 0xffd166,
    skin: 0xe8c39e,
    hair: 0xd8d8e8,
    shape: "nova",
  },
  {
    id: "yara",
    label: "يارا",
    color: 0xe06a9c,
    accent: 0xffc0d8,
    skin: 0xf5d0b8,
    hair: 0x6b4226,
    shape: "yara",
  },
];

export const getAvatar = (id: string): AvatarDef => AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;

/** Reads the character chosen last time (kept across visits). */
export function readSavedAvatar(): string {
  try {
    const saved = window.localStorage.getItem("cova-avatar");
    if (saved && AVATARS.some((a) => a.id === saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return AVATARS[0]!.id;
}

/** Reads the stage side (left/right) chosen last time. */
export function readSavedSide(): "left" | "right" {
  try {
    return window.localStorage.getItem("cova-side") === "right" ? "right" : "left";
  } catch {
    /* storage unavailable */
  }
  return "left";
}

export function saveSide(side: "left" | "right"): void {
  try {
    window.localStorage.setItem("cova-side", side);
  } catch {
    /* storage unavailable */
  }
}

export function saveAvatar(id: string): void {
  try {
    window.localStorage.setItem("cova-avatar", id);
  } catch {
    /* storage unavailable */
  }
}
