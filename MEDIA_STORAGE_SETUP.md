# Media Storage (Cloudflare R2)

Hệ thống lưu ảnh cho:
- Đơn kính (`don_kinh`, `gong_da_cat`, `ket_qua_khuc_xa`)
- Gọng kính (`mat_truoc`, `mat_trai`, `mat_phai`)
- Đơn thuốc

Metadata nằm trong PostgreSQL; file nhị phân lưu trên **Cloudflare R2** (mặc định). Ảnh cũ trên Supabase vẫn đọc được nhờ cột `storage_driver` trên từng bản ghi.

## 1) Tạo bucket trên Cloudflare R2

Trong Cloudflare Dashboard → R2 → Create bucket, tạo 3 bucket (private):

| Bucket | Dùng cho |
|--------|----------|
| `don-kinh-media` | Đơn kính |
| `gong-kinh-media` | Gọng kính |
| `don-thuoc-media` | Đơn thuốc |

Tạo **R2 API Token** (Object Read & Write) và lấy Access Key / Secret Key.

### CORS (tùy chọn)

R2 mặc định **không** cho phép trình duyệt `PUT` trực tiếp (preflight OPTIONS trả 403). App dùng **upload proxy** qua `/api/.../media/upload` — **không cần cấu hình CORS**.

Nếu vẫn muốn PUT trực tiếp từ trình duyệt, thêm rule CORS trên bucket:

```json
[
  {
    "AllowedOrigins": ["https://app.optigo.vn", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## 2) Biến môi trường

Thêm vào **`.env`** (file bạn đang dùng cho Supabase, DATABASE_URL, v.v.) hoặc Vercel/host khi deploy.

> **`.env` hay `.env.local`?** Cả hai đều được Next.js đọc. Repo này đang cấu hình trong `.env` — cứ tiếp tục dùng `.env` cho đồng bộ. `.env.local` chỉ là convention của Next.js để tách secret local (thường không commit); không bắt buộc.

### Lấy credentials từ Cloudflare

1. Vào [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2 Object Storage**.
2. **Account ID**: góc phải Overview, hoặc nhìn subdomain URL S3:
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
3. **Access Key + Secret**: R2 → **Manage R2 API Tokens** → **Create API token**
   - Quyền: **Object Read & Write**
   - Có thể giới hạn theo bucket
   - Sau khi tạo: copy **Access Key ID** và **Secret Access Key** (secret chỉ hiện một lần).

### URL bạn có dạng `...r2.cloudflarestorage.com/optigo`

Tách như sau:

| Phần URL | Ý nghĩa | Biến env |
|----------|---------|----------|
| `https://<id>.r2.cloudflarestorage.com` | S3 API endpoint | `R2_ENDPOINT` hoặc `R2_ACCOUNT_ID=<id>` |
| `/optigo` | **Tên bucket** (không phải endpoint) | `MEDIA_BUCKET_DON_KINH=optigo` (và các bucket khác) |

**Không** ghi cả `/optigo` vào `R2_ENDPOINT` trừ khi bạn cố ý dùng path prefix đặc biệt. Code mặc định expect endpoint **không có** path bucket.

Nếu chỉ có **một** bucket `optigo`, có thể dùng chung cho cả 3 loại ảnh (path object vẫn tách theo `donkinh/`, `donthuoc/`, v.v.).

```env
# Driver: r2 (mặc định) | supabase (rollback)
MEDIA_STORAGE_DRIVER=r2

# Một bucket chung tên optigo (hoặc tách 3 bucket riêng nếu đã tạo)
MEDIA_BUCKET_DON_KINH=optigo
MEDIA_BUCKET_GONG_KINH=optigo
MEDIA_BUCKET_DON_THUOC=optigo

# Giới hạn file & TTL signed URL
MEDIA_IMAGE_MAX_FILE_BYTES=8388608
MEDIA_READ_URL_TTL_SECONDS=900

# Cloudflare R2 — bắt buộc
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
# hoặc chỉ cần (code tự ghép endpoint):
# R2_ACCOUNT_ID=<ACCOUNT_ID>

R2_ACCESS_KEY_ID=<từ API token>
R2_SECRET_ACCESS_KEY=<từ API token>
R2_REGION=auto
```

## 3) API endpoints

| Module | Endpoints |
|--------|-----------|
| Đơn kính | `GET/POST/PATCH/DELETE /api/don-kinh/media` |
| Gọng kính | `GET/POST/PATCH/DELETE /api/gong-kinh/media` |
| Đơn thuốc | `GET/POST/PATCH/DELETE /api/don-thuoc/media` |

## 4) Luồng upload (frontend)

1. `POST /api/.../media` — nhận signed upload URL
2. `PUT` file trực tiếp lên R2 (giữ đúng `Content-Type` từ response)
3. `PATCH` với `status: uploaded` + width/height
4. `GET` để lấy signed read URL hiển thị ảnh

## 5) Migrate ảnh cũ từ Supabase

Sau khi cấu hình R2 và tạo bucket, chạy script copy object + cập nhật `storage_driver`:

```bash
# Xem trước
node scripts/migrate-media-to-r2.mjs --dry-run

# Migrate từng batch
node scripts/migrate-media-to-r2.mjs --limit=100

# Chỉ một bảng
node scripts/migrate-media-to-r2.mjs --table=don_kinh_media
```

Cần: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, và các biến R2.

Ảnh mới upload tự động lên R2. Ảnh chưa migrate vẫn đọc từ Supabase qua `storage_driver` trên DB.

## 6) Code liên quan

- `src/lib/media/storage.ts` — provider R2 / Supabase
- `src/lib/media/types.ts` — bucket theo scope
- `src/lib/media/objectPath.ts` — cấu trúc path object
