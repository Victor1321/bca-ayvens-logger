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
    // ATENTIE: endpoint-ul real din server.js
    const SERVER_URL = "https://bca-ayvens.up.railway.app/receive-bid";
    const CLIENT_ID = "Marian";

    const ALLOWED_HOSTS = [
        "ee.bca-europe.com",
        "idp.bca-online-auctions.eu",
        "carmarket.ayvens.com"
    ];

    const CLICK_WINDOW_MS = 5000;  // fereastra in care urmarim request-ul dupa click
    const DEDUP_WINDOW_MS = 3000;  // nu trimitem acelasi bid de 2 ori in < 3 sec

    let lastClickInfo = null;
    let lastSentSignature = null;
    let lastSentTime = 0;

    // --------------------------
    // Helpers de baza
    // --------------------------
    function now() { return Date.now(); }

    function isAllowedHost() {
        return ALLOWED_HOSTS.includes(location.hostname);
    }

    if (!isAllowedHost()) {
        return; // nu rulam pe alte site-uri
    }

    console.log("[LOGGER] Pornit pe host:", location.hostname);

    // extrage numar in format european (10.500,00 -> 10500)
    function extractNumberEU(text) {
        if (!text) return null;
        text = String(text).replace(/[^0-9.,]/g, "");
        if (!text) return null;
        const std = text.replace(/\./g, "").replace(",", ".");
        const nr = parseFloat(std);
        // limitam la range normal de licitatii
        return isNaN(nr) || nr < 50 || nr > 500000 ? null : nr;
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
        return el ? extractNumberEU(el.innerText || el.textContent || "") : null;
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
        if (host.includes("carmarket.ayvens.com")) {
            const card = btn?.closest("article, .vehicle, .listing-item, .offer-item, .card");
            if (card) {
                // Ayvens sale page:
                // <h2 class="vehicle-title">... <span>...</span></h2>
                const h2 = card.querySelector("h2.vehicle-title");
                const make = card.querySelector("p.vehicle-make");

                const t1 = h2 ? (h2.textContent || "").trim() : "";
                const t2 = make ? make.textContent.trim() : "";

                const full = [t1, t2].filter(Boolean).join(" ");
                if (full) return full;
            }
        }

        // BCA (functioneaza pe pagina de lot)
        const bca = document.querySelector("h2.viewlot_headline.viewlot_headline--large");
        if (bca && bca.innerText.trim()) return bca.innerText.trim();

        // fallback generic
        const h = document.querySelector("h1, h2");
        return h?.innerText?.trim() || "Titlu indisponibil";
    }

    // --------------------------
    // Imagine – Ayvens + BCA
    // --------------------------
    function extractImageUrl(btn) {
        const host = location.hostname;

        // Ayvens: img de tip vehicle-default-picture / vehicle-picture
        if (host.includes("carmarket.ayvens.com")) {
            let img =
                document.querySelector(".vehicle-picture img") ||
                document.querySelector("img[id^='vehicle-default-picture']");

            if (img && img.src) return img.src;
        }

        // BCA (view lot)
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
    // Dedup (fara timestamp in semnatura!)
    // --------------------------
    function shouldSend(sig) {
        const t = now();
        if (lastSentSignature === sig && t - lastSentTime < DEDUP_WINDOW_MS) {
            console.log("[LOGGER] DEDUP: deja trimis recent, sar peste.");
            return false;
        }
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
            bid_amount: data.bid_amount
        });

        if (!shouldSend(sig)) return;

        console.log("[LOGGER] Trimit catre server:", data);

        fetch(SERVER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        }).catch(err => console.error("[LOGGER] Eroare send:", err));
    }

    // =========================================================
    // CLICK detector – FARA KEYWORDS, DOAR SUME
    // =========================================================
    document.addEventListener("click", e => {
        const btn = e.target.closest("button, a, input[type='submit']");
        if (!btn) return;

        const amount =
            findValueInInputs() ||
            findNumberInText(btn) ||
            scanNearbyForNumber(btn);

        if (!amount) {
            // fara suma in jur, probabil nu e bid
            return;
        }

        const txt = (btn.innerText || btn.value || "").trim();
        console.log("[LOGGER] Click candidat:", { text: txt, amount });

        lastClickInfo = {
            time: now(),
            domAmount: amount,
            btn,
            sent: false
        };

        // fallback daca nu prindem niciun request in CLICK_WINDOW_MS
        setTimeout(() => {
            if (!lastClickInfo) return;
            const age = now() - lastClickInfo.time;
            if (age > CLICK_WINDOW_MS && !lastClickInfo.sent && lastClickInfo.domAmount) {
                console.log("[LOGGER] Fallback DOM, trimit bid:", lastClickInfo.domAmount);
                const payload = buildPayload(lastClickInfo.domAmount, "dom-fallback", lastClickInfo.btn);
                sendToServer(payload);
                lastClickInfo.sent = true;
            }
        }, CLICK_WINDOW_MS + 200);
    });

    // =========================================================
    // Request Interceptor – FETCH
    // =========================================================
    (function () {
        const orig = window.fetch;
        window.fetch = function (input, init) {
            try {
                const url = typeof input === "string" ? input : input.url;
                const body = init?.body || null;
                handleRequest(url, body, "fetch");
            } catch (err) { /* ignoram erori interne */ }
            return orig.apply(this, arguments);
        };
    })();

    // =========================================================
    // Request Interceptor – XHR
    // =========================================================
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

        let bodyText = "";

        if (typeof body === "string") {
            bodyText = body;
        } else if (body instanceof FormData) {
            const arr = [];
            body.forEach((v, k) => arr.push(${k}=${v}));
            bodyText = arr.join("&");
        }

        let amount = null;

        if (bodyText) {
            if (bodyText.trim().startsWith("{")) {
                try {
                    const json = JSON.parse(bodyText);
                    amount = extractNumberEU(JSON.stringify(json));
                } catch { /* ignore */ }
            }
            if (!amount) amount = extractNumberEU(bodyText);
        }

        if (!amount) amount = lastClickInfo.domAmount;
        if (!amount) return;

        console.log("[LOGGER] Request detectat dupa click:", { url, tag, amount });

        const payload = buildPayload(amount, req-${tag}, lastClickInfo.btn);
        sendToServer(payload);

        lastClickInfo.sent = true;
    }

})();
