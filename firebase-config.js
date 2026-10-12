// A Firebase-projekt webes beállításai (Firebase konzol → Projektbeállítások → Saját alkalmazások → SDK setup and configuration → Config).
// Ezek az értékek nem titkosak: azt, hogy ki férhet hozzá az adatokhoz, a firestore.rules szabályai döntik el.
// Amíg az apiKey üres, az app a „még nincs összekötve” üzenetet mutatja.
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};
