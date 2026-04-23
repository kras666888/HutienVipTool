# Yennhi Dashboard + Telegram Bots

Project gom 2 phần:

1. Dashboard Vite hiển thị roadmap và thống kê từ JSON trong public/stats.
2. Bot Telegram ghi dữ liệu cho 3 game:
- TX2
- Tài Xỉu
- Xóc Đĩa

Dashboard hiện ưu tiên đọc stats từ GitHub raw để dữ liệu lên site mà không cần redeploy Netlify; nếu nguồn live không sẵn sàng thì sẽ fallback về JSON tĩnh.

Để tránh giữ token cá nhân trên máy, repo có workflow `.github/workflows/sync-stats.yml` chạy bot trong GitHub Actions rồi commit lại `public/stats/` lên `main`. Đây là cách khuyến nghị.

## Yêu cầu

- Node.js 18+
- npm

## Cài đặt

```bash
npm install
```

## Chạy dashboard local

```bash
npm run dev
```

Mở địa chỉ Vite in ra terminal (thường là http://localhost:5173).

## Build production

```bash
npm run build
```

## Biến môi trường

Tạo file .env từ .env.example:

```bash
copy .env.example .env
```

Ví dụ:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Mặc định dùng chung
TELEGRAM_CHAT_ID=your_default_chat_id
BASE_BET=10000

# Dashboard live source
VITE_STATS_BASE_URL=https://raw.githubusercontent.com/kras666888/HutienVipTool/main/public/

# Optional override theo game
TELEGRAM_CHAT_ID_TX=your_tx_chat_id_here
TELEGRAM_CHAT_ID_TAIXIU=your_taixiu_chat_id_here
TELEGRAM_CHAT_ID_XOCDIA=your_xocdia_chat_id_here

BASE_BET_TX=10000
BASE_BET_TAIXIU=10000
BASE_BET_XOCDIA=10000
```

Ưu tiên biến theo game:

- bot-taixiu.cjs:
	TELEGRAM_CHAT_ID_TAIXIU -> TELEGRAM_CHAT_ID_TX -> TELEGRAM_CHAT_ID
	BASE_BET_TAIXIU -> BASE_BET_TX -> BASE_BET
- bot-telegram.cjs (TX2):
	TELEGRAM_CHAT_ID
	BASE_BET
- bot-xocdia.cjs:
	TELEGRAM_CHAT_ID_XOCDIA -> TELEGRAM_CHAT_ID
	BASE_BET_XOCDIA -> BASE_BET

## Chạy bot

- TX2:

```bash
npm run bot
```

- Tài Xỉu:

```bash
npm run bot:taixiu
```

- Xóc Đĩa:

```bash
npm run bot:xocdia
```

Khi bot chạy, dữ liệu được cập nhật vào:

- public/stats/tx2.json
- public/stats/taixiu.json
- public/stats/xocdia.json

Dashboard sẽ tự refresh dữ liệu định kỳ để hiển thị mới nhất.

## GitHub Actions sync

Workflow `.github/workflows/sync-stats.yml` có thể chạy theo lịch hoặc bấm tay để:

1. Chạy các bot trong GitHub Actions.
2. Commit lại thay đổi trong `public/stats/` bằng `GITHUB_TOKEN` mặc định của Actions.
3. Kích hoạt deploy Netlify từ workflow hiện có.

Secrets cần thiết trên GitHub repo:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_CHAT_ID_TX`
- `TELEGRAM_CHAT_ID_TAIXIU`
- `TELEGRAM_CHAT_ID_XOCDIA`
- `BASE_BET`
- `BASE_BET_TX`
- `BASE_BET_TAIXIU`
- `BASE_BET_XOCDIA`