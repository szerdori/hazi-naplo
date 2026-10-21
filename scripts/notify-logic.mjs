// Pure decision logic for the morning and evening notifications, kept free of Firebase so it can be tested in a browser.

export const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Day key (YYYY-MM-DD) and minutes since midnight in Budapest local time.
export function budapestNow(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

// Each kind has its own switch, time and "already sent today" marker on the device's push document.
// `until` (minutes after midnight, Budapest) is the latest a late run may still send: GitHub's scheduler
// often starts runs hours late, so a missed slot is better delivered late than not at all.
export const KINDS = {
  morning: { on: 'morning', time: 'morningTime', last: 'lastSentMorning', def: '07:30', until: 11 * 60 },
  evening: { on: 'evening', time: 'time', last: 'lastSent', def: '20:00', until: 24 * 60 },
};

// Send once a day, at or after the chosen time, and no later than the kind's `until` (or 2 hours after the time, if later).
export function shouldSend(sub, now, kind = 'evening') {
  const k = KINDS[kind];
  if (!sub || !sub.token || sub[k.on] === false || sub[k.last] === now.day) return false;
  const [h, m] = String(sub[k.time] || k.def).split(':').map(Number);
  const at = h * 60 + m;
  return now.minutes >= at && now.minutes < Math.max(at + 120, k.until);
}

// Work the user logged today: chores and visits, finished todos, and shopping — a shopping trip counts as
// one unit however many items were ticked, like in the app. Entries from before "by" was recorded count for everyone.
export function todayWork(email, now, { logsDoc, items = [], todos = [] }) {
  const mine = by => !by || by === email;
  const sameDay = t => budapestNow(new Date(t)).day === now.day;
  const labels = [];
  for (const e of logsDoc?.entries || []) if (mine(e.by)) labels.push(e.name || 'egyéb');
  const shopped = items.some(it => (it.bought || []).some(b => mine(b.by) && sameDay(b.t)));
  if (shopped) labels.push('Bevásárlás');
  for (const td of todos) if (td.doneAt && mine(td.doneBy) && sameDay(td.doneAt)) labels.push(td.title);
  const tally = {};
  for (const l of labels) tally[l] = (tally[l] || 0) + 1;
  return { count: labels.length, list: Object.entries(tally).sort((a, b) => b[1] - a[1]) };
}
export const todayCount = (email, now, data) => todayWork(email, now, data).count;

const pick = (arr, day) => arr[[...day].reduce((a, c) => a + c.charCodeAt(0), 0) % arr.length];
const PAT = {
  over: ['Ma jóval többet csináltál a szokásosnál. Most már tényleg pihenj!', 'Ez rendkívüli nap volt. Holnap lehet lassabban.'],
  enough: ['Megvolt a reális napod. Pihenj, megérdemled.', 'Mára bőven elég volt. Szép munka!', 'Ez igen, a mai adag megvolt.'],
  some: ['Minden kis lépés számít.', 'Ma is sokat tettél a családért.', 'Ez is megvolt, szép munka.'],
};
const TITLE = { over: 'Hatalmas nap volt!', enough: 'Szép nap volt!', some: 'Esti összefoglaló' };

function listText(list, max = 4) {
  const shown = list.slice(0, max).map(([l, n]) => (n > 1 ? n + '× ' : '') + l);
  return shown.join(', ') + (list.length > max ? ' és még ' + (list.length - max) + ' féle' : '');
}
function dueList(st, now) {
  const due = (st?.tasks || []).filter(t => t.due <= now.day);
  if (!due.length) return null;
  return { n: due.length, text: due.slice(0, 3).map(t => t.label).join(', ') + (due.length > 3 ? ' és még ' + (due.length - 3) : '') };
}

// Evening: today's summary with a pat on the back, plus what is still due unless the day was already enough.
// Returns { title, body } or null when there is nothing worth saying.
export function buildMessage(sub, now, data) {
  const { count, list } = todayWork(sub.email, now, data);
  const st = data.status, cap = st?.cap || 0;
  const level = cap && count >= cap * 1.5 ? 'over' : cap && count >= cap ? 'enough' : 'some';
  const parts = []; let title = null;
  if (count === 0) {
    if (sub.nothing !== false) { title = 'MomAssistant'; parts.push('Ma még nem rögzítettél semmit. Ha volt valami, egy koppintás az appban.'); }
  } else if (sub.summary !== false) {
    title = TITLE[level];
    parts.push('Ma ' + count + ' dolgot intéztél: ' + listText(list) + '. ' + pick(PAT[level], now.day));
  }
  if (sub.due !== false && level === 'some') {
    const d = dueList(st, now);
    if (d) { parts.push('Még esedékes: ' + d.text + '. Ha ma nem fér bele, ráér holnap is.'); title = title || 'Esti átnézés'; }
  }
  return parts.length ? { title, body: parts.join(' ') } : null;
}

// Morning: what is due today. Quiet when nothing is due.
export function buildMorning(sub, now, data) {
  const d = dueList(data.status, now);
  if (!d) return null;
  const cap = data.status?.cap || 0;
  return {
    title: 'Mára esedékes: ' + d.n,
    body: d.text + '.' + (cap && d.n > cap ? ' Ez több, mint egy reális nap (kb. ' + cap + '), válogass nyugodtan, a többi ráér.' : ' Szép napot!'),
  };
}

// ToDo reminders: open todos whose deadline minus the chosen number of days is today.
export function remindersFor(email, now, todos = []) {
  const dayMs = 864e5, today = Date.parse(now.day + 'T00:00:00Z');
  return todos.filter(t => !t.doneAt && t.deadline && t.remind !== undefined && t.remind !== '' && (!t.by || t.by === email))
    .filter(t => (Date.parse(t.deadline + 'T00:00:00Z') - today) / dayMs === Number(t.remind));
}
export function withReminders(msg, todos = [], now) {
  if (!todos.length) return msg;
  const when = t => { const d = (Date.parse(t.deadline + 'T00:00:00Z') - Date.parse(now.day + 'T00:00:00Z')) / 864e5; return d === 0 ? 'ma' : d === 1 ? 'holnap' : d + ' nap múlva'; };
  const text = 'Emlékeztető: ' + todos.slice(0, 3).map(t => t.title + ' (határidő ' + when(t) + ')').join(', ') + (todos.length > 3 ? ' és még ' + (todos.length - 3) : '') + '.';
  return msg ? { title: msg.title, body: text + ' ' + msg.body } : { title: todos.length === 1 ? 'Emlékeztető' : todos.length + ' emlékeztető', body: text };
}

// New suggestions from the daily e-mail and calendar review, not yet mentioned in any notification.
// Adds one sentence to the message, or makes a message of its own when there was nothing else to say.
export function withSuggestions(msg, suggestions = []) {
  if (!suggestions.length) return msg;
  const n = suggestions.length;
  const text = (n === 1 ? 'Új javaslat a ToDo-ban: ' : n + ' új javaslat a ToDo-ban: ') +
    suggestions.slice(0, 2).map(s => s.title).join(', ') + (n > 2 ? ' és még ' + (n - 2) : '') + '. Nézz rá, és igazítsd a határidőt, ha kell.';
  return msg ? { title: msg.title, body: msg.body + ' ' + text } : { title: n === 1 ? 'Új javaslat a ToDo-ban' : n + ' új javaslat a ToDo-ban', body: text };
}
