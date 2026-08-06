# Optigo Print Agent

Agent nhỏ chạy trên **máy Windows cửa hàng** để in tem kính trực tiếp (TSPL/RAW) khi dùng web `app.optigo.vn`.

## Cửa hàng dùng thế nào

1. Trong app: **Tem kính** → **Tải Print Agent**
2. Giải nén zip
3. Double-click `1-Chay-agent.bat` (để cửa sổ mở khi in)
4. (Tuỳ chọn) `2-Cai-tu-dong-khoi-dong.bat` — tự mở khi bật máy

Không cần cài Python/Node.

## Dev / đóng gói

```bash
npm run pack:print-agent
```

Script sẽ:

1. Tạo `src/lib/printAgentPackage.generated.ts` (nhúng vào code — **cần commit** để Vercel tải được)
2. Tạo zip local tại `services/print-agent/dist/` và `private/downloads/` (gitignore, không lên server)

**Lưu ý:** chỉ chạy `pack` trên máy local mà không commit file `.generated.ts` thì production vẫn báo thiếu gói.

## API localhost

- `GET  http://127.0.0.1:9173/health`
- `GET  http://127.0.0.1:9173/printers`
- `POST http://127.0.0.1:9173/print`
