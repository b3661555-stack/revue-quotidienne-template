// Procedural cat portraits. Used for demo cats (which have no real photo) and as a fallback
// when a photo fails to load. Identity features (ears, face width, patches) come from `seed`,
// the pose/background from `variant`, so every sighting of a cat looks like the same animal.

const COATS = {
  black: ['#34313d', '#1f1d26'],
  grey: ['#a3a9b4', '#737985'],
  orange: ['#f39a4c', '#cf6a24'],
  white: ['#f8f5ef', '#dcd6cb'],
  brown: ['#8f6645', '#5f3f27'],
  cream: ['#f0d8ac', '#d2ad76'],
};
const EYES = { yellow: '#f2cf3d', green: '#8cc64a', amber: '#e99a2c', blue: '#71b8f4' };

function prng(seed) {
  let s = (Number(seed) || 1) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let uid = 0;
const cache = new Map();

export function catSvg({ coatColor = 'grey', pattern = 'tabby', eyeColor = 'green', seed = 1, variant, shiny = false, background = true } = {}) {
  const key = `${coatColor}|${pattern}|${eyeColor}|${seed}|${variant}|${shiny}|${background}`;
  if (cache.has(key)) return cache.get(key);
  const r = prng(seed);
  const v = prng(variant ?? seed * 7 + 3);
  const id = `ca${++uid}`;

  let [base, dark] = COATS[coatColor] || COATS.grey;
  let white = '#fbf8f2';
  if (pattern === 'calico') { base = white; }
  if (pattern === 'colorpoint') { dark = coatColor === 'cream' || coatColor === 'white' ? '#7b5a45' : dark; base = '#f4e9d6'; }
  const isDark = coatColor === 'black' && pattern !== 'calico' && pattern !== 'colorpoint';
  const line = isDark ? 'rgba(255,255,255,.55)' : 'rgba(40,30,40,.45)';

  const headRx = 56 + r() * 10;
  const headRy = 48 + r() * 7;
  const earH = r() * 14;
  const earW = r() * 8;
  const tilt = (v() - 0.5) * 14;
  const hue = Math.floor(v() * 360);
  const eyesClosed = eyeColor === 'unknown' || v() < 0.12;
  const blep = v() < 0.15;
  const hy = 112; // head centre y

  const head = `<ellipse cx="100" cy="${hy}" rx="${headRx}" ry="${headRy}"/>`;
  const earL = `M${100 - headRx * 0.9} ${hy - 12} L${52 - earW} ${40 - earH} L${88} ${hy - headRy + 6} Z`;
  const earR = `M${100 + headRx * 0.9} ${hy - 12} L${148 + earW} ${40 - earH} L${112} ${hy - headRy + 6} Z`;
  const innerL = `M${100 - headRx * 0.72} ${hy - 20} L${57 - earW * 0.6} ${52 - earH * 0.8} L${82} ${hy - headRy + 12} Z`;
  const innerR = `M${100 + headRx * 0.72} ${hy - 20} L${143 + earW * 0.6} ${52 - earH * 0.8} L${118} ${hy - headRy + 12} Z`;

  // Pattern layers are clipped to head + body.
  let marks = '';
  const blob = (color, n, spread) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = 40 + r() * 120;
      const y = 60 + r() * spread;
      s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(14 + r() * 22).toFixed(1)}" ry="${(10 + r() * 18).toFixed(1)}" transform="rotate(${Math.floor(r() * 180)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${color}"/>`;
    }
    return s;
  };
  if (pattern === 'tabby') {
    const st = `stroke="${dark}" stroke-width="6" stroke-linecap="round" fill="none"`;
    marks += `<path d="M100 ${hy - headRy + 4} L100 ${hy - headRy + 22}" ${st}/><path d="M86 ${hy - headRy + 8} L89 ${hy - headRy + 24}" ${st}/><path d="M114 ${hy - headRy + 8} L111 ${hy - headRy + 24}" ${st}/>`;
    marks += `<path d="M${100 - headRx} 108 q14 2 20 8 M${100 - headRx + 2} 124 q12 0 18 6" ${st}/><path d="M${100 + headRx} 108 q-14 2 -20 8 M${100 + headRx - 2} 124 q-12 0 -18 6" ${st}/>`;
    marks += `<path d="M58 172 q10 -6 14 6 M86 166 q10 -6 12 8 M128 172 q-10 -6 -14 6" ${st}/>`;
  } else if (pattern === 'spotted') {
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.55 + r() * 0.4;
      marks += `<circle cx="${(100 + Math.cos(a) * headRx * d).toFixed(1)}" cy="${(hy + Math.sin(a) * headRy * d * 0.8 - 6).toFixed(1)}" r="${(3 + r() * 4).toFixed(1)}" fill="${dark}"/>`;
    }
    marks += `<circle cx="70" cy="178" r="6" fill="${dark}"/><circle cx="128" cy="182" r="5" fill="${dark}"/><circle cx="100" cy="190" r="4" fill="${dark}"/>`;
  } else if (pattern === 'tortoiseshell') {
    marks += blob('#d9772e', 6, 130) + blob('#1f1d26', 4, 130) + blob('#b9652a', 3, 130);
  } else if (pattern === 'calico') {
    const orange = '#ef8f3f';
    const blackish = coatColor === 'black' ? '#1f1d26' : coatColor === 'grey' ? '#7d828e' : '#2d2a33';
    marks += `<ellipse cx="${60 + r() * 20}" cy="${70 + r() * 20}" rx="34" ry="28" fill="${orange}"/><ellipse cx="${130 + r() * 20}" cy="${72 + r() * 18}" rx="30" ry="26" fill="${blackish}"/>`;
    marks += blob(orange, 2, 120) + blob(blackish, 1, 120);
  } else if (pattern === 'colorpoint') {
    marks += `<ellipse cx="100" cy="${hy + 16}" rx="34" ry="28" fill="${dark}" opacity=".85"/>`;
  }

  const bib = pattern === 'bicolor' || pattern === 'tuxedo' || pattern === 'calico';
  let whiteParts = '';
  if (bib) {
    whiteParts += `<ellipse cx="100" cy="${hy + 22}" rx="${pattern === 'tuxedo' ? 30 : 34}" ry="${pattern === 'tuxedo' ? 22 : 28}" fill="${white}"/>`;
    if (pattern === 'bicolor' && r() < 0.6) whiteParts += `<path d="M92 ${hy - headRy + 2} L108 ${hy - headRy + 2} L112 ${hy + 6} L88 ${hy + 6} Z" fill="${white}"/>`;
  }
  const chest = bib ? `<path d="M${pattern === 'tuxedo' ? 76 : 70} 200 Q100 ${pattern === 'tuxedo' ? 140 : 150} ${pattern === 'tuxedo' ? 124 : 130} 200 Z" fill="${white}"/>` : '';

  const ex = 23 + r() * 4;
  const ey = hy - 4 + r() * 4;
  let eyes = '';
  if (eyesClosed) {
    const st = `stroke="${isDark ? '#f3efe7' : '#2a2430'}" stroke-width="4" stroke-linecap="round" fill="none"`;
    eyes = `<path d="M${100 - ex - 10} ${ey} q10 9 20 0" ${st}/><path d="M${100 + ex - 10} ${ey} q10 9 20 0" ${st}/>`;
  } else {
    const eye = (cx, color) =>
      `<ellipse cx="${cx}" cy="${ey}" rx="11" ry="12.5" fill="${color}" stroke="${isDark ? 'rgba(0,0,0,.35)' : 'rgba(40,30,40,.55)'}" stroke-width="1.5"/>` +
      `<ellipse cx="${cx}" cy="${ey + 1}" rx="${3 + v() * 2.5}" ry="9" fill="#17131c"/>` +
      `<circle cx="${cx + 3.5}" cy="${ey - 4.5}" r="3" fill="#fff"/>`;
    const left = eyeColor === 'odd' ? EYES.blue : EYES[eyeColor] || EYES.green;
    const right = eyeColor === 'odd' ? EYES.amber : EYES[eyeColor] || EYES.green;
    eyes = eye(100 - ex, left) + eye(100 + ex, right);
  }
  const nose = `<path d="M94 ${hy + 16} L106 ${hy + 16} L100 ${hy + 23} Z" fill="#f08a9c" stroke="rgba(0,0,0,.15)" stroke-width="1"/>`;
  const mouthStroke = isDark ? '#f3efe7' : '#2a2430';
  const mouth = `<path d="M100 ${hy + 23} q-5 8 -12 4 M100 ${hy + 23} q5 8 12 4" stroke="${mouthStroke}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    (blep ? `<path d="M96 ${hy + 28} q4 9 8 0 Z" fill="#f28b9b"/>` : '');
  const wh = `stroke="${line}" stroke-width="1.8" stroke-linecap="round"`;
  const whiskers = `<path d="M70 ${hy + 20} L34 ${hy + 14} M70 ${hy + 25} L34 ${hy + 27} M72 ${hy + 30} L40 ${hy + 39}" ${wh}/><path d="M130 ${hy + 20} L166 ${hy + 14} M130 ${hy + 25} L166 ${hy + 27} M128 ${hy + 30} L160 ${hy + 39}" ${wh}/>`;
  const blush = `<circle cx="${100 - ex - 12}" cy="${hy + 20}" r="8" fill="#ff8fa3" opacity=".28"/><circle cx="${100 + ex + 12}" cy="${hy + 20}" r="8" fill="#ff8fa3" opacity=".28"/>`;
  const earColor = pattern === 'colorpoint' ? dark : base;
  const innerEar = isDark ? '#c47c8c' : '#f6a8b6';

  const bg = background
    ? shiny
      ? `<defs><linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe3f4"/><stop offset=".5" stop-color="#fff1c9"/><stop offset="1" stop-color="#d9ecff"/></linearGradient></defs><rect width="200" height="200" fill="url(#${id}bg)"/>`
      : `<defs><radialGradient id="${id}bg" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="hsl(${hue} 80% 94%)"/><stop offset="1" stop-color="hsl(${(hue + 30) % 360} 60% 82%)"/></radialGradient></defs><rect width="200" height="200" fill="url(#${id}bg)"/>`
    : '';
  const sparkles = shiny
    ? [[30, 34, 9], [172, 46, 7], [160, 150, 6], [26, 150, 5], [100, 22, 5]]
        .map(([x, y, s]) => `<path d="M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z" fill="#ffc94d"/>`)
        .join('')
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">${bg}${sparkles}
<defs><clipPath id="${id}c">${head}<ellipse cx="100" cy="200" rx="66" ry="46"/></clipPath></defs>
<g transform="rotate(${tilt.toFixed(1)} 100 150)">
<ellipse cx="100" cy="200" rx="66" ry="46" fill="${base}"/>
<path d="${earL}" fill="${earColor}"/><path d="${earR}" fill="${earColor}"/>
<path d="${innerL}" fill="${innerEar}"/><path d="${innerR}" fill="${innerEar}"/>
<g fill="${base}">${head}</g>
<g clip-path="url(#${id}c)">${marks}${whiteParts}${chest}</g>
${blush}${eyes}${nose}${mouth}${whiskers}
</g></svg>`;
  if (cache.size > 800) cache.clear();
  cache.set(key, svg);
  return svg;
}
