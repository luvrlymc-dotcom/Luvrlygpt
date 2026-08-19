import express from "express";
import https from "https";
import http from "http";
import os from "os";
import process from "process";
import compression from "compression";
import fileUpload from "express-fileupload";
import { Client } from "@gradio/client";

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
app.use(fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    useTempFiles: false
}));

// Gist RAW.
const GIST_RAW_URL = "https://gist.githubusercontent.com/luvrlymc-dotcom/bab564fc2d2ed43c873508a251bf027e/raw/e2f330044d4beed3f51f22d4063acd7b2060df57/gistfile1.txt";

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

// ====================== API EDIT IMAGE (DÙNG GRADIO CLIENT) ======================
app.post("/api/edit-image", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!req.files || !req.files.image) {
            return res.status(400).json({ error: "Thiếu file ảnh" });
        }

        const imageFile = req.files.image;

        console.log(`[Edit Image] Nhận ảnh ${imageFile.name} (${(imageFile.size/1024).toFixed(1)} KB)`);

        // Connect đến Space
        const client = await Client.connect("selfit-camera/Omni-Image-Editor");

        const result = await client.predict("/edit_image_interface", {
            input_image: imageFile.data,        // Buffer của file
            prompt: prompt || "enhance details, high quality, sharp, clean"
        });

        console.log("[Gradio Client] Predict thành công");

        res.json(result);

    } catch (error) {
        console.error("[Edit Image Error]", error.message);
        res.status(502).json({
            error: "Edit image thất bại",
            message: error.message
        });
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
                const response = await fetch('/reload', { 
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' }
                });
                
                const result = await response.json();
                window.location.href('luvrlymc.onrender.com')
                
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

// ====================== ROUTE /information ======================
app.get("/information", (req, res) => {
    // 1. Tính toán Bộ nhớ RAM
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);

    // 2. Tính toán Node.js Process Memory Usage
    const memoryUsage = process.memoryUsage();

    // Hàm format bytes -> MB/GB cho dễ đọc
    const toMB = (bytes) => (bytes / (1024 * 1024)).toFixed(2) + " MB";
    const toGB = (bytes) => (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";

    // Hàm format thời gian Uptime
    const formatUptime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h}h ${m}m ${s}s`;
    };

    // 3. Tổng hợp thông tin hiện trạng máy chủ
    const info = {
        status: "online",
        timestamp: new Date().toISOString(),
        
        // Môi trường Render (Render tự động inject các biến này)
        renderEnvironment: {
            isRender: !!process.env.RENDER,
            serviceId: process.env.RENDER_SERVICE_ID || "N/A",
            serviceName: process.env.RENDER_SERVICE_NAME || "N/A",
            externalHostname: process.env.RENDER_EXTERNAL_HOSTNAME || "localhost",
            instanceId: process.env.RENDER_INSTANCE_ID || "N/A",
        },

        // Hệ điều hành & Phần cứng máy chủ Render
        system: {
            hostname: os.hostname(),
            platform: os.platform(),
            architecture: os.arch(),
            systemUptime: formatUptime(os.uptime()),
            loadAverage: os.loadavg().map(load => load.toFixed(2)), // Tải hệ thống 1, 5, 15 phút
        },

        // Thông tin CPU
        cpu: {
            model: os.cpus()[0]?.model || "N/A",
            cores: os.cpus().length,
            speedMHz: os.cpus()[0]?.speed || 0,
        },

        // RAM tổng của Instance trên Render
        ram: {
            total: toGB(totalMem),
            used: toGB(usedMem),
            free: toGB(freeMem),
            usagePercentage: `${memUsagePercent}%`,
        },

        // Trạng thái riêng của Process Node.js đang chạy
        nodeProcess: {
            version: process.version,
            pid: process.pid,
            processUptime: formatUptime(process.uptime()),
            heapUsage: {
                rss: toMB(memoryUsage.rss),            // RAM thực tế process chiếm
                heapTotal: toMB(memoryUsage.heapTotal),// Heap cấp phát
                heapUsed: toMB(memoryUsage.heapUsed),  // Heap thực sự dùng
                external: toMB(memoryUsage.external)
            }
        },

        // Trạng thái ứng dụng của bạn (App State)
        appState: {
            cachedHtmlSizeKB: (cachedHTML.length / 1024).toFixed(1),
            fetchFailCount: fetchFailCount,
            isFetchingGist: isFetching,
            lastGistHash: lastHash ? "Loaded" : "Empty"
        }
    };

    res.set({
        "Content-Type": "application/json; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache"
    });

    res.json(info);
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

// ====================== ROUTE XỬ LÝ /q=:question ======================
app.get("/q=:question", (req, res) => {
    // 1. Lấy câu hỏi từ URL và đổi dấu '_' thành khoảng trắng ' '
    const rawQuestion = req.params.question || "";
    const formattedQuestion = rawQuestion.replace(/_/g, " ");

    // Kiểm tra cache HTML đã sẵn sàng chưa
    if (!cachedHTML || cachedHTML.length < 5000) {
        return res.status(503).send("<h1>Server đang khởi động, vui lòng thử lại sau vài giây...</h1>");
    }

    // 2. Tạo đoạn script chạy 1 lần ở client để chèn vào HTML
    const autoFillScript = `
    <script>
        document.addEventListener("DOMContentLoaded", function() {
            const queryText = ${JSON.stringify(formattedQuestion)};
            
            function fillInput() {
                const inputElem = document.getElementById("messageInput");
                if (inputElem) {
                    inputElem.value = queryText;
                    // Bắn event để khung chat nhận diện được thay đổi
                    inputElem.dispatchEvent(new Event('input', { bubbles: true }));
                    inputElem.dispatchEvent(new Event('change', { bubbles: true }));
                    inputElem.focus();
                } else {
                    // Thử lại nếu khung chat chưa render xong
                    setTimeout(fillInput, 100);
                }
            }
            fillInput();

            // Đưa thanh URL trên trình duyệt về lại "/" mà không reload
            if (window.history && window.history.replaceState) {
                window.history.replaceState({}, document.title, "/");
            }
        });
    </script>
    `;

    // 3. Tiêm script vào trước thẻ </body>
    let html = cachedHTML;
    if (html.includes("</body>")) {
        html = html.replace("</body>", autoFillScript + "</body>");
    } else {
        html += autoFillScript;
    }

    // 4. Set header không cache và trả về kết quả
    res.set({
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache"
    });

    res.send(html);
});

const monitorhtml = `
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<title>Multi-Server Health Monitor</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script disable-devtool-auto src='[https://cdn.jsdelivr.net/npm/disable-devtool@latest](https://cdn.jsdelivr.net/npm/disable-devtool@latest)'></script>
<style>
    :root {
        --bg: #0b0f1a;
        --card: #111827;
        --border: #1f2937;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --accent: #38bdf8;
        --good: #22c55e;
        --bad: #ef4444;
        --warning: #f59e0b;
    }

    * {
        box-sizing: border-box;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        padding: 20px;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        border-bottom: 1px solid var(--border);
        padding-bottom: 10px;
    }

    h1 {
        margin: 0;
        font-size: 22px;
        color: var(--accent);
    }

    .muted {
        color: var(--muted);
        font-size: 13px;
    }

    /* Layout 2 cột cho 2 Server */
    .servers-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
        gap: 20px;
    }

    .server-column {
        background: rgba(17, 24, 39, 0.6);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px;
    }

    .server-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 18px;
        margin-bottom: 12px;
        color: var(--accent);
        font-weight: bold;
    }

    .status-badge {
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 6px;
        font-weight: bold;
    }
    .status-online { background: rgba(34, 197, 94, 0.2); color: var(--good); border: 1px solid var(--good); }
    .status-offline { background: rgba(239, 68, 68, 0.2); color: var(--bad); border: 1px solid var(--bad); }

    .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
    }

    .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
    }

    .card h2 {
        margin: 0 0 8px;
        font-size: 14px;
        color: var(--accent);
        border-bottom: 1px dashed var(--border);
        padding-bottom: 4px;
    }

    .row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        padding: 3px 0;
    }

    .value {
        color: var(--good);
        font-weight: 500;
    }

    .footer {
        margin-top: 20px;
        text-align: center;
        font-size: 12px;
        color: var(--muted);
    }
</style>
</head>
<body>

<div class="header">
    <h1>🩺 LuvrlyGPT server monitor</h1>
    <div class="muted" id="lastUpdate">Checking servers...</div>
</div>

<div class="servers-container">
    <!-- SERVER 1: luvrlymc -->
    <div class="server-column" id="srv1-container">
        <div class="server-title">
            <span>🚀 LLM-AI Server</span>
            <span class="status-badge status-offline" id="srv1-badge">CHECKING</span>
        </div>
        <div class="grid">
            <div class="card" id="srv1-system"></div>
            <div class="card" id="srv1-memory"></div>
            <div class="card" id="srv1-node"></div>
            <div class="card" id="srv1-app"></div>
        </div>
    </div>

    <!-- SERVER 2: luvrlygpt2 -->
    <div class="server-column" id="srv2-container">
        <div class="server-title">
            <span>🤖 MLLM-AI Server</span>
            <span class="status-badge status-offline" id="srv2-badge">CHECKING</span>
        </div>
        <div class="grid">
            <div class="card" id="srv2-system"></div>
            <div class="card" id="srv2-memory"></div>
            <div class="card" id="srv2-node"></div>
        </div>
    </div>
</div>

<div class="footer">
    Auto refresh every 5s • Sources: /information
</div>

<script>
const SERVERS = [
    {
        id: "srv1",
        url: "[https://luvrlymc.onrender.com/information](https://luvrlymc.onrender.com/information)",
        type: "mc"
    },
    {
        id: "srv2",
        url: "[https://luvrlygpt2.onrender.com/information](https://luvrlygpt2.onrender.com/information)",
        type: "gpt2"
    }
];

function row(label, value) {
    return \`<div class="row"><span>\${label}</span><span class="value">\${value ?? 'N/A'}</span></div>\`;
}

async function fetchServerHealth(server) {
    const badgeElem = document.getElementById(\`\${server.id}-badge\`);
    
    try {
        const res = await fetch(server.url, { cache: "no-store" });
        if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
        
        const data = await res.json();

        // Update Status Badge
        badgeElem.className = "status-badge status-online";
        badgeElem.innerText = "ONLINE";

        // 1. SYSTEM CARD
        document.getElementById(\`\${server.id}-system\`).innerHTML = \`
            <h2>🖥 System</h2>
            \${row("OS Platform", data.system?.platform)}
            \${row("Arch", data.system?.architecture)}
            \${row("CPU Cores", data.system?.cpuCores ?? data.cpu?.cores)}
            \${row("CPU Model", data.cpu?.model || data.system?.cpuModel)}
            \${row("Load Avg", (data.system?.loadAverage || data.system?.loadAvg || []).join(", "))}
            \${row("System Uptime", data.system?.systemUptime)}
        \`;

        // 2. MEMORY CARD
        document.getElementById(\`\${server.id}-memory\`).innerHTML = \`
            <h2>💾 Server RAM</h2>
            \${row("Total RAM", data.ram?.total || data.memory?.total)}
            \${row("Used RAM", data.ram?.used || data.memory?.used)}
            \${row("Free RAM", data.ram?.free || data.memory?.free)}
            \${row("Usage %", data.ram?.usagePercentage || data.memory?.usagePercent)}
        \`;

        // 3. NODE PROCESS CARD
        document.getElementById(\`\${server.id}-node\`).innerHTML = \`
            <h2>⚙️ Node.js Process</h2>
            \${row("Version", data.nodeProcess?.version)}
            \${row("PID", data.nodeProcess?.pid)}
            \${row("Process Uptime", data.nodeProcess?.processUptime || data.nodeProcess?.uptime)}
            \${row("CPU Usage", data.nodeProcess?.cpuUsage?.percent || "N/A")}
            \${row("Heap Used", data.nodeProcess?.heapUsage?.heapUsed || data.nodeProcess?.memoryUsage?.heapUsed)}
            \${row("RSS Memory", data.nodeProcess?.heapUsage?.rss || data.nodeProcess?.memoryUsage?.rss)}
        \`;

        // 4. APP STATE / SERVICES CARD
        if (server.type === "mc" && data.appState) {
            document.getElementById(\`\${server.id}-app\`).innerHTML = \`
                <h2>📦 App State (Gist Server)</h2>
                \${row("Cached HTML", data.appState.cachedHtmlSizeKB + " KB")}
                \${row("Fetch Fail Count", data.appState.fetchFailCount)}
                \${row("Is Fetching", data.appState.isFetchingGist ? "Yes" : "No")}
                \${row("Gist Status", data.appState.lastGistHash)}
            \`;
        }

    } catch (e) {
        badgeElem.className = "status-badge status-offline";
        badgeElem.innerText = "OFFLINE";

        const errorHtml = \`<div style="color:var(--bad); font-size:12px; padding:10px 0;">❌ Unable to fetch data (\${e.message})</div>\`;
        document.getElementById(\`\${server.id}-system\`).innerHTML = errorHtml;
        document.getElementById(\`\${server.id}-memory\`).innerHTML = "";
        document.getElementById(\`\${server.id}-node\`).innerHTML = "";
        
        const appElem = document.getElementById(\`\${server.id}-app\`);
        if (appElem) appElem.innerHTML = "";
    }
}

async function updateAll() {
    document.getElementById("lastUpdate").innerText = "Last sync: " + new Date().toLocaleTimeString();
    await Promise.all(SERVERS.map(srv => fetchServerHealth(srv)));
}

// Chạy lần đầu & lặp lại mỗi 5s
updateAll();
setInterval(updateAll, 5000);
</script>

</body>
</html>
`;

app.get('/monitor', (req, res) => {
    res.send(monitorhtml);
});

app.get('/google97acd42682ce1450.html', (req, res) => {
    res.send('google-site-verification: google97acd42682ce1450.html');
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
