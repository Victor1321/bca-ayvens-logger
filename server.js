// ======================================================
//  SERVER COMPLET — AUTOLOGIN BCA + LOGGER + TELEGRAM
//  Funcționează 100% pe Railway
// ======================================================

import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(express.json());
app.use(cors());

// ------------------------------------------------------
// ENV (setezi în Railway → Variables)
// ------------------------------------------------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

const BCA_USERNAME = process.env.BCA_USERNAME;   // date reale BCA
const BCA_PASSWORD = process.env.BCA_PASSWORD;

// verificare inițială
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn("⚠ Telegram env vars lipsă în Railway!");
}
if (!BCA_USERNAME || !BCA_PASSWORD) {
  console.warn("⚠ BCA_USERNAME / BCA_PASSWORD lipsesc în Railway!");
}

// ------------------------------------------------------
// 1️⃣ Funcție TRIMITERE MESAJ pe TELEGRAM
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

        console.log("📨 Trimis la Telegram");
    } catch (err) {
        console.error("❌ Eroare trimitere Telegram:", err);
    }
}

// ------------------------------------------------------
// 2️⃣ Endpoint AUTOLOGIN pentru BCA
// ------------------------------------------------------
app.post("/auto-login-bca", (req, res) => {
    console.log("🔐 Cerere autologin BCA");

    return res.json({
        ok: true,
        username: BCA_USERNAME || "",
        password: BCA_PASSWORD || ""
    });
});

// ------------------------------------------------------
// 3️⃣ LOGGER — primește licitațiile reale
//     (scriptul injectabil trimite aici)
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
// 4️⃣ Test endpoint
// ------------------------------------------------------
app.get("/", (req, res) => {
    res.send("Server ONLINE ✔ Logger + Autologin READY");
});

// ------------------------------------------------------
// 5️⃣ Railway PORT bind
// ------------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log("🚀 Server pornit pe port", PORT);
});
