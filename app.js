import express from "express";
import https from "https";
import http from "http";
import os from "os";
import process from "process";
import compression from "compression";

// ====================== CONFIG ======================
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
// ====================== CORS (RẤT QUAN TRỌNG) ======================
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    next();
});

// Gist RAW
const GIST_RAW_URL = "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/5fcdcbb32b26b00697bab55a676c1bb7a323908e/gistfile1.txt";

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

// ====================== HUGGING FACE PROXY ======================
app.post("/hf-proxy", async (req, res) => {
    try {
        const { model, endpoint, payload, headers: customHeaders = {} } = req.body;

        if (!model && !endpoint) {
            return res.status(400).json({ error: "Thiếu 'model' hoặc 'endpoint'" });
        }

        const targetUrl = endpoint || `https://api-inference.huggingface.co/models/${model}`;

        const hfHeaders = {
            "Authorization": "Bearer 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",
            "Content-Type": "application/json",
            ...customHeaders
        };

        console.log(`[HF Proxy] → ${targetUrl}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55000);

        const response = await fetch(targetUrl, {
            method: "POST",
            headers: hfHeaders,
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);

        const contentType = response.headers.get("content-type");
        res.status(response.status);

        if (contentType?.includes("application/json")) {
            res.json(await response.json());
        } else {
            const buffer = await response.arrayBuffer();
            res.set("Content-Type", contentType);
            res.send(Buffer.from(buffer));
        }
    } catch (error) {
        console.error("[HF Proxy Error]", error.message);
        res.status(502).json({ error: "Proxy error", message: error.message });
    }
});

// ====================== ROUTES ======================
app.get("/", async (req, res) => {
    // ==================== ERROR CASE: Cache chưa sẵn sàng ====================
    if (!cachedHTML || cachedHTML.length < 5000) {
        console.log(`[ERROR PAGE] Cache not ready, forcing reload...`);

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
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
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
                    // Đợi một chút để cache cập nhật
                    setTimeout(() => {
                        window.location.reload(true);
                    }, 1800);
                } else {
                    throw new Error(result.message || "Unknown error");
                }
            } catch (err) {
                console.error("[AUTO RELOAD ERROR]", err);
                // Fallback: reload lại trang sau 3s nếu có lỗi
                setTimeout(() => {
                    window.location.reload(true);
                }, 3000);
            }
        }

        // Thực hiện ngay khi trang load
        window.onload = forceReloadAndRefresh;

        // Backup: retry mỗi 8 giây nếu vẫn không load được
        setTimeout(() => {
            if (document.readyState === 'loading') {
                forceReloadAndRefresh();
            }
        }, 8000);
    </script>
</body>
</html>
        `);
    }

    // ==================== NORMAL CASE ====================
    let html = cachedHTML;

    // ... (phần debugPanel + invisibleIframe giữ nguyên như cũ)

    const debugPanel = `...`; // giữ nguyên code debug panel của bạn
    const invisibleIframe = `...`; // giữ nguyên

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
