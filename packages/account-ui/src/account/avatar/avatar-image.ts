/**
 * Avatar image normalization shared by the desktop and web shells (Issue #858).
 *
 * The picked file never reaches storage as-is: the long edge is capped at
 * {@link AVATAR_MAX_EDGE} and the result is always encoded as PNG, so every
 * platform stores and renders the same fixed shape.
 */

export const AVATAR_MAX_EDGE = 1024;

export type AvatarImageErrorCode = 'invalid-type' | 'decode-failed' | 'encode-failed';

export class AvatarImageError extends Error {
  constructor(readonly code: AvatarImageErrorCode) {
    super(code);
    this.name = 'AvatarImageError';
  }
}

function fitWithinMaxEdge(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= AVATAR_MAX_EDGE) return { width, height };
  const scale = AVATAR_MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Decode, downscale and re-encode the selected file as a PNG blob. */
export async function processAvatarFile(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new AvatarImageError('invalid-type');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarImageError('decode-failed');
  }

  try {
    const size = fitWithinMaxEdge(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new AvatarImageError('encode-failed');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });
    if (!blob) throw new AvatarImageError('encode-failed');
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Convert a stored blob into a data URL for the desktop IPC transport. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new AvatarImageError('encode-failed'));
    reader.readAsDataURL(blob);
  });
}
