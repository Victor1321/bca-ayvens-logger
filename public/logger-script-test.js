// -------------------------------------------------------------
// LOGGER-SCRIPT INJECTABIL (FARA TAMPERMONKEY)
// Universal Auction Logger – BCA + Ayvens
// Trimite licitatiile reale catre serverul tau (Fly.io)
// -------------------------------------------------------------
(function () {
  "use strict";

  // --------------------------
  // CONFIG
  // --------------------------
  const SERVER_URL = "https://bca-ayvens-logger.fly.dev/receive-bid";
  const CLIENT_ID = "test"; // Schimbă după nevoie

  const BID_KEYWORDS = [
    "bid",
    "licit",
    "liciteaz",
    "offer",
    "oferta",
    "ofertă",
    "place",
    "submit",
    "confirm",
    "confirmă",
    "confirma",
    "new offer",
    "oferta noua",
    "ofertă nouă",
    "oferta noua"
  ];

  const ALLOWED_HOSTS = [
    "ee.bca-europe.com",
    "idp.bca-online-auctions.eu",
    "carmarket.ayvens.com",
  ];

  const CLICK_WINDOW_MS = 5000;
  const DEDUP_COOLDOWN_MS = 2000;

  let lastClickInfo = null;
  let lastSent = {
    time: 0,
    amount: null,
    url: null,
  };

  // --------------------------
  // Helpers
  // --------------------------
  function now() {
    return Date.now();
  }

  function isAllowedHost() {
    return ALLOWED_HOSTS.includes(location.hostname);
  }

  // --- Log doar pentru erori și trimiteri (fără debug continuu) ---
  function logError(...args) {
    console.error("[LOGGER]", ...args);
  }

  function logSend(...args) {
    console.log("[LOGGER] Trimis:", ...args);
  }

  function textContainsKeyword(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return BID_KEYWORDS.some((k) => lower.includes(k));
  }

  function extractNumberEU(text) {
    if (!text) return null;
    text = String(text).replace(/[^0-9.,]/g, "");
    if (!text) return null;

    const std = text.replace(/\./g, "").replace(",", ".");
    const nr = parseFloat(std);
    if (isNaN(nr)) return null;
    if (nr < 100 || nr > 500000) return null;
    return nr;
  }

  function findValueInInputs() {
    try {
      const ayvensInput = document.querySelector('.bid-offer-input');
      if (ayvensInput && ayvensInput.offsetParent) {
        const val = ayvensInput.value.trim();
        if (val) {
          const nr = extractNumberEU(val);
          if (nr) return nr;
        }
      }

      const inputs = document.querySelectorAll(
        "input[type='text'], input[type='number']"
      );
      for (const inp of inputs) {
        if (!inp.offsetParent) continue;
        const nr = extractNumberEU(inp.value);
        if (nr) return nr;
      }
    } catch (e) {
      logError("findValueInInputs:", e);
    }
    return null;
  }

  function findNumberInText(el) {
    if (!el) return null;
    return extractNumberEU(el.innerText || el.textContent || "");
  }

  function scanNearbyForNumber(btn) {
    try {
      const area =
        (btn && btn.closest("form, article, section, div, .card-body")) || document.body;
      const nums = [];
      area.querySelectorAll("*").forEach((el) => {
        if (!el.offsetParent) return;
        const nr = findNumberInText(el);
        if (nr) nums.push(nr);
      });
      return nums.length ? Math.max(...nums) : null;
    } catch (e) {
      logError("scanNearbyForNumber:", e);
      return null;
    }
  }

  // --------------------------
  // Titlu
  // --------------------------
  function extractItemTitle(btn) {
    try {
      const host = location.hostname.toLowerCase();

      function isBadTitle(t) {
        if (!t) return true;
        const s = t.trim().toLowerCase();
        const bad = [
          "solicitați informații",
          "solicitati informatii",
          "request info",
          "request information",
        ];
        return bad.includes(s);
      }

      if (host.includes("ayvens")) {
        let card = btn
          ? btn.closest("article, .vehicle, .listing-item, .offer-item, .card, .card-body")
          : document.querySelector("article, .vehicle, .listing-item, .offer-item, .card, .card-body");

        if (card) {
          const h2 = card.querySelector("h2.vehicle-title");
          const make = card.querySelector("p.vehicle-make");

          const t1 = h2 ? String(h2.textContent || "").trim() : "";
          const t2 = make ? String(make.textContent || "").trim() : "";

          let full = [t1, t2].filter(Boolean).join(" ");
          full = full.replace(/RECOMANDAT/g, "").trim();
          if (full) return full;
        }

        const hAy = document.querySelector("h2.vehicle-title");
        if (hAy && hAy.textContent.trim()) {
          let txt = hAy.textContent.trim().replace(/RECOMANDAT/g, "").trim();
          if (txt && !isBadTitle(txt)) return txt;
        }
      }

      // BCA
      const bcaTitle = document.querySelector(
        "h2.viewlot_headline.viewlotheadline--large, h1.viewlotheadline.viewlot_headline--large"
      );
      if (bcaTitle) {
        const txt = (bcaTitle.textContent || "").trim();
        if (txt && !isBadTitle(txt)) return txt;
      }

      const bcaAlt = document.querySelector(
        "h2.viewlot_headline, h1.viewlot_headline"
      );
      if (bcaAlt) {
        const txt = (bcaAlt.textContent || "").trim();
        if (txt && !isBadTitle(txt)) return txt;
      }

      const h = document.querySelector("h1, h2, h3");
      if (h) {
        const txt = (h.textContent || "").trim();
        if (txt && !isBadTitle(txt)) return txt;
      }

      return "Titlu indisponibil";
    } catch (e) {
      logError("extractItemTitle:", e);
      return "Titlu indisponibil";
    }
  }

  // --------------------------
  // Imagine
  // --------------------------
  function extractImageUrl(btn) {
    try {
      const host = location.hostname;

      if (host.includes("ayvens")) {
        if (btn) {
          const card = btn.closest("article, .vehicle, .listing-item, .offer-item, .card, .card-body");
          if (card) {
            let img = card.querySelector(".vehicle-picture img, img");
            if (img && img.src) return img.src;
          }
        }
        let img = document.querySelector(".vehicle-picture img");
        if (img && img.src) return img.src;
      }

      if (
        host.includes("bca-europe.com") ||
        host.includes("bca-online-auctions.eu") ||
        host.endsWith("bca.com")
      ) {
        if (btn) {
          const card = btn.closest(
            ".viewlot, .lot, .auction-tile, article, section, div"
          );
          if (card) {
            let img = card.querySelector(
              ".viewlot__img img.MainImg, .ImageA img, img"
            );
            if (img && img.src) return img.src;
          }
        }
        let img = document.querySelector(".viewlot__img img.MainImg");
        if (img && img.src) return img.src;
        img = document.querySelector(".ImageA img");
        if (img && img.src) return img.src;
      }

      const anyImg = document.querySelector("img");
      if (anyImg && anyImg.src) return anyImg.src;
    } catch (e) {
      logError("extractImageUrl:", e);
    }
    return null;
  }

  // --------------------------
  // Timestamp
  // --------------------------
  function timestamp() {
    const d = new Date(Date.now() + 2 * 3600000);
    return d.toISOString().replace("T", " ").replace("Z", "");
  }

  // --------------------------
  // Dedup
  // --------------------------
  function shouldSend(amount, url) {
    const t = now();
    if (
      lastSent.amount === amount &&
      lastSent.url === url &&
      t - lastSent.time < DEDUP_COOLDOWN_MS
    ) {
      return false;
    }
    lastSent.time = t;
    lastSent.amount = amount;
    lastSent.url = url;
    return true;
  }

  // --------------------------
  // Payload
  // --------------------------
  function buildPayload(amount, sourceTag, btn) {
    let itemLink = location.href;
    if (location.hostname.includes("ayvens")) {
      itemLink = "https://carmarket.ayvens.com/live";
    }

    return {
      client_id: CLIENT_ID,
      item_link: itemLink,
      item_title: extractItemTitle(btn),
      bid_amount: amount,
      currency: "EUR",
      timestamp: timestamp(),
      source: sourceTag,
      image_url: extractImageUrl(btn),
    };
  }

  // --------------------------
  // Send
  // --------------------------
  function sendToServer(data) {
    if (
      !data ||
      typeof data.bid_amount === "undefined" ||
      data.bid_amount === null
    )
      return;

    if (!shouldSend(data.bid_amount, data.item_link)) return;

    logSend(data);

    fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then((res) => {
        if (!res.ok) logError("Răspuns server status:", res.status);
      })
      .catch((err) => {
        logError("Eroare send:", err);
      });
  }

  // =========================================================
  // START
  // =========================================================
  if (!isAllowedHost()) {
    console.log("[LOGGER] Host nepermis:", location.hostname);
    return;
  }

  console.log("[LOGGER] Activ pe", location.hostname);

  // --------------------------
  // CLICK detector
  // --------------------------
  document.addEventListener("click", function (e) {
    try {
      const btn =
        e.target && e.target.closest("button, a, input[type='submit']");
      if (!btn) return;

      const txt = (btn.innerText || btn.value || "").trim();
      if (!textContainsKeyword(txt)) return;

      const amount =
        findValueInInputs() ||
        findNumberInText(btn) ||
        scanNearbyForNumber(btn);

      lastClickInfo = {
        time: now(),
        domAmount: amount || null,
        btn: btn,
        sent: false,
      };

      // Fallback
      setTimeout(() => {
        if (lastClickInfo && !lastClickInfo.sent) {
          const fallbackAmount = findValueInInputs() || scanNearbyForNumber(btn);
          if (fallbackAmount) {
            const payload = buildPayload(fallbackAmount, "fallback-click", btn);
            sendToServer(payload);
            lastClickInfo.sent = true;
          }
        }
      }, 1500);

    } catch (err) {
      logError("Click handler:", err);
    }
  });

  // --------------------------
  // Interceptori
  // --------------------------
  (function () {
    const orig = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url =
          typeof input === "string" ? input : (input && input.url) || "";
        const body = (init && init.body) || null;
        const method =
          init && init.method ? String(init.method).toUpperCase() : "GET";
        handleRequest(url, body, "fetch", method);
      } catch (err) {
        logError("fetch interceptor:", err);
      }
      return orig.apply(this, arguments);
    };
  })();

  (function () {
    const O = XMLHttpRequest.prototype.open;
    const S = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (m, u) {
      this._url = u;
      this._method = m;
      return O.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        handleRequest(this._url, body, "xhr", this._method);
      } catch (err) {
        logError("XHR interceptor:", err);
      }
      return S.apply(this, arguments);
    };
  })();

  // --------------------------
  // Request Handler
  // --------------------------
  function handleRequest(url, body, tag, methodRaw) {
    try {
      const method = (methodRaw || "GET").toUpperCase();

      if (method !== "POST" && method !== "PUT" && method !== "PATCH") {
        return;
      }

      const sinceClick = lastClickInfo ? now() - lastClickInfo.time : null;
      if (!lastClickInfo || sinceClick > CLICK_WINDOW_MS) {
        return;
      }

      let amount = null;

      // Extrage suma din URL /sale/bid/ (Ayvens)
      if (url && url.includes('/sale/bid/')) {
        try {
          const urlParts = url.split('?');
          if (urlParts.length > 1) {
            const params = new URLSearchParams(urlParts[1]);
            const amtParam = params.get('amount');
            if (amtParam) {
              amount = extractNumberEU(amtParam);
            }
          }
        } catch (e) {}
      }

      // Dacă nu, din body
      if (!amount) {
        let bodyText = "";
        if (typeof body === "string") {
          bodyText = body;
        } else if (body instanceof FormData) {
          const arr = [];
          body.forEach((v, k) => arr.push(k + "=" + v));
          bodyText = arr.join("&");
        } else if (body && typeof body === "object") {
          try {
            bodyText = JSON.stringify(body);
          } catch {}
        }

        const haystack = (url + " " + bodyText).toLowerCase();
        if (!textContainsKeyword(haystack)) {
          return;
        }

        if (bodyText && bodyText.trim().startsWith("{")) {
          try {
            const json = JSON.parse(bodyText);
            amount = extractNumberEU(JSON.stringify(json));
          } catch {}
        }

        if (!amount && bodyText) {
          amount = extractNumberEU(bodyText);
        }

        if (!amount && lastClickInfo && lastClickInfo.domAmount) {
          amount = lastClickInfo.domAmount;
        }
      }

      if (!amount) {
        return;
      }

      const payload = buildPayload(
        amount,
        "req-" + tag,
        lastClickInfo && lastClickInfo.btn
      );
      sendToServer(payload);

      if (lastClickInfo) {
        lastClickInfo.sent = true;
      }
    } catch (err) {
      logError("handleRequest:", err);
    }
  }
})();
