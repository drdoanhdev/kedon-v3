"""Optigo face recognition edge agent."""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

from agent.config import load_config, save_config
from agent.recognizer import FaceRecognizer

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


def api_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def cmd_pair(args: argparse.Namespace) -> None:
    cfg = load_config(CONFIG_PATH)
    base = args.api_url or cfg.get("api_base_url") or "http://localhost:3000"
    code = args.code.strip().upper()

    res = requests.post(
        f"{base.rstrip('/')}/api/face-devices/pair",
        json={
            "pairing_code": code,
            "device_label": args.label or "PC Camera",
            "agent_version": cfg.get("agent_version", "1.0.0"),
        },
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()

    cfg["device_token"] = data["device_token"]
    cfg["api_base_url"] = data.get("api_base_url") or base
    cfg["tenant_id"] = data.get("tenant_id")
    cfg["branch_id"] = data.get("branch_id")
    save_config(CONFIG_PATH, cfg)

    print("✅ Ghép nối thành công!")
    print(f"   Tenant: {data.get('tenant_id')}")
    print(f"   Config saved: {CONFIG_PATH}")


def sync_embeddings(cfg: dict, recognizer: FaceRecognizer) -> None:
    base = cfg["api_base_url"].rstrip("/")
    token = cfg["device_token"]
    since = cfg.get("last_sync_at")

    params = {}
    if since:
        params["since"] = since

    res = requests.get(
        f"{base}/api/face-embeddings/sync",
        headers=api_headers(token),
        params=params,
        timeout=60,
    )
    res.raise_for_status()
    payload = res.json()
    rows = payload.get("data") or []

    for row in rows:
        emb = row.get("embedding")
        pid = row.get("patient_id")
        name = row.get("name") or f"BN#{pid}"
        if pid and emb:
            recognizer.register(pid, name, emb)

    cfg["last_sync_at"] = payload.get("synced_at")
    save_config(CONFIG_PATH, cfg)
    print(f"🔄 Synced {len(rows)} embeddings (total cache: {recognizer.count()})")


def cmd_enroll(args: argparse.Namespace) -> None:
    cfg = load_config(CONFIG_PATH)
    if not cfg.get("device_token"):
        print("❌ Chưa ghép nối. Chạy: python main.py pair --code XXXXXXXX")
        sys.exit(1)

    recognizer = FaceRecognizer()
    print(f"📷 Mở camera, nhìn thẳng vào lens (BN #{args.patient_id})...")
    embedding = recognizer.capture_embedding(cfg.get("camera_index", 0), samples=5)
    if embedding is None:
        print("❌ Không detect được khuôn mặt")
        sys.exit(1)

    base = cfg["api_base_url"].rstrip("/")
    res = requests.post(
        f"{base}/api/face-embeddings/enroll",
        headers=api_headers(cfg["device_token"]),
        json={"patient_id": args.patient_id, "embedding": embedding},
        timeout=30,
    )
    res.raise_for_status()
    print(f"✅ Đã đăng ký khuôn mặt cho bệnh nhân #{args.patient_id}")


def check_in(cfg: dict, patient_id: int, name: str, confidence: float) -> None:
    base = cfg["api_base_url"].rstrip("/")
    res = requests.post(
        f"{base}/api/nhan-dien",
        headers=api_headers(cfg["device_token"]),
        json={
            "patient_id": patient_id,
            "name": name,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "action": "check_in",
            "confidence": confidence,
        },
        timeout=15,
    )
    if res.status_code >= 400:
        print(f"⚠️ Check-in failed: {res.text}")
        return
    data = res.json()
    print(f"✅ {data.get('message', 'Check-in OK')}")


def report_unknown(cfg: dict, embedding: list, quality: float) -> None:
    base = cfg["api_base_url"].rstrip("/")
    requests.post(
        f"{base}/api/face-devices/report-unknown",
        headers=api_headers(cfg["device_token"]),
        json={"embedding": embedding, "quality_score": quality},
        timeout=15,
    )


def heartbeat(cfg: dict) -> None:
    base = cfg["api_base_url"].rstrip("/")
    requests.post(
        f"{base}/api/face-devices/heartbeat",
        headers=api_headers(cfg["device_token"]),
        json={"agent_version": cfg.get("agent_version", "1.0.0"), "camera_status": "ok"},
        timeout=10,
    )


def cmd_run(args: argparse.Namespace) -> None:
    cfg = load_config(CONFIG_PATH)
    if not cfg.get("device_token"):
        print("❌ Chưa ghép nối. Chạy: python main.py pair --code XXXXXXXX")
        sys.exit(1)

    recognizer = FaceRecognizer()
    threshold = float(cfg.get("match_threshold", 0.45))
    cooldown = int(cfg.get("check_in_cooldown_sec", 60))
    sync_interval = int(cfg.get("sync_interval_sec", 300))
    camera_index = int(cfg.get("camera_index", 0))

    last_check_in: dict[int, float] = {}
    last_sync = 0.0
    last_unknown = 0.0

    print("🚀 Agent đang chạy. Nhấn Ctrl+C để dừng.")
    sync_embeddings(cfg, recognizer)
    last_sync = time.time()

    try:
        while True:
            now = time.time()
            if now - last_sync >= sync_interval:
                sync_embeddings(cfg, recognizer)
                last_sync = now
                heartbeat(cfg)

            match = recognizer.recognize_from_camera(camera_index, threshold)
            if match:
                pid, name, score = match
                if now - last_check_in.get(pid, 0) >= cooldown:
                    check_in(cfg, pid, name, score)
                    last_check_in[pid] = now
            else:
                unknown = recognizer.last_unknown
                if unknown and now - last_unknown >= 120:
                    report_unknown(cfg, unknown["embedding"], unknown["quality"])
                    last_unknown = now

            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n👋 Dừng agent.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Optigo Face Agent")
    sub = parser.add_subparsers(dest="command")

    p_pair = sub.add_parser("pair", help="Ghép nối thiết bị với mã từ web")
    p_pair.add_argument("--code", required=True, help="Mã ghép nối 8 ký tự")
    p_pair.add_argument("--api-url", default=None, help="URL app (mặc định từ config)")
    p_pair.add_argument("--label", default="PC Camera")

    p_enroll = sub.add_parser("enroll", help="Đăng ký khuôn mặt bệnh nhân")
    p_enroll.add_argument("--patient-id", type=int, required=True)

    sub.add_parser("run", help="Chạy nhận diện liên tục")

    args = parser.parse_args()
    if args.command == "pair":
        cmd_pair(args)
    elif args.command == "enroll":
        cmd_enroll(args)
    elif args.command == "run":
        cmd_run(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
