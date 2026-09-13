"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

/** Renders `value` (a claim URL) as a QR code onto a canvas. Client-only: never sent anywhere. */
export function ProofQr({ value, size = 180 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1 }).catch(() => {
      // Rendering failure (e.g. value too long) - leave the canvas blank rather than crash.
    });
  }, [value, size]);

  return <canvas ref={canvasRef} width={size} height={size} role="img" aria-label="Claim link QR code" />;
}
