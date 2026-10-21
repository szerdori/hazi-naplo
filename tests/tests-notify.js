// Unit tests for the notification logic (scripts/notify-logic.mjs), which runs on GitHub Actions.
import * as L from '../scripts/notify-logic.mjs';

const now = { day: '2026-10-12', minutes: 20 * 60 + 5 }, morning = { day: '2026-10-12', minutes: 7 * 60 + 40 };
const sub = { email: 'en@x.hu', token: 't' };
const status = { cap: 6, tasks: [{ label: 'Mosás', due: '2026-10-12' }, { label: 'Öntözés', due: '2026-10-10' }, { label: 'Miró – Hajmosás', due: '2026-10-11' }, { label: 'Robot: Konyha', due: '2026-10-12' }, { label: 'Ablak', due: '2026-10-20' }] };
const entries = n => ({ entries: Array.from({ length: n }, (_, i) => ({ by: 'en@x.hu', name: ['Mosogatás', 'Mosás', 'Öntözés'][i % 3] })) });

test('Értesítés: budapesti idő nyáron és télen', async () => {
  eq(L.budapestNow(new Date('2026-07-01T18:05:00Z')), { day: '2026-07-01', minutes: 1205 });
  eq(L.budapestNow(new Date('2026-12-01T19:05:00Z')), { day: '2026-12-01', minutes: 1205 });
  eq(L.budapestNow(new Date('2026-12-01T23:30:00Z')).day, '2026-12-02', 'éjfél után már másnap');
});

test('Értesítés: mikor küld (időablak, naponta egyszer, kikapcsolva)', async () => {
  eq(L.shouldSend(sub, now, 'evening'), true);
  eq(L.shouldSend({ ...sub, lastSent: '2026-10-12' }, now, 'evening'), false, 'ma már ment');
  eq(L.shouldSend({ ...sub, time: '20:30' }, now, 'evening'), false, 'még nincs itt az ideje');
  eq(L.shouldSend({ ...sub, time: '17:00' }, now, 'evening'), false, '2 óránál régebbi időpont');
  eq(L.shouldSend({ ...sub, evening: false }, now, 'evening'), false, 'este kikapcsolva');
  eq(L.shouldSend(sub, morning, 'morning'), true, 'reggel 7:30 után');
  eq(L.shouldSend({ ...sub, morning: false }, morning, 'morning'), false, 'reggel kikapcsolva');
  eq(L.shouldSend({ email: 'x' }, now, 'evening'), false, 'token nélkül nem');
});

test('Értesítés: esti üzenet szintjei, nem nyaggat', async () => {
  const m0 = L.buildMessage(sub, now, { status });
  has(m0.body, 'még nem rögzítettél semmit'); has(m0.body, 'Még esedékes: Mosás, Öntözés, Miró – Hajmosás és még 1');
  const m3 = L.buildMessage(sub, now, { logsDoc: entries(3), status });
  eq(m3.title, 'Esti összefoglaló'); has(m3.body, 'Ma 3 dolgot intéztél');
  const m6 = L.buildMessage(sub, now, { logsDoc: entries(6), status });
  eq(m6.title, 'Szép nap volt!'); ok(!m6.body.includes('Még esedékes'), 'reális nap után nem sorolja az esedékest');
  eq(L.buildMessage(sub, now, { logsDoc: entries(10), status }).title, 'Hatalmas nap volt!');
  eq(L.buildMessage({ ...sub, summary: false, due: false }, now, { logsDoc: entries(3), status }), null, 'mindent kikapcsolva nincs üzenet');
  eq(L.todayCount('en@x.hu', now, { logsDoc: { entries: [{ by: 'ferj@x.hu' }, { by: 'en@x.hu' }] } }), 1, 'a másik ember bejegyzése nem számít');
  const t = new Date('2026-10-12T15:00:00Z').getTime();
  const shop = [{ bought: [{ t, by: 'en@x.hu' }] }, { bought: [{ t, by: 'en@x.hu' }] }, { bought: [{ t, by: 'en@x.hu' }] }];
  const w = L.todayWork('en@x.hu', now, { logsDoc: { entries: [{ by: 'en@x.hu', name: 'Mosás' }] }, items: shop });
  eq(w.count, 2, 'három megvett tétel egy bevásárlás');
  ok(w.list.some(([l, n]) => l === 'Bevásárlás' && n === 1), 'a felsorolásban „Bevásárlás”');
});

test('Értesítés: reggeli üzenet', async () => {
  const m = L.buildMorning(sub, morning, { status });
  eq(m.title, 'Mára esedékes: 4');
  has(L.buildMorning(sub, morning, { status: { ...status, cap: 3 } }).body, 'több, mint egy reális nap');
  eq(L.buildMorning(sub, morning, { status: { cap: 6, tasks: [{ label: 'Ablak', due: '2026-10-20' }] } }), null, 'ha nincs esedékes, csend');
});

test('Értesítés: javaslatok és ToDo-emlékeztetők hozzáfűzése', async () => {
  const s = L.withSuggestions(null, [{ title: 'Felköszönteni: Kati' }]);
  eq(s.title, 'Új javaslat a ToDo-ban'); eq(L.withSuggestions(null, []), null);
  has(L.withSuggestions({ title: 'T', body: 'B.' }, [{ title: 'A' }, { title: 'B' }, { title: 'C' }]).body, '3 új javaslat a ToDo-ban: A, B és még 1');
  const todos = [
    { title: 'Ajándék', deadline: '2026-10-13', remind: '1', by: 'en@x.hu' },
    { title: 'Kész már', deadline: '2026-10-13', remind: '1', doneAt: 1 },
    { title: 'Nincs emlékeztető', deadline: '2026-10-13', remind: '' },
    { title: 'Másé', deadline: '2026-10-13', remind: '1', by: 'ferj@x.hu' },
    { title: 'Egy hét', deadline: '2026-10-19', remind: '7' },
  ];
  eq(L.remindersFor('en@x.hu', morning, todos).map(t => t.title), ['Ajándék', 'Egy hét']);
  has(L.withReminders(null, L.remindersFor('en@x.hu', morning, todos), morning).body, 'Ajándék (határidő holnap)');
});
