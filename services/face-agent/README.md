# Nhận diện khuôn mặt — Edge Agent (Optigo)

Agent Python chạy trên **PC tại phòng khám** (webcam USB hoặc **camera IP qua RTSP**). Không tốn phí cloud AI.

## Yêu cầu

- Windows 10/11 hoặc Linux
- Python 3.10–3.12 (khuyến nghị)
- Webcam 720p **hoặc** camera IP hỗ trợ RTSP
- PC agent cùng mạng LAN với camera IP
- **FFmpeg** trên PATH (cần cho RTSP trên Windows)
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

### Trên web (có preview + hướng dẫn căn khung)

1. Chạy embedding service trên PC (cùng máy hoặc LAN):

```bash
python main.py serve
# Mặc định http://127.0.0.1:8765/embed
```

2. Vào **Quản lý phòng khám → Nhận diện khuôn mặt → Camera đăng ký khuôn mặt**
3. Nhập ID bệnh nhân, căn mặt vào oval, giữ yên khi đạt yêu cầu.

Cấu hình server Next.js (tuỳ chọn):

```
FACE_EMBEDDING_SERVICE_URL=http://127.0.0.1:8765
```

### Qua agent (CLI)

```bash
python main.py enroll --patient-id 123
```

Nhìn thẳng camera 2–3 giây. Lặp lại với BN mới lần đầu đến.

## Chạy nhận diện (tự check-in chờ khám)

```bash
python main.py run
```

Lệnh `run` tự khởi động:
- Nhận diện liên tục + check-in chờ khám
- Preview web (mặc định port **8766**) — xem/đăng ký trên Optigo
- Embedding service (mặc định port **8765**) — không cần chạy `serve` riêng
- Gửi **ảnh khuôn mặt lạ** kèm pending faces

Kiểm tra camera trước khi chạy:

```bash
python main.py test-camera
```

- Sync embedding mỗi 5 phút
- Nhận diện → POST `/api/nhan-dien` → BN vào **Chờ khám**
- Khuôn mặt lạ → gửi **PendingFaces** (lễ tân gán trên web)

## Camera IP (RTSP)

Ưu tiên dùng **substream** (720p) — nhẹ, đủ cho nhận diện mặt.

**Phòng khám (không cần sửa file):** double-click **`cau-hinh-camera.bat`** → chọn hãng camera hoặc dán URL RTSP → kiểm tra → chạy lại `chay-agent.bat`.

**Dev / nâng cao:** sửa `config.json` hoặc:

```bash
python main.py config-camera
python main.py config-camera --rtsp-url "rtsp://admin:pass@192.168.1.100:554/..."
python main.py config-camera --usb-index 0
```

1. Lấy URL RTSP từ app/NVR camera (test bằng VLC: *Media → Open Network Stream*)
2. Cấu hình qua `cau-hinh-camera.bat` hoặc `config.json`:

```json
{
  "camera_url": "rtsp://admin:matkhau@192.168.1.100:554/Streaming/Channels/102",
  "camera_index": 0
}
```

Khi `camera_url` **không rỗng**, agent bỏ qua `camera_index` và dùng RTSP.

**Ví dụ URL theo hãng:**

| Hãng | RTSP (substream khuyến nghị) |
|------|------------------------------|
| Hikvision | `rtsp://user:pass@IP:554/Streaming/Channels/102` |
| Dahua | `rtsp://user:pass@IP:554/cam/realmonitor?channel=1&subtype=1` |
| Reolink | `rtsp://admin:pass@IP:554/h264Preview_01_sub` |

3. Kiểm tra:

```bash
python main.py test-camera
python main.py run
```

**Windows:** cài FFmpeg (`winget install Gyan.FFmpeg`) rồi mở terminal mới.

## Cấu hình (`config.json`)

| Key | Mặc định | Mô tả |
|-----|----------|--------|
| `camera_url` | `""` | URL RTSP/HTTP camera IP (ưu tiên hơn `camera_index`) |
| `camera_index` | 0 | Index webcam USB khi `camera_url` rỗng |
| `match_threshold` | 0.45 | Ngưỡng cosine (0.4–0.55) |
| `check_in_cooldown_sec` | 60 | Tránh check-in trùng |
| `sync_interval_sec` | 300 | Tần suất sync embedding |
| `preview_port` | 8766 | HTTP preview MJPEG (0 = tắt) |
| `embed_port` | 8765 | HTTP embedding cho web enroll (0 = tắt) |

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
| Camera USB không mở | Đổi `camera_index` thành 1, 2... |
| Camera IP không mở | Kiểm tra RTSP bằng VLC, cài FFmpeg, ping IP camera |
| Mất tín hiệu RTSP | Dùng substream, kiểm tra dây mạng / PoE |
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
