import type { BarcodeFormat } from "@zxing/library";
import { PackageSummary } from "@/types/domain";

export function normalizeBarcode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function normalizeTrackingNumber(value: string): string {
  return normalizeBarcode(value);
}

export function findKnownTrackingNumber(value: string, packages: PackageSummary[]): string | null {
  const scanned = normalizeTrackingNumber(value);
  const exact = packages.find((pkg) => normalizeTrackingNumber(pkg.returnTrackingNumber) === scanned);
  if (exact) {
    return exact.returnTrackingNumber;
  }

  const embedded = packages.find((pkg) => {
    const tracking = normalizeTrackingNumber(pkg.returnTrackingNumber);
    return tracking.length >= 12 && scanned.includes(tracking);
  });
  return embedded?.returnTrackingNumber || null;
}

export type ZxingControls = { stop: () => void };

export async function startZxingVideoScan(video: HTMLVideoElement, formats: BarcodeFormat[], onDecode: (text: string) => void): Promise<ZxingControls> {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();
  reader.possibleFormats = formats;
  return reader.decodeFromConstraints(
    {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    },
    video,
    (result) => {
      if (result) {
        onDecode(result.getText());
      }
    }
  );
}

export function stopZxingVideoScan(controls: ZxingControls | null, video: HTMLVideoElement | null): void {
  controls?.stop();
  if (video?.srcObject) {
    (video.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}
