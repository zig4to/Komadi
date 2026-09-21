// Client-side stiskanje slike pred nalaganjem v Supabase Storage — pomanjša
// najdaljšo stranico in prekodira v JPEG z nižjo kvaliteto, da slika za
// ozadje kartice zavzame čim manj prostora.
export async function compressImage(
  file: File,
  maxDimension = 800,
  quality = 0.75,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas kontekst ni na voljo.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Stiskanje slike ni uspelo."))),
      "image/jpeg",
      quality,
    );
  });
}
