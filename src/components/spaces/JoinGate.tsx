"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { AvatarStage } from "@/components/voicing/AvatarStage";
import { AVATARS, readSavedAvatar } from "@/components/voicing/avatars";
import { useS } from "@/i18n/spaces";
import { cn } from "@/lib/utils";
import type { SpaceEnd, SpaceView } from "@/lib/spaces-client";

interface Props {
  view: SpaceView;
  ended: SpaceEnd;
  defaultName: string;
  onJoin: (p: { name: string; avatar: string; side: "left" | "right" }) => Promise<void>;
  onCancel: () => Promise<void>;
  onBack: () => void;
}

const wobble = () => 0.3 + 0.3 * Math.sin(performance.now() / 170);

/** Everything a person sees before entering: avatar + side choice, join request, waiting, declined. */
export function JoinGate({ view, ended, defaultName, onJoin, onCancel, onBack }: Props) {
  const t = useS();
  const [name, setName] = useState(defaultName);
  const [avatar, setAvatar] = useState(readSavedAvatar);
  const [side, setSide] = useState<"left" | "right">("left");
  const [busy, setBusy] = useState(false);
  const isVoice = view.kind === "voice";

  const blocked =
    ended === "kicked"
      ? t("room.kicked")
      : ended === "closed"
        ? t("room.closed")
        : view.status === "denied"
          ? t("room.denied")
          : null;

  if (view.status === "pending") {
    return (
      <Card className="mx-auto max-w-md">
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-cova-muted" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{t("room.waiting")}</h2>
          <p className="text-sm text-cova-mute">{view.name}</p>
          <p className="text-sm text-cova-mute">{t("room.waitingHint")}</p>
          <Button variant="secondary" onClick={() => void onCancel()}>
            {t("room.cancel")}
          </Button>
        </CardBody>
      </Card>
    );
  }

  const go = async () => {
    setBusy(true);
    try {
      window.localStorage.setItem("cova-avatar", avatar);
    } catch {
      /* storage unavailable */
    }
    await onJoin({ name: name.trim() || defaultName, avatar, side });
    setBusy(false);
  };

  return (
    <Card className="mx-auto max-w-2xl">
      <CardBody className="space-y-5">
        <h2 className="text-lg font-semibold">
          {view.isPublic
            ? t("room.joinTitle", { name: view.name })
            : t("room.requestTitle", { name: view.name })}
        </h2>
        {!view.isPublic && <p className="text-sm text-cova-mute">{t("room.requestHint")}</p>}
        {blocked && (
          <p className="rounded-lg bg-cova-pale px-3 py-2 text-sm" role="status">
            {blocked}
          </p>
        )}

        {ended === "closed" ? (
          <Button variant="secondary" onClick={onBack}>
            {t("room.back")}
          </Button>
        ) : (
          <>
            <label className="block text-sm font-medium">
              {t("room.yourName")}
              <input
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm"
              />
            </label>

            {isVoice && (
              <>
                <div>
                  <p className="mb-2 text-sm font-medium">{t("room.avatar")}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {AVATARS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAvatar(a.id)}
                        aria-pressed={avatar === a.id}
                        className={cn(
                          "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                          avatar === a.id
                            ? "border-cova-ink bg-cova-pale ring-2 ring-cova-ink/20"
                            : "border-cova-line hover:bg-cova-bg",
                        )}
                      >
                        <span
                          className="mx-auto mb-1 block h-7 w-7 rounded-full shadow-inner"
                          style={{
                            background: `radial-gradient(circle at 30% 25%, #${a.accent
                              .toString(16)
                              .padStart(6, "0")}, #${a.color.toString(16).padStart(6, "0")})`,
                          }}
                          aria-hidden="true"
                        />
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">{t("room.side")}</p>
                  <div className="flex gap-2">
                    {(["left", "right"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSide(s)}
                        aria-pressed={side === s}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
                          side === s
                            ? "border-cova-ink bg-cova-pale"
                            : "border-cova-line hover:bg-cova-bg",
                        )}
                      >
                        {s === "left" ? t("room.left") : t("room.right")}
                      </button>
                    ))}
                  </div>
                </div>
                <AvatarStage
                  className="h-56 rounded-xl bg-gradient-to-b from-cova-ink to-[#1b2a3a]"
                  meUid="preview"
                  members={[{ uid: "preview", name, avatar, side, role: "member", muted: false }]}
                  getLevel={wobble}
                />
              </>
            )}

            <Button
              size="lg"
              className="w-full"
              disabled={busy || name.trim().length < 1}
              onClick={() => void go()}
            >
              {view.isPublic ? t("room.joinNow") : t("room.sendRequest")}
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
