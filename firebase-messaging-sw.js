// Fogadja a háttérben érkező értesítéseket, és megjeleníti őket akkor is, ha az app nincs nyitva.
// Nem tárol el semmit offline, így mindig a legfrissebb appverzió töltődik be.
importScripts('firebase-config.js');
importScripts(
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
);
if (self.FIREBASE_CONFIG && self.FIREBASE_CONFIG.apiKey) {
  firebase.initializeApp(self.FIREBASE_CONFIG);
  firebase.messaging();
}
