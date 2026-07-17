// -------------------------------------------------------------
// LOGGER-SCRIPT - INTERCEPTEAZĂ REQUEST-URI BID (AYVENS + BCA)
// -------------------------------------------------------------
(function () {
  "use strict";

  const SERVER_URL = "https://bca-ayvens-logger.fly.dev/receive-bid";
  const CLIENT_ID = "test"; // Schimbă după nevoie

  const ALLOWED_HOSTS = [
    "ee.bca-europe.com",
    "idp.bca-online-auctions.eu",
    "carmarket.ayvens.com",
  ];

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

  const CLICK_WINDOW_MS = 5000;
  const DEDUP_COOLDOWN_MS = 2000;

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

  // ----- Extrage titlul din DOM (fără btn) -----
  function extractItemTitle() {
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
        // Caută titlul în pagina curentă (dacă e pe o pagină de licitație)
        let h2 = document.querySelector("h2.vehicle-title");
        if (h2) {
          let txt = h2.textContent.trim().replace(/RECOMANDAT/g, "").trim();
          if (txt && !isBadTitle(txt)) return txt;
        }
        // Dacă suntem pe pagina de listă, caută primul titlu
        let firstCard = document.querySelector(".vehicle-title");
        if (firstCard) {
          let txt = firstCard.textContent.trim().replace(/RECOMANDAT/g, "").trim();
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

  // ----- Extrage imaginea din DOM (fără btn) -----
  function extractImageUrl() {
    try {
      const host = location.hostname;

      if (host.includes("ayvens")) {
        let img = document.querySelector(".vehicle-picture img");
        if (img && img.src) return img.src;
        // Dacă suntem pe pagina de detaliu
        let mainImg = document.querySelector(".MainImg");
        if (mainImg && mainImg.src) return mainImg.src;
      }

      if (
        host.includes("bca-europe.com") ||
        host.includes("bca-online-auctions.eu") ||
        host.endsWith("bca.com")
      ) {
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
  function buildPayload(amount, sourceTag) {
    let itemLink = location.href;
    if (location.hostname.includes("ayvens")) {
      itemLink = "https://carmarket.ayvens.com/live";
    }

    return {
      client_id: CLIENT_ID,
      item_link: itemLink,
      item_title: extractItemTitle(),
      bid_amount: amount,
      currency: "EUR",
      timestamp: timestamp(),
      source: sourceTag,
      image_url: extractImageUrl(),
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
  // Interceptori XHR (primari)
  // --------------------------
  (function () {
    const origSend = XMLHttpRequest.prototype.send;
    const origOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function (method, url) {
      this._method = method;
      this._url = url;
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        // Procesează request-ul dacă e POST și URL-ul conține /sale/bid/
        if (
          this._method &&
          this._method.toUpperCase() === "POST" &&
          this._url &&
          this._url.includes('/sale/bid/')
        ) {
          handleBidRequest(this._url, body);
        }
      } catch (e) {
        logError("XHR interceptor:", e);
      }
      return origSend.apply(this, arguments);
    };
  })();

  // --------------------------
  // Interceptori FETCH (doar ca backup)
  // --------------------------
  (function () {
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const body = (init && init.body) || null;
        const method = (init && init.method) || "GET";
        if (
          method.toUpperCase() === "POST" &&
          url.includes('/sale/bid/')
        ) {
          handleBidRequest(url, body);
        }
      } catch (e) {
        logError("fetch interceptor:", e);
      }
      return origFetch.apply(this, arguments);
    };
  })();

  // --------------------------
  // Handler specific pentru /sale/bid/
  // --------------------------
  function handleBidRequest(url, body) {
    try {
      let amount = null;

      // Extrage suma din body
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

      if (bodyText) {
        amount = extractNumberEU(bodyText);
      }

      // Dacă nu, încearcă din URL
      if (!amount) {
        const urlParts = url.split('?');
        if (urlParts.length > 1) {
          const params = new URLSearchParams(urlParts[1]);
          const amtParam = params.get('amount');
          if (amtParam) {
            amount = extractNumberEU(amtParam);
          }
        }
      }

      if (!amount) {
        console.log("[LOGGER] Nu am găsit sumă în request-ul /sale/bid/");
        return;
      }

      console.log("[LOGGER] Suma extrasă din request:", amount);

      const payload = buildPayload(amount, "xhr-bid");
      sendToServer(payload);

    } catch (e) {
      logError("handleBidRequest:", e);
    }
  }

})();
