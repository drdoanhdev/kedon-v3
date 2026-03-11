# Tính năng Tìm kiếm Thông minh

## Mô tả
Đã triển khai tính năng tìm kiếm thông minh với các đặc điểm:
- **Tìm không dấu**: Tìm kiếm không phân biệt dấu tiếng Việt
- **Tìm theo từ đầu**: Chỉ tìm các từ bắt đầu bằng ký tự tìm kiếm

## Ví dụ

### Tìm chữ "N":
- ✅ Tìm được: "**N**hung", "**N**guyễn Văn A", "Bệnh **n**hiễm khuẩn"
- ❌ KHÔNG tìm được: "Chiế**n**", "Mạ**n**h"

### Tìm chữ "Chi":
- ✅ Tìm được: "**Chi**ến", "**Chi**ều", "**Chị** Mai"
- ❌ KHÔNG tìm được: "Man**chi**"

### Tìm không dấu:
- Tìm "nhung" → Tìm được cả "nhung", "nhúng", "nhừng", "Nhung"
- Tìm "chien" → Tìm được cả "chiến", "chiền", "Chiến"

## Các trang đã áp dụng

### 1. Trang Bệnh nhân (`benh-nhan.tsx`)
- Tìm kiếm theo tên bệnh nhân
- Tìm kiếm theo mã bệnh nhân

### 2. Trang Kê đơn (`ke-don.tsx`)
- Tìm thuốc trong danh sách thuốc (sidebar)
- Tìm thuốc khi thêm vào đơn đang kê

## Cách sử dụng

### Trong code:
```typescript
import { searchByStartsWith } from '@/lib/utils';

// Sử dụng
const filtered = items.filter(item => 
  searchByStartsWith(item.name, searchQuery)
);
```

### Các hàm utility:

#### 1. `removeVietnameseTones(str: string)`
Loại bỏ dấu tiếng Việt khỏi chuỗi
```typescript
removeVietnameseTones("Nguyễn Văn Chiến")
// Returns: "nguyen van chien"
```

#### 2. `searchByStartsWith(text: string, query: string)`
Tìm kiếm thông minh - tìm từ bắt đầu với query (không phân biệt dấu)
```typescript
searchByStartsWith("Nguyễn Văn Chiến", "N")    // true
searchByStartsWith("Nguyễn Văn Chiến", "Chi")  // true
searchByStartsWith("Nguyễn Văn Chiến", "en")   // false
```

## Lợi ích
1. **Dễ sử dụng**: Người dùng không cần bật bộ gõ tiếng Việt, có thể gõ không dấu
2. **Tìm kiếm nhanh**: Chỉ cần gõ ký tự đầu của từ cần tìm
3. **Chính xác hơn**: Tránh tìm ra quá nhiều kết quả không liên quan (như "chiến" khi tìm "n")

## Technical Details
- File: `src/lib/utils.ts`
- Áp dụng tại: `src/pages/benh-nhan.tsx`, `src/pages/ke-don.tsx`
- Sử dụng: `useMemo` để tối ưu performance
- Hỗ trợ: Tất cả dấu tiếng Việt (6 thanh điệu, đ)
