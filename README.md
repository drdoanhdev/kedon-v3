This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


PROMPT CHO GITHUB COPILOT – HỆ THỐNG QUẢN LÝ TRÒNG KÍNH
Bối cảnh

Tôi đang xây dựng phần mềm quản lý tròng kính cho phòng khám mắt – cửa hàng kính.
Mục tiêu chính là quản lý tồn kho theo độ tròng cụ thể, không phải quản lý kế toán.

Yêu cầu tổng quát

Hệ thống cần:

Quản lý kho tròng kính theo tổ hợp độ (SPH / CYL / ADD)

Biết chính xác độ nào đang hết hoặc sắp hết

Phân biệt rõ:

Tròng nhập sẵn trong kho

Tròng chỉ đặt khi có khách

Có xuất hỏng (cắt vỡ, lỗi kỹ thuật)

Không cần:

Quản lý lô

FIFO / LIFO

Kế toán chi tiết

1. Danh mục tròng kính

Mỗi dòng tròng là một loại vật tư logic, không gắn trực tiếp với tồn kho.

Thuộc tính:

id

tên tròng (ví dụ: Chemi 1.56, Essilor Progressive)

loại tròng:

don_trong

loan

da_trong

kiểu quản lý:

SAN_KHO (có tồn kho)

DAT_KHI_CO_KHACH (không có tồn kho)

ghi chú

2. Kho tròng kính theo độ (quan trọng nhất)

Mỗi dòng kho = 1 tổ hợp độ cụ thể

Thuộc tính:

id

liên kết đến loại tròng

sph (độ cầu)

cyl (độ loạn, 0 nếu không loạn)

add (độ cộng, null nếu không đa tròng)

tồn đầu kỳ

tồn hiện tại

mức tồn tối thiểu

mức nhập gợi ý

trạng thái tồn kho:

DU

SAP_HET

HET

Quy ước:

Tròng DAT_KHI_CO_KHACH không có bản ghi trong bảng kho

3. Nhập kho

Bảng ghi nhận mỗi lần nhập tròng vào kho.

Thuộc tính:

id

liên kết đến kho theo độ

số lượng nhập

ngày nhập

ghi chú

Khi nhập:

tồn hiện tại += số lượng nhập
4. Xuất bán (theo đơn kính)

Bảng ghi nhận tròng xuất cho khách.

Thuộc tính:

id

liên kết đến kho theo độ

số lượng xuất

id đơn kính

ngày xuất

Chỉ áp dụng cho tròng SAN_KHO.

Khi xuất:

tồn hiện tại -= số lượng xuất
5. Xuất hỏng / lỗi kỹ thuật

Dùng khi:

Cắt vỡ tròng

Lỗi gia công

Tròng hỏng không bán được

Thuộc tính:

id

liên kết đến kho theo độ

số lượng hỏng

lý do

ngày

Khi hỏng:

tồn hiện tại -= số lượng hỏng
6. Quy tắc xử lý đơn kính

Khi tạo đơn kính:

Nếu tròng = SAN_KHO

kiểm tra tồn kho đúng độ

nếu đủ → cho xuất

nếu thiếu → báo hết / thiếu

Nếu tròng = DAT_KHI_CO_KHACH

không kiểm tra tồn kho

không trừ kho

chỉ ghi nhận đơn và trạng thái chờ tròng

7. Logic tính tồn kho

Tồn kho của mỗi độ được tính theo công thức:

tồn hiện tại
= tồn đầu
+ tổng nhập
- tổng xuất bán
- tổng xuất hỏng
8. Gợi ý nhập thêm

Nếu:

tồn hiện tại <= mức tồn tối thiểu

Thì:

số lượng cần nhập = mức nhập gợi ý - tồn hiện tại

Ví dụ:

tồn hiện tại = 3

mức tối thiểu = 5

mức nhập gợi ý = 10
→ cần nhập thêm = 7

9. Yêu cầu triển khai kỹ thuật

Thiết kế Prisma schema đúng theo các bảng trên

Viết API CRUD cho:

danh mục tròng

kho theo độ

nhập kho

xuất bán

xuất hỏng

API trả về:

tồn hiện tại

trạng thái tồn kho

số lượng cần nhập thêm (nếu có)

Code ưu tiên:

đơn giản

dễ đọc

đúng logic thực tế phòng khám

Kết thúc prompt

Copilot hãy:

Tạo Prisma schema

Sinh API Next.js tương ứng

Không tự ý thêm nghiệp vụ ngoài mô tả

Nếu bạn muốn, bước tiếp theo mình có thể:

✍️ Viết prompt riêng cho Prisma

✍️ Viết prompt riêng cho API kho

✍️ Viết prompt cho UI giống Excel bạn đang dùng

🧠 Hoặc chuyển toàn bộ thành checklist triển khai từng bước

Chỉ cần nói: “làm tiếp phần …”

đối với tròng đặt khi có khách (không có tồn kho) khi kê đơn kính cho khách thì số kính đó sẽ được tự động xuất sang bảng tròng kính cần đặt bao gồm các thông tin số lượng miếng, dòng tròng, số kính (số kính này không bao gồm trục, phân biệt mắt trái mắt phải đối với kính đa tròng)

Rất tốt 👍 phần này là nghiệp vụ quan trọng của phòng khám kính, và nếu mô tả rõ thì Copilot sẽ tự sinh được logic đúng.

Dưới đây là PROMPT / REQUIREMENT bổ sung để Copilot hiểu cách xử lý tròng đặt khi có khách.

Bạn có thể dán đoạn này vào README hoặc comment trong code.

Bổ sung nghiệp vụ: TRÒNG ĐẶT KHI CÓ KHÁCH
Mục tiêu

Một số tròng không nhập sẵn trong kho.
Khi kê đơn kính cho khách, hệ thống phải tự động đưa tròng đó vào danh sách tròng cần đặt.

Danh sách này giúp cửa hàng:

tổng hợp tròng cần đặt trong ngày

gửi đơn cho nhà cung cấp

tránh sót đơn

1. Điều kiện để tròng được đưa vào danh sách cần đặt

Khi tạo đơn kính cho khách, hệ thống kiểm tra:

kieu_quan_ly của tròng

Nếu:

kieu_quan_ly = DAT_KHI_CO_KHACH

thì:

KHÔNG xuất kho

KHÔNG kiểm tra tồn kho

TỰ ĐỘNG thêm vào bảng tròng cần đặt

2. Bảng TRÒNG CẦN ĐẶT (lens_order)

Bảng này dùng để tổng hợp các tròng cần đặt từ đơn kính.

Trường	Ý nghĩa
id	ID
don_kinh_id	liên kết đơn kính
lens_type_id	loại tròng
so_luong_mieng	số miếng cần đặt
sph	độ cầu
cyl	độ loạn (không lưu trục)
add	độ cộng
mat	trai / phai / null
ngay_tao	ngày tạo
trang_thai	cho_dat / da_dat / da_nhan
3. Quy tắc về SỐ MIẾNG TRÒNG

Một tròng = 1 miếng

Số miếng cần đặt phụ thuộc vào đơn kính.

Ví dụ 1 – kính cận thường

Khách cận hai mắt:

mắt trái: -2.00
mắt phải: -1.75

→ cần đặt:

2 miếng
Ví dụ 2 – hai mắt cùng độ
mắt trái: -2.00
mắt phải: -2.00

→ vẫn cần:

2 miếng
4. Không lưu TRỤC LOẠN

Trong bảng tròng cần đặt:

KHÔNG lưu:

axis (trục)

Chỉ lưu:

SPH
CYL
ADD

Vì:

trục là thông số khi mài lắp

không ảnh hưởng việc đặt tròng thô

5. Phân biệt MẮT TRÁI / MẮT PHẢI (quan trọng cho đa tròng)

Đối với đa tròng (progressive) cần phân biệt mắt.

Vì:

tròng trái và phải có thể khác thiết kế

Do đó bảng cần có trường:

mat = trai | phai
6. Logic tự động tạo bản ghi

Khi lưu đơn kính:

Pseudo logic:

for mỗi mắt trong đơn kính:

    nếu lens.kieu_quan_ly = DAT_KHI_CO_KHACH:

        tạo bản ghi lens_order

        so_luong_mieng = 1
        sph = độ cầu
        cyl = độ loạn
        add = độ cộng
        mat = trai hoặc phai
7. Bảng tổng hợp TRÒNG CẦN ĐẶT

Hệ thống cần có màn hình:

Danh sách tròng cần đặt trong ngày

Có thể group theo:

loại tròng

độ cầu

độ loạn

add

Ví dụ:

Tròng	SPH	CYL	ADD	Tổng miếng
Essilor Progressive	-1.00	0	+1.50	2
Chemi 1.60	-2.00	-0.75	null	1
8. Khi tròng về

Khi tròng đã đặt về:

cập nhật:

trang_thai = da_nhan

Sau đó có thể:

lắp kính

hoàn thành đơn

9. Yêu cầu cho Copilot

Hãy giúp:

Thiết kế bảng lens_order

Viết logic tự động tạo lens_order khi tạo đơn kính

Tạo API để:

xem danh sách tròng cần đặt

đánh dấu đã đặt

đánh dấu đã nhận

Gợi ý prompt ngắn để hỏi Copilot

Bạn có thể hỏi Copilot:

Viết logic khi tạo đơn kính:
nếu tròng có kieu_quan_ly = DAT_KHI_CO_KHACH
thì tự động tạo bản ghi trong bảng lens_order
mỗi mắt tương ứng 1 miếng tròng cần đặt
không lưu trục loạn
có phân biệt mắt trái và mắt phải