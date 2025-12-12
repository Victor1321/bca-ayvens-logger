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

    // cuvinte cheie extinse – butoane/licitații
    const BID_KEYWORDS = [
        "bid", "licit", "licită", "licitatie", "licitație",
        "offer", "oferta", "ofertă", "noua oferta", "oferta noua", "ofertă nouă",
        "place", "submit",
        "confirm", "confirmă", "confirmare",
        "new offer", "new bid",
        "place bid", "place_offer", "place-offer"
    ];

    const ALLOWED_HOSTS = [
        "ee.bca-europe.com",
        "idp.bca-online-auctions.eu",
        "carmarket.ayvens.com"
    ];

    const CLICK_WINDOW_MS = 5000;
    const DEDUP_WINDOW_MS = 5000;

    let lastClickInfo = null;
    let lastSentSignature = null;
    let lastSentTime = 0;

    // --------------------------
    // Helpers
    // --------------------------
    function now() { return Date.now(); }
    function isAllowed() { return ALLOWED_HOSTS.includes(location.hostname); }

    function logDebug(...args) {
        console.log("[LOGGER]", ...args);
    }

    function textContainsKeyword(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        const hit = BID_KEYWORDS.some(k => lower.includes(k));
        if (hit) {
            logDebug("Keyword detectat în text:", { text, lower });
        }
        return hit;
    }

    function extractNumberEU(text) {
        if (!text) return null;
        const original = text;
        text = text.replace(/[^0-9.,]/g, "");
        if (!text) return null;
        const std = text.replace(/\./g, "").replace(",", ".");
        const nr = parseFloat(std);
        const valid = !(isNaN(nr) || nr < 50 || nr > 500000);
        if (valid) {
            logDebug("Număr detectat din text:", { original, cleaned: text, parsed: nr });
            return nr;
        }
        return null;
    }

    function findValueInInputs() {
        const inputs = document.querySelectorAll("input[type='text'], input[type='number']");
        for (const inp of inputs) {
            if (!inp.offsetParent) continue;
            const nr = extractNumberEU(inp.value);
            if (nr) {
                logDebug("Suma detectată în input:", { value: inp.value, parsed: nr });
                return nr;
            }
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
        if (nums.length) {
            const max = Math.max(...nums);
            logDebug("Sume găsite în jurul butonului, folosesc max:", { nums, max });
            return max;
        }
        return null;
    }

    // --------------------------
    // Titlu Ayvens + BCA
    // --------------------------
    function extractItemTitle(btn) {
        const host = location.hostname;

        // Ayvens
        if (host.includes("carmarket.ayvens.com")) {
            const card = btn?.closest("article, .vehicle, .listing-item, .offer-item, .card, .watchlist-item");
            if (card) {
                const h2 = card.querySelector("h2.vehicle-title, h2");
                const make = card.querySelector("p.vehicle-make, .vehicle-subtitle");

                const t1 = h2 ? (h2.textContent || "").trim() : "";
                const t2 = make ? (make.textContent || "").trim() : "";

                const full = [t1, t2].filter(Boolean).join(" ");
                if (full) {
                    logDebug("Titlu Ayvens detectat:", full);
                    return full;
                }
            }
        }

        // BCA (ambele domenii)
        const bca = document.querySelector("h2.viewlot_headline.viewlot_headline--large");
        if (bca && bca.innerText.trim()) {
            const t = bca.innerText.trim();
            logDebug("Titlu BCA detectat:", t);
            return t;
        }

        // fallback
        const h = document.querySelector("h1, h2");
        const fallback = h?.innerText?.trim() || "Titlu indisponibil";
        logDebug("Titlu fallback:", fallback);
        return fallback;
    }

    // --------------------------
    // Imagine – BCA + Ayvens
    // --------------------------
    function extractImageUrl() {
        const host = location.hostname;

        // Ayvens: imagine principală lot
        if (host.includes("carmarket.ayvens.com")) {
            const img = document.querySelector("#vehicle-default-picture-vehicle-*, .vehicle-picture img, picture img");
            if (img && img.src) {
                logDebug("Imagine Ayvens detectată:", img.src);
                return img.src;
            }
        }

        // BCA
        let img = document.querySelector(".viewlot__img img.MainImg");
        if (img && img.src) {
            logDebug("Imagine BCA (MainImg) detectată:", img.src);
            return img.src;
        }

        img = document.querySelector(".ImageA img");
        if (img && img.src) {
            logDebug("Imagine BCA (ImageA) detectată:", img.src);
            return img.src;
        }

        // N-am găsit nimic
        logDebug("Nicio imagine detectată pentru acest lot.");
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
    // Dedup (1 mesaj / licitație în ~5s)
    // --------------------------
    function shouldSend(sig) {
        const t = now();
        if (lastSentSignature === sig && t - lastSentTime < DEDUP_WINDOW_MS) {
            logDebug("Skip (dedup) pentru semnătură:", sig, "în", (t - lastSentTime), "ms");
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
        const payload = {
            client_id: CLIENT_ID,
            item_link: location.href,
            item_title: extractItemTitle(btn),
            bid_amount: amount,
            currency: "EUR",
            timestamp: timestamp(),
            source: sourceTag,
            image_url: extractImageUrl()
        };
        logDebug("Payload construit:", payload);
        return payload;
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

        logDebug("Trimit licitatie la server:", data);

        fetch(SERVER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        }).catch(err => console.error("[LOGGER] Eroare send:", err));
    }

    // =========================================================
    // START – Script activ doar pe hosturi permise
    // =========================================================
    if (!isAllowed()) {
        console.log("[LOGGER] Host nepermis, ies:", location.hostname);
        return;
    }

    console.log("[LOGGER] Activ pe host:", location.hostname);

    // --------------------------
    // CLICK detector
    // --------------------------
    document.addEventListener("click", e => {
        const btn = e.target.closest("button, a, input[type='submit']");
        if (!btn) return;

        const txt = (btn.innerText || btn.value || "").trim();

        logDebug("Click detectat pe element:", {
            tag: btn.tagName,
            text: txt
        });

        if (!textContainsKeyword(txt)) {
            return;
        }

        logDebug("Click detectat pe buton licitatie:", txt);

        const amount =
            findValueInInputs() ||
            findNumberInText(btn) ||
            scanNearbyForNumber(btn);

        lastClickInfo = {
            time: now(),
            domAmount: amount || null,
            btn,
            text: txt
        };

        logDebug("lastClickInfo actualizat:", lastClickInfo);

        // fallback dacă nu apare request
        setTimeout(() => {
            if (!lastClickInfo) return;
            const age = now() - lastClickInfo.time;
            if (age > CLICK_WINDOW_MS && !lastClickInfo.sent && lastClickInfo.domAmount) {
                logDebug("Fallback DOM-only, trimit licitatia fără request XHR/fetch.");
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
            } catch (err) {
                console.error("[LOGGER] Eroare interceptare fetch:", err);
            }
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
            try {
                handleRequest(this._url, body, "xhr");
            } catch (err) {
                console.error("[LOGGER] Eroare interceptare XHR:", err);
            }
            return S.apply(this, arguments);
        };
    })();

    // --------------------------
    // Request Handler (log heavy)
    // --------------------------
    function handleRequest(url, body, tag) {
        logDebug("handleRequest pornit:", { tag, url, hasBody: !!body });

        if (!lastClickInfo) {
            logDebug("handleRequest: lastClickInfo este null, ignor.");
            return;
        }
        const age = now() - lastClickInfo.time;
        if (age > CLICK_WINDOW_MS) {
            logDebug("handleRequest: click prea vechi:", age, "ms");
            return;
        }

        let bodyText = "";

        if (typeof body === "string") {
            bodyText = body;
        } else if (body instanceof FormData) {
            const arr = [];
            body.forEach((v, k) => arr.push(${k}=${v}));
            bodyText = arr.join("&");
        }

        logDebug("Detalii request:", {
            tag,
            url,
            bodyPreview: bodyText.slice(0, 500)
        });

        // verificăm dacă requestul pare legat de licitație
        let requestLooksLikeBid = false;

        if (textContainsKeyword(url)) {
            logDebug("Keyword detectat în URL-ul requestului.");
            requestLooksLikeBid = true;
        } else if (typeof bodyText === "string" && textContainsKeyword(bodyText)) {
            logDebug("Keyword detectat în body-ul requestului.");
            requestLooksLikeBid = true;
        }

        if (!requestLooksLikeBid) {
            logDebug("Requestul nu pare de licitatie (fara keywords), ignor.");
            return;
        }

        // Încearcăm să extragem suma
        let amount = null;

        if (bodyText && bodyText.trim().startsWith("{")) {
            try {
                const json = JSON.parse(bodyText);
                const flattened = JSON.stringify(json);
                amount = extractNumberEU(flattened);
                logDebug("Suma din JSON body:", { json, amount });
            } catch (err) {
                console.error("[LOGGER] Eroare parse JSON body:", err);
            }
        }

        if (!amount && bodyText) {
            amount = extractNumberEU(bodyText);
            if (amount) {
                logDebug("Suma detectată direct din bodyText:", amount);
            }
        }

        if (!amount) {
            amount = lastClickInfo.domAmount;
            if (amount) {
                logDebug("Folosesc suma din DOM (lastClickInfo.domAmount):", amount);
            }
        }

        if (!amount) {
            logDebug("Request detectat dar nu am putut extrage suma.", {
                url,
                bodyPreview: bodyText.slice(0, 500)
            });
            return;
        }

        const payload = buildPayload(amount, req-${tag}, lastClickInfo.btn);
        sendToServer(payload);

        lastClickInfo.sent = true;
        logDebug("handleRequest: payload trimis și lastClickInfo.sent = true");
    }

})();
