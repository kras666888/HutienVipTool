import "./style.css";

const games = [
  { key: "xocdia", title: "Xóc Đĩa", source: "stats/xocdia.json", leftLabel: "CHẴN", rightLabel: "LẺ" },
  { key: "taixiu", title: "Tài Xỉu", source: "stats/taixiu.json", leftLabel: "XỈU", rightLabel: "TÀI" },
  { key: "tx2", title: "Tài Xỉu 2", source: "stats/tx2.json", leftLabel: "XỈU", rightLabel: "TÀI" },
];

const ROWS = 6;
const MIN_VISIBLE_COLS = 20;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_MINUTES = 30;
const POLL_INTERVAL_MS = 5000;
const FETCH_TIMEOUT_MS = 4500;
const DEFAULT_STATS_BASE_URL = import.meta.env.VITE_STATS_BASE_URL || "https://raw.githubusercontent.com/kras666888/HutienVipTool/main/public/";
const lastGoodStats = new Map();
const roadScrollPositions = new Map();
let isRefreshing = false;

document.querySelector("#app").innerHTML = `
  <main class="dashboard">
    <header class="topbar">
      <h1>Bảng Thống Kê Roadmap</h1>
      <p id="last-refresh">Đang tải dữ liệu...</p>
    </header>
    <section id="boards" class="boards"></section>
  </main>
`;

function currency(v) {
  return Number(v || 0).toLocaleString("vi-VN");
}

function formatUpdatedAt(value) {
  if (!value) return "Chưa có dữ liệu";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("vi-VN");
}

function isStale(updatedAt) {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return false;
  return Date.now() - parsed.getTime() > STALE_MINUTES * 60 * 1000;
}

function joinUrl(baseUrl, path) {
  try {
    return new URL(path, baseUrl).href;
  } catch {
    const normalizedBase = String(baseUrl || "").replace(/\/?$/, "/");
    const normalizedPath = String(path || "").replace(/^\//, "");
    return `${normalizedBase}${normalizedPath}`;
  }
}

function sideClass(side) {
  const normalized = String(side || "").toUpperCase();
  if (normalized === "CHAN" || normalized === "XỈU" || normalized === "XIU") return "chip-light";
  return "chip-dark";
}

function chipText(entry) {
  if (entry.value !== undefined && entry.value !== null) return String(entry.value);
  if (entry.label) return String(entry.label).slice(0, 1);
  return "?";
}

function getRecentHistory(entries) {
  const source = Array.isArray(entries) ? entries : [];
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  const recent = source.filter((entry) => Number(entry?.timestamp || 0) >= cutoff);
  return recent.length > 0 ? recent : source;
}

function buildRoad(entries) {
  const placed = Array.from({ length: ROWS }, () => []);
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      grid: Array.from({ length: ROWS }, () => Array.from({ length: MIN_VISIBLE_COLS }, () => null)),
      totalCols: MIN_VISIBLE_COLS,
    };
  }

  const hasCell = (r, c) => Boolean(placed[r][c]);

  let col = 0;
  let row = 0;
  let prevSide = null;
  let maxCol = 0;

  for (const entry of entries) {
    const side = String(entry.side || "").toUpperCase();

    if (prevSide === null) {
      col = 0;
      row = 0;
    } else if (side === prevSide) {
      const nextRow = row + 1;
      if (nextRow < ROWS && !hasCell(nextRow, col)) {
        row = nextRow;
      } else {
        col += 1;
      }
    } else {
      col += 1;
      row = 0;
    }

    while (hasCell(row, col)) {
      col += 1;
    }

    placed[row][col] = entry;
    if (col > maxCol) maxCol = col;
    prevSide = side;
  }

  const totalCols = Math.max(MIN_VISIBLE_COLS, maxCol + 1);
  const grid = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: totalCols }, (_, c) => placed[r][c] || null)
  );

  return { grid, totalCols };
}

function renderGrid(gameKey, entries) {
  const { grid, totalCols } = buildRoad(entries);
  return `<div class="road-scroll" data-road-scroll data-game="${gameKey}">
    <div class="road-grid" style="--road-cols:${totalCols}">${grid
    .map(
      (row) =>
        `<div class="road-row">${row
          .map((cell) => {
            if (!cell) return `<div class="road-cell"></div>`;
            const klass = sideClass(cell.side);
            return `<div class="road-cell"><span class="chip ${klass}" title="Phiên ${cell.session}">${chipText(cell)}</span></div>`;
          })
          .join("")}</div>`
    )
    .join("")}</div>
  </div>
  <p class="road-hint">Kéo ngang để xem lịch sử cũ hơn</p>`;
}

function renderBoard(container, game, stats) {
  const totals = stats?.totals || {};
  const history = getRecentHistory(stats?.history);
  const updatedAt = stats?.updatedAt || null;
  const stale = isStale(updatedAt);

  const card = document.createElement("article");
  card.className = `board${stale ? " board-stale" : ""}`;
  card.innerHTML = `
    <header class="board-head">
      <div>
        <h2>${game.title}</h2>
        <p>${game.leftLabel} / ${game.rightLabel}</p>
      </div>
      <div class="board-meta">
        <span class="badge">${history.length} phiên trong 24 giờ</span>
        <span class="badge badge-soft">${updatedAt ? `Cập nhật ${formatUpdatedAt(updatedAt)}` : "Chưa có mốc cập nhật"}</span>
        ${stale ? `<span class="badge badge-warn">Dữ liệu cũ</span>` : ""}
      </div>
    </header>
    ${renderGrid(game.key, history)}
    <div class="stats-grid">
      <div><label>Tổng phiên</label><strong>${totals.rounds ?? 0}</strong></div>
      <div><label>Thắng / Thua</label><strong>${totals.win ?? 0} / ${totals.lose ?? 0}</strong></div>
      <div><label>Winrate</label><strong>${totals.winRate ?? 0}%</strong></div>
      <div><label>Lãi hiện tại</label><strong>${currency(totals.profit)}</strong></div>
      <div><label>Chuỗi hiện tại</label><strong>${totals.currentStreak ?? 0}</strong></div>
      <div><label>Tiền phiên tới</label><strong>${currency(totals.nextBet)}</strong></div>
    </div>
  `;
  container.appendChild(card);
}

function enableRoadDragScroll(root) {
  const scrollers = root.querySelectorAll("[data-road-scroll]");

  scrollers.forEach((scroller) => {
    const gameKey = scroller.dataset.game;
    const cached = roadScrollPositions.get(gameKey);
    scroller.scrollLeft = cached ?? scroller.scrollWidth;

    let dragging = false;
    let startX = 0;
    let startScroll = 0;

    scroller.addEventListener("scroll", () => {
      roadScrollPositions.set(gameKey, scroller.scrollLeft);
    });

    scroller.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startScroll = scroller.scrollLeft;
      scroller.classList.add("dragging");
      scroller.setPointerCapture(event.pointerId);
    });

    scroller.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      scroller.scrollLeft = startScroll - deltaX;
    });

    const stopDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      scroller.classList.remove("dragging");
      if (scroller.hasPointerCapture(event.pointerId)) {
        scroller.releasePointerCapture(event.pointerId);
      }
    };

    scroller.addEventListener("pointerup", stopDrag);
    scroller.addEventListener("pointercancel", stopDrag);
  });
}

async function readStats(url) {
  const candidates = [joinUrl(DEFAULT_STATS_BASE_URL, url), `/${url}`];

  for (const candidate of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(`${candidate}?t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) continue;
      const data = await response.json();
      if (data && typeof data === "object") return data;
    } catch {
      // Try the next source.
    }
  }

  return null;
}

async function renderDashboard() {
  const boards = document.querySelector("#boards");
  if (!boards) return;

  const allStats = await Promise.all(games.map((g) => readStats(g.source)));
  const hadFetchFailure = allStats.some((item) => item === null);
  const resolvedStats = games.map((game, idx) => {
    const current = allStats[idx];
    if (current) {
      lastGoodStats.set(game.key, current);
      return current;
    }
    return lastGoodStats.get(game.key) || null;
  });

  boards.innerHTML = "";
  const fragment = document.createDocumentFragment();
  games.forEach((game, idx) => {
    renderBoard(fragment, game, resolvedStats[idx]);
  });
  boards.appendChild(fragment);
  enableRoadDragScroll(boards);

  const stamp = document.querySelector("#last-refresh");
  if (stamp) {
    const timeText = new Date().toLocaleTimeString("vi-VN");
    stamp.textContent = hadFetchFailure
      ? `Cập nhật lúc ${timeText} (một phần dữ liệu đang dùng bản gần nhất)`
      : `Cập nhật lúc ${timeText}`;
  }
}

async function refreshSafely() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    await renderDashboard();
  } finally {
    isRefreshing = false;
  }
}

refreshSafely();
setInterval(refreshSafely, POLL_INTERVAL_MS);
