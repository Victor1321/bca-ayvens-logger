// ============================================================
// AUTOLOGIN BCA (homepage + login.bca.com) — BRIDGE + OVERLAY
// ============================================================

(function () {
    "use strict";

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
    function showBcaOverlay() {
        let overlay = document.getElementById("bca-autologin-overlay");
        if (overlay) {
            overlay.style.display = "flex";
            console.log("[AUTOLOGIN-BCA] Overlay deja există, îl afișez.");
            return;
        }

        const style = document.createElement("style");
        style.textContent = `
        #bca-autologin-overlay {
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

        overlay = document.createElement("div");
        overlay.id = "bca-autologin-overlay";

        const spinner = document.createElement("div");
        spinner.id = "bca-autologin-spinner";

        const text = document.createElement("div");
        text.id = "bca-autologin-text";
        text.textContent = "Se încarcă, te conectăm automat la BCA...\nTe rugăm să nu închizi această fereastră.";

        overlay.appendChild(spinner);
        overlay.appendChild(text);

        document.documentElement.appendChild(overlay);

        console.log("[AUTOLOGIN-BCA] Overlay afișat.");
    }

    function hideBcaOverlay() {
        const overlay = document.getElementById("bca-autologin-overlay");
        if (overlay) {
            overlay.remove();
            console.log("[AUTOLOGIN-BCA] Overlay ascuns.");
        }
    }

    // ---------------------------------------------------------
    // Bridge: cere credențialele reale de la extensie (nu de la server)
    // ---------------------------------------------------------
    function getCredentials() {
        return new Promise((resolve) => {
            console.log("[AUTOLOGIN-BCA] Cer credențiale de la extensie (bridge)...");

            function handler(event) {
                if (event.source !== window) return;
                const data = event.data || {};
                if (data.type === "BCA_CREDS") {
                    window.removeEventListener("message", handler);
                    if (data.creds && data.creds.ok) {
                        console.log("[AUTOLOGIN-BCA] Am primit credențiale de la extensie.");
                        resolve(data.creds);
                    } else {
                        console.error("[AUTOLOGIN-BCA] Credenziale invalide sau lipsă:", data.creds);
                        resolve(null);
                    }
                }
            }

            window.addEventListener("message", handler);

            // declanșează cererea către content script (extensie)
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
    // 1) Flow pe homepage (click pe „Autentificare”)
    // ---------------------------------------------------------
    async function handleHome() {
        try {
            console.log("[AUTOLOGIN-BCA] Sunt pe homepage BCA, pornesc overlay + caut buton login...");
            showBcaOverlay();

            const loginBtn = await waitFor('a[data-el="login"]', 15000);
            console.log("[AUTOLOGIN-BCA] Găsit butonul de Autentificare, dau click");
            loginBtn.click();

            // nu ascundem overlay aici, pagina se va schimba spre login.bca.com
            // unde scriptul va rula din nou și va recrea overlay-ul
        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare pe homepage:", e);
            // dacă ceva crapă, nu blocăm userul
            hideBcaOverlay();
        }
    }

    // ---------------------------------------------------------
    // 2) Flow pe pagina de login (completez user + parolă)
    // ---------------------------------------------------------
    async function handleLogin() {
        try {
            console.log("[AUTOLOGIN-BCA] Sunt pe login.bca.com, pornesc overlay + aștept formularul...");
            showBcaOverlay();

            // username
            const userInput = await waitFor(
                "#username, input[name='username'], input[type='email']",
                15000
            );
            const passInput = await waitFor(
                "#password, input[name='password'], input[type='password']",
                15000
            );

            console.log("[AUTOLOGIN-BCA] Formular login găsit, cer credențiale...");

            const creds = await getCredentials();
            if (!creds) {
                console.error("[AUTOLOGIN-BCA] Nu am primit credențiale, ies.");
                hideBcaOverlay();
                return;
            }

            fillInput(userInput, creds.username);
            fillInput(passInput, creds.password);

            console.log("[AUTOLOGIN-BCA] Date completate, caut buton submit...");

            const submitBtn = await waitFor(
                "#loginButton, button#loginButton, button[id='loginButton'], button[type='submit'], input[type='submit'], button.login, button[type='button'][name='login']",
                15000
            );

            if (!submitBtn) {
                console.error("[AUTOLOGIN-BCA] Nu am găsit buton submit");
                hideBcaOverlay();
                return;
            }

            submitBtn.click();
            console.log("[AUTOLOGIN-BCA] Am apăsat Login, aștept redirect...");

            // mai ținem overlay-ul câteva secunde, apoi îl ascundem
            setTimeout(() => {
                console.log("[AUTOLOGIN-BCA] Ascund overlay după login (timeout).");
                hideBcaOverlay();
            }, 8000);

        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare pe pagina de login:", e);
            hideBcaOverlay();
        }
    }

    // =========================================================
    // PORNIREA SCRIPTULUI
    // =========================================================
    function init() {
        if (HOME_HOSTS.includes(HOST)) {
            console.log("[AUTOLOGIN-BCA] Host homepage detectat:", HOST);
            setTimeout(handleHome, 1000);
        } else if (LOGIN_HOSTS.includes(HOST)) {
            console.log("[AUTOLOGIN-BCA] Host login detectat:", HOST);
            setTimeout(handleLogin, 1000);
        } else {
            // alt host, nu facem nimic
        }
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        init();
    } else {
        window.addEventListener("DOMContentLoaded", init);
    }

})();
