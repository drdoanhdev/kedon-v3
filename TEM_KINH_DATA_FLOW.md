# Tem kinh data flow (Optigo)

## 1) Muc tieu

Xay dung luong in tem kinh cho cua hang kinh, trong do du lieu goc lay truc tiep tu danh muc gong kinh (`GongKinh`) dang duoc quan ly tren Optigo.

Dau ra cua luong:
- Co payload tem da resolve tu thong tin gong + thong tin cua hang + gia hieu luc theo chi nhanh.
- Ho tro template JSON theo kho in (mm), QR, barcode, text, box.
- Ho tro default template theo scope: shared (toan tenant) hoac branch.

## 2) Nguon du lieu

### 2.1 Danh muc gong kinh
- Bang: `GongKinh`
- Cot dung cho tem:
  - `id`, `ten_gong`, `ma_gong`
  - `chat_lieu`, `hang_san_xuat`, `mau_sac`, `kich_co`
  - `gia_nhap`, `gia_ban`, `ton_kho`
  - `nha_cung_cap_id` -> join `NhaCungCap.ten`

### 2.2 Gia hieu luc theo chi nhanh
- Bang: `branch_price_overrides`
- Rule:
  - Neu co override active (`deleted_at IS NULL`, `effective_to IS NULL`) cho item_type = `gong_kinh`, item_id = frame id, branch_id hien tai -> dung `gia_ban_override`.
  - Neu khong co -> dung `GongKinh.gia_ban`.

### 2.3 Thong tin cua hang in tren tem
- Bang: `cau_hinh_mau_in`
- Cot: `ten_cua_hang`, `dia_chi`, `dien_thoai`
- Fallback theo branch:
  - `branches.ten_chi_nhanh`, `branches.dia_chi`, `branches.dien_thoai`

### 2.4 Template tem kinh
- Bang moi: `tem_kinh_templates` (V078)
- Luu JSON element + metadata kho in:
  - `name`, `width_mm`, `height_mm`, `background`, `copies`, `elements`, `is_default`
  - scope theo `branch_id` (NULL = shared)

## 3) Luong du lieu end-to-end

1. User chon gong kinh trong danh muc.
2. Frontend goi `GET /api/tem-kinh/data?gong_kinh_id=<id>&template_id=<optional>`.
3. Backend:
   - Xac thuc tenant + branch access.
   - Lay frame tu `GongKinh`.
   - Tinh gia hieu luc (catalog vs branch override).
   - Lay thong tin cua hang (print config + fallback branch).
   - Lay template:
     - uu tien `template_id` neu truyen,
     - neu khong co thi uu tien default branch,
     - roi den default shared,
     - neu DB chua migration thi fallback built-in template 70x50.
   - Build token map va resolve template.
4. Backend tra ve:
   - `frame`
   - `store`
   - `pricing`
   - `template`
   - `tokens`
   - `resolved_template`
5. Frontend render preview / in.

## 4) Token map (placeholder)

Template su dung syntax `{{token_name}}`.

Danh sach token hien tai:
- `store_name`, `store_address`, `store_phone`, `branch_name`
- `frame_id`, `frame_name`, `frame_code`
- `material`, `manufacturer`, `color`, `size`, `brand`, `supplier_name`
- `buy_price_vnd`, `sell_price_vnd`
- `qr_value`, `barcode_value`, `printed_at`

## 5) API contract

### 5.1 `GET /api/tem-kinh/data`

Query:
- `gong_kinh_id` (required)
- `template_id` (optional)
- `qr_value` (optional override)
- `barcode_value` (optional override)

Response (rut gon):

```json
{
  "frame": {
    "id": 101,
    "ten_gong": "Rayban RB2140",
    "ma_gong": "RB2140-901",
    "chat_lieu": "Nhua",
    "ton_kho": 12
  },
  "store": {
    "ten_cua_hang": "Kinh Mat A",
    "dia_chi": "123 Nguyen Trai",
    "dien_thoai": "0909...",
    "ten_chi_nhanh": "CN Quan 1"
  },
  "pricing": {
    "buy_price": 550000,
    "catalog_sell_price": 890000,
    "effective_sell_price": 850000,
    "source": "branch_override",
    "override_id": 77
  },
  "template": {
    "id": 5,
    "source": "default_saved",
    "name": "Tem kinh 70x50",
    "widthMm": 70,
    "heightMm": 50,
    "background": "#4d74bf",
    "copies": 1,
    "elements": []
  },
  "tokens": {
    "frame_code": "RB2140-901",
    "sell_price_vnd": "850.000 VND"
  },
  "resolved_template": {
    "name": "Tem kinh 70x50",
    "widthMm": 70,
    "heightMm": 50,
    "background": "#4d74bf",
    "copies": 1,
    "elements": []
  }
}
```

### 5.2 `GET/POST/PUT/DELETE /api/tem-kinh/templates`

GET:
- Query `scope=shared|branch|all` (default: `shared`)

POST:
- Body:

```json
{
  "scope": "shared",
  "is_default": true,
  "template": {
    "name": "Tem kinh 70x50",
    "widthMm": 70,
    "heightMm": 50,
    "background": "#4d74bf",
    "copies": 1,
    "elements": []
  }
}
```

PUT:
- Body: `id` + payload template

DELETE:
- Query/body: `id`
- Soft delete (`deleted_at`)

## 6) Quyen va bao mat

- API deu qua `requireTenant`.
- `GET` can feature `print_config`.
- `POST/PUT/DELETE` can feature `print_config` + permission `manage_print_config`.
- Branch safety:
  - staff/doctor bat buoc co `x-branch-id` hop le.
  - branch template khong duoc sua/xoa cheo chi nhanh.

## 7) File implementation

- Data/template utility:
  - `src/lib/temKinh.ts`
- API data payload:
  - `src/pages/api/tem-kinh/data.ts`
- API template CRUD:
  - `src/pages/api/tem-kinh/templates.ts`
- Migration table template:
  - `sql/V078_create_tem_kinh_templates.sql`
- Migration log update:
  - `sql/MIGRATION_LOG.md`

## 8) Ghi chu rollout

1. Chay migration V078 tren DB Optigo + Sang Mat.
2. Frontend co the goi API moi de preview/in tem theo frame.
3. Neu migration chua chay, API van fallback built-in template de khong block luong in.
