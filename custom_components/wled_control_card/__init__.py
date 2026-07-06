"""WLED Control Card - Integration, die eine Lovelace-Karte bereitstellt.

Diese Integration hat kein Geräte-Backend. Ihr einziger Zweck ist es, die
mitgelieferte Custom-Card (dist/wled-control-card.js) auszuliefern und
automatisch als Dashboard-Ressource zu registrieren.
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, HomeAssistant

from .const import DOMAIN
from .frontend import FrontendRegistration


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Einrichtung über einen Config-Entry (UI-Weg)."""
    data = hass.data.setdefault(DOMAIN, {})

    async def _register(_event=None) -> None:
        if data.get("frontend_registered"):
            return
        await FrontendRegistration(hass).async_register()
        data["frontend_registered"] = True

    # Erst registrieren, wenn Lovelace vollständig geladen ist:
    # - Beim HA-Start bis EVENT_HOMEASSISTANT_STARTED warten (sonst ist
    #   hass.data["lovelace"] noch None und die Ressource wird übersprungen).
    # - Wird die Integration zur Laufzeit hinzugefügt, läuft HA bereits ->
    #   sofort registrieren.
    if hass.state is CoreState.running:
        await _register()
    else:
        entry.async_on_unload(
            hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _register)
        )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Entladen.

    Die Lovelace-Ressource bleibt bewusst registriert, damit bestehende
    Dashboards beim reinen Neu-Laden des Entries nicht brechen.
    """
    return True
