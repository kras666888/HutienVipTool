const WebSocket = require("ws");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ===== CONFIG =====
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID_XOCDIA || process.env.TELEGRAM_CHAT_ID || "";
const BASE_BET = Number(process.env.BASE_BET_XOCDIA || process.env.BASE_BET || 10000);
const DISABLE_TELEGRAM = process.env.DISABLE_TELEGRAM === "1";
const TELEGRAM_ENABLED = !DISABLE_TELEGRAM && Boolean(TOKEN && CHAT_ID);

if (!TELEGRAM_ENABLED) {
  console.warn("Telegram disabled for XOCDIA (missing token/chat or DISABLE_TELEGRAM=1)");
}

// ===== STATE =====
let loseStreak = 0;
let profit = 0;
let win = 0;
let lose = 0;

let predictSide = null;
let localSession = 0;
let lastRoundKey = null;

const CARD_DIR = path.join(__dirname, "cards");
const CARD_FILE = {
  CHAN: path.join(CARD_DIR, "chan.png"),
  LE: path.join(CARD_DIR, "le.png"),
};
const STATS_DIR = path.join(__dirname, "public", "stats");
const STATS_FILE = path.join(STATS_DIR, "xocdia.json");
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 180;
const history = [];
const seenSessions = new Set();
let streak = 0;

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
    localSession = Number.isFinite(Number(state.localSession)) ? Number(state.localSession) : localSession;
    lastRoundKey = state.lastRoundKey || lastRoundKey;
  } catch (err) {
    console.error("Load xocdia stats failed:", err?.message || err);
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
    game: "xocdia",
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
      localSession,
      lastRoundKey,
      streak,
    },
    history,
  };

  try {
    fs.mkdirSync(STATS_DIR, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.error("Write xocdia stats failed:", err?.message || err);
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

function pickFirst(obj, keys) {
  if (!obj || typeof obj !== "object") return null;

  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) {
      return obj[k];
    }
  }

  return null;
}

function toInt(v) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }

  return null;
}

function extractSessionId(payload) {
  const keys = [
    "SessionID",
    "SessionId",
    "sessionID",
    "sessionId",
    "session",
    "Sid",
    "sid",
    "RoundID",
    "RoundId",
    "roundID",
    "roundId",
    "GameSessionID",
    "GameSessionId",
    "gameSessionID",
    "gameSessionId",
    "MatchID",
    "MatchId",
    "matchID",
    "matchId",
  ];

  const direct = pickFirst(payload, keys);
  if (direct !== null) return direct;

  if (payload && typeof payload === "object") {
    for (const val of Object.values(payload)) {
      if (!val || typeof val !== "object") continue;
      const nested = pickFirst(val, keys);
      if (nested !== null) return nested;
    }
  }

  return null;
}

function extractResultCode(payload) {
  const resultKeys = ["Result", "result", "KQ", "kq"];
  let raw = pickFirst(payload, resultKeys);

  if (raw === null && payload && typeof payload === "object") {
    for (const val of Object.values(payload)) {
      if (!val || typeof val !== "object") continue;
      raw = pickFirst(val, resultKeys);
      if (raw !== null) break;
    }
  }

  const directCode = toInt(raw);
  if (directCode !== null && directCode >= 0 && directCode <= 4) {
    return directCode;
  }

  if (raw && typeof raw === "object") {
    const d1 = toInt(pickFirst(raw, ["Dice1", "dice1"]));
    const d2 = toInt(pickFirst(raw, ["Dice2", "dice2"]));
    const d3 = toInt(pickFirst(raw, ["Dice3", "dice3"]));
    const d4 = toInt(pickFirst(raw, ["Dice4", "dice4"]));

    const dice = [d1, d2, d3, d4];
    if (dice.every((v) => v !== null)) {
      // Unrevealed phases publish -1 values; only score when all chips are known.
      if (dice.some((v) => v < 0)) return null;

      // In upstream payload 1/0 represent two chip colors. Counting 1s yields 0..4.
      if (dice.every((v) => v === 0 || v === 1)) {
        return dice.filter((v) => v === 1).length;
      }
    }

    if (typeof raw.ChipsData === "string" && raw.ChipsData.trim() !== "") {
      const chips = raw.ChipsData
        .split(",")
        .map((v) => toInt(v))
        .filter((v) => v !== null);

      if (chips.length === 4 && chips.every((v) => v === 0 || v === 1)) {
        return chips.filter((v) => v === 1).length;
      }
    }

    const red = toInt(pickFirst(raw, ["Red", "red", "Do", "do", "RedCount", "redCount"]));
    const white = toInt(pickFirst(raw, ["White", "white", "Trang", "trang", "WhiteCount", "whiteCount"]));

    if (red !== null && white !== null && red >= 0 && white >= 0 && red + white === 4) {
      return red;
    }
  }

  return null;
}

// ===== PARSE =====
function parseResult(v) {
  switch (v) {
    case 0:
      return { type: "CHAN", text: "4 trắng ⚪⚪⚪⚪" };
    case 1:
      return { type: "LE", text: "1 đỏ 3 trắng 🔴⚪⚪⚪" };
    case 2:
      return { type: "CHAN", text: "2-2 ⚪⚪🔴🔴" };
    case 3:
      return { type: "LE", text: "3 đỏ 1 trắng 🔴🔴🔴⚪" };
    case 4:
      return { type: "CHAN", text: "4 đỏ 🔴🔴🔴🔴" };
    default:
      return null;
  }
}

function toRoundKey(payload, value, sessionId) {
  if (sessionId !== undefined && sessionId !== null) {
    return `s:${String(sessionId)}`;
  }

  const timeKey =
    payload.Timestamp ??
    payload.Time ??
    payload.CreatedTime ??
    payload.CreatedAt ??
    payload.Ts ??
    payload.ts ??
    payload.t;

  if (timeKey !== undefined && timeKey !== null) {
    return `t:${String(timeKey)}:v:${value}`;
  }

  // Last fallback when upstream omits both session id and timestamps.
  return `v:${value}:${JSON.stringify(Object.keys(payload || {}).sort())}`;
}

function toSessionLabel(sessionId) {
  if (sessionId !== undefined && sessionId !== null) {
    return String(sessionId);
  }

  localSession += 1;
  return String(localSession);
}

function toNextSessionLabel(session) {
  if (typeof session === "string" && /^\d+$/.test(session)) {
    return String(Number(session) + 1);
  }

  return `${session} -> tiếp theo`;
}

function toHighlightedSide(side) {
  return side === "CHAN" ? "CHẴN" : "LẺ";
}

// ===== TELEGRAM =====
async function send(msg) {
  if (!TELEGRAM_ENABLED) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    const reason =
      err?.response?.data?.description ||
      err?.response?.data?.error_code ||
      err?.message ||
      "unknown error";
    console.error("Telegram send failed:", reason);
  }
}

async function sendSideCard(side, caption) {
  if (!TELEGRAM_ENABLED) return;
  const sideKey = side === "CHAN" ? "CHAN" : "LE";
  const photoPath = CARD_FILE[sideKey];

  if (!fs.existsSync(photoPath)) {
    await send(`${caption}\n\n⚠️ Không tìm thấy ảnh thẻ ${toHighlightedSide(sideKey)}.`);
    return;
  }

  try {
    const endpoint = `https://api.telegram.org/bot${TOKEN}/sendPhoto`;
    const form = new FormData();

    form.append("chat_id", CHAT_ID);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append(
      "photo",
      new Blob([fs.readFileSync(photoPath)], { type: "image/png" }),
      path.basename(photoPath)
    );

    const res = await fetch(endpoint, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Telegram sendPhoto failed:", text);
    }
  } catch (err) {
    console.error("Telegram sendPhoto failed:", err?.message || err);
  }
}

// ===== PREDICT =====
function predict() {
  return Math.random() > 0.5 ? "CHAN" : "LE";
}

// ===== MAIN =====
async function connect() {
  loadStateFromFile();

  const base = "https://xocdia.apiquadautayshelby.vip/signalr";
  const hub = "sedieHub";

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
    console.log("CONNECTED XOCDIA");

    send(`XÓC ĐĨA bot đã kết nối. CHAT_ID=${CHAT_ID}`);

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
        const payload = item.A?.[0];
        if (!payload) return;

        const value = extractResultCode(payload);
        if (value === null) return;

        const sessionId = extractSessionId(payload);
        const roundKey = toRoundKey(payload, value, sessionId);
        if (roundKey === lastRoundKey) return;
        lastRoundKey = roundKey;

        const session = toSessionLabel(sessionId);
        const nextSession = toNextSessionLabel(session);

        const parsed = parseResult(value);
        if (!parsed) return;

        const result = parsed.type;
        console.log(`ROUND ${session} | value=${value} | result=${result}`);

        let status = "PENDING";

        if (!predictSide) {
          predictSide = predict();
          writeStatsFile({
            session,
            side: result,
            label: toHighlightedSide(result),
            value,
            display: parsed.text,
            status,
            bet: 0,
            change: 0,
            timestamp: Date.now(),
          });
          send(`🎲 XÓC ĐĨA | Sau phiên ${session}\n\n🔮 Dự đoán phiên ${nextSession}: <b>${toHighlightedSide(predictSide)}</b>\n💰 ${money().toLocaleString()}`);
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
          label: toHighlightedSide(result),
          value,
          display: parsed.text,
          status,
          bet,
          change,
          timestamp: Date.now(),
        });

        const next = predict();
        predictSide = next;

        const caption = `🎲 <b>XÓC ĐĨA</b> | Phiên ${session}\n\n🚦 Kết quả: <b>${toHighlightedSide(result)}</b>\n🔍 ${parsed.text}\n\n${change > 0 ? "✅ Thắng" : "❌ Thua"}\n📊 ${win}W - ${lose}L\n\n➡️ Dự đoán phiên ${nextSession}: <b>${toHighlightedSide(next)}</b>\n💰 ${nextMoney().toLocaleString()}\n💵 Lãi: ${profit.toLocaleString()}\n📈 WR: ${winrate()}%`;
        sendSideCard(result, caption);
      });
    } catch {
      // Ignore malformed messages.
    }
  });

  ws.on("close", () => {
    console.log("Reconnect XOCDIA...");
    setTimeout(connect, 3000);
  });

  ws.on("error", () => {
    console.log("WS error XOCDIA");
  });
}

connect().catch(() => {
  setTimeout(connect, 3000);
});
