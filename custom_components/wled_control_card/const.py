"""Konstanten der WLED-Control-Card-Integration."""

from __future__ import annotations

import json
from pathlib import Path

DOMAIN = "wled_control_card"

# Basis-URL, unter der der Ordner ``dist`` ausgeliefert wird.
URL_BASE = "/wled_control_card"

# Version aus der manifest.json lesen (eine einzige Quelle der Wahrheit).
_MANIFEST = json.loads((Path(__file__).parent / "manifest.json").read_text(encoding="utf-8"))
VERSION: str = _MANIFEST.get("version", "0.0.0")

# Alle mitgelieferten JS-Module (hier: die eine Karte).
JSMODULES: list[dict[str, str]] = [
    {
        "name": "WLED Control Card",
        "filename": "wled-control-card.js",
        "version": VERSION,
    },
]
