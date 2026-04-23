# Hutien Landing Page

Trang web tĩnh mô phỏng bố cục trong ảnh tham chiếu bằng Vite vanilla.

## Chạy dự án

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Chạy bot Telegram

1. Tạo file `.env` từ `.env.example`.
2. Điền thông tin bot:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
BASE_BET=10000
```

3. Chạy bot:

```bash
npm run bot
```