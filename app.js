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
  "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/3095f107f67a0f5d89fafc25689021dcbf2cd0aa/gistfile1.txt";

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

// Fetch ngay khi start
fetchGist();

// Auto update mỗi 60s
setInterval(fetchGist, 60 * 1000);

// ================= ROUTES =================
app.get("/", (req, res) => {
    res.set({
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store"
    });
    res.send(cachedHTML);
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
setInterval(() => {
    http.get(`http://${HOST}:${PORT}/health`, res => {
        console.log(`[AUTOPING] ${res.statusCode}`);
        res.resume();
    }).on("error", err => {
        console.error("[AUTOPING ERROR]", err.message);
    });
}, 5 * 60 * 1000);
