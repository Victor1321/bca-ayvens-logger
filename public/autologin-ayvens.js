// ============================================================
// AUTOLOGIN AYVENS — DEBUG HEAVY nou
// ============================================================

(function () {
    "use strict";

    console.log("🔵 [DEBUG] ===== SCRIPT AUTOLOGIN AYVENS A PORNIT =====");
    console.log("🔵 [DEBUG] HOST:", location.hostname);

    const HOST = location.hostname;
    if (HOST !== "carmarket.ayvens.com") {
        console.log("🔴 [DEBUG] Host nu este carmarket.ayvens.com. Ies.");
        return;
    }

    console.log("🟢 [DEBUG] Host permis. Continuă...");

    // ---------------------------------------------------------
    // util: așteaptă un element în pagină
    // ---------------------------------------------------------
    function waitFor(selector, timeout = 10000) {
        console.log(`⏳ [DEBUG] waitFor începe pentru selector: "${selector}" (timeout: ${timeout}ms)`);
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timer = setInterval(() => {
                const el = document.querySelector(selector);
                console.log(`🔍 [DEBUG] Caut elementul: "${selector}" -> ${el ? '✅ GĂSIT' : '❌ NU EXISTĂ'}`);
                if (el) {
                    clearInterval(timer);
                    console.log(`✅ [DEBUG] Element găsit după ${Date.now() - start}ms:`, el);
                    resolve(el);
                    return;
                }
                if (Date.now() - start > timeout) {
                    clearInterval(timer);
                    console.error(`❌ [DEBUG] TIMEOUT pentru selector: "${selector}" (${timeout}ms)`);
                    reject("Timeout waiting for selector: " + selector);
                }
            }, 500);
        });
    }

    // ---------------------------------------------------------
    // Overlay
    // ---------------------------------------------------------
    function showAyvensOverlay() {
        console.log("🟡 [DEBUG] showAyvensOverlay() apelat.");
        if (document.getElementById("ayvens-autologin-overlay")) {
            console.log("🟡 [DEBUG] Overlay există deja.");
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

        console.log("🟢 [DEBUG] Overlay afișat cu succes.");
    }

    function hideAyvensOverlay() {
        console.log("🟡 [DEBUG] hideAyvensOverlay() apelat.");
        const overlay = document.getElementById("ayvens-autologin-overlay");
        if (overlay) {
            overlay.remove();
            console.log("🟢 [DEBUG] Overlay ascuns.");
        } else {
            console.log("🟡 [DEBUG] Overlay nu exista.");
        }
    }

    // ---------------------------------------------------------
    // Accept Cookies
    // ---------------------------------------------------------
    async function acceptAyvensCookies() {
        console.log("🍪 [DEBUG] acceptAyvensCookies() apelat.");
        try {
            console.log("⏳ [DEBUG] Aștept buton cookies #onetrust-accept-btn-handler...");
            const btn = await waitFor("#onetrust-accept-btn-handler", 8000);
            console.log("✅ [DEBUG] Buton cookies găsit. Click.");
            btn.click();
            console.log("✅ [DEBUG] Cookies acceptate.");
        } catch (e) {
            console.log("⚠️ [DEBUG] Cookies: nu s-a găsit bannerul sau timeout:", e);
        }
    }

    // ---------------------------------------------------------
    // Bridge: cere credențiale
    // ---------------------------------------------------------
    function getCredentials() {
        console.log("🔑 [DEBUG] getCredentials() apelat.");
        return new Promise((resolve) => {
            console.log("📨 [DEBUG] Trimitem AYVENS_GET_CREDS...");

            function handler(event) {
                if (event.source !== window) return;
                const data = event.data || {};
                console.log("📥 [DEBUG] Mesaj primit:", data.type);
                if (data.type === "AYVENS_CREDS") {
                    window.removeEventListener("message", handler);
                    console.log("✅ [DEBUG] Credențiale primite:", data.creds);
                    if (data.creds && data.creds.ok) {
                        console.log("🟢 [DEBUG] Credențiale valide.");
                        resolve(data.creds);
                    } else {
                        console.error("🔴 [DEBUG] Credențiale invalide:", data.creds);
                        resolve(null);
                    }
                }
            }

            window.addEventListener("message", handler);
            window.postMessage({ type: "AYVENS_GET_CREDS" }, "*");
            console.log("📤 [DEBUG] AYVENS_GET_CREDS trimis.");
        });
    }

    // ---------------------------------------------------------
    // Fill input
    // ---------------------------------------------------------
    function fillInput(input, value, fieldName) {
        console.log(`✏️ [DEBUG] fillInput() pentru ${fieldName}. Valoare: "${value}"`);
        if (!input) {
            console.error(`🔴 [DEBUG] input pentru ${fieldName} este null!`);
            return;
        }
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`✅ [DEBUG] ${fieldName} completat.`);
    }

    // ---------------------------------------------------------
    // Flow complet de login
    // ---------------------------------------------------------
    async function handleAyvensLogin() {
        console.log("🚀 [DEBUG] ===== handleAyvensLogin() A ÎNCEPUT =====");

        try {
            // 1) Buton "Conectare" din header
            console.log("⏳ [DEBUG] Caut butonul #btn_signIn...");
            const openLoginBtn = await waitFor("#btn_signIn", 15000);
            console.log("✅ [DEBUG] Buton #btn_signIn găsit. Dau click.");
            openLoginBtn.click();
            console.log("🟢 [DEBUG] Click pe #btn_signIn executat.");

            // delay ca pop-up-ul să se deschidă
            console.log("⏳ [DEBUG] Aștept 2 secunde pentru pop-up...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log("🟢 [DEBUG] Așteptare de 2 secunde finalizată.");

            // 2) Overlay
            console.log("🟡 [DEBUG] Afișez overlay...");
            showAyvensOverlay();

            // 3) Câmpuri username + parolă
            console.log("⏳ [DEBUG] Caut câmpul username (#userName)...");
            const userInput = await waitFor(
                "#userName, input[id='userName'], input[controlname='userName']",
                15000
            );
            console.log("✅ [DEBUG] Câmpul username găsit:", userInput);

            console.log("⏳ [DEBUG] Caut câmpul parolă (#password)...");
            const passInput = await waitFor(
                "#password, input[id='password'], input[controlname='password']",
                15000
            );
            console.log("✅ [DEBUG] Câmpul parolă găsit:", passInput);

            console.log("🟢 [DEBUG] Am găsit ambele câmpuri. Cer credențiale...");

            const creds = await getCredentials();
            if (!creds) {
                console.error("🔴 [DEBUG] Nu am primit credențiale. Ies.");
                hideAyvensOverlay();
                return;
            }
            console.log("🟢 [DEBUG] Credențiale primite:", creds);

            // 4) Eliminăm butonul de "show password"
            console.log("⏳ [DEBUG] Caut #toggle_password...");
            const toggleEye = document.getElementById("toggle_password");
            if (toggleEye && toggleEye.parentElement) {
                toggleEye.parentElement.remove();
                console.log("✅ [DEBUG] Buton 'show password' eliminat.");
            } else {
                console.log("⚠️ [DEBUG] #toggle_password nu a fost găsit.");
            }

            // 5) Completăm câmpurile
            console.log("✏️ [DEBUG] Completez username...");
            fillInput(userInput, creds.username, "username");
            console.log("✏️ [DEBUG] Completez parolă...");
            fillInput(passInput, creds.password, "password");
            console.log("✅ [DEBUG] Câmpurile au fost completate.");

            // 6) Buton "Conectare"
            console.log("⏳ [DEBUG] Caut butonul #btn_login...");
            const submitBtn = await waitFor(
                "#btn_login, button[id='btn_login']",
                15000
            );
            console.log("✅ [DEBUG] Buton #btn_login găsit:", submitBtn);

            if (!submitBtn) {
                console.error("🔴 [DEBUG] Nu am găsit butonul #btn_login");
                hideAyvensOverlay();
                return;
            }

            console.log("🟢 [DEBUG] Dau click pe #btn_login...");
            submitBtn.click();
            console.log("✅ [DEBUG] Click pe #btn_login executat.");

            console.log("⏳ [DEBUG] Aștept 5 secunde apoi ascund overlay...");
            setTimeout(() => {
                console.log("🟡 [DEBUG] Ascund overlay (timeout 5 sec).");
                hideAyvensOverlay();
            }, 5000);

            console.log("🟢 [DEBUG] handleAyvensLogin() s-a terminat cu succes.");

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
        console.log("🟢 [DEBUG] init() apelat.");
        console.log("🟢 [DEBUG] Host:", HOST);

        // acceptă cookies
        console.log("🍪 [DEBUG] Încep acceptCookies...");
        acceptAyvensCookies();

        // mic delay apoi începem flow-ul
        console.log("⏳ [DEBUG] Setez timeout de 1 secundă pentru handleAyvensLogin...");
        setTimeout(() => {
            console.log("🚀 [DEBUG] ===== PORNESC handleAyvensLogin după 1s =====");
            handleAyvensLogin();
        }, 1000);
    }

    // ---------------------------------------------------------
    // LANSEAZĂ
    // ---------------------------------------------------------
    console.log("🟢 [DEBUG] Verific readyState:", document.readyState);
    if (document.readyState === "complete" || document.readyState === "interactive") {
        console.log("🟢 [DEBUG] readyState este complete/interactive. Pornesc init() direct.");
        init();
    } else {
        console.log("🟡 [DEBUG] DOM încă nu e gata. Aștept DOMContentLoaded.");
        window.addEventListener("DOMContentLoaded", function() {
            console.log("🟢 [DEBUG] DOMContentLoaded declanșat. Pornesc init().");
            init();
        });
    }

})();
