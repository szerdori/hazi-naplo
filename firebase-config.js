// A Firebase-projekt webes beállításai (Firebase konzol → Projektbeállítások → Saját alkalmazások → SDK setup and configuration → Config).
// Ezek az értékek nem titkosak: azt, hogy ki férhet hozzá az adatokhoz, a firestore.rules szabályai döntik el.
// Amíg az apiKey üres, az app a „még nincs összekötve” üzenetet mutatja.
// A `self` az oldalon és az értesítéseket fogadó service workerben is működik.
self.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAwXtsCfMoIHYAf3o5-VqtDuVce0RCZb2M",
  authDomain: "hazi-naplo.firebaseapp.com",
  projectId: "hazi-naplo",
  storageBucket: "hazi-naplo.firebasestorage.app",
  messagingSenderId: "1078907751316",
  appId: "1:1078907751316:web:1052c7329bd7a09ac95d81",
};
// Firebase konzol → Projektbeállítások → Cloud Messaging → Web Push certificates → Key pair (nyilvános kulcs).
// Amíg üres, az értesítések nem kapcsolhatók be.
self.FIREBASE_VAPID_KEY = "BCiwUPAvKzgVwqpcNCIiSI2qqsRez_CFRJtUvJkxrhbNkruqa1yGN_160lA_3VKvJx31Rl2c3975ePiPcSoxRKI";
