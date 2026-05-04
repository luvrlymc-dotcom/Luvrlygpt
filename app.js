import express from "express";
import https from "https";
import http from "http";
import os from "os";
import process from "process";

const app = express();
const PORT = process.env.PORT || 3000;

// 🔗 Gist RAW
const GIST_RAW_URL = "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/cd3fa697e7cfd3da471a2ee56920dec0915d8c5e/gistfile1.txt";

// ================= CACHE & VERSION =================
let cachedHTML = "<h1>Loading...</h1>";
let currentVersion = "";        // hash của nội dung Gist
let lastFetchedAt = Date.now();

// Fetch Gist
function fetchGist() {
    const req = https.get(GIST_RAW_URL, (res) => {
        if (res.statusCode !== 200) {
            console.error("[GIST ERROR] Status:", res.statusCode);
            return;
        }

        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
            if (data.length < 10) return;

            const hash = Buffer.from(data).toString("base64url"); // ngắn gọn hơn base64

            if (hash !== currentVersion) {
                cachedHTML = data;
                currentVersion = hash;
                lastFetchedAt = Date.now();

                console.log(`[GIST] Updated - Version: ${hash.slice(0, 12)}... @ ${new Date().toLocaleTimeString()}`);
            }
        });
    });

    req.setTimeout(8000, () => req.destroy());
    req.on("error", err => console.error("[GIST ERROR]", err.message));
}

// Start
fetchGist();
setInterval(fetchGist, 45 * 1000); // 45 giây một lần

// ================= ROUTES =================
app.get("/", (req, res) => {
    if (!cachedHTML || cachedHTML.length < 10) {
        return res.send("<h1>Server is warming up...</h1>");
    }

    let html = cachedHTML;

    // === INJECT VERSION & UPDATE LOGIC ===
    const versionScript = `
<!-- === VERSION CONTROL INJECTED === -->
<meta name="app-version" content="${currentVersion}">
<script>
// Client-side version control
const SERVER_VERSION = "${currentVersion}";
const CACHE_KEY = "app_current_version";

function getCachedVersion() {
    return localStorage.getItem(CACHE_KEY);
}

function setCachedVersion(ver) {
    localStorage.setItem(CACHE_KEY, ver);
}

async function checkAndUpdate() {
    const cachedVer = getCachedVersion();

    if (!cachedVer) {
        setCachedVersion(SERVER_VERSION);
        return;
    }

    if (cachedVer !== SERVER_VERSION) {
        console.log(\`%c🆕 Phiên bản mới: \${SERVER_VERSION.slice(0,12)}...\`, "color:#0f0;font-weight:bold");
        
        const shouldUpdate = confirm(
            "🔄 Đã có phiên bản mới!\\n\\n" +
            "Bạn đang dùng phiên bản cũ.\\n" +
            "Nhấn OK để cập nhật ngay."
        );

        if (shouldUpdate) {
            await hardUpdate();
        } else {
            // Vẫn cho phép dùng tạm, nhưng cảnh báo
            showUpdateBanner();
        }
    }
}

async function hardUpdate() {
    try {
        // Xóa cache
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
        
        localStorage.clear();           // hoặc chỉ xóa key liên quan
        // indexedDB clear (nếu cần)
        if (window.indexedDB) {
            const dbs = await indexedDB.databases?.() || [];
            dbs.forEach(db => indexedDB.deleteDatabase(db.name));
        }

        // Hard reload bypass cache
        window.location.reload(true);
        // Hoặc cách mạnh hơn:
        // window.location.href = window.location.href + (window.location.href.includes('?') ? '&' : '?') + '_t=' + Date.now();
    } catch(e) {
        console.error(e);
        window.location.reload(true);
    }
}

function showUpdateBanner() {
    const banner = document.createElement('div');
    banner.style.cssText = \`
        position:fixed;top:0;left:0;right:0;background:#ff4444;color:white;
        padding:12px;text-align:center;z-index:2147483647;
        font-family:system-ui;
    \`;
    banner.innerHTML = \`
        🔄 Có phiên bản mới! 
        <button onclick="hardUpdate()" style="margin-left:15px;padding:6px 12px;background:white;color:#ff4444;border:none;border-radius:4px;cursor:pointer;">
            Cập nhật ngay
        </button>
    \`;
    document.body.prepend(banner);
}

// Chạy check sau khi trang load
window.addEventListener('load', () => {
    setTimeout(checkAndUpdate, 800);
});
</script>`;

    // Chèn script vào HTML
    if (html.includes('</body>')) {
        html = html.replace('</body>', versionScript + '</body>');
    } else {
        html += versionScript;
    }

    res.set({
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-App-Version": currentVersion   // cho dev dễ debug
    });

    res.send(html);
});

// Health check (thêm version)
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        version: currentVersion,
        versionShort: currentVersion.slice(0, 12),
        lastUpdated: new Date(lastFetchedAt).toISOString(),
        // ... các thông tin cũ
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
