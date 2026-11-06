# Cấu hình Cloudflare cho app.optigo.vn

Hướng dẫn thiết lập edge security trên **Cloudflare Free** phía trước **Vercel**.

## Kiểm tra nhanh (trước khi chỉnh Bot Fight Mode)

1. **Account home → Domains** phải thấy ít nhất một website (zone). Nếu trống (chỉ có R2 / Turnstile) thì Bot Fight Mode **không áp dụng** cho app — không có gì để tắt trên account đó.
2. DNS production: `app.optigo.vn` phải trỏ qua Cloudflare (nameserver Cloudflare hoặc bản ghi **Proxied**). Nếu `nslookup app.optigo.vn` trả về `*.vercel-dns.com` thì traffic **đi thẳng Vercel**, không qua Cloudflare → tắt Bot Fight Mode trên dashboard **không** làm app nhanh hơn.

## 1. DNS và SSL

1. Thêm domain `app.optigo.vn` vào Cloudflare, bật **Proxied** (orange cloud) cho bản ghi trỏ Vercel.
2. **SSL/TLS** → Overview: **Full (strict)**.
3. **SSL/TLS** → Edge Certificates: bật **Always Use HTTPS**.
4. **SSL/TLS** → Edge Certificates: bật **HTTP Strict Transport Security (HSTS)** — đồng bộ với header trong `middleware.ts`.

## 2. Bảo vệ bot và integrity

| Mục | Vị trí | Giá trị |
|-----|--------|---------|
| Bot Fight Mode | Security → Settings → Bot traffic | **Off** (bắt buộc Off: chế độ này challenge cả `/api/*`, làm chậm lưu/sửa/xóa, không skip được bằng WAF) |
| Browser Integrity Check | Security → Settings | **On** |
| Security Level | Security → Settings | **Medium** (tăng **High** khi bị scan) |

## 3. Cache Rules

Tạo **Cache Rule** (hoặc Page Rule legacy):

| Rule | Match | Hành động |
|------|-------|-----------|
| Bypass API | URI Path starts with `/api/` | Cache: **Bypass** |
| Static assets | URI Path starts with `/_next/static/` | Cache: **Standard**, Edge TTL 1 month |
| Plans public | URI Path equals `/api/tenants/plans` | Cache: **Standard**, Edge TTL 5 minutes |

## 4. Firewall Rules (Free: ~5 rules)

Tạo theo thứ tự ưu tiên (rule trên chạy trước):

### Rule 1 — Block path quét lỗ hổng

- **Expression:**  
  `(http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git") or (http.request.uri.path contains "/wp-admin") or (http.request.uri.path contains "/wp-login")`
- **Action:** Block

### Rule 2 — Block source maps

- **Expression:** `(http.request.uri.path contains ".map")`
- **Action:** Block

### Rule 3 — Challenge đăng ký spam

- **Expression:**  
  `(http.request.uri.path eq "/api/auth/register" and http.request.method eq "POST")`
- **Action:** Managed Challenge  
  *(Hoặc JS Challenge nếu Turnstile đã bật trên form — giảm false positive)*

### Rule 4 — Challenge ghép thiết bị face

- **Expression:**  
  `(http.request.uri.path eq "/api/face-devices/pair" and http.request.method eq "POST")`
- **Action:** Managed Challenge

### Rule 5 — Challenge POST API burst (tùy chọn)

- **Expression:**  
  `(http.request.method eq "POST" and starts_with(http.request.uri.path, "/api/"))`
- **Action:** Managed Challenge khi `cf.threat_score gt 10` (nếu field có trên gói của bạn)

> **Lưu ý:** Rate Limiting rules chuẩn thường cần Cloudflare Pro. Trên Free dùng Challenge + Turnstile + rate limit trong app.

## 5. Turnstile (chống spam đăng ký)

1. Cloudflare Dashboard → **Turnstile** → Add site.
2. Domain: `app.optigo.vn` (+ `localhost` cho dev nếu cần).
3. Widget mode: **Managed**.
4. Thêm env trên Vercel:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — site key (public)
   - `TURNSTILE_SECRET_KEY` — secret key (server only)

## 6. Kiểm tra sau cấu hình

- [ ] `https://app.optigo.vn/api/tenants/plans` trả JSON, không cache lâu trên browser cho API khác
- [ ] `GET https://app.optigo.vn/_next/static/.../*.map` → 404 hoặc Block
- [ ] Đăng ký form hiện Turnstile và reject khi thiếu token (production)
- [ ] Cron Vercel vẫn chạy (request từ Vercel IP, không qua challenge user)

## 7. Under Attack Mode

Khi DDoS / scan lớn: **Security → Settings → Security Level → I'm Under Attack**.

Sau khi ổn định, hạ về Medium và xem **Security → Events** để tinh chỉnh firewall rules.

## 8. Workers KV (tùy chọn, miễn phí)

Nếu abuse API vẫn cao sau firewall + app rate limit, cân nhắc Worker + KV counter theo IP cho `/api/*`. Xem roadmap trong `docs/SECURITY.md`.
