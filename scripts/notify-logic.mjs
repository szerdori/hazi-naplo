// Pure decision logic for the evening notification, kept free of Firebase so it can be tested in a browser.

export const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Day key (YYYY-MM-DD) and minutes since midnight in Budapest local time.
export function budapestNow(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

// Send once a day, at or after the chosen time; the window is wide because scheduled runs can start late.
export function shouldSend(sub, now) {
  if (!sub || !sub.token || sub.lastSent === now.day) return false;
  const [h, m] = String(sub.time || '20:00').split(':').map(Number);
  const at = h * 60 + m;
  return now.minutes >= at && now.minutes < at + 120;
}

// Work the user logged today: chores and visits, bought items, finished todos.
// Entries from before "by" was recorded count for everyone, like in the app.
export function todayCount(email, now, { logsDoc, items = [], todos = [] }) {
  const mine = by => !by || by === email;
  const sameDay = t => budapestNow(new Date(t)).day === now.day;
  let n = (logsDoc?.entries || []).filter(e => mine(e.by)).length;
  for (const it of items) for (const b of it.bought || []) if (mine(b.by) && sameDay(b.t)) n++;
  for (const td of todos) if (td.doneAt && mine(td.doneBy) && sameDay(td.doneAt)) n++;
  return n;
}

// Returns { title, body } or null when there is nothing worth saying.
export function buildMessage(sub, now, data) {
  const count = todayCount(sub.email, now, data);
  const parts = [];
  if (sub.nothing !== false && count === 0) parts.push('Ma még nem rögzítettél semmit. Ha volt valami, egy koppintás az appban.');
  const st = data.status;
  if (sub.due !== false && st && !(st.cap && count >= st.cap)) {
    const due = (st.tasks || []).filter(t => t.due <= now.day);
    if (due.length) parts.push('Még esedékes: ' + due.slice(0, 3).map(t => t.label).join(', ') + (due.length > 3 ? ' és még ' + (due.length - 3) : '') + '. Ha ma nem fér bele, ráér holnap is.');
  }
  if (!parts.length) return null;
  return { title: count === 0 ? 'MomAssistant' : 'Esti átnézés', body: parts.join(' ') };
}
