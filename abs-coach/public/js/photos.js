// Image helpers: load, shrink, encode, and a rough on-device "definition score".

export async function loadImage(blob) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {}
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const dims = (src) => [src.width || src.videoWidth, src.height || src.videoHeight];

export function drawScaled(src, maxSide) {
  const [w, h] = dims(src);
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export const canvasToBlob = (canvas, quality = 0.86) =>
  new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the photo'))), 'image/jpeg', quality));

// Normalise any photo (file upload or camera frame) to a JPEG no bigger than maxSide.
export async function normalisePhoto(blobOrSource, maxSide = 1280) {
  const src = blobOrSource instanceof Blob ? await loadImage(blobOrSource) : blobOrSource;
  const canvas = drawScaled(src, maxSide);
  if (src.close) src.close();
  return canvasToBlob(canvas);
}

// Smaller copy for the photo-analysis server, as base64 without the data: prefix.
export async function toUploadBase64(blob, maxSide = 900) {
  const canvas = drawScaled(await loadImage(blob), maxSide);
  const small = await canvasToBlob(canvas, 0.82);
  const buf = new Uint8Array(await small.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

// A rough measure of how much "edge" there is across the middle of the stomach.
// Gradients are divided by brightness so it depends less on how bright the room is,
// but lighting and angle still matter, so it is only shown as a trend.
export async function definitionScore(blob) {
  try {
    const src = await loadImage(blob);
    const canvas = drawScaled(src, 220);
    const { width: w, height: h } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    // light blur to ignore skin texture and noise
    const blur = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += gray[(y + dy) * w + x + dx];
        blur[y * w + x] = s / 9;
      }
    const x0 = Math.floor(w * 0.3), x1 = Math.ceil(w * 0.7);
    const y0 = Math.floor(h * 0.35), y1 = Math.ceil(h * 0.8);
    let g = 0, b = 0, n = 0;
    for (let y = Math.max(2, y0); y < Math.min(h - 2, y1); y++)
      for (let x = Math.max(2, x0); x < Math.min(w - 2, x1); x++) {
        const i = y * w + x;
        const gx = blur[i + 1] - blur[i - 1];
        const gy = blur[i + w] - blur[i - w];
        g += Math.hypot(gx, gy);
        b += blur[i];
        n++;
      }
    if (!n) return null;
    const norm = g / n / (b / n + 10);
    return Math.round(100 * (1 - Math.exp(-norm * 18)));
  } catch (e) {
    console.warn('definition score failed', e);
    return null;
  }
}
