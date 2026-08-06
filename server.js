// ======================================================
//  SERVER COMPLET — AUTOLOGIN BCA + AYVENS + LOGGER + TELEGRAM
//  CommonJS SALUT
// ======================================================

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

// Node 18 are fetch integrat
const fetch = (...args) => globalThis.fetch(...args);

const app = express();

// ------------------------------------------------------
// MIDDLEWARE DE BAZĂ
// ------------------------------------------------------
app.use(express.json());
app.use(cors());

// ------------------------------------------------------
// SERVIRE STATICĂ /public  (logger-script-*.js, autologin-*.js)
// ------------------------------------------------------
const publicDir = path.join(__dirname, "public");

// fără log la fiecare request static — era cel mai mare zgomot din Grafana
app.use("/public", express.static(publicDir));

// ------------------------------------------------------
// ENV (setezi in Railway -> Variables)
// ------------------------------------------------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
// al doilea chat e OPȚIONAL (secret TELEGRAM_CHAT_ID_2 în Fly.io): dacă lipsește,
// totul funcționează ca înainte, cu un singur chat.
const TELEGRAM_CHAT_ID_2 = process.env.TELEGRAM_CHAT_ID_2;
const TELEGRAM_CHAT_IDS = [TELEGRAM_CHAT_ID, TELEGRAM_CHAT_ID_2].filter(Boolean);

const BCA_USERNAME = process.env.BCA_USERNAME;
const BCA_PASSWORD = process.env.BCA_PASSWORD;
const AYVENS_USERNAME = process.env.AYVENS_USERNAME;
const AYVENS_PASSWORD = process.env.AYVENS_PASSWORD;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn(
    "WARNING: Telegram vars missing! (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)"
  );
}
if (!BCA_USERNAME || !BCA_PASSWORD) {
  console.warn("WARNING: BCA_USERNAME / BCA_PASSWORD missing!");
}
if (!AYVENS_USERNAME || !AYVENS_PASSWORD) {
  console.warn("WARNING: AYVENS_USERNAME / AYVENS_PASSWORD missing!");
}

// ------------------------------------------------------
// DEBUG LOGGING (Grafana)
// LOG_DEBUG=1  -> loguri verbose (payload-uri, răspunsuri Telegram)
// LOG_FILE=... -> scrie și în fișier local. ATENȚIE: pe Fly.io discul e EFEMER,
//                 fișierul dispare la redeploy/restart; se citește cu `fly ssh console`.
//                 Grafana (stdout) rămâne sursa principală.
// ------------------------------------------------------
const LOG_DEBUG = process.env.LOG_DEBUG === "1" || process.env.LOG_DEBUG === "true";
const LOG_FILE = process.env.LOG_FILE ? path.join(__dirname, process.env.LOG_FILE) : null;

function writeLogFile(line) {
  if (!LOG_FILE) return;
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) {
      fs.writeFileSync(LOG_FILE, `# debug.log resetat ${new Date().toISOString()}\n`);
    }
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (e) {
    /* fișierul e doar opțional */
  }
}

function logLine(line) {
  console.log(line);
  writeLogFile(line);
}

// ------------------------------------------------------
// NUME FRUMOASE + ULTIMELE 3 CIFRE DIN TELEFON (Telegram)
// ------------------------------------------------------
// client_id din logger (ex. "ionescu-vladut") -> nume afișat în mesajul Telegram.
// Client care nu e în tabelă -> rămâne pe client_id brut (comportament vechi).
const CLIENT_NAMES = {
  "braun":          { name: "Braun", last3: "717" },
  "catalin-pana":   { name: "Catalin Pana", last3: "980" },
  "david-fleasca":  { name: "David Fleasca", last3: "277" },
  "edy":            { name: "Edy", last3: "309" },
  "filip-ionut":    { name: "Filip Ionuț", last3: "905" },
  "gabone":         { name: "Gabone", last3: "684" },
  "ionescu-vladut": { name: "Ionescu Vladuț", last3: "927" },
  "laurentiu":      { name: "Laurentiu", last3: "325" },
  "mimin-valentin": { name: "Valentin Mimin", last3: "223" },
  "pavel-ionut":    { name: "Pavel Ionut", last3: "595" },
  "radu-andrei":    { name: "Radu Andrei", last3: "897" },
};

// client_id -> text de afișat în Telegram ("Ionescu Vladuț — 927"); fallback = id brut
function formatClient(clientId) {
  const info = CLIENT_NAMES[clientId];
  if (!info) return clientId || "unknown";
  return info.name + (info.last3 ? " — " + info.last3 : "");
}

// Ora afișată în mesajul Telegram: Europe/Bucharest (EET iarna / EEST vara).
// Clienții noi trimit ISO UTC (cu Z) -> formatăm corect. Clienții vechi trimit
// "YYYY-MM-DD HH:mm:ss" fără marker de fus -> îi păstrăm ca atare.
function formatBucharest(ts) {
  try {
    if (!ts) {
      return new Date().toLocaleString("ro-RO", { timeZone: "Europe/Bucharest", hour12: false });
    }
    if (typeof ts === "string" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)) {
      return ts;
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return new Intl.DateTimeFormat("ro-RO", {
      timeZone: "Europe/Bucharest",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).format(d);
  } catch (e) {
    return String(ts || "");
  }
}

// ------------------------------------------------------
// TRIMITERE MESAJ TEXT PE TELEGRAM
// ------------------------------------------------------
async function sendToTelegram(message) {
  // trimitem către FIECARE chat din listă; ok doar dacă TOATE au primit
  const results = [];
  let allOk = true;

  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

      if (LOG_DEBUG) {
        console.log(`[SEND] Trimit mesaj text catre Telegram (chat ${chatId})...`);
        console.log("[DEBUG] URL:", url);
        console.log("[DEBUG] Chat ID:", chatId);
        console.log("[DEBUG] Mesaj (primii 100 caractere):", message.substring(0, 100));
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      });

      const responseData = await response.json();
      if (LOG_DEBUG) console.log(`[RESPONSE] Raspuns Telegram (text, chat ${chatId}):`, responseData);

      if (!response.ok) {
        console.error(`ERROR Telegram (text, chat ${chatId}):`, responseData);
        allOk = false;
      }
      results.push({ chat_id: chatId, ok: response.ok, status: response.status, data: responseData });
    } catch (err) {
      console.error(`ERROR Telegram (sendMessage, chat ${chatId}):`, err && err.message ? err.message : err);
      allOk = false;
      results.push({ chat_id: chatId, ok: false, status: 0, data: { error: String(err && err.message ? err.message : err) } });
    }
  }

  const firstBad = results.find((r) => !r.ok);
  return { ok: allOk && results.length > 0, status: firstBad ? firstBad.status : 200, data: results };
}

// ------------------------------------------------------
// TRIMITERE POZA + CAPTION
// ------------------------------------------------------
async function sendPhotoToTelegram(photoUrl, caption) {
  // trimitem către FIECARE chat din listă; ok doar dacă TOATE au primit
  const results = [];
  let allOk = true;

  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

      if (LOG_DEBUG) {
        console.log(`[SEND] Trimit poza catre Telegram (chat ${chatId})...`);
        console.log("[DEBUG] URL:", url);
        console.log("[DEBUG] Chat ID:", chatId);
        console.log("[DEBUG] Photo URL:", photoUrl);
        console.log("[DEBUG] Caption (primii 100 caractere):", caption.substring(0, 100));
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption,
          parse_mode: "HTML",
        }),
      });

      const responseData = await response.json();
      if (LOG_DEBUG) console.log(`[RESPONSE] Raspuns Telegram (photo, chat ${chatId}):`, responseData);

      if (!response.ok) {
        console.error(`ERROR Telegram (photo, chat ${chatId}):`, responseData);
        allOk = false;
      }
      results.push({ chat_id: chatId, ok: response.ok, status: response.status, data: responseData });
    } catch (err) {
      console.error(`ERROR Telegram (sendPhoto, chat ${chatId}):`, err && err.message ? err.message : err);
      allOk = false;
      results.push({ chat_id: chatId, ok: false, status: 0, data: { error: String(err && err.message ? err.message : err) } });
    }
  }

  const firstBad = results.find((r) => !r.ok);
  return { ok: allOk && results.length > 0, status: firstBad ? firstBad.status : 200, data: results };
}

// ------------------------------------------------------
// AUTOLOGIN BCA
// ------------------------------------------------------
app.post("/auto-login-bca", (req, res) => {
  console.log("[AUTH] Cerere autologin BCA...");

  res.json({
    ok: true,
    username: BCA_USERNAME || "",
    password: BCA_PASSWORD || "",
  });
});

// ------------------------------------------------------
// AUTOLOGIN AYVENS
// ------------------------------------------------------
app.post("/auto-login-ayvens", (req, res) => {
  console.log("[AUTH] Cerere autologin AYVENS...");

  res.json({
    ok: true,
    username: AYVENS_USERNAME || "",
    password: AYVENS_PASSWORD || "",
  });
});

// ------------------------------------------------------
// LOGGER — primeste licitatii si trimite la Telegram
// ------------------------------------------------------
app.post("/receive-bid", async (req, res) => {
  const data = req.body || {};
  const client = data.client_id || "unknown";
  const amount = data.bid_amount;

  // ---- log compact, lizibil în Grafana (3 linii per bid + rezultat + linie goală) ----
  logLine(`[BID] ${client} | ${amount} ${data.currency || "EUR"} | ${data.source || "?"} | ${data.host || ""}`);
  logLine(`${data.item_title || ""} | ${data.mileage || "N/A"} | ${data.registration_date || "N/A"} | ${data.fuel || "N/A"} | ${data.gearbox || "N/A"}`);
  logLine(`${data.item_link || ""}`);
  if (LOG_DEBUG) logLine("[BID-DETAIL] raw=" + JSON.stringify(data));

  const baseMsg =
`<b>LICITATIE NOUA</b>

Utilizator: <b>${formatClient(client)}</b>
Titlu: <b>${data.item_title || ""}</b>
Suma: <b>${amount} ${data.currency || "EUR"}</b>
Link: ${data.item_link || ""}
La: ${formatBucharest(data.timestamp)}
Kilometraj: ${data.mileage || "N/A"}
Prima inregistrare: ${data.registration_date || "N/A"}
Combustibil: ${data.fuel || "N/A"}
Cutie: ${data.gearbox || "N/A"}`;

  let result = null;
  try {
    // Daca exista image_url, trimite poza (atât pentru BCA, cat si pentru Ayvens)
    result = data.image_url
      ? await sendPhotoToTelegram(data.image_url, baseMsg)
      : await sendToTelegram(baseMsg);
  } catch (e) {
    logLine(`[BID] ${client} -> trimitere a eșuat: ${e && e.message ? e.message : e}`);
  }

  // Fallback: dacă poza a eșuat, încearcă text (către aceleași chat-uri)
  if ((!result || !result.ok) && data.image_url) {
    try {
      result = await sendToTelegram(baseMsg);
    } catch (e2) {
      logLine(`[BID] ${client} -> si fallback-ul text a esuat: ${e2 && e2.message ? e2.message : e2}`);
    }
  }

  if (result && result.ok) {
    // msg_id-urile din TOATE chat-urile, separate cu virgulă (ex. "545,546")
    const msgIds = (result.data || [])
      .filter((r) => r && r.ok && r.data && r.data.result && r.data.result.message_id)
      .map((r) => r.data.result.message_id);
    logLine(`[BID] ${client} -> telegram ok${msgIds.length ? " msg_id=" + msgIds.join(",") : ""}`);
  } else if (result) {
    const errDesc = (result.data || [])
      .filter((r) => r && !r.ok)
      .map((r) => (r.data && (r.data.description || r.data.error)) || r.status || "?")
      .join("; ");
    logLine(`[BID] ${client} -> telegram FAIL err=${errDesc || result.status || "?"}`);
  }
  logLine(""); // linie goală între blocuri

  res.json({ ok: true });
});

// ------------------------------------------------------
// Test endpoint
// ------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Server ONLINE - Logger + Autologin READY");
});

// ------------------------------------------------------
// Health check (Grafana / uptime)
// ------------------------------------------------------
app.get("/health", (req, res) => {
  const h = { ok: true, uptime: Math.round(process.uptime()), ts: new Date().toISOString() };
  console.log("[HEALTH] ok uptime=" + h.uptime + "s");
  res.json(h);
});

// ------------------------------------------------------
// Railway bind
// ------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log("[SERVER] Server pornit pe port", PORT, "pe 0.0.0.0");
  console.log("[DIR] Serving /public from:", publicDir);
});
