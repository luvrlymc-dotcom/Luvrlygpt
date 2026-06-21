import express from "express";
import https from "https";
import http from "http";
import process from "process";
import compression from "compression";

// ====================== CONFIG ======================
const app = express();
const PORT = process.env.PORT || 3000;

// Gist RAW
const GIST_RAW_URL = "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/bc685b52428ec2d236e438f2bf2d18d6f48e329b/gistfile1.txt";

// Cache
let cachedHTML = "<h1>Server is starting...</h1>";
let lastHash = "";
let isFetching = false;
let fetchFailCount = 0;

// ====================== MIDDLEWARE ======================
app.use(compression());

app.use((req, res, next) => {
    res.setTimeout(25000, () => {
        res.status(503).send("Request timeout");
    });
    next();
});

// ====================== FETCH GIST ======================
async function fetchGist() {
    if (isFetching) return;
    isFetching = true;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(GIST_RAW_URL, {
            signal: controller.signal,
            headers: {
                "Cache-Control": "no-cache, no-store",
                "Pragma": "no-cache"
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP Status ${response.status}`);
        }

        const data = await response.text();

        if (!data || data.length < 1000) {
            throw new Error("Empty or too small content");
        }

        const hash = Buffer.from(data).toString("base64");

        if (hash !== lastHash) {
            cachedHTML = data;
            lastHash = hash;
            fetchFailCount = 0;
            console.log(`[GIST] Updated successfully • ${new Date().toLocaleTimeString()} • ${(data.length / 1024).toFixed(1)} KB`);
        }
    } catch (err) {
        fetchFailCount++;
        console.error(`[GIST ERROR] (${fetchFailCount}) ${err.message}`);

        if (fetchFailCount >= 5) {
            cachedHTML = `<h1 style="text-align:center;margin-top:20vh;color:#ff6666;">
                Cannot load page from Gist. Please try again later.
            </h1>`;
        }
    } finally {
        isFetching = false;
    }
}

// ====================== INITIAL + INTERVAL ======================
fetchGist();
setInterval(fetchGist, 40 * 1000);

// ====================== ROUTES ======================
app.get("/", async (req, res) => {
    // ==================== ERROR CASE ====================
    if (!cachedHTML || cachedHTML.length < 5000) {
        console.log(`[ERROR PAGE] Cache not ready → forcing reload...`);

        return res.status(503).send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đang tải lại trang...</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            text-align: center;
            padding: 50px 20px;
            background: #0f0f0f;
            color: #fff;
            margin: 0;
        }
        .loader {
            width: 50px;
            height: 50px;
            border: 5px solid #333;
            border-top: 5px solid #ff6666;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        h1 { color: #ff6666; }
        p { color: #aaa; max-width: 500px; margin: 20px auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="loader"></div>
    <h1>Đang tải lại nội dung...</h1>
    <p>Server đang fetch lại script từ Gist.<br>Trang sẽ tự động reload sau vài giây.</p>

    <script>
        async function forceReloadAndRefresh() {
            try {
                console.log("[AUTO] Calling /forcereload...");
                const response = await fetch('/forcereload', { 
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    console.log("[AUTO] Gist reloaded successfully");
                    setTimeout(() => window.location.reload(true), 1800);
                } else {
                    throw new Error(result.message || "Unknown error");
                }
            } catch (err) {
                console.error("[AUTO RELOAD ERROR]", err);
                setTimeout(() => window.location.reload(true), 3000);
            }
        }

        window.onload = forceReloadAndRefresh;

        // Backup retry
        setTimeout(() => {
            forceReloadAndRefresh();
        }, 8000);
    </script>
</body>
</html>
        `);
    }

    // ==================== NORMAL CASE ====================
    let html = cachedHTML;

    // ==================== DEBUG PANEL ====================
    const debugPanel = `
<!-- DEBUG PANEL - AUTO INJECTED -->
<div id="debug-panel" style="position:fixed;bottom:15px;left:15px;background:#1e1e1e;color:#ffcc00;padding:14px 20px;border-radius:10px;border:2px solid #ff4444;box-shadow:0 6px 25px rgba(255,70,70,0.4);font-family:system-ui;z-index:2147483647;display:none;flex-direction:column;gap:10px;min-width:280px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="color:#ff6666;">Trang không load? Thử các nút bên dưới:</strong>
        <button onclick="closeDebug()" style="background:none;border:none;color:#ff6666;font-size:22px;line-height:1;cursor:pointer;padding:0 6px;margin-top:-6px;">×</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
        <button onclick="resetLS()" style="padding:10px;">🔄 Reset LocalStorage</button>
        <button onclick="resetIDB()" style="padding:10px;">🗑️ Reset IndexedDB</button>
        <button onclick="reloadP()" style="padding:10px;">🔃 Reload Page</button>
        <button onclick="hardReset()" style="padding:10px;background:#ff4444;color:white;">💥 Hard Reset</button>
        <button onclick="bugReport()" style="padding:10px;background:#ff8800;color:white;grid-column:span 2;font-weight:bold;">
            🐞 Bug report! (Reload Gist)
        </button>
    </div>
</div>
<script>
function showDebug() { document.getElementById('debug-panel').style.display = 'flex'; }
function closeDebug() { document.getElementById('debug-panel').style.display = 'none'; }
function resetLS() { if(confirm('Reset LocalStorage?')) { localStorage.clear(); location.reload(true); }}
function resetIDB() { 
    if(!confirm('Reset IndexedDB?')) return;
    if(window.indexedDB && indexedDB.databases) indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
    setTimeout(() => location.reload(true), 1000);
}
function reloadP() { location.reload(true); }
function hardReset() { 
    if(!confirm('Hard Reset?')) return;
    localStorage.clear(); sessionStorage.clear();
    if(window.indexedDB && indexedDB.databases) indexedDB.databases().then(dbs => dbs.forEach(d => indexedDB.deleteDatabase(d.name)));
    setTimeout(() => location.reload(true), 800);
}
async function bugReport() {
    if(!confirm('Gửi Bug Report và reload từ Gist?')) return;
    try {
        const r = await fetch('/forcereload');
        const data = await r.json();
        if(data.success) {
            alert('✅ Đang reload...');
            setTimeout(() => location.reload(true), 2000);
        }
    } catch(e) { alert('❌ Lỗi khi reload'); }
}
</script>`;

    // Inject debug panel
    let injection = debugPanel;
    if (html.includes("</body>")) {
        html = html.replace("</body>", injection + "</body>");
    } else if (html.includes("</html>")) {
        html = html.replace("</html>", injection + "</html>");
    } else {
        html += injection;
    }

    res.set({
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    });

    res.send(html);
});

// ====================== FORCE RELOAD ======================
app.get("/forcereload", async (req, res) => {
    console.log(`🐞 [BUG REPORT] Force reload Gist at ${new Date().toISOString()}`);
    await fetchGist();
    res.json({
        success: true,
        message: "Gist reloaded",
        timestamp: new Date().toISOString(),
        htmlSizeKB: (cachedHTML.length / 1024).toFixed(1)
    });
});

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", fetchFailCount, uptime: process.uptime() });
});

// ====================== START SERVER ======================
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;

// ====================== RELOAD ENDPOINT ======================
app.get("/reload", async (req, res) => {
    const secret = req.query.secret || req.headers["x-reload-secret"];
    if (secret !== process.env.RELOAD_SECRET) {
        return res.status(401).send(`<h1 style="color:red;text-align:center;margin-top:20vh;">Unauthorized ❌</h1>`);
    }
    res.send(`<h1 style="text-align:center;margin-top:20vh;color:#ff4444;">Server đang restart...</h1>`);
    setTimeout(() => process.exit(0), 800);
});

// ====================== AUTO PING ======================
const PING_URL = process.env.RENDER_EXTERNAL_HOSTNAME
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/health`
    : `http://localhost:${PORT}/health`;

setInterval(() => {
    const protocol = PING_URL.startsWith("https") ? https : http;
    protocol.get(PING_URL, (res) => {
        console.log(`[AUTOPING] ${res.statusCode}`);
        res.resume();
    }).on("error", () => {});
}, 3 * 60 * 1000);
