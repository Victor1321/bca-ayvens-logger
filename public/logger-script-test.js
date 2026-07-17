// -------------------------------------------------------------
// LOGGER-SCRIPT - VERSIUNEA FINALĂ (cu kilometraj și data)
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
    "bid", "licit", "liciteaz", "offer", "oferta", "ofertă",
    "place", "submit", "confirm", "confirmă", "confirma",
    "new offer", "oferta noua", "ofertă nouă", "oferta noua"
  ];

  const CLICK_WINDOW_MS = 5000;
  const DEDUP_COOLDOWN_MS = 2000;

  let lastClickInfo = null;
  let lastSent = { time: 0, amount: null, url: null };

  // --------------------------
  // HELPERS
  // --------------------------
  function now() { return Date.now(); }

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
    return BID_KEYWORDS.some(k => lower.includes(k));
  }

  function extractNumber(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/[^0-9.,]/g, "");
    if (!cleaned) return null;
    const std = cleaned.replace(/\./g, "").replace(",", ".");
    const nr = parseFloat(std);
    if (isNaN(nr) || nr < 1 || nr > 500000) return null;
    return nr;
  }

  // ----- Extrage titlul -----
  function extractItemTitle(btn) {
    try {
      const host = location.hostname.toLowerCase();

      function isBadTitle(t) {
        if (!t) return true;
        const s = t.trim().toLowerCase();
        return ["solicitați informații", "solicitati informatii", "request info", "request information"].includes(s);
      }

      if (host.includes("ayvens")) {
        let card = btn ? btn.closest(".card-body, .vehicle, .listing-item, .offer-item, article, .row") : null;
        if (card) {
          let h2 = card.querySelector("h2.vehicle-title");
          if (h2) {
            let txt = h2.textContent.trim().replace(/RECOMANDAT/g, "").trim();
            if (txt && !isBadTitle(txt)) return txt;
          }
          let title = card.querySelector(".vehicle-title");
          if (title) {
            let txt = title.textContent.trim().replace(/RECOMANDAT/g, "").trim();
            if (txt && !isBadTitle(txt)) return txt;
          }
        }
        let h2 = document.querySelector("h2.vehicle-title");
        if (h2) {
          let txt = h2.textContent.trim().replace(/RECOMANDAT/g, "").trim();
          if (txt && !isBadTitle(txt)) return txt;
        }
      }

      if (host.includes("bca-europe.com") || host.includes("bca-online-auctions.eu") || host.endsWith("bca.com")) {
        let card = btn ? btn.closest(".viewlot, .lot, .auction-tile, article, section, div") : null;
        if (card) {
          let title = card.querySelector("h2.viewlot_headline, h1.viewlot_headline");
          if (title) {
            let txt = title.textContent.trim();
            if (txt && !isBadTitle(txt)) return txt;
          }
        }
        let bcaTitle = document.querySelector("h2.viewlot_headline.viewlotheadline--large, h1.viewlotheadline.viewlot_headline--large");
        if (bcaTitle) {
          let txt = bcaTitle.textContent.trim();
          if (txt && !isBadTitle(txt)) return txt;
        }
      }

      let h = document.querySelector("h1, h2, h3");
      if (h) {
        let txt = h.textContent.trim();
        if (txt && !isBadTitle(txt)) return txt;
      }
      return "Titlu indisponibil";
    } catch (e) {
      logError("extractItemTitle:", e);
      return "Titlu indisponibil";
    }
  }

  // ----- Extrage imaginea -----
  function extractImageUrl(btn) {
    try {
      const host = location.hostname;

      if (host.includes("ayvens")) {
        let card = btn ? btn.closest(".card-body, .vehicle, .listing-item, .offer-item, article, .row") : null;
        if (card) {
          let img = card.querySelector(".vehicle-picture img, img[id^='vehicle-default-picture']");
          if (img && img.src) return img.src;
        }
        let img = document.querySelector(".vehicle-picture img");
        if (img && img.src) return img.src;
      }

      if (host.includes("bca-europe.com") || host.includes("bca-online-auctions.eu") || host.endsWith("bca.com")) {
        let card = btn ? btn.closest(".viewlot, .lot, .auction-tile, article, section, div") : null;
        if (card) {
          let img = card.querySelector(".viewlot__img img.MainImg, .ImageA img");
          if (img && img.src) return img.src;
        }
        let img = document.querySelector(".viewlot__img img.MainImg");
        if (img && img.src) return img.src;
        img = document.querySelector(".ImageA img");
        if (img && img.src) return img.src;
      }

      let anyImg = document.querySelector("img");
      if (anyImg && anyImg.src) return anyImg.src;
    } catch (e) {
      logError("extractImageUrl:", e);
    }
    return null;
  }

  // ----- Extrage specificațiile (kilometraj, data, etc.) -----
  function extractVehicleSpecs(btn) {
    try {
      const host = location.hostname;
      let specs = { mileage: null, registrationDate: null, fuel: null, gearbox: null, options: null, stock: null };

      if (host.includes("ayvens")) {
        let card = btn ? btn.closest(".card-body, .vehicle, .listing-item, .offer-item, article, .row") : null;
        if (!card) return specs;

        // Caută toate textele din vehicle-specifications-text
        const textElements = card.querySelectorAll(".vehicle-specifications-text");
        textElements.forEach(el => {
          const text = el.textContent.trim();
          // Kilometraj și data: format "86.665 mi. | 24.06.2021"
          if (text.includes("mi.") && text.includes("|")) {
            const parts = text.split("|").map(s => s.trim());
            if (parts.length >= 2) {
              specs.mileage = parts[0]; // "86.665 mi."
              specs.registrationDate = parts[1]; // "24.06.2021"
            }
          }
          // Combustibil și cutie: "Benzina | Manual" sau "Diesel | Automat"
          if (text.includes("Benzina") || text.includes("Diesel") || text.includes("Electric")) {
            const parts = text.split("|").map(s => s.trim());
            if (parts.length >= 2) {
              specs.fuel = parts[0];
              specs.gearbox = parts[1];
            } else {
              specs.fuel = text;
            }
          }
          // Opțiuni
          if (text.startsWith("Optiuni:")) {
            specs.options = text.replace("Optiuni:", "").trim();
          }
          // Stoc
          if (text.startsWith("Stoc:")) {
            specs.stock = text.replace("Stoc:", "").trim();
          }
        });
      }

      // BCA - similar, dar cu clase diferite (poți adăuga mai târziu)
      return specs;
    } catch (e) {
      logError("extractVehicleSpecs:", e);
      return {};
    }
  }

  // ----- TIMESTAMP -----
  function timestamp() {
    const d = new Date(Date.now() + 2 * 3600000);
    return d.toISOString().replace("T", " ").replace("Z", "");
  }

  // ----- DEDUP -----
  function shouldSend(amount, url) {
    const t = now();
    if (lastSent.amount === amount && lastSent.url === url && t - lastSent.time < DEDUP_COOLDOWN_MS) {
      return false;
    }
    lastSent.time = t;
    lastSent.amount = amount;
    lastSent.url = url;
    return true;
  }

  // ----- BUILD PAYLOAD (cu btn) -----
  function buildPayload(amount, sourceTag, btn) {
    let itemLink = location.href;
    if (location.hostname.includes("ayvens")) {
      itemLink = "https://carmarket.ayvens.com/live";
    }

    const specs = extractVehicleSpecs(btn);

    return {
      client_id: CLIENT_ID,
      item_link: itemLink,
      item_title: extractItemTitle(btn),
      bid_amount: amount,
      currency: "EUR",
      timestamp: timestamp(),
      source: sourceTag,
      image_url: extractImageUrl(btn),
      mileage: specs.mileage || "N/A",
      registration_date: specs.registrationDate || "N/A",
      fuel: specs.fuel || "N/A",
      gearbox: specs.gearbox || "N/A",
      options: specs.options || "N/A",
      stock: specs.stock || "N/A",
    };
  }

  // ----- SEND -----
  function sendToServer(data) {
    if (!data || typeof data.bid_amount === "undefined" || data.bid_amount === null) return;
    if (!shouldSend(data.bid_amount, data.item_link)) return;
    logSend(data);
    fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(res => { if (!res.ok) logError("Răspuns server status:", res.status); })
      .catch(err => logError("Eroare send:", err));
  }

  // =========================================================
  // INTERCEPTOR XHR (AYVENS - /sale/bid/)
  // =========================================================
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
        if (
          this._method &&
          this._method.toUpperCase() === "POST" &&
          this._url &&
          this._url.includes('/sale/bid/')
        ) {
          console.log("[LOGGER] Interceptat /sale/bid/");
          let amount = null;

          if (body && typeof body === "string") {
            try {
              const json = JSON.parse(body);
              if (json.Amount !== undefined && json.Amount !== null) {
                amount = parseInt(json.Amount);
                console.log("[LOGGER] Suma extrasă din json.Amount:", amount);
              }
            } catch (e) {}
          } else if (body && typeof body === "object") {
            try {
              const json = JSON.parse(JSON.stringify(body));
              if (json.Amount !== undefined && json.Amount !== null) {
                amount = parseInt(json.Amount);
                console.log("[LOGGER] Suma extrasă din json.Amount (object):", amount);
              }
            } catch (e) {}
          }

          if (!amount) {
            let bodyText = "";
            if (typeof body === "string") bodyText = body;
            else if (body instanceof FormData) {
              const arr = [];
              body.forEach((v, k) => arr.push(k + "=" + v));
              bodyText = arr.join("&");
            } else if (body && typeof body === "object") {
              try { bodyText = JSON.stringify(body); } catch (e) {}
            }
            if (bodyText) {
              const numbers = bodyText.match(/\d{2,}/g);
              if (numbers) {
                for (let num of numbers) {
                  const val = parseInt(num);
                  if (val > 10 && val < 500000) {
                    amount = val;
                    console.log("[LOGGER] Suma extrasă din body (fallback):", amount);
                    break;
                  }
                }
              }
            }
          }

          if (!amount) {
            console.log("[LOGGER] Nu am găsit suma în request!");
            return;
          }

          const payload = buildPayload(amount, "xhr-bid", lastClickInfo ? lastClickInfo.btn : null);
          sendToServer(payload);
        }
      } catch (e) {
        logError("XHR interceptor:", e);
      }
      return origSend.apply(this, arguments);
    };
  })();

  // --------------------------
  // INTERCEPTOR FETCH (BACKUP)
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
          console.log("[LOGGER] Interceptat FETCH /sale/bid/");
          let amount = null;
          if (body) {
            try {
              const json = typeof body === "string" ? JSON.parse(body) : JSON.parse(JSON.stringify(body));
              if (json.Amount !== undefined && json.Amount !== null) {
                amount = parseInt(json.Amount);
                console.log("[LOGGER] Suma extrasă din FETCH json.Amount:", amount);
              }
            } catch (e) {}
          }
          if (!amount && body) {
            const bodyText = typeof body === "string" ? body : JSON.stringify(body);
            const numbers = bodyText.match(/\d{2,}/g);
            if (numbers) {
              for (let num of numbers) {
                const val = parseInt(num);
                if (val > 10 && val < 500000) {
                  amount = val;
                  console.log("[LOGGER] Suma extrasă din FETCH (fallback):", amount);
                  break;
                }
              }
            }
          }
          if (amount) {
            const payload = buildPayload(amount, "fetch-bid", lastClickInfo ? lastClickInfo.btn : null);
            sendToServer(payload);
          }
        }
      } catch (e) {
        logError("fetch interceptor:", e);
      }
      return origFetch.apply(this, arguments);
    };
  })();

  // =========================================================
  // LOGICA PENTRU BCA (CLICK + REQUEST INTERCEPTOR)
  // =========================================================
  document.addEventListener("click", function (e) {
    try {
      const btn = e.target && e.target.closest("button, a, input[type='submit']");
      if (!btn) return;
      const txt = (btn.innerText || btn.value || "").trim();
      if (!textContainsKeyword(txt)) return;

      const amount = extractNumber(btn.innerText || btn.value || "") || extractNumber(document.querySelector("input[type='text']")?.value || "");

      lastClickInfo = {
        time: now(),
        domAmount: amount || null,
        btn: btn,
        sent: false,
      };

      setTimeout(() => {
        if (lastClickInfo && !lastClickInfo.sent) {
          const fallbackAmount = lastClickInfo.domAmount || extractNumber(document.querySelector("input[type='text']")?.value || "");
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

  // ----- INTERCEPTOR XHR (BCA) -----
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
        if (
          this._method &&
          this._method.toUpperCase() === "POST" &&
          this._url &&
          !this._url.includes('/sale/bid/')
        ) {
          const sinceClick = lastClickInfo ? now() - lastClickInfo.time : null;
          if (lastClickInfo && sinceClick <= CLICK_WINDOW_MS) {
            let amount = null;
            let bodyText = "";
            if (typeof body === "string") bodyText = body;
            else if (body instanceof FormData) {
              const arr = [];
              body.forEach((v, k) => arr.push(k + "=" + v));
              bodyText = arr.join("&");
            } else if (body && typeof body === "object") {
              try { bodyText = JSON.stringify(body); } catch (e) {}
            }
            const haystack = (this._url + " " + bodyText).toLowerCase();
            if (textContainsKeyword(haystack)) {
              amount = extractNumber(bodyText) || lastClickInfo.domAmount;
              if (amount) {
                const payload = buildPayload(amount, "xhr-bid-bca", lastClickInfo.btn);
                sendToServer(payload);
                lastClickInfo.sent = true;
              }
            }
          }
        }
      } catch (e) {
        logError("XHR interceptor BCA:", e);
      }
      return origSend.apply(this, arguments);
    };
  })();

  // ----- INTERCEPTOR FETCH (BCA) -----
  (function () {
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const body = (init && init.body) || null;
        const method = (init && init.method) || "GET";
        if (
          method.toUpperCase() === "POST" &&
          !url.includes('/sale/bid/')
        ) {
          const sinceClick = lastClickInfo ? now() - lastClickInfo.time : null;
          if (lastClickInfo && sinceClick <= CLICK_WINDOW_MS) {
            let amount = null;
            let bodyText = "";
            if (typeof body === "string") bodyText = body;
            else if (body && typeof body === "object") {
              try { bodyText = JSON.stringify(body); } catch (e) {}
            }
            const haystack = (url + " " + bodyText).toLowerCase();
            if (textContainsKeyword(haystack)) {
              amount = extractNumber(bodyText) || lastClickInfo.domAmount;
              if (amount) {
                const payload = buildPayload(amount, "fetch-bid-bca", lastClickInfo.btn);
                sendToServer(payload);
                lastClickInfo.sent = true;
              }
            }
          }
        }
      } catch (e) {
        logError("fetch interceptor BCA:", e);
      }
      return origFetch.apply(this, arguments);
    };
  })();

  // =========================================================
  // PORNIRE
  // =========================================================
  if (!isAllowedHost()) {
    console.log("[LOGGER] Host nepermis:", location.hostname);
    return;
  }

  console.log("[LOGGER] Activ pe", location.hostname);
  console.log("[LOGGER] CLIENT_ID:", CLIENT_ID);

})();
