# REFACTOR_PLAN — Trang Bệnh nhân

Nhánh: `refactor/benh-nhan`. Không đổi hành vi UI/API.

## Baseline kiểm tra (Giai đoạn 0)

| Lệnh | Kết quả ghi nhận |
|------|------------------|
| `npm run typecheck` | **~50** lỗi TS sẵn có (toàn repo). `tsconfig` sửa `ignoreDeprecations` `"6.0"` → `"5.0"` để `tsc` chạy được với TS 5.8. Sau refactor module BN: **49** (không thêm lỗi mới; hết lỗi `benh-nhan.tsx` null `ngay_kham_gan_nhat`). |
| `npm run lint` | 2 error (`FamilyCard` unescaped quotes) + vài warning — không liên quan BN. |

---

## Bảng so sánh `BenhNhan` (trùng / lệch)

| Nguồn | `id` | Trường chính | Ghi chú |
|-------|------|--------------|---------|
| `lib/patient/types.ts` (**nguồn mới**) | optional | đầy đủ + branch + `ngay_kham_gan_nhat` null | Module BN dùng cái này |
| `pages/ke-don.tsx` | required | tương tự, không branch | Giai đoạn 2 |
| `pages/ke-don-kinh.tsx` | required | dienthoai/diachi optional | Giai đoạn 2 |
| `api/benh-nhan/index.ts` | required | + tuoi list-only | Giữ local API |
| `loc-trung.tsx` / `tien-luong-ksct.tsx` | khác nhau | subset | Giai đoạn 2 |
| `patientSearch.PatientResult` | required | search subset | Giữ riêng |

---

## Cấu trúc đã đạt

```
src/lib/patient/{types,constants,age,sort,api}.ts
src/components/benh-nhan/
  BenhNhanPage.tsx (~281)
  PatientFormDialog / PatientNotesDialog / MergePatientsDialog
  PatientListMobile / PatientListDesktop / PatientRecordTabs
  usePatientList / usePatientRecord / usePatientNotes / usePatientMerge
  usePatientSwipe / useBenhNhanUrlParams / useBenhNhanActions
src/pages/benh-nhan.tsx  → re-export default
```

Tái dùng: `parsePatientSeed`, `capitalizeWords`, `FamilyCard`.

---

## Các bước (Giai đoạn 3)

| Bước | Nội dung | Trạng thái | Cách kiểm tra |
|------|----------|------------|---------------|
| **1** | `src/lib/patient/*` + import | **done** | typecheck; sort năm sinh/tuổi |
| **2** | 3 dialog → components | **done** | form, notes CRUD, merge + Ctrl+Enter |
| **3** | `PatientRecordTabs` + `usePatientRecord` | **done** | 6 tab, multi-branch chuỗi |
| **4** | Mobile/Desktop lists + `usePatientSwipe` | **done** | swipe, pagination 2 layout |
| **5** | `useBenhNhanUrlParams` + `usePatientList` | **done** | URL search/focus/edit/new/quick_* |
| **6** | Orchestrator + page wrapper + typ chainHistory | **done** | Full `TEST_CHECKLIST.md` |

---

## Giai đoạn 2 (nhân rộng — chờ làm)

Rà các trang sau; mỗi trang một nhánh/commit:

1. **`ke-don.tsx` / `ke-don-kinh.tsx`**
   - Thay local `interface BenhNhan` / `PatientNote` bằng `@/lib/patient/types`.
   - PUT profile dùng `updateBenhNhan` từ `@/lib/patient/api` (hoặc giữ axios nếu payload khác).
   - Notes dialog có thể tái dùng `PatientNotesDialog` + `usePatientNotes` nếu props khớp.
2. **`loc-trung.tsx`**
   - Import `BenhNhan` + `mergeBenhNhans`.
3. **`tien-luong-ksct.tsx`**
   - Import `BenhNhan` + `calcPatientAge` thay `calcAgeFromNamsinh`.
4. **Print components** — cân nhắc `BenhNhanData` extend từ type dùng chung (optional).

Không đổi route `/benh-nhan` → không cần cập nhật `productFeaturesCatalog`.

---

## Review nhanh (Giai đoạn 4)

Đã kiểm tra sau refactor:

- Typecheck module BN: sạch; tổng repo không tăng lỗi.
- Page chỉ re-export; không còn monolith 2600 dòng.
- Giữ pagination API (không slice client).
- Seed tạo BN dùng `parsePatientSeed` (thay bản copy trong page) — cùng contract với `patientSeed.ts`.
- File list UI vẫn >250 dòng (JSX dày); có thể tách card/row sau nếu cần.

Rủi ro còn lại (test tay):

- Seed từ ô tìm kiếm: xác nhận parity `parsePatientSeed` vs logic cũ trên edge case (SĐT + năm).
- Ctrl+Enter merge; focus URL `focusId`/`edit`/`new`.
- Swipe mobile + tab chuỗi multi-branch.

---

## Tài liệu liên quan

- `docs/ARCHITECTURE.md`
- `docs/TEST_CHECKLIST.md`
- `.cursor/rules/project.mdc`, `.cursor/rules/benh-nhan.mdc`
