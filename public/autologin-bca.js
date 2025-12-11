// ============================================================
// AUTOLOGIN BCA (homepage + login.bca.com) CU OVERLAY FULL
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
    // Overlay full-screen "Se încarcă..."
    // ---------------------------------------------------------
    let overlayEl = null;
    let overlayStyleEl = null;

    function createOverlay() {
        if (overlayEl) return overlayEl;

        overlayEl = document.createElement("div");
        overlayEl.id = "bca-autologin-overlay";
        overlayEl.style.position = "fixed";
        overlayEl.style.top = "0";
        overlayEl.style.left = "0";
        overlayEl.style.width = "100%";
        overlayEl.style.height = "100%";
        overlayEl.style.zIndex = "999999";
        overlayEl.style.background = "rgba(0,0,0,1)"; // opacitate 1.0
        overlayEl.style.display = "flex";
        overlayEl.style.alignItems = "center";
        overlayEl.style.justifyContent = "center";
        overlayEl.style.color = "#fff";
        overlayEl.style.fontSize = "24px";
        overlayEl.style.fontFamily = "sans-serif";
        overlayEl.style.pointerEvents = "all";

        overlayEl.innerHTML = `
            <div style="text-align:center;">
                <div style="margin-bottom:12px;">Se încarcă...</div>
                <div style="
                    margin: 0 auto;
                    border: 4px solid #fff;
                    border-top-color: transparent;
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    animation: bca-spin 1s linear infinite;
                "></div>
            </div>
        `;

        if (!overlayStyleEl) {
            overlayStyleEl = document.createElement("style");
            overlayStyleEl.textContent = `
                @keyframes bca-spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
            `;
            document.documentElement.appendChild(overlayStyleEl);
        }

        document.documentElement.appendChild(overlayEl);
        return overlayEl;
    }

    function showOverlay() {
        try {
            createOverlay();
            overlayEl.style.display = "flex";
        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare showOverlay:", e);
        }
    }

    function hideOverlay() {
        try {
            if (overlayEl) {
                overlayEl.style.display = "none";
            }
        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare hideOverlay:", e);
        }
    }

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
    // util: cere credențialele reale de la extensie (bridge)
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

            // declanșează cererea către content script
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
            showOverlay();

            const loginBtn = await waitFor('a[data-el="login"]', 15000);
            console.log("[AUTOLOGIN-BCA] Găsit butonul de Autentificare, dau click");
            loginBtn.click();

            // nu ascundem overlay aici, pentru că urmează redirect spre login.bca.com
            // și overlay-ul de acolo va fi recreat de noua pagină
        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare pe homepage:", e);
            // dacă ceva crapă, nu blocăm userul
            hideOverlay();
        }
    }

    // ---------------------------------------------------------
    // 2) Flow pe pagina de login (completez user + parolă)
    // ---------------------------------------------------------
    async function handleLogin() {
        try {
            console.log("[AUTOLOGIN-BCA] Sunt pe login.bca.com, pornesc overlay + aștept formularul...");
            showOverlay();

            // username: încearcă mai multe variante
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
                hideOverlay();
                return;
            }

            fillInput(userInput, creds.username);
            fillInput(passInput, creds.password);

            console.log("[AUTOLOGIN-BCA] Date completate, caut buton submit...");

            const submitBtn =
                document.querySelector("button[type='submit'], input[type='submit'], #loginButton");

            if (!submitBtn) {
                console.error("[AUTOLOGIN-BCA] Nu am găsit buton submit");
                hideOverlay();
                return;
            }

            submitBtn.click();
            console.log("[AUTOLOGIN-BCA] Am apăsat Login, aștept redirect...");

            // după ce am dat login, mai ținem overlay-ul puțin
            // apoi îl ascundem (oricum pagina ar trebui să fie în redirect)
            setTimeout(() => {
                console.log("[AUTOLOGIN-BCA] Ascund overlay după login (timeout).");
                hideOverlay();
            }, 8000);

        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare pe pagina de login:", e);
            hideOverlay();
        }
    }

    // =========================================================
    // PORNIREA SCRIPTULUI
    // =========================================================
    function init() {
        if (HOME_HOSTS.includes(HOST)) {
            console.log("[AUTOLOGIN-BCA] Host homepage detectat:", HOST);
            // mic delay ca să fie totul montat
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
