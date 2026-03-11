# Tính năng Tìm kiếm và Thêm Bệnh Nhân Thông minh

## 🎯 Các tính năng đã triển khai

### 1. **Tự động điền tên từ ô tìm kiếm** ✨
Khi bạn tìm kiếm bệnh nhân nhưng không tìm thấy, bấm nút "Thêm BN" sẽ:
- Tự động lấy nội dung từ ô tìm kiếm
- Điền vào ô "Họ Tên" trong popup thêm bệnh nhân
- Tự động viết hoa chữ cái đầu mỗi từ

**Ví dụ:**
```
Tìm kiếm: "nguyen van a"
↓ Bấm "Thêm BN"
→ Họ Tên tự động điền: "Nguyen Van A"
```

### 2. **Tự động viết hoa chữ cái đầu mỗi từ** 📝
Khi nhập họ tên, hệ thống tự động format theo chuẩn:

**Cách 1: Tự động khi gõ khoảng trắng**
```
Gõ: "nguyen" → "nguyen"
Gõ thêm khoảng trắng: "nguyen " → "Nguyen "
Gõ tiếp: "Nguyen van" → "Nguyen van"
Gõ khoảng trắng: "Nguyen van " → "Nguyen Van "
```

**Cách 2: Tự động khi rời khỏi ô nhập (onBlur)**
```
Đang nhập: "nguyen van anh"
↓ Click ra ngoài hoặc Tab sang ô khác
→ Tự động thành: "Nguyen Van Anh"
```

## 🚀 Workflow sử dụng

### Quy trình thêm bệnh nhân mới nhanh:

1. **Bước 1**: Gõ tên vào ô tìm kiếm
   ```
   Ô tìm kiếm: "tran thi b"
   ```

2. **Bước 2**: Nếu không tìm thấy, bấm "Thêm BN"
   - Popup hiện lên
   - Họ Tên đã được điền sẵn: "Tran Thi B"

3. **Bước 3**: Chỉ cần điền thêm:
   - Năm sinh
   - Số điện thoại
   - Địa chỉ

4. **Bước 4**: Bấm "Lưu" (Ctrl+Enter)

### Ví dụ thực tế:

**Trường hợp 1: Tìm không thấy, thêm nhanh**
```
1. Gõ tìm kiếm: "le van c"
2. Không tìm thấy → Bấm "Thêm BN"
3. Họ Tên đã có: "Le Van C"
4. Nhập thêm: Năm sinh: 1990, SĐT: 0123456789
5. Ctrl+Enter để lưu
```

**Trường hợp 2: Gõ tay trong popup**
```
1. Bấm "Thêm BN" (không tìm kiếm trước)
2. Gõ họ tên: "pham thi d"
3. Gõ khoảng trắng hoặc Tab ra ngoài
4. Tự động thành: "Pham Thi D"
```

## 💡 Lợi ích

1. **Tiết kiệm thời gian**: Không cần gõ lại tên đã tìm kiếm
2. **Giảm lỗi**: Tự động format đúng chuẩn họ tên
3. **Workflow mượt mà**: Tìm → Không thấy → Thêm ngay
4. **Nhất quán**: Tất cả họ tên đều được viết hoa đúng cách

## 🔧 Technical Details

### Hàm mới trong `utils.ts`:
```typescript
capitalizeWords(str: string): string
```
- Chuyển tất cả chữ về lowercase
- Viết hoa chữ cái đầu mỗi từ
- Xử lý cả trường hợp nhiều khoảng trắng

### Cập nhật trong `benh-nhan.tsx`:
1. **Import**: `capitalizeWords` từ utils
2. **onClick "Thêm BN"**: 
   - Lấy `search.trim()`
   - Apply `capitalizeWords()`
   - Set vào `form.ten`
3. **onChange Input Họ Tên**:
   - Tự động capitalize khi gõ khoảng trắng
4. **onBlur Input Họ Tên**:
   - Tự động capitalize toàn bộ khi rời khỏi ô

## 📊 Test Cases

✅ Test 1: Tìm "nguyen van a" → Thêm BN → Họ tên = "Nguyen Van A"
✅ Test 2: Gõ "le thi b " (có space cuối) → Auto capitalize ngay
✅ Test 3: Gõ "pham van c" → Tab sang ô khác → "Pham Van C"
✅ Test 4: Ô tìm kiếm rỗng → Thêm BN → Họ tên = "" (rỗng)
✅ Test 5: Tìm "  nguyen  " (nhiều space) → Thêm BN → "Nguyen"
