const express = require("express");
const https = require("https");
const http = require("http");

const app = express();

const PORT = 3000;
const HOST = "127.0.0.1";

// 🔗 Gist RAW của bạn
const GIST_RAW_URL =
  "https://gist.githubusercontent.com/luvrlymc-dotcom/61b9f419389dd72a0fe6a6bb6e5d0a2c/raw/b20666c7705cd014d17a839fe1a78c8001b17d6a/gistfile1.txt";

// ================= CACHE =================
let cachedHTML = "<h1>Loading...</h1>";
let lastHash = "";

// ================= FETCH GIST =================
function fetchGist() {
    https.get(GIST_RAW_URL, res => {
        let data = "";

        res.on("data", chunk => data += chunk);
        res.on("end", () => {
            if (!data) return;

            const hash = Buffer.from(data).toString("base64");

            if (hash !== lastHash) {
                cachedHTML = data;
                lastHash = hash;
                console.log(`[GIST] Updated @ ${new Date().toLocaleTimeString()}`);
            }
        });
    }).on("error", err => {
        console.error("[GIST ERROR]", err.message);
    });
}

// Fetch ngay khi khởi động
fetchGist();

// Auto check cập nhật mỗi 60s
setInterval(fetchGist, 60 * 1000);

// ================= ROUTES =================
app.get("/", (req, res) => {
    res.set({
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store"
    });
    res.send(cachedHTML);
});

// Route ping nội bộ
app.get("/health", (req, res) => {
    res.send("OK");
});

// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`🚀 Express running at http://${HOST}:${PORT}`);
});

// ================= AUTO PING =================
setInterval(() => {
    http.get(`http://${HOST}:${PORT}/health`, res => {
        console.log(`[AUTOPING] ${res.statusCode}`);
        res.resume();
    }).on("error", err => {
        console.error("[AUTOPING ERROR]", err.message);
    });
}, 5 * 60 * 1000);
