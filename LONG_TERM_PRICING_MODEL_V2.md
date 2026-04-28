# Long-Term Pricing Model (Option 2)

## Objective
Xay dung mo hinh gia theo chi nhanh va gia von theo giao dich nhap kho, khong pha vo luong cu.

## Implementation status (2026-04-28)
- Done: migration V049 applied on Optigo dev (project ref: nhoywhaintnmqlcgfduw).
- Done: API DonThuoc POST/PUT luu snapshot `don_gia_ban`, `don_gia_von` (co fallback khi DB chua co cot).
- Done: API danh muc Thuoc/HangTrong/GongKinh ho tro `effective_price=1` de tra gia hieu luc theo branch.
- Done: UI ke-don va ke-don-kinh da su dung luong gia hieu luc.

## What V049 adds
1. `branch_price_overrides`
- Override gia ban/gia von theo chi nhanh cho item trong danh muc.
- Item type ho tro: `thuoc`, `hang_trong`, `gong_kinh`, `nhom_gia_gong`.
- Khong thay doi gia goc tren danh muc chung.

2. Snapshot gia cho chi tiet don thuoc
- Them `don_gia_ban`, `don_gia_von` vao `ChiTietDonThuoc`.
- Backfill tu `Thuoc.giaban/gianhap` cho du lieu cu.
- Muc tieu: bao cao lai lo sau nay khong bi troi khi doi gia danh muc.

3. Them `branch_id` cho bang giao dich kho
- `thuoc_nhap_kho`, `thuoc_huy`, `frame_import`, `frame_export`, `lens_import`, `lens_export_sale`, `lens_export_damaged`, `nhom_gia_gong_nhap`.
- Co backfill best-effort tu bang danh muc/kho lien quan.

4. Ham helper
- `fn_get_effective_item_price(...)` tra ve gia hieu luc theo thu tu:
  - branch override
  - fallback ve catalog default

## Rollout order (safe)
1. Chay migration `V049_branch_pricing_and_cost_snapshots.sql`.
2. Cap nhat API read gia:
- O cac man tao don, lay gia qua `fn_get_effective_item_price` thay vi doc truc tiep gia danh muc.
3. Cap nhat API write don thuoc:
- Luu `don_gia_ban`, `don_gia_von` vao `ChiTietDonThuoc` khi insert/update.
4. Cap nhat bao cao lai:
- Uu tien dung snapshot line-level, chi fallback logic cu khi row cu chua backfill.
5. Sau khi on dinh, moi bat dau toi uu weighted-average cost theo branch.

## Important notes
- V049 khong buoc doi UI ngay lap tuc.
- V049 giu tuong thich nguoc, API cu van chay.
- Truong hop branch moi chua co override se tu dong dung gia catalog.

## Next implementation batch
1. API `src/pages/api/don-thuoc/index.ts`
- Luu `don_gia_ban`, `don_gia_von` theo thuoc tai thoi diem tao/sua.

2. API danh muc doc gia theo branch
- Them endpoint read effective price list cho UI don thuoc/don kinh.

3. Ke don UI
- Hien thi nhan gia: `catalog_default` hoac `branch_override` de nhan vien biet nguon gia.
