// ============================================================
// AUTOLOGIN BCA — cu DEBUG vizibil pe ecran
// ============================================================
(function () {
    "use strict";

    const SERVER_URL = "https://bca-ayvens.up.railway.app/auto-login-bca";

    const BCA_HOSTS = [
        "www.bca.com",
        "bca.com"
    ];

    if (!BCA_HOSTS.includes(location.hostname)) return;

    // ---------------------------------------------------------
    // DEBUG OVERLAY
    // ---------------------------------------------------------
    function createDebugOverlay() {
        const div = document.createElement("div");
        div.id = "autologin-debug";
        div.style.position = "fixed";
        div.style.top = "10px";
        div.style.right = "10px";
        div.style.padding = "10px 14px";
        div.style.background = "rgba(0,0,0,0.75)";
        div.style.color = "white";
        div.style.fontSize = "14px";
        div.style.zIndex = "999999";
        div.style.borderRadius = "6px";
        div.style.fontFamily = "Arial";
        div.style.maxWidth = "260px";
        div.style.lineHeight = "1.4";
        div.style.boxShadow = "0 0 10px black";
        div.innerHTML = "<b>Autologin BCA:</b><br>Initializing…";
        document.body.appendChild(div);
    }

    function log(msg) {
        const box = document.getElementById("autologin-debug");
        if (box) box.innerHTML += "<br>• " + msg;
        console.log("[AUTOLOGIN-BCA]", msg);
    }

    // ---------------------------------------------------------
    // Așteaptă un element
    // ---------------------------------------------------------
    function waitFor(selector, timeout = 15000) {
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
                    reject("Timeout: " + selector);
                }
            }, 100);
        });
    }

    // ---------------------------------------------------------
    // Cerere credențiale reale de la server
    // ---------------------------------------------------------
    async function getCredentials() {
        try {
            log("Cer credențiale de la server…");
            const res = await fetch(SERVER_URL, { method: "POST" });
            const data = await res.json();

            if (data.ok) {
                log("Am primit username/parola.");
                return data;
            }

            log("Serverul NU a trimis credențiale!");
        } catch (e) {
            log("Eroare fetch credențiale: " + e);
        }
        return null;
    }

    // ---------------------------------------------------------
    // Procedura completă
    // ---------------------------------------------------------
    async function autoLogin() {
        try {
            log("Script pornit.");

            // Buton Autentificare
            log("Caut butonul de Autentificare…");
            const loginBtn = await waitFor('a[data-el="login"]');
            log("Găsit. Apăs…");

            loginBtn.click();

            // Formular
            log("Aștept câmp username…");
            const userInput = await waitFor("#username");
            log("Aștept câmp password…");
            const passInput = await waitFor("#password");

            log("Formular găsit.");

            const creds = await getCredentials();
            if (!creds) {
                log("NU am credențiale → STOP.");
                return;
            }

            // Completăm
            userInput.value = creds.username;
            passInput.value = creds.password;
            log("Date completate.");

            // Butonul de submit
            const submitBtn = document.querySelector("button[type='submit'], input[type='submit']");
            if (!submitBtn) {
                log("Nu găsesc butonul de LOGIN!");
                return;
            }

            log("Apăs LOGIN…");
            submitBtn.click();

            setTimeout(() => {
                log("Autologin finalizat (posibil redirect).");
            }, 3000);

        } catch (e) {
            log("EROARE: " + e);
        }
    }

    // ---------------------------------------------------------
    // START SCRIPT
    // ---------------------------------------------------------
    window.addEventListener("load", () => {
        setTimeout(() => {
            createDebugOverlay();
            log("Inițializare…");
            autoLogin();
        }, 800);
    });

})();
