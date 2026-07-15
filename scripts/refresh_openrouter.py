#!/usr/bin/env python3
"""Refresh only the OpenRouter section from the official Datasets API.

The API key is read from OPENROUTER_API_KEY or an ignored .env.local file.
It is never written to data.js, sync metadata, logs, or the browser bundle.
"""

from __future__ import annotations

import json
import os
import pathlib
import tempfile
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone


ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "data.js"
META_FILE = ROOT / "data" / "sync-meta.js"
API_URL = "https://openrouter.ai/api/v1/datasets/rankings-daily"
START_DATE = "2025-01-01"
LABS = {"anthropic", "openai", "google", "deepseek", "x-ai", "moonshotai", "z-ai", "minimax", "qwen", "meta-llama"}
WATCH = [
    ("claude-5-fable", "anthropic/claude-5-fable"),
    ("claude-sonnet", "anthropic/claude-sonnet"),
    ("gpt-5", "openai/gpt-5"),
    ("gemini-3", "google/gemini-3"),
    ("deepseek", "deepseek/"),
    ("grok", "x-ai/grok"),
]


def load_local_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if key:
        return key
    env_file = ROOT / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            name, sep, value = line.partition("=")
            if sep and name.strip() == "OPENROUTER_API_KEY":
                return value.strip().strip("'\"")
    return ""


def fetch_json(url: str, key: str, attempts: int = 4) -> dict:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Accept": "application/json",
                    "User-Agent": "ai-monetization-light-dashboard/1.0",
                },
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2**attempt)
    raise RuntimeError(f"OpenRouter request failed: {last_error}")


def load_js(path: pathlib.Path, variable: str) -> dict:
    text = path.read_text(encoding="utf-8").strip()
    prefix = f"window.{variable}="
    if not text.startswith(prefix):
        raise ValueError(f"Unexpected {path.name} format")
    return json.loads(text[len(prefix) :].rstrip(";").strip())


def atomic_js(path: pathlib.Path, variable: str, data: dict) -> None:
    content = f"window.{variable}=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        handle.write(content.encode("utf-8"))
        temp_name = handle.name
    os.replace(temp_name, path)


def main() -> None:
    key = load_local_key()
    if not key:
        print("OPENROUTER_API_KEY is not configured; keeping the validated real-data snapshot")
        return

    rows: list[dict] = []
    as_of = None
    cursor = datetime.strptime(START_DATE, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end = datetime.now(timezone.utc)
    while cursor < end:
        chunk_end = min(cursor + timedelta(days=181), end)
        query = urllib.parse.urlencode({"start_date": cursor.strftime("%Y-%m-%d"), "end_date": chunk_end.strftime("%Y-%m-%d")})
        response = fetch_json(f"{API_URL}?{query}", key)
        rows.extend(response.get("data", []))
        as_of = response.get("meta", {}).get("as_of") or as_of
        cursor = chunk_end + timedelta(days=1)

    by_day: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for row in rows:
        date = str(row["date"])[:10]
        by_day[date].append((row["model_permaslug"], float(row["total_tokens"])))
    days = sorted(by_day)
    if not days:
        raise RuntimeError("OpenRouter returned no ranking rows")

    daily_totals = [[date, round(sum(value for _, value in by_day[date]) / 1e9, 2)] for date in days]
    share_days = days[-180:]
    lab_series: dict[str, list[float]] = defaultdict(lambda: [0.0] * len(share_days))
    for index, date in enumerate(share_days):
        total = sum(value for _, value in by_day[date]) or 1.0
        for slug, value in by_day[date]:
            if slug == "other":
                lab = "long-tail"
            else:
                vendor = slug.split("/", 1)[0]
                lab = vendor if vendor in LABS else "others"
            lab_series[lab][index] += value / total * 100

    watchlist = {}
    for label, prefix in WATCH:
        points = []
        for date in days:
            total = sum(value for slug, value in by_day[date] if slug.startswith(prefix))
            if total > 0:
                points.append([date, round(total / 1e9, 2)])
        watchlist[label] = points

    def top_models(selected_days: list[str], limit: int = 15) -> list[dict]:
        totals: dict[str, float] = defaultdict(float)
        for date in selected_days:
            for slug, value in by_day[date]:
                if slug != "other":
                    totals[slug] += value
        return [
            {"slug": slug, "tokens_b": round(value / 1e9, 2)}
            for slug, value in sorted(totals.items(), key=lambda item: -item[1])[:limit]
        ]

    bundle = load_js(DATA_FILE, "__DATA__")
    bundle["openrouter"] = {
        "sample": False,
        "as_of": as_of or datetime.now(timezone.utc).isoformat(),
        "citation": f"Source: OpenRouter (openrouter.ai/rankings), as of {as_of or days[-1]}",
        "tokenizer_note": "Token counts use each provider's own tokenizer — not fully comparable across providers.",
        "daily_totals": daily_totals,
        "daily_totals_unit": "B tokens/day",
        "lab_share": {"dates": share_days, "labs": {name: [round(value, 2) for value in values] for name, values in lab_series.items()}},
        "watchlist": watchlist,
        "top_models_latest": top_models(days[-1:]),
        "top_models_7d": top_models(days[-7:]),
        "latest_date": days[-1],
    }
    meta = load_js(META_FILE, "__SYNC_META__")
    meta.update({
        "ok": True,
        "openrouter_direct": True,
        "openrouter_as_of": as_of or days[-1],
        "openrouter_latest_date": days[-1],
    })
    atomic_js(DATA_FILE, "__DATA__", bundle)
    atomic_js(META_FILE, "__SYNC_META__", meta)
    print(f"OpenRouter official dataset refreshed through {days[-1]} (sample=false)")


if __name__ == "__main__":
    main()
