// -------------------------------------------------------------
// LOGGER-SCRIPT - VERSIUNEA COMPLETĂ (BCA + AYVENS)
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

  // ----- Găsește cardul părinte (folosește aceeași logică peste tot) -----
  function findParentCard(btn) {
    if (!btn) return null;
    let card = btn.closest(".card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card");
    if (!card) {
      let parent = btn.parentElement;
      while (parent && parent !== document.body) {
        if (parent.classList && (
          parent.classList.contains("card-body") ||
          parent.classList.contains("col-lg-9") ||
          parent.classList.contains("vehicle") ||
          parent.classList.contains("row") ||
          parent.classList.contains("card")
        )) {
          card = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }
    return card;
  }

  // ----- Extrage titlul (pentru BCA și fallback Ayvens) -----
  function extractItemTitle(btn) {
    try {
      const host = location.hostname.toLowerCase();

      function isBadTitle(t) {
        if (!t) return true;
        const s = t.trim().toLowerCase();
        return ["solicitați informații", "solicitati informatii", "request info", "request information"].includes(s);
      }

      if (host.includes("ayvens")) {
        const card = findParentCard(btn);
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
        const card = findParentCard(btn);
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

  // ----- Extrage imaginea (pentru BCA și fallback Ayvens) -----
  function extractImageUrl(btn) {
    try {
      const host = location.hostname;

      if (host.includes("ayvens")) {
        const card = findParentCard(btn);
        if (card) {
          let img = card.querySelector(".vehicle-picture img, img[id^='vehicle-default-picture'], .vehicle-picture img[src]");
          if (img && img.src) return img.src;
          let anyImg = card.querySelector("img");
          if (anyImg && anyImg.src) return anyImg.src;
        }
        let img = document.querySelector(".vehicle-picture img");
        if (img && img.src) return img.src;
      }

      if (host.includes("bca-europe.com") || host.includes("bca-online-auctions.eu") || host.endsWith("bca.com")) {
        const card = findParentCard(btn);
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

  // ----- Extrage specificațiile (pentru BCA și fallback Ayvens) -----
  function extractVehicleSpecs(btn) {
    try {
      const host = location.hostname;
      let specs = { mileage: null, registrationDate: null, fuel: null, gearbox: null };

      if (host.includes("ayvens")) {
        const card = findParentCard(btn);
        if (!card) return specs;

        const textElements = card.querySelectorAll(".vehicle-specifications-text");
        textElements.forEach(el => {
          const text = el.textContent.trim();
          if (text.includes("mi.") && text.includes("|")) {
            const parts = text.split("|").map(s => s.trim());
            if (parts.length >= 2) {
              specs.mileage = parts[0];
              specs.registrationDate = parts[1];
            }
          }
          if (text.includes("Benzina") || text.includes("Diesel") || text.includes("Electric")) {
            const parts = text.split("|").map(s => s.trim());
            if (parts.length >= 2) {
              specs.fuel = parts[0];
              specs.gearbox = parts[1];
            } else {
              specs.fuel = text;
            }
          }
        });
      }
      return specs;
    } catch (e) {
      logError("extractVehicleSpecs:", e);
      return {};
    }
  }

  // ----- EXTRAGERE DIRECT DIN CARD (pentru Ayvens) -----
  function extractItemTitleFromCard(card) {
    try {
      const h2 = card.querySelector("h2.vehicle-title");
      if (h2) {
        let txt = h2.textContent.trim().replace(/RECOMANDAT/g, "").trim();
        if (txt) return txt;
      }
      const title = card.querySelector(".vehicle-title");
      if (title) {
        let txt = title.textContent.trim().replace(/RECOMANDAT/g, "").trim();
        if (txt) return txt;
      }
      return "Titlu indisponibil";
    } catch (e) {
      return "Titlu indisponibil";
    }
  }

  // ----- Extrage imaginea folosind VehicleSale ID -----
  function extractImageUrlByVehicleSaleId(vehicleSaleId) {
    try {
      // Caută imaginea cu ID-ul specific: vehicle-default-picture-vehicle-<ID>
      const imgId = `vehicle-default-picture-vehicle-${vehicleSaleId}`;
      const img = document.getElementById(imgId);
      if (img && img.src) {
        console.log("[LOGGER] Imagine găsită după ID:", imgId);
        return img.src;
      }

      // Fallback: caută în cardul care conține acest ID
      const card = document.querySelector(`[data-vehicle-id="${vehicleSaleId}"]`);
      if (card) {
        const imgInCard = card.querySelector(".vehicle-picture img, img[id^='vehicle-default-picture']");
        if (imgInCard && imgInCard.src) return imgInCard.src;
      }

      return null;
    } catch (e) {
      logError("extractImageUrlByVehicleSaleId:", e);
      return null;
    }
  }

  function extractMileageFromCard(card) {
    try {
      const elements = card.querySelectorAll(".vehicle-specifications-text");
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.includes("mi.") && text.includes("|")) {
          return text.split("|")[0].trim();
        }
      }
      return "N/A";
    } catch (e) {
      return "N/A";
    }
  }

  function extractRegistrationDateFromCard(card) {
    try {
      const elements = card.querySelectorAll(".vehicle-specifications-text");
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.includes("mi.") && text.includes("|")) {
          return text.split("|")[1].trim();
        }
      }
      return "N/A";
    } catch (e) {
      return "N/A";
    }
  }

  function extractFuelFromCard(card) {
    try {
      const elements = card.querySelectorAll(".vehicle-specifications-text");
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.includes("Benzina") || text.includes("Diesel") || text.includes("Electric")) {
          const parts = text.split("|").map(s => s.trim());
          if (parts.length >= 2) return parts[0];
          return text;
        }
      }
      return "N/A";
    } catch (e) {
      return "N/A";
    }
  }

  function extractGearboxFromCard(card) {
    try {
      const elements = card.querySelectorAll(".vehicle-specifications-text");
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.includes("Benzina") || text.includes("Diesel") || text.includes("Electric")) {
          const parts = text.split("|").map(s => s.trim());
          if (parts.length >= 2) return parts[1];
          return "N/A";
        }
      }
      return "N/A";
    } catch (e) {
      return "N/A";
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

  // ----- BUILD PAYLOAD (pentru BCA și fallback Ayvens) -----
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
  // INTERCEPTOR XHR (AYVENS - /sale/bid/) - NOUA LOGICĂ
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
          let vehicleSaleId = null;

          // ----- Extrage Amount și VehicleSale din body -----
          let bodyText = "";
          if (typeof body === "string") {
            bodyText = body;
            try {
              const json = JSON.parse(body);
              if (json.Amount !== undefined && json.Amount !== null) {
                amount = parseInt(json.Amount);
                console.log("[LOGGER] Suma extrasă din json.Amount:", amount);
              }
              if (json.VehicleSale !== undefined) {
                vehicleSaleId = json.VehicleSale;
                console.log("[LOGGER] VehicleSale extras:", vehicleSaleId);
              }
            } catch (e) {}
          } else if (body && typeof body === "object") {
            try {
              const json = JSON.parse(JSON.stringify(body));
              if (json.Amount !== undefined && json.Amount !== null) {
                amount = parseInt(json.Amount);
                console.log("[LOGGER] Suma extrasă din json.Amount (object):", amount);
              }
              if (json.VehicleSale !== undefined) {
                vehicleSaleId = json.VehicleSale;
                console.log("[LOGGER] VehicleSale extras (object):", vehicleSaleId);
              }
            } catch (e) {}
          }

          // Dacă nu am găsit amount, încearcă prin regex
          if (!amount && bodyText) {
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

          if (!amount) {
            console.log("[LOGGER] Nu am găsit suma în request!");
            return;
          }

          // ----- Găsește cardul folosind VehicleSale -----
          let card = null;
          if (vehicleSaleId) {
            console.log("[LOGGER] Caut card cu VehicleSale ID:", vehicleSaleId);

            // Metoda 1: Caută un element cu data-vehicle-id
            const vehicleEl = document.querySelector(`[data-vehicle-id="${vehicleSaleId}"]`);
            if (vehicleEl) {
              card = vehicleEl.closest('.card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card');
              console.log("[LOGGER] Card găsit prin data-vehicle-id:", card);
            }

            // Metoda 2: Caută în data-bid-area-information
            if (!card) {
              const allElements = document.querySelectorAll('[data-bid-area-information]');
              for (const el of allElements) {
                try {
                  const attr = el.getAttribute('data-bid-area-information');
                  const data = JSON.parse(attr);
                  if (data.VehicleId == vehicleSaleId || data.SaleConditionId == vehicleSaleId) {
                    card = el.closest('.card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card');
                    console.log("[LOGGER] Card găsit prin data-bid-area-information:", card);
                    break;
                  }
                } catch (e) {}
              }
            }

            // Metoda 3: Caută în data-sale-id
            if (!card) {
              const saleEl = document.querySelector(`[data-sale-id="${vehicleSaleId}"]`);
              if (saleEl) {
                card = saleEl.closest('.card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card');
                console.log("[LOGGER] Card găsit prin data-sale-id:", card);
              }
            }

            // Metoda 4: Caută în data-sale-condition-id
            if (!card) {
              const conditionEl = document.querySelector(`[data-sale-condition-id="${vehicleSaleId}"]`);
              if (conditionEl) {
                card = conditionEl.closest('.card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card');
                console.log("[LOGGER] Card găsit prin data-sale-condition-id:", card);
              }
            }
          }

          // Dacă nu am găsit card prin ID, folosește fallback-ul global
          if (!card) {
            console.log("[LOGGER] Nu am găsit card prin ID, folosesc fallback global.");
            const inputs = document.querySelectorAll('.bid-offer-input');
            for (const inp of inputs) {
              if (inp.value && inp.value.trim() !== '') {
                const parentCard = inp.closest('.card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card');
                if (parentCard) {
                  card = parentCard;
                  console.log("[LOGGER] Card găsit prin fallback (input):", card);
                  break;
                }
              }
            }
          }

          // ----- Extrage imaginea folosind vehicleSaleId -----
          let imageUrl = null;
          if (vehicleSaleId) {
            imageUrl = extractImageUrlByVehicleSaleId(vehicleSaleId);
          }
          // Dacă nu am găsit cu ID, încearcă din card
          if (!imageUrl && card) {
            imageUrl = card.querySelector(".vehicle-picture img")?.src || null;
          }

          // ----- Construiește payload -----
          const payload = {
            client_id: CLIENT_ID,
            item_link: location.href.includes('carmarket.ayvens.com') ? "https://carmarket.ayvens.com/live" : location.href,
            item_title: card ? extractItemTitleFromCard(card) : "Titlu indisponibil",
            bid_amount: amount,
            currency: "EUR",
            timestamp: timestamp(),
            source: "xhr-bid",
            image_url: imageUrl,
            mileage: card ? extractMileageFromCard(card) : "N/A",
            registration_date: card ? extractRegistrationDateFromCard(card) : "N/A",
            fuel: card ? extractFuelFromCard(card) : "N/A",
            gearbox: card ? extractGearboxFromCard(card) : "N/A",
          };

          sendToServer(payload);
        }
      } catch (e) {
        logError("XHR interceptor:", e);
      }
      return origSend.apply(this, arguments);
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
