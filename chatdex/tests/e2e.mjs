// End-to-end browser test of the main user journeys. Run with `npm run test:e2e`.
// Builds the app, then starts its own production server on a throwaway database. Needs Chromium (set CHROMIUM_PATH if not auto-detected).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { catSvg } from '../src/lib/catArt.js';

const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdex-e2e-'));
const shots = process.env.SHOTS_DIR || path.join(dir, 'shots');
fs.mkdirSync(shots, { recursive: true });

const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));

const root = path.resolve(import.meta.dirname, '..');
if (!process.env.SKIP_BUILD) {
  const { execSync } = await import('node:child_process');
  execSync('npx vite build --logLevel warn', { cwd: root, stdio: 'inherit' });
}
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), DATA_DIR: dir, DEMO_DATA: 'true', CAT_DETECTOR: 'off' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start:\n${serverLog}`);
}

const steps = [];
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  steps.push(name);
  console.log('ok');
};

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath });

  // A test "photo": render a procedural cat to PNG.
  const photoPath = path.join(dir, 'cat.png');
  {
    const p = await browser.newPage({ viewport: { width: 600, height: 600 } });
    await p.setContent(`<body style="margin:0">${catSvg({ coatColor: 'grey', pattern: 'spotted', eyeColor: 'blue', seed: 123 }).replace('<svg ', '<svg width="600" height="600" ')}</body>`);
    fs.writeFileSync(photoPath, await p.screenshot());
    await p.close();
  }
  const badFile = path.join(dir, 'notes.txt');
  fs.writeFileSync(badFile, 'definitely not a cat');

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', geolocation: { latitude: 46.5197, longitude: 6.6323 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });

  await step('welcome screen', async () => {
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Start hunting' }).waitFor();
    await shot('e2e-01-welcome');
  });

  await step('registration requires guidelines, then creates the profile', async () => {
    await page.getByRole('button', { name: 'Start hunting' }).click();
    await page.getByPlaceholder('catlover_42').fill('e2e_hunter');
    await page.getByPlaceholder('Tom').fill('Robin');
    await page.getByPlaceholder('you@example.com').fill('robin@e2e.dev');
    await page.getByPlaceholder('At least 6 characters').fill('meowmeow');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByText('Please accept the Respect the Cats guidelines.').waitFor();
    await page.getByText('I promise to hunt with my camera only.').click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByText('Catch your first cat!').waitFor();
    await page.getByRole('heading', { name: 'Robin' }).waitFor();
    await shot('e2e-02-home-new-user');
  });

  await step('empty collection state', async () => {
    await page.goto(`${BASE}/dex?scope=mine`);
    await page.getByText('Your Chatdex is empty').waitFor();
  });

  await step('invalid photo is rejected with a clear message', async () => {
    await page.goto(`${BASE}/capture`);
    await page.getByText('Location on (approximate)').waitFor();
    await page.getByTestId('gallery-input').setInputFiles(badFile);
    await page.getByText('That file is not a photo').waitFor();
  });

  let catName = 'Zazou';
  await step('capture a new cat (detector off → manual confirmation)', async () => {
    await page.getByTestId('gallery-input').setInputFiles(photoPath);
    await page.getByText('Is there a cat in this photo?').waitFor();
    await shot('e2e-03-confirm');
    await page.getByRole('button', { name: "Yes, it's a cat" }).click();
    await page.getByText('Describe this cat').waitFor();
    await page.getByRole('button', { name: 'Grey', exact: true }).click();
    await page.getByRole('button', { name: 'Spotted' }).click();
    await page.getByRole('button', { name: 'Blue' }).click();
    await shot('e2e-04-describe');
    await page.getByRole('button', { name: 'Identify' }).click();
    // Reject any suggested demo cats
    for (let i = 0; i < 4; i++) {
      await page.waitForSelector('text=/Could this be|Name it/');
      if (await page.getByText('Name it').isVisible()) break;
      await page.getByRole('button', { name: 'No', exact: true }).click();
    }
    await page.getByLabel('Cat name').fill(catName);
    await page.getByRole('button', { name: 'sleepy' }).click();
    await page.getByRole('button', { name: 'Add to my Chatdex' }).click();
    await page.getByText('NEW CAT DISCOVERED').waitFor();
    await page.getByText('👑 FIRST CATCH').waitFor();
    await page.getByText(/\+\d+ XP/).first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(2500);
    await shot('e2e-05-reward-new');
    await page.getByText('Badge unlocked: First Capture').waitFor();
  });

  await step('same cat again is recognised ("Could this be…?" → Yes)', async () => {
    await page.getByRole('button', { name: 'Capture another cat' }).click();
    await page.getByTestId('gallery-input').setInputFiles(photoPath);
    await page.getByRole('button', { name: "Yes, it's a cat" }).click();
    await page.getByRole('button', { name: 'Spotted' }).click();
    await page.getByRole('button', { name: 'Blue' }).click();
    await page.getByRole('button', { name: 'Grey', exact: true }).click();
    await page.getByRole('button', { name: 'Identify' }).click();
    await page.getByText(`Could this be ${catName}?`).waitFor();
    await shot('e2e-06-could-this-be');
    await page.getByRole('button', { name: 'Yes!' }).click();
    await page.getByText(`YOU FOUND ${catName.toUpperCase()} AGAIN`).waitFor();
  });

  await step('cat profile shows First Catch and sightings', async () => {
    await page.getByRole('button', { name: `See ${catName}'s profile` }).click();
    await page.getByRole('heading', { name: catName }).waitFor();
    await page.getByText('First Catch', { exact: true }).first().waitFor();
    await page.getByText("you've seen Zazou 2 times").waitFor();
    await page.getByText('sleepy').first().waitFor();
    await page.getByRole('button', { name: 'Add to favourites' }).click();
    await page.getByRole('button', { name: 'Remove from favourites' }).waitFor();
    await shot('e2e-07-cat-profile');
  });

  await step('collection and profile update', async () => {
    await page.goto(`${BASE}/dex?scope=mine`);
    await page.getByText(catName).waitFor();
    await page.goto(`${BASE}/me`);
    await page.getByText('@e2e_hunter').waitFor();
    await page.getByText('First Capture').first().waitFor();
    await shot('e2e-08-profile');
  });

  await step('feed shows the discovery and reactions work', async () => {
    await page.goto(BASE);
    const item = page.locator('.feed-item', { hasText: new RegExp(`discovered a .*cat: ${catName}`) }).first();
    await item.waitFor();
    await item.getByRole('button', { name: 'Respect' }).click();
    await item.locator('.reaction.mine').waitFor();
  });

  await step('social: follow a demo hunter and compare', async () => {
    await page.goto(`${BASE}/u/sarah`);
    await page.getByRole('button', { name: 'Follow' }).click();
    await page.getByRole('button', { name: 'Following ✓' }).waitFor();
    await page.getByText('You vs Sarah').waitFor();
  });

  await step('map renders cats and hotspots', async () => {
    await page.goto(`${BASE}/explore`);
    await page.locator('.map-cat').first().waitFor();
    await page.getByText(/cats? around you|No known cats/).waitFor();
    await page.locator('.map-cat').first().click({ force: true });
    await page.locator('.map-card').waitFor();
    await shot('e2e-09-explore');
  });

  await step('hunt: create and see it live', async () => {
    await page.goto(`${BASE}/hunts`);
    await page.getByRole('button', { name: '🏹 Start a hunt' }).click();
    await page.getByLabel('Town').selectOption('Lausanne');
    await page.getByRole('button', { name: 'Start the hunt' }).click();
    await page.getByText('Cat Hunt: Lausanne').first().waitFor();
    await page.getByText(/LIVE/).first().waitFor();
  });

  await step('achievements and notifications pages', async () => {
    await page.goto(`${BASE}/achievements`);
    await page.getByText('Night Hunter').waitFor();
    await page.goto(`${BASE}/notifications`);
    await page.getByText('Badge unlocked').first().waitFor();
  });

  await step('upload failure keeps the capture and retry works', async () => {
    await page.goto(`${BASE}/capture`);
    await page.getByTestId('gallery-input').setInputFiles(photoPath);
    await page.getByRole('button', { name: "Yes, it's a cat" }).click();
    await page.getByRole('button', { name: 'Black', exact: true }).click();
    await page.getByRole('button', { name: 'Colorpoint' }).click();
    await page.getByRole('button', { name: 'Identify' }).click();
    for (let i = 0; i < 4; i++) {
      await page.waitForSelector('text=/Could this be|Name it/');
      if (await page.getByText('Name it').isVisible()) break;
      await page.getByRole('button', { name: 'No', exact: true }).click();
    }
    await page.getByLabel('Cat name').fill('Offline Olly');
    await ctx.setOffline(true);
    await page.getByRole('button', { name: 'Add to my Chatdex' }).click();
    await page.getByText('Upload failed').waitFor();
    await page.getByText("You're offline").first().waitFor();
    await ctx.setOffline(false);
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.getByText('NEW CAT DISCOVERED').waitFor();
  });

  await step('location denied → pick an area manually', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    await ctx2.grantPermissions([]);
    const p2 = await ctx2.newPage();
    await p2.goto(BASE);
    await p2.getByRole('button', { name: 'I already have an account' }).click();
    await p2.getByPlaceholder('you@example.com').fill('robin@e2e.dev');
    await p2.getByPlaceholder('••••••').fill('meowmeow');
    await p2.getByRole('button', { name: 'Log in' }).click();
    await p2.getByRole('heading', { name: 'Robin' }).waitFor();
    await p2.goto(`${BASE}/capture`);
    await p2.getByText('Location off · choose your area').waitFor({ timeout: 15000 });
    await p2.getByTestId('gallery-input').setInputFiles(photoPath);
    await p2.getByRole('button', { name: "Yes, it's a cat" }).click();
    await p2.getByRole('button', { name: 'White', exact: true }).click();
    await p2.getByRole('button', { name: 'Tuxedo' }).click();
    await p2.getByRole('button', { name: 'Identify' }).click();
    await p2.getByText('Where are you?').waitFor();
    await p2.screenshot({ path: path.join(shots, 'e2e-10-area-picker.png') });
    await p2.getByPlaceholder('Search a town').fill('Bern');
    await p2.getByRole('button', { name: 'Bern', exact: true }).click();
    await p2.getByText('Near Bern').waitFor();
    await p2.getByRole('button', { name: 'Identify' }).click();
    await p2.waitForSelector('text=/Could this be|Name it/');
    await ctx2.close();
  });

  await step('logout', async () => {
    await page.goto(`${BASE}/me/edit`);
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.getByRole('button', { name: 'Start hunting' }).waitFor();
  });

  // Untranslated keys would show up as raw "section.key" strings.
  const RAW_KEY = /\b(app|common|nav|home|feed|cat|capture|match|name|reward|xp|dex|profile|hunt|map|notif|settings|errors|social|stat|rarity|coat|pattern|eyes|attr|loc|area|pick|report|badges|ach|welcome|auth|field|guide|level|title|time|region|compare|photo|offline|reaction|tag)\.[a-zA-Z_]+\b/;
  const assertTranslated = async (p, where) => {
    const text = await p.evaluate(() => document.body.innerText);
    const m = RAW_KEY.exec(text.replace(/[\w.-]+@[\w.-]+/g, ''));
    assert.equal(m, null, `${where}: untranslated key "${m?.[0]}"`);
    const ph = /\{[a-zA-Z]+\}/.exec(text);
    assert.equal(ph, null, `${where}: uninterpolated placeholder "${ph?.[0]}"`);
  };

  await step('language switcher on the welcome screen (15 languages)', async () => {
    const langs = await page.locator('.lang-select select option').evaluateAll((os) => os.map((o) => o.value));
    assert.ok(langs.length >= 15, `only ${langs.length} languages`);
    for (const lang of langs) {
      await page.locator('.lang-select select').selectOption(lang);
      await page.waitForFunction((l) => document.documentElement.lang === l, lang);
      await page.waitForTimeout(150);
      await assertTranslated(page, `welcome/${lang}`);
      if (lang !== 'en') {
        const start = await page.locator('.welcome-body .btn-primary').innerText();
        assert.notEqual(start, 'Start hunting', `${lang}: welcome not translated`);
      }
    }
    await page.locator('.lang-select select').selectOption('fr');
    await page.waitForTimeout(200);
    await shot('e2e-11-welcome-fr');
    await page.locator('.lang-select select').selectOption('en');
  });

  await step('Arabic: right-to-left layout, translated app pages', async () => {
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar', geolocation: { latitude: 46.43, longitude: 6.91 }, permissions: ['geolocation'] });
    const p3 = await ctx3.newPage();
    p3.on('pageerror', (e) => pageErrors.push(`ar: ${e.message}`));
    await p3.goto(BASE);
    await p3.waitForFunction(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar');
    await p3.locator('.welcome-body .btn-link').click(); // demo login
    await p3.locator('.hero').waitFor();
    for (const url of ['/', '/dex', '/cat/1', '/me', '/capture', '/hunts', '/achievements', '/notifications', '/explore']) {
      await p3.goto(BASE + url);
      await p3.waitForTimeout(1200);
      await assertTranslated(p3, `ar${url}`);
      if (url === '/' || url === '/cat/1') await p3.screenshot({ path: path.join(shots, `e2e-12-ar${url.replace(/\//g, '_')}.png`) });
    }
    await ctx3.close();
  });

  await step('Japanese and Russian app pages have no untranslated keys', async () => {
    for (const locale of ['ja', 'ru', 'hi']) {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale });
      const p = await c.newPage();
      p.on('pageerror', (e) => pageErrors.push(`${locale}: ${e.message}`));
      await p.goto(BASE);
      await p.locator('.welcome-body .btn-link').click();
      await p.locator('.hero').waitFor();
      for (const url of ['/', '/dex?scope=mine', '/cat/2', '/u/sarah', '/hunts']) {
        await p.goto(BASE + url);
        await p.waitForTimeout(900);
        await assertTranslated(p, `${locale}${url}`);
      }
      await p.goto(BASE);
      await p.waitForTimeout(900);
      await p.screenshot({ path: path.join(shots, `e2e-13-${locale}-home.png`) });
      await c.close();
    }
  });

  await step('delete account from settings, privacy policy reachable', async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    const p = await c.newPage();
    await p.goto(BASE);
    await p.getByRole('button', { name: 'I already have an account' }).click();
    await p.getByPlaceholder('you@example.com').fill('robin@e2e.dev');
    await p.getByPlaceholder('••••••').fill('meowmeow');
    await p.getByRole('button', { name: 'Log in' }).click();
    await p.getByRole('heading', { name: 'Robin' }).waitFor();
    await p.goto(`${BASE}/me/edit`);
    const privacy = await p.getByRole('link', { name: 'Privacy policy' }).getAttribute('href');
    assert.equal((await fetch(BASE + privacy)).status, 200);
    await p.getByRole('button', { name: 'Delete my account' }).click();
    await p.locator('.sheet input[type=password]').fill('wrong-password');
    await p.getByRole('button', { name: 'Delete forever' }).click();
    await p.getByText('Wrong password.').waitFor();
    await p.locator('.sheet input[type=password]').fill('meowmeow');
    await p.getByRole('button', { name: 'Delete forever' }).click();
    await p.getByRole('button', { name: 'Start hunting' }).waitFor();
    const relogin = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'robin@e2e.dev', password: 'meowmeow' }) });
    assert.equal(relogin.status, 401);
    await c.close();
  });

  assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join('\n')}`);
  console.log(`\n✅ ${steps.length} end-to-end steps passed. Screenshots: ${shots}`);
} catch (err) {
  console.log('FAILED');
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  if (!process.env.SHOTS_DIR) fs.rmSync(dir, { recursive: true, force: true });
}
