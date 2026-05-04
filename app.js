import express from "express";
import https from "https";
import http from "http";
import os from "os";
import process from "process";


const app = express();
// Render thường cấp PORT qua env
const PORT = process.env.PORT || 3000;
const HOST = "127.0.0.1";

// 🔗 Gist RAW
const GIST_RAW_URL =
  "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/cd3fa697e7cfd3da471a2ee56920dec0915d8c5e/gistfile1.txt";

// ================= CACHE =================
let cachedHTML = "<h1>Loading...</h1>";
let lastHash = "";

// ================= FETCH GIST =================
function fetchGist() {
    const req = https.get(GIST_RAW_URL, (res) => {
        if (res.statusCode !== 200) {
            console.error("[GIST ERROR] Status:", res.statusCode);
            res.resume();
            return;
        }

        let data = "";

        res.on("data", chunk => data += chunk);

        res.on("end", () => {
            if (!data || data.length < 10) {
                console.error("[GIST ERROR] Empty or invalid data");
                return;
            }

            const hash = Buffer.from(data).toString("base64");

            if (hash !== lastHash) {
                cachedHTML = data;
                lastHash = hash;

                console.log(`[GIST] Updated @ ${new Date().toLocaleTimeString()}`);
            }
        });
    });

    // 🔥 timeout tránh treo
    req.setTimeout(5000, () => {
        console.error("[GIST ERROR] Timeout");
        req.destroy();
    });

    req.on("error", (err) => {
        console.error("[GIST ERROR]", err.message);
    });
}

// Fetch ngay khi start
fetchGist();

// Auto update mỗi 60s
setInterval(fetchGist, 60 * 1000);

// ================= ROUTES =================
// ================= ROUTES =================
app.get("/", (req, res) => {
    if (!cachedHTML || cachedHTML.length < 10) {
        return res.send("<h1>Server warming up...</h1>");
    }

    let html = cachedHTML;

    // === INJECT DEBUG PANEL ===
    const debugPanel = `
<!-- === DEBUG PANEL - AUTO INJECTED === -->
<div id="debug-panel" style="position:fixed;bottom:15px;left:15px;background:#1e1e1e;color:#ffcc00;padding:12px 18px;border-radius:8px;border:2px solid #ff6666;box-shadow:0 4px 20px rgba(255,102,102,0.3);font-family:system-ui;z-index:2147483647;display:none;flex-direction:column;gap:10px;min-width:260px;">
    <strong style="color:#ff6666;">Page didn't load?</strong>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px;">
        <button onclick="resetLS()" style="padding:8px;">🔄 Reset LocalStorage</button>
        <button onclick="resetIDB()" style="padding:8px;">🗑️ Reset Local DB</button>
        <button onclick="reloadP()" style="padding:8px;">🔃 Reload Page</button>
        <button onclick="hardReset()" style="padding:8px;background:#ff4444;color:white;">💥 Hard Reset</button>
    </div>
</div>

<script>
// Debug functions
function showDebug() {
    document.getElementById('debug-panel').style.display = 'flex';
}

function resetLS() {
    if(confirm('Reset LocalStorage?')) {
        localStorage.clear();
        location.reload(true);
    }
}

function resetIDB() {
    if(!confirm('Reset all IndexedDB?')) return;
    if(window.indexedDB) {
        indexedDB.databases?.().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
    }
    alert('reseting DB...');
    setTimeout(() => location.reload(true), 800);
}

function reloadP() {
    location.reload(true);
}

function hardReset() {
    if(!confirm('Hard Reset all page?')) return;
    document.body.innerHTML = '<h2 style="text-align:center;margin-top:20vh;color:#ff6666;">Resetting...</h2>';
    localStorage.clear();
    if(window.indexedDB) indexedDB.databases?.().then(dbs => dbs.forEach(d => indexedDB.deleteDatabase(d.name)));
    setTimeout(() => location.reload(true), 700);
}

// Tự động hiện panel sau 3.5 giây nếu trang load chậm
setTimeout(() => {
    if (document.readyState !== "complete" || document.body.children.length < 5) {
        showDebug();
    }
}, 3500);

// Nhấn Ctrl + Shift + D để hiện panel (rất tiện)
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        showDebug();
    }
});
</script>`;

    // Chèn trước </body> nếu có, nếu không thì chèn cuối
    if (html.includes('</body>')) {
        html = html.replace('</body>', debugPanel + '</body>');
    } else {
        html += debugPanel;
    }

    res.set({
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate"
    });

    res.send(html);
});

app.get("/health", (req, res) => {
    const cpus = os.cpus();

    const cpuUsage = cpus.map((cpu, i) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        return {
            core: i,
            model: cpu.model,
            speedMHz: cpu.speed,
            usagePercent: {
                user: ((cpu.times.user / total) * 100).toFixed(2),
                system: ((cpu.times.sys / total) * 100).toFixed(2),
                idle: ((cpu.times.idle / total) * 100).toFixed(2)
            }
        };
    });

    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),

        system: {
            platform: os.platform(),
            arch: os.arch(),
            uptimeSeconds: os.uptime(),
            loadAverage: os.loadavg(), // 1m, 5m, 15m
            totalMemoryMB: (os.totalmem() / 1024 / 1024).toFixed(2),
            freeMemoryMB: (os.freemem() / 1024 / 1024).toFixed(2),
            usedMemoryMB: ((os.totalmem() - os.freemem()) / 1024 / 1024).toFixed(2),
            cpuCores: cpus.length
        },

        process: {
            pid: process.pid,
            nodeVersion: process.version,
            memoryUsageMB: Object.fromEntries(
                Object.entries(process.memoryUsage()).map(
                    ([k, v]) => [k, (v / 1024 / 1024).toFixed(2)]
                )
            ),
            uptimeSeconds: process.uptime()
        },

        cpu: cpuUsage
    });
});


// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`🚀 Express running on port ${PORT}`);
});

// ================= AUTO PING =================
// ================= AUTO PING =================
const PING_URL =
  process.env.RENDER_EXTERNAL_HOSTNAME
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/health`
    : `http://localhost:${PORT}/health`;

setInterval(() => {
  const protocol = PING_URL.startsWith("https") ? https : http;

  protocol
    .get(PING_URL, (res) => {
      console.log(`[AUTOPING] ${res.statusCode} - ${PING_URL}`);
      res.resume();
    })
    .on("error", (err) => {
      console.error("[AUTOPING ERROR]", err.message, PING_URL);
    });
}, 1 * 60 * 1000); // 4 phút – tránh trùng giờ với cron của Render
