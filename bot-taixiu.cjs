const WebSocket = require("ws");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ===== CONFIG =====
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID =
  process.env.TELEGRAM_CHAT_ID_TAIXIU ||
  process.env.TELEGRAM_CHAT_ID_TX ||
  process.env.TELEGRAM_CHAT_ID ||
  "";
const BASE_BET = Number(process.env.BASE_BET_TAIXIU || process.env.BASE_BET_TX || process.env.BASE_BET || 10000);
const DISABLE_TELEGRAM = process.env.DISABLE_TELEGRAM === "1";
const TELEGRAM_ENABLED = !DISABLE_TELEGRAM && Boolean(TOKEN && CHAT_ID);

if (!TELEGRAM_ENABLED) {
  console.warn("Telegram disabled for TAIXIU (missing token/chat or DISABLE_TELEGRAM=1)");
}

// ===== STATE =====
let loseStreak = 0;
let profit = 0;
let win = 0;
let lose = 0;

let lastSession = null;
let lastResultSession = null;
let predictSide = null;
let streak = 0;

const STATS_DIR = path.join(__dirname, "public", "stats");
const STATS_FILE = path.join(STATS_DIR, "taixiu.json");
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 180;
const history = [];
const seenSessions = new Set();

function pruneHistory(entries) {
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  return entries.filter((entry) => Number(entry?.timestamp || 0) >= cutoff);
}

function loadStateFromFile() {
  try {
    if (!fs.existsSync(STATS_FILE)) return;
    const raw = fs.readFileSync(STATS_FILE, "utf8");
    const parsed = JSON.parse(raw);

    const totals = parsed?.totals || {};
    win = Number(totals.win || 0);
    lose = Number(totals.lose || 0);
    profit = Number(totals.profit || 0);
    streak = Number(totals.currentStreak || 0);

    const existingHistory = pruneHistory(Array.isArray(parsed?.history) ? parsed.history : []);
    existingHistory.slice(-MAX_HISTORY).forEach((entry) => {
      if (!entry || entry.session === undefined || entry.session === null) return;
      history.push(entry);
      seenSessions.add(String(entry.session));
    });

    const state = parsed?.state || {};
    loseStreak = Number.isFinite(Number(state.loseStreak)) ? Number(state.loseStreak) : 0;
    predictSide = typeof state.predictSide === "string" ? state.predictSide : predictSide;
    lastSession = state.lastSession ?? lastSession;
    lastResultSession = state.lastResultSession ?? lastResultSession;
  } catch (err) {
    console.error("Load taixiu stats failed:", err?.message || err);
  }
}

function writeStatsFile(entry) {
  const sessionKey = String(entry?.session ?? "");
  if (sessionKey && seenSessions.has(sessionKey)) {
    return;
  }

  history.push(entry);
  if (sessionKey) seenSessions.add(sessionKey);
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  while (history.length > 0 && Number(history[0]?.timestamp || 0) < cutoff) {
    const dropped = history.shift();
    if (dropped?.session !== undefined && dropped?.session !== null) {
      seenSessions.delete(String(dropped.session));
    }
  }
  if (history.length > MAX_HISTORY) {
    const dropped = history.shift();
    if (dropped?.session !== undefined && dropped?.session !== null) {
      seenSessions.delete(String(dropped.session));
    }
  }

  const totalRounds = win + lose;
  const payload = {
    game: "taixiu",
    updatedAt: new Date().toISOString(),
    maxHistory: MAX_HISTORY,
    totals: {
      rounds: totalRounds,
      win,
      lose,
      winRate: winrate(),
      profit,
      currentStreak: streak,
      nextBet: nextMoney(),
      lastSession: entry.session,
    },
    state: {
      loseStreak,
      predictSide,
      streak,
      lastSession,
      lastResultSession,
    },
    history,
  };

  try {
    fs.mkdirSync(STATS_DIR, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.error("Write taixiu stats failed:", err?.message || err);
  }
}

// ===== MONEY =====
function money() {
  return BASE_BET * Math.pow(2, loseStreak);
}

function nextMoney() {
  return BASE_BET * Math.pow(2, loseStreak + 1);
}

function winrate() {
  const t = win + lose;
  return t === 0 ? 0 : Math.round((win / t) * 100);
}

// ===== EMOJI =====
function toEmoji(str) {
  const map = {
    "0": "0️⃣",
    "1": "1️⃣",
    "2": "2️⃣",
    "3": "3️⃣",
    "4": "4️⃣",
    "5": "5️⃣",
    "6": "6️⃣",
  };

  return str
    .split("")
    .map((c) => map[c] || c)
    .join("");
}

// ===== SLOGAN =====
const slogans = [
  "🔥 Gặp cầu mà không dám bước thì khát nước chỉ có bán nhà 🔥",
  "🤣 Gặp kèo thơm mà không húp thì chỉ còn hít drama",
  "💸 Không dám liều thì đừng mơ giàu",
  "😎 Không dám thử thì thành công là của người ta",
  "🚀 Gặp sóng mà không lướt thì về bờ chỉ có lướt Facebook",
  "❤️ Thấy crush mà không tán thì tối về chỉ có tự than",
  "📉 Cơ hội không nắm thì nghèo là đúng quy trình",
  "⚠️ Sợ sai không làm thì sai cả đời",
  "🔥 Gặp việc khó mà né thì dễ cũng chẳng tới lượt",
  "💰 Muốn có tiền mà ngại làm thì tiền nó cũng ngại bạn",
  "😆 Không kiếm tiền online thì offline cũng đói",
  "📊 Không dám đầu tư thì chỉ có đầu hàng",
  "😭 Ví mỏng không phải tại số mà tại chưa chịu cố",
  "💼 Không kiếm thêm thu nhập thì chỉ thêm thu sầu",
  "🏋️‍♂️ Kiếm tiền như tập gym: đau lúc đầu, sướng về sau",
  "😎 Không dám mơ thì tối ngủ cũng không có gì để nghĩ",
  "🔥 Không dám bước thì đứng đó mà tiếc",
  "💣 Lười hôm nay thì mai càng mệt",
  "😅 Không chịu thay đổi thì chỉ có đổi... nỗi buồn",
  "🤣 Gặp cơ hội mà chần chừ thì người khác chốt đơn hộ",
  "💥 Không dám liều thì mãi nghèo",
  "😤 Sợ thua thì đừng chơi",
  "🔥 Đã vào kèo là phải cháy",
  "💸 Tiền không tự đến, phải liều mới có",
  "😎 Người giàu họ liều, người nghèo họ nghĩ",
  "⚡ Chậm 1 nhịp là mất kèo",
  "🔥 Không all-in thì không bao giờ win",
  "💰 Đánh là phải có chiến thuật",
  "💣 Thua không sợ, chỉ sợ không dám gỡ",
  "😆 Đời cho cơ hội, không lấy là lỗi bạn",
  "🚀 Có kèo là phải chiến",
  "🔥 Sợ thua thì tắt máy ngủ",
  "💸 Đã nghèo còn không dám liều thì chịu",
  "😎 Thắng là do bản lĩnh, thua là do chưa đủ đô",
  "📊 Không tính toán thì chỉ có toang",
  "💥 Kèo đẹp không đợi người chậm",
  "🔥 Không chơi thì thôi, chơi là phải tới",
  "😤 Không liều thì mãi làm người xem",
  "💰 Có tiền là có tất cả",
  "🚀 Đời không cho không ai cái gì",
  "🔥 Chơi là phải có tâm lý thép",
  "💣 Đã vào là không quay đầu",
  "😎 Kèo này không ăn thì kèo nào ăn",
  "💸 Không đánh thì không bao giờ trúng",
  "🔥 Đã chọn thì không hối hận",
  "😆 Đánh là phải dứt khoát",
  "🚀 Cơ hội chỉ đến với người dám",
  "💥 Đừng để cơ hội thành tiếc nuối",
  "🔥 Đời là chuỗi all-in",
  "💰 Không làm thì không có ăn",
];

function getSlogan() {
  return `\n🔥🔥🔥 SLOGAN 🔥🔥🔥\n👉 ${slogans[Math.floor(Math.random() * slogans.length)]}`;
}

// ===== BOT =====
async function send(msg) {
  if (!TELEGRAM_ENABLED) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: msg,
    });
  } catch (err) {
    const reason = err?.response?.data?.description || err?.message || "unknown error";
    console.error("Telegram send failed:", reason);
  }
}

function predict() {
  return Math.random() > 0.5 ? "TÀI" : "XỈU";
}

// ===== MAIN =====
async function run() {
  loadStateFromFile();

  const base = "https://taixiu.apiquadautayshelby.vip/signalr";
  const hub = "luckydiceHub";

  const nego = await axios.get(`${base}/negotiate`, {
    params: {
      clientProtocol: 1.5,
      connectionData: JSON.stringify([{ name: hub }]),
    },
  });

  const ws = new WebSocket(
    `${base}/connect?transport=webSockets` +
      `&clientProtocol=1.5` +
      `&connectionToken=${encodeURIComponent(nego.data.ConnectionToken)}` +
      `&connectionData=${encodeURIComponent(JSON.stringify([{ name: hub }]))}`
  );

  ws.on("open", () => {
    console.log("TAIXIU Connected");

    ws.send(
      JSON.stringify({
        H: hub,
        M: "Subscribe",
        A: [],
        I: 0,
      })
    );
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (!msg.M) return;

      msg.M.forEach((item) => {
        if (item.M !== "sessionInfo") return;

        const info = item.A?.[0];
        if (!info) return;

        const session = info.SessionID;
        if (session == null) return;

        if (session !== lastSession) {
          lastSession = session;
          if (!predictSide) {
            predictSide = predict();
          }
        }

        if (!info.Result) return;

        const d = info.Result;

        if (typeof d === "object" && d.Dice1 === -1) return;
        if (d === -1) return;

        if (lastResultSession === session) return;
        lastResultSession = session;

        let sum;
        let displayRaw;

        if (typeof d === "object") {
          sum = Number(d.Dice1) + Number(d.Dice2) + Number(d.Dice3);
          displayRaw = `${d.Dice1}${d.Dice2}${d.Dice3}`;
        } else {
          sum = Number(d);
          displayRaw = `${sum}`;
        }

        if (!Number.isFinite(sum)) return;

        const result = sum >= 11 ? "TÀI" : "XỈU";
        const displayEmoji = toEmoji(displayRaw);
        let status = "PENDING";

        if (!predictSide) {
          predictSide = predict();
          writeStatsFile({
            session,
            side: result,
            label: result,
            value: sum,
            display: displayEmoji,
            status,
            bet: 0,
            change: 0,
            timestamp: Date.now(),
          });
          return;
        }

        const bet = money();
        let change;

        if (predictSide === result) {
          change = bet;
          profit += bet;
          loseStreak = 0;
          win++;
          streak = streak >= 0 ? streak + 1 : 1;
          status = "WIN";
        } else {
          change = -bet;
          profit -= bet;
          loseStreak++;
          lose++;
          streak = streak <= 0 ? streak - 1 : -1;
          status = "LOSE";
        }

        writeStatsFile({
          session,
          side: result,
          label: result,
          value: sum,
          display: displayEmoji,
          status,
          bet,
          change,
          timestamp: Date.now(),
        });

        const statusText = status === "WIN" ? "✅ Thắng" : "❌ Thua";

        const nextPredict = predict();
        predictSide = nextPredict;

        send(
          `🎲 TÀI XỈU | Phiên: ${session}\n\n🚦 Phiên vừa xong: ${result} - ${displayEmoji}\n🔹 Kết quả: ${statusText}\n🔸 Tổng thắng: ${win}\n🔸 Tổng thua: ${lose}\n\n🔈 Mọi người hãy đặt cược: ${nextPredict}\n➡️ Số tiền đánh: ${nextMoney().toLocaleString()}\n\n💰 Tổng lãi: ${profit.toLocaleString()}\n🔍 Tỉ lệ win: ${winrate()}%\n\n🕑 Chờ kết quả...\n⏳${getSlogan()}`
        );
      });
    } catch {
      // Ignore malformed packets.
    }
  });

  ws.on("close", () => {
    console.log("Reconnect TAIXIU...");
    setTimeout(run, 3000);
  });

  ws.on("error", (err) => {
    console.error("TAIXIU ws error:", err?.message || err);
  });
}

run().catch((err) => {
  console.error("TAIXIU crashed:", err?.message || err);
  setTimeout(run, 3000);
});
