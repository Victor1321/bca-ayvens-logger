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
    const SERVER_URL = "https://bca-ayvens.up.railway.app/logger-script-marian.js";
    const CLIENT_ID = "Marian";

    const BID_KEYWORDS = ["bid", "licit", "offer", "oferta", "place", "submit", "bid now", "place bid"];

    const ALLOWED_HOSTS = [
        "ee.bca-europe.com",
        "idp.bca-online-auctions.eu",
        "www.bca.com",
        "bca.com",
        "carmarket.ayvens.com"
    ];

    // cât timp asociem request-urile cu un click (ms)
    const CLICK_WINDOW_MS = 5000;

    let lastClickInfo = null; // { time, domAmount, btn, sent }

    // --------------------------
    // Helpers
    // --------------------------
    function now() { return Date.now(); }

    function isAllowed() {
        return ALLOWED_HOSTS.includes(location.hostname);
    }

    function textContainsKeyword(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return BID_KEYWORDS.some(k => lower.includes(k));
    }

    // parsează număr în format european
    function extractNumberEU(text) {
        if (!text) return null;
        text = text.replace(/[^0-9.,]/g, "");
        if (!text) return null;
        const std = text.replace(/\./g, "").replace(",", ".");
        const nr = parseFloat(std);
        // protecție: sume rezonabile de licitație
        return isNaN(nr) || nr < 100 || nr > 500000 ? null : nr;
    }

    function findValueInInputs() {
        const inputs = document.querySelectorAll("input[type='text'], input[type='number']");
        for (const inp of inputs) {
            if (!inp.offsetParent) continue; // ascunse
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

        // Ayvens – încearcă să ia titlul mașinii din card / pagină
        if (host.includes("carmarket.ayvens.com")) {
            // 1) pe pagina de detaliu (vânzare) – titlul mare
            const saleTitle = document.querySelector("h1.vehicle-title, h1.vehicle-title-main");
            if (saleTitle && saleTitle.innerText.trim()) {
                return saleTitle.innerText.trim();
            }

            // 2) card în listă / watchlist (similar cu ce aveai)
            const card = btn?.closest("article, .vehicle, .listing-item, .offer-item, .card, .vehicle-card");
            if (card) {
                const h2 = card.querySelector("h2.vehicle-title, h2");
                const make = card.querySelector("p.vehicle-make, .vehicle-subtitle");

                const t1 = h2 ? (h2.innerText || "").trim() : "";
                const t2 = make ? make.textContent.trim() : "";

                const full = [t1, t2].filter(Boolean).join(" ");
                if (full) return full;
            }
        }

        // BCA (funcționează pe view lot)
        const bca = document.querySelector("h2.viewlot_headline.viewlot_headline--large");
        if (bca && bca.innerText.trim()) return bca.innerText.trim();

        // fallback generic
        const h = document.querySelector("h1, h2");
        return h?.innerText?.trim() || "Titlu indisponibil";
    }

    // --------------------------
    // Imagine – BCA + Ayvens
    // --------------------------
    function extractImageUrl() {
        const host = location.hostname;

        // BCA – imagini principale
        if (host.includes("bca")) {
            let img = document.querySelector(".viewlot__img img.MainImg");
            if (img && img.src) return img.src;

            img = document.querySelector(".ImageA img");
            if (img && img.src) return img.src;
        }

        // Ayvens – imaginea default a mașinii (exemplul cu vehicle-default-picture-...)
        if (host.includes("carmarket.ayvens.com")) {
            // 1) pe pagina de detaliu: imaginea cu id "vehicle-default-picture-..."
            let img = document.querySelector("img[id^='vehicle-default-picture-']");
            if (img && img.src) return img.src;

            // 2) în listă / card: imagine în .vehicle-picture
            img = document.querySelector(".vehicle-picture picture img, .vehicle-picture img");
            if (img && img.src) return img.src;
        }

        return null;
    }

    // --------------------------
    // Timestamp local GMT+2 (ca înainte)
    // --------------------------
    function timestamp() {
        const d = new Date(Date.now() + 2 * 3600000);
        return d.toISOString().replace("T", " ").replace("Z", "");
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
            image_url: extractImageUrl()
        };
    }

    // --------------------------
    // Send to server – FĂRĂ DEDUP GLOBAL
    // --------------------------
    function sendToServer(data) {
        console.log("[LOGGER] Trimit payload la server:", data);

        fetch(SERVER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        }).catch(err => console.error("[LOGGER] Eroare send:", err));
    }

    // =========================================================
    // START – Script activ doar pe host-uri permise
    // =========================================================
    console.log("[LOGGER] script încărcat pe host:", location.hostname);
    if (!isAllowed()) {
        console.log("[LOGGER] host nepermis, nu pornesc logger.");
        return;
    }
    console.log("[LOGGER] activ pe host permis:", location.hostname);

    // --------------------------
    // CLICK detector – 1 click = 1 licitație logică
    // --------------------------
    document.addEventListener("click", e => {
        const btn = e.target.closest("button, a, input[type='submit']");
        if (!btn) return;

        const txt = (btn.innerText || btn.value || "").trim();
        console.log("[LOGGER] click detectat pe buton:", txt);

        if (!textContainsKeyword(txt)) return;

        const amount =
            findValueInInputs() ||
            findNumberInText(btn) ||
            scanNearbyForNumber(btn);

        lastClickInfo = {
            time: now(),
            domAmount: amount || null,
            btn,
            sent: false
        };

        // fallback dacă nu apare niciun request de licitație
        setTimeout(() => {
            if (!lastClickInfo) return;
            const age = now() - lastClickInfo.time;
            if (age > CLICK_WINDOW_MS) return;
            if (lastClickInfo.sent) return;
            if (!lastClickInfo.domAmount) return;

            const payload = buildPayload(lastClickInfo.domAmount, "dom-fallback", lastClickInfo.btn);
            lastClickInfo.sent = true;
            sendToServer(payload);
        }, CLICK_WINDOW_MS + 200);
    });

    // --------------------------
    // Interceptor FETCH
    // --------------------------
    (function () {
        const orig = window.fetch;
        window.fetch = function (input, init) {
            try {
                const url = typeof input === "string" ? input : input.url;
                const body = init?.body || null;
                handleRequest(url, body, "fetch");
            } catch (err) { /* ignore */ }
            return orig.apply(this, arguments);
        };
    })();

    // --------------------------
    // Interceptor XHR
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
    // Request Handler — AICI facem „1 click = 1 mesaj”
    // --------------------------
    function handleRequest(url, body, tag) {
        if (!lastClickInfo) return;
        const age = now() - lastClickInfo.time;
        if (age > CLICK_WINDOW_MS) return;

        // dacă deja am trimis pentru acest click, nu mai trimitem
        if (lastClickInfo.sent) return;

        // filtrăm doar request-urile „suspecte” (care pot fi de licitație)
        if (!textContainsKeyword(url)) {
            if (typeof body === "string" && !textContainsKeyword(body)) return;
        }

        let bodyText = "";
        if (typeof body === "string") {
            bodyText = body;
        } else if (body instanceof FormData) {
            const arr = [];
            body.forEach((v, k) => arr.push(${k}=${v}));
            bodyText = arr.join("&");
        }

        let amount = null;

        // JSON body
        if (bodyText && bodyText.trim().startsWith("{")) {
            try {
                const json = JSON.parse(bodyText);
                amount = extractNumberEU(JSON.stringify(json));
            } catch (e) {
                // ignore parse error
            }
        }

        // fallback: orice număr din body
        if (!amount && bodyText) {
            amount = extractNumberEU(bodyText);
        }

        // fallback final: ce am găsit în DOM la click
        if (!amount) {
            amount = lastClickInfo.domAmount;
        }

        if (!amount) {
            console.log("[LOGGER] handleRequest: nu am găsit sumă, nu trimit.");
            return;
        }

        const payload = buildPayload(amount, req-${tag}, lastClickInfo.btn);

        // MARCHEZ că pentru acest click am trimis deja
        lastClickInfo.sent = true;

        sendToServer(payload);
    }

})();
