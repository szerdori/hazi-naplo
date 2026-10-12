# Házi Napló

Házimunka- és bevásárlásnapló. A bejegyzésekből megtanulja, mit milyen gyakran csináltok vagy vesztek, és ez alapján előre jelez. A saját szabályaid (pl. „hétfőn és csütörtökön nem vásárolunk”) felülírják a megfigyelt mintát.

- **Felület:** egyetlen statikus oldal (`index.html`), GitHub Pages-en fut.
- **Adatok és belépés:** Firebase (Firestore + Google-bejelentkezés), ingyenes Spark csomag.
- **Hozzáférés:** csak a `firestore.rules`-ban felsorolt Google-fiókok olvashatják és írhatják az adatokat.

## Fájlok

| Fájl | Mire való |
|---|---|
| `index.html` | maga az app |
| `firebase-config.js` | a Firebase-projekt webes beállításai |
| `firestore.rules` | hozzáférési szabályok mintája (élesben a Firebase konzolban él) |
| `manifest.webmanifest`, `icon*` | kezdőképernyőre tehető app ikonja és neve |
| `hazi-naplo.html` | a korábbi, claude.ai-on futó prototípus (átköltözés után törölhető) |

## Első beállítás

### 1. Git telepítése (egyszer)
Töltsd le és telepítsd: https://git-scm.com/download/win. Az alapbeállítások jók. Az első feltöltéskor megnyílik egy böngészőablak, ahol be kell lépni a GitHubra.

### 2. GitHub-tároló
1. https://github.com/new
2. Név: `hazi-naplo`, láthatóság: **Public** (az ingyenes GitHub Pages ehhez nyilvános tárolót kér; a tárolóba csak a kód kerül, az adatok a Firebase-ben vannak).
3. Ne pipálj be semmit (README, .gitignore, licenc nélkül), majd **Create repository**.

### 3. Firebase-projekt
1. https://console.firebase.google.com → **Projekt létrehozása**, név: `hazi-naplo`. A Google Analytics kikapcsolható.
2. **Product categories → Authentication → Get started → Sign-in method → Google → Enable**, add meg a saját e-mail címedet támogatási címként, **Save**.
3. **Product categories → Firestore Database → Create database**. Helyszín: `eur3 (europe-west)`. Mód: **production**.
4. A Firestore **Rules** fülén cseréld le a szöveget a `firestore.rules` tartalmára, a két mintacímet írd át a saját és a férjed Google-címére, majd **Publish**.
5. Fogaskerék → **Project settings → General → Your apps → Web (`</>`)**. Név: `Házi Napló`, a Firebase Hosting pipát hagyd üresen. A megjelenő `firebaseConfig` értékeit másold be a `firebase-config.js`-be (vagy add oda Claude-nak).
6. **Authentication → Settings → Authorized domains → Add domain:** `<github-felhasználóneved>.github.io`

### 4. GitHub Pages bekapcsolása (az első feltöltés után)
A tárolóban: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, mappa: `/ (root)` → Save.**
Egy-két perc múlva az app elérhető itt: `https://<github-felhasználóneved>.github.io/hazi-naplo/`

### 5. Telefonra
Nyisd meg a címet a telefonon, lépj be Google-fiókkal, majd:
- **Android (Chrome):** menü → *Hozzáadás a kezdőképernyőhöz*
- **iPhone (Safari):** Megosztás → *Főképernyőhöz adás*

## Adatok átköltöztetése a prototípusból
A claude.ai-os változatban: **Szabályok → Adatok → Adatok másolása (JSON)**. Az új appban: **Szabályok → Adatok → Importálás**, majd illeszd be és nyomd meg a **Betöltés** gombot.

## Frissítés
Minden változtatás után:
```
git add -A
git commit -m "Mit változtattunk"
git push
```
A GitHub Pages egy-két percen belül kiteszi az új verziót. A hozzáférési szabályok (`firestore.rules`) változását viszont a Firebase konzolban kell kézzel közzétenni.
