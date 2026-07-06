"""Config-Flow: Hinzufuegen ueber die HA-Oberflaeche (Einzelinstanz)."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow
from homeassistant.data_entry_flow import FlowResult

from .const import DOMAIN


class WledControlCardConfigFlow(ConfigFlow, domain=DOMAIN):
    """Einfache Einzelinstanz - es sind keine Optionen noetig."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Vom Nutzer ausgeloester Schritt."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title="WLED Control Card", data={})

        return self.async_show_form(step_id="user")
