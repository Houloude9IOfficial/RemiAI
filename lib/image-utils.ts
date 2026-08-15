// ---------------------------------------------------------------------------
// Client-side image downscaling (browser only — uses canvas + ImageBitmap).
//
// Phone photos are typically 3–10 MB (HEIC/JPEG). Uploading them raw makes
// the multipart request slow on mobile, bloats the session sandbox, and —
// because every attached image is sent to the model as base64 on send —
// pushes large photo batches against provider request/per-image limits.
//
// Images are therefore downscaled to a max edge of MAX_IMAGE_DIMENSION and
// re-encoded as JPEG (or PNG when transparency is present) *before* upload.
// That keeps details clearly visible to the model (vision APIs downscale
// beyond ~2k px anyway) while shrinking the payload ~10×.
// ---------------------------------------------------------------------------

/** Longest edge (px) images are scaled down to before upload. */
export const MAX_IMAGE_DIMENSION = 2048;
/** JPEG quality used when re-encoding photos. */
export const JPEG_QUALITY = 0.85;
/**
 * Files below this size are passed through untouched — they're already cheap
 * to upload and send, so decoding/encoding them is pure overhead.
 */
export const MIN_DOWNSCALE_SIZE = 300 * 1024; // 300 KB

/** Raster formats we never re-encode: animation / vector. */
const SKIP_MIME_TYPES = new Set(["image/gif", "image/svg+xml"]);

/** Whether a MIME type is worth downscaling at all. */
export function isDownscalableImage(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") &&
    !SKIP_MIME_TYPES.has(mimeType)
  );
}

/** Extension that matches the re-encoded MIME type. */
function extensionForMime(mime: string): string {
  return mime === "image/png" ? ".png" : ".jpg";
}

/** Swap the extension of a filename (e.g. `photo.HEIC` → `photo.jpg`). */
function replaceExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^/.]+$/, "");
  return `${base}${ext}`;
}

/**
 * Scan the (already downscaled) canvas for any non-opaque pixel. Transparent
 * images must stay PNG — re-encoding them as JPEG would flatten the alpha
 * onto a black background.
 */
function hasAlpha(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/** Decode a file into an ImageBitmap, applying EXIF orientation. */
async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Some engines reject the orientation option — retry without it (modern
    // browsers apply EXIF orientation by default anyway).
    return createImageBitmap(file);
  }
}

/**
 * Downscale a raster image so uploads and model sends stay small.
 *
 * Returns the ORIGINAL file untouched when the image is already small
 * enough, isn't a raster image we re-encode, or can't be decoded — callers
 * can treat a changed result as "compressed", an unchanged one as a passthrough.
 */
export async function downscaleImageFile(file: File): Promise<File> {
  if (!isDownscalableImage(file.type)) return file;
  if (file.size < MIN_DOWNSCALE_SIZE) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decodeImage(file);
    const { width, height } = bitmap;
    if (width === 0 || height === 0) return file;

    // Already within limits — nothing to gain from re-encoding.
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
    if (scale >= 1) return file;

    const outWidth = Math.max(1, Math.round(width * scale));
    const outHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);

    // Images with any transparency must stay PNG — re-encoding them as JPEG
    // would flatten the alpha onto a black background. Scan BEFORE anything
    // could paint opaque pixels over the transparent ones.
    const mime = hasAlpha(ctx, outWidth, outHeight) ? "image/png" : "image/jpeg";
    const quality = mime === "image/jpeg" ? JPEG_QUALITY : undefined;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, quality),
    );
    if (!blob) return file;

    return new File([blob], replaceExtension(file.name, extensionForMime(mime)), {
      type: mime,
    });
  } catch {
    // Unreadable/corrupt/unsupported — keep the original; the upload and
    // send paths already skip or surface such files gracefully.
    return file;
  } finally {
    bitmap?.close();
  }
}
