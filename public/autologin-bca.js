// ============================================================
// AUTOLOGIN BCA — injectat prin Firefox (fără Tampermonkey)
// ============================================================

(function () {
    "use strict";

    const SERVER_URL = "https://bca-ayvens.up.railway.app/auto-login-bca";

    // domenii acceptate
    const BCA_HOSTS = [
        "www.bca.com",
        "bca.com",
    ];

    // dacă nu suntem pe BCA, nu facem nimic
    if (!BCA_HOSTS.includes(location.hostname)) return;

    console.log("[AUTOLOGIN-BCA] Script pornit");

    // ---------------------------------------------------------
    // 1) Așteaptă un element în pagină
    // ---------------------------------------------------------
    function waitFor(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();

            const timer = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(timer);
                    resolve(el);
                }
                if (Date.now() - start > timeout) {
                    clearInterval(timer);
                    reject("Timeout waiting for selector: " + selector);
                }
            }, 100);
        });
    }

    // ---------------------------------------------------------
    // 2) Cere credențialele reale de la serverul tău (Railway)
    // ---------------------------------------------------------
    async function getCredentials() {
        try {
            const res = await fetch(SERVER_URL, { method: "POST" });
            const data = await res.json();
            if (data.ok) return data;
        } catch (err) {
            console.error("[AUTOLOGIN-BCA] Eroare credențiale:", err);
        }
        return null;
    }

    // ---------------------------------------------------------
    // 3) Autologin flow
    // ---------------------------------------------------------
    async function autoLogin() {
        try {
            console.log("[AUTOLOGIN-BCA] Pornesc procedura...");

            // Suntem pe homepage? OK.
            // Căutăm butonul "Autentificare"
            const loginBtn = await waitFor('a[data-el="login"]');

            console.log("[AUTOLOGIN-BCA] Găsit butonul de Autentificare");

            // Click pe login
            loginBtn.click();

            // Așteptăm formularul BCA clasic
            // username = #username, password = #password
            const userInput = await waitFor("#username");
            const passInput = await waitFor("#password");

            console.log("[AUTOLOGIN-BCA] Formular găsit");

            // luăm datele reale de la server
            const creds = await getCredentials();
            if (!creds) {
                console.error("[AUTOLOGIN-BCA] Nu am primit credențiale");
                return;
            }

            // completăm automat
            userInput.value = creds.username;
            passInput.value = creds.password;

            console.log("[AUTOLOGIN-BCA] Date completate");

            // Așteptăm butonul de Login
            const submitBtn = document.querySelector("button[type='submit'], input[type='submit']");
            if (!submitBtn) {
                console.error("[AUTOLOGIN-BCA] Nu am găsit buton submit");
                return;
            }

            submitBtn.click();
            console.log("[AUTOLOGIN-BCA] Am apăsat Login");

            // Așteptăm redirect
            setTimeout(() => {
                console.log("[AUTOLOGIN-BCA] Autologin BCA finalizat");
            }, 3000);

        } catch (e) {
            console.error("[AUTOLOGIN-BCA] Eroare flow:", e);
        }
    }

    // =========================================================
    // PORNIREA SCRIPTULUI
    // =========================================================
    window.addEventListener("load", () => {
        setTimeout(autoLogin, 1000);
    });

})();
