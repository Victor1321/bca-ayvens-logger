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
    console.log("📡 Request STATIC /public:", req.path);
    next();
  },
  express.static(publicDir)
);

// ------------------------------------------------------
// ENV (setezi în Railway → Variables)
// ------------------------------------------------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const BCA_USERNAME = process.env.BCA_USERNAME;
const BCA_PASSWORD = process.env.BCA_PASSWORD;
const AYVENS_USERNAME = process.env.AYVENS_USERNAME;
const AYVENS_PASSWORD = process.env.AYVENS_PASSWORD;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn(
    "⚠ Telegram vars lipsesc! (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)"
  );
}
if (!BCA_USERNAME || !BCA_PASSWORD) {
  console.warn("⚠ BCA_USERNAME / BCA_PASSWORD lipsesc!");
}
if (!AYVENS_USERNAME || !AYVENS_PASSWORD) {
  console.warn("⚠ AYVENS_USERNAME / AYVENS_PASSWORD lipsesc!");
}

// ------------------------------------------------------
// TRIMITERE MESAJ TEXT PE TELEGRAM (folosit pentru BCA)
// ------------------------------------------------------
async function sendToTelegram(message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    console.log("📨 Trimisa licitația la Telegram (text)");
  } catch (err) {
    console.error("❌ Eroare Telegram (sendMessage):", err);
  }
}

// ------------------------------------------------------
// TRIMITERE POZĂ + CAPTION (folosit pentru AYVENS)
// ------------------------------------------------------
async function sendPhotoToTelegram(photoUrl, caption) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      }),
    });

    console.log("📨 Trimisa licitația la Telegram (photo)");
  } catch (err) {
    console.error("❌ Eroare Telegram (sendPhoto):", err);
  }
}

// ------------------------------------------------------
// AUTOLOGIN BCA — trimite username + parola către script
// ------------------------------------------------------
app.post("/auto-login-bca", (req, res) => {
  console.log("🔐 Cerere autologin BCA...");

  res.json({
    ok: true,
    username: BCA_USERNAME || "",
    password: BCA_PASSWORD || "",
  });
});

// ------------------------------------------------------
// AUTOLOGIN AYVENS — trimite username + parola către script
// ------------------------------------------------------
app.post("/auto-login-ayvens", (req, res) => {
  console.log("🔐 Cerere autologin AYVENS...");

  res.json({
    ok: true,
    username: AYVENS_USERNAME || "",
    password: AYVENS_PASSWORD || "",
  });
});

// ------------------------------------------------------
// LOGGER — primește licitații și trimite la Telegram
// ------------------------------------------------------
app.post("/receive-bid", async (req, res) => {
  const data = req.body || {};

  console.log("⚡ BID RECEIVED:", data);

  const baseMsg =
`<b>🚨 LICITATIE NOUĂ</b>

👤 Angajat: <b>${data.client_id || "necunoscut"}</b>
🚗 Titlu: <b>${data.item_title || ""}</b>
💶 Suma: <b>${data.bid_amount} ${data.currency || "EUR"}</b>
🔗 Link: ${data.item_link || ""}
🕒 La: ${data.timestamp || ""}`;

  // varianta originală (BCA) cu linia de imagine
  const msgWithImageLine = `${baseMsg}
📸 Imagine: ${data.image_url || "N/A"}`;

  const isAyvens =
    typeof data.item_link === "string" &&
    data.item_link.includes("carmarket.ayvens.com");

  try {
    if (isAyvens && data.image_url) {
      // AYVENS -> trimitem poza ca photo + caption (fără linia "📸 Imagine")
      await sendPhotoToTelegram(data.image_url, baseMsg);
    } else {
      // BCA (sau fallback): păstrăm EXACT comportamentul vechi
      await sendToTelegram(msgWithImageLine);
    }
  } catch (e) {
    console.error("❌ Eroare la trimiterea bid-ului la Telegram:", e);
  }

  res.json({ ok: true });
});

// ------------------------------------------------------
// Test endpoint
// ------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Server ONLINE ✔ Logger + Autologin READY");
});

// ------------------------------------------------------
// Railway bind
// ------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log("🚀 Server pornit pe port", PORT, "pe 0.0.0.0");
  console.log("📁 Serving /public from:", publicDir);
});
