# Nhắn tin tự động (Zalo OA) — hướng dẫn vận hành

Tính năng cho phép mỗi cửa hàng kính (tenant) tự kết nối Zalo Official Account riêng và bật các quy trình tự động (xác nhận / nhắc lịch / theo dõi sau khám). Token được mã hóa AES-256-GCM trước khi lưu DB; có hạn ngạch ngày/tháng/phút riêng từng cửa hàng để không ảnh hưởng tốc độ phòng khám khác.

## 1. Chạy migration

```sql
-- Trên Supabase SQL editor (chạy 1 lần / mỗi DB)
\i sql/V052_create_messaging_automation.sql
```

Sau khi chạy xong, đánh dấu ✅ trong [sql/MIGRATION_LOG.md](sql/MIGRATION_LOG.md) (Phase 12).

## 2. Biến môi trường cần thêm (`.env.local` hoặc Vercel/host)

```env
# Khóa mã hóa AES-256-GCM (32 bytes base64). Sinh bằng:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
MESSAGING_ENCRYPTION_KEY=...

# Đăng ký Zalo App tại https://developers.zalo.me → tạo app loại "Official Account"
# Cấu hình "Callback URL" trùng đúng giá trị ZALO_REDIRECT_URI bên dưới
ZALO_APP_ID=
ZALO_APP_SECRET=
ZALO_REDIRECT_URI=https://yourdomain.com/api/messaging/zalo/callback

# Secret bảo vệ endpoint cron (header x-cron-secret hoặc ?secret=)
MESSAGING_CRON_SECRET=...
```

> ⚠ KHÔNG đưa `MESSAGING_ENCRYPTION_KEY` vào client bundle. Đây là biến server-only.
> Nếu xoay khóa: phải re-encrypt tất cả `clinic_messaging_channels.credentials` cũ — Phase 1 chưa hỗ trợ tự động → user kết nối lại nhanh nhất.

## 3. Cấu hình Zalo App (1 lần cho cả nền tảng)

1. Vào [developers.zalo.me](https://developers.zalo.me) → Tạo "Ứng dụng" loại OA.
2. Tab **Official Account** → bật quyền `oa.send.message`.
3. Tab **OAuth** → thêm Callback URL chính xác là giá trị `ZALO_REDIRECT_URI`.
4. Lấy `App ID` & `App Secret` đặt vào env.

Mỗi cửa hàng (tenant) sẽ tự uỷ quyền OA của họ qua nút **Kết nối Zalo OA** trong trang `/cai-dat-nhan-tin`. Token & refresh-token của từng OA đều được lưu mã hóa và độc lập nhau.

## 4. Bật cron worker

Worker là endpoint `GET /api/messaging/cron`. Mỗi lần được gọi sẽ xử lý tối đa 50 job tới hạn rồi trả về. Vì là endpoint riêng nên không cạnh tranh CPU với UI.

### 4.1. Vercel Cron (khuyên dùng nếu deploy Vercel)

Thêm vào `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/messaging/cron?secret=__paste_MESSAGING_CRON_SECRET__", "schedule": "* * * * *" }
  ]
}
```

> Vercel Cron tối thiểu 1 phút/lần, đủ cho lịch hẹn thường tính theo giờ.

### 4.2. cron-job.org / GitHub Actions / uptime ping

Gọi định kỳ mỗi 60s:

```
GET https://yourdomain.com/api/messaging/cron
Header: x-cron-secret: <MESSAGING_CRON_SECRET>
```

### 4.3. Self-hosted (PM2 + node-cron)

Đặt 1 process nhỏ riêng:

```js
// scripts/messaging-cron.js
const cron = require('node-cron');
cron.schedule('* * * * *', () => {
  fetch('http://localhost:3000/api/messaging/cron', {
    headers: { 'x-cron-secret': process.env.MESSAGING_CRON_SECRET }
  }).catch(() => {});
});
```

## 5. Cách hoạt động

- **Phân quyền**: feature `messaging_automation` chỉ mở cho gói `pro` & `enterprise`; chỉ `owner` / `admin` mới chỉnh được (`manage_messaging`).
- **Workflow trigger**:
  - `appointment_confirm` — gửi ngay khi tạo lịch (offset thường = 0).
  - `appointment_reminder` — nhắc trước, offset âm (ví dụ `-1440` = trước 1 ngày).
  - `followup_after_visit` — sau khám, offset dương (`4320` = sau 3 ngày).
- Khi `POST /api/hen-kham-lai` thành công, tự gọi `enqueueWorkflowJobs` (best-effort, không chặn).
- Khi lịch bị hủy / xóa, tự `cancelJobsForAppointment` để hủy job pending.
- **Tin chủ động Zalo cần ZNS template_id** đã duyệt — điền vào trường "Mã ZNS template" của workflow. Phase 1 không gửi nội dung tự do (Zalo OA chỉ cho phép trong cửa sổ 7 ngày sau khi user nhắn).
- **Hạn ngạch**: mỗi tenant cấu hình `daily_limit`, `monthly_limit`, `rate_per_minute` riêng (mặc định 1000/30000/30). Khi vượt hạn ngày, job được hoãn sang 00:05 hôm sau.
- **Retry**: 60s → 10ph → 1h, tối đa 3 lần.
- **Bảo mật**: `credentials` JSONB trong `clinic_messaging_channels` chỉ chứa `iv/tag/data` (ciphertext). PKCE state pending lưu cùng credentials nhưng riêng key `pending`.

## 6. Lệnh hữu ích

```sql
-- Xem job tới hạn chưa xử lý
select id, tenant_id, channel, run_at, status, attempts, error_message
from message_jobs
where status='pending' and run_at <= now()
order by run_at limit 50;

-- Dọn job cũ
select cleanup_old_message_jobs();

-- Reset job lỗi để thử lại
update message_jobs set status='pending', attempts=0, run_at=now()
where id = $1 and status='failed';
```

## 7. Phase tiếp theo (gợi ý)

- Bổ sung provider SMS HTTP (Esms / Speedsms) — hiện đã có nhánh `sms_http` trong queue nhưng worker trả lỗi rõ ràng.
- Lưu Zalo `user_id` của bệnh nhân để dùng tin "consult" miễn phí trong cửa sổ 7 ngày.
- Báo cáo tỷ lệ mở/đọc khi Zalo cung cấp webhook delivery.
