import "./style.css";

const games = [
  { key: "xocdia", title: "Xóc Đĩa", source: "/stats/xocdia.json", leftLabel: "CHẴN", rightLabel: "LẺ" },
  { key: "taixiu", title: "Tài Xỉu", source: "/stats/taixiu.json", leftLabel: "XỈU", rightLabel: "TÀI" },
  { key: "tx2", title: "Tài Xỉu 2", source: "/stats/tx2.json", leftLabel: "XỈU", rightLabel: "TÀI" },
];

const ROWS = 6;
const COLS = 20;

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

function buildRoad(entries) {
  const board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  if (!Array.isArray(entries) || entries.length === 0) return board;

  let col = 0;
  let row = 0;
  let prevSide = null;

  for (const entry of entries.slice(-120)) {
    const side = String(entry.side || "").toUpperCase();

    if (prevSide === null) {
      col = 0;
      row = 0;
    } else if (side === prevSide) {
      const nextRow = row + 1;
      if (nextRow < ROWS && !board[nextRow][col]) {
        row = nextRow;
      } else {
        col += 1;
      }
    } else {
      col += 1;
      row = 0;
    }

    while (col < COLS && board[row][col]) {
      col += 1;
    }
    if (col >= COLS) {
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS - 1; c += 1) {
          board[r][c] = board[r][c + 1];
        }
        board[r][COLS - 1] = null;
      }
      col = COLS - 1;
    }

    board[row][col] = entry;
    prevSide = side;
  }

  return board;
}

function renderGrid(entries) {
  const grid = buildRoad(entries);
  return `<div class="road-grid">${grid
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
    .join("")}</div>`;
}

function renderBoard(container, game, stats) {
  const totals = stats?.totals || {};
  const history = Array.isArray(stats?.history) ? stats.history : [];

  const card = document.createElement("article");
  card.className = "board";
  card.innerHTML = `
    <header class="board-head">
      <div>
        <h2>${game.title}</h2>
        <p>${game.leftLabel} / ${game.rightLabel}</p>
      </div>
      <span class="badge">${history.length} phiên gần nhất</span>
    </header>
    ${renderGrid(history)}
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

async function readStats(url) {
  try {
    const response = await fetch(`${url}?t=${Date.now()}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function renderDashboard() {
  const boards = document.querySelector("#boards");
  if (!boards) return;
  boards.innerHTML = "";

  const allStats = await Promise.all(games.map((g) => readStats(g.source)));
  games.forEach((game, idx) => {
    renderBoard(boards, game, allStats[idx]);
  });

  const stamp = document.querySelector("#last-refresh");
  if (stamp) {
    stamp.textContent = `Cập nhật lúc ${new Date().toLocaleTimeString("vi-VN")}`;
  }
}

renderDashboard();
setInterval(renderDashboard, 5000);
