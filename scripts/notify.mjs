// Sends the evening notifications. Runs on a schedule in GitHub Actions (.github/workflows/esti-ertesites.yml).
// The repository is public, so this script never prints personal data: only counts.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { budapestNow, shouldSend, buildMessage, slug } from './notify-logic.mjs';

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

let sent = 0, quiet = 0, notYet = 0, removed = 0, failed = 0;
for (const doc of subs) {
  const sub = doc.data();
  if (!shouldSend(sub, now)) { notYet++; continue; }
  const status = (await db.doc('status/' + slug(sub.email)).get()).data();
  const msg = buildMessage(sub, now, { ...(await loadShared()), status });
  if (msg) {
    try {
      await fcm.send({
        token: sub.token,
        webpush: { notification: { title: msg.title, body: msg.body, icon: SITE + 'icon-192.png', badge: SITE + 'icon-192.png' }, fcmOptions: { link: SITE } },
      });
      sent++;
    } catch (e) {
      if (e.code === 'messaging/registration-token-not-registered' || e.code === 'messaging/invalid-registration-token') { await doc.ref.delete(); removed++; continue; }
      console.log('Küldési hiba:', e.code || 'ismeretlen'); failed++; continue;
    }
  } else quiet++;
  await doc.ref.update({ lastSent: now.day });
}
console.log(`Kész (${now.day}): ${sent} elküldve, ${quiet} csendben (nem volt mit mondani), ${notYet} még nem esedékes, ${removed} lejárt eszköz törölve, ${failed} hiba.`);
