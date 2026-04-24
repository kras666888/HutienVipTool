# Yennhi Dashboard + Telegram Bots

Project được tách thành 2 luồng độc lập:

1. Web dashboard chỉ đọc dữ liệu từ `public/stats/` và từ nguồn live trên GitHub raw khi có sẵn.
2. Telegram chỉ gửi tin nhắn và không còn là nguồn dữ liệu chung với web.

Stats của dashboard đang hiển thị theo cửa sổ 24 giờ gần nhất. Roadmap trên web có thể kéo ngang để xem toàn bộ lịch sử còn trong cửa sổ đó.

Để tránh giữ token cá nhân trên máy, repo có workflow `.github/workflows/sync-stats.yml` chạy các bản stats-only trong GitHub Actions rồi commit lại `public/stats/` lên `main`. Đây là cách khuyến nghị để cập nhật web.

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

## Chạy nhanh trong VS Code

- Task: `Terminal -> Run Task...`
	- `dev`, `build`, `preview`
	- `bot:telegram`, `bot:taixiu`, `bot:xocdia`
	- `bot:telegram:stats`, `bot:taixiu:stats`, `bot:xocdia:stats`
- Launch profile: `Run and Debug -> Launch Vite Dev Server`

Repo đã có sẵn cấu hình tại `.vscode/tasks.json` và `.vscode/launch.json`.

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

# Optional live source override (mặc định dashboard đọc /stats cùng domain)
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

- Telegram-only TX2:

```bash
npm run bot
```

- Telegram-only Tài Xỉu:

```bash
npm run bot:taixiu
```

- Telegram-only Xóc Đĩa:

```bash
npm run bot:xocdia
```

Nếu chỉ muốn tạo stats cho web mà không gửi Telegram, dùng các entrypoint stats-only:

- TX2: `npm run bot:telegram:stats`
- Tài Xỉu: `npm run bot:taixiu:stats`
- Xóc Đĩa: `npm run bot:xocdia:stats`

Khi bot chạy, dữ liệu được cập nhật vào:

- public/stats/tx2.json
- public/stats/taixiu.json
- public/stats/xocdia.json

Dashboard sẽ tự refresh dữ liệu định kỳ để hiển thị mới nhất và chỉ đọc stats, không phụ thuộc luồng Telegram.

## GitHub Actions sync

Workflow `.github/workflows/sync-stats.yml` có thể chạy theo lịch hoặc bấm tay để:

1. Chạy các bản stats-only trong GitHub Actions.
2. Commit lại thay đổi trong `public/stats/` bằng `GITHUB_TOKEN` mặc định của Actions.
3. Kích hoạt deploy Netlify từ workflow hiện có.

## Vận hành 24/7 (web + telegram)

Repo hiện có 3 workflow độc lập để giữ hệ thống chạy liên tục:

1. `sync-stats.yml` (mỗi 5 phút): cập nhật stats cho web.
2. `telegram-alerts.yml` (mỗi 5 phút): gửi cảnh báo Telegram riêng.
3. `ops-watchdog.yml` (mỗi 10 phút): kiểm tra độ tươi và tự dispatch lại workflow nếu thấy trễ.

Lưu ý vận hành: không có giải pháp nào trên scheduler miễn phí đảm bảo tuyệt đối "vĩnh viễn". Cấu hình hiện tại là mức tự phục hồi cao, thực tế gần 24/7. Nếu cần SLA cứng, nên chạy thêm bản dự phòng trên VPS/PM2.

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