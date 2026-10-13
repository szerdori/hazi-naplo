# MomAssistant

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

## Esti értesítés (Android)
- **Reggel** (alapból 7:30, 6:00–9:30 között állítható): a mára esedékes teendők. Ha nincs semmi esedékes, nem jön értesítés.
- **Este** (alapból 20:00, 17:00–22:00 között állítható): napi összefoglaló egy kis vállveregetéssel, illetve szól, ha aznap még nem rögzítettél semmit, vagy ha maradt esedékes teendő. Ha már megvan a reális napod, az esedékes teendőket nem sorolja.
- Mindkettő és az esti részek külön kapcsolhatók: **Beállítások → Értesítések**.

Hogyan működik: a telefon a Firebase Cloud Messagingen keresztül kapja az értesítést (`firebase-messaging-sw.js`). A küldést a GitHub Actions végzi: a `.github/workflows/esti-ertesites.yml` reggel és este 20 percenként lefuttatja a `scripts/notify.mjs` programot, ami megnézi, kinek kell szólni.

Egyszeri beállítás:
1. **Web Push kulcs:** Firebase konzol → fogaskerék → **Project settings → Cloud Messaging** → lent **Web configuration → Web Push certificates → Generate key pair**. A megjelenő kulcs nyilvános; ez kerül a `firebase-config.js` `FIREBASE_VAPID_KEY` sorába.
2. **Kiszolgálói kulcs (titkos):** Firebase konzol → **Project settings → Service accounts → Generate new private key → Generate key**. Letöltődik egy `.json` fájl.
   - GitHub: a tárolóban **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`, Secret: a letöltött fájl teljes tartalma (Jegyzettömbbel megnyitva, mindent kijelölve)
   - Utána töröld a letöltött fájlt a gépről. Ezt a kulcsot ne küldd el senkinek, chatbe se.
3. **Telefonon:** nyisd meg az appot (lehetőleg a kezdőképernyőről), **Beállítások → Esti értesítés → Bekapcsolás ezen a telefonon**, és engedélyezd az értesítéseket. A **Próbaértesítés** gombbal ellenőrizheted, hogy megjelenik-e.
4. **Ellenőrzés:** a GitHub-tárolóban az **Actions** fülön látszanak a futások. Kézzel is indítható: **Esti értesítés → Run workflow**.

Tudnivalók:
- A futások naplója nyilvános, ezért a program csak darabszámokat ír ki, nevet, e-mailt vagy teendőt soha.
- A GitHub az ütemezett futásokat néha 5–20 percet késve indítja, ezért az értesítés a beállított időpont után kicsivel érkezhet.
- Ha a tárolóban 60 napig nem történik változás, a GitHub szünetelteti az ütemezést; ilyenkor az Actions fülön egy gombbal újra bekapcsolható.

## Adatok átköltöztetése a prototípusból
A claude.ai-os változatban: **Szabályok → Adatok → Adatok másolása (JSON)**. Az új appban: **Szabályok → Adatok → Importálás**, majd illeszd be és nyomd meg a **Betöltés** gombot.

## Regressziós tesztek
A `tests` mappában van egy tesztkészlet, ami végigpróbálja az app funkcióit: Ma fül, statisztika, bevásárlás, ToDo, javaslatok, családi ápolás, játszótér, beállítások és az értesítések logikája. A tesztek egy láthatatlan Edge böngészőben futnak, egy memóriabeli, kitalált adatbázison (`tests/mock-db.js`), így a valódi adatokhoz és a Firebase-hez nem nyúlnak.

Futtatás a projektmappában:
```
.\tests\run-tests.ps1
```
- `-Csak Bevásárlás`: csak azok a tesztek, amelyek nevében ez szerepel
- `-Reszletes`: kiírja, melyik teszt épp indul
- `-Lathato`: látható böngészőablakban fut, hibakereséshez

A `feltoltes.ps1` feltöltés előtt automatikusan lefuttatja őket, és ha valamelyik hibás, nem tölt fel.

**Új teszt felvétele:** a `tests/tests-app.js` megfelelő csoportjának végére (az értesítések logikájához a `tests/tests-notify.js`-be):
```js
test('Csoport: mit ellenőriz', async () => {
  const app = await openApp({ tab: 'bolt' });             // friss app, alap adatokkal, bejelentkezve
  await app.input('item-name', 'tej'); await app.submit('form[data-form=add-item]');
  eq(app.store['items/tej'].onList, true, 'a tej a listán van');
});
```
Segédeszközök (`tests/harness.js`): `openApp({ tab, seed, setup })`, `app.click`, `app.input`, `app.change`, `app.submit`, `app.go`, `app.drag`, `app.key`, `app.section`, `app.tileNames`, `app.toast`, `app.store`, ellenőrzésre `ok`, `eq`, `has`.

## Frissítés
Minden változtatás után futtasd a projektmappában:
```
.\feltoltes.ps1 "Mit változtattunk"
```
vagy kattints duplán a `feltoltes.cmd` fájlra. A szkript megmutatja, mely fájlok változtak, rákérdez egy rövid leírásra, majd feltölti őket. A GitHub Pages egy-két percen belül kiteszi az új verziót. A hozzáférési szabályok (`firestore.rules`) változását viszont a Firebase konzolban kell kézzel közzétenni.
