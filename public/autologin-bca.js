// ============================================================
// AUTOLOGIN BCA (homepage + login.bca.com)
// ============================================================

(function () {
    "use strict";

    const SERVER_URL = "https://bca-ayvens.up.railway.app/auto-login-bca";

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
    // util: cere credențialele reale de la server
    // ---------------------------------------------------------
    async function getCredentials() {
        try {
            console.log("[AUTOLOGIN-BCA] Cer credențiale de la server...");
            const res = await fetch(SERVER_URL, { method: "POST" });
            const data = await res.json();
            if (data && data.ok && data.username && data.password) {
                return data;
            }
            console.error("[AUTOLOGIN-BCA] Răspuns invalid la credențiale:", data);
        } catch (err) {
            console.error("[AUTOLOGIN-BCA] Eroare credențiale:", err);
        }
        return null;
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
            console.log("[AUTOLOGIN-BCA] Sunt pe homepage BCA, caut buton login...");

            const loginBtn = await waitFor('a[data-el="login"]', 15000);
            console.log("[AUTOLOGIN-BCA] Găsit butonul de Autentificare, dau click");
            loginBtn.click();
        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare pe homepage:", e);
        }
    }

    // ---------------------------------------------------------
    // 2) Flow pe pagina de login (completez user + parolă)
    // ---------------------------------------------------------
    async function handleLogin() {
        try {
            console.log("[AUTOLOGIN-BCA] Sunt pe login.bca.com, aștept formularul...");

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
                return;
            }

            fillInput(userInput, creds.username);
            fillInput(passInput, creds.password);

            console.log("[AUTOLOGIN-BCA] Date completate, caut buton submit...");

            const submitBtn =
                document.querySelector("button[type='submit'], input[type='submit'], button.login, button[type='button'][name='login']");

            if (!submitBtn) {
                console.error("[AUTOLOGIN-BCA] Nu am găsit buton submit");
                return;
            }

            submitBtn.click();
            console.log("[AUTOLOGIN-BCA] Am apăsat Login, aștept redirect...");

            setTimeout(() => {
                console.log("[AUTOLOGIN-BCA] Autologin BCA — flow login terminat (probabil redirectat).");
            }, 3000);
        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare pe pagina de login:", e);
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
