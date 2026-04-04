#!/usr/bin/env python3
"""Parse EOC uniques CSV and emit src/data/eocUniques.generated.json"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "Echos of Creation List of Uniques (1.1.0) - Sheet1.csv"
OUT_PATH = ROOT / "src" / "data" / "eocUniques.generated.json"

RANGE_RE = re.compile(
    r"\(\s*(-?\d+(?:\.\d+)?)\s*%?\s+to\s+(-?\d+(?:\.\d+)?)\s*%?\s*\)",
    re.IGNORECASE,
)


def slugify(name: str) -> str:
    s = name.lower().replace("'", "").replace(",", "")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


def parse_pieces(text: str) -> list[str | dict]:
    if not text or not str(text).strip():
        return []
    s = str(text).strip()
    parts: list[str | dict] = []
    last = 0
    for m in RANGE_RE.finditer(s):
        if m.start() > last:
            parts.append(s[last : m.start()])
        parts.append({"type": "range", "min": float(m.group(1)), "max": float(m.group(2))})
        last = m.end()
    if last < len(s):
        parts.append(s[last:])
    return parts


def to_int_maybe(v: str) -> int | None:
    v = (v or "").strip()
    if not v:
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


TWO_HANDED_TYPES = frozenset(
    {"Warhammer", "Greatsword", "Bow", "Magestave", "Battlestave"}
)


def parse_enhancement_percent(s: str) -> float:
    t = (s or "").strip().replace("%", "").strip()
    if not t:
        return 0.0
    try:
        return float(t)
    except ValueError:
        return 0.0


def collect_roll_labels(innate: list, lines: list) -> list[str]:
    labels: list[str] = []

    def walk(pieces: list) -> None:
        if not pieces:
            return
        for i, p in enumerate(pieces):
            if not isinstance(p, dict) or p.get("type") != "range":
                continue
            left = ""
            j = i - 1
            while j >= 0 and isinstance(pieces[j], str):
                left = pieces[j] + left
                j -= 1
            right = ""
            j = i + 1
            while j < len(pieces) and isinstance(pieces[j], str):
                right += pieces[j]
                j += 1
            L = left.strip()
            R = right.strip()
            core = (L + (" " if L and R else "") + R).strip()
            if core.startswith("%"):
                core = "Value" + core
            labels.append(core if core else f"Value {len(labels) + 1}")

    walk(innate)
    for ln in lines:
        walk(ln)
    return labels


def game_slot(item_slot: str, item_type: str) -> str:
    if item_slot == "Weapon":
        return "Weapon"
    if item_slot == "Armor":
        m = {
            "Body": "Chest",
            "Helmet": "Helmet",
            "Gloves": "Gloves",
            "Boots": "Boots",
            "Shield": "Off-hand",
        }
        return m[item_type]
    if item_slot == "Accessory":
        m = {"Amulet": "Amulet", "Ring": "Ring", "Belt": "Belt"}
        return m[item_type]
    raise ValueError(f"Unknown Item Slot {item_slot}")


def main() -> None:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    uniques: list[dict] = []
    for row in rows:
        slot = game_slot(row["Item Slot"], row["Item Type"])
        slug = slugify(row["Name"])
        uid = f"unique_{slug}"
        innate = parse_pieces(row.get("Innate Stat") or "")
        line_cols = [row.get(f"Line {i}") or "" for i in range(1, 7)]
        lines = [parse_pieces(lc) for lc in line_cols if (lc or "").strip()]
        itype = row["Item Type"].strip()
        u = {
            "id": uid,
            "name": row["Name"].strip(),
            "slot": slot,
            "itemType": itype,
            "reqLevel": to_int_maybe(row.get("Required Level") or "") or 1,
            "reqStr": to_int_maybe(row.get("Required Strength") or ""),
            "reqDex": to_int_maybe(row.get("Required Dexerity") or ""),
            "reqInt": to_int_maybe(row.get("Required Intelligence") or ""),
            "enhancementBonus": (row.get("Enhancement Bonus") or "").strip(),
            "enhancementBonusPerLevel": parse_enhancement_percent(
                row.get("Enhancement Bonus") or ""
            ),
            "maxEnhancement": 10,
            "twoHanded": itype in TWO_HANDED_TYPES,
            "rollLabels": collect_roll_labels(innate, lines),
            "innate": innate,
            "lines": lines,
        }
        uniques.append(u)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as out:
        json.dump(uniques, out, ensure_ascii=False, indent=2)
        out.write("\n")
    print(f"Wrote {len(uniques)} uniques to {OUT_PATH}")


if __name__ == "__main__":
    main()
