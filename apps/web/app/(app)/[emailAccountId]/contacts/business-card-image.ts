// Phone cameras produce 4-6MB JPEGs, well past what's useful for reading a
// business card and past the action's size cap. Downscaling in the browser
// keeps the upload small and the text legible.
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

export async function readImageAsDownscaledDataUrl(file: File) {
  const bitmap = await decodeImage(file);

  try {
    const scale = Math.min(
      1,
      MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable in this browser");
    context.drawImage(bitmap, 0, 0, width, height);

    // JPEG regardless of input, so whatever the browser could decode (HEIC
    // included, on Safari) arrives as something the model accepts
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

// Only Safari decodes HEIC/HEIF; Chrome and Firefox reject the file outright.
// Name the real problem so the user can act on it instead of retrying a photo
// this browser will never read.
async function decodeImage(file: File) {
  try {
    return await createImageBitmap(file);
  } catch (error) {
    if (isHeic(file)) {
      throw new Error(
        "This browser can't read HEIC photos — save the card as JPEG or PNG and try again",
      );
    }
    throw error;
  }
}

function isHeic(file: File) {
  return (
    /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "")
  );
}
