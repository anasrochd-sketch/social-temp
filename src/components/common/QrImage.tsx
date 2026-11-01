"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders a QR code for the given value, generated locally in the browser. */
export function QrImage({ value, size = 200 }: { value: string; size?: number }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((data) => {
        if (alive) setSrc(data);
      })
      .catch(() => {
        /* rendering failure keeps the placeholder hidden */
      });
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- locally generated data URL
  return <img src={src} width={size} height={size} alt="QR" />;
}
