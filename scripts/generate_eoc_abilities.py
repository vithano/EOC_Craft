#!/usr/bin/env python3
"""Parse abilities(1.3.2).csv and emit src/data/eocAbilities.generated.json"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "abilities(1.3.2).csv"
OUT_PATH = ROOT / "src" / "data" / "eocAbilities.generated.json"

VALID_TYPES = frozenset({"Melee", "Ranged", "Spells"})

MELEE_WEAPON_TAGS = ("mace", "warhammer", "battlestaff", "sword", "greatsword", "dagger")

DEALS_RE = re.compile(
    r"deals\s+(\d+)\s*-\s*(\d+)\s+(\w+)\s+damage",
    re.IGNORECASE,
)


def slugify(name: str) -> str:
    s = name.lower().replace("'", "").replace(",", "")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


def pct_maybe(s: str) -> float | None:
    t = (s or "").strip().replace("%", "").strip()
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def float_maybe(s: str) -> float | None:
    t = (s or "").strip()
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def int_maybe(s: str) -> int | None:
    t = (s or "").strip()
    if not t:
        return None
    try:
        return int(float(t))
    except ValueError:
        return None


def normalize_weapon_tags(raw: str) -> list[str]:
    s = (raw or "").strip().lower()
    if not s:
        return []
    if s == "melee weapon":
        return list(MELEE_WEAPON_TAGS)
    parts = [p.strip().lower() for p in raw.split(",") if p.strip()]
    out: list[str] = []
    for p in parts:
        if p == "hand crossbow":
            out.append("hand_crossbow")
        else:
            out.append(p.replace(" ", "_"))
    return out


def parse_spell_hit(line1: str) -> dict | None:
    m = DEALS_RE.search(line1 or "")
    if not m:
        return None
    return {
        "min": int(m.group(1)),
        "max": int(m.group(2)),
        "element": m.group(3).lower(),
    }


def main() -> None:
    rows: list[dict] = []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            t = (row.get("Type") or "").strip()
            name = (row.get("Name") or "").strip()
            if not t or not name:
                continue
            if t not in VALID_TYPES:
                continue

            lines: list[str] = []
            for k in ("line 1", "line 2", "line 3", "line 4", "line 5"):
                v = (row.get(k) or "").strip()
                if v:
                    lines.append(v)

            line1 = (row.get("line 1") or "").strip()
            spell_hit = parse_spell_hit(line1) if t == "Spells" else None

            rows.append(
                {
                    "id": f"ability_{slugify(name)}",
                    "type": t,
                    "name": name,
                    "startingAbilityLevel": int_maybe(row.get("starting ability level", "")) or 0,
                    "weaponTypesRaw": (row.get("weapon types") or "").strip(),
                    "weaponTags": normalize_weapon_tags(row.get("weapon types") or ""),
                    "damageMultiplierPct": pct_maybe(row.get("Damage multiplier", "")),
                    "attackSpeedMultiplierPct": pct_maybe(row.get("Attack speed multiplier", "")),
                    "addedDamageMultiplierPct": pct_maybe(row.get("Added damage multiplier", "")),
                    "castTimeSeconds": float_maybe(row.get("Cast time(seconds)", "")),
                    "baseCritChancePct": pct_maybe(row.get("Base critical hit chance", "")),
                    "manaCost": int_maybe(row.get("Mana cost", "")),
                    "lines": lines,
                    "attunement0": (row.get("attunement 0%") or "").strip(),
                    "attunement100": (row.get("attunement 100%") or "").strip(),
                    "spellHit": spell_hit,
                }
            )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} abilities to {OUT_PATH}")


if __name__ == "__main__":
    main()
