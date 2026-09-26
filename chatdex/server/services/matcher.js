// Cat re-identification, MVP edition.
//
// Given a new photo's appearance attributes, a tiny visual fingerprint computed in the
// browser (colour histogram + difference hash) and an approximate location, rank the
// known cats that could be the same animal.
//
// This module is the single seam to swap in a real model later: keep the
// `findCandidates(input) -> [{ catId, score, reasons }]` contract and replace the scoring
// with image embeddings / a vision API. Confirmed "yes/no" answers are stored in
// `match_feedback` and can serve as training/evaluation data.
import { all } from '../db.js';
import { distanceM } from './geo.js';

export const SEARCH_RADIUS_M = 1500;
export const MIN_SCORE = 0.5;
export const STRONG_SCORE = 0.78;

function histogramSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
  let inter = 0;
  for (let i = 0; i < a.length; i++) inter += Math.min(a[i], b[i]);
  return inter; // both are normalised to sum 1
}

function hashSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { diff += x & 1; x >>= 1; }
  }
  return 1 - diff / (a.length * 4);
}

export function visualSimilarity(fa, fb) {
  if (!fa || !fb) return null;
  const h = histogramSimilarity(fa.hist, fb.hist);
  const d = hashSimilarity(fa.dhash, fb.dhash);
  if (h == null && d == null) return null;
  if (h == null) return d;
  if (d == null) return h;
  return 0.7 * h + 0.3 * d;
}

function attributeSimilarity(attrs, cat) {
  let s = 0;
  if (attrs.coatColor === cat.coat_color) s += 0.5;
  if (attrs.pattern === cat.pattern) s += 0.35;
  if (attrs.eyeColor === 'unknown' || cat.eye_color === 'unknown') s += 0.07;
  else if (attrs.eyeColor === cat.eye_color) s += 0.15;
  return s;
}

export function findCandidates({ lat, lng, attributes, fingerprint, excludeHidden = true, limit = 3 }) {
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  // Cheap bounding box before exact distances (1 deg lat ~ 111 km).
  const dLat = SEARCH_RADIUS_M / 111000;
  const dLng = hasLoc ? SEARCH_RADIUS_M / (111000 * Math.cos((lat * Math.PI) / 180)) : 0;
  const cats = hasLoc
    ? all(
        `SELECT * FROM cats WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? ${excludeHidden ? 'AND hidden = 0' : ''}`,
        lat - dLat, lat + dLat, lng - dLng, lng + dLng
      )
    : all(`SELECT * FROM cats WHERE coat_color = ? ${excludeHidden ? 'AND hidden = 0' : ''} ORDER BY last_observed_at DESC LIMIT 200`, attributes.coatColor);

  const results = [];
  for (const cat of cats) {
    const attr = attributeSimilarity(attributes, cat);
    if (attr < 0.35) continue; // different coat colour and pattern: not the same cat
    let proximity = 0.5;
    if (hasLoc && cat.lat != null) {
      const d = distanceM(lat, lng, cat.lat, cat.lng);
      if (d > SEARCH_RADIUS_M) continue;
      proximity = 1 - d / SEARCH_RADIUS_M;
    }
    let visual = null;
    if (fingerprint) {
      const prints = all('SELECT fingerprint FROM observations WHERE cat_id = ? AND fingerprint IS NOT NULL AND hidden = 0 ORDER BY created_at DESC LIMIT 12', cat.id);
      for (const p of prints) {
        const v = visualSimilarity(fingerprint, JSON.parse(p.fingerprint));
        if (v != null && (visual == null || v > visual)) visual = v;
      }
    }
    const score = visual == null ? 0.65 * attr + 0.35 * proximity : 0.45 * attr + 0.3 * visual + 0.25 * proximity;
    if (score < MIN_SCORE) continue;
    const reasons = [];
    if (attributes.coatColor === cat.coat_color) reasons.push('same coat colour');
    if (attributes.pattern === cat.pattern) reasons.push('same pattern');
    if (attributes.eyeColor !== 'unknown' && attributes.eyeColor === cat.eye_color) reasons.push('same eyes');
    if (proximity > 0.6 && hasLoc) reasons.push('seen very close by');
    else if (hasLoc) reasons.push('seen in this area');
    if (visual != null && visual > 0.7) reasons.push('similar photo');
    results.push({ catId: cat.id, score: Number(score.toFixed(3)), strong: score >= STRONG_SCORE, reasons });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
