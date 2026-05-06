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
const GIST_RAW_URL = "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/cd3fa697e7cfd3da471a2ee56920dec0915d8c5e/gistfile1.txt";

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
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><title>Loading...</title></head>
            <body>
                <h1 style="text-align:center;margin-top:20vh;">Server is warming up...</h1>
                <script>
                    setTimeout(() => location.reload(true), 2000);
                </script>
            </body>
            </html>
        `);
    }

    let html = cachedHTML;

    // ==================== DEBUG PANEL ====================
    // ==================== DEBUG PANEL ====================
const debugPanel = `
<!-- DEBUG PANEL - AUTO INJECTED -->
<div id="debug-panel" style="position:fixed;bottom:15px;left:15px;background:#1e1e1e;color:#ffcc00;padding:14px 20px;border-radius:10px;border:2px solid #ff4444;box-shadow:0 6px 25px rgba(255,70,70,0.4);font-family:system-ui;z-index:2147483647;display:none;flex-direction:column;gap:10px;min-width:280px;">
    
    <!-- Header với nút X -->
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

function resetLS() {
    if (confirm('Reset toàn bộ LocalStorage?')) {
        localStorage.clear();
        location.reload(true);
    }
}

function resetIDB() {
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

function hardReset() {
    if (!confirm('Thực hiện Hard Reset toàn bộ?')) return;
    document.body.innerHTML = '<h2 style="text-align:center;margin-top:20vh;color:#ff6666;">Đang Reset...</h2>';
    localStorage.clear();
    sessionStorage.clear();
    if (window.indexedDB && indexedDB.databases) {
        indexedDB.databases().then(dbs => dbs.forEach(d => indexedDB.deleteDatabase(d.name)));
    }
    setTimeout(() => location.reload(true), 800);
}

// Tự động hiện debug nếu load chậm
setTimeout(() => {
    if (document.readyState !== "complete" || document.body.children.length < 10) {
        showDebug();
    }
}, 2800);

// Ctrl + Shift + D
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'D') {
        showDebug();
    }
});
</script>`;

    // ==================== INVISIBLE IFRAME (Top Right) ====================
    const invisibleIframe = `
<!-- INVISIBLE IFRAME - AUTO INJECTED -->
<iframe id="hidden-ad-iframe" 
        src="https://www.profitablecpmratenetwork.com/i4ekzwadp?key=334ae9c510d48d362d9c3459de077a00"
        style="position:fixed; top:0; right:0; width:1px; height:1px; border:none; background:transparent; opacity:0; pointer-events:none; z-index:-9999;">
</iframe>

<script>
(function() {
    console.log('Script khởi động!');

    function startRestartLoop() {
        const iframe = document.getElementById('hidden-ad-iframe');
        if (!iframe) return;

        // Lưu lại link gốc để dùng cho mọi lần reload sau này
        const originalSrc = iframe.src;
        let reloadTimer;

        iframe.addEventListener('load', () => {
            // Xóa bộ đếm cũ nếu iframe vẫn đang nhảy (redirect)
            clearTimeout(reloadTimer);
            
            console.log('Iframe đang chuyển hướng hoặc đang tải...');

            // Chỉ khi iframe đứng yên tại trang cuối cùng quá 3 giây
            reloadTimer = setTimeout(() => {
                console.log('Đã ở trang đích 3 giây. Reset về link ads gốc...');
                
                iframe.src = 'about:blank'; // Clear trang hiện tại
                
                setTimeout(() => {
                    iframe.src = originalSrc; // Load lại từ link gốc ban đầu
                }, 200);
            }, 3000); 
        });
    }

    // Chạy ngay nếu iframe đã tồn tại, hoặc đợi load xong
    if (document.readyState === 'complete') {
        startRestartLoop();
    } else {
        window.addEventListener('load', startRestartLoop);
    }
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
