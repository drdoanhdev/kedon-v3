# Checklist test tay — trang Bệnh nhân (`/benh-nhan`)

Dùng sau mỗi bước refactor. Đánh dấu khi đã kiểm tra trên môi trường local.

## Danh sách & tìm kiếm

- [ ] Tìm theo tên
- [ ] Tìm theo SĐT
- [ ] Phân trang (đổi trang)
- [ ] Đổi số dòng/trang
- [ ] Trang 2/3 không bị rỗng (API pagination, không slice client)

## Thêm / sửa / xóa

- [ ] Thêm bệnh nhân từ nút Thêm
- [ ] Thêm từ ô tìm kiếm (seed tự điền: tên / năm / SĐT)
- [ ] Thêm từ URL `?new=1&quick_name=...&quick_namsinh=...&quick_phone=...&quick_diachi=...`
- [ ] Sửa bệnh nhân
- [ ] Xóa bệnh nhân (confirm)

## Hồ sơ (6 tab)

- [ ] Tab đơn thuốc
- [ ] Tab đơn kính
- [ ] Tab lịch hẹn
- [ ] Tab gia đình (`FamilyCard`)
- [ ] Tab ghi chú (xem + mở quản lý)
- [ ] Tab chuỗi (chỉ khi multi-branch)

## Ghi chú (dialog quản lý)

- [ ] Thêm ghi chú
- [ ] Sửa ghi chú
- [ ] Xóa vào thùng rác
- [ ] Khôi phục
- [ ] Xóa vĩnh viễn
- [ ] Lọc active / all / trash

## Gộp bệnh nhân

- [ ] Chọn ≥2 BN → mở dialog
- [ ] Chọn BN chính → xác nhận
- [ ] Ctrl+Enter khi dialog merge đang mở

## Mobile

- [ ] Vuốt card mở actions
- [ ] Sửa / Đơn thuốc / Đơn kính từ swipe
- [ ] Chỉ một card swipe mở cùng lúc

## URL / FAB

- [ ] `?search=...&focusId=...` focus đúng BN
- [ ] `?edit=1` mở dialog sửa
- [ ] Param `new` / `quick_*` bị xóa sau khi mở form (shallow replace)

## Desktop

- [ ] Sắp xếp cột (click)
- [ ] Sắp xếp nhiều cấp (Shift+Click)
- [ ] Sort năm sinh / tuổi đúng

## Regression nhẹ

- [ ] Toast lỗi khi API fail vẫn hiện
- [ ] `ProtectedRoute` vẫn chặn chưa đăng nhập
