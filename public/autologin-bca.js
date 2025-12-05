// ======================================================
// AUTOLOGIN BCA (FULL AUTOMATIC, NO PASSWORD EXPOSED)
// Works together with server endpoint /auto-login-bca
// ======================================================

(function () {
    "use strict";

    const SERVER_URL = "https://bca-ayvens.up.railway.app/auto-login-bca"; 
    const USERNAME_FIELD = "username";   // placeholders
    const PASSWORD_FIELD = "password";   // placeholders

    // Only run on BCA main site
    if (!location.hostname.includes("bca.com")) return;

    // Delay helper
    const wait = ms => new Promise(res => setTimeout(res, ms));

    // Detect if user is logged in based on the presence of username indicator
    function isLoggedIn() {
        const userInfo = document.querySelector(".header__user, .user-info, .logout, a[href*='logout']");
        return !!userInfo;
    }

    // Detect login button
    function clickLoginButton() {
        const btn = document.querySelector("a[href='/ro_RO/login']");
        if (btn) btn.click();
    }

    // Detect login form
    function findLoginForm() {
        const form = document.querySelector("form input[name='" + USERNAME_FIELD + "']");
        return !!form;
    }

    // Inject cookies into browser
    function injectCookies(cookies) {
        cookies.forEach(cookie => {
            document.cookie = `${cookie.name}=${cookie.value}; domain=${cookie.domain}; path=${cookie.path}; secure`;
        });
    }

    async function autoLoginFlow() {
        // Already logged in
        if (isLoggedIn()) return;

        console.log("[AUTOLOGIN BCA] Not logged in — starting process...");

        // Step 1: click Autentificare to open login page
        clickLoginButton();

        // Wait for login form to load
        for (let i = 0; i < 30; i++) {
            await wait(200);
            if (findLoginForm()) break;
        }

        if (!findLoginForm()) {
            console.error("[AUTOLOGIN BCA] Login form not found.");
            return;
        }

        console.log("[AUTOLOGIN BCA] Login form detected — calling server.");

        // Step 2: Ask server to do backend login and return cookies
        try {
            const response = await fetch(SERVER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ request: "login" })
            });

            const data = await response.json();

            if (!data.success) {
                console.error("[AUTOLOGIN BCA] Server returned failure", data);
                return;
            }

            console.log("[AUTOLOGIN BCA] Received cookies.");

            // Step 3: inject cookies into browser
            injectCookies(data.cookies);

            // Step 4: refresh page to apply session
            location.href = "https://www.bca.com/ro_RO";

        } catch (err) {
            console.error("[AUTOLOGIN BCA] ERROR contacting server:", err);
        }
    }

    // Run autologin shortly after page loads
    window.addEventListener("load", () => {
        setTimeout(autoLoginFlow, 1000);
    });

})();
