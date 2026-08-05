// ============================================================
// AUTOLOGIN BCA (homepage + login.bca.com) — BRIDGE + OVERLAY
// ============================================================

(function () {
    "use strict";

    // ----- DEBUG: activ cu ?debug=1 în URL sau localStorage['autologin-debug']='1' -----
    const DEBUG = (function () {
        try { if (typeof localStorage !== "undefined" && localStorage.getItem("autologin-debug") === "1") return true; } catch (e) {}
        try { if (window.location && String(window.location.search).includes("debug=1")) return true; } catch (e) {}
        return false;
    })();
    const _origLog = console.log.bind(console);
    function dlog(...args) {
        if (DEBUG) _origLog("[AUTOLOGIN-BCA-DEBUG]", ...args);
    }

    // unde dăm click pe „Autentificare”
    const HOME_HOSTS = [
        "www.bca.com",
        "bca.com"
    ];

    // unde completăm user+parolă
    const LOGIN_HOSTS = [
        "login.bca.com"
    ];

    const HOST = location.hostname;

    // ---------------------------------------------------------
    // util: așteaptă un element în pagină
    // ---------------------------------------------------------
    function waitFor(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timer = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(timer);
                    resolve(el);
                    return;
                }
                if (Date.now() - start > timeout) {
                    clearInterval(timer);
                    reject("Timeout waiting for selector: " + selector);
                }
            }, 100);
        });
    }

    // ---------------------------------------------------------
    // Overlay full-screen "Se încarcă..."
    // ---------------------------------------------------------
    function showLoginOverlay() {
        if (document.getElementById("bca-autologin-overlay")) return;

        const style = document.createElement("style");
        style.textContent = `
        #bca-autologin-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 1);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-family: Arial, sans-serif;
            flex-direction: column;
        }
        #bca-autologin-spinner {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 5px solid #fff;
            border-top-color: transparent;
            animation: bca-spin 0.8s linear infinite;
            margin-bottom: 16px;
        }
        #bca-autologin-text {
            font-size: 16px;
            text-align: center;
            white-space: pre-line;
        }
        @keyframes bca-spin {
            to { transform: rotate(360deg); }
        }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement("div");
        overlay.id = "bca-autologin-overlay";

        const spinner = document.createElement("div");
        spinner.id = "bca-autologin-spinner";

        const text = document.createElement("div");
        text.id = "bca-autologin-text";
        text.textContent = "Se încarcă, te conectăm automat...\nTe rugăm să nu închizi această fereastră.";

        overlay.appendChild(spinner);
        overlay.appendChild(text);

        document.documentElement.appendChild(overlay);

        dlog("[AUTOLOGIN-BCA] Overlay login afișat.");
    }

    function hideLoginOverlay() {
        const overlay = document.getElementById("bca-autologin-overlay");
        if (overlay) {
            overlay.remove();
            dlog("[AUTOLOGIN-BCA] Overlay login ascuns.");
        }
    }

    // ---------------------------------------------------------
    // Accept All Cookies (OneTrust) pe BCA
    // ---------------------------------------------------------
    async function acceptBcaCookies() {
        try {
            const btn = await waitFor("#onetrust-accept-btn-handler", 8000);
            btn.click();
            dlog("[AUTOLOGIN-BCA] Am apăsat „Accept All Cookies”.");
        } catch (e) {
            dlog("[AUTOLOGIN-BCA] Nu am găsit bannerul de cookies sau a expirat timeout-ul.");
        }
    }

    // ---------------------------------------------------------
    // Bridge: cere credențialele reale de la extensie
    // ---------------------------------------------------------
    function getCredentials() {
        return new Promise((resolve) => {
            dlog("[AUTOLOGIN-BCA] Cer credențiale de la extensie (bridge)...");

            function handler(event) {
                if (event.source !== window) return;
                const data = event.data || {};
                if (data.type === "BCA_CREDS") {
                    window.removeEventListener("message", handler);
                    if (data.creds && data.creds.ok) {
                        dlog("[AUTOLOGIN-BCA] Am primit credențiale de la extensie.");
                        resolve(data.creds);
                    } else {
                        console.error("[AUTOLOGIN-BCA] Credenziale invalide sau lipsă:", data.creds);
                        resolve(null);
                    }
                }
            }

            window.addEventListener("message", handler);

            // declanșează cererea către content-script (extensie)
            window.postMessage({ type: "BCA_GET_CREDS" }, "*");
        });
    }

    // ---------------------------------------------------------
    // util: completează input + declanșează evenimente
    // ---------------------------------------------------------
    function fillInput(input, value) {
        if (!input) return;
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // ---------------------------------------------------------
    // 1) Flow pe homepage (click pe „Autentificare”) – FĂRĂ overlay
    // ---------------------------------------------------------
        async function handleHome() {
    try {
        dlog("[AUTOLOGIN-BCA] Sunt pe homepage BCA, caut buton login...");

        // Găsește header-ul
        const header = document.querySelector('header.Header, header[class*="Header"]');
        if (!header) {
            throw new Error("Nu am găsit header-ul");
        }

        // Caută span-ul doar în header
        const spans = header.querySelectorAll('span');
        let loginSpan = null;
        for (const span of spans) {
            const text = span.textContent.trim();
            if (text === "Autentificare") {
                loginSpan = span;
                break;
            }
        }

        if (!loginSpan) {
            // Fallback: caută în tot documentul
            const allSpans = document.querySelectorAll('span');
            for (const span of allSpans) {
                const text = span.textContent.trim();
                if (text === "Autentificare") {
                    loginSpan = span;
                    break;
                }
            }
        }

        if (!loginSpan) {
            // nu există buton de login → ești deja logat sau pagina s-a schimbat; ieșim fără zgomot
            dlog("Nu am găsit 'Autentificare' — probabil deja logat. Ies.");
            return;
        }

        const loginBtn = loginSpan.closest('button');
        if (!loginBtn) {
            dlog("Nu am găsit butonul părinte pentru span-ul 'Autentificare'.");
            return;
        }

        dlog("Găsit butonul de Autentificare, dau click");
        loginBtn.click();
        console.log("[AUTOLOGIN] bca: click Autentificare");
    } catch (e) {
        console.error("[AUTOLOGIN-BCA] Eroare pe homepage:", e);
    }
}

    // ---------------------------------------------------------
    // 2) Flow pe pagina de login (completez user + parolă) – CU overlay
    // ---------------------------------------------------------
    async function handleLogin() {
        try {
            dlog("Sunt pe login.bca.com, aștept formularul...");

            // dacă nu există formular, ești deja logat/redirectat — ieși fără zgomot
            const hasForm = document.querySelector("#username, input[name='username'], input[type='email'], #password, input[name='password'], input[type='password']");
            if (!hasForm) {
                dlog("Nu există formular de login — probabil deja logat. Ies.");
                return;
            }

            // overlay peste pagina de login
            showLoginOverlay();

            // username: încearcă mai multe variante
            const userInput = await waitFor(
                "#username, input[name='username'], input[type='email']",
                15000
            );
            const passInput = await waitFor(
                "#password, input[name='password'], input[type='password']",
                15000
            );

            dlog("[AUTOLOGIN-BCA] Formular login găsit, cer credențiale...");

            const creds = await getCredentials();
            if (!creds) {
                console.error("[AUTOLOGIN-BCA] Nu am primit credențiale, ies.");
                hideLoginOverlay();
                return;
            }

            fillInput(userInput, creds.username);
            fillInput(passInput, creds.password);

            dlog("[AUTOLOGIN-BCA] Date completate, caut buton submit...");

            const submitBtn = await waitFor(
                "#loginButton, button#loginButton, button[id='loginButton'], button[type='submit'], input[type='submit'], button.login, button[type='button'][name='login']",
                15000
            );

            if (!submitBtn) {
                console.error("[AUTOLOGIN-BCA] Nu am găsit buton submit");
                hideLoginOverlay();
                return;
            }

            submitBtn.click();
            console.log("[AUTOLOGIN] bca: creds filled+submitted");
            dlog("Am apăsat Login, aștept redirect...");

            setTimeout(() => {
                dlog("[AUTOLOGIN-BCA] Ascund overlay (timeout după login).");
                hideLoginOverlay();
            }, 8000);

        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare pe pagina de login:", e);
            hideLoginOverlay();
        }
    }

    // =========================================================
    // PORNIREA SCRIPTULUI
    // =========================================================

    function isLoggedIn() {
        // markere de utilizator autentificat în header/pagină
        try {
            const markers = [
                '[class*="logout"]', '[href*="logout"]', '[class*="Logout"]',
                '[class*="account"]', '[class*="Account"]', '[class*="user-menu"]',
                '[class*="avatar"]', '[class*="profile"]', '#userMenu', '[data-testid*="user"]',
            ];
            if (document.querySelector(markers.join(","))) return true;
        } catch (e) {}
        return false;
    }

    function init() {
        // pornește o singură dată per pagină
        if (window.__bcaAutologinStarted) return;
        window.__bcaAutologinStarted = true;

        if (isLoggedIn()) {
            dlog("Deja logat, ies fără zgomot.");
            return;
        }

        // încerci să accepți cookies pe ambele host-uri (homepage + login)
        if (HOME_HOSTS.includes(HOST) || LOGIN_HOSTS.includes(HOST)) {
            acceptBcaCookies();
        }

        if (HOME_HOSTS.includes(HOST)) {
            dlog("Host homepage detectat:", HOST);
            setTimeout(handleHome, 3000);
        } else if (LOGIN_HOSTS.includes(HOST)) {
            dlog("Host login detectat:", HOST);
            setTimeout(handleLogin, 1000);
        }
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        init();
    } else {
        window.addEventListener("DOMContentLoaded", init);
    }

})();
