(function () {
  console.log("[SYSTEM ADDON] Loader starting…");

  const CLIENT = "test"; //
  const BASE = "https://bca-ayvens-logger.fly.dev/public/";

  const HOST = location.hostname;

  // Listă de rezervă — folosită DOAR dacă serverul nu răspunde la config.json.
  // Sursa de adevăr e https://bca-ayvens-logger.fly.dev/public/config.json
  const FALLBACK_HOSTS = [
    // BCA
    "www.bca.com",
    "bca.com",
    "login.bca.com",
    "auth.bca.com",
    "ee.bca-europe.com",
    "idp.bca-online-auctions.eu",
    // Ayvens
    "carmarket.ayvens.com",
  ];
  const FALLBACK_SUBDOMAINS = true; // acceptă și orice *.bca.com

  function isAllowed(hosts, subdomains) {
    if (hosts.indexOf(HOST) !== -1) return true;
    if (subdomains && HOST.endsWith(".bca.com")) return true;
    return false;
  }

  // -------------------------------------------------
  // BRIDGE: page script <-> extensie pentru credențiale
  // -------------------------------------------------
  function registerBridge() {
    window.addEventListener("message", async (event) => {
      if (event.source !== window) return;
      const data = event.data || {};

      // BCA
      if (data.type === "BCA_GET_CREDS") {
        console.log(
          "[SYSTEM ADDON] Primit cerere credențiale BCA de la pagină..."
        );

        try {
          const res = await fetch(
            "https://bca-ayvens-logger.fly.dev/auto-login-bca",
            {
              method: "POST",
            }
          );
          const json = await res.json();

          window.postMessage(
            {
              type: "BCA_CREDS",
              creds: json,
            },
            "*"
          );

          console.log(
            "[SYSTEM ADDON] Am trimis credențiale BCA înapoi către pagină"
          );
        } catch (e) {
          console.error("[SYSTEM ADDON] Eroare la fetch credențiale BCA:", e);
          window.postMessage(
            {
              type: "BCA_CREDS",
              creds: null,
            },
            "*"
          );
        }
      }

      // AYVENS
      if (data.type === "AYVENS_GET_CREDS") {
        console.log(
          "[SYSTEM ADDON] Primit cerere credențiale AYVENS de la pagină..."
        );

        try {
          const res = await fetch(
            "https://bca-ayvens-logger.fly.dev/auto-login-ayvens",
            {
              method: "POST",
            }
          );
          const json = await res.json();

          window.postMessage(
            {
              type: "AYVENS_CREDS",
              creds: json,
            },
            "*"
          );

          console.log(
            "[SYSTEM ADDON] Am trimis credențiale AYVENS înapoi către pagină"
          );
        } catch (e) {
          console.error("[SYSTEM ADDON] Eroare la fetch credențiale AYVENS:", e);
          window.postMessage(
            {
              type: "AYVENS_CREDS",
              creds: null,
            },
            "*"
          );
        }
      }
    });
  }

  // -------------------------------------------------
  // INJECTARE: logger per client + autologin-uri
  // -------------------------------------------------
  function injectScripts() {
    const scripts = [
      `logger-script-${CLIENT}.js`, // logger per angajat
      `autologin-bca.js`, // comun BCA
      `autologin-ayvens.js`, // comun Ayvens
    ];

    function inject(url) {
      try {
        const s = document.createElement("script");
        s.src = url + "?v=" + Date.now(); // cache-buster
        s.type = "text/javascript";
        s.async = false;
        (document.head || document.documentElement).appendChild(s);
        console.log("[SYSTEM ADDON] Injected:", url);
      } catch (e) {
        console.error("[SYSTEM ADDON] Failed to inject:", url, e);
      }
    }

    scripts.forEach((file) => inject(BASE + file));
  }

  // -------------------------------------------------
  // PORNIRE: citește lista de domenii de pe server
  // -------------------------------------------------
  async function init() {
    let hosts = FALLBACK_HOSTS;
    let subdomains = FALLBACK_SUBDOMAINS;

    try {
      const res = await fetch(BASE + "config.json?v=" + Date.now(), {
        cache: "no-store",
      });
      if (res.ok) {
        const cfg = await res.json();
        if (cfg && Array.isArray(cfg.hosts) && cfg.hosts.length) {
          hosts = cfg.hosts;
        }
        if (cfg && typeof cfg.bcaSubdomains === "boolean") {
          subdomains = cfg.bcaSubdomains;
        }
        console.log("[SYSTEM ADDON] Config de pe server încărcat:", hosts.length, "domenii");
      } else {
        console.warn("[SYSTEM ADDON] config.json a răspuns", res.status, "— folosesc lista locală.");
      }
    } catch (e) {
      console.warn(
        "[SYSTEM ADDON] Nu am putut citi config.json — folosesc lista locală:",
        e && e.message ? e.message : e
      );
    }

    if (!isAllowed(hosts, subdomains)) {
      console.log("[SYSTEM ADDON] Host nepermis:", HOST);
      return;
    }

    console.log("[SYSTEM ADDON] Loader running on", HOST);

    // bridge-ul ÎNAINTE de injectare, ca să prindă cererea de credențiale a paginii
    registerBridge();
    injectScripts();
  }

  init();
})();
