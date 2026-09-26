export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)} h ago`;
  const d = h / 24;
  if (d < 2) return 'yesterday';
  if (d < 30) return `${Math.floor(d)} days ago`;
  const mo = d / 30;
  if (mo < 12) return `${Math.floor(mo)} month${Math.floor(mo) > 1 ? 's' : ''} ago`;
  return `${Math.floor(mo / 12)} year${mo >= 24 ? 's' : ''} ago`;
}

export const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export const dexNo = (n) => `#${String(n).padStart(3, '0')}`;

export const plural = (n, word, pluralWord) => `${n} ${n === 1 ? word : pluralWord || `${word}s`}`;

export const CAT_NAMES = ['Milo', 'Luna', 'Mochi', 'Figaro', 'Pistache', 'Biscuit', 'Olive', 'Pepper', 'Tofu', 'Nougat', 'Suki', 'Pumpkin',
  'Ziggy', 'Maple', 'Chai', 'Bagel', 'Waffles', 'Juniper', 'Cosmo', 'Poppy', 'Noodle', 'Hazel', 'Pickles', 'Clementine', 'Basil', 'Dumpling',
  'Marmalade', 'Socks', 'Pixel', 'Truffle', 'Churro', 'Miso', 'Latte', 'Sprout', 'Bramble', 'Paprika'];
export const randomCatName = () => CAT_NAMES[Math.floor(Math.random() * CAT_NAMES.length)];
