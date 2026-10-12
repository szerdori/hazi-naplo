// Sends the morning and evening notifications. Runs on a schedule in GitHub Actions (.github/workflows/esti-ertesites.yml).
// The repository is public, so this script never prints personal data: only counts.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { budapestNow, shouldSend, buildMessage, buildMorning, slug, KINDS } from './notify-logic.mjs';

const SITE = process.env.SITE_URL || 'https://szerdori.github.io/hazi-naplo/';
let account;
try { account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); } catch { account = null; }
if (!account || !account.project_id) {
  console.log('Nincs beállítva a FIREBASE_SERVICE_ACCOUNT titok, nincs mit küldeni.');
  process.exit(0);
}

initializeApp({ credential: cert(account) });
const db = getFirestore();
const fcm = getMessaging();
const now = budapestNow();

const subs = (await db.collection('push').get()).docs;
let shared = null;
const loadShared = async () => shared ??= {
  logsDoc: (await db.doc('logs/' + now.day).get()).data(),
  items: (await db.collection('items').get()).docs.map(d => d.data()),
  todos: (await db.collection('todos').get()).docs.map(d => d.data()),
};

const stats = { sent: 0, quiet: 0, notYet: 0, removed: 0, failed: 0 };
for (const doc of subs) {
  const sub = doc.data();
  for (const kind of ['morning', 'evening']) {
    if (!shouldSend(sub, now, kind)) { stats.notYet++; continue; }
    const status = (await db.doc('status/' + slug(sub.email)).get()).data();
    const data = { ...(await loadShared()), status };
    const msg = kind === 'morning' ? buildMorning(sub, now, data) : buildMessage(sub, now, data);
    if (msg) {
      try {
        await fcm.send({
          token: sub.token,
          webpush: { notification: { title: msg.title, body: msg.body, icon: SITE + 'icon-192.png', badge: SITE + 'icon-192.png', tag: kind }, fcmOptions: { link: SITE } },
        });
        stats.sent++;
      } catch (e) {
        if (e.code === 'messaging/registration-token-not-registered' || e.code === 'messaging/invalid-registration-token') { await doc.ref.delete(); stats.removed++; break; }
        console.log('Küldési hiba:', e.code || 'ismeretlen'); stats.failed++; continue;
      }
    } else stats.quiet++;
    await doc.ref.update({ [KINDS[kind].last]: now.day });
  }
}
console.log(`Kész (${now.day}): ${stats.sent} elküldve, ${stats.quiet} csendben (nem volt mit mondani), ${stats.notYet} még nem esedékes, ${stats.removed} lejárt eszköz törölve, ${stats.failed} hiba.`);
