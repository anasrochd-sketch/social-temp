"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Link2, QrCode, RefreshCw } from "lucide-react";
import { QrImage } from "@/components/common/QrImage";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useT } from "@/i18n/client";
import { copyText } from "@/lib/clipboard";
import { socialActions } from "@/lib/social-store";

/**
 * Invite sharing block for groups and voice rooms: invite code, shareable link
 * (with ?join= for groups) and a QR code that encodes that link.
 */
export function SharePanel({
  title,
  spaceId,
  code,
  path,
  canRegenerate,
  onRegenerated,
}: {
  title: string;
  /** Community/group id, used to build the share link and to regenerate the code. */
  spaceId?: string;
  /** Current invite code, when the space has one. */
  code?: string;
  /** Room path, e.g. "/groups/{id}" or "/voicing/{code}". */
  path: string;
  canRegenerate?: boolean;
  onRegenerated?: (newCode: string) => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return path;
    const url = new URL(path, window.location.origin);
    if (code) url.searchParams.set("join", code);
    return url.toString();
  }, [code, path]);

  const copy = async (what: "code" | "link", value: string) => {
    const done = await copyText(value);
    if (done) {
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    }
  };

  const regenerate = async () => {
    if (!spaceId || regenerating) return;
    setRegenerating(true);
    const result = await socialActions.regenerateJoinCode("", spaceId);
    setRegenerating(false);
    if (result.ok) onRegenerated?.(result.value);
  };

  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <QrCode className="h-4.5 w-4.5" aria-hidden="true" />
          {t("share.title")}
        </h2>
        <p className="text-sm text-cova-mute">{t("share.hint", { name: title })}</p>

        {code && (
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-lg border border-cova-line bg-cova-bg px-3 py-2 font-mono text-sm tracking-widest">
              {code}
            </span>
            <Button
              variant="secondary"
              onClick={() => void copy("code", code)}
              aria-label={t("share.copyCode")}
            >
              {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === "code" ? t("share.copied") : t("share.copyCode")}
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-lg border border-cova-line bg-cova-bg px-3 py-2 font-mono text-xs">
            <Link2 className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {shareLink}
          </span>
          <Button
            variant="secondary"
            onClick={() => void copy("link", shareLink)}
            aria-label={t("share.copyLink")}
          >
            {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "link" ? t("share.copied") : t("share.copyLink")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setShowQr((v) => !v)}>
            <QrCode className="h-4 w-4" aria-hidden="true" />
            {showQr ? t("share.hideQr") : t("share.showQr")}
          </Button>
          {canRegenerate && code && (
            <Button variant="ghost" disabled={regenerating} onClick={() => void regenerate()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t("share.regenerate")}
            </Button>
          )}
        </div>

        {showQr && (
          <div className="flex justify-center rounded-lg border border-cova-line bg-white p-3">
            <QrImage value={shareLink} size={220} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
