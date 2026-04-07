#!/usr/bin/env python3
"""Parse classes(1.3.2).csv + classUpgrades(1.3.2).csv and emit src/data/gameClasses.generated.json.

This file is intended to be the single source-of-truth for editable class data.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLASSES_CSV = ROOT / "classes(1.3.2).csv"
UPGRADES_CSV = ROOT / "classUpgrades(1.3.2).csv"
OUT_PATH = ROOT / "src" / "data" / "gameClasses.generated.json"

VALID_TIERS = {"base", "intermediate", "major"}
VALID_REQ_TYPES = {"none", "or", "and"}


def int_maybe(s: str) -> int | None:
    t = (s or "").strip()
    if not t:
        return None
    try:
        return int(float(t))
    except ValueError:
        return None


def bool_maybe(s: str) -> bool:
    return (s or "").strip().lower() in {"1", "true", "yes", "y"}


def main() -> None:
    if not CLASSES_CSV.exists():
        raise SystemExit(f"Missing {CLASSES_CSV}")
    if not UPGRADES_CSV.exists():
        raise SystemExit(f"Missing {UPGRADES_CSV}")

    classes: list[dict] = []
    with CLASSES_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = (row.get("id") or "").strip()
            if not cid:
                continue
            tier = (row.get("tier") or "").strip().lower()
            if tier not in VALID_TIERS:
                raise SystemExit(f"Invalid tier for {cid}: {tier!r}")
            req_type = (row.get("requirementType") or "none").strip().lower() or "none"
            if req_type not in VALID_REQ_TYPES:
                raise SystemExit(f"Invalid requirementType for {cid}: {req_type!r}")
            req_ids_raw = (row.get("requirementClassIds") or "").strip()
            req_ids = [p.strip() for p in req_ids_raw.split("|") if p.strip()] if req_ids_raw else []
            if req_type == "none":
                req_ids = []

            classes.append(
                {
                    "id": cid,
                    "name": (row.get("name") or cid).strip(),
                    "tier": tier,
                    "maxLevel": int_maybe(row.get("maxLevel") or "") or 0,
                    "classBonusRequiredPoints": int_maybe(row.get("classBonusRequiredPoints") or "") or 0,
                    "perLevel": {
                        "str": int_maybe(row.get("perLevelStr") or "") or 0,
                        "dex": int_maybe(row.get("perLevelDex") or "") or 0,
                        "int": int_maybe(row.get("perLevelInt") or "") or 0,
                    },
                    "requirement": {"type": req_type, "classIds": req_ids},
                    "classBonusText": (row.get("classBonusText") or "").strip(),
                    "upgrades": [],
                }
            )

    upgrades_by_class: dict[str, list[dict]] = {}
    with UPGRADES_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = (row.get("classId") or "").strip()
            upg_id = (row.get("upgradeId") or "").strip()
            if not cid or not upg_id:
                continue
            upgrades_by_class.setdefault(cid, []).append(
                {
                    "id": upg_id,
                    "label": (row.get("label") or upg_id).strip(),
                    "valuePerPoint": float((row.get("valuePerPoint") or "0").strip() or 0),
                    "isFlat": bool_maybe(row.get("isFlat") or ""),
                    "maxPoints": int_maybe(row.get("maxPoints") or "") or 5,
                }
            )

    by_id = {c["id"]: c for c in classes}
    for cid, ups in upgrades_by_class.items():
        if cid not in by_id:
            raise SystemExit(f"Upgrade references unknown classId: {cid}")
        by_id[cid]["upgrades"] = ups

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(classes, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(classes)} classes to {OUT_PATH}")


if __name__ == "__main__":
    main()

