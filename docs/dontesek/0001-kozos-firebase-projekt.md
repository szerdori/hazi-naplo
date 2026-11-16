# 0001 – Egy közös Firebase-projekt a MomAssistant és a Kapitány számára

*Állapot: elfogadva (visszamenőleg rögzítve, 2026-11-16).*

## Háttér
A MomAssistant (Firebase projekt `hazi-naplo`) Firestore-ját és Google-belépését a Kapitány is használja, a saját `kapitany_*` gyűjteményeivel. A Kettesben szintén ide ír, a `kettesben/profile` dokumentumba, de az nem tartozik ennek a döntésnek a hatókörébe. A DMScreen külön Firebase-projektet használ; a `hazi-naplo` projektben megmaradt régi `dmscreen*` gyűjteményeket a felhasználó törölheti, ha már nem kellenek (a mentés ma még viszi őket).

## Döntés
- Egy projekt, egy Firestore-szabályrendszer: a szabály ugyanazt a két Google-fiókot engedi be mindenhova.
- Az egyes appok adatai külön gyűjteményekben vannak, és nem nyúlnak egymás gyűjteményeihez.
- A szerveroldali kulcs (`%USERPROFILE%\.momassistant\kulcs.json`) a gépen marad, és GitHub Secretként (`FIREBASE_SERVICE_ACCOUNT`) van meg a futtató tárolókban.

## Miért
Nincs külön fiók- és jogosultságkezelés, nincs külön számlázás és nincs külön belépés. Két felhasználónak ez bőven elég, és a `szerdori.github.io` domain egyszeri engedélyezése mindenre vonatkozik.

## Kockázatok
- **Közös szabályrendszer.** Egy hibás szabály vagy egy elveszett hozzáférés mindegyik appot érinti. A tényleges szabályokat a Firebase konzol őrzi, a tárolóban lévő `firestore.rules` csak minta (e-mail-címek nélkül, mert a tároló nyilvános).
- **Közös kvóta.** Egy elszabadult lekérdezés vagy ciklus az összes app limitjét felhasználhatja.
- **Közös kulcs.** A szerver-kulcs mindent olvas és ír. Kiszivárgás esetén a Firebase konzolban azonnal ki kell cserélni, és a GitHub Secreteket is frissíteni kell.
- **Adatvesztés.** A Firestore nem ad automatikus, könnyen visszaállítható mentést ebben a beállításban.

## Következmények
- Hetente helyi mentés készül: `scripts/export-firestore.ps1` (ütemezése a fájl elején le van írva). A mentés a gépen marad, nem kerülhet a nyilvános tárolóba vagy GitHub Actions artifactba.
- Új gyűjteményt csak egyértelmű előtaggal vegyünk fel (`kapitany_`, `kettesben` stb.), és a mentés automatikusan viszi minden legfelső szintű gyűjteményt.
- Ha a közös projekt kockázata egyszer többe kerül, mint amit a kényelme ér, az adott app külön projektet kap (mint a DMScreen, lásd annak 0002 döntését).
