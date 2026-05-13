# Don Kinh Media Storage Setup

This project now supports image metadata for:
- Don Kinh snapshots (`don_kinh`)
- Frame photos after cutting (`gong_da_cat`)
- Refraction machine results (`ket_qua_khuc_xa`)

## 1) Database migration

Run migration file:
- `sql/V067_don_kinh_media_storage_foundation.sql`

This migration adds:
- `don_kinh_media` table (metadata only)
- RLS + indexes
- private Supabase bucket `don-kinh-media`

## 2) API endpoint

New endpoint:
- `GET /api/don-kinh/media`
- `POST /api/don-kinh/media`
- `PATCH /api/don-kinh/media`
- `DELETE /api/don-kinh/media`

Auth/tenant/branch rules are the same as existing `don-kinh` APIs.

## 3) Storage abstraction

Added files:
- `src/lib/media/types.ts`
- `src/lib/media/objectPath.ts`
- `src/lib/media/storage.ts`

Current active provider:
- Supabase Storage (`MEDIA_STORAGE_DRIVER=supabase`)

Future provider:
- R2 (`MEDIA_STORAGE_DRIVER=r2`) via same interface.

## 4) Environment variables

Optional env vars:

```env
# Storage driver: supabase | r2
MEDIA_STORAGE_DRIVER=supabase

# Bucket name for both providers (default: don-kinh-media)
MEDIA_BUCKET_NAME=don-kinh-media

# Max accepted file size in bytes for metadata init API (default: 8388608)
MEDIA_IMAGE_MAX_FILE_BYTES=8388608

# Signed read URL ttl in seconds (default: 900)
MEDIA_READ_URL_TTL_SECONDS=900

# ---------- R2 (required when MEDIA_STORAGE_DRIVER=r2) ----------
# Preferred: provide explicit endpoint
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com

# Or provide account id and endpoint will be derived automatically
R2_ACCOUNT_ID=<account_id>

R2_ACCESS_KEY_ID=<r2_access_key_id>
R2_SECRET_ACCESS_KEY=<r2_secret_access_key>

# Optional, default is auto
R2_REGION=auto
```

## 5) Recommended frontend flow

1. Call `POST /api/don-kinh/media` with metadata (kind, mime type, file size).
2. Receive signed upload target.
3. Upload binary directly to storage using signed upload URL.
4. Call `PATCH /api/don-kinh/media` with status=`uploaded` and optional width/height.
5. Use `GET /api/don-kinh/media?don_kinh_id=...` to render signed read URLs.

## 6) R2 cutover plan

When ready to move from Supabase to R2:

1. Set `MEDIA_STORAGE_DRIVER=r2` for new uploads.
2. Configure R2 credentials/endpoint env vars listed above.
3. Keep old rows readable because each row stores `storage_driver` + `bucket` + `object_path`.
4. Optional: background migration to copy old objects and update row metadata in batches.

Note:
- R2 provider now uses AWS Signature V4 directly in server code.
- Signed upload expects client to keep `Content-Type` header exactly as returned by API.
