// ============================================================
// AUTOLOGIN AYVENS (carmarket.ayvens.com) — BRIDGE + OVERLAY
// ============================================================

(function () {
    "use strict";

    const HOST = location.hostname;
    if (HOST !== "carmarket.ayvens.com") return;

    console.log("[AUTOLOGIN-AYVENS] Script pornit pe", HOST);

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
    // Overlay full-screen 1.0 opacity "Se încarcă..."
    // ---------------------------------------------------------
    function showAyvensOverlay() {
        if (document.getElementById("ayvens-autologin-overlay")) return;

        const style = document.createElement("style");
        style.textContent = `
        #ayvens-autologin-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 1); /* 100% opac */
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

        console.log("[AUTOLOGIN-AYVENS] Overlay afișat.");
    }

    function hideAyvensOverlay() {
        const overlay = document.getElementById("ayvens-autologin-overlay");
        if (overlay) {
            overlay.remove();
            console.log("[AUTOLOGIN-AYVENS] Overlay ascuns.");
        }
    }

    // ---------------------------------------------------------
    // Accept All Cookies (OneTrust) pe Ayvens
    // ---------------------------------------------------------
    async function acceptAyvensCookies() {
        try {
            const btn = await waitFor("#onetrust-accept-btn-handler", 8000);
            btn.click();
            console.log("[AUTOLOGIN-AYVENS] Am apăsat „Accept All Cookies”.");
        } catch (e) {
            console.log("[AUTOLOGIN-AYVENS] Nu am găsit bannerul de cookies sau a expirat timeout-ul.");
        }
    }

    // ---------------------------------------------------------
    // Închide pop-up-ul de feedback (content > .cross)
    // ---------------------------------------------------------
    function startFeedbackPopupCloser() {
        console.log("[AUTOLOGIN-AYVENS] Pornez vânător de popup feedback...");

        let tries = 0;
        const maxTries = 30; // ~30 secunde dacă rulează la 1s

        const intId = setInterval(() => {
            tries++;

            const cross =
                document.querySelector(".content .cross") ||
                document.querySelector("div.cross");

            if (cross) {
                console.log("[AUTOLOGIN-AYVENS] Găsit popin feedback, dau click pe ✕");
                cross.click();
                clearInterval(intId);
                return;
            }

            if (tries >= maxTries) {
                console.log("[AUTOLOGIN-AYVENS] Nu am găsit popin feedback după", maxTries, "încercări.");
                clearInterval(intId);
            }
        }, 1000);
    }

    // ---------------------------------------------------------
    // Bridge: cere credențialele de la extensie
    // ---------------------------------------------------------
    function getCredentials() {
        return new Promise((resolve) => {
            console.log("[AUTOLOGIN-AYVENS] Cer credențiale de la extensie (bridge)...");

            function handler(event) {
                if (event.source !== window) return;
                const data = event.data || {};
                if (data.type === "AYVENS_CREDS") {
                    window.removeEventListener("message", handler);
                    if (data.creds && data.creds.ok) {
                        console.log("[AUTOLOGIN-AYVENS] Am primit credențiale de la extensie.");
                        resolve(data.creds);
                    } else {
                        console.error("[AUTOLOGIN-AYVENS] Credenciales invalide sau lipsă:", data.creds);
                        resolve(null);
                    }
                }
            }

            window.addEventListener("message", handler);

            window.postMessage({ type: "AYVENS_GET_CREDS" }, "*");
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
    // Flow complet de login Ayvens (overlay doar în timpul flow-ului)
    // ---------------------------------------------------------
    async function handleAyvensLogin() {
        try {
            console.log("[AUTOLOGIN-AYVENS] Încep flow de login...");

            // 1) Buton "Conectare" din header
            const openLoginBtn = await waitFor("#btn_signIn", 15000);
            console.log("[AUTOLOGIN-AYVENS] Găsit #btn_signIn, dau click.");
            openLoginBtn.click();

            // 2) Overlay-ul nostru peste overlay-ul lor
            showAyvensOverlay();

            // 3) Așteptăm câmpurile username + parolă din modalul lor
            const userInput = await waitFor(
                "#username, input#username, input[controlname='username']",
                15000
            );
            const passInput = await waitFor(
                "#password, input#password, input[controlname='password'][type='password']",
                15000
            );

            console.log("[AUTOLOGIN-AYVENS] Câmpuri username/parolă găsite, cer credențiale...");

            const creds = await getCredentials();
            if (!creds) {
                console.error("[AUTOLOGIN-AYVENS] Nu am primit credențiale, ies.");
                hideAyvensOverlay();
                return;
            }

            // 4) Eliminăm butonul de "show password"
            const toggleEye = document.getElementById("toggle_password");
            if (toggleEye && toggleEye.parentElement) {
                toggleEye.parentElement.remove();
                console.log("[AUTOLOGIN-AYVENS] Buton 'show password' eliminat.");
            }

            // 5) Completăm câmpurile
            fillInput(userInput, creds.username);
            fillInput(passInput, creds.password);
            console.log("[AUTOLOGIN-AYVENS] Date completate, caut buton Conectare...");

            // 6) Buton "Conectare" din modal (#btn_login)
            const submitBtn = await waitFor(
                "#btn_login, button#btn_login",
                15000
            );

            if (!submitBtn) {
                console.error("[AUTOLOGIN-AYVENS] Nu am găsit butonul #btn_login");
                hideAyvensOverlay();
                return;
            }

            submitBtn.click();
            console.log("[AUTOLOGIN-AYVENS] Am apăsat Conectare (#btn_login), aștept rezultat...");

            // Pornește vânătorul de popin feedback (după login)
            setTimeout(startFeedbackPopupCloser, 3000);

            // Lăsăm un mic delay apoi ascundem overlay-ul nostru
            setTimeout(() => {
                hideAyvensOverlay();
            }, 5000);

        } catch (e) {
            console.error("[AUTOLOGIN-AYVENS] Eroare în flow:", e);
            hideAyvensOverlay();
        }
    }

    // ---------------------------------------------------------
    // PORNIRE SCRIPT
    // ---------------------------------------------------------
    function init() {
        console.log("[AUTOLOGIN-AYVENS] init() pe", HOST);

        // acceptă cookies cât mai devreme
        acceptAyvensCookies();

        // mic delay ca să fie montat DOM-ul, apoi începem flow-ul
        setTimeout(handleAyvensLogin, 1000);
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        init();
    } else {
        window.addEventListener("DOMContentLoaded", init);
    }

})();
