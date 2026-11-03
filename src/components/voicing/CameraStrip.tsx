"use client";

import { useEffect, useRef } from "react";
import { RefreshCcw, X } from "lucide-react";
import { useS } from "@/i18n/spaces";
import type { Facing } from "@/components/voicing/dubModel";
import { cn } from "@/lib/utils";

/**
 * Floating camera tiles over the 3D stage: my own preview (with flip for the
 * phone's back camera) at the bottom corner and everyone else's camera at the
 * top, so faces show next to the characters without leaving the room view.
 */

function CamVideo({ stream, mirrored }: { stream: MediaStream; mirrored: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn("h-full w-full object-cover", mirrored && "scale-x-[-1]")}
    />
  );
}

export function CameraStrip({
  members,
  remoteCams,
  remoteCamFacing,
  myCam,
  camFacing,
  onFlip,
  onStop,
}: {
  /** uid -> display name. */
  members: Record<string, string>;
  /** uid -> live camera MediaStream of the others. */
  remoteCams: Record<string, MediaStream>;
  /** uid -> which camera they say they are using (for mirroring). */
  remoteCamFacing: Record<string, Facing>;
  /** My own camera stream while it is on. */
  myCam: MediaStream | null;
  camFacing: Facing;
  onFlip: () => void;
  onStop: () => void;
}) {
  const t = useS();
  const entries = Object.entries(remoteCams);

  return (
    <>
      {/* Everyone else's camera, top corner of the stage. */}
      {entries.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-wrap justify-end gap-2 px-3">
          {entries.map(([uid, stream]) => (
            <div
              key={uid}
              className="relative h-36 w-24 overflow-hidden rounded-xl border-2 border-white/70 bg-black shadow-lg"
              data-testid="remote-cam"
            >
              <CamVideo stream={stream} mirrored={(remoteCamFacing[uid] ?? "user") === "user"} />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
                {members[uid] ?? uid.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* My camera preview with flip + stop, above the control bar. */}
      {myCam && (
        <div
          className="absolute bottom-20 end-3 z-10 w-32 overflow-hidden rounded-xl border-2 border-white/70 bg-black shadow-lg sm:w-40"
          data-testid="my-cam"
        >
          <div className="aspect-[3/4]">
            <CamVideo stream={myCam} mirrored={camFacing === "user"} />
          </div>
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
            {camFacing === "user" ? t("room.camYou") : t("room.camBack")}
          </span>
          <span className="absolute end-1 top-1 flex gap-1">
            <button
              type="button"
              onClick={onFlip}
              aria-label={t("room.camFlip")}
              title={t("room.camFlip")}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onStop}
              aria-label={t("room.camStop")}
              title={t("room.camStop")}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/90 text-white transition hover:bg-red-600"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        </div>
      )}
    </>
  );
}
