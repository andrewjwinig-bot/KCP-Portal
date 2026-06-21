// Client-side image helpers. Photos are downscaled BEFORE storage so the local
// DB stays small and (later) uploads are cheap.

export async function downscaleImage(file: File, maxDim = 1080, quality = 0.82): Promise<Blob> {
  const bitmap = await fileToBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) (bitmap as ImageBitmap).close?.();
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? new Blob()), 'image/jpeg', quality),
  );
}

async function fileToBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
