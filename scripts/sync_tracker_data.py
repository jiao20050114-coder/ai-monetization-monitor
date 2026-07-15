#!/usr/bin/env python3
"""Synchronize the dashboard with the tracker project's published data bundle.

The script deliberately downloads the generated data bundle instead of scraping
the rendered website. It validates the payload, rejects sample data by default,
and only replaces the local snapshot after every check passes.
"""

from __future__ import annotations

import json
import os
import pathlib
import tempfile
import time
import urllib.request
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "data.js"
META_FILE = ROOT / "data" / "sync-meta.js"
SOURCE_URL = os.environ.get(
    "TRACKER_DATA_URL",
    "https://raw.githubusercontent.com/aokunyade/ai-monetization-tracker/main/data/data.js",
)
REQUIRED = {
    "arr",
    "openrouter",
    "vercel",
    "gpu",
    "datacenters",
    "sdk",
    "proxies",
    "news",
    "signals",
}


def fetch(url: str, attempts: int = 4) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "ai-monetization-light-dashboard/1.0",
                    "Accept": "application/javascript,text/plain,*/*",
                },
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                return response.read()
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2**attempt)
    raise RuntimeError(f"Could not download tracker data: {last_error}")


def parse_bundle(raw: bytes) -> dict:
    text = raw.decode("utf-8").strip()
    prefix = "window.__DATA__="
    if not text.startswith(prefix):
        raise ValueError("Unexpected bundle format")
    payload = text[len(prefix) :].rstrip(";").strip()
    data = json.loads(payload)
    missing = sorted(REQUIRED - set(data))
    if missing:
        raise ValueError(f"Missing sections: {', '.join(missing)}")

    if not isinstance(data["openrouter"].get("daily_totals"), list):
        raise ValueError("OpenRouter daily_totals is invalid")
    if not isinstance(data["vercel"].get("history"), dict):
        raise ValueError("Vercel history is invalid")
    if not isinstance(data["gpu"].get("series"), dict):
        raise ValueError("GPU series is invalid")

    sample_sections = sorted(
        key for key, value in data.items() if isinstance(value, dict) and value.get("sample")
    )
    if sample_sections and os.environ.get("ALLOW_SAMPLE_DATA") != "1":
        raise ValueError(f"Refusing sample data: {', '.join(sample_sections)}")
    return data


def atomic_write(path: pathlib.Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        handle.write(content)
        temp_name = handle.name
    os.replace(temp_name, path)


def main() -> None:
    raw = fetch(SOURCE_URL)
    data = parse_bundle(raw)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    latest = data.get("openrouter", {}).get("latest_date") or data.get("arr", {}).get("updated")
    meta = {
        "ok": True,
        "synced_at": now,
        "source_updated_at": latest,
        "source_url": SOURCE_URL,
        "sample_sections": [],
        "schema": 1,
    }
    normalized = "window.__DATA__=" + json.dumps(
        data, ensure_ascii=False, separators=(",", ":")
    ) + ";\n"
    meta_js = "window.__SYNC_META__=" + json.dumps(
        meta, ensure_ascii=False, separators=(",", ":")
    ) + ";\n"
    atomic_write(DATA_FILE, normalized.encode("utf-8"))
    atomic_write(META_FILE, meta_js.encode("utf-8"))
    print(f"Synced {latest} data from {SOURCE_URL}")


if __name__ == "__main__":
    main()
