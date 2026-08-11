// ============================================================
// AUTOLOGIN AYVENS — DEBUG HEAVY nou
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
        if (DEBUG) _origLog("[AUTOLOGIN-AYVENS-DEBUG]", ...args);
    }

    dlog("===== SCRIPT AUTOLOGIN AYVENS A PORNIT =====");
    dlog("HOST:", location.hostname);

    const HOST = location.hostname;
    if (HOST !== "carmarket.ayvens.com") {
        dlog("Host nu este carmarket.ayvens.com. Ies.");
        return;
    }

    dlog("Host permis. Continuă...");

    // ---------------------------------------------------------
    // util: așteaptă un element în pagină
    // ---------------------------------------------------------
    function waitFor(selector, timeout = 10000) {
        dlog(`waitFor începe pentru selector: "${selector}" (timeout: ${timeout}ms)`);
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timer = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(timer);
                    dlog(`Element găsit după ${Date.now() - start}ms:`, selector);
                    resolve(el);
                    return;
                }
                if (Date.now() - start > timeout) {
                    clearInterval(timer);
                    console.error(`TIMEOUT pentru selector: "${selector}" (${timeout}ms)`);
                    reject("Timeout waiting for selector: " + selector);
                }
            }, 500);
        });
    }

    // ---------------------------------------------------------
    // Overlay
    // ---------------------------------------------------------
    function showAyvensOverlay() {
        dlog("🟡 [DEBUG] showAyvensOverlay() apelat.");
        if (document.getElementById("ayvens-autologin-overlay")) {
            dlog("🟡 [DEBUG] Overlay există deja.");
            return;
        }

        const style = document.createElement("style");
        style.textContent = `
        #ayvens-autologin-overlay {
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
        #ayvens-autologin-spinner {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 5px solid #fff;
            border-top-color: transparent;
            animation: ayvens-spin 0.8s linear infinite;
            margin-bottom: 16px;
        }
        #ayvens-autologin-text {
            font-size: 16px;
            text-align: center;
            white-space: pre-line;
        }
        @keyframes ayvens-spin {
            to { transform: rotate(360deg); }
        }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement("div");
        overlay.id = "ayvens-autologin-overlay";

        const spinner = document.createElement("div");
        spinner.id = "ayvens-autologin-spinner";

        const text = document.createElement("div");
        text.id = "ayvens-autologin-text";
        text.textContent = "Se încarcă, te conectăm automat la Ayvens...\nTe rugăm să nu închizi această fereastră.";

        overlay.appendChild(spinner);
        overlay.appendChild(text);
        document.documentElement.appendChild(overlay);

        dlog("🟢 [DEBUG] Overlay afișat cu succes.");
    }

    function hideAyvensOverlay() {
        dlog("🟡 [DEBUG] hideAyvensOverlay() apelat.");
        const overlay = document.getElementById("ayvens-autologin-overlay");
        if (overlay) {
            overlay.remove();
            dlog("🟢 [DEBUG] Overlay ascuns.");
        } else {
            dlog("🟡 [DEBUG] Overlay nu exista.");
        }
    }

    // ---------------------------------------------------------
    // Accept Cookies
    // ---------------------------------------------------------
    async function acceptAyvensCookies() {
        dlog("🍪 [DEBUG] acceptAyvensCookies() apelat.");
        try {
            dlog("⏳ [DEBUG] Aștept buton cookies #onetrust-accept-btn-handler...");
            const btn = await waitFor("#onetrust-accept-btn-handler", 8000);
            dlog("✅ [DEBUG] Buton cookies găsit. Click.");
            btn.click();
            dlog("✅ [DEBUG] Cookies acceptate.");
        } catch (e) {
            dlog("⚠️ [DEBUG] Cookies: nu s-a găsit bannerul sau timeout:", e);
        }
    }

    // ---------------------------------------------------------
    // Bridge: cere credențiale
    // ---------------------------------------------------------
    function getCredentials() {
        dlog("🔑 [DEBUG] getCredentials() apelat.");
        return new Promise((resolve) => {
            dlog("📨 [DEBUG] Trimitem AYVENS_GET_CREDS...");

            let done = false;
            let timer = null;

            function finish(val) {
                if (done) return;
                done = true;
                if (timer) clearTimeout(timer);
                window.removeEventListener("message", handler);
                resolve(val);
            }

            function handler(event) {
                if (event.source !== window) return;
                const data = event.data || {};
                dlog("📥 [DEBUG] Mesaj primit:", data.type);
                if (data.type === "AYVENS_CREDS") {
                    dlog("✅ [DEBUG] Credențiale primite:", data.creds);
                    if (data.creds && data.creds.ok) {
                        dlog("🟢 [DEBUG] Credențiale valide.");
                        finish(data.creds);
                    } else {
                        console.error("🔴 [DEBUG] Credențiale invalide:", data.creds);
                        finish(null);
                    }
                }
            }

            window.addEventListener("message", handler);
            window.postMessage({ type: "AYVENS_GET_CREDS" }, "*");
            dlog("📤 [DEBUG] AYVENS_GET_CREDS trimis.");

            // dacă extensia nu răspunde, nu blocăm pagina la nesfârșit
            timer = setTimeout(() => {
                console.error("🔴 [DEBUG] Nu am primit răspuns de la extensie (timeout 8s). Verifică extensia.");
                finish(null);
            }, 8000);
        });
    }

    // ---------------------------------------------------------
    // Fill input
    // ---------------------------------------------------------
    function fillInput(input, value, fieldName) {
        dlog(`✏️ [DEBUG] fillInput() pentru ${fieldName}. Valoare: "${value}"`);
        if (!input) {
            console.error(`🔴 [DEBUG] input pentru ${fieldName} este null!`);
            return;
        }
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        dlog(`✅ [DEBUG] ${fieldName} completat.`);
    }

    // ---------------------------------------------------------
    // Flow complet de login
    // ---------------------------------------------------------
    async function handleAyvensLogin() {
        dlog("🚀 [DEBUG] ===== handleAyvensLogin() A ÎNCEPUT =====");

        try {
            // 1) Buton "Conectare" din header — dacă nu apare în 10s, ești deja
            //    logat (header fără buton de login) → ieși fără zgomot.
            dlog("⏳ [DEBUG] Caut butonul #btn_signIn...");
            let openLoginBtn = null;
            try {
                openLoginBtn = await waitFor("#btn_signIn", 10000);
            } catch (e) {
                dlog("Nu am găsit #btn_signIn — probabil deja logat. Ies fără zgomot.");
                return;
            }
            dlog("Buton #btn_signIn găsit. Dau click.");
            openLoginBtn.click();
            console.log("[AUTOLOGIN] ayvens: click Conectare");
            dlog("Click pe #btn_signIn executat.");

            // delay ca pop-up-ul să se deschidă
            dlog("⏳ [DEBUG] Aștept 2 secunde pentru pop-up...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            dlog("🟢 [DEBUG] Așteptare de 2 secunde finalizată.");

            // 2) Overlay
            dlog("🟡 [DEBUG] Afișez overlay...");
            showAyvensOverlay();

            // 3) Câmpuri username + parolă
            dlog("⏳ [DEBUG] Caut câmpul username (#userName)...");
            const userInput = await waitFor(
                "#userName, input[id='userName'], input[controlname='userName']",
                15000
            );
            dlog("✅ [DEBUG] Câmpul username găsit:", userInput);

            dlog("⏳ [DEBUG] Caut câmpul parolă (#password)...");
            const passInput = await waitFor(
                "#password, input[id='password'], input[controlname='password']",
                15000
            );
            dlog("✅ [DEBUG] Câmpul parolă găsit:", passInput);

            dlog("🟢 [DEBUG] Am găsit ambele câmpuri. Cer credențiale...");

            const creds = await getCredentials();
            if (!creds) {
                console.error("🔴 [DEBUG] Nu am primit credențiale. Ies.");
                hideAyvensOverlay();
                return;
            }
            dlog("🟢 [DEBUG] Credențiale primite:", creds);

            // 4) Eliminăm butonul de "show password"
            dlog("⏳ [DEBUG] Caut #toggle_password...");
            const toggleEye = document.getElementById("toggle_password");
            if (toggleEye && toggleEye.parentElement) {
                toggleEye.parentElement.remove();
                dlog("✅ [DEBUG] Buton 'show password' eliminat.");
            } else {
                dlog("⚠️ [DEBUG] #toggle_password nu a fost găsit.");
            }

            // 5) Completăm câmpurile
            dlog("✏️ [DEBUG] Completez username...");
            fillInput(userInput, creds.username, "username");
            dlog("✏️ [DEBUG] Completez parolă...");
            fillInput(passInput, creds.password, "password");
            dlog("✅ [DEBUG] Câmpurile au fost completate.");

            // 6) Buton "Conectare"
            dlog("⏳ [DEBUG] Caut butonul #btn_login...");
            const submitBtn = await waitFor(
                "#btn_login, button[id='btn_login']",
                15000
            );
            dlog("✅ [DEBUG] Buton #btn_login găsit:", submitBtn);

            if (!submitBtn) {
                console.error("🔴 [DEBUG] Nu am găsit butonul #btn_login");
                hideAyvensOverlay();
                return;
            }

            dlog("Dau click pe #btn_login...");
            submitBtn.click();
            console.log("[AUTOLOGIN] ayvens: creds filled+submitted");
            dlog("Click pe #btn_login executat.");

            dlog("⏳ [DEBUG] Aștept 5 secunde apoi ascund overlay...");
            setTimeout(() => {
                dlog("🟡 [DEBUG] Ascund overlay (timeout 5 sec).");
                hideAyvensOverlay();
            }, 5000);

            dlog("🟢 [DEBUG] handleAyvensLogin() s-a terminat cu succes.");

        } catch (e) {
            console.error("🔴 [DEBUG] ==== EROARE în handleAyvensLogin():", e);
            console.error("🔴 [DEBUG] Stack trace:", e.stack);
            hideAyvensOverlay();
        }
    }

    // ---------------------------------------------------------
    // PORNIRE SCRIPT
    // ---------------------------------------------------------

    function init() {
        // pornește o singură dată per pagină
        if (window.__ayvensAutologinStarted) return;
        window.__ayvensAutologinStarted = true;

        // NU mai ieșim aici pe verificări „o singură dată” (pagina e SPA Angular:
        // header-ul/butonul se randează după DOMContentLoaded, iar markerii largi
        // de „deja logat” dau false-positive). Starea reală o decide flow-ul:
        // dacă #btn_signIn nu apare în timp util → deja logat → ieșire silențioasă.

        dlog("init() apelat. Host:", HOST);

        // acceptă cookies
        dlog("Încep acceptCookies...");
        acceptAyvensCookies();

        // mic delay apoi începem flow-ul
        dlog("Setez timeout de 1 secundă pentru handleAyvensLogin...");
        setTimeout(() => {
            dlog("===== PORNESC handleAyvensLogin după 1s =====");
            handleAyvensLogin();
        }, 1000);
    }

    // ---------------------------------------------------------
    // LANSEAZĂ
    // ---------------------------------------------------------
    dlog("🟢 [DEBUG] Verific readyState:", document.readyState);
    if (document.readyState === "complete" || document.readyState === "interactive") {
        dlog("🟢 [DEBUG] readyState este complete/interactive. Pornesc init() direct.");
        init();
    } else {
        dlog("🟡 [DEBUG] DOM încă nu e gata. Aștept DOMContentLoaded.");
        window.addEventListener("DOMContentLoaded", function() {
            dlog("🟢 [DEBUG] DOMContentLoaded declanșat. Pornesc init().");
            init();
        });
    }

})();
