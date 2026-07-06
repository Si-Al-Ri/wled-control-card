"""Liefert die Karte aus und macht sie im Frontend verfügbar.

WICHTIG: Das Modul wird **nur über EINEN Weg** geladen. Beides gleichzeitig
(Lovelace-Ressource UND add_extra_js_url) lädt dasselbe Modul doppelt und führt
zu sporadischen „custom element doesn't exist"-Fehlern beim Browser-Refresh.

- Storage-Modus  -> Lovelace-Ressource (kanonisch, lädt frisch pro Dashboard).
- sonst (YAML …) -> add_extra_js_url als Fallback.
"""

from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.core import HomeAssistant

from .const import JSMODULES, URL_BASE

_LOGGER = logging.getLogger(__name__)

DIST_DIR = Path(__file__).parent / "dist"

# Sicherstellen, dass .js als JavaScript ausgeliefert wird. Auf manchen Hosts
# mappt Python .js sonst auf text/plain -> der Browser verweigert dann die
# Ausführung als <script type="module">.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")


class FrontendRegistration:
    """Kapselt Auslieferung und Frontend-Registrierung der Karte."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def async_register(self) -> None:
        await self._async_register_static_path()
        # Nur EIN Ladeweg! Klappt die Ressource (Storage-Modus), NICHT zusätzlich
        # add_extra_js_url -> sonst Doppel-Load -> sporadische Ladefehler.
        used_resource = await self._async_register_lovelace_resources()
        if not used_resource:
            self._register_extra_js()

    async def _async_register_static_path(self) -> None:
        """Den ``dist``-Ordner unter ``URL_BASE`` verfügbar machen."""
        try:
            from homeassistant.components.http import StaticPathConfig

            await self.hass.http.async_register_static_paths(
                [StaticPathConfig(URL_BASE, str(DIST_DIR), False)]
            )
        except ImportError:
            self.hass.http.register_static_path(URL_BASE, str(DIST_DIR), False)
        except RuntimeError:
            _LOGGER.debug("Statischer Pfad %s war bereits registriert", URL_BASE)

    def _register_extra_js(self) -> None:
        """Fallback (YAML-Modus): Modul auf App-Shell-Ebene laden."""
        for module in JSMODULES:
            url = f"{URL_BASE}/{module['filename']}?v={module['version']}"
            add_extra_js_url(self.hass, url)
            _LOGGER.info("Karte via add_extra_js_url geladen: %s", url)

    async def _async_register_lovelace_resources(self) -> bool:
        """Modul als Lovelace-Ressource eintragen (nur Storage-Modus).

        Gibt True zurück, wenn die Ressource genutzt wurde (dann KEIN add_extra_js_url).
        """
        try:
            lovelace = self.hass.data.get("lovelace")
            if lovelace is None:
                return False

            resources = getattr(lovelace, "resources", None)
            # Feldname ist in aktuellem HA "resource_mode" (früher/YAML-Dict: "mode").
            mode = getattr(lovelace, "resource_mode", None) or getattr(lovelace, "mode", None)
            if resources is None and isinstance(lovelace, dict):
                resources = lovelace.get("resources")
                mode = lovelace.get("mode")
            if resources is None:
                _LOGGER.warning("Lovelace-Ressourcen-Collection nicht verfügbar")
                return False

            _LOGGER.debug("Lovelace erkannt: mode=%s, resources=%s", mode, type(resources).__name__)

            if mode != "storage":
                _LOGGER.info(
                    "Lovelace-Modus '%s' (kein Storage) – nutze add_extra_js_url.", mode
                )
                return False

            # Sicherstellen, dass die Ressourcen-Collection geladen ist (verhindert
            # zudem versehentliches Löschen bestehender Ressourcen, core#165767).
            if hasattr(resources, "async_get_info"):
                await resources.async_get_info()
            elif getattr(resources, "loaded", True) is False:
                await resources.async_load()
                resources.loaded = True

            for module in JSMODULES:
                base = f"{URL_BASE}/{module['filename']}"
                versioned = f"{base}?v={module['version']}"
                existing = next(
                    (i for i in resources.async_items() if str(i.get("url", "")).split("?")[0] == base),
                    None,
                )
                if existing is None:
                    await resources.async_create_item({"res_type": "module", "url": versioned})
                    _LOGGER.info("Lovelace-Ressource angelegt: %s", versioned)
                elif existing.get("url") != versioned:
                    await resources.async_update_item(
                        existing["id"], {"res_type": "module", "url": versioned}
                    )
                    _LOGGER.info("Lovelace-Ressource aktualisiert: %s", versioned)
            return True
        except Exception as err:  # noqa: BLE001 - Setup darf hieran niemals scheitern
            _LOGGER.warning(
                "Lovelace-Ressource-Registrierung fehlgeschlagen (Fallback add_extra_js_url): %s",
                err,
            )
            return False
