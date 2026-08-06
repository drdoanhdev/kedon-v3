# Bảo mật vận hành — Kedon / Optigo

Tài liệu nội bộ: checklist env, release, runbook sự cố.

## 1. Biến môi trường

### Server-only (Vercel Production — không commit)

| Biến | Mục đích |
|------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | API backend, bypass RLS có kiểm soát |
| `CRON_SECRET` | Vercel Cron + Bearer auth cron jobs |
| `MESSAGING_CRON_SECRET` | Header `x-cron-secret` cho messaging worker |
| `WAITING_ROOM_CLEANUP_SECRET` | Cleanup phòng chờ |
| `RECENT_ACTIVITY_CLEANUP_SECRET` | Cleanup recent activity |
| `PAYMENT_WEBHOOK_SECRET` | Webhook SePay / thanh toán |
| `TURNSTILE_SECRET_KEY` | Xác minh Cloudflare Turnstile (đăng ký) |
| `CSP_REPORT_URI` | (Tùy chọn) Endpoint nhận báo cáo vi phạm CSP |
| Key R2 / messaging / face embedding | Theo từng module |

### Client-safe (`NEXT_PUBLIC_*`)

| Biến | Ghi chú |
|------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key — RLS bắt buộc |
| `NEXT_PUBLIC_APP_URL` | URL app production |
| `NEXT_PUBLIC_SESSION_TIMEOUT` | Timeout session (ms) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site key Turnstile (public) |

**Không bao giờ** đưa `SERVICE_ROLE_KEY` vào `NEXT_PUBLIC_*` hoặc component client.

## 2. Kiến trúc bảo vệ

```
Browser/Agent → Cloudflare (WAF, Turnstile) → Vercel (Next.js API guards) → Supabase (RLS)
```

- Frontend bundle **có thể bị đọc** — logic nhạy cảm phải ở API server.
- Rate limit in-memory: hiệu quả cơ bản; Cloudflare edge là lớp chính (xem [cloudflare-setup.md](./cloudflare-setup.md)).

## 3. Checklist trước mỗi deploy production

- [ ] `npm run build` thành công
- [ ] Grep bundle/client: không có `SERVICE_ROLE` trong output client
- [ ] `GET /_next/static/.../*.map` → 404
- [ ] Đăng nhập + 1 API nặng (báo cáo) + upload media OK
- [ ] `/api/auth/register` có Turnstile (production) hoặc skip có chủ đích (dev)
- [ ] Cron jobs trong `vercel.json` vẫn có `CRON_SECRET` trên Vercel
- [ ] API mới có `requireTenant` / guard tương ứng
- [ ] API public/nặng có rate limit (xem `src/lib/apiLimits.ts`)

## 4. Rate limit (ứng dụng)

Định nghĩa tập trung: `src/lib/apiLimits.ts` + `src/lib/rateLimit.ts`.

| Scope | Giới hạn |
|-------|----------|
| Đăng ký | 5 / 15 phút / IP |
| Ghép face device | 10 / 10 phút / IP |
| Báo cáo | 10 / phút / tenant+user |
| Import Excel | 5 / 10 phút / tenant+user |
| Face embedding | 20 / phút / tenant+IP |
| Dashboard | 30 / phút / tenant+user |
| Media upload | 60 / 10 phút / tenant+user |

## 5. Runbook sự cố

| Triệu chứng | Hành động |
|-------------|-----------|
| Spike HTTP 429 | Kiểm tra Cloudflare Events + log Vercel; tăng ngưỡng nếu false positive từ tenant hợp lệ |
| DB chậm / timeout | Giảm tải báo cáo; xem Supabase slow queries; tạm bật Cloudflare challenge |
| Spam đăng ký | Bật Turnstile managed mode; firewall challenge `/api/auth/register` |
| DDoS / scan lớn | Cloudflare **Under Attack Mode**; liên hệ Vercel support |
| Lộ secret | Rotate key ngay trên Vercel + Supabase; redeploy |

## 6. Face Agent

- Download chỉ qua `GET /api/face-devices/download-agent` (auth + feature gate).
- Build: `npm run pack:face-agent` — ưu tiên PyInstaller (không ship `.py` thuần).
- Zip lưu tại `private/downloads/`, không `public/`.

## 6b. Print Agent (in tem kính)

- Download chỉ qua `GET /api/print-agent/download` (auth + feature `print_config`).
- Build: `npm run pack:print-agent` — zip PowerShell/bat, không cần runtime ngoài Windows.
- Agent chỉ bind `127.0.0.1` (không mở LAN); CORS giới hạn origin Optigo.
- Zip lưu tại `private/downloads/OptigoPrintAgent.zip`, không `public/`.

## 7. Cloudflare

Chi tiết cấu hình: [docs/cloudflare-setup.md](./cloudflare-setup.md).

## 8. Nâng cấp khi có ngân sách

- Cloudflare Pro + Rate Limiting rules (~$20/tháng)
- Upstash Redis cho rate limit đồng bộ multi-instance
- GitHub Dependabot / audit npm
- Penetration test thuê ngoài
