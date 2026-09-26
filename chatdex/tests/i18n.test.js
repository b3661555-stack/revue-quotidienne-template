// Checks every locale against English: same keys, same placeholders, valid plural categories.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../src/i18n/locales');
const en = (await import(path.join(dir, 'en.js'))).default;
const placeholders = (v) => [...new Set((typeof v === 'string' ? v : Object.values(v).join(' ')).match(/\{\w+\}/g) || [])].sort();
const locales = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'en.js');

for (const file of locales) {
  const lang = file.replace('.js', '');
  test(`locale ${lang}`, async () => {
    const dict = (await import(path.join(dir, file))).default;
    const missing = Object.keys(en).filter((k) => !(k in dict));
    const extra = Object.keys(dict).filter((k) => !(k in en));
    assert.deepEqual(missing, [], `${lang}: missing keys`);
    assert.deepEqual(extra, [], `${lang}: unknown keys`);
    const cardinal = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
    const ordinal = new Intl.PluralRules(lang, { type: 'ordinal' }).resolvedOptions().pluralCategories;
    for (const [k, v] of Object.entries(dict)) {
      assert.ok(typeof v === 'string' || (v && typeof v === 'object'), `${lang} ${k}: bad value`);
      if (typeof v === 'object') {
        assert.equal(typeof en[k], 'object', `${lang} ${k}: should be a string, not plural object`);
        assert.ok(typeof v.other === 'string', `${lang} ${k}: plural needs "other"`);
        const allowed = k === 'fmt.ordinal' ? ordinal : cardinal;
        for (const cat of Object.keys(v)) assert.ok(allowed.includes(cat), `${lang} ${k}: "${cat}" is not a plural category of ${lang} (${allowed})`);
      }
      // Placeholders must match English (the {count} in plural forms may be omitted, e.g. "one cat").
      const want = placeholders(en[k]).filter((p) => p !== '{count}' && p !== '{n}');
      const got = placeholders(v);
      for (const p of want) assert.ok(got.includes(p), `${lang} ${k}: missing placeholder ${p}`);
      for (const p of got) assert.ok(placeholders(en[k]).includes(p), `${lang} ${k}: unknown placeholder ${p}`);
    }
  });
}
