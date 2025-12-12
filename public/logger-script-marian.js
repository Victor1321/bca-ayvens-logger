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
    const CLIENT_ID = "Marian";

    // cuvinte cheie in butoane / URL / body
    const BID_KEYWORDS = ["bid", "licit", "offer", "oferta", "place", "submit", "auktion", "auction"];

    // domenii pe care activam logger-ul
    const ALLOWED_HOSTS = [
        "ee.bca-europe.com",
        "idp.bca-online-auctions.eu",
        "carmarket.ayvens.com"
    ];

    // ferestre de timp
    const CLICK_WINDOW_MS = 5000;   // cat timp legam un request de un click
    const DEDUP_TTL_MS    = 5000;   // cat timp consideram acelasi bid "duplicat"

    // stare in memorie
    let lastClickInfo = null;

    // dedup global pe window (daca exista mai multe scripturi injectate)
    const globalState = (window._LOGGER_DEDUP_ = window._LOGGER_DEDUP_ || {
        sent: {}   // sig -> timestamp
    });

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

    function extractNumberEU(text) {
        if (!text) return null;
        text = String(text);
        text = text.replace(/[^0-9.,]/g, "");
        if (!text) return null;
        const std = text.replace(/\./g, "").replace(",", ".");
        const nr = parseFloat(std);
        if (isNaN(nr)) return null;
        // filtram prostiile
        if (nr < 50 || nr > 5000000) return null;
        return nr;
    }

    function findValueInInputs() {
        const inputs = document.querySelectorAll("input[type='text'], input[type='number']");
        for (const inp of inputs) {
            if (!inp.offsetParent) continue; // skip ascunse
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

        // Ayvens – incearca sa ia titlul de masina din card / pagina detaliu
        if (host.includes("carmarket.ayvens.com")) {
            // card in lista
            const card = btn?.closest("article, .vehicle, .listing-item, .offer-item, .card");
            if (card) {
                const titleNode = card.querySelector(".vehicle-title, h2, h3");
                const subtitle  = card.querySelector(".vehicle-make, .vehicle-subtitle, .subtitle");
                const t1 = titleNode ? titleNode.textContent.trim() : "";
                const t2 = subtitle  ? subtitle.textContent.trim()   : "";
                const full = [t1, t2].filter(Boolean).join(" ");
                if (full) return full;
            }

            // pagina de detaliu – de obicei <h1>
            const h1 = document.querySelector("h1.vehicle-title, h1");
            if (h1 && h1.textContent.trim()) return h1.textContent.trim();
        }

        // BCA (view lot)
        const bca = document.querySelector("h2.viewlot_headline.viewlot_headline--large");
        if (bca && bca.innerText.trim()) return bca.innerText.trim();

        // fallback generic
        const h = document.querySelector("h1, h2");
        return h?.innerText?.trim() || "Titlu indisponibil";
    }

    // --------------------------
    // Imagine – BCA + Ayvens
    // --------------------------
    function extractImageUrl(btn) {
        const host = location.hostname;

        if (host.includes("carmarket.ayvens.com")) {
            // 1) imaginea default de pe pagina de detaliu
            let img = document.querySelector("img[id^='vehicle-default-picture-']");
            if (img && img.src) return img.src;

            // 2) din cardul din lista
            const card = btn?.closest("article, .vehicle, .listing-item, .offer-item, .card, .vehicle-card");
            if (card) {
                img = card.querySelector(".vehicle-picture img, img");
                if (img && img.src) return img.src;
            }

            // 3) fallback: orice imagine relevanta de masina
            img = document.querySelector(".vehicle-picture img, .car-picture img");
            if (img && img.src) return img.src;
        }

        // BCA – imagini principale din pagina lotului
        let img = document.querySelector(".viewlot__img img.MainImg");
        if (img && img.src) return img.src;

        img = document.querySelector(".ImageA img");
        if (img && img.src) return img.src;

        return null;
    }

    // --------------------------
    // Timestamp local GMT+2 (hardcod)
    // --------------------------
    function timestamp() {
        const d = new Date(Date.now() + 2 * 3600000);
        return d.toISOString().replace("T", " ").replace("Z", "");
    }

    // --------------------------
    // Dedup global
    // --------------------------
    function shouldSend(payload) {
        const sigObj = {
            host: location.hostname,
            link: payload.item_link,
            title: payload.item_title,
            amount: payload.bid_amount
        };
        const sig = JSON.stringify(sigObj);
        const t = now();
        const last = globalState.sent[sig] || 0;

        if (t - last < DEDUP_TTL_MS) {
            console.log("[LOGGER] Skip DUPLICAT (", (t - last), "ms )", sigObj);
            return false;
        }

        globalState.sent[sig] = t;
        return true;
    }

    // --------------------------
    // Payload Builder
    // --------------------------
    function buildPayload(amount, sourceTag, btn) {
        const data = {
            client_id: CLIENT_ID,
            item_link: location.href,
            item_title: extractItemTitle(btn),
            bid_amount: amount,
            currency: "EUR",
            timestamp: timestamp(),
            source: sourceTag,
            image_url: extractImageUrl(btn)
        };
        return data;
    }

    // --------------------------
    // Send to server
    // --------------------------
    function sendToServer(data) {
        if (!shouldSend(data)) return;

        console.log("[LOGGER] Trimit catre server:", data);

        fetch(SERVER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        })
            .then(r => r.json().catch(() => ({})))
            .then(res => {
                console.log("[LOGGER] Raspuns server:", res);
            })
            .catch(err => console.error("[LOGGER] Eroare send:", err));
    }

    // =========================================================
    // START – Script activ doar pe host-urile permise
    // =========================================================
    if (!isAllowed()) {
        return;
    }

    console.log("[LOGGER] Pornit pe host:", location.hostname);

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

        console.log("[LOGGER] CLICK detectat pe buton cu text:", txt, " | amount DOM:", amount);
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
                console.warn("[LOGGER] Eroare interceptare fetch:", err);
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
                console.warn("[LOGGER] Eroare interceptare XHR:", err);
            }
            return S.apply(this, arguments);
        };
    })();

    // --------------------------
    // Request Handler
    // --------------------------
    function handleRequest(url, body, tag) {
        if (!lastClickInfo) return;
        if (now() - lastClickInfo.time > CLICK_WINDOW_MS) return;

        // doar request-uri care par legate de bid
        let bodyText = "";
        if (typeof body === "string") {
            bodyText = body;
        } else if (body instanceof FormData) {
            const arr = [];
            body.forEach((v, k) => arr.push(${k}=${v}));
            bodyText = arr.join("&");
        }

        const hasKeywordInUrl  = textContainsKeyword(url);
        const hasKeywordInBody = textContainsKeyword(bodyText);

        if (!hasKeywordInUrl && !hasKeywordInBody) {
            return;
        }

        console.log("[LOGGER] Request detectat (", tag, "):", url);

        let amount = null;

        if (bodyText && bodyText.trim().startsWith("{")) {
            try {
                const json = JSON.parse(bodyText);
                amount = extractNumberEU(JSON.stringify(json));
            } catch { /* ignore */ }
        }

        if (!amount && bodyText) {
            amount = extractNumberEU(bodyText);
        }

        if (!amount) {
            amount = lastClickInfo.domAmount;
        }

        if (!amount) {
            console.log("[LOGGER] Nu am putut determina amount, ies.");
            return;
        }

        const payload = buildPayload(amount, req-${tag}, lastClickInfo.btn);
        sendToServer(payload);
    }

})();
