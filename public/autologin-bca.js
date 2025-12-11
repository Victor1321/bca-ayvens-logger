    // ---------------------------------------------------------
    // Overlay full-screen "Se încarcă..."
    // ---------------------------------------------------------
    function showLoginOverlay() {
        // dacă există deja, nu mai creăm
        if (document.getElementById("bca-autologin-overlay")) return;

        const style = document.createElement("style");
        style.textContent = `
        #bca-autologin-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
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

        console.log("[AUTOLOGIN-BCA] Overlay login afișat.");
    }
