"""URL RTSP mẫu theo hãng camera — dùng chung giữa CLI wizard và setup UI web."""
from __future__ import annotations

RTSP_PRESETS: dict[str, str] = {
    "hikvision": "rtsp://{user}:{password}@{ip}:554/Streaming/Channels/102",
    "dahua": "rtsp://{user}:{password}@{ip}:554/cam/realmonitor?channel=1&subtype=1",
    "reolink": "rtsp://{user}:{password}@{ip}:554/h264Preview_01_sub",
}


def build_rtsp_url(preset_key: str, ip: str, user: str, password: str) -> str:
    preset = RTSP_PRESETS[preset_key]
    return preset.format(user=user, password=password, ip=ip)
