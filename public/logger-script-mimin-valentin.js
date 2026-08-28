// -------------------------------------------------------------
// LOGGER-SCRIPT - VERSIUNEA COMPLETĂ (BCA + AYVENS)
// -------------------------------------------------------------
(function () {
  "use strict";

  const SERVER_URL = "https://bca-ayvens-logger.fly.dev/receive-bid";
  const CLIENT_ID = "mimin-valentin"; // Schimbă după nevoie
  const VERSION = "3.2.4";

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

  // ----- XBID / IDP: extragere sumă robustă (fără concatenarea cifrelor din body) -----
  function scanAmount(text) {
    if (!text) return null;
    const matches = String(text).match(/\d+(?:[.,]\d{1,3})?/g);
    if (!matches) return null;
    for (const raw of matches) {
      const nr = parseFloat(raw.replace(/\./g, "").replace(",", "."));
      if (!isNaN(nr) && nr >= 1 && nr <= 500000) return nr;
    }
    return null;
  }

  // sumă din câmpuri JSON explicite (amount/price/bid/offer/...), fără plafon de 500k
  function parseAmountFromJson(bodyText) {
    if (!bodyText) return null;
    let obj = null;
    try { obj = JSON.parse(bodyText); } catch (e) {
      try { obj = JSON.parse(JSON.stringify(bodyText)); } catch (e2) { return null; }
    }
    if (!obj || typeof obj !== "object") return null;
    const keys = ["amount", "price", "bid", "offer", "value", "maxbid", "proxybid"];
    const found = [];
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (keys.some((key) => String(k).toLowerCase().includes(key))) {
          found.push(v);
        } else if (v && typeof v === "object") {
          walk(v);
        }
      }
    };
    walk(obj);
    for (const v of found) {
      if (v === null || v === undefined || v === "") continue;
      const num = parseFloat(String(v).replace(/[^0-9.,-]/g, "").replace(/\./g, "").replace(",", "."));
      if (!isNaN(num) && num >= 1) return num;
    }
    return null;
  }

  // mesaj WebSocket BCA IDP: {"T":"1","p":880000,"lI":11422628} — p = suma în cenți.
  // Relaxat (v3.2.4): orice mesaj cu câmp numeric `p` (sau `b.p`) e tratat ca bid.
  function parseWsBidMessage(text) {
    try {
      const obj = JSON.parse(text);
      if (obj) {
        const cents = obj.p !== undefined ? Number(obj.p) : (obj.b && obj.b.p !== undefined ? Number(obj.b.p) : NaN);
        if (isFinite(cents) && cents > 0) {
          const amount = cents / 100;
          if (amount >= 1 && amount <= 500000) {
            return { amount, lot: obj.lI !== undefined ? obj.lI : (obj.b && obj.b.lI) || null };
          }
        }
      }
    } catch (e) {}
    return null;
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

  // ----- PAYLOAD DEDICAT XBID (ee.bca-europe.com/rt/bidsession) -----
  function buildXbidPayload(btn, amount, sourceTag) {
    let panel = null;
    try { if (btn && btn.closest) panel = btn.closest("bid-session, .listing--xbidpanel, .listing--xbid"); } catch (e) {}

    let reg = "";
    if (btn && btn.id) {
      const m = btn.id.match(/(\d+)_bidButton/);
      if (m) reg = m[1];
    }
    if (!reg && panel) {
      const el = panel.querySelector(".listing__value[id]");
      if (el) reg = el.id;
    }
    if (!reg && panel) {
      const el = panel.querySelector(".listing__value");
      if (el) reg = el.textContent.trim();
    }

    let title = "Titlu indisponibil";
    let link = location.href;
    let details = "";
    let imageUrl = null;
    if (panel) {
      try {
        const t = panel.querySelector(".listing__title, h3.listing__title");
        if (t) title = t.textContent.trim();
        const a = panel.querySelector('a[href*="ViewLot"]');
        if (a && a.href) link = a.href;
        const d = panel.querySelector(".listing__details");
        if (d) details = d.textContent || "";
        const img = panel.querySelector("img.listing__image, img[id^='image_']");
        if (img && img.src) imageUrl = img.src;
      } catch (e) {}
    }

    const kmM = details.match(/([\d.,]+)\s*km/i);
    const dateM = details.match(/\b(\d{2}[\/.]\d{2}[\/.]\d{4})\b/);
    const fuelM = details.match(/(Diesel|Petrol|PHEV|Electric|Hybrid|Benzin[aă]?|Gasolina|Gasoleo)/i);

    const key = (reg || "xbid") + "|" + (amount || "");
    return {
      client_id: CLIENT_ID,
      item_link: link,
      item_title: title,
      bid_amount: amount,
      currency: "EUR",
      timestamp: timestamp(),
      source: sourceTag || "xbid-bid",
      host: location.hostname,
      image_url: imageUrl,
      mileage: kmM ? kmM[1].trim() + " km" : "N/A",
      registration_date: dateM ? dateM[1] : "N/A",
      fuel: fuelM ? fuelM[1] : "N/A",
      gearbox: "N/A",
      lot_number: reg || "N/A",
      _dedup_key: key,
    };
  }

  // ----- TIMESTAMP -----
  function timestamp() {
    return new Date().toISOString(); // UTC — serverul afișează în Europe/Bucharest
  }

  // ----- DEDUP -----
  function shouldSend(amount, url, key) {
    const t = now();
    const k = key || url;
    if (lastSent.amount === amount && lastSent.url === k && t - lastSent.time < DEDUP_COOLDOWN_MS) {
      return false;
    }
    lastSent.time = t;
    lastSent.amount = amount;
    lastSent.url = k;
    return true;
  }

  // ----- BUILD PAYLOAD (pentru BCA și Ayvens) -----
  function buildPayload(amount, sourceTag, btn) {
    const host = location.hostname;
    // XBid (ee.bca-europe.com/rt/bidsession) — UI dedicat, payload propriu
    if (host.includes("bca-europe.com") && location.pathname.indexOf("/rt/") === 0) {
      return buildXbidPayload(btn, amount, sourceTag || "xbid-bid");
    }
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
  function sendToServer(data, dedupKey) {
    if (!data || typeof data.bid_amount === "undefined" || data.bid_amount === null) return;
    if (!shouldSend(data.bid_amount, data.item_link, dedupKey || data._dedup_key)) return;
    const payload = Object.assign({}, data);
    delete payload._dedup_key;
    logSend(payload);
    console.log("[BID] trimis " + CLIENT_ID + " | " + payload.bid_amount + " " + (payload.currency || "EUR") + " | " + (payload.source || "?") + " | " + (payload.host || ""));
    fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
      // IDP are propriul handler dedicat (butoane + casetă max-bid + WebSocket)
      if (location.hostname.includes("idp.bca-online-auctions.eu")) return;
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
      // fallback XBid: suma e chiar în textul butonului (ex. "25.200 €")
      if (!amount && btn) {
        const btnTxt = (btn.innerText || btn.value || "").trim();
        if (btnTxt && /\d/.test(btnTxt)) {
          const nr = extractNumber(btnTxt);
          if (nr) amount = nr;
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
          // IDP are propriile interceptoare (casetă + WebSocket)
          if (location.hostname.includes("idp.bca-online-auctions.eu")) return origSend.apply(this, arguments);

          let bodyText = "";
          if (typeof body === "string") bodyText = body;
          else if (body instanceof FormData) {
            const arr = [];
            body.forEach((v, k) => arr.push(k + "=" + v));
            bodyText = arr.join("&");
          } else if (body && typeof body === "object") {
            try { bodyText = JSON.stringify(body); } catch (e) {}
          }

          const sinceClick = lastClickInfo ? now() - lastClickInfo.time : null;
          const withinClick = lastClickInfo && sinceClick <= CLICK_WINDOW_MS;
          // URL-uri hard de bid (XBid: /rt/api/Bid) → trimitem chiar și fără click recent
          const hardBidUrl = /\/rt\/api\/bid|\/api\/bid|\/bid\b|\/proxy/i.test(this._url);

          if (withinClick || hardBidUrl) {
            if (isBidRequest(this._url, bodyText, null) || hardBidUrl) {
              let amount =
                (withinClick && lastClickInfo && lastClickInfo.domAmount) ||
                parseAmountFromJson(bodyText) ||
                scanAmount(bodyText) ||
                null;
              if (amount) {
                const payload = buildPayload(amount, "xhr-bid-bca", lastClickInfo ? lastClickInfo.btn : null);
                sendToServer(payload, payload._dedup_key);
                if (lastClickInfo) lastClickInfo.sent = true;
              } else {
                dlog("[LOGGER] Bid URL fără sumă în body (încearcă hook-ul pe răspuns):", this._url);
              }
            }
          }

          // hook pe răspuns (doar URL-uri hard de bid): suma CONFIRMATĂ de server
          if (hardBidUrl) {
            const xhr = this;
            this.addEventListener("load", function () {
              try {
                const respText = xhr.responseText || "";
                const amt = parseAmountFromJson(respText);
                if (!amt) return;
                const payload = buildPayload(amt, "xhr-bid-response", lastClickInfo ? lastClickInfo.btn : null);
                sendToServer(payload, payload._dedup_key);
              } catch (e) {}
            });
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
          // IDP are propriile interceptoare
          if (location.hostname.includes("idp.bca-online-auctions.eu")) return origFetch.apply(this, arguments);

          let bodyText = "";
          if (typeof body === "string") bodyText = body;
          else if (body && typeof body === "object") {
            try { bodyText = JSON.stringify(body); } catch (e) {}
          }

          const sinceClick = lastClickInfo ? now() - lastClickInfo.time : null;
          const withinClick = lastClickInfo && sinceClick <= CLICK_WINDOW_MS;
          const hardBidUrl = /\/rt\/api\/bid|\/api\/bid|\/bid\b|\/proxy/i.test(url);

          if (withinClick || hardBidUrl) {
            if (isBidRequest(url, bodyText, null) || hardBidUrl) {
              let amount =
                (withinClick && lastClickInfo && lastClickInfo.domAmount) ||
                parseAmountFromJson(bodyText) ||
                scanAmount(bodyText) ||
                null;
              if (amount) {
                const payload = buildPayload(amount, "fetch-bid-bca", lastClickInfo ? lastClickInfo.btn : null);
                sendToServer(payload, payload._dedup_key);
                if (lastClickInfo) lastClickInfo.sent = true;
              } else {
                dlog("[LOGGER] Bid URL fără sumă în body (fetch):", url);
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

    // ----- HOOK WEBSOCKET: bid-urile live merg pe WS {"T":"1","p":880000,"lI":...} -----
    (function () {
      try {
        const OrigWS = window.WebSocket;
        if (!OrigWS || !OrigWS.prototype || !OrigWS.prototype.send) return;
        const sendOrig = OrigWS.prototype.send;
        OrigWS.prototype.send = function (data) {
          try {
            const text = (typeof data === "string") ? data : String(data);
            // vizibilitate permanentă: vezi tot ce trimite pagina pe WS (doar pe IDP)
            if (location.hostname.includes("idp.bca-online-auctions.eu")) {
              const parsed = parseWsBidMessage(text);
              if (parsed && parsed.amount) {
                console.log("[IDP] WS send = bid detectat, suma:", parsed.amount, "lot:", parsed.lot, "|", text.slice(0, 150));
                dlog("[LOGGER] WS bid detectat:", parsed);
                const payload = buildIdpPayload(parsed.amount, "ws-bid-idp");
                if (parsed.lot != null) payload.lot_number = String(parsed.lot);
                payload._dedup_key = payload.lot_number + "|" + parsed.amount;
                sendToServer(payload, payload._dedup_key);
              } else {
                console.log("[IDP] WS send (fără sumă):", text.slice(0, 150));
              }
            }
          } catch (e) {
            logError("WS send hook:", e);
          }
          return sendOrig.apply(this, arguments);
        };
        console.log("[BID-LOGGER] WS hook activ");
        dlog("[LOGGER] WebSocket hook instalat pe idp.");
      } catch (e) {
        logError("WS hook install:", e);
      }
    })();

    // ----- HOOK WS INTRATE (vizibilitate): mesaje de bid T:31/T:1 cu p în cenți -----
    (function () {
      try {
        const OrigWS = window.WebSocket;
        if (!OrigWS || !OrigWS.prototype || !OrigWS.prototype.addEventListener) return;
        const aeOrig = OrigWS.prototype.addEventListener;
        const rmOrig = OrigWS.prototype.removeEventListener;
        const wrapMap = new WeakMap();
        OrigWS.prototype.addEventListener = function (type, fn, opts) {
          if (type === "message" && location.hostname.includes("idp.bca-online-auctions.eu")) {
            let wrapped = wrapMap.get(fn);
            if (!wrapped) {
              wrapped = function (ev) {
                try {
                  const text = (ev && ev.data && typeof ev.data === "string") ? ev.data : "";
                  if (text) {
                    const obj = JSON.parse(text);
                    if (obj) {
                      const cents = obj.p !== undefined ? Number(obj.p) : (obj.b && obj.b.p !== undefined ? Number(obj.b.p) : NaN);
                      if (isFinite(cents) && cents > 0) {
                        console.log("[IDP] WS in p=" + (cents / 100) + " lot=" + (obj.lI !== undefined ? obj.lI : (obj.b && obj.b.lI) || "?") + " | " + text.slice(0, 150));
                      }
                    }
                  }
                } catch (e) {}
                return fn.apply(this, arguments);
              };
              wrapMap.set(fn, wrapped);
            }
            return aeOrig.call(this, type, wrapped, opts);
          }
          return aeOrig.apply(this, arguments);
        };
        OrigWS.prototype.removeEventListener = function (type, fn, opts) {
          if (type === "message" && wrapMap.has(fn)) {
            return rmOrig.call(this, type, wrapMap.get(fn), opts);
          }
          return rmOrig.apply(this, arguments);
        };
        console.log("[BID-LOGGER] WS in-hook activ");
      } catch (e) {
        logError("WS in-hook install:", e);
      }
    })();

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
      const lot = extractIdpLotNumber();
      const p = {
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
        lot_number: lot,
      };
      p._dedup_key = (lot || "idp") + "|" + amount;
      return p;
    }

    // ultimul click "de bid" pe IDP — folosit ca fallback dacă site-ul nu face un request prins
    let lastIdpClick = null;

    document.addEventListener("click", function (e) {
      try {
        const target = e.target;
        const btn = target.closest ? target.closest("button, a, input[type='submit'], input[type='button'], [role='button'], [class*='btn' i]") : null;
        if (!btn) return;

        const txt = (btn.innerText || btn.value || "").trim();
        const idAttr = (btn.id || "") + " " + (btn.getAttribute ? (btn.getAttribute("class") || "") : "");

        // butoane rapide +50/+100/+200, Trimite/Submit, proxyBid, sau orice buton cu text de bid
        const plusBtn = /^[+]\s*\d/.test(txt);
        const bidWordBtn = /trimite|submit|send|plaseaz|ofer|place|bid|proxy|licit/i.test(txt + " " + idAttr);
        if (!plusBtn && !bidWordBtn) return;

        const hint = extractNumber(txt) || null; // "+50" → 50

        lastIdpClick = { time: now(), sent: false, hint: hint };
        console.log("[IDP] click bid: '" + (txt || btn.id || btn.tagName) + "' hint:", hint);

        // dacă în ~1s interceptorul de rețea nu a trimis deja, trimitem fallback cu valoarea input-ului
        setTimeout(() => {
          try {
            if (!lastIdpClick || lastIdpClick.sent) return;
            if (now() - lastIdpClick.time > 3000) return;
            let amount = amountFromBidInput();
            if (!amount) amount = lastIdpClick.hint;
            if (!amount) return;
            console.log("[IDP] click fallback: buton '" + (txt || btn.id || btn.tagName) + "' suma:", amount);
            const payload = buildIdpPayload(amount, "idp-click-fallback");
            sendToServer(payload, payload._dedup_key);
            lastIdpClick.sent = true;
          } catch (err2) {
            logError("Idp click fallback:", err2);
          }
        }, 900);
      } catch (err) {
        logError("Idp click handler:", err);
      }
    });

    // Enter în caseta max-bid = același flow ca click pe „Trimite”.
    // v3.2.4: dacă nu există #proxyBidValue, acceptăm orice input de bid (cu € sau în panoul de bid).
    document.addEventListener("keydown", function (e) {
      try {
        if (e.key !== "Enter") return;
        const t = e.target;
        if (!t || t.tagName !== "INPUT") return;
        const isBidInput = t.id === "proxyBidValue" || (t.value && String(t.value).includes("€")) || (t.closest && t.closest("[class*='bid' i], [id*='proxy' i], form"));
        if (!isBidInput) return;
        const amount = extractNumber(t.value);
        if (!amount) return;
        const payload = buildIdpPayload(amount, "idp-proxy-bid");
        sendToServer(payload, payload._dedup_key);
      } catch (err) {
        logError("Idp Enter handler:", err);
      }
    });

    // Sursa de adevăr: confirmarea/refuzul scris de server în #proxyResult / #proxyError
    (function observeProxyResult() {
      const res = document.getElementById("proxyResult");
      const errEl = document.getElementById("proxyError");
      const target = res || errEl;
      if (!target || typeof MutationObserver === "undefined") return;
      const obs = new MutationObserver(function () {
        try {
          const resText = (res && res.textContent) ? res.textContent.trim() : "";
          const errText = (errEl && errEl.textContent) ? errEl.textContent.trim() : "";
          if (errText) {
            dlog("[LOGGER] Max-bid refuzat/nevalid:", errText);
            return;
          }
          if (resText) {
            const input = document.getElementById("proxyBidValue");
            const amt = scanAmount(resText) || (input ? extractNumber(input.value) : null);
            if (amt) {
              const payload = buildIdpPayload(amt, "idp-proxy-confirm");
              sendToServer(payload, payload._dedup_key);
            }
          }
        } catch (e) {}
      });
      obs.observe(target, { childList: true, subtree: true, characterData: true });
    })();

    // ----- HELPERS partajate XHR/FETCH (nivel de bloc IDP) -----
    // zgomot de telemetrie — sigur NU sunt bid-uri
    const IDP_NOISE_RE = /rb_bf00386tfp|2o7\.net|visualstudio|piwik|t-log\.|dynatrace|rum\//i;

    function bodyTextOf(b) {
      if (typeof b === "string") return b;
      if (b instanceof FormData) {
        const arr = [];
        b.forEach((v, k) => arr.push(k + "=" + v));
        return arr.join("&");
      }
      if (b instanceof URLSearchParams) return b.toString();
      if (b && typeof b === "object") {
        try { return JSON.stringify(b); } catch (e) {}
      }
      return "";
    }

    // sumă din parametrii URL (ex. ?bidValue=200&lotid=...)
    function amountFromUrl(u) {
      try {
        const m = String(u).match(/[?&](?:bidvalue|bidamount|proxybid|maxbid|amount|price|value|bid)=([\d.,]+)/i);
        if (m) {
          const n = parseFloat(String(m[1]).replace(/\./g, "").replace(",", "."));
          if (!isNaN(n) && n >= 1 && n <= 500000) return n;
        }
      } catch (e) {}
      return null;
    }

    // sumă din body: câmp explicit (proxyBid=200 / amount=200 / JSON). NU scan generic — evită id-urile.
    function amountFromBody(bodyText) {
      if (!bodyText) return null;
      const pm = bodyText.match(/(?:proxybid|maxbid|bidamount|bidvalue|amount|price|value)\s*[:=]\s*"?([\d.,]+)/i);
      if (pm) {
        const n = parseFloat(String(pm[1]).replace(/\./g, "").replace(",", "."));
        if (!isNaN(n) && n >= 1 && n <= 500000) return n;
      }
      return parseAmountFromJson(bodyText) || null;
    }

    // sumă din input-ul de bid de pe pagină (preferă #proxyBidValue / input cu €)
    function amountFromBidInput() {
      const byId = document.getElementById("proxyBidValue");
      const inputs = byId ? [byId] : [];
      document.querySelectorAll("input[type='text'], input[type='number']").forEach((i) => { if (!inputs.includes(i)) inputs.push(i); });
      let fallback = null;
      for (const input of inputs) {
        if (!input || !input.value) continue;
        const v = String(input.value).trim();
        if (!v) continue;
        const n = extractNumber(v);
        if (!n) continue;
        if (byId === input || v.includes("€")) return n;
        if (!fallback) fallback = n;
      }
      return fallback; // orice input cu număr plauzibil — ultima șansă
    }

    // request-ul arată a bid? (ca să atârnăm hook-ul pe răspuns doar acolo)
    function isBidSignal(url, bodyText) {
      if (amountFromBody(bodyText)) return true;
      if (amountFromUrl(url)) return true;
      return /bid|proxy|offer|place|submit|auction/i.test((url || "") + " " + (bodyText || ""));
    }

    // ----- INTERCEPTOR XHR (IDP) — v3.2.4: orice POST pe IDP e interceptat (minus telemetrie);
    // ----- trimite dacă găsește o sumă plauzibilă (body → URL → input → răspunsul serverului)
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
          if (!location.hostname.includes("idp.bca-online-auctions.eu")) return origSend.apply(this, arguments);
          if (!this._method || this._method.toUpperCase() !== "POST" || !this._url) return origSend.apply(this, arguments);
          if (IDP_NOISE_RE.test(this._url)) return origSend.apply(this, arguments);

          const bodyText = bodyTextOf(body);
          const bidSignal = isBidSignal(this._url, bodyText);
          let amount = amountFromBody(bodyText) || amountFromUrl(this._url) || (bidSignal ? amountFromBidInput() : null);

          // linie PERMANENTĂ — vezi mereu în consolă ce a trimis pagina și ce am găsit
          console.log("[IDP] XHR POST:", this._url, "| semnal bid:", bidSignal, "| sumă:", amount, "| body:", (bodyText || "").slice(0, 200));

          const lotidMatch = String(this._url).match(/lotid=(\d+)/i) || bodyText.match(/["']?lotid["']?\s*[:=]\s*"?(\d+)/i);
          const lotid = lotidMatch ? lotidMatch[1] : null;

          if (amount) {
            const payload = buildIdpPayload(amount, "idp-xhr-bid");
            if (lotid) payload.lot_number = lotid;
            payload._dedup_key = (lotid || "idp") + "|" + amount;
            sendToServer(payload, payload._dedup_key);
            if (lastIdpClick && now() - lastIdpClick.time <= 3000) lastIdpClick.sent = true;
          } else if (bidSignal) {
            console.log("[IDP] bid fără sumă în request — aștept răspunsul:", this._url);
          }

          // hook pe răspuns: suma CONFIRMATĂ de server (doar pentru request-uri care arătau a bid)
          if (bidSignal) {
            const xhr = this;
            this.addEventListener("load", function () {
              try {
                const respText = xhr.responseText || "";
                const amt = parseAmountFromJson(respText) || scanAmount(respText);
                if (!amt || amt > 500000) return;
                const respLotidMatch = respText.match(/["']?lotid["']?\s*[:=]\s*"?(\d+)/i) || lotidMatch;
                const respLotid = respLotidMatch ? respLotidMatch[1] : null;
                const payload = buildIdpPayload(amt, "idp-xhr-response");
                if (respLotid) payload.lot_number = respLotid;
                payload._dedup_key = (respLotid || "idp") + "|" + amt;
                sendToServer(payload, payload._dedup_key);
                if (lastIdpClick && now() - lastIdpClick.time <= 3000) lastIdpClick.sent = true;
              } catch (e) {}
            });
          }
        } catch (e) {
          logError("Idp XHR interceptor:", e);
        }
        return origSend.apply(this, arguments);
      };
      console.log("[BID-LOGGER] XHR hook activ");
    })();

    // ----- INTERCEPTOR FETCH (IDP) — v3.2.4: orice POST pe IDP e interceptat (minus telemetrie) -----
    (function () {
      const origFetch = window.fetch;
      if (!origFetch) return;
      window.fetch = function (input, init) {
        try {
          if (!location.hostname.includes("idp.bca-online-auctions.eu")) return origFetch.apply(this, arguments);
          const url = typeof input === "string" ? input : (input && input.url) || "";
          const method = (init && init.method) || (input && input.method) || "GET";
          if (method.toUpperCase() !== "POST") return origFetch.apply(this, arguments);
          if (IDP_NOISE_RE.test(url)) return origFetch.apply(this, arguments);

          const body = (init && init.body) || (input && input.body) || null;
          const bodyText = bodyTextOf(body);
          const bidSignal = isBidSignal(url, bodyText);
          let amount = amountFromBody(bodyText) || amountFromUrl(url) || (bidSignal ? amountFromBidInput() : null);

          console.log("[IDP] FETCH POST:", url, "| semnal bid:", bidSignal, "| sumă:", amount, "| body:", (bodyText || "").slice(0, 200));

          const lotidMatch = String(url).match(/lotid=(\d+)/i) || bodyText.match(/["']?lotid["']?\s*[:=]\s*"?(\d+)/i);
          const lotid = lotidMatch ? lotidMatch[1] : null;

          if (amount) {
            const payload = buildIdpPayload(amount, "idp-fetch-bid");
            if (lotid) payload.lot_number = lotid;
            payload._dedup_key = (lotid || "idp") + "|" + amount;
            sendToServer(payload, payload._dedup_key);
            if (lastIdpClick && now() - lastIdpClick.time <= 3000) lastIdpClick.sent = true;
          } else if (bidSignal) {
            console.log("[IDP] bid fără sumă în request (fetch) — aștept răspunsul:", url);
          }

          const p = origFetch.apply(this, arguments);
          if (bidSignal) {
            p.then(function (res) {
              try {
                return res.clone().text().then(function (respText) {
                  const amt = parseAmountFromJson(respText) || scanAmount(respText);
                  if (!amt || amt > 500000) return;
                  const respLotidMatch = respText.match(/["']?lotid["']?\s*[:=]\s*"?(\d+)/i) || lotidMatch;
                  const respLotid = respLotidMatch ? respLotidMatch[1] : null;
                  const payload = buildIdpPayload(amt, "idp-fetch-response");
                  if (respLotid) payload.lot_number = respLotid;
                  payload._dedup_key = (respLotid || "idp") + "|" + amt;
                  sendToServer(payload, payload._dedup_key);
                  if (lastIdpClick && now() - lastIdpClick.time <= 3000) lastIdpClick.sent = true;
                });
              } catch (e) { return Promise.resolve(); }
            }).catch(function () {});
          }
          return p;
        } catch (e) {
          logError("Idp fetch interceptor:", e);
          return origFetch.apply(this, arguments);
        }
      };
      console.log("[BID-LOGGER] FETCH hook activ");
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
  console.log("[BID-LOGGER] v" + VERSION + " activ pe " + location.hostname + " client: " + CLIENT_ID + (DEBUG ? " (debug ON)" : ""));

})();
