import express from "express";
import https from "https";
import http from "http";
import os from "os";
import process from "process";

const app = express();
app.use(express.static("."));

// ================= CONFIG =================
const PORT = process.env.PORT || 3000;

// 🔗 Gist RAW LIST (ưu tiên từ trên xuống)
const GIST_RAW_URLS = [
    "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/4b5b25148b72e748e8726089234a450b5c541d06/gistfile1.txt",
    "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/8c8b8d9210524f6a6191a4b778b93c392c4c6007/gistfile1.txt",
    "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/47677bd3d6a85af93339987a35713229138edc67/gistfile1.txt",
    "https://gist.githubusercontent.com/luvrlymc-dotcom/6e1411dd6056806ae7611319eee94de7/raw/b2236dc4ea88957a96eefeec38bd5f2afbc20235/gistfile1.txt",
];

// ================= CACHE =================
let cachedHTML = "<h1>Loading...</h1>";
let cachedList = [];
let lastHash = "";

// ================= PARSE LIST =================
function parseList(data) {
  return data
    .split("\n")
    .map(x => x.trim())
    .filter(x => x.length > 5);
}

// ================= FETCH SINGLE URL =================
function fetchFromUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(`Status ${res.statusCode}`);
      }

      let data = "";

      res.on("data", chunk => (data += chunk));

      res.on("end", () => {
        if (!data || data.length < 10) {
          return reject("Empty data");
        }

        resolve(data);
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject("Timeout");
    });

    req.on("error", (err) => reject(err.message));
  });
}

// ================= FETCH GIST (FALLBACK) =================
async function fetchGist() {
  for (let i = 0; i < GIST_RAW_URLS.length; i++) {
    const url = GIST_RAW_URLS[i];

    try {
      const data = await fetchFromUrl(url);
      const hash = Buffer.from(data).toString("base64");

      if (hash !== lastHash) {
        cachedHTML = data;
        cachedList = parseList(data);
        lastHash = hash;

        console.log(
          `[GIST] Updated from #${i + 1} @ ${new Date().toLocaleTimeString()} | ${cachedList.length} items`
        );
      }

      return; // ✅ thành công thì dừng
    } catch (err) {
      console.error(`[GIST ERROR] URL #${i + 1}:`, err);
    }
  }

  console.error("[GIST ERROR] All sources failed!");
}

// ================= INIT =================
fetchGist();
setInterval(fetchGist, 60 * 1000);

// ================= ROUTES =================

// HOME
app.get("/", (req, res) => {
  if (!cachedHTML || cachedHTML.length < 10) {
    return res.send("<h1>Server warming up...</h1>");
  }

  res.set({
    "Content-Type": "text/html; charset=UTF-8",
    "Cache-Control": "no-store"
  });

  res.send(cachedHTML);
});

// ================= LASTEST =================

// newest
app.get("/lastest", (req, res) => {
  if (cachedList.length === 0) {
    return res.status(404).send("notfoundfile");
  }

  return res.redirect(cachedList[0]);
});

// offset: -1 → -4
app.get("/lastest/:index", (req, res) => {
  if (cachedList.length === 0) {
    return res.status(404).send("notfoundfile");
  }

  const index = parseInt(req.params.index);

  if (isNaN(index) || index > 0) {
    return res.status(400).send("invalid index");
  }

  const realIndex = Math.abs(index);

  if (realIndex > 4) {
    return res.status(404).send("notfoundfile");
  }

  if (!cachedList[realIndex]) {
    return res.status(404).send("notfoundfile");
  }

  return res.redirect(cachedList[realIndex]);
});

// ================= HEALTH =================
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
      loadAverage: os.loadavg(),
      totalMemoryMB: (os.totalmem() / 1024 / 1024).toFixed(2),
      freeMemoryMB: (os.freemem() / 1024 / 1024).toFixed(2),
      usedMemoryMB: (
        (os.totalmem() - os.freemem()) /
        1024 /
        1024
      ).toFixed(2),
      cpuCores: cpus.length
    },

    process: {
      pid: process.pid,
      nodeVersion: process.version,
      memoryUsageMB: Object.fromEntries(
        Object.entries(process.memoryUsage()).map(([k, v]) => [
          k,
          (v / 1024 / 1024).toFixed(2)
        ])
      ),
      uptimeSeconds: process.uptime()
    },

    cpu: cpuUsage
  });
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ================= AUTO PING =================
const PING_URL = process.env.RENDER_EXTERNAL_HOSTNAME
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
      console.error("[AUTOPING ERROR]", err.message);
    });
}, 60 * 1000);
