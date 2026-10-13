// Minimal test framework for MomAssistant. Each test loads the app fresh in an iframe (app.html, served by
// run-tests.ps1 with tests/mock-db.js injected), drives it like a user would, and checks the result.
//
//   test('Név', async () => {
//     const app = await openApp({ tab: 'ma' });       // fresh app, default seed, signed in
//     await app.click('[data-act=log][data-id=mosas]');
//     eq(app.tileNames().includes('Mosás'), false, 'a kész feladat lekerül');
//   });

const TESTS = [];
// Sends a line to the runner's console (handy when a test hangs): note('lépés 3').
const note = msg => fetch('/log', { method: 'POST', body: String(msg) }).catch(() => {});
const test = (name, fn) => TESTS.push({ name, fn });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(cond, ms = 5000, what = 'feltétel') {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (cond()) return; } catch {} await wait(25); }
  throw new Error('Időtúllépés: ' + what);
}
class AssertError extends Error {}
function ok(cond, msg) { if (!cond) throw new AssertError(msg || 'feltétel nem teljesült'); }
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new AssertError((msg ? msg + ': ' : '') + 'várt ' + e + ', kapott ' + a);
}
function has(text, part, msg) { ok(String(text).includes(part), (msg ? msg + ': ' : '') + '"' + part + '" nem található ebben: "' + String(text).slice(0, 300) + '"'); }

// Fake weather for the playground tab: every hour has the same values.
function weatherStub(p) {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); t0.setDate(t0.getDate() - 1);
  const time = [], h = { temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], wind_speed_10m: [], uv_index: [], weather_code: [] };
  for (let i = 0; i < 96; i++) {
    const d = new Date(t0); d.setHours(d.getHours() + i);
    time.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':00');
    h.temperature_2m.push(p.t); h.apparent_temperature.push(p.a); h.precipitation_probability.push(p.pp || 0);
    h.precipitation.push(p.pr || 0); h.wind_speed_10m.push(p.w || 5); h.uv_index.push(p.uv || 0); h.weather_code.push(p.code || 0);
  }
  return async () => ({ ok: true, json: async () => ({ hourly: { time, ...h } }) });
}
// YYYY-MM for a date `months` months ago (to give children a stable age).
function monthsAgo(months) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - months); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

let frames = [];
async function openApp({ seed = true, tab = 'ma', auth = true, email = 'en@x.hu', setup } = {}) {
  localStorage.clear(); localStorage.setItem('tab', tab);
  const f = document.createElement('iframe');
  f.style.cssText = 'width:375px;height:812px;border:1px solid #ccc';
  document.getElementById('frames').appendChild(f); frames.push(f);
  await new Promise(r => { f.onload = r; f.src = 'app.html?' + Math.random(); });
  const w = f.contentWindow;
  await until(() => w.HaziApp && w.TestDB, 5000, 'az app betöltése');
  if (!seed) w.TestDB.clear();
  if (setup) await setup(w, w.TestDB);
  if (auth) { w.HaziApp.setAuth({ status: 'signedIn', email, db: await w.claude.use('db') }); await wait(250); }
  return makeApp(w);
}
function makeApp(w) {
  const d = w.document;
  const app = {
    w, d, db: w.TestDB, store: w.TestDB.store,
    $: sel => d.querySelector(sel),
    $$: sel => [...d.querySelectorAll(sel)],
    text: sel => (d.querySelector(sel) || {}).innerText || '',
    async click(sel) { const el = typeof sel === 'string' ? d.querySelector(sel) : sel; ok(el, 'nincs ilyen elem: ' + sel); el.click(); await wait(120); },
    async go(tab) { await app.click('nav [data-tab=' + tab + ']'); await wait(80); },
    async input(id, value) { const el = d.getElementById(id); ok(el, 'nincs ilyen mező: ' + id); el.value = value; },
    async change(id, value) { const el = d.getElementById(id); ok(el, 'nincs ilyen mező: ' + id); el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(150); },
    async submit(formSel) { const b = d.querySelector(formSel + ' button[type=submit], ' + formSel + ' button:not([type=button])'); ok(b, 'nincs gomb: ' + formSel); b.click(); await wait(150); },
    section: title => [...d.querySelectorAll('section')].find(s => (s.querySelector('h2') || {}).textContent === title),
    tileNames: () => [...d.querySelectorAll('#view section .tiles .tile .nm')].map(e => e.textContent),
    restNames: () => [...d.querySelectorAll('details[data-person=ma-tobbi] .tile .nm')].map(e => e.textContent),
    tile: name => [...d.querySelectorAll('.tile')].find(t => t.querySelector('.nm').textContent === name),
    toast: () => (d.getElementById('toast-host') || {}).innerText || '',
    async key(el, k) { el.focus(); el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true })); await wait(200); },
    // Drag a sortable row by its grip to the vertical middle of another row.
    async drag(gripSel, targetRowSel) {
      const g = d.querySelector(gripSel), t = d.querySelector(targetRowSel); ok(g && t, 'nincs fogantyú vagy cél');
      const gb = g.getBoundingClientRect(), tb = t.getBoundingClientRect();
      const ev = (type, y) => g.dispatchEvent(new w.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: gb.x + 5, clientY: y }));
      ev('pointerdown', gb.y + gb.height / 2); ev('pointermove', tb.y + 2); ev('pointerup', tb.y + 2);
      await wait(250);
    },
    todoId: title => Object.keys(w.TestDB.store).find(k => k.startsWith('todos/') && w.TestDB.store[k].title === title)?.slice(6),
  };
  return app;
}

async function runAll() {
  const results = [], only = new URLSearchParams(location.search).get('only');
  for (const t of TESTS) {
    if (only && !t.name.toLowerCase().includes(only.toLowerCase())) continue;
    const start = Date.now(); note('indul: ' + t.name);
    try {
      await Promise.race([t.fn(), wait(15000).then(() => { throw new Error('a teszt 15 mp alatt sem futott le'); })]);
      results.push({ name: t.name, ok: true, ms: Date.now() - start });
    } catch (e) {
      results.push({ name: t.name, ok: false, ms: Date.now() - start, error: (e && e.message) || String(e) });
    }
    frames.forEach(f => f.remove()); frames = [];
    document.getElementById('progress').textContent = results.length + ' teszt lefutott';
    window.__results = results;
    const last = results[results.length - 1];
    document.getElementById('results').textContent += (last.ok ? 'OK    ' : 'HIBA  ') + last.name + ' (' + last.ms + ' ms)' + (last.ok ? '' : '\n      ' + last.error) + '\n';
  }
  document.getElementById('progress').textContent = 'Kész: ' + results.filter(r => r.ok).length + ' sikeres, ' + results.filter(r => !r.ok).length + ' hibás.';
  try { await fetch('/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(results) }); } catch {}
}
