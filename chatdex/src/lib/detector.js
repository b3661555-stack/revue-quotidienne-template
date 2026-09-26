// Optional on-device cat detection with TensorFlow.js COCO-SSD, loaded lazily from a CDN.
// If it can't load (offline, blocked, slow device) the capture flow falls back to asking the user.
// Photos never leave the device for detection.

const TFJS = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
const COCO = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
let modelPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

export function loadDetector(mode) {
  if (mode === 'off' || typeof window === 'undefined' || !navigator.onLine) return Promise.resolve(null);
  if (!modelPromise) {
    modelPromise = Promise.race([
      (async () => {
        await loadScript(TFJS);
        await loadScript(COCO);
        return window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
      })(),
      timeout(20000),
    ]).catch((err) => {
      console.info('Cat detector unavailable, using manual confirmation.', err?.message);
      modelPromise = null;
      return null;
    });
  }
  return modelPromise;
}

/** Returns { available, count, score, box } where box = [x, y, w, h] in canvas pixels. */
export async function detectCats(model, canvas) {
  if (!model) return { available: false, count: 0 };
  try {
    const preds = await Promise.race([model.detect(canvas, 10, 0.25), timeout(8000)]);
    const cats = preds.filter((p) => p.class === 'cat' && p.score >= 0.35).sort((a, b) => b.score - a.score);
    return { available: true, count: cats.length, score: cats[0]?.score || 0, box: cats[0]?.bbox || null };
  } catch {
    return { available: false, count: 0 };
  }
}
