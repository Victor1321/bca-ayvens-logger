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
  // ATENTIE: endpointul API, NU fisierul .js
  const SERVER_URL = "https://bca-ayvens.up.railway.app/receive-bid";
  const CLIENT_ID = "Marian";

  // cuvinte care apar de obicei in butoane / request cand licitezi
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
  ];

  const ALLOWED_HOSTS = [
    "ee.bca-europe.com",
    "idp.bca-online-auctions.eu",
    "carmarket.ayvens.com",
  ];

  // fereastra de timp in care legam un click de request
  const CLICK_WINDOW_MS = 5000;
  // cooldown foarte simplu pentru a nu trimite spam
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

  function log() {
    const args = Array.prototype.slice.call(arguments);
    args.unshift("[LOGGER]");
    console.log.apply(console, args);
  }

  function textContainsKeyword(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return BID_KEYWORDS.some((k) => lower.includes(k));
  }

  // extrage un numar in format european (1.234,56)
  function extractNumberEU(text) {
    if (!text) return null;
    text = String(text).replace(/[^0-9.,]/g, "");
    if (!text) return null;

    // scoatem punctele de mii, lasam virgula ca separator zecimal
    const std = text.replace(/\./g, "").replace(",", ".");
    const nr = parseFloat(std);
    if (isNaN(nr)) return null;

    // praguri simple ca sa evitam numere mici gen "2024" din alt context
    if (nr < 100 || nr > 500000) return null;
    return nr;
  }

  function findValueInInputs() {
    try {
      const inputs = document.querySelectorAll(
        "input[type='text'], input[type='number']"
      );
      for (const inp of inputs) {
        if (!inp.offsetParent) continue;
        const nr = extractNumberEU(inp.value);
        if (nr) return nr;
      }
    } catch (e) {
      log("Eroare findValueInInputs:", e);
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
        (btn && btn.closest("form, article, section, div")) || document.body;
      const nums = [];
      area.querySelectorAll("*").forEach((el) => {
        if (!el.offsetParent) return;
        const nr = findNumberInText(el);
        if (nr) nums.push(nr);
      });
      return nums.length ? Math.max(...nums) : null;
    } catch (e) {
      log("Eroare scanNearbyForNumber:", e);
      return null;
    }
  }

  // --------------------------
  // Titlu Ayvens + BCA
  // --------------------------
  function extractItemTitle(btn) {
    try {
      const host = location.hostname;

      // --- Ayvens ---
      if (host.includes("ayvens")) {
        const card = btn
          ? btn.closest("article, .vehicle, .listing-item, .offer-item, .card")
          : document.querySelector(
              "article, .vehicle, .listing-item, .offer-item, .card"
            );

        if (card) {
          const h2 = card.querySelector("h2.vehicle-title");
          const make = card.querySelector("p.vehicle-make");

          const t1 =
            h2 && h2.childNodes[2]
              ? String(h2.childNodes[2].textContent || "").trim()
              : h2
              ? String(h2.textContent || "").trim()
              : "";
          const t2 = make ? String(make.textContent || "").trim() : "";

          const full = [t1, t2].filter(Boolean).join(" ");
          if (full) return full;
        }

        // fallback pe pagina de detaliu
        const hAy = document.querySelector("h1, h2");
        if (hAy && hAy.textContent.trim()) return hAy.textContent.trim();
      }

      // --- BCA (ee.bca-europe.com, idp.bca-online-auctions.eu) ---
      if (
        host.includes("bca-europe.com") ||
        host.includes("bca-online-auctions.eu") ||
        host.endsWith("bca.com")
      ) {
        // 1) Intai cautam un card in jurul butonului (lista de masini)
        if (btn) {
          const card = btn.closest(
            ".viewlot, .lot, .auction-tile, .VehicleListItem, article, section, div"
          );
          if (card) {
            const hCard = card.querySelector(
              "h2.viewlot_headline.viewlot_headline--large, " +
                "h2.viewlot__headline, h2, h3, a"
            );
            if (hCard && hCard.textContent.trim()) {
              return hCard.textContent.trim();
            }
          }
        }

        // 2) Pagina de detaliu lot: heading-ul principal
        const hLot = document.querySelector(
          "h2.viewlot_headline.viewlot_headline--large, " +
            "h1.viewlot_headline.viewlot_headline--large, " +
            "h2.viewlot_headline, h1.viewlot_headline"
        );
        if (hLot && hLot.textContent.trim()) {
          return hLot.textContent.trim();
        }
      }

      // --- fallback global ---
      const h = document.querySelector("h1, h2");
      return (h && h.innerText.trim()) || "Titlu indisponibil";
    } catch (e) {
      log("Eroare extractItemTitle:", e);
      return "Titlu indisponibil";
    }
  }

  // --------------------------
  // Imagine – BCA + Ayvens
  // --------------------------
  function extractImageUrl(btn) {
    try {
      const host = location.hostname;

      // --- Ayvens ---
      if (host.includes("ayvens")) {
        // Incercam imaginea din cardul de unde s-a dat click
        if (btn) {
          const card = btn.closest(
            "article, .vehicle, .listing-item, .offer-item, .card"
          );
          if (card) {
            let img = card.querySelector(".vehicle-picture img, img");
            if (img && img.src) return img.src;
          }
        }

        // fallback: imaginea principala de pe pagina
        let img = document.querySelector(".vehicle-picture img");
        if (img && img.src) return img.src;

        img = document.querySelector(
          "img.img-fluid, img[alt*='Ayvens'], img[alt*='Cumpara']"
        );
        if (img && img.src) return img.src;
      }

      // --- BCA ---
      if (
        host.includes("bca-europe.com") ||
        host.includes("bca-online-auctions.eu") ||
        host.endsWith("bca.com")
      ) {
        // Daca suntem intr-o lista de masini, luam imaginea din jurul butonului
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

        // Pe pagina de detaliu lot:
        let img = document.querySelector(".viewlot__img img.MainImg");
        if (img && img.src) return img.src;

        img = document.querySelector(".ImageA img");
        if (img && img.src) return img.src;
      }

      // fallback general
      const anyImg = document.querySelector("img");
      if (anyImg && anyImg.src) return anyImg.src;
    } catch (e) {
      log("Eroare extractImageUrl:", e);
    }
    return null;
  }

  // --------------------------
  // Timestamp local GMT+2 (hardcodat)
  // --------------------------
  function timestamp() {
    const d = new Date(Date.now() + 2 * 3600000);
    return d.toISOString().replace("T", " ").replace("Z", "");
  }

  // --------------------------
  // Dedup foarte simplu (cooldown)
  // --------------------------
  function shouldSend(amount, url) {
    const t = now();
    if (
      lastSent.amount === amount &&
      lastSent.url === url &&
      t - lastSent.time < DEDUP_COOLDOWN_MS
    ) {
      log("Dedup: blocat mesaj duplicat (cooldown).");
      return false;
    }
    lastSent.time = t;
    lastSent.amount = amount;
    lastSent.url = url;
    return true;
  }

  // --------------------------
  // Payload Builder
  // --------------------------
  function buildPayload(amount, sourceTag, btn) {
    // Link special pentru Ayvens – ii trimitem mereu pagina de live
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
  // Send to server
  // --------------------------
  function sendToServer(data) {
    if (
      !data ||
      typeof data.bid_amount === "undefined" ||
      data.bid_amount === null
    )
      return;

    if (!shouldSend(data.bid_amount, data.item_link)) return;

    log("Trimit la server payload:", data);

    fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then((res) => {
        log("Raspuns server status:", res.status);
      })
      .catch((err) => {
        console.error("[LOGGER] Eroare send:", err);
      });
  }

  // =========================================================
  // START – Script activ doar pe hosturi permise
  // =========================================================
  log("Script logger incarcat pe host:", location.hostname);

  if (!isAllowedHost()) {
    log("Host nepermis, ies:", location.hostname);
    return;
  }

  log("Host permis, logger activat.");

  // --------------------------
  // CLICK detector (doar pentru a lega butonul de bid)
  // --------------------------
  document.addEventListener("click", function (e) {
    try {
      const btn =
        e.target && e.target.closest("button, a, input[type='submit']");
      if (!btn) return;

      const txt = (btn.innerText || btn.value || "").trim();
      log("Click detectat pe element cu text:", txt);

      if (!textContainsKeyword(txt)) {
        log("Textul butonului NU contine keyword de bid, ignor.");
        return;
      }

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

      log("Click marcat ca posibil BID. Suma detectata din DOM:", amount);
    } catch (err) {
      console.error("[LOGGER] Eroare in handlerul de click:", err);
    }
  });

  // --------------------------
  // Request Interceptor – FETCH
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
      this._method = m;
      return O.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        handleRequest(this._url, body, "xhr", this._method);
      } catch (err) {
        console.error("[LOGGER] Eroare interceptare XHR:", err);
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

      // urmarim in principal POST/PUT/PATCH (actiuni)
      if (method !== "POST" && method !== "PUT" && method !== "PATCH") {
        return;
      }

      const sinceClick = lastClickInfo ? now() - lastClickInfo.time : null;
      if (!lastClickInfo || sinceClick > CLICK_WINDOW_MS) {
        // fara click recent marcat ca BID, nu ne bagam
        return;
      }

      // preluam body-ul ca text
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

      log("Request detectat ca posibil BID:", {
        tag: tag,
        method: method,
        url: url,
      });

      let amount = null;

      // 1) Incercam din body JSON
      if (bodyText && bodyText.trim().startsWith("{")) {
        try {
          const json = JSON.parse(bodyText);
          amount = extractNumberEU(JSON.stringify(json));
        } catch {}
      }

      // 2) Daca nu, din body text simplu
      if (!amount && bodyText) {
        amount = extractNumberEU(bodyText);
      }

      // 3) Daca nu, din DOM (ce am salvat la click)
      if (!amount && lastClickInfo && lastClickInfo.domAmount) {
        amount = lastClickInfo.domAmount;
      }

      if (!amount) {
        log("Nu am gasit nicio suma valida in request/body/DOM, nu trimit.");
        return;
      }

      const payload = buildPayload(
        amount,
        "req-" + tag,
        lastClickInfo && lastClickInfo.btn
      );
      sendToServer(payload);

      lastClickInfo.sent = true;
    } catch (err) {
      console.error("[LOGGER] Eroare in handleRequest:", err);
    }
  }
})();
