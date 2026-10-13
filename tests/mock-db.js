// In-memory stand-in for the app's database adapter (the shape S.db expects), with a default seed.
// Loaded into the app page by tests/run-tests.ps1 before the app's own scripts. Tests reach it as window.TestDB.
(() => {
  const DAY = 864e5;
  const T0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const at = (days, h = 12, m = 0) => { const d = T0(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.getTime(); };
  const key = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const store = {};
  const subs = [];
  const notify = () => setTimeout(() => subs.forEach(f => f()), 0);

  const TestDB = {
    store, at, key, DAY,
    clear() { for (const k of Object.keys(store)) delete store[k]; notify(); },
    set(path, doc) { store[path] = JSON.parse(JSON.stringify(doc)); notify(); },
    log(chore, days, h = 12, by, name) {
      const t = at(days, h), k = key(t);
      (store['logs/' + k] ||= { date: k, entries: [] }).entries.push({ id: chore + t + Math.random(), chore, name: name || chore, t, ...(by ? { by } : {}) });
      notify();
    },
    // Default household: chores with known rhythms, a few shopping items, Monday and Thursday without shopping.
    seedDefault() {
      store['config/main'] = { noShopDays: [1, 4], stores: ['Lidl', 'DM'] };
      [['mosas', 'Mosás', { mode: 'auto' }], ['teregetes', 'Teregetés', { mode: 'auto' }], ['mosogatas', 'Mosogatás', { mode: 'auto' }],
        ['ontozes', 'Öntözés', { mode: 'auto' }], ['porszivozas', 'Porszívózás', { mode: 'every', every: 7 }], ['felmosas', 'Felmosás', { mode: 'auto' }],
        ['agynemu', 'Ágyneműcsere', { mode: 'days', days: [6] }], ['szemet', 'Szemétlevitel', { mode: 'auto' }]]
        .forEach(([id, name, rule], i) => { store['chores/' + id] = { name, order: i, rule }; });
      [-15, -12, -9, -6, -3].forEach(d => TestDB.log('mosas', d, 10));
      for (let d = -7; d <= -1; d++) { TestDB.log('mosogatas', d, 9); TestDB.log('mosogatas', d, 20); }
      [-17, -13, -9, -5].forEach(d => TestDB.log('ontozes', d, 8));
      [-10, -8, -6, -4, -2].forEach(d => TestDB.log('agynemu', d, 11));
      [-6, -4, -2].forEach(d => TestDB.log('porszivozas', d, 15));
      [-8, -1].forEach(d => TestDB.log('felmosas', d, 16));
      const buys = (days, s) => days.map(d => ({ t: at(d, 17), store: s }));
      store['items/tej'] = { name: 'tej', store: 'Lidl', onList: false, addedAt: 0, bought: buys([-15, -11, -7, -3], 'Lidl') };
      store['items/kenyer'] = { name: 'kenyér', store: 'Lidl', onList: false, addedAt: 0, bought: buys([-8, -6, -4, -2], 'Lidl') };
      store['items/pelenka'] = { name: 'pelenka', store: 'DM', onList: false, addedAt: 0, bought: buys([-22, -12, -2], 'DM') };
      store['items/alma'] = { name: 'alma', store: '', onList: true, addedAt: 1, bought: [] };
      notify();
    },
  };

  const snap = p => ({ id: p.split('/').pop(), exists: p in store, data: () => store[p], metadata: { fromCache: false, hasPendingWrites: false } });
  const cmp = { '>=': (a, b) => a >= b, '==': (a, b) => a === b };
  const query = (coll, filters) => ({
    where: (f, op, v) => query(coll, [...filters, [f, op, v]]),
    onSnapshot(next) {
      const fire = () => {
        const docs = Object.keys(store).filter(p => p.startsWith(coll + '/') && p.split('/').length === coll.split('/').length + 1)
          .filter(p => filters.every(([f, op, v]) => cmp[op](store[p][f], v))).sort().map(snap);
        next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
      };
      subs.push(fire); setTimeout(fire, 0); return () => {};
    },
  });
  const db = {
    collection: p => query(p, []),
    doc: p => ({
      path: p,
      set: async d => { store[p] = JSON.parse(JSON.stringify(d)); notify(); },
      delete: async () => { delete store[p]; notify(); },
      onSnapshot(next) { const fire = () => next(snap(p)); subs.push(fire); setTimeout(fire, 0); return () => {}; },
    }),
  };
  TestDB.seedDefault();
  window.TestDB = TestDB;
  window.claude = { use: async name => (name === 'db' ? db : null) };
})();
