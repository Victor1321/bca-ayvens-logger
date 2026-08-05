// -------------------------------------------------------------
// LOGGER-SCRIPT - VERSIUNEA COMPLETĂ (BCA + AYVENS)
// -------------------------------------------------------------
(function () {
  "use strict";

  const SERVER_URL = "https://bca-ayvens-logger.fly.dev/receive-bid";
  const CLIENT_ID = "david-fleasca"; // Schimbă după nevoie
  const VERSION = "3.1.0";

  // ----- DEBUG: activ cu ?debug=1 în URL sau localStorage['logger-debug']='1' -----
  const DEBUG = (function () {
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem("logger-debug") === "1") return true;
    } catch (e) {}
    try {
      if (typeof window !== "undefined" && window.location && String(window.location.search).includes("debug=1")) return true;
    } catch (e) {}
    return false;
  })();

  const _origLog = console.log.bind(console);
  function dlog(...args) {
    if (DEBUG) _origLog("[LOGGER-DEBUG]", ...args);
  }

  const ALLOWED_HOSTS = [
    "ee.bca-europe.com",
    "idp.bca-online-auctions.eu",
    "carmarket.ayvens.com",
    "www.bca.com",
    "bca.com",
    "login.bca.com",
  ];

  const BID_KEYWORDS = [
    // EN / RO
    "bid", "bids", "bidding", "licit", "liciteaz", "offer", "oferta", "ofertă",
    "place", "submit", "confirm", "confirmă", "confirma",
    "new offer", "oferta noua", "ofertă nouă", "oferta noua",
    "licitează", "bid now", "buy now", "place bid",
    // SK (slovacă)
    "ponuka", "ponúk", "dražba", "odoslať", "odoslat", "potvrdiť", "potvrdit",
    "cenová ponuka", "pridať ponuku", "pridat ponuku", "licitovať", "licitovat",
    // CS (cehă)
    "nabídka", "nabidka", "nabídnout", "nabidnout", "dražba", "dražbě",
    "přihodit", "prihodit", "příhoz", "prihoz", "odeslat",
    // HU (maghiară)
    "ajánlat", "ajanlat", "licitál", "licital", "ajánlatot", "elküld", "megerősít", "megerosít", "árverés", "arveres",
    // DE (germană)
    "gebot", "bieten", "ersteigern", "auktion", "abgeben", "bestätigen", "bestaetigen", "kaufen", "senden",
    // PL (poloneză)
    "licytuj", "licytac", "licytacja", "złóż", "zloz", "potwierdź", "potwierdz", "wyślij", "wyslij", "kup",
    // ES (spaniolă)
    "puja", "pujar", "licitar", "enviar", "confirmar", "comprar", "pujar ahora",
    // IT (italiană)
    "offerta", "fai un'offerta", "fai un offerta", "rilancio", "invia", "conferma", "compra",
    // FR (franceză)
    "enchérir", "enchere", "offre", "soumettre", "confirmer", "acheter",
    // NL (olandeză)
    "bod", "bieden", "aanbieding", "verstuur", "bevestig", "koop", "bieding",
    // PT (portugheză)
    "licitar", "lance", "enviar", "confirmar", "comprar",
    // TR (turcă)
    "teklif", "teklif ver", "onayla", "gönder", "gonder", "satın al", "satin al",
  ];

  // pattern-uri de endpoint (independente de limba UI — URL-urile rămân în engleză)
  const BID_URL_PATTERNS = [
    "/sale/bid/", "/bid", "/offer", "/placebid", "/place-bid", "/submitbid", "/submit-bid",
    "/proxy", "/lot", "/auction", "/createbid", "/makebid", "bidding", "placebid",
  ];

  // cuvinte pentru ID/name/data-*/aria-label (fără slash)
  const BID_ID_KEYWORDS = [
    "bid", "offer", "submit", "place", "confirm", "licit", "puja", "gebot",
    "nabid", "ajánlat", "teklif", "ponuka", "enchere", "bod",
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
    dlog("[LOGGER] Trimis:", ...args);
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

  // ----- Detecție bid independentă de limbă -----
  function isBidElement(btn) {
    if (!btn) return false;
    let extra = "";
    try {
      if (btn.getAttribute) {
        extra = [
          btn.getAttribute("aria-label"),
          btn.getAttribute("name"),
          btn.getAttribute("data-bid"),
          btn.getAttribute("data-action"),
          btn.getAttribute("data-role"),
          btn.getAttribute("title"),
        ].filter(Boolean).join(" ").toLowerCase();
      }
    } catch (e) {}
    const id = (btn.id || "").toLowerCase();
    const combined = id + " " + extra;
    return BID_ID_KEYWORDS.some(k => combined.includes(k));
  }

  function isBidRequest(url, bodyText, amount) {
    const haystack = ((url || "") + " " + (bodyText || "")).toLowerCase();
    if (textContainsKeyword(haystack)) return true;
    if (BID_URL_PATTERNS.some(p => haystack.includes(p))) return true;
    // semnal numeric: sumă plauzibilă + măcar un indiciu de bid în request
    if (amount && amount > 0) {
      const hints = ["€", "eur", "amount", "price", "currency", "value", "bid", "offer"];
      if (hints.some(h => haystack.includes(h))) return true;
    }
    return false;
  }

  // ----- Găsește cardul părinte (pentru Ayvens) -----
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

  // ----- EXTRAGERE PENTRU BCA (direct din DOM, fără btn) -----
  function extractBCATitle() {
    try {
      const title = document.querySelector("h2.viewlot__headline.viewlot__headline--large");
      if (title && title.innerText.trim()) {
        return title.innerText.trim();
      }
      const fallback = document.querySelector("h1, h2.viewlot_headline");
      return fallback ? fallback.innerText.trim() : "Titlu indisponibil";
    } catch (e) {
      logError("extractBCATitle:", e);
      return "Titlu indisponibil";
    }
  }

  function extractBCASubheadline() {
    try {
      const el = document.querySelector(".viewlot__subheadline");
      if (!el) return { mileage: "N/A", registrationDate: "N/A", fuel: "N/A" };

      const text = el.innerText.trim();
      const kmMatch = text.match(/([\d.,]+)\s*km/);
      const mileage = kmMatch ? kmMatch[1].trim() + " km" : "N/A";

      const dateMatch = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      const registrationDate = dateMatch ? dateMatch[1] : "N/A";

      const fuelMatch = text.match(/(Benzina|Diesel|PHEV|Electric|Hybrid|Benzină)/i);
      const fuel = fuelMatch ? fuelMatch[1] : "N/A";

      return { mileage, registrationDate, fuel };
    } catch (e) {
      logError("extractBCASubheadline:", e);
      return { mileage: "N/A", registrationDate: "N/A", fuel: "N/A" };
    }
  }

  function extractBCAImage() {
    try {
      const img = document.querySelector(".viewlot__img img.MainImg, .MainImg.vehicleImage");
      if (img && img.src) return img.src;
      const fallback = document.querySelector(".viewlot__img img");
      if (fallback && fallback.src) return fallback.src;
      return null;
    } catch (e) {
      logError("extractBCAImage:", e);
      return null;
    }
  }

  // ----- Extrage data primei înmatriculări din tabelul de detalii BCA -----
  function extractBCARegistrationDateFromTable() {
    try {
      const rows = document.querySelectorAll('tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim();
          if (label.includes('Data primei înregistrări') || label.includes('Data primei inregistrari')) {
            const date = cells[1].textContent.trim();
            if (date) {
              dlog("[LOGGER] Data primei înmatriculări (tabel):", date);
              return date;
            }
          }
        }
      }
      return null;
    } catch (e) {
      logError("extractBCARegistrationDateFromTable:", e);
      return null;
    }
  }

  // ----- Extrage titlul (pentru Ayvens) -----
  function extractAyvensTitle(btn) {
    try {
      const card = findParentCard(btn);
      if (card) {
        let h2 = card.querySelector("h2.vehicle-title");
        if (h2) {
          let txt = h2.textContent.trim().replace(/RECOMANDAT/g, "").trim();
          if (txt) return txt;
        }
        let title = card.querySelector(".vehicle-title");
        if (title) {
          let txt = title.textContent.trim().replace(/RECOMANDAT/g, "").trim();
          if (txt) return txt;
        }
      }
      let h2 = document.querySelector("h2.vehicle-title");
      if (h2) {
        let txt = h2.textContent.trim().replace(/RECOMANDAT/g, "").trim();
        if (txt) return txt;
      }
      return "Titlu indisponibil";
    } catch (e) {
      logError("extractAyvensTitle:", e);
      return "Titlu indisponibil";
    }
  }

  // ----- Extrage imaginea (pentru Ayvens) -----
  function extractAyvensImage(btn) {
    try {
      const card = findParentCard(btn);
      if (card) {
        let img = card.querySelector(".vehicle-picture img, img[id^='vehicle-default-picture'], .vehicle-picture img[src]");
        if (img && img.src) return img.src;
        let anyImg = card.querySelector("img");
        if (anyImg && anyImg.src) return anyImg.src;
      }
      let img = document.querySelector(".vehicle-picture img");
      if (img && img.src) return img.src;
      return null;
    } catch (e) {
      logError("extractAyvensImage:", e);
      return null;
    }
  }

  // ----- Extrage specificațiile (pentru Ayvens) -----
  function extractAyvensSpecs(btn) {
    try {
      let specs = { mileage: "N/A", registrationDate: "N/A", fuel: "N/A", gearbox: "N/A" };
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
      return specs;
    } catch (e) {
      logError("extractAyvensSpecs:", e);
      return { mileage: "N/A", registrationDate: "N/A", fuel: "N/A", gearbox: "N/A" };
    }
  }

  // ----- EXTRAGERE DIRECT DIN CARD (pentru Ayvens via XHR) -----
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

  function extractImageUrlByVehicleSaleId(vehicleSaleId) {
    try {
      const imgId = `vehicle-default-picture-vehicle-${vehicleSaleId}`;
      const img = document.getElementById(imgId);
      if (img && img.src) {
        dlog("[LOGGER] Imagine găsită după ID:", imgId);
        return img.src;
      }
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
    return new Date().toISOString(); // UTC — serverul afișează în Europe/Bucharest
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

  // ----- BUILD PAYLOAD (pentru BCA și Ayvens) -----
  function buildPayload(amount, sourceTag, btn) {
    const host = location.hostname;
    // Extrage doar URL-ul de bază (până la primul '&' sau '?' după ID)
    let itemLink = location.href;
    // Pentru BCA, scurtează link-ul
    if (location.hostname.includes('bca-europe.com') || location.hostname.includes('bca-online-auctions.eu')) {
      const match = location.href.match(/^(https?:\/\/[^\/]+\/Lot\?id=[^&]+)/);
      if (match) {
        itemLink = match[1];
      } else {
        // Fallback: ia doar până la primul '&'
        const baseUrl = location.href.split('&')[0];
        if (baseUrl) itemLink = baseUrl;
      }
    }
    let title, imageUrl, mileage, registrationDate, fuel, gearbox;

    if (host.includes("ayvens")) {
      itemLink = "https://carmarket.ayvens.com/live";
      const specs = extractAyvensSpecs(btn);
      title = extractAyvensTitle(btn);
      imageUrl = extractAyvensImage(btn);
      mileage = specs.mileage;
      registrationDate = specs.registrationDate;
      fuel = specs.fuel;
      gearbox = specs.gearbox;
    } else if (host.includes("bca-europe.com") || host.includes("bca-online-auctions.eu") || host.endsWith("bca.com")) {
      title = extractBCATitle();
      const sub = extractBCASubheadline();
      imageUrl = extractBCAImage();
      mileage = sub.mileage;
      // Încearcă mai întâi data din tabel, apoi din subtitlu
      let regDate = extractBCARegistrationDateFromTable();
      if (!regDate || regDate === "N/A") {
        regDate = sub.registrationDate;
      }
      registrationDate = regDate || "N/A";
      fuel = sub.fuel;
      gearbox = "N/A";
    } else {
      title = "Titlu indisponibil";
      imageUrl = null;
      mileage = "N/A";
      registrationDate = "N/A";
      fuel = "N/A";
      gearbox = "N/A";
    }

    return {
      client_id: CLIENT_ID,
      item_link: itemLink,
      item_title: title,
      bid_amount: amount,
      currency: "EUR",
      timestamp: timestamp(),
      source: sourceTag,
      host: location.hostname,
      image_url: imageUrl,
      mileage: mileage || "N/A",
      registration_date: registrationDate || "N/A",
      fuel: fuel || "N/A",
      gearbox: gearbox || "N/A",
    };
  }

  // ----- SEND -----
  function sendToServer(data) {
    if (!data || typeof data.bid_amount === "undefined" || data.bid_amount === null) return;
    if (!shouldSend(data.bid_amount, data.item_link)) return;
    logSend(data);
    console.log("[BID] trimis " + CLIENT_ID + " | " + data.bid_amount + " " + (data.currency || "EUR") + " | " + (data.source || "?") + " | " + (data.host || ""));
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
          dlog("[LOGGER] Interceptat /sale/bid/");

          let amount = null;
          let vehicleSaleId = null;

          let bodyText = "";
          if (typeof body === "string") {
            bodyText = body;
            try {
              const json = JSON.parse(body);
              if (json.Amount !== undefined && json.Amount !== null) {
                amount = parseInt(json.Amount);
                dlog("[LOGGER] Suma extrasă din json.Amount:", amount);
              }
              if (json.VehicleSale !== undefined) {
                vehicleSaleId = json.VehicleSale;
                dlog("[LOGGER] VehicleSale extras:", vehicleSaleId);
              }
            } catch (e) {}
          } else if (body && typeof body === "object") {
            try {
              const json = JSON.parse(JSON.stringify(body));
              if (json.Amount !== undefined && json.Amount !== null) {
                amount = parseInt(json.Amount);
                dlog("[LOGGER] Suma extrasă din json.Amount (object):", amount);
              }
              if (json.VehicleSale !== undefined) {
                vehicleSaleId = json.VehicleSale;
                dlog("[LOGGER] VehicleSale extras (object):", vehicleSaleId);
              }
            } catch (e) {}
          }

          if (!amount && bodyText) {
            const numbers = bodyText.match(/\d{2,}/g);
            if (numbers) {
              for (let num of numbers) {
                const val = parseInt(num);
                if (val > 10 && val < 500000) {
                  amount = val;
                  dlog("[LOGGER] Suma extrasă din body (fallback):", amount);
                  break;
                }
              }
            }
          }

          if (!amount) {
            dlog("[LOGGER] Nu am găsit suma în request!");
            return;
          }

          let card = null;
          if (vehicleSaleId) {
            dlog("[LOGGER] Caut card cu VehicleSale ID:", vehicleSaleId);
            const vehicleEl = document.querySelector(`[data-vehicle-id="${vehicleSaleId}"]`);
            if (vehicleEl) {
              card = vehicleEl.closest('.card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card');
              dlog("[LOGGER] Card găsit prin data-vehicle-id:", card);
            }
            if (!card) {
              const allElements = document.querySelectorAll('[data-bid-area-information]');
              for (const el of allElements) {
                try {
                  const attr = el.getAttribute('data-bid-area-information');
                  const data = JSON.parse(attr);
                  if (data.VehicleId == vehicleSaleId || data.SaleConditionId == vehicleSaleId) {
                    card = el.closest('.card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card');
                    dlog("[LOGGER] Card găsit prin data-bid-area-information:", card);
                    break;
                  }
                } catch (e) {}
              }
            }
            if (!card) {
              const saleEl = document.querySelector(`[data-sale-id="${vehicleSaleId}"]`);
              if (saleEl) {
                card = saleEl.closest('.card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card');
                dlog("[LOGGER] Card găsit prin data-sale-id:", card);
              }
            }
          }

          if (!card) {
            dlog("[LOGGER] Nu am găsit card prin ID, folosesc fallback global.");
            const inputs = document.querySelectorAll('.bid-offer-input');
            for (const inp of inputs) {
              if (inp.value && inp.value.trim() !== '') {
                const parentCard = inp.closest('.card-body, .vehicle, .listing-item, .offer-item, article, .row, .col-lg-9, .card');
                if (parentCard) {
                  card = parentCard;
                  dlog("[LOGGER] Card găsit prin fallback (input):", card);
                  break;
                }
              }
            }
          }

          let imageUrl = null;
          if (vehicleSaleId) {
            imageUrl = extractImageUrlByVehicleSaleId(vehicleSaleId);
          }
          if (!imageUrl && card) {
            imageUrl = card.querySelector(".vehicle-picture img")?.src || null;
          }

          const payload = {
            client_id: CLIENT_ID,
            item_link: location.href.includes('carmarket.ayvens.com') ? "https://carmarket.ayvens.com/live" : location.href,
            item_title: card ? extractItemTitleFromCard(card) : "Titlu indisponibil",
            bid_amount: amount,
            currency: "EUR",
            timestamp: timestamp(),
            source: "xhr-bid",
            host: location.hostname,
            image_url: imageUrl,
            mileage: card ? extractMileageFromCard(card) : "N/A",
            registration_date: card ? extractRegistrationDateFromCard(card) : "N/A",
            fuel: card ? extractFuelFromCard(card) : "N/A",
            gearbox: card ? extractGearboxFromCard(card) : "N/A",
          };

          sendToServer(payload);
        }
      } catch (e) {
        logError("XHR interceptor Ayvens:", e);
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
      const labelTxt = (btn.getAttribute && (btn.getAttribute("aria-label") || btn.getAttribute("name") || btn.getAttribute("data-bid") || btn.getAttribute("data-action") || btn.getAttribute("title"))) || "";
      const isBidBtn = textContainsKeyword(txt) || (labelTxt && textContainsKeyword(labelTxt)) || isBidElement(btn);
      if (!isBidBtn) return;

      const card = findParentCard(btn);

      let amount = null;
      const inputs = document.querySelectorAll("input[type='text'], input[type='number']");
      for (const inp of inputs) {
        if (inp.value && inp.value.includes('€')) {
          const nr = extractNumber(inp.value);
          if (nr) {
            amount = nr;
            break;
          }
        }
      }
      // fallback: input cu € în cardul butonului (UI în altă limbă, text necunoscut)
      if (!amount && card) {
        const cardInputs = card.querySelectorAll("input[type='text'], input[type='number']");
        for (const inp of cardInputs) {
          if (inp.value && inp.value.includes('€')) {
            const nr = extractNumber(inp.value);
            if (nr) {
              amount = nr;
              break;
            }
          }
        }
      }

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
            amount = extractNumber(bodyText) || lastClickInfo.domAmount;
            if (isBidRequest(this._url, bodyText, amount)) {
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
            amount = extractNumber(bodyText) || lastClickInfo.domAmount;
            if (isBidRequest(url, bodyText, amount)) {
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
  // LOGICA PENTRU idp.bca-online-auctions.eu (PROXY BIDDING)
  // =========================================================
  if (location.hostname.includes("idp.bca-online-auctions.eu")) {
    dlog("[LOGGER] Mod Proxy Bidding activat pe", location.hostname);

    function extractIdpTitle() {
      try {
        const allElements = document.querySelectorAll("h1, h2, h3, h4, p, div, span, td, li");
        for (const el of allElements) {
          const text = el.textContent.trim();
          if (text.match(/\d{4}\s*[A-Za-z0-9\s\-]+(diesel|benzina|electric|hibrid|gasoleo)/i)) {
            if (text.length > 10 && text.length < 200) {
              return text;
            }
          }
        }
        for (const el of allElements) {
          const text = el.textContent.trim();
          if (text.includes("km") || text.includes("Km") || text.includes("KM")) {
            const match = text.match(/^([A-Za-z0-9\s\-]+(diesel|benzina|electric|hibrid|gasoleo))/i);
            if (match) return match[1].trim();
          }
        }
        return "Titlu indisponibil";
      } catch (e) {
        logError("extractIdpTitle:", e);
        return "Titlu indisponibil";
      }
    }

    function extractIdpMileage() {
      try {
        const allElements = document.querySelectorAll("h1, h2, h3, h4, p, div, span, td, li");
        for (const el of allElements) {
          const text = el.textContent.trim();
          const match = text.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(km|Km|KM)/);
          if (match) {
            const km = match[1].replace(/[.,]/g, "");
            if (km && parseInt(km) > 1000) {
              return `${parseInt(km).toLocaleString()} km`;
            }
          }
        }
        return "N/A";
      } catch (e) {
        logError("extractIdpMileage:", e);
        return "N/A";
      }
    }

    function extractIdpRegistrationDate() {
      try {
        const allElements = document.querySelectorAll("h1, h2, h3, h4, p, div, span, td, li");
        for (const el of allElements) {
          const text = el.textContent.trim();
          const match = text.match(/\b(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})\b/);
          if (match) {
            return match[1];
          }
        }
        return "N/A";
      } catch (e) {
        logError("extractIdpRegistrationDate:", e);
        return "N/A";
      }
    }

    function extractIdpFuel() {
      try {
        const allElements = document.querySelectorAll("h1, h2, h3, h4, p, div, span, td, li");
        for (const el of allElements) {
          const text = el.textContent.trim().toLowerCase();
          if (text.includes("diesel") || text.includes("gasoleo")) return "Diesel";
          if (text.includes("benzina") || text.includes("gasolina")) return "Benzina";
          if (text.includes("electric") || text.includes("elétrico")) return "Electric";
          if (text.includes("hibrid") || text.includes("híbrido")) return "Hybrid";
        }
        return "N/A";
      } catch (e) {
        logError("extractIdpFuel:", e);
        return "N/A";
      }
    }

    function extractIdpImage() {
      try {
        const img = document.querySelector(".ImageA img, .vehicle-image img, .lot-image img, img[src*='VehicleImage']");
        if (img && img.src) return img.src;
        const anyImg = document.querySelector("img[width='320'], img[width='300']");
        if (anyImg && anyImg.src) return anyImg.src;
        return null;
      } catch (e) {
        logError("extractIdpImage:", e);
        return null;
      }
    }

    function extractIdpLotNumber() {
      try {
        const lotEl = document.getElementById("proxyLotNumber");
        if (lotEl) {
          const text = lotEl.textContent.trim();
          const match = text.match(/\d+/);
          if (match) return match[0];
        }
        return "N/A";
      } catch (e) {
        return "N/A";
      }
    }

    function buildIdpPayload(amount, sourceTag) {
      return {
        client_id: CLIENT_ID,
        item_link: location.href,
        item_title: extractIdpTitle(),
        bid_amount: amount,
        currency: "EUR",
        timestamp: timestamp(),
        source: sourceTag,
        host: location.hostname,
        image_url: extractIdpImage(),
        mileage: extractIdpMileage(),
        registration_date: extractIdpRegistrationDate(),
        fuel: extractIdpFuel(),
        gearbox: "N/A",
        lot_number: extractIdpLotNumber(),
      };
    }

    document.addEventListener("click", function (e) {
      try {
        let btn = e.target.closest("#proxyBidButton a, #proxyBidButton, .PrimaryButton a, .PrimaryButton");
        if (!btn) {
          if (e.target.textContent && e.target.textContent.trim() === "Trimite") {
            btn = e.target;
          }
        }
        if (!btn) return;

        const input = document.getElementById("proxyBidValue");
        if (!input) {
          dlog("[LOGGER] Nu am găsit inputul #proxyBidValue");
          return;
        }

        const amount = extractNumber(input.value);
        if (!amount) {
          dlog("[LOGGER] Suma invalidă:", input.value);
          return;
        }

        dlog("[LOGGER] Proxy Bid detectat! Suma:", amount);

        const payload = buildIdpPayload(amount, "idp-proxy-bid");
        sendToServer(payload);

      } catch (err) {
        logError("Idp click handler:", err);
      }
    });

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
            (this._url.includes('proxy') || this._url.includes('bid') || this._url.includes('offer'))
          ) {
            dlog("[LOGGER] Interceptat request proxy bid:", this._url);

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

            if (bodyText) {
              const numbers = bodyText.match(/\d{2,}/g);
              if (numbers) {
                for (let num of numbers) {
                  const val = parseInt(num);
                  if (val > 10 && val < 500000) {
                    amount = val;
                    dlog("[LOGGER] Suma extrasă din request body:", amount);
                    break;
                  }
                }
              }
            }

            if (amount) {
              const payload = buildIdpPayload(amount, "idp-xhr-bid");
              sendToServer(payload);
            }
          }
        } catch (e) {
          logError("Idp XHR interceptor:", e);
        }
        return origSend.apply(this, arguments);
      };
    })();

    dlog("[LOGGER] Proxy Bidding activat pentru idp.bca-online-auctions.eu");
  }

  // =========================================================
  // PORNIRE
  // =========================================================
  if (!isAllowedHost()) {
    dlog("[LOGGER] Host nepermis:", location.hostname);
    return;
  }

  dlog("[LOGGER] v" + VERSION + " activ pe", location.hostname, "client:", CLIENT_ID, DEBUG ? "(debug ON)" : "");

})();
