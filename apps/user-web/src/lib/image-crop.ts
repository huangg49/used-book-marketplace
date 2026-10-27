export interface CoverCropResult {
  rawFile: File;
  croppedFile: File;
  croppedUrl: string;
  rawUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number; // width / height
  offsetPercent: number; // 0 - 100
  align: "left" | "center" | "right" | "custom";
  cropRectPercent: {
    left: number; // 0 - 100
    top: number; // 0 - 100
    width: number; // 0 - 100
    height: number; // 0 - 100
  };
}

export type CoverPosition = "left" | "center" | "right" | number;

const TARGET_COVER_RATIO = 3 / 4; // 0.75 portrait ratio

export function parseOffset(position: CoverPosition): {
  offset: number;
  align: "left" | "center" | "right" | "custom";
} {
  if (position === "left") return { offset: 0, align: "left" };
  if (position === "center") return { offset: 50, align: "center" };
  if (position === "right") return { offset: 100, align: "right" };
  const offset = Math.max(0, Math.min(100, Number(position) || 0));
  const align =
    Math.abs(offset - 0) < 0.5
      ? "left"
      : Math.abs(offset - 50) < 0.5
        ? "center"
        : Math.abs(offset - 100) < 0.5
          ? "right"
          : "custom";
  return { offset, align };
}

/**
 * Calculates crop dimensions and percentage coordinates for a portrait 3:4 book cover.
 */
export function calculateCoverCrop(
  naturalWidth: number,
  naturalHeight: number,
  position: CoverPosition = 50,
) {
  const ratio = naturalWidth / naturalHeight;
  const { offset, align } = parseOffset(position);

  let cropWidthPercent = 100;
  let cropHeightPercent = 100;
  let cropLeftPercent = 0;
  let cropTopPercent = 0;

  if (ratio > TARGET_COVER_RATIO + 0.005) {
    // Landscape or wider than 3:4
    cropHeightPercent = 100;
    cropTopPercent = 0;
    cropWidthPercent = (TARGET_COVER_RATIO / ratio) * 100;
    const maxShift = 100 - cropWidthPercent;
    cropLeftPercent = (offset / 100) * maxShift;
  } else if (ratio < TARGET_COVER_RATIO - 0.005) {
    // Taller/narrower than 3:4
    cropWidthPercent = 100;
    cropLeftPercent = 0;
    cropHeightPercent = (ratio / TARGET_COVER_RATIO) * 100;
    const maxShift = 100 - cropHeightPercent;
    cropTopPercent = (offset / 100) * maxShift;
  }

  return {
    left: cropLeftPercent,
    top: cropTopPercent,
    width: cropWidthPercent,
    height: cropHeightPercent,
    aspectRatio: ratio,
    offsetPercent: offset,
    align,
  };
}

/**
 * Crops a cover image to portrait 3:4 aspect ratio using HTML5 Canvas.
 */
export async function cropImageToCover(
  file: File,
  position: CoverPosition = 50,
  existingRawUrl?: string,
): Promise<CoverCropResult> {
  const rawUrl = existingRawUrl ?? URL.createObjectURL(file);

  const img = new Image();
  img.src = rawUrl;
  await img.decode();

  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const cropRect = calculateCoverCrop(naturalWidth, naturalHeight, position);

  const pixelX = Math.round((cropRect.left / 100) * naturalWidth);
  const pixelY = Math.round((cropRect.top / 100) * naturalHeight);
  const pixelW = Math.round((cropRect.width / 100) * naturalWidth);
  const pixelH = Math.round((cropRect.height / 100) * naturalHeight);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, pixelW);
  canvas.height = Math.max(1, pixelH);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Không thể khởi tạo Canvas 2D context");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    img,
    pixelX,
    pixelY,
    pixelW,
    pixelH,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, 0.92),
  );

  if (!blob) {
    throw new Error("Không thể tạo tệp ảnh sau khi cắt");
  }

  const croppedFile = new File([blob], file.name, {
    type: mimeType,
    lastModified: Date.now(),
  });
  const croppedUrl = URL.createObjectURL(croppedFile);

  return {
    rawFile: file,
    croppedFile,
    croppedUrl,
    rawUrl,
    naturalWidth,
    naturalHeight,
    aspectRatio: naturalWidth / naturalHeight,
    offsetPercent: cropRect.offsetPercent,
    align: cropRect.align,
    cropRectPercent: {
      left: cropRect.left,
      top: cropRect.top,
      width: cropRect.width,
      height: cropRect.height,
    },
  };
}
