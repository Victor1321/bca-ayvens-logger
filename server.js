// ======================================================
//  SERVER COMPLET — AUTOLOGIN BCA + LOGGER + TELEGRAM
//  CommonJS (compatibil Railway)
// ======================================================

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");   // pentru Telegram

const app = express();
app.use(express.json());
app.use(cors());

// ------------------------------------------------------
// ENV (setezi în Railway → Variables)
// ------------------------------------------------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

const BCA_USERNAME = process.env.BCA_USERNAME;
const BCA_PASSWORD = process.env.BCA_PASSWORD;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn("⚠ Telegram vars lipsesc!");
}
if (!BCA_USERNAME || !BCA_PASSWORD) {
  console.warn("⚠ BCA login vars lipsesc!");
}

// ------------------------------------------------------
// TRIMITERE MESAJ PE TELEGRAM
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
                parse_mode: "HTML"
            })
        });

        console.log("📨 Trimisa licitația la Telegram");
    } catch (err) {
        console.error("❌ Eroare Telegram:", err);
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
        password: BCA_PASSWORD || ""
    });
});

// ------------------------------------------------------
// LOGGER — primește licitații și trimite la Telegram
// ------------------------------------------------------
app.post("/receive-bid", async (req, res) => {
    const data = req.body || {};

    console.log("⚡ BID RECEIVED:", data);

    const msg =
`<b>🚨 LICITATIE NOUĂ</b>

👤 Angajat: <b>${data.client_id || "necunoscut"}</b>
🚗 Titlu: <b>${data.item_title}</b>
💶 Suma: <b>${data.bid_amount} EUR</b>
🔗 Link: ${data.item_link}
🕒 La: ${data.timestamp}
📸 Imagine: ${data.image_url || "N/A"}`;

    await sendToTelegram(msg);
    res.json({ ok: true });
});

// ------------------------------------------------------
// Test
// ------------------------------------------------------
app.get("/", (req, res) => {
    res.send("Server ONLINE ✔ Logger + Autologin READY");
});

// ------------------------------------------------------
// Railway bind
// ------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log("🚀 Server pornit pe port", PORT);
});
