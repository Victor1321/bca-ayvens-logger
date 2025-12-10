// -------------------------------------------------------------
// LOGGER-SCRIPT INJECTABIL (FARA TAMPERMONKEY)
// Universal Auction Logger – BCA + Ayvens
// Trimite licitatiile reale catre serverul tau (Railway)
// -------------------------------------------------------------
(function () {
    "use strict";

    // --------------------------
    // CONFIG
    // --------------------------
    const SERVER_URL = "https://bca-ayvens.up.railway.app/receive-bid";
    const CLIENT_ID = "Nume";

    const BID_KEYWORDS = ["bid", "licit", "offer", "oferta", "place", "submit"];
    const ALLOWED_HOSTS = [
        "ee.bca-europe.com",
        "idp.bca-online-auctions.eu",
        "carmarket.ayvens.com"
    ];

    const CLICK_WINDOW_MS = 5000;
    const DEDUP_WINDOW_MS = 3000;

    let lastClickInfo = null;
    let lastSentSignature = null;
    let lastSentTime = 0;

    // --------------------------
    // Helpers
    // --------------------------
    function now() { return Date.now(); }
    function isAllowed() { return ALLOWED_HOSTS.includes(location.hostname); }

    function textContainsKeyword(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return BID_KEYWORDS.some(k => lower.includes(k));
    }

    function extractNumberEU(text) {
        if (!text) return null;
        text = text.replace(/[^0-9.,]/g, "");
        if (!text) return null;
        const std = text.replace(/\./g, "").replace(",", ".");
        const nr = parseFloat(std);
        return isNaN(nr) || nr < 100 || nr > 500000 ? null : nr;
    }

    function findValueInInputs() {
        const inputs = document.querySelectorAll("input[type='text'], input[type='number']");
        for (const inp of inputs) {
            if (!inp.offsetParent) continue;
            const nr = extractNumberEU(inp.value);
            if (nr) return nr;
        }
        return null;
    }

    function findNumberInText(el) {
        return el ? extractNumberEU(el.innerText || "") : null;
    }

    function scanNearbyForNumber(btn) {
        const area = btn.closest("form, article, section, div") || document.body;
        const nums = [];
        area.querySelectorAll("*").forEach(el => {
            if (!el.offsetParent) return;
            const nr = findNumberInText(el);
            if (nr) nums.push(nr);
        });
        return nums.length ? Math.max(...nums) : null;
    }

    // --------------------------
    // Titlu Ayvens + BCA
    // --------------------------
    function extractItemTitle(btn) {
        const host = location.hostname;

        // Ayvens - combina titlu principal + sublinie
        if (host.includes("ayvens")) {
            const card = btn?.closest("article, .vehicle, .listing-item, .offer-item, .card");
            if (card) {
                const h2 = card.querySelector("h2.vehicle-title");
                const make = card.querySelector("p.vehicle-make");

                const t1 = h2 ? (h2.childNodes[2]?.textContent?.trim() || "") : "";
                const t2 = make ? make.textContent.trim() : "";

                const full = [t1, t2].filter(Boolean).join(" ");
                if (full) return full;
            }
        }

        // BCA (functioneaza pe ambele domenii)
        const bca = document.querySelector("h2.viewlot__headline.viewlot__headline--large");
        if (bca && bca.innerText.trim()) return bca.innerText.trim();

        // fallback
        const h = document.querySelector("h1, h2");
        return h?.innerText?.trim() || "Titlu indisponibil";
    }

    // --------------------------
    // Imagine – BCA + Ayvens
    // --------------------------
    function extractImageUrl(btn) {
        const host = location.hostname;

        // Ayvens – luam poza din cardul vehiculului
        if (host.includes("carmarket.ayvens.com")) {
            let img = null;

            // 1) încearcă mai întâi în cardul butonului
            if (btn) {
                const card = btn.closest(".vehicle-card, .vehicle, .search-result, .row, article, section, div");
                if (card) {
                    img = card.querySelector(".vehicle-picture img, img[id^='vehicle-default-picture']");
                }
            }

            // 2) fallback global
            if (!img) {
                img = document.querySelector(".vehicle-picture img, img[id^='vehicle-default-picture']");
            }

            if (img && img.src) return img.src;
        }

        // BCA
        let img = document.querySelector(".viewlot__img img.MainImg");
        if (img && img.src) return img.src;

        img = document.querySelector(".ImageA img");
        if (img && img.src) return img.src;

        return null;
    }

    // --------------------------
    // Timestamp local GMT+2
    // --------------------------
    function timestamp() {
        const d = new Date(Date.now() + 2 * 3600000);
        return d.toISOString().replace("T", " ").replace("Z", "");
    }

    // --------------------------
    // Dedup
    // --------------------------
    function shouldSend(sig) {
        const t = now();
        if (lastSentSignature === sig && t - lastSentTime < DEDUP_WINDOW_MS) return false;
        lastSentSignature = sig;
        lastSentTime = t;
        return true;
    }

    // --------------------------
    // Payload Builder
    // --------------------------
    function buildPayload(amount, sourceTag, btn) {
        return {
            client_id: CLIENT_ID,
            item_link: location.href,
            item_title: extractItemTitle(btn),
            bid_amount: amount,
            currency: "EUR",
            timestamp: timestamp(),
            source: sourceTag,
            image_url: extractImageUrl(btn)
        };
    }

    // --------------------------
    // Send to server
    // --------------------------
    function sendToServer(data) {
        const sig = JSON.stringify({
            client_id: data.client_id,
            item_link: data.item_link,
            bid_amount: data.bid_amount,
            timestamp: data.timestamp
        });

        if (!shouldSend(sig)) return;

        fetch(SERVER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        }).catch(err => console.error("[LOGGER] Eroare send:", err));
    }

    // =========================================================
    // START – Script activ doar pe hosturile permise
    // =========================================================
    if (!isAllowed()) return;

    // --------------------------
    // CLICK detector
    // --------------------------
    document.addEventListener("click", e => {
        const btn = e.target.closest("button, a, input[type='submit']");
        if (!btn) return;

        const txt = (btn.innerText || btn.value || "").trim();
        if (!textContainsKeyword(txt)) return;

        const amount = findValueInInputs() || findNumberInText(btn) || scanNearbyForNumber(btn);

        lastClickInfo = {
            time: now(),
            domAmount: amount || null,
            btn
        };

        // fallback dacă nu apare request
        setTimeout(() => {
            if (!lastClickInfo) return;
            const age = now() - lastClickInfo.time;
            if (age > CLICK_WINDOW_MS && !lastClickInfo.sent && lastClickInfo.domAmount) {
                const payload = buildPayload(lastClickInfo.domAmount, "dom-fallback", lastClickInfo.btn);
                sendToServer(payload);
                lastClickInfo.sent = true;
            }
        }, CLICK_WINDOW_MS + 200);
    });

    // --------------------------
    // Request Interceptor – FETCH
    // --------------------------
    (function () {
        const orig = window.fetch;
        window.fetch = function (input, init) {
            try {
                const url = typeof input === "string" ? input : input.url;
                const body = init?.body || null;
                handleRequest(url, body, "fetch");
            } catch (err) { }
            return orig.apply(this, arguments);
        };
    })();

    // --------------------------
    // Request Interceptor – XHR
    // --------------------------
    (function () {
        const O = XMLHttpRequest.prototype.open;
        const S = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (m, u) {
            this._url = u;
            return O.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            handleRequest(this._url, body, "xhr");
            return S.apply(this, arguments);
        };
    })();

    // --------------------------
    // Request Handler
    // --------------------------
    function handleRequest(url, body, tag) {
        if (!lastClickInfo) return;
        if (now() - lastClickInfo.time > CLICK_WINDOW_MS) return;

        if (!textContainsKeyword(url)) {
            if (typeof body === "string" && !textContainsKeyword(body)) return;
        }

        let bodyText = "";
        if (typeof body === "string") bodyText = body;
        else if (body instanceof FormData) {
            const arr = [];
            body.forEach((v, k) => arr.push(`${k}=${v}`));
            bodyText = arr.join("&");
        }

        let amount = null;

        if (bodyText.startsWith("{")) {
            try {
                const json = JSON.parse(bodyText);
                amount = extractNumberEU(JSON.stringify(json));
            } catch { }
        }

        if (!amount && bodyText) amount = extractNumberEU(bodyText);
        if (!amount) amount = lastClickInfo.domAmount;

        if (!amount) return;

        const payload = buildPayload(amount, `req-${tag}`, lastClickInfo.btn);
        sendToServer(payload);

        lastClickInfo.sent = true;
    }

})();
