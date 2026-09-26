// API integration tests: run with `npm test`. Uses a throwaway database.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdex-test-'));
process.env.DATA_DIR = dir;
process.env.DEMO_DATA = 'false';

const { createApp, errorHandler } = await import('../server/app.js');
const { run: dbRun, get: dbGet } = await import('../server/db.js');

let server;
let base;
before(async () => {
  const app = createApp();
  app.use(errorHandler);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

// Minimal fake JPEG (magic bytes are what the server checks).
const PHOTO = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]).toString('base64')}`;
const FP = { hist: Array.from({ length: 64 }, (_, i) => (i === 5 ? 0.6 : i === 40 ? 0.4 : 0)), dhash: 'f0f0f0f0a5a5a5a5' };
const MONTREUX = { lat: 46.43127, lng: 6.91071 };

function client() {
  let cookie = '';
  return async (p, { method = 'GET', body } = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  };
}

const register = async (c, name) => c('/auth/register', {
  method: 'POST', body: { email: `${name}@test.dev`, password: 'secret123', username: name, displayName: name[0].toUpperCase() + name.slice(1), acceptGuidelines: true },
});
const capture = (c, extra) => c('/captures', {
  method: 'POST',
  body: { photo: PHOTO, fingerprint: FP, attributes: { coatColor: 'orange', pattern: 'tabby', eyeColor: 'green' }, ...MONTREUX, localHour: 14, ...extra },
});

describe('Chatdex API', () => {
  const sarah = client();
  const tom = client();
  let miloId;

  test('rejects anonymous access', async () => {
    const r = await client()('/me');
    assert.equal(r.status, 401);
  });

  test('registration validates input', async () => {
    const c = client();
    assert.equal((await c('/auth/register', { method: 'POST', body: { email: 'bad', password: 'secret123', username: 'xx1', acceptGuidelines: true } })).status, 400);
    assert.equal((await c('/auth/register', { method: 'POST', body: { email: 'a@b.co', password: '123', username: 'abc', acceptGuidelines: true } })).status, 400);
    assert.equal((await c('/auth/register', { method: 'POST', body: { email: 'a@b.co', password: 'secret123', username: 'abc' } })).status, 400);
  });

  test('register, login, logout', async () => {
    const r = await register(sarah, 'sarah');
    assert.equal(r.status, 201);
    assert.equal(r.data.user.username, 'sarah');
    assert.equal(r.data.user.level, 1);
    assert.equal((await register(client(), 'sarah')).status, 409);
    const t = await register(tom, 'tom');
    assert.equal(t.status, 201);

    const c = client();
    assert.equal((await c('/auth/login', { method: 'POST', body: { email: 'sarah@test.dev', password: 'nope' } })).status, 401);
    assert.equal((await c('/auth/login', { method: 'POST', body: { email: 'SARAH@test.dev', password: 'secret123' } })).status, 200);
    assert.equal((await c('/me')).status, 200);
    await c('/auth/logout', { method: 'POST' });
    assert.equal((await c('/me')).status, 401);
  });

  test('capture validation', async () => {
    assert.equal((await capture(sarah, { newCat: { name: 'Milo' }, photo: undefined })).status, 400);
    assert.equal((await capture(sarah, { newCat: { name: 'Milo' }, photo: 'data:text/plain;base64,aGVsbG8=' })).status, 400);
    assert.equal((await capture(sarah, { newCat: { name: 'Milo' }, lat: undefined, lng: undefined })).status, 400);
    assert.equal((await capture(sarah, { newCat: { name: '' } })).status, 400);
    assert.equal((await capture(sarah, { newCat: { name: 'Milo' }, attributes: { coatColor: 'purple', pattern: 'tabby' } })).status, 400);
  });

  test('first capture creates a cat with First Catch, XP and a badge', async () => {
    const r = await capture(sarah, { newCat: { name: 'Milo', tags: ['friendly'] } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.isNewCat, true);
    assert.equal(r.data.isFirstCatch, true);
    assert.ok(r.data.xpTotal >= 100);
    assert.ok(r.data.achievements.some((a) => a.id === 'first_capture'));
    assert.ok(r.data.achievements.some((a) => a.id === 'first_catch'));
    miloId = r.data.catId;
    // Privacy: public position is snapped to a ~250 m grid, never the exact coordinates.
    const cat = r.data.cat;
    assert.notEqual(cat.lat, MONTREUX.lat);
    assert.ok(Math.abs(cat.lat / 0.0025 - Math.round(cat.lat / 0.0025)) < 1e-6);
    assert.equal(cat.region, 'Montreux');
    const photo = await fetch(base.replace('/api', '') + r.data.cat.photo);
    assert.equal(photo.status, 200);
  });

  test('matching suggests the known cat to another hunter', async () => {
    const r = await tom('/captures/match', { method: 'POST', body: { ...MONTREUX, lat: MONTREUX.lat + 0.001, attributes: { coatColor: 'orange', pattern: 'tabby', eyeColor: 'green' }, fingerprint: FP } });
    assert.equal(r.status, 200);
    assert.equal(r.data.candidates[0]?.id, miloId);
    assert.equal(r.data.candidates[0].strong, true);
    const none = await tom('/captures/match', { method: 'POST', body: { ...MONTREUX, attributes: { coatColor: 'black', pattern: 'solid', eyeColor: 'yellow' } } });
    assert.equal(none.data.candidates.length, 0);
    const far = await tom('/captures/match', { method: 'POST', body: { lat: 47.37, lng: 8.54, attributes: { coatColor: 'orange', pattern: 'tabby', eyeColor: 'green' } } });
    assert.equal(far.data.candidates.length, 0);
  });

  test('observing an existing cat: hunter rank, notification, feedback', async () => {
    const r = await capture(tom, { catId: miloId, feedback: [{ catId: miloId, verdict: 'yes', score: 0.9 }] });
    assert.equal(r.status, 201);
    assert.equal(r.data.isNewCat, false);
    assert.equal(r.data.firstForUser, true);
    assert.equal(r.data.hunterRank, 2);
    const cat = await tom(`/cats/${miloId}`);
    assert.equal(cat.data.cat.observationCount, 2);
    assert.equal(cat.data.cat.hunterCount, 2);
    assert.equal(cat.data.firstCatcher.username, 'sarah');
    assert.equal(cat.data.observations.length, 2);
    const n = await sarah('/notifications');
    assert.ok(n.data.items.some((x) => x.type === 'first_catch_found'));
    assert.equal(dbGet('SELECT COUNT(*) AS n FROM match_feedback').n, 1);

    const again = await capture(tom, { catId: miloId });
    assert.equal(again.data.firstForUser, false);
    assert.equal(again.data.xpTotal, 5); // same-day repeat
  });

  test('collection, profile and comparison', async () => {
    const dex = await tom('/cats?scope=mine');
    assert.equal(dex.data.collected, 1);
    assert.equal(dex.data.cats[0].name, 'Milo');
    const p = await tom('/users/sarah');
    assert.equal(p.data.stats.cats, 1);
    assert.equal(p.data.stats.firstCatches, 1);
    assert.equal(p.data.compare.shared, 1);
    assert.equal((await tom('/users/nobody')).status, 404);
    const upd = await tom('/me', { method: 'PATCH', body: { bio: 'Hello', favoriteCatId: miloId, avatarEmoji: '🦊' } });
    assert.equal(upd.data.user.favoriteCatId, miloId);
    assert.equal((await tom('/me', { method: 'PATCH', body: { favoriteCatId: 99999 } })).status, 400);
  });

  test('social: follow, feed, reactions, favourites, tags', async () => {
    assert.equal((await tom('/users/sarah/follow', { method: 'POST' })).status, 200);
    assert.equal((await tom('/users/tom/follow', { method: 'POST' })).status, 400);
    const feed = await tom('/feed?scope=following');
    assert.ok(feed.data.items.some((i) => i.type === 'discovery' && i.user.username === 'sarah'));
    const obsId = feed.data.items.find((i) => i.type === 'discovery').observation.id;
    const r1 = await tom(`/observations/${obsId}/react`, { method: 'POST', body: { kind: 'respect' } });
    assert.equal(r1.data.reactions.respect, 1);
    const r2 = await tom(`/observations/${obsId}/react`, { method: 'POST', body: { kind: 'respect' } });
    assert.equal(r2.data.reactions.respect, undefined);
    assert.equal((await tom(`/observations/${obsId}/react`, { method: 'POST', body: { kind: 'hate' } })).status, 400);
    const fav = await tom(`/cats/${miloId}/favorite`, { method: 'POST' });
    assert.deepEqual([fav.data.isFavorite, fav.data.favoriteCount], [true, 1]);
    const tags = await tom(`/cats/${miloId}/tags`, { method: 'POST', body: { tag: 'Friendly' } });
    assert.equal(tags.data.tags.find((t) => t.tag === 'friendly').count, 2);
  });

  test('hunts: create, progress and completion', async () => {
    const h = await sarah('/hunts', { method: 'POST', body: { region: 'Montreux', goal: 2, durationMin: 60 } });
    assert.equal(h.status, 201);
    const huntId = h.data.hunt.id;
    assert.equal((await tom(`/hunts/${huntId}/join`, { method: 'POST' })).data.hunt.joined, true);
    const c1 = await capture(tom, { newCat: { name: 'Pixel' }, attributes: { coatColor: 'black', pattern: 'solid', eyeColor: 'yellow' } });
    assert.equal(c1.data.hunts[0].progress, 1);
    const c2 = await capture(sarah, { newCat: { name: 'Luna' }, attributes: { coatColor: 'white', pattern: 'calico', eyeColor: 'blue' } });
    assert.equal(c2.data.hunts[0].justCompleted, true);
    const detail = await tom(`/hunts/${huntId}`);
    assert.equal(detail.data.hunt.status, 'completed');
    assert.equal(detail.data.found.length, 2);
    const ach = await tom('/achievements');
    assert.ok(ach.data.achievements.find((a) => a.id === 'hunting_party').unlockedAt);
  });

  test('map: approximate cats and hotspots', async () => {
    const m = await tom('/map');
    assert.equal(m.data.cats.length, 3);
    assert.equal(m.data.hotspots.length, 1);
    assert.equal(m.data.hotspots[0].cats, 3);
    assert.ok(m.data.hunters.length >= 2);
  });

  test('a cat unseen for a month is re-spotted', async () => {
    const old = new Date(Date.now() - 40 * 86400000).toISOString();
    dbRun('UPDATE cats SET last_observed_at = ? WHERE id = ?', old, miloId);
    dbRun('UPDATE observations SET created_at = ? WHERE cat_id = ?', old, miloId);
    const cat = await tom(`/cats/${miloId}`);
    assert.equal(cat.data.cat.status, 'missing');
    const r = await capture(sarah, { catId: miloId });
    assert.equal(r.data.respotted, true);
    assert.ok(r.data.daysMissing >= 30);
    const n = await tom('/notifications');
    assert.ok(n.data.items.some((x) => x.type === 'respotted'));
  });

  test('reports hide content after 3 distinct reports', async () => {
    const feed = await tom('/feed');
    const obsId = feed.data.items.find((i) => i.type === 'discovery' && i.cat.name === 'Pixel').observation.id;
    const users = [tom, sarah, client()];
    await register(users[2], 'emma');
    for (const u of users) assert.equal((await u('/reports', { method: 'POST', body: { targetType: 'observation', targetId: obsId, reason: 'Not a cat' } })).status, 201);
    assert.equal(dbGet('SELECT hidden FROM observations WHERE id = ?', obsId).hidden, 1);
    assert.equal((await tom('/reports', { method: 'POST', body: { targetType: 'planet', targetId: 1, reason: 'x' } })).status, 400);
  });
});
