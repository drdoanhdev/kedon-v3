import json
from pathlib import Path
from typing import Any


def load_config(path: Path) -> dict[str, Any]:
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    example = path.parent / "config.example.json"
    if example.exists():
        with open(example, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_config(path: Path, data: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
