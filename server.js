// ======================================================
//  SERVER COMPLET — AUTOLOGIN BCA + AYVENS + LOGGER + TELEGRAM
//  CommonJS (compatibil Railway / Node 18+)
// ======================================================

const path = require("path");
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

app.use(
  "/public",
  (req, res, next) => {
    console.log("[STATIC] Request /public:", req.path);
    next();
  },
  express.static(publicDir)
);

// ------------------------------------------------------
// ENV (setezi in Railway -> Variables)
// ------------------------------------------------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
// TRIMITERE MESAJ TEXT PE TELEGRAM
// ------------------------------------------------------
async function sendToTelegram(message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    console.log("[SEND] Trimit mesaj text catre Telegram...");
    console.log("[DEBUG] URL:", url);
    console.log("[DEBUG] Chat ID:", TELEGRAM_CHAT_ID);
    console.log("[DEBUG] Mesaj (primii 100 caractere):", message.substring(0, 100));

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const responseData = await response.json();
    console.log("[RESPONSE] Raspuns Telegram (text):", responseData);

    if (!response.ok) {
      console.error("ERROR Telegram (text):", responseData);
    } else {
      console.log("SUCCESS: Mesaj text trimis cu succes!");
    }
  } catch (err) {
    console.error("ERROR Telegram (sendMessage):", err);
  }
}

// ------------------------------------------------------
// TRIMITERE POZA + CAPTION
// ------------------------------------------------------
async function sendPhotoToTelegram(photoUrl, caption) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

    console.log("[SEND] Trimit poza catre Telegram...");
    console.log("[DEBUG] URL:", url);
    console.log("[DEBUG] Chat ID:", TELEGRAM_CHAT_ID);
    console.log("[DEBUG] Photo URL:", photoUrl);
    console.log("[DEBUG] Caption (primii 100 caractere):", caption.substring(0, 100));

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      }),
    });

    const responseData = await response.json();
    console.log("[RESPONSE] Raspuns Telegram (photo):", responseData);

    if (!response.ok) {
      console.error("ERROR Telegram (photo):", responseData);
    } else {
      console.log("SUCCESS: Poza trimisa cu succes!");
    }
  } catch (err) {
    console.error("ERROR Telegram (sendPhoto):", err);
  }
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

  console.log("[BID] BID RECEIVED:", data);

  const baseMsg =
`<b>LICITATIE NOUA</b>

Angajat: <b>${data.client_id || "necunoscut"}</b>
Titlu: <b>${data.item_title || ""}</b>
Suma: <b>${data.bid_amount} ${data.currency || "EUR"}</b>
Link: ${data.item_link || ""}
La: ${data.timestamp || ""}
Kilometraj: ${data.mileage || "N/A"}
Prima inregistrare: ${data.registration_date || "N/A"}
Combustibil: ${data.fuel || "N/A"}
Cutie: ${data.gearbox || "N/A"}`;

  try {
    // Daca exista image_url, trimite poza (atât pentru BCA, cat si pentru Ayvens)
    if (data.image_url) {
      await sendPhotoToTelegram(data.image_url, baseMsg);
    } else {
      // Daca nu exista imagine, trimite text
      await sendToTelegram(baseMsg);
    }
  } catch (e) {
    console.error("ERROR la trimiterea bid-ului la Telegram:", e);
    // Fallback: incearca text daca poza a esuat
    try {
      await sendToTelegram(baseMsg);
    } catch (e2) {
      console.error("ERROR si fallback-ul text a esuat:", e2);
    }
  }

  res.json({ ok: true });
});

// ------------------------------------------------------
// Test endpoint
// ------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Server ONLINE - Logger + Autologin READY");
});

// ------------------------------------------------------
// Railway bind
// ------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log("[SERVER] Server pornit pe port", PORT, "pe 0.0.0.0");
  console.log("[DIR] Serving /public from:", publicDir);
});
