# Nhận diện khuôn mặt — Edge Agent (Optigo)

Agent Python chạy trên **PC tại phòng khám** (cùng camera USB). Không tốn phí cloud AI.

## Yêu cầu

- Windows 10/11 hoặc Linux
- Python 3.10+
- Webcam 720p trở lên
- Gói **Pro** trên Optigo

## Cài đặt cho phòng khám (Windows — không cần biết Python)

1. Tải **`OptigoFaceAgent.zip`** (build: `npm run pack:face-agent`)
   - Link tải trên web: `/downloads/OptigoFaceAgent.zip` (production: `https://app.optigo.vn/downloads/OptigoFaceAgent.zip`)
2. Giải nén vào thư mục bất kỳ (vd. `C:\OptigoFaceAgent`)
3. **Double-click `cai-dat.bat`** — cài Python (qua winget nếu thiếu), thư viện, model AI
4. **Double-click `ghep-noi.bat`** — nhập mã ghép nối từ web
5. **Double-click `chay-agent.bat`** — chạy nhận diện

Xem `HUONG-DAN.txt` trong gói zip.

## Cài đặt dev (từ source)

```bash
cd services/face-agent
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac
pip install -r requirements.txt
copy config.example.json config.json
```

Lần đầu chạy, InsightFace sẽ tải model `buffalo_l` (~300MB).

## Ghép nối thiết bị

1. Vào **Quản lý phòng khám → Nhận diện khuôn mặt → Tạo mã ghép nối**
2. Trên PC camera:

```bash
python main.py pair --code ABCD1234 --api-url https://app.optigo.vn
```

Token được lưu vào `config.json`.

## Đăng ký khuôn mặt bệnh nhân

```bash
python main.py enroll --patient-id 123
```

Nhìn thẳng camera 2–3 giây. Lặp lại với BN mới lần đầu đến.

## Chạy nhận diện (tự check-in chờ khám)

```bash
python main.py run
```

- Sync embedding mỗi 5 phút
- Nhận diện → POST `/api/nhan-dien` → BN vào **Chờ khám**
- Khuôn mặt lạ → gửi **PendingFaces** (lễ tân gán trên web)

## Cấu hình (`config.json`)

| Key | Mặc định | Mô tả |
|-----|----------|--------|
| `match_threshold` | 0.45 | Ngưỡng cosine (0.4–0.55) |
| `check_in_cooldown_sec` | 60 | Tránh check-in trùng |
| `camera_index` | 0 | Index webcam |
| `sync_interval_sec` | 300 | Tần suất sync embedding |

## Chạy nền Windows (Task Scheduler)

Tạo task chạy khi đăng nhập:

- Program: `C:\...\face-agent\.venv\Scripts\python.exe`
- Arguments: `main.py run`
- Start in: `D:\kedon-v3\services\face-agent`

## Bảo mật

- `device_token` chỉ dùng cho 1 PC — thu hồi trên web nếu lộ
- Không commit `config.json` (đã gitignore)

## Troubleshooting

| Lỗi | Cách xử lý |
|-----|------------|
| Camera không mở | Đổi `camera_index` thành 1, 2... |
| Không nhận diện | Chạy lại `enroll`, tăng ánh sáng |
| 403 gói Pro | Nâng cấp gói trên Optigo |
| Model tải chậm | Kiểm tra mạng lần đầu |

## API endpoints (device token)

| Method | Path | Mục đích |
|--------|------|----------|
| GET | `/api/face-embeddings/sync` | Pull embedding |
| POST | `/api/face-embeddings` | Lưu embedding (enroll) |
| POST | `/api/nhan-dien` | Check-in chờ khám |
| POST | `/api/face-devices/report-unknown` | Báo khuôn mặt lạ |
| POST | `/api/face-devices/heartbeat` | Ping online |
