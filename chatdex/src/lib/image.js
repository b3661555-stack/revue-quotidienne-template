// Photo processing in the browser: decode, resize, compress, and compute a tiny visual
// fingerprint used by the server-side matcher (colour histogram + difference hash).

export class PhotoError extends Error {}

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new PhotoError('No photo selected.'));
    if (file.type && !file.type.startsWith('image/')) return reject(new PhotoError('That file is not a photo. Please pick an image.'));
    if (file.size > 30 * 1024 * 1024) return reject(new PhotoError('This photo is too large. Try another one.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) { URL.revokeObjectURL(url); reject(new PhotoError('This photo seems empty.')); return; }
      resolve({ img, url });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoError("We couldn't read this photo. If it's a HEIC file, try a JPEG or take the photo from the app."));
    };
    img.src = url;
  });
}

export function drawToCanvas(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas;
}

/** Square centre crop for thumbnails. */
export function thumbnail(img, size = 360) {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const side = Math.min(W, H);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(img, (W - side) / 2, (H - side) / 2, side, side, 0, 0, size, size);
  return canvas;
}

export const toJpeg = (canvas, quality = 0.82) => canvas.toDataURL('image/jpeg', quality);

/** Region of interest: the detected cat box, else the centre 70 % of the frame. */
function roi(canvas, box) {
  if (box) {
    const [x, y, w, h] = box;
    return [Math.max(0, x), Math.max(0, y), Math.max(4, Math.min(w, canvas.width - x)), Math.max(4, Math.min(h, canvas.height - y))];
  }
  return [canvas.width * 0.15, canvas.height * 0.15, canvas.width * 0.7, canvas.height * 0.7];
}

function sample(canvas, box, w, h) {
  const [sx, sy, sw, sh] = roi(canvas, box);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

export function fingerprint(canvas, box) {
  // 4x4x4 RGB histogram on a 32x32 sample
  const px = sample(canvas, box, 32, 32);
  const hist = new Array(64).fill(0);
  for (let i = 0; i < px.length; i += 4) hist[(px[i] >> 6) * 16 + (px[i + 1] >> 6) * 4 + (px[i + 2] >> 6)] += 1;
  const n = px.length / 4;
  const normHist = hist.map((x) => Number((x / n).toFixed(4)));
  // 64-bit difference hash on a 9x8 grey sample
  const g = sample(canvas, box, 9, 8);
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 9 + x) * 4;
      const a = g[i] * 0.3 + g[i + 1] * 0.59 + g[i + 2] * 0.11;
      const b = g[i + 4] * 0.3 + g[i + 5] * 0.59 + g[i + 6] * 0.11;
      bits += a > b ? '1' : '0';
    }
  }
  let dhash = '';
  for (let i = 0; i < 64; i += 4) dhash += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return { hist: normHist, dhash };
}

/** Rough coat colour suggestion from the pixels in the middle of the cat. The user always confirms. */
export function guessCoatColor(canvas, box) {
  const px = sample(canvas, box, 24, 24);
  let dark = 0, bright = 0, n = 0, sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 0.22) dark++;
    if (max > 0.82 && max - min < 0.12) bright++;
    sr += r; sg += g; sb += b; n++;
  }
  if (dark / n > 0.45) return 'black';
  if (bright / n > 0.4) return 'white';
  const r = sr / n, g = sg / n, b = sb / n;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const s = max === 0 ? 0 : (max - min) / max;
  let h = 0;
  if (max !== min) {
    if (max === r) h = ((g - b) / (max - min)) * 60;
    else if (max === g) h = (2 + (b - r) / (max - min)) * 60;
    else h = (4 + (r - g) / (max - min)) * 60;
    if (h < 0) h += 360;
  }
  if (s < 0.16) return max < 0.3 ? 'black' : 'grey';
  if (h >= 12 && h <= 45 && s > 0.42 && max > 0.45) return 'orange';
  if (h >= 20 && h <= 55 && max > 0.68) return 'cream';
  if (max < 0.3) return 'black';
  return 'brown';
}
