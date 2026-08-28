# BCA / Ayvens Logger — Documentație & Istoric Modificări

> Fișier creat pentru continuitate: ce s-a făcut, ce s-a modificat, cum se testează și cum se publică.
> Ultima actualizare: sesiunea de modificări majore (versiune logger `3.1.0`).

---

## 1. Ce este proiectul

Sistem de **logging licitații auto (BCA + Ayvens) cu notificări pe Telegram**:

```
┌─ Server Node/Express (deploy pe Fly.io)     → server.js + Dockerfile + fly.toml
├─ Logger scripts (injectate în browser)       → public/logger-script-*.js
└─ Autologin scripts (injectate în browser)    → public/autologin-*.js
```

- **Server**: primește bid-urile pe `POST /receive-bid` și le trimite pe Telegram (cu poză dacă există `image_url`, altfel text).
- **Logger**: interceptează click-urile și request-urile XHR/fetch pe site-urile de licitație, extrage detaliile mașinii și trimite bid-ul la server.
- **Autologin**: completează automat user/parolă pe bca.com / login.bca.com / carmarket.ayvens.com (credentialele vin printr-un bridge `postMessage` către o extensie de browser, sau de pe server în varianta veche de debug).
- **Loader**: fiecare coleg are o extensie care încarcă scriptul cu numele lui de pe server (ex. `https://bca-ayvens-logger.fly.dev/public/logger-script-braun.js`). URL-ul e fix per coleg (numele în URL).

**Deploy**: app `bca-ayvens-logger` pe Fly.io, port 8080, zona `ams`, Node 22 (`Dockerfile`), build din repo-ul GitHub conectat în dashboard-ul Fly.io.

---

## 2. Modificările din această sesiune (versiunea actuală, gata de deploy)

> Stare: **modificate local, verificate, NU încă urcate pe GitHub / NU încă deploy-uite.**
> Pe server rulează încă versiunea veche până la următorul redeploy.

### 2.1 `server.js` — loguri curate + /health + ora României + debug configurabil

| Ce | Detalii |
|---|---|
| Scos zgomotul | Eliminat `console.log("[STATIC] Request /public:", ...)` — apărea la fiecare refresh/încărcare de script (cea mai mare sursă de spam în Grafana). |
| Log compact per bid | `/receive-bid` loghează acum un bloc lizibil, nu JSON pe o linie: `[BID] client | sumă EUR | sursă | host` + detaliile mașinii (titlu \| km \| data înmatriculării \| combustibil \| cutie) + linkul + `[BID] client -> telegram ok msg_id=...` (sau `FAIL err=...`) + **linie goală între bid-uri**. |
| Ora României | Funcție nouă `formatBucharest()`: mesajul Telegram (`La: ...`) se formatează pe `Europe/Bucharest` (EEST vara / EET iarna), nu mai e hardcodat +2h. Clienții vechi care trimit ora fără marcaj de fus sunt păstrați ca atare. |
| Debug configurabil | `LOG_DEBUG=1` (variabilă de mediu): loguri verbose (URL, Chat ID, răspuns Telegram, payload-ul brut pe linia `[BID-DETAIL] raw={...}`). |
| Fișier log opțional | `LOG_FILE=debug.log`: scrie și în fișier local pe mașină, cu rotire automată la 5MB. **ATENȚIE**: pe Fly.io discul e EFEMER (dispărea la redeploy/restart) — se citește cu `fly ssh console`; Grafana rămâne sursa principală. |
| Health check | Rută nouă `GET /health` → `{ ok: true, uptime, ts }`. |
| Retur Telegram | `sendToTelegram` / `sendPhotoToTelegram` returnează acum `{ ok, status, data }`; `/receive-bid` folosește rezultatul ca să logheze `telegram ok/FAIL`. |

**Neschimbat în server.js**: endpoint-urile `/auto-login-bca` și `/auto-login-ayvens`, `GET /`, mesajul Telegram (aceleași câmpuri), fallback-ul poză→text.

### 2.2 Logger scripts (`public/logger-script-*.js`) — versiunea completă `3.1.0`

Toate cele **16 fișiere** (braun, gabone, edy, laurentiu, pavel-ionut, radu-andrei, catalin-pana, david-fleasca, filip-ionut, ionescu-vladut, mimin-valentin, marian, nume, nume-fără-extensie, test, ultimaver) au primit **aceeași logică nouă**, identice între ele în afară de `CLIENT_ID` și header (verificat prin diff).

| Ce | Detalii |
|---|---|
| Multilingv | `BID_KEYWORDS` extins cu traduceri pentru licit/ofertă/trimite/confirmă: SK, CS, HU, DE, PL, ES, IT, FR, NL, PT, TR + EN/RO. Matching-ul de text rămâne identic (selectoare + `innerText \|\| value`), doar lista de cuvinte a crescut. |
| Independent de limbă | Nou `isBidRequest(url, body, amount)` = URL-pattern (`/bid`, `/offer`, `/sale/bid/`, `/placebid`, `/proxy`, `/lot`, `/auction` — URL-urile de endpoint rămân în engleză indiferent de limba UI) **OR** keyword **OR** sumă numerică validă + semnal. Interceptoarele XHR/fetch BCA au trecut pe el. |
| Click mai robust | Click BCA: textul butonului (neschimbat) + `aria-label`/name/`data-*`/title + ID (`isBidElement`) + fallback: input cu `€` găsit în cardul butonului (prinde UI în altă limbă, text necunoscut). |
| `host` în payload | Toate cele 3 payload-uri (buildPayload BCA, XHR Ayvens, IDP) trimit `host: location.hostname`. |
| Timestamp ISO UTC | `timestamp()` → `new Date().toISOString()` (scos `+2h` hardcodat); serverul formatează în Europe/Bucharest. |
| Debug în browser | `DEBUG` default OFF, activ cu `?debug=1` în URL sau `localStorage['logger-debug']='1'`. Logurile verbose → `dlog(...)` gated. O linie mereu activă: `[BID] trimis <client> | <suma> EUR | <sursa> | <host>`. |
| Versiune | `const VERSION = "3.1.0"` — apare la pornire în log (`v3.1.0 activ pe ... client: ...`), ca să știi ce versiune rulează pe fiecare PC. |

**Motivul principal al update-ului**: un coleg avea BCA-ul în slovacă după login; butonul nu mai avea textul în RO/EN, deci bid-urile nu se prindeau. Acum detecția nu mai depinde de limba UI.

### 2.3 Autologin (`public/autologin-bca.js` + `public/autologin-ayvens.js`) — silențios, overlay neschimbat

| Ce | Detalii |
|---|---|
| Skip dacă ești logat | `isLoggedIn()` (markere user/meniu/logout/avatar); pe pagina de login fără formular → return silențios. Regula: *dacă nu există element de login, nu forța nimic și nu loga erori*. Elimină zgomotul + erorile de la refresh/back. |
| Guard anti-dublă | `window.__bcaAutologinStarted` / `window.__ayvensAutologinStarted` — pornește o singură dată per pagină. |
| Loguri gated | Toate logurile verbose → `dlog(...)` (DEBUG). O linie mereu la acțiuni reale: `[AUTOLOGIN] bca: click Autentificare`, `[AUTOLOGIN] bca: creds filled+submitted`, `[AUTOLOGIN] ayvens: click Conectare`, `[AUTOLOGIN] ayvens: creds filled+submitted`. |
| Overlay NESCHIMBAT | Ecranul negru cu spinner „Se încarcă, te conectăm automat... / Te rugăm să nu închizi această fereastră." rămâne exact cum era (apare doar când chiar se completează credențialele). |
| Selectoare neschimbate | Flow-ul Ayvens (`#btn_signIn` → `#userName`/`#password` → `#btn_login`) și BCA rămân identice; doar zgomotul a fost scos (ex. log-ul la fiecare poll de 500ms din waitFor). |
| `autologin-bca-debug.js` | **NEATINS** — variantă veche de debug, nefolosită. |

---

## 3. Verificările făcute (înainte de push)

- Checker de sintaxă (paranteze/string-uri/template literals) pe **toate cele 20 de fișiere JS** → toate `OK` (fișierul checker `.tmp_jscheck.py` a fost șters după).
- Diff structural: cele 16 logger-uri sunt identice în afară de linia header + linia `CLIENT_ID`.
- Markerii noi prezenți în toate logger-urile: `VERSION = "3.1.0"`, `BID_URL_PATTERNS`, `isBidRequest`, `host: location.hostname`.
- `server.js`: 0 loguri `[STATIC]`, 1 rută `/health`, `formatBucharest` + `logLine` prezente.
- Autologin: guard-uri prezente, overlay „te conectăm automat" intact, selectoare neschimbate.
- Fără `.env` și fără fișiere temporare în folder.

---

## 4. Cum se publică (push + redeploy)

**Calea folosită de tine**: GitHub → dashboard Fly.io (fără CLI).

1. Urcă pe GitHub fișierele modificate (folderul e deja legat de repo-ul tău).
2. Dashboard Fly.io → app-ul `bca-ayvens-logger` → **Deploy** → **Redeploy** (sau selectează commit-ul nou).
3. Verifică în **Metrics & Logs** / Grafana: a apărut serverul nou (`[SERVER] Server pornit pe port 8080`), nu mai există linii `[STATIC] Request /public:`.
4. Colegii primesc automat scripturile noi la următorul refresh (URL-urile nu s-au schimbat).

**Variabile de mediu (Secrets în dashboard)** — existente: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `BCA_USERNAME`, `BCA_PASSWORD`, `AYVENS_USERNAME`, `AYVENS_PASSWORD`. Noi (opționale): `LOG_DEBUG=1` (detalii în loguri), `LOG_FILE=debug.log`.

---

## 5. Planul de test incremental (recomandat — cum am convenit)

1. **Urcă DOAR** `server.js` + `public/logger-script-test.js` → redeploy.
   - Serverul devine nou; colegii rămân pe scripturile vechi (compatibile — nu se oprește nimic).
2. Testează pe laptopul tău: pointerezi loader-ul din extensie să încarce `logger-script-test.js` (sau lipești conținutul lui în DevTools Console pe site-ul de licitație) și licitezi la o mașină.
3. Verifici în Grafana blocul compact `[BID] test | sumă EUR | sursă | host` + detaliile + `-> telegram ok`, și mesajul pe Telegram (va apărea „Angajat: test").
4. Dacă e totul ok → urci **restul** fișierelor (`logger-script-*.js` + `autologin-bca.js` + `autologin-ayvens.js`) → redeploy → gata, update complet pentru toți.

**Detalii de știut la test:**
- La colegii pe versiune veche, câmpul `host` din log apare gol (există doar în versiunea nouă) — normal.
- Ora lor în mesajul Telegram rămâne cum era până la update-ul complet (serverul păstrează ora fără marcaj de fus așa cum vine).
- Test cu consolă + loader activ în același timp → poți primi 2 mesaje pe Telegram pentru același bid (unul de la versiunea veche, unul de la cea nouă) — dezactivezi temporar extensia dacă te deranjează.

---

## 6. Comportament & noțiuni de care să ții cont

- **Aceeași mașină licitată de 2+ colegi**: funcționează deja — NU există dedup între PC-uri; fiecare trimite mesajul lui, etichetat cu „Angajat: <nume>". Dedup-ul de 2s e doar per browser (anti dublu-click pe aceeași sumă+link).
- **Debug în browser**: `?debug=1` în URL-ul paginii sau `localStorage['logger-debug']='1'` → loguri detaliate în DevTools. Fără el, browserul loghează doar liniile `[BID] trimis ...` și `[AUTOLOGIN] ...`.
- **Grafana (loguri server)**: implicit vezi doar blocul compact per bid + `[HEALTH]` + erori. Cu `LOG_DEBUG=1` vezi și payload-urile brute.
- **Limita ferestrei de loguri din Grafana**: de-aia logurile sunt proiectate pe linii scurte, cu `[BID]` la început și client+sumă în primele ~40 de caractere.

---

## 6.1 Comportament IDP `idp.bca-online-auctions.eu` (versiune logger ≥ 3.2.4)

> **Context**: contul BCA a fost deblocat intermitent (când e „blocat", meniurile de pe `www.bca.com` nu mai merg / te aruncă pe homepage — nu e vina scripturilor). După o licitație reală, pe IDP bid-urile nu se prindeau la buton sau la proxy (max-bid). Fix-ul de mai jos face ca **orice acțiune pe IDP să trimită pe Telegram**, fără să mai depindă de pattern-uri stricte de URL/body.

| Ce | Detalii (v3.2.4) |
|---|---|
| XHR/fetch relaxate | Pe `idp.bca-online-auctions.eu` se interceptează **orice POST** (excluzând doar telemetria: Dynatrace/Adobe/Piwik/2o7). S-a scos gate-ul `isHardBidUrl`/`isBodyBid`, care lăsa bid-urile să treacă neprinse. |
| Sumă robustă | Ordine: câmp explicit din body (`propbid`/`maxbid`/`bidamount`/`bidvalue`/`amount`/`price`/`value`) → JSON → parametru URL → input-ul de bid (`#proxyBidValue`, input cu €, sau orice input numeric plauzibil) → **răspunsul serverului** (hook pe `load`, suma confirmată). Fără scan generic de cifre (evită id-urile). |
| Click permissive | Butoane cu text `+N` (**+50 / +100 / +200**), `Trimite`/`Send`/`Place`/`Bid` + orice element `[role=button]`/`[class*=btn]`. Se setează `lastIdpClick` și la ~900ms un fallback (`idp-click-fallback`) trimite cu suma din input dacă interceptorul de rețea n-a trimis în 3s. |
| Enter în input de bid | Acceptă `#proxyBidValue` **sau** orice input cu € / din panoul de bid (nu doar id-ul exact). |
| WebSocket | Parsare permisivă: orice mesaj cu câmp numeric `p` (sau `b.p`) = preț în cenți → sumă. Log permanent `[IDP] WS send/in ...`. |
| Log `[IDP]` permanent | Fiecare POST XHR/fetch loghează `[IDP] XHR/FETCH POST: URL | semnal bid: ... | sumă: ... | body: ...`, vizibil fără `?debug=1`. |
| Dedup | Cheia `lot|suma` + cooldown 2s → **un singur mesaj Telegram per bid**, chiar dacă e prins pe mai multe căi (click + request + răspuns). |

**Verificat**: sintaxă (delimitatori echilibrați) și recitire manuală; **testul live e încă de făcut** pentru că site-ul era inaccesibil (cont/ses). Când îți revine contul: lipești scriptul în DevTools pe IDP, licitezi la buton și la proxy → trebuie exact 1 mesaj per bid, cu suma corectă.

---

## 7. Idei viitoare (discutate, nefăcute încă)
2. **Securitate**: `/auto-login-*` și `/receive-bid` nu au autentificare — oricine poate face POST. Opțional: header `X-Api-Key` verificat pe server; eventual ștergerea endpoint-urilor `/auto-login-*` (folosite doar de varianta veche de debug).
3. **Curățenie fișiere**: arhivare într-un folder separat pentru `logger-script-nume` (fără extensie), `logger-script-test.js`, `logger-script-ultimaver.js`, `autologin-bca-debug.js` (șabloane/arhivă, încurcă).
4. `axios` și `dotenv` sunt în `package.json` dar nefolosite în `server.js` (dotenv ar fi util pentru `.env` local).

---

## 8. Structura folderului (după modificări)

```
bca-ayvens-logger-main/
├── server.js                  → MODIFICAT (loguri compacte, /health, formatBucharest, LOG_DEBUG/LOG_FILE)
├── Dockerfile                 → neschimbat (Node 22, port 8080)
├── fly.toml                   → neschimbat
├── package.json               → neschimbat
├── public/
│   ├── logger-script-*.js     → TOATE MODIFICATE (16 fișiere, v3.1.0, identice în afară de CLIENT_ID/header)
│   ├── logger-script-nume     → MODIFICAT (copie fără extensie, CLIENT_ID "nume")
│   ├── autologin-bca.js       → MODIFICAT (silențios, skip dacă e logat, overlay intact)
│   ├── autologin-ayvens.js    → MODIFICAT (idem)
│   └── autologin-bca-debug.js → NEATINS (vechi, nefolosit)
```

**Stare curentă pentru deploy:** `server.js` + `public/logger-script-test.js` pentru test → restul după validare.
