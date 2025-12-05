// server.js
// ---------------------------------------------------------
// Server Node.js + Express care primește licitațiile și le
// trimite către Telegram. Gata pentru Railway Hosting.
// ---------------------------------------------------------

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

// ---------------------------------------------------------
// CONFIG
// ---------------------------------------------------------
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ ERROR: TELEGRAM_BOT_TOKEN sau TELEGRAM_CHAT_ID lipsesc!");
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------
// Helper — trimite mesaj formatat + poză către Telegram
// ---------------------------------------------------------

async function sendTelegramMessage(data) {
    const { client_id, item_title, bid_amount, currency, timestamp, source, item_link, image_url } = data;

    const textMessage =
        `🚨 <b>BID DETECTAT</b>\n\n` +
        `👤 Angajat: <b>${client_id}</b>\n` +
        `🚗 Mașină: <b>${item_title}</b>\n` +
        `💶 Suma licitată: <b>${bid_amount} ${currency}</b>\n` +
        `⏱️ Timp: <b>${timestamp}</b>\n` +
        `🔎 Sursă: <b>${source}</b>\n` +
        `🔗 <a href="${item_link}">Deschide mașina</a>`;

    try {
        if (image_url) {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                chat_id: CHAT_ID,
                photo: image_url,
                caption: textMessage,
                parse_mode: "HTML"
            });
        } else {
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: textMessage,
                parse_mode: "HTML"
            });
        }
    } catch (err) {
        console.error("❌ Eroare trimitere Telegram:", err.response?.data || err.message);
    }
}

// ---------------------------------------------------------
// Endpoint principal de log licitații
// ---------------------------------------------------------

app.post("/receive-bid", async (req, res) => {
    try {
        const data = req.body;

        if (!data || !data.client_id || !data.bid_amount) {
            console.log("❌ Payload invalid:", req.body);
            return res.status(400).json({ error: "Invalid payload" });
        }

        console.log("📥 Licitație primită:", data);

        await sendTelegramMessage(data);

        res.status(200).json({ success: true });
    } catch (err) {
        console.error("❌ Eroare receive-bid:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ---------------------------------------------------------
// Start server
// ---------------------------------------------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
