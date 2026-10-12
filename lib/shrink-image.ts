/** Shrink an image in the browser so a multipart upload stays under Vercel's 4.5MB body limit. */

const DEFAULT_EDGE = 1600;
const DEFAULT_BYTES = 3_200_000;

export async function shrinkImage(file: Blob, name = "image.jpg", opts?: { maxEdge?: number; maxBytes?: number }): Promise<File> {
  const maxEdge = opts?.maxEdge ?? DEFAULT_EDGE;
  const maxBytes = opts?.maxBytes ?? DEFAULT_BYTES;
  const original = file instanceof File ? file : new File([file], name, { type: file.type || "image/jpeg" });
  if (typeof document === "undefined") return original;
  if (/\.zip$/i.test(original.name) || original.type.includes("zip")) return original;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(original);
  } catch {
    return original;
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.86;
    let blob = await toJpeg(canvas, quality);
    while (blob.size > maxBytes && quality > 0.45) {
      quality -= 0.08;
      blob = await toJpeg(canvas, quality);
    }
    if (blob.size > original.size && original.size <= maxBytes && original.type === "image/jpeg") return original;
    const nextName = original.name.replace(/\.\w+$/, "") || "image";
    return new File([blob], `${nextName}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode that image"))), "image/jpeg", quality);
  });
}
