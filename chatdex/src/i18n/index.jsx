// Minimal i18n: flat dictionaries, {var} interpolation (strings or React nodes),
// CLDR plurals via Intl.PluralRules, dates via Intl. English is bundled; other
// languages are code-split and loaded on demand.
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './locales/en.js';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'zh', name: '中文（简体）' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

const loaders = import.meta.glob('./locales/*.js');
const KEY = 'chatdex.lang';

export function detectLanguage() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch { /* storage unavailable */ }
  for (const tag of navigator.languages || [navigator.language || 'en']) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (LANGUAGES.some((l) => l.code === base)) return base;
  }
  return 'en';
}

function interpolate(str, vars) {
  if (!vars) return str;
  if (!Object.values(vars).some(isValidElement)) {
    return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? vars[k] === 0 ? String(vars[k]) : m));
  }
  // Rich interpolation: return an array of strings and elements.
  return str.split(/(\{\w+\})/g).filter(Boolean).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m || vars[m[1]] === undefined) return part;
    const v = vars[m[1]];
    return isValidElement(v) ? cloneElement(v, { key: i }) : String(v);
  });
}

export function makeT(lang, dict) {
  const plural = new Intl.PluralRules(lang);
  const ordinalRules = new Intl.PluralRules(lang, { type: 'ordinal' });
  const pick = (entry, n, rules) => (typeof entry === 'object' && entry ? entry[rules.select(n)] ?? entry.other : entry);
  const t = (key, vars) => {
    let entry = dict[key] ?? en[key];
    if (entry === undefined) return key;
    if (typeof entry === 'object') entry = pick(entry, Number(vars?.count ?? 0), plural);
    return interpolate(entry, vars);
  };
  t.has = (key) => dict[key] !== undefined || en[key] !== undefined;
  t.ordinal = (n) => interpolate(pick(dict['fmt.ordinal'] ?? en['fmt.ordinal'], n, ordinalRules), { n });
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  t.timeAgo = (iso) => {
    const s = (Date.parse(iso) - Date.now()) / 1000;
    const a = Math.abs(s);
    if (a < 60) return t('time.justNow');
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
    if (a < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
    return rtf.format(Math.round(s / (86400 * 365)), 'year');
  };
  t.date = (iso) => new Date(iso).toLocaleDateString(lang, {
    month: 'short', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
  t.number = (n) => new Intl.NumberFormat(lang).format(n);
  // Game vocabulary helpers
  t.rarity = (id) => t(`rarity.${id}`);
  t.tag = (tag) => (dict[`tag.${tag}`] ?? en[`tag.${tag}`]) ? t(`tag.${tag}`) : tag;
  t.region = (r) => (r && r.startsWith('Wild zone') ? t('region.wild', { coords: r.slice(10) }) : r === 'Unknown area' ? t('region.unknown') : r);
  t.lang = lang;
  return t;
}

const I18nContext = createContext(makeT('en', en));
export const useT = () => useContext(I18nContext);
const LangContext = createContext({ lang: 'en', setLang: () => {} });
export const useLang = () => useContext(LangContext);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLanguage);
  const [dict, setDict] = useState(lang === 'en' ? en : null);

  useEffect(() => {
    let cancelled = false;
    const meta = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.rtl ? 'rtl' : 'ltr';
    if (lang === 'en') { setDict(en); return undefined; }
    const load = loaders[`./locales/${lang}.js`];
    if (!load) { setDict(en); return undefined; }
    load().then((m) => { if (!cancelled) setDict(m.default); }).catch(() => { if (!cancelled) setDict(en); });
    return () => { cancelled = true; };
  }, [lang]);

  const setLang = useCallback((code) => {
    try { localStorage.setItem(KEY, code); } catch { /* ignore */ }
    setLangState(code);
  }, []);

  const t = useMemo(() => makeT(lang, dict || en), [lang, dict]);
  const langValue = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  if (!dict) return null; // brief, only while a language chunk loads
  return (
    <LangContext.Provider value={langValue}>
      <I18nContext.Provider value={t}>{children}</I18nContext.Provider>
    </LangContext.Provider>
  );
}

export function LanguageSelect({ className = '' }) {
  const { lang, setLang } = useLang();
  const t = useT();
  return (
    <label className={`lang-select ${className}`}>
      <span aria-hidden>🌐</span>
      <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('settings.language')}>
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
    </label>
  );
}

/** Translates an API error using its code, falling back to the server's English message. */
export function errorText(t, err) {
  if (!err) return '';
  if (err.offline) return t('errors.offline');
  if (err.code && t.has(`errors.${err.code}`)) {
    const params = { ...(err.params || {}) };
    if (params.field) params.field = t(`field.${params.field}`);
    return t(`errors.${err.code}`, params);
  }
  if (err.photoCode) return t(`photo.${err.photoCode}`);
  return err.message || t('errors.generic');
}
