// Regression tests for the app itself. Every test starts from a freshly loaded app with the default seed
// (tests/mock-db.js) unless it says otherwise. Add new tests at the end of the matching group.

// ---------- Alap ----------
test('Alap: bejelentkezési állapotok', async () => {
  const app = await openApp({ auth: false });
  app.w.HaziApp.setAuth({ status: 'unconfigured' }); await wait(50);
  has(app.text('#view'), 'nincs összekötve');
  ok(app.$('nav.tabs').hidden, 'bejelentkezés nélkül nincs alsó menü');
  app.w.HaziApp.setAuth({ status: 'signedOut' }); await wait(50);
  ok(app.$('[data-act=sign-in]'), 'van belépés gomb');
  app.w.HaziApp.setAuth({ status: 'denied', email: 'idegen@x.hu' }); await wait(50);
  has(app.text('#view'), 'nincs hozzáférésed');
});

test('Alap: hat fül a megfelelő nevekkel', async () => {
  const app = await openApp();
  eq(app.$$('nav.tabs button').map(b => b.textContent.trim()), ['Ma', 'Bevásárlás', 'Statisztika', 'Játszótér', 'ToDo', 'Beállítások']);
});

// ---------- Ma ----------
test('Ma: előrejelzés a megfigyelt ritmusból', async () => {
  const app = await openApp();
  has(app.tile('Mosás').textContent, 'ma esedékes'); has(app.tile('Mosás').textContent, 'kb. 3 naponta');
  has(app.tile('Öntözés').textContent, 'esedékes'); has(app.tile('Öntözés').textContent, 'kb. 4 naponta');
  has(app.tile('Mosogatás').textContent, 'naponta kb. 2×');
  has(app.tile('Felmosás').textContent, 'figyelem még (2/3)');
});

test('Ma: csak az esedékes és a tanulási szakaszban lévő látszik', async () => {
  const app = await openApp();
  const shown = app.tileNames();
  ['Mosás', 'Öntözés', 'Mosogatás', 'Felmosás', 'Teregetés'].forEach(n => ok(shown.includes(n), n + ' látszik'));
  ok(app.restNames().includes('Porszívózás'), 'a nem esedékes Porszívózás a Többi között van');
});

test('Ma: rögzítés után a csempe a Többi közé kerül, visszavonható', async () => {
  const app = await openApp();
  await app.click(app.tile('Mosás'));
  ok(!app.tileNames().includes('Mosás'), 'a kész Mosás lekerül');
  ok(app.restNames().includes('Mosás'), 'a Többi között megvan');
  const k = app.db.key(Date.now());
  ok((app.store['logs/' + k]?.entries || []).some(e => e.chore === 'mosas'), 'el van mentve');
  has(app.toast(), 'rögzítve');
  await app.click('[data-act=undo]'); await wait(150);
  ok(app.tileNames().includes('Mosás'), 'visszavonás után újra látszik');
});

test('Ma: a szabály felülírja a megfigyelt ritmust', async () => {
  const app = await openApp();
  ok(app.restNames().includes('Porszívózás'), '7 naponta szabály: még nem esedékes');
  has(app.tile('Porszívózás').textContent, '7 naponta (szabály)');
  await app.go('szabaly');
  await app.change('mode-porszivozas', 'auto');
  await app.go('ma');
  ok(app.tileNames().includes('Porszívózás'), 'automatikusra váltva a 2 napos ritmus szerint esedékes');
  has(app.tile('Porszívózás').textContent, 'kb. 2 naponta');
});

test('Ma: a Beállításokban megadott sorrendet követi', async () => {
  const app = await openApp({ tab: 'szabaly' });
  await app.key(app.$('[data-grip][data-id=ontozes]'), 'ArrowUp');
  await app.go('ma');
  const shown = app.tileNames();
  ok(shown.indexOf('Öntözés') < shown.indexOf('Mosogatás'), 'Öntözés a Mosogatás elé került: ' + shown.join(', '));
});

test('Ma: „Mára” kártya a reális nappal és az „elég mára” jelzéssel', async () => {
  const app = await openApp({ seed: false, setup: (w, db) => {
    db.set('config/main', { noShopDays: [], stores: [] });
    db.set('chores/mosas', { name: 'Mosás', order: 0, rule: { mode: 'auto' } });
    for (let d = -20; d <= -1; d++) for (let j = 0; j < 4; j++) db.log('mosas', d, 8 + j, 'en@x.hu');
  } });
  has(app.text('.card.today'), 'reális nap: kb. 4');
  for (let j = 0; j < 4; j++) app.db.log('mosas', 0, 7, 'en@x.hu');
  await wait(250);
  ok(app.$('.card.today').classList.contains('enough') || app.$('.card.today').classList.contains('over'), 'elérte a reális napot');
  has(app.text('.card.today'), 'elég');
});

// ---------- Statisztika ----------
test('Statisztika: heti összesítő, virág, grafikonok', async () => {
  const app = await openApp({ tab: 'naplo' });
  ok(app.$('.card.week'), 'van heti kártya');
  ok(app.$('svg.flower'), 'van virág');
  eq(app.$$('svg.chart').length, 2, 'két grafikon');
  has(app.text('.card.week'), 'dolgot intéztél');
});

test('Statisztika: pótlás múltbeli időpontra, jövőbelire nem', async () => {
  const app = await openApp({ tab: 'naplo' });
  const y = app.db.key(app.db.at(-1));
  await app.input('bf-chore', 'teregetes'); await app.input('bf-date', y); await app.input('bf-time', '18:00');
  await app.submit('form[data-form=backfill]');
  ok((app.store['logs/' + y]?.entries || []).some(e => e.chore === 'teregetes'), 'tegnapra rögzítve');
  await app.input('bf-chore', 'teregetes'); await app.input('bf-date', app.db.key(Date.now())); await app.input('bf-time', '23:59');
  await app.submit('form[data-form=backfill]');
  has(app.toast(), 'Jövőbeli');
});

// ---------- Bevásárlás ----------
test('Bevásárlás: a javasolt tételek maguktól a listán vannak, más színnel', async () => {
  const app = await openApp({ tab: 'bolt' });
  const pred = app.$$('.row.pred').map(r => r.innerText);
  ok(pred.some(t => t.includes('tej')), 'a tej javasolt');
  ok(pred.some(t => t.includes('kenyér')), 'a kenyér javasolt');
  ok(!pred.some(t => t.includes('pelenka')), 'a 10 naponta vett pelenka még nem');
  ok(!app.$$('.row.pred').some(r => r.innerText.includes('alma')), 'a kézzel felírt alma nem javasolt színű');
});

test('Bevásárlás: mennyiség megadása, módosítása, vásárláskor törlődik', async () => {
  const app = await openApp({ tab: 'bolt' });
  await app.input('item-name', 'joghurt'); await app.input('item-qty', '6 db');
  await app.submit('form[data-form=add-item]');
  const id = Object.keys(app.store).find(k => app.store[k].name === 'joghurt').slice(6);
  eq(app.store['items/' + id].qty, '6 db');
  await app.click('[data-act=edit][data-kind=qty][data-key="' + id + '"]');
  await app.input('rename-input', '4 db'); await app.submit('form[data-form=rename]');
  eq(app.store['items/' + id].qty, '4 db', 'módosítva');
  has(app.$$('.row').find(r => r.innerText.includes('joghurt')).innerText, '4 db');
  await app.click('[data-act=bought][data-id="' + id + '"]');
  eq(app.store['items/' + id].qty, '', 'vásárláskor törlődik');
  eq(app.store['items/' + id].bought.length, 1, 'a vásárlás rögzítve');
  ok(!('qty' in app.store['items/' + id].bought[0]), 'az előrejelzés adataiba nem kerül mennyiség');
});

test('Bevásárlás: javasolt tétel levétele erre a bevásárlásra', async () => {
  const app = await openApp({ tab: 'bolt' });
  const row = app.$$('.row.pred').find(r => r.innerText.includes('kenyér'));
  await app.click(row.querySelector('[data-act=pred-skip]'));
  ok(app.store['items/kenyer'].skipUntil, 'meg van jegyezve, meddig ne javasolja');
  ok(!app.$$('.row.pred').some(r => r.innerText.includes('kenyér')), 'eltűnt a listáról');
});

test('Bevásárlás: lista másolása boltonként, mennyiséggel', async () => {
  const app = await openApp({ tab: 'bolt', setup: w => Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('teszt')) }, configurable: true }) });
  await app.input('item-name', 'joghurt'); await app.input('item-qty', '6 db'); await app.submit('form[data-form=add-item]');
  await app.click('[data-act=copy-list]'); await wait(150);
  const text = app.$('#copy-area').value;
  has(text, 'Bármelyik bolt:'); has(text, '- joghurt (6 db)'); has(text, 'Lidl:'); has(text, '(ha kell)');
});

// ---------- ToDo ----------
test('ToDo: új teendők, a teljes lista látszik', async () => {
  const app = await openApp({ tab: 'majd' });
  for (const t of ['Első', 'Második', 'Harmadik', 'Negyedik', 'Ötödik']) { await app.input('todo-title', t); await app.submit('form[data-form=add-todo]'); }
  eq(app.$$('[data-sort-id] .grow > div:first-child').map(e => e.textContent), ['Első', 'Második', 'Harmadik', 'Negyedik', 'Ötödik']);
  ok(!app.$('details[data-person=todo-all]'), 'nincs elrejtett rész');
});

test('ToDo: átrendezés húzással és billentyűvel', async () => {
  const app = await openApp({ tab: 'majd', setup: (w, db) => ['A', 'B', 'C', 'D'].forEach((t, i) => db.set('todos/t' + i, { title: t, order: i, effort: '1o', deadline: '', createdAt: i })) });
  await app.drag('[data-grip][data-id=t3]', '[data-sort-id=t0]');
  eq(app.$$('[data-sort-id] .grow > div:first-child').map(e => e.textContent), ['D', 'A', 'B', 'C'], 'húzás után');
  eq(app.store['todos/t3'].order, 0, 'a sorrend el van mentve');
  await app.key(app.$('[data-grip][data-id=t2]'), 'ArrowUp');
  eq(app.$$('[data-sort-id] .grow > div:first-child').map(e => e.textContent), ['D', 'A', 'C', 'B'], 'billentyű után');
});

test('ToDo: emlékeztető csak határidővel állítható', async () => {
  const app = await openApp({ tab: 'majd', setup: (w, db) => db.set('todos/x', { title: 'Ajándék', order: 0, effort: '1o', deadline: '', createdAt: 1 }) });
  await app.click('[data-act=todo-edit][data-id=x]');
  ok(app.$('#todo-remind-x').disabled, 'határidő nélkül tiltva');
  await app.change('todo-deadline-x', app.db.key(app.db.at(3)));
  ok(!app.$('#todo-remind-x').disabled, 'határidővel engedélyezett');
  await app.change('todo-remind-x', '1');
  eq(app.store['todos/x'].remind, '1');
  await app.click('[data-act=cancel-edit]');
  has(app.$$('[data-sort-id]').find(r => r.innerText.includes('Ajándék')).innerText, 'emlékeztető 1 nappal előtte');
});

test('ToDo: kipipálás, visszaállítás, törlés visszavonással', async () => {
  const app = await openApp({ tab: 'majd', setup: (w, db) => db.set('todos/x', { title: 'Fogorvos', order: 0, effort: '15p', deadline: '', createdAt: 1 }) });
  await app.click('[data-act=todo-done][data-id=x]');
  ok(app.store['todos/x'].doneAt, 'kipipálva');
  ok(app.$('details[data-person=todo-done]'), 'a kipipáltak között');
  await app.click('[data-act=todo-undone][data-id=x]');
  ok(!app.store['todos/x'].doneAt, 'visszaállítva');
  await app.click('[data-act=todo-edit][data-id=x]'); await app.click('[data-act=todo-del]');
  ok(!app.store['todos/x'], 'törölve');
  await app.click('[data-act=undo]'); await wait(100);
  ok(app.store['todos/x'], 'visszavonás után megvan');
});

test('ToDo: időszűrő', async () => {
  const app = await openApp({ tab: 'majd', setup: (w, db) => {
    db.set('todos/a', { title: 'Gyors', order: 0, effort: '15p', deadline: '', createdAt: 1 });
    db.set('todos/b', { title: 'Hosszú', order: 1, effort: 'fel', deadline: '', createdAt: 2 });
  } });
  await app.click('[data-act=todo-time][data-val="15p"]');
  eq(app.$$('#view .list .row .grow > div:first-child').map(e => e.textContent).filter(t => ['Gyors', 'Hosszú'].includes(t)), ['Gyors']);
  ok(!app.$('[data-grip]'), 'szűrve nincs fogantyú');
});

// ---------- Javaslatok (levelekből, naptárból) ----------
test('Javaslatok: elfogadás, elvetés, biztonságos link, hibás határidő', async () => {
  const app = await openApp({ tab: 'majd', setup: (w, db) => {
    db.set('suggestions/mail-1', { title: 'Ovis befizetés', deadline: db.key(db.at(2)), source: 'Levél: Óvoda', note: 'Péntekig.', link: 'https://mail.google.com/mail/u/0/#all/1', status: 'new', createdAt: 1 });
    db.set('suggestions/cal-1', { title: 'Felköszönteni: Kati', deadline: db.key(db.at(3)), source: 'Naptár: Családi', link: 'javascript:alert(1)', status: 'new', createdAt: 2 });
    db.set('suggestions/bad', { title: 'Hibás', deadline: '2026-10-14 2026-10-21', source: 'Levél: X', status: 'new', createdAt: 3 });
    db.set('suggestions/old', { title: 'Régi elvetett', deadline: '', status: 'dismissed', createdAt: 0 });
  } });
  const sec = app.section('Javaslatok'); ok(sec, 'van Javaslatok rész');
  ok(!sec.innerText.includes('Régi elvetett'), 'az elvetett nem jön vissza');
  ok(!sec.innerText.includes('2026-10-14 2026'), 'hibás határidő nem jelenik meg');
  ok(!sec.querySelector('a[href^="javascript"]'), 'nem Google-link nem kap gombot');
  await app.click('[data-act=sugg-accept][data-id="mail-1"]');
  eq(app.store['suggestions/mail-1'].status, 'accepted');
  const td = Object.values(app.store).find(d => d.title === 'Ovis befizetés' && d.fromSuggestion);
  ok(td && td.deadline === app.db.key(app.db.at(2)), 'ToDo-ba került a határidővel');
  await app.click('[data-act=sugg-dismiss][data-id="cal-1"]');
  eq(app.store['suggestions/cal-1'].status, 'dismissed');
  await app.click('[data-act=undo]'); await wait(100);
  eq(app.store['suggestions/cal-1'].status, 'new', 'elvetés visszavonható');
});

// ---------- Család ----------
test('Család: családtag születési hónappal, a gyerekek felismerése', async () => {
  const app = await openApp({ tab: 'szabaly' });
  const addP = async (n, b) => { await app.input('person-name', n); await app.input('person-birth', b); await app.submit('form[data-form=add-person]'); };
  await addP('Anya', ''); await addP('Miró', monthsAgo(42)); await addP('Maja', monthsAgo(19));
  const ppl = app.store['config/main'].family.people;
  eq(ppl.map(p => p.id), ['anya', 'miro', 'maja']);
  const rows = app.section('Családtagok').innerText;
  has(rows, '3,5 éves'); has(rows, '1 éves 7 hónapos');
  await addP('miró', ''); has(app.toast(), 'már szerepel');
  await app.go('ma');
  eq(app.$$('.fam-person .fam-name').map(e => e.textContent).slice(0, 3), ['Anya', 'Miró', 'Maja']);
});

test('Család: átnevezés után megmaradnak a korábbi bejegyzések', async () => {
  const app = await openApp({ tab: 'szabaly', setup: (w, db) => {
    db.set('config/main', { ...db.store['config/main'], family: { people: [{ id: 'miro', name: 'Miró' }], activities: ['Hajmosás'] } });
    [-12, -9, -6, -3].forEach(d => db.log('fam-miro--hajmosas', d, 19));
  } });
  await app.click('[data-act=edit][data-kind=people][data-key=miro]');
  await app.input('rename-input', 'Mirkó'); await app.submit('form[data-form=rename]');
  await app.go('ma');
  const card = app.$$('.fam-person').find(c => c.querySelector('.fam-name').textContent === 'Mirkó');
  ok(card, 'az átnevezett kártya megvan');
  has(card.innerText, 'ma esedékes', 'a ritmus megmaradt');
});

// ---------- Játszótér ----------
const kidsSetup = fetchStub => (w, db) => {
  w.fetch = fetchStub;
  db.set('config/main', { ...db.store['config/main'], family: { people: [{ id: 'miro', name: 'Miró', birth: monthsAgo(42) }, { id: 'maja', name: 'Maja', birth: monthsAgo(19) }], activities: [] } });
};
test('Játszótér: hideg, esős idő', async () => {
  const app = await openApp({ tab: 'jatszo', setup: kidsSetup(weatherStub({ t: 5, a: 1, pp: 85, pr: 1.2, w: 22, code: 63 })) });
  await until(() => app.$('.wx'), 3000, 'időjárás');
  const kids = app.$$('.kids .card').map(c => c.innerText);
  eq(kids.length, 2, 'két gyerek kap javaslatot');
  has(kids[0], 'Téli kabát'); has(kids[0], 'Esőkabát'); has(kids[0], 'Gumicsizma');
  has(kids[1], 'babakocsiban', 'két év alatt plusz réteg');
  has(app.text('#view'), 'Termosz');
  app.$$('.places-top .place').forEach(p => has(p.innerText, 'rossz időben is jó', 'esőben fedett helyek elöl'));
});

test('Játszótér: kánikula', async () => {
  const app = await openApp({ tab: 'jatszo', setup: kidsSetup(weatherStub({ t: 31, a: 33, uv: 8 })) });
  await until(() => app.$('.wx'), 3000, 'időjárás');
  has(app.$('.kids .card').innerText, 'Rövid ujjú'); has(app.$('.kids .card').innerText, 'Napsapka');
  has(app.text('#view'), 'Naptej');
  has(app.$('.places-top .place').innerText, 'Normafa', 'hőségben a hűvösebb hely az első');
});

test('Játszótér: Fogyóban → ToDo vagy bevásárlólista', async () => {
  const app = await openApp({ tab: 'jatszo', setup: kidsSetup(weatherStub({ t: 18, a: 18 })) });
  await app.click('[data-act=bag-low][data-name="Popsitörlő"]');
  ok(app.$('.bag-ask'), 'megkérdezi, hová');
  await app.click('[data-act=bag-todo]');
  ok(Object.values(app.store).some(d => d.title === 'Hátizsákba feltölteni: Popsitörlő'), 'ToDo-ba került');
  has(app.$$('.row').find(r => r.innerText.includes('Popsitörlő')).innerText, 'ToDo-ban');
  await app.click('[data-act=bag-low][data-name="Pelenka"]'); await app.click('[data-act=bag-buy]');
  eq(app.store['items/pelenka'].onList, true, 'a pelenka a bevásárlólistára került');
});

test('Játszótér: „Itt voltunk” rögzíti a látogatást', async () => {
  const app = await openApp({ tab: 'jatszo', setup: kidsSetup(weatherStub({ t: 18, a: 18 })) });
  const id = app.$('.places-top [data-act=visit]').dataset.id;
  await app.click('.places-top [data-act=visit]');
  const k = app.db.key(Date.now());
  ok((app.store['logs/' + k]?.entries || []).some(e => e.chore === 'place-' + id), 'a látogatás a naplóban');
});

// ---------- Beállítások ----------
test('Beállítások: bolt átnevezése a termékeken is', async () => {
  const app = await openApp({ tab: 'szabaly' });
  await app.click('[data-act=edit][data-kind=store][data-key="0"]');
  await app.input('rename-input', 'Lidl Fót'); await app.submit('form[data-form=rename]');
  eq(app.store['config/main'].stores, ['Lidl Fót', 'DM']);
  eq(app.store['items/tej'].store, 'Lidl Fót');
});

test('Beállítások: házimunka hozzáadása, átnevezése, törlése', async () => {
  const app = await openApp({ tab: 'szabaly' });
  await app.input('chore-name-haz', 'Ablakpucolás'); await app.submit('form[data-form=add-chore][data-group=haz]');
  const id = Object.keys(app.store).find(k => app.store[k].name === 'Ablakpucolás').slice(7);
  await app.click('[data-act=edit][data-kind=chore][data-key="' + id + '"]');
  await app.input('rename-input', 'Ablakmosás'); await app.submit('form[data-form=rename]');
  eq(app.store['chores/' + id].name, 'Ablakmosás');
  await app.click('[data-act=ask-del][data-id="' + id + '"]');
  ok(app.$('[data-act=del-chore][data-id="' + id + '"]'), 'megerősítést kér');
  await app.click('[data-act=del-chore][data-id="' + id + '"]');
  ok(!app.store['chores/' + id], 'törölve');
});

test('Beállítások: robotzóna és tilos bevásárlónap', async () => {
  const app = await openApp({ tab: 'szabaly' });
  await app.input('chore-name-robot', 'Konyha'); await app.submit('form[data-form=add-chore][data-group=robot]');
  ok(Object.values(app.store).some(d => d.name === 'Konyha' && d.group === 'robot'), 'robotzóna mentve');
  await app.click('[data-act=toggle-noshop][data-d="5"]');
  eq(app.store['config/main'].noShopDays, [1, 4, 5]);
  await app.go('ma');
  ok(app.section('Robotporszívó'), 'a Ma fülön megjelenik a Robotporszívó rész');
});

test('Beállítások: téma választása eszközönként, alapból automatikus', async () => {
  const app = await openApp({ tab: 'szabaly' });
  ok(!app.d.documentElement.getAttribute('data-theme'), 'alapból nincs kényszerített téma');
  await app.click('[data-act=set-theme][data-theme=color]');
  eq(app.d.documentElement.getAttribute('data-theme'), 'color');
  eq(app.w.localStorage.getItem('theme'), 'color');
  ok(app.$('[data-act=set-theme][data-theme=color]').getAttribute('aria-pressed') === 'true', 'a választott gomb jelölt');
  await app.click('[data-act=set-theme][data-theme=dark]');
  eq(app.d.documentElement.getAttribute('data-theme'), 'dark');
  await app.click('[data-act=set-theme][data-theme=auto]');
  ok(!app.d.documentElement.getAttribute('data-theme'), 'automatikusnál nincs kényszerítés');
});

test('Beállítások: játszóhely címke és új hely az ötletek közül', async () => {
  const app = await openApp({ tab: 'szabaly', setup: w => { w.fetch = weatherStub({ t: 18, a: 18 }); } });
  app.$('details[data-person="place-tulipanos"]').open = true; await wait(50);
  await app.click('[data-act=toggle-ptag][data-id=tulipanos][data-tag=arnyekos]');
  ok(app.store['config/main'].places.find(p => p.id === 'tulipanos').tags.includes('arnyekos'), 'címke mentve');
  await app.go('jatszo');
  const det = app.$$('details summary').find(s => s.textContent === 'Új helyek ötletnek').parentElement; det.open = true;
  await app.click(det.querySelector('[data-act=add-idea]'));
  ok(app.store['config/main'].places.some(p => p.name === 'Feneketlen-tó játszótér'), 'új hely felvéve');
});

test('Beállítások: értesítések be- és kikapcsolása', async () => {
  const app = await openApp({ tab: 'szabaly', setup: w => { w.FIREBASE_VAPID_KEY = ''; } });
  has(app.section('Értesítések').innerText, 'még nincsenek beállítva');
  const app2 = await openApp({ tab: 'szabaly', setup: w => {
    w.FIREBASE_VAPID_KEY = 'teszt';
    let perm = 'default';
    Object.defineProperty(w.Notification, 'permission', { get: () => perm, configurable: true });
    w.Notification.requestPermission = async () => (perm = 'granted');
    w.HaziPush = { supported: async () => true, token: async () => 'tok', remove: async () => {}, test: async () => {} };
  } });
  await app2.click('[data-act=push-on]'); await wait(300);
  const key = Object.keys(app2.store).find(k => k.startsWith('push/'));
  ok(key, 'a telefon regisztrálva');
  eq([app2.store[key].morning, app2.store[key].morningTime, app2.store[key].time], [true, '07:30', '20:00'], 'alapbeállítások');
  await app2.change('push-morning-time', '06:30');
  await app2.click('[data-act=push-toggle][data-key=summary]');
  eq([app2.store[key].morningTime, app2.store[key].summary], ['06:30', false]);
  await app2.click('[data-act=push-off]');
  ok(!app2.store[key], 'kikapcsolva');
});
