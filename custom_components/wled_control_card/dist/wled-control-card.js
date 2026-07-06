/*
 * WLED Control Card
 * Home-Assistant-Lovelace-Karte zur Steuerung eines WLED-Geraets.
 *
 * Buildfreie Custom-Card (HTMLElement) ohne externe Abhaengigkeiten. Wird von der
 * Begleit-Integration als Dashboard-Ressource ausgeliefert.
 *
 * Lizenz: MIT
 */

const CARD_VERSION = "1.2.6";

// Default-Favoritenfarben (RGB).
const DEFAULT_FAVORITES = [
  [243, 154, 46],
  [240, 192, 138],
  [246, 231, 214],
  [255, 255, 255],
  [110, 160, 236],
  [185, 140, 240],
  [240, 138, 208],
  [226, 105, 74],
];

/* ------------------------------ Hilfsfunktionen --------------------------- */

function fireEvent(node, type, detail = {}, options = {}) {
  const event = new Event(type, {
    bubbles: options.bubbles ?? true,
    cancelable: Boolean(options.cancelable),
    composed: options.composed ?? true,
  });
  event.detail = detail;
  node.dispatchEvent(event);
  return event;
}

function debounce(fn, wait) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

// Mini-Hyperscript zum kompakten Erzeugen von Elementen.
function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === "class") el.className = value;
    else if (key === "style") el.setAttribute("style", value);
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("@")) el.addEventListener(key.slice(1), value);
    else el.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

const clamp255 = (v) => Math.max(0, Math.min(255, v | 0));
const toHex = (rgb) => "#" + rgb.map((v) => clamp255(v).toString(16).padStart(2, "0")).join("");
const hexToRgb = (hex) => {
  const n = parseInt(String(hex).replace("#", ""), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// HSV (h:0-360, s:0-1, v:0-1) -> RGB (0-255)
function hsv2rgb(h, s, v) {
  h = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; }
  else if (h < 2) { r = x; g = c; }
  else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; }
  else if (h < 5) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// RGB (0-255) -> HSV (h:0-360, s:0-1, v:0-1)
function rgb2hsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

// Stellt sicher, dass benoetigte native HA-Elemente (ha-control-slider, ha-form ...)
// geladen sind: erzeugt via loadCardHelpers() kurz Standard-Karten, deren Import
// diese Elemente mitzieht.
async function loadHaComponents() {
  if (loadHaComponents._done) return;
  loadHaComponents._done = true;
  try {
    if (!window.loadCardHelpers) return;
    const helpers = await window.loadCardHelpers();
    if (!helpers) return;
    // Tile-Card zieht u.a. ha-control-slider mit.
    try {
      helpers.createCardElement({ type: "tile", entity: "sun.sun" });
    } catch (_e) {}
    // Editor der Entities-Card zieht ha-form / ha-select / ha-selector mit.
    try {
      const el = helpers.createCardElement({ type: "entities", entities: [] });
      if (el && el.constructor && el.constructor.getConfigElement) {
        await el.constructor.getConfigElement();
      }
    } catch (_e) {}
  } catch (_e) {
    /* Funktioniert dank Fallbacks trotzdem. */
  }
}

// Globale Styles fuer das Farbwaehler-Popup (liegt im document.body).
function injectPickerStyles() {
  if (document.getElementById("wled-picker-styles")) return;
  const s = document.createElement("style");
  s.id = "wled-picker-styles";
  s.textContent = `
    .wled-picker-overlay{position:fixed;inset:0;z-index:9999;display:flex;
      align-items:center;justify-content:center;background:rgba(0,0,0,0.45);}
    .wled-picker-panel{background:var(--card-background-color,var(--ha-card-background,#fff));
      color:var(--primary-text-color,#000);border-radius:var(--ha-card-border-radius,12px);
      padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:90vw;
      display:flex;flex-direction:column;align-items:center;gap:16px;}
    .wled-picker-title{font-size:1.1rem;font-weight:500;}
    .wled-cct-wrap{width:260px;max-width:78vw;display:flex;flex-direction:column;gap:6px;}
    .wled-cct-slider{--control-slider-thickness:40px;display:block;}
    .wled-cct-scale{display:flex;justify-content:space-between;font-size:0.75rem;
      color:var(--secondary-text-color);}
    .wheel-wrap{position:relative;border-radius:50%;touch-action:none;cursor:crosshair;}
    .wheel{position:absolute;inset:0;border-radius:50%;
      background:radial-gradient(circle closest-side,#fff,rgba(255,255,255,0) 100%),
      conic-gradient(from 0deg,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),
      hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%));}
    .wheel-dim{position:absolute;inset:0;border-radius:50%;background:#000;opacity:0;pointer-events:none;}
    .wheel-handle{position:absolute;width:22px;height:22px;border-radius:50%;border:3px solid #fff;
      box-shadow:0 0 4px rgba(0,0,0,0.6);transform:translate(-50%,-50%);pointer-events:none;}
    .picker-slider-row{width:260px;max-width:82vw;}
    .picker-slider-label{display:flex;align-items:center;gap:6px;font-size:0.8rem;
      color:var(--secondary-text-color);margin:0 0 4px 2px;}
    .picker-slider-label ha-icon{--mdc-icon-size:18px;}
    .picker-slider-row ha-control-slider{--control-slider-thickness:36px;display:block;}
    .wled-picker-close{background:var(--primary-color);color:var(--text-primary-color,#fff);
      border:none;border-radius:20px;padding:8px 22px;cursor:pointer;font-size:0.9rem;}
  `;
  document.head.appendChild(s);
}

/* ---------------------------- Entitaets-Erkennung ------------------------- */

function entityName(hass, entry) {
  const st = hass.states[entry.entity_id];
  return (
    (st && st.attributes && st.attributes.friendly_name) ||
    entry.name ||
    entry.original_name ||
    entry.entity_id
  ).toString();
}

function pickByTranslationKey(list, keys) {
  return list.find((e) => e.translation_key && keys.includes(e.translation_key));
}

function pickByName(list, hass, needles) {
  return list.find((e) => {
    const name = entityName(hass, e).toLowerCase();
    return needles.some((n) => name.includes(n));
  });
}

// Leitet aus dem gewaehlten Geraet alle Rollen ab. Prioritaet:
// manuelles Override -> translation_key -> Namensheuristik.
function discoverEntities(hass, config) {
  const roles = {
    light: null,
    preset: null,
    palette: null,
    playlist: null,
    speed: null,
    intensity: null,
    extras: [],
  };
  if (!hass || !config || !config.device || !hass.entities) return roles;

  const deviceEntities = Object.values(hass.entities).filter(
    (e) => e.device_id === config.device
  );
  const inDomain = (domain) =>
    deviceEntities.filter((e) => e.entity_id.startsWith(domain + "."));
  const idOf = (entry) => (entry ? entry.entity_id : null);

  const lights = inDomain("light");
  const selects = inDomain("select");
  const numbers = inDomain("number");

  roles.light = config.light_entity || idOf(lights[0]);

  roles.preset =
    config.preset_entity ||
    idOf(pickByTranslationKey(selects, ["preset"])) ||
    idOf(pickByName(selects, hass, ["voreinstellung", "preset"]));

  roles.palette =
    config.palette_entity ||
    idOf(pickByTranslationKey(selects, ["color_palette"])) ||
    idOf(pickByName(selects, hass, ["farbpalette", "palette", "color palette"]));

  roles.playlist =
    config.playlist_entity ||
    idOf(pickByTranslationKey(selects, ["playlist"])) ||
    idOf(pickByName(selects, hass, ["wiedergabeliste", "playlist"]));

  roles.speed =
    config.speed_entity ||
    idOf(pickByTranslationKey(numbers, ["speed"])) ||
    idOf(pickByName(numbers, hass, ["geschwindigkeit", "speed"]));

  roles.intensity =
    config.intensity_entity ||
    idOf(pickByTranslationKey(numbers, ["intensity"])) ||
    idOf(pickByName(numbers, hass, ["intensitat", "intensität", "intensity"]));

  roles.extras = Array.isArray(config.extra_controls)
    ? config.extra_controls.filter((id) => typeof id === "string")
    : [];

  return roles;
}

/* --------------------------------- Styles --------------------------------- */

const STYLES = `
  :host{ display:block; }
  ha-card{ padding:12px 12px 14px; }
  .hidden{ display:none !important; }
  .dimmed{ opacity:0.5; pointer-events:none; }

  .header{ display:flex; align-items:center; gap:12px; }
  .badge{ width:40px; height:40px; border-radius:50%; flex:0 0 auto;
    display:flex; align-items:center; justify-content:center;
    background:var(--secondary-background-color); transition:background .2s; }
  .badge ha-icon{ --mdc-icon-size:24px; }
  .titles{ flex:1 1 auto; min-width:0; }
  .name{ font-size:1.05rem; font-weight:500; color:var(--primary-text-color);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .status{ font-size:0.8rem; color:var(--secondary-text-color);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  .section{ margin-top:12px; }
  .brightness ha-control-slider{ --control-slider-thickness:40px; display:block; }

  .favorites{ display:flex; flex-wrap:wrap; gap:10px; }
  .fav{ width:30px; height:30px; border-radius:50%; cursor:pointer; padding:0;
    border:2px solid var(--divider-color);
    box-shadow:inset 0 0 0 1px rgba(0,0,0,0.06); }

  .pickers{ display:flex; gap:12px; }
  .picker-btn{ flex:1 1 0; height:44px; border-radius:22px; border:none; cursor:pointer;
    display:flex; align-items:center; justify-content:center; gap:8px;
    background:var(--secondary-background-color); color:var(--primary-text-color);
    font-size:0.9rem; }
  .picker-btn ha-icon{ --mdc-icon-size:20px; }

  .divider{ height:1px; background:var(--divider-color); margin:14px 0; border:0; }

  .dropdowns{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; align-items:end; }
  .dd-field{ display:flex; flex-direction:column; gap:3px; min-width:0; }
  .dd-label{ font-size:0.7rem; color:var(--secondary-text-color); padding-left:4px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .dd-wrap{ position:relative; }
  .dd-wrap::after{ content:"▾"; position:absolute; right:8px; top:50%;
    transform:translateY(-50%); pointer-events:none; color:var(--secondary-text-color);
    font-size:0.8rem; }
  .dd-select{ width:100%; box-sizing:border-box; -webkit-appearance:none; appearance:none;
    background:var(--secondary-background-color); color:var(--primary-text-color);
    border:none; border-bottom:1px solid var(--divider-color); border-radius:6px 6px 0 0;
    padding:9px 26px 9px 10px; font-size:0.9rem; font-family:inherit; cursor:pointer;
    text-overflow:ellipsis; white-space:nowrap; overflow:hidden; }
  .dd-select:focus{ outline:none; border-bottom:2px solid var(--primary-color); padding-bottom:8px; }
  .dd-select:disabled{ opacity:0.6; cursor:default; }

  .row-slider{ display:flex; align-items:center; gap:10px; margin-top:10px; }
  .row-slider ha-icon{ color:var(--secondary-text-color); --mdc-icon-size:20px; flex:0 0 auto; }
  .row-slider .label{ font-size:0.85rem; color:var(--secondary-text-color); width:104px;
    flex:0 0 auto; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .row-slider ha-control-slider{ flex:1 1 auto; --control-slider-thickness:22px; }
  .row-slider .value{ font-size:0.85rem; color:var(--primary-text-color); width:40px;
    text-align:right; flex:0 0 auto; }

  .extras{ display:flex; flex-wrap:wrap; gap:8px; }
  .chip{ display:inline-flex; align-items:center; gap:8px; padding:6px 12px;
    border-radius:18px; border:none; cursor:pointer; font-size:0.85rem; max-width:100%;
    background:var(--secondary-background-color); color:var(--primary-text-color); }
  .chip ha-icon{ --mdc-icon-size:18px;
    color:var(--state-icon-color, var(--paper-item-icon-color, var(--secondary-text-color))); }
  .chip .chip-name{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .chip ha-switch{ pointer-events:none; margin-left:-2px; }
  .chip.active{ background:rgba(var(--rgb-primary-color,33,145,255),0.16); }
  .chip[disabled]{ opacity:0.5; cursor:default; }

  .preset-favorites{ display:flex; flex-wrap:wrap; gap:8px; }
  .preset-fav{ padding:6px 14px; border-radius:16px; border:none; cursor:pointer;
    background:var(--secondary-background-color); color:var(--primary-text-color);
    font-size:0.85rem; max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .preset-fav.active{ background:var(--primary-color); color:var(--text-primary-color,#fff); }

  .effect-toggle{ display:flex; align-items:center; justify-content:flex-start; gap:6px;
    cursor:pointer; padding:4px 2px; color:var(--secondary-text-color); user-select:none;
    font-size:0.9rem; }
  .effect-toggle ha-icon{ transition:transform .2s ease; --mdc-icon-size:22px; flex:0 0 auto; }
  .effect-toggle.expanded ha-icon{ transform:rotate(180deg); }

  .hint{ padding:20px 12px; color:var(--secondary-text-color); text-align:center;
    font-size:0.95rem; }
`;

/* =============================== Die Karte ================================ */

class WledControlCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._el = {};
    this._built = false;
    this._dragging = new Set();
    this._optimistic = {};
    this._roles = { extras: [] };
    this._dropdownsExpanded = false;
    this._debouncers = {
      bri: debounce((v) => this._sendSlider("bri", v), 200),
      speed: debounce((v) => this._sendSlider("speed", v), 200),
      intensity: debounce((v) => this._sendSlider("intensity", v), 200),
    };
    injectPickerStyles();
    loadHaComponents();
  }

  /* --------------------------- Lebenszyklus ------------------------------ */

  setConfig(config) {
    if (!config) throw new Error("Ungueltige Konfiguration.");
    this._config = {
      type: config.type,
      device: config.device || "",
      name: config.name || "",
      show_brightness: config.show_brightness ?? true,
      show_favorites: config.show_favorites ?? true,
      show_favorite_presets: config.show_favorite_presets ?? true,
      show_color_pickers: config.show_color_pickers ?? true,
      show_presets: config.show_presets ?? true,
      show_palettes: config.show_palettes ?? true,
      show_playlist: config.show_playlist ?? false,
      show_effects: config.show_effects ?? true,
      show_speed: config.show_speed ?? true,
      show_intensity: config.show_intensity ?? true,
      collapsible_dropdowns: config.collapsible_dropdowns ?? false,
      dynamic_brightness_color: config.dynamic_brightness_color ?? true,
      favorite_colors:
        Array.isArray(config.favorite_colors) && config.favorite_colors.length
          ? config.favorite_colors
          : DEFAULT_FAVORITES,
      favorite_presets: Array.isArray(config.favorite_presets) ? config.favorite_presets.slice() : [],
      extra_controls: Array.isArray(config.extra_controls) ? config.extra_controls.slice() : [],
      light_entity: config.light_entity || null,
      preset_entity: config.preset_entity || null,
      palette_entity: config.palette_entity || null,
      playlist_entity: config.playlist_entity || null,
      speed_entity: config.speed_entity || null,
      intensity_entity: config.intensity_entity || null,
    };
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }
  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 7;
  }
  getGridOptions() {
    // Auto-Hoehe im Sections-View (Karte passt sich ihrem Inhalt an).
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  disconnectedCallback() {
    this._closePicker();
  }

  static getConfigElement() {
    return document.createElement("wled-control-card-editor");
  }

  static getStubConfig(hass) {
    let device = "";
    if (hass && hass.entities) {
      const wledLight = Object.values(hass.entities).find(
        (e) => e.platform === "wled" && e.entity_id.startsWith("light.")
      );
      if (wledLight) device = wledLight.device_id;
    }
    return {
      device,
      show_brightness: true,
      show_favorites: true,
      show_favorite_presets: true,
      show_color_pickers: true,
      show_presets: true,
      show_palettes: true,
      show_playlist: false,
      show_effects: true,
      show_speed: true,
      show_intensity: true,
      collapsible_dropdowns: false,
      dynamic_brightness_color: true,
      extra_controls: [],
    };
  }

  /* ------------------------------ Rendering ------------------------------ */

  _render() {
    if (!this._config || !this._hass) return;
    this._roles = discoverEntities(this._hass, this._config);
    if (!this._built) {
      this._build();
      this._built = true;
    }
    this._update();
  }

  get _lightState() {
    return this._roles.light && this._hass ? this._hass.states[this._roles.light] : null;
  }

  _build() {
    const root = this.shadowRoot;
    root.innerHTML = "";
    root.appendChild(h("style", { text: STYLES }));

    const card = h("ha-card");
    this._el.card = card;

    // Hinweistext (bei fehlendem Geraet/Licht)
    this._el.hint = h("div", { class: "hint hidden" });
    card.appendChild(this._el.hint);

    const content = h("div", { class: "content" });
    this._el.content = content;
    card.appendChild(content);

    /* --- Kopfzeile --- */
    const badgeIcon = h("ha-icon", { icon: "mdi:led-strip-variant" });
    const badge = h("div", { class: "badge" }, [badgeIcon]);
    const name = h("div", { class: "name" });
    const status = h("div", { class: "status" });
    const power = h("ha-switch", { "@change": (e) => this._onPower(e) });
    Object.assign(this._el, { badge, badgeIcon, name, status, power });
    content.appendChild(
      h("div", { class: "header" }, [badge, h("div", { class: "titles" }, [name, status]), power])
    );

    /* --- Helligkeit --- */
    const briSlider = h("ha-control-slider");
    briSlider.min = 1; // nie auf 0 (das waere Aus -> das macht der Schalter)
    briSlider.max = 100;
    briSlider.step = 1;
    briSlider.addEventListener("slider-moved", (e) => this._onSlider("bri", e));
    briSlider.addEventListener("value-changed", (e) => this._onSliderChanged("bri", e));
    this._el.briSlider = briSlider;
    this._el.briSection = h("div", { class: "section brightness" }, [briSlider]);
    content.appendChild(this._el.briSection);

    /* --- Favoriten (Reihe 1) --- */
    this._el.favRow = h("div", { class: "section favorites" });
    content.appendChild(this._el.favRow);

    /* --- Favoriten-Voreinstellungen (unter den Farben) --- */
    this._el.presetFavRow = h("div", { class: "section preset-favorites" });
    content.appendChild(this._el.presetFavRow);

    /* --- Farbwaehler-Buttons (Reihe 2) --- */
    const rgbBtn = h("button", { class: "picker-btn", "@click": () => this._openColorPicker("rgb") }, [
      h("ha-icon", { icon: "mdi:palette" }),
      h("span", { text: "RGB" }),
    ]);
    const cctBtn = h("button", { class: "picker-btn", "@click": () => this._openColorPicker("cct") }, [
      h("ha-icon", { icon: "mdi:thermometer" }),
      h("span", { text: "Weiss" }),
    ]);
    Object.assign(this._el, { rgbBtn, cctBtn });
    this._el.pickers = h("div", { class: "section pickers" }, [rgbBtn, cctBtn]);
    content.appendChild(this._el.pickers);

    /* --- Trennlinie 1 --- */
    this._el.divider1 = h("hr", { class: "divider" });
    content.appendChild(this._el.divider1);

    /* --- Umschalter "Effekteinstellungen" (optional aufklappbar) --- */
    this._el.effectToggle = h(
      "div",
      { class: "effect-toggle hidden", "@click": () => this._toggleDropdowns() },
      [
        h("ha-icon", { icon: "mdi:chevron-down" }),
        h("span", { class: "effect-toggle-label", text: "Effekteinstellungen" }),
      ]
    );
    content.appendChild(this._el.effectToggle);

    /* --- Dropdowns: native <select> fuer maximale Zuverlaessigkeit --- */
    const mkSelect = (role, label) => {
      const select = h("select", { class: "dd-select", "@change": (e) => this._onSelect(role, e) });
      const field = h("div", { class: "dd-field" }, [
        h("div", { class: "dd-label", text: label }),
        h("div", { class: "dd-wrap" }, [select]),
      ]);
      return { field, select };
    };
    const preset = mkSelect("preset", "Voreinstellung");
    const palette = mkSelect("palette", "Farbpalette");
    const effect = mkSelect("effect", "Effekt");
    const playlist = mkSelect("playlist", "Wiedergabeliste");
    Object.assign(this._el, {
      presetField: preset.field,
      presetSelect: preset.select,
      paletteField: palette.field,
      paletteSelect: palette.select,
      effectField: effect.field,
      effectSelect: effect.select,
      playlistField: playlist.field,
      playlistSelect: playlist.select,
    });
    this._el.dropdowns = h("div", { class: "section dropdowns" }, [
      preset.field,
      palette.field,
      effect.field,
      playlist.field,
    ]);

    /* --- Trennlinie 2 (zwischen Dropdowns und Slidern, in der Gruppe) --- */
    this._el.divider2 = h("hr", { class: "divider" });

    /* --- Effekt-Slider: Geschwindigkeit + Intensitaet --- */
    const mkRow = (key, icon, label) => {
      const slider = h("ha-control-slider");
      slider.addEventListener("slider-moved", (e) => this._onSlider(key, e));
      slider.addEventListener("value-changed", (e) => this._onSliderChanged(key, e));
      const value = h("div", { class: "value" });
      const row = h("div", { class: "row-slider" }, [
        h("ha-icon", { icon }),
        h("div", { class: "label", text: label }),
        slider,
        value,
      ]);
      return { row, slider, value };
    };
    const speed = mkRow("speed", "mdi:speedometer", "Geschwindigkeit");
    const intensity = mkRow("intensity", "mdi:contrast-circle", "Intensitaet");
    Object.assign(this._el, {
      speedSlider: speed.slider,
      speedValue: speed.value,
      speedRow: speed.row,
      intensitySlider: intensity.slider,
      intensityValue: intensity.value,
      intensityRow: intensity.row,
    });
    this._el.effectSliders = h("div", { class: "section effect-sliders" }, [speed.row, intensity.row]);

    /* --- Aufklappbare Effekt-Gruppe: Dropdowns + Slider --- */
    this._el.effectGroup = h("div", { class: "effect-group" }, [
      this._el.dropdowns,
      this._el.divider2,
      this._el.effectSliders,
    ]);
    content.appendChild(this._el.effectGroup);

    /* --- Zusatz-Steuerelemente --- */
    this._el.extras = h("div", { class: "section extras" });
    content.appendChild(this._el.extras);

    root.appendChild(card);
  }

  _update() {
    const hass = this._hass;
    const cfg = this._config;
    if (!hass || !cfg) return;

    if (!cfg.device) return this._showHint("Bitte WLED-Geraet im Editor waehlen.");
    const light = this._lightState;
    if (!light) return this._showHint("Keine Light-Entitaet fuer dieses Geraet gefunden.");
    this._showHint(null);

    const attrs = light.attributes || {};
    const isOn = light.state === "on";
    const unavailable = light.state === "unavailable" || light.state === "unknown";
    const rgb = attrs.rgb_color;
    const colorCss = isOn && rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : "var(--primary-color)";

    /* Kopfzeile */
    this._el.name.textContent =
      cfg.name || this._deviceName() || attrs.friendly_name || this._roles.light;
    this._el.status.textContent = this._statusText(light, isOn, attrs);
    this._el.badge.style.background =
      isOn && rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.20)` : "var(--secondary-background-color)";
    this._el.badgeIcon.style.color = isOn ? colorCss : "var(--state-icon-color, var(--secondary-text-color))";
    this._el.power.checked = isOn;
    this._el.power.disabled = unavailable;

    /* Helligkeit */
    const showBri = cfg.show_brightness && this._supportsBrightness(attrs);
    this._el.briSection.classList.toggle("hidden", !showBri);
    if (showBri) {
      let pct = attrs.brightness != null ? Math.round((attrs.brightness / 255) * 100) : 0;
      if (this._optimistic.bri != null) {
        if (Math.abs(this._optimistic.bri - pct) <= 1) delete this._optimistic.bri;
        else pct = Math.round(this._optimistic.bri);
      }
      if (!this._dragging.has("bri")) this._el.briSlider.value = Math.max(1, pct);
      this._el.briSlider.disabled = !isOn || unavailable;
      if (cfg.dynamic_brightness_color) this._el.briSlider.style.setProperty("--control-slider-color", colorCss);
      else this._el.briSlider.style.removeProperty("--control-slider-color");
      this._el.briSection.classList.toggle("dimmed", !isOn);
    }

    /* Favoriten */
    this._el.favRow.classList.toggle("hidden", !cfg.show_favorites);
    if (cfg.show_favorites) this._renderFavorites(cfg.favorite_colors);
    this._el.favRow.classList.toggle("dimmed", !isOn || unavailable);

    /* Favoriten-Voreinstellungen */
    this._renderFavoritePresets(cfg.show_favorite_presets ? cfg.favorite_presets : [], unavailable);

    /* Farbwaehler */
    const canRgb = this._supportsRgb(attrs);
    const canCct = this._supportsCct(attrs);
    const showPickers = cfg.show_color_pickers && (canRgb || canCct);
    this._el.pickers.classList.toggle("hidden", !showPickers);
    if (showPickers) {
      this._el.rgbBtn.classList.toggle("hidden", !canRgb);
      this._el.cctBtn.classList.toggle("hidden", !canCct);
      this._el.pickers.classList.toggle("dimmed", !isOn || unavailable);
    }

    /* Dropdowns */
    this._updateSelect(this._el.presetField, this._el.presetSelect, cfg.show_presets, this._roles.preset);
    this._updateSelect(this._el.paletteField, this._el.paletteSelect, cfg.show_palettes, this._roles.palette);
    this._updateSelect(this._el.playlistField, this._el.playlistSelect, cfg.show_playlist, this._roles.playlist);
    this._updateEffectSelect(light, attrs, cfg.show_effects);
    const dropCols = [
      this._el.presetField,
      this._el.paletteField,
      this._el.effectField,
      this._el.playlistField,
    ].filter((f) => !f.classList.contains("hidden"));
    const anyDrop = dropCols.length > 0;
    this._el.dropdowns.classList.toggle("hidden", !anyDrop);
    if (anyDrop) this._el.dropdowns.style.gridTemplateColumns = `repeat(${dropCols.length},1fr)`;

    /* Effekt-Slider */
    this._updateNumber("speed", cfg.show_speed, this._roles.speed, isOn, unavailable);
    this._updateNumber("intensity", cfg.show_intensity, this._roles.intensity, isOn, unavailable);
    const anyEff =
      !this._el.speedRow.classList.contains("hidden") ||
      !this._el.intensityRow.classList.contains("hidden");
    this._el.effectSliders.classList.toggle("hidden", !anyEff);
    this._el.divider2.classList.toggle("hidden", !(anyDrop && anyEff));

    /* Aufklappbare Effekt-Gruppe (Dropdowns + Slider unter "Effekteinstellungen") */
    const collapsible = cfg.collapsible_dropdowns;
    const hasEffectContent = anyDrop || anyEff;
    this._el.effectToggle.classList.toggle("hidden", !(collapsible && hasEffectContent));
    this._el.effectToggle.classList.toggle("expanded", this._dropdownsExpanded);
    const groupVisible = hasEffectContent && (!collapsible || this._dropdownsExpanded);
    this._el.effectGroup.classList.toggle("hidden", !groupVisible);

    /* Zusatz-Steuerelemente */
    this._renderExtras(this._roles.extras);

    /* Trennlinie 1 (vor Toggle/Effekt-Gruppe) */
    const showPresetFav = !this._el.presetFavRow.classList.contains("hidden");
    const topContent = showBri || cfg.show_favorites || showPresetFav || showPickers;
    this._el.divider1.classList.toggle("hidden", !(topContent && hasEffectContent));
  }

  /* --------------------------- Update-Helfer ----------------------------- */

  _showHint(msg) {
    if (msg) {
      this._el.hint.textContent = msg;
      this._el.hint.classList.remove("hidden");
      this._el.content.classList.add("hidden");
    } else {
      this._el.hint.classList.add("hidden");
      this._el.content.classList.remove("hidden");
    }
  }

  _deviceName() {
    const dev = this._hass.devices && this._hass.devices[this._config.device];
    return dev ? dev.name_by_user || dev.name : null;
  }

  _areaName() {
    const hass = this._hass;
    const entry = hass.entities && hass.entities[this._roles.light];
    let areaId = entry && entry.area_id;
    if (!areaId) {
      const dev = hass.devices && hass.devices[this._config.device];
      areaId = dev && dev.area_id;
    }
    return areaId && hass.areas && hass.areas[areaId] ? hass.areas[areaId].name : null;
  }

  _statusText(light, isOn, attrs) {
    const parts = [];
    const area = this._areaName();
    if (area) parts.push(area);
    if (light.state === "unavailable") parts.push("Nicht verfuegbar");
    else parts.push(isOn ? "Ein" : "Aus");
    if (isOn && attrs.brightness != null) parts.push(Math.round((attrs.brightness / 255) * 100) + " %");
    return parts.join(" · ");
  }

  _modes(attrs) {
    return attrs.supported_color_modes || [];
  }
  _supportsBrightness(attrs) {
    return this._modes(attrs).some((m) =>
      ["brightness", "color_temp", "hs", "rgb", "rgbw", "rgbww", "xy", "white"].includes(m)
    );
  }
  _supportsRgb(attrs) {
    return this._modes(attrs).some((m) => ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m));
  }
  _supportsCct(attrs) {
    return this._modes(attrs).includes("color_temp");
  }

  _renderFavorites(colors) {
    const row = this._el.favRow;
    const list = colors && colors.length ? colors : DEFAULT_FAVORITES;
    const sig = JSON.stringify(list);
    if (row._sig === sig) return;
    row._sig = sig;
    row.innerHTML = "";
    list.forEach((c) => {
      const rgb = Array.isArray(c) ? c : hexToRgb(c);
      const btn = h("button", {
        class: "fav",
        "aria-label": `Farbe ${rgb.join(", ")}`,
        "@click": () => this._callLight({ rgb_color: rgb }),
      });
      btn.style.backgroundColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      row.appendChild(btn);
    });
  }

  _toggleDropdowns() {
    this._dropdownsExpanded = !this._dropdownsExpanded;
    this._update();
  }

  _renderFavoritePresets(presets, unavailable) {
    const row = this._el.presetFavRow;
    const entityId = this._roles.preset;
    const st = entityId ? this._hass.states[entityId] : null;
    const options = st && Array.isArray(st.attributes.options) ? st.attributes.options : [];
    const list = (Array.isArray(presets) ? presets : []).filter((p) => options.includes(p));
    const visible = list.length > 0 && st;
    row.classList.toggle("hidden", !visible);
    if (!visible) return;
    const sig = JSON.stringify(list);
    if (row._sig !== sig) {
      row._sig = sig;
      row.innerHTML = "";
      row._btns = {};
      list.forEach((preset) => {
        const btn = h("button", {
          class: "preset-fav",
          text: preset,
          "@click": () => this._call("select", "select_option", { entity_id: entityId, option: preset }),
        });
        row.appendChild(btn);
        row._btns[preset] = btn;
      });
    }
    const current = st.state;
    Object.entries(row._btns || {}).forEach(([preset, btn]) => btn.classList.toggle("active", preset === current));
    row.classList.toggle("dimmed", unavailable);
  }

  _setSelectOptions(select, options) {
    const sig = JSON.stringify(options);
    if (select._optSig === sig) return;
    select._optSig = sig;
    select.innerHTML = "";
    options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = String(opt);
      o.textContent = String(opt);
      select.appendChild(o);
    });
  }

  _applySelectValue(select, value) {
    if (value == null) return;
    // Nicht eingreifen, waehrend die Auswahl fokussiert ist.
    if (this.shadowRoot.activeElement === select) return;
    if (select.value !== value) select.value = value;
  }

  _updateSelect(field, select, show, entityId) {
    const st = entityId ? this._hass.states[entityId] : null;
    const visible = show && st && Array.isArray(st.attributes.options);
    field.classList.toggle("hidden", !visible);
    if (!visible) return;
    select._role_entity = entityId;
    this._setSelectOptions(select, st.attributes.options);
    this._applySelectValue(select, st.state);
    select.disabled = st.state === "unavailable";
  }

  _updateEffectSelect(light, attrs, show) {
    const field = this._el.effectField;
    const select = this._el.effectSelect;
    const list = attrs.effect_list;
    const visible = show && Array.isArray(list) && list.length > 0;
    field.classList.toggle("hidden", !visible);
    if (!visible) return;
    this._setSelectOptions(select, list);
    this._applySelectValue(select, attrs.effect);
    select.disabled = light.state === "unavailable";
  }

  _updateNumber(key, show, entityId, isOn, unavailable) {
    const slider = this._el[key + "Slider"];
    const valueEl = this._el[key + "Value"];
    const row = this._el[key + "Row"];
    const st = entityId ? this._hass.states[entityId] : null;
    const visible = show && st;
    row.classList.toggle("hidden", !visible);
    if (!visible) return;
    const min = st.attributes.min != null ? Number(st.attributes.min) : 0;
    const max = st.attributes.max != null ? Number(st.attributes.max) : 255;
    const step = st.attributes.step != null ? Number(st.attributes.step) : 1;
    slider.min = min;
    slider.max = max;
    slider.step = step;
    let val = Number(st.state);
    if (Number.isNaN(val)) val = min;
    if (this._optimistic[key] != null) {
      if (Math.abs(this._optimistic[key] - val) <= step) delete this._optimistic[key];
      else val = this._optimistic[key];
    }
    if (!this._dragging.has(key)) slider.value = val;
    slider.disabled = st.state === "unavailable";
    valueEl.textContent = String(Math.round(val));
    row.classList.toggle("dimmed", !isOn || unavailable);
  }

  _renderExtras(extras) {
    const container = this._el.extras;
    const sig = JSON.stringify(extras);
    if (container._sig !== sig) {
      container._sig = sig;
      container.innerHTML = "";
      container._chips = {};
      extras.forEach((id) => {
        const chip = this._buildChip(id, id.split(".")[0]);
        if (chip) {
          container.appendChild(chip.el);
          container._chips[id] = chip;
        }
      });
    }
    container.classList.toggle("hidden", extras.length === 0);
    Object.entries(container._chips || {}).forEach(([id, chip]) => chip.update(this._hass.states[id]));
  }

  _shortName(st, id) {
    let name = (st && st.attributes.friendly_name) || id;
    const dev = this._deviceName();
    if (dev && name.startsWith(dev)) name = name.slice(dev.length).replace(/^[\s\-–—·:]+/, "") || name;
    return name;
  }

  _buildChip(id, domain) {
    const nameEl = h("span", { class: "chip-name" });
    const iconEl = h("ha-icon");
    if (domain === "switch") {
      const sw = h("ha-switch");
      const el = h("button", { class: "chip", "@click": () => this._call("switch", "toggle", { entity_id: id }) }, [iconEl, nameEl, sw]);
      return {
        el,
        update: (s) => {
          const on = s && s.state === "on";
          iconEl.icon = (s && s.attributes.icon) || "mdi:toggle-switch-variant";
          nameEl.textContent = this._shortName(s, id);
          sw.checked = !!on;
          el.classList.toggle("active", !!on);
          el.disabled = !s || s.state === "unavailable";
        },
      };
    }
    if (domain === "button") {
      const el = h("button", { class: "chip", "@click": () => this._call("button", "press", { entity_id: id }) }, [iconEl, nameEl]);
      return {
        el,
        update: (s) => {
          iconEl.icon = (s && s.attributes.icon) || "mdi:gesture-tap-button";
          nameEl.textContent = this._shortName(s, id);
          el.disabled = !!(s && s.state === "unavailable");
        },
      };
    }
    // Fallback (select/number-Extra): oeffnet den Mehr-Infos-Dialog.
    const el = h("button", { class: "chip", "@click": () => fireEvent(this, "hass-more-info", { entityId: id }) }, [iconEl, nameEl]);
    return {
      el,
      update: (s) => {
        iconEl.icon = (s && s.attributes.icon) || "mdi:tune-variant";
        nameEl.textContent = this._shortName(s, id) + (s ? `: ${s.state}` : "");
      },
    };
  }

  /* ------------------------------ Aktionen ------------------------------- */

  _call(domain, service, data) {
    if (this._hass) this._hass.callService(domain, service, data);
  }

  _callLight(data) {
    if (this._roles.light) this._call("light", "turn_on", { entity_id: this._roles.light, ...data });
  }

  _onPower(e) {
    e.stopPropagation();
    if (this._roles.light) this._call("light", "toggle", { entity_id: this._roles.light });
  }

  _onSelect(role, e) {
    const select = e.target;
    const value = select.value;
    if (value == null || value === "") return;
    if (role === "effect") return this._callLight({ effect: value });
    if (select._role_entity) this._call("select", "select_option", { entity_id: select._role_entity, option: value });
  }

  _reflectSlider(key, v) {
    if (key === "speed") this._el.speedValue.textContent = String(Math.round(v));
    else if (key === "intensity") this._el.intensityValue.textContent = String(Math.round(v));
  }

  _onSlider(key, e) {
    const v = e.detail && e.detail.value;
    if (v == null) return;
    e.stopPropagation();
    this._dragging.add(key);
    this._optimistic[key] = v;
    this._reflectSlider(key, v);
    this._debouncers[key](v);
  }

  _onSliderChanged(key, e) {
    const v = e.detail && e.detail.value;
    if (v == null) return;
    e.stopPropagation();
    this._optimistic[key] = v;
    this._reflectSlider(key, v);
    this._debouncers[key].cancel();
    this._sendSlider(key, v);
    // Drag-Flag loesen; der optimistische Wert bleibt, bis der State nachzieht.
    setTimeout(() => this._dragging.delete(key), 60);
  }

  _sendSlider(key, v) {
    if (key === "bri") this._callLight({ brightness_pct: Math.round(v) });
    else if (key === "speed" && this._roles.speed)
      this._call("number", "set_value", { entity_id: this._roles.speed, value: v });
    else if (key === "intensity" && this._roles.intensity)
      this._call("number", "set_value", { entity_id: this._roles.intensity, value: v });
  }

  /* -------------------------- Farbwaehler-Popup -------------------------- */

  _openColorPicker(mode) {
    const light = this._roles.light;
    if (!light) return;
    // RGB: eigenes Farbrad. CCT: ha-control-slider; Fallback Mehr-Infos-Dialog,
    // falls das Element nicht geladen ist.
    if (mode === "cct" && !customElements.get("ha-control-slider")) {
      fireEvent(this, "hass-more-info", { entityId: light });
      return;
    }
    this._showPickerPopup(mode);
  }

  _showPickerPopup(mode) {
    this._closePicker();
    const st = this._lightState;
    if (!st) return;
    const attrs = st.attributes;

    const overlay = h("div", { class: "wled-picker-overlay" });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._closePicker();
    });
    const panel = h("div", { class: "wled-picker-panel" });
    panel.appendChild(h("div", { class: "wled-picker-title", text: mode === "rgb" ? "Farbe" : "Farbtemperatur" }));

    if (mode === "rgb") {
      this._buildRgbPicker(panel, attrs);
    } else {
      const minK = attrs.min_color_temp_kelvin || 2000;
      const maxK = attrs.max_color_temp_kelvin || 6535;
      const slider = document.createElement("ha-control-slider");
      slider.classList.add("wled-cct-slider");
      slider.mode = "cursor"; // nur Handle auf dem Verlauf, kein Fuellbalken
      slider.min = minK;
      slider.max = maxK;
      slider.step = 50;
      // color_temp_kelvin ist im rgbw-Modus null; Fallback auf cct_kelvin.
      const curK =
        attrs.color_temp_kelvin != null
          ? attrs.color_temp_kelvin
          : attrs.cct_kelvin != null
          ? attrs.cct_kelvin
          : Math.round((minK + maxK) / 2);
      slider.value = curK;
      slider.style.setProperty("--control-slider-background", "linear-gradient(90deg,#ff8a24,#ffd6a5,#ffffff,#cfe0ff)");
      slider.style.setProperty("--control-slider-background-opacity", "1");
      const send = debounce((k) => this._callLight({ color_temp_kelvin: Math.round(k) }), 150);
      const onCct = (e) => {
        e.stopPropagation();
        if (e.detail && e.detail.value != null) send(e.detail.value);
      };
      slider.addEventListener("slider-moved", onCct);
      slider.addEventListener("value-changed", onCct);
      panel.appendChild(
        h("div", { class: "wled-cct-wrap" }, [
          slider,
          h("div", { class: "wled-cct-scale" }, [h("span", { text: "Warm" }), h("span", { text: "Kalt" })]),
        ])
      );
    }

    panel.appendChild(h("button", { class: "wled-picker-close", text: "Schliessen", "@click": () => this._closePicker() }));
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._pickerOverlay = overlay;
    this._escHandler = (e) => {
      if (e.key === "Escape") this._closePicker();
    };
    window.addEventListener("keydown", this._escHandler);
  }

  // Eigenes HS-Farbrad + Farbhelligkeit/Weiss-Slider (Service-Calls wie das native
  // light-color-rgb-picker).
  _buildRgbPicker(panel, attrs) {
    const modes = attrs.supported_color_modes || [];
    const mode = modes.includes("rgbww")
      ? "rgbww"
      : modes.includes("rgbw")
      ? "rgbw"
      : modes.includes("rgb")
      ? "rgb"
      : "hs";

    // Farbton/Saettigung aus hs_color (immer vorhanden, unabhaengig vom color_mode).
    let hue = 0, sat = 0;
    if (Array.isArray(attrs.hs_color)) {
      hue = attrs.hs_color[0] || 0;
      sat = (attrs.hs_color[1] || 0) / 100;
    } else if (Array.isArray(attrs.rgb_color)) {
      const hsv = rgb2hsv(attrs.rgb_color[0], attrs.rgb_color[1], attrs.rgb_color[2]);
      hue = hsv[0];
      sat = hsv[1];
    }
    // Farbhelligkeit (max des Farbanteils) und Weiss-Kanaele aus dem Farb-Attribut.
    let w = 0, cw = 0, ww = 0, cb = 1;
    if (mode === "rgbww" && Array.isArray(attrs.rgbww_color)) {
      const c = attrs.rgbww_color;
      cb = Math.max(c[0], c[1], c[2]) / 255;
      cw = c[3] || 0;
      ww = c[4] || 0;
    } else if (mode === "rgbw" && Array.isArray(attrs.rgbw_color)) {
      const c = attrs.rgbw_color;
      cb = Math.max(c[0], c[1], c[2]) / 255;
      w = c[3] || 0;
    } else if (Array.isArray(attrs.rgb_color)) {
      const c = attrs.rgb_color;
      cb = Math.max(c[0], c[1], c[2]) / 255;
    }
    const p = (this._pick = {
      mode,
      h: hue,
      s: sat,
      v: cb,
      cbPct: Math.round(cb * 100),
      wPct: Math.round((w / 255) * 100),
      cwPct: Math.round((cw / 255) * 100),
      wwPct: Math.round((ww / 255) * 100),
    });
    const withColorBrightness = mode === "rgbw" || mode === "rgbww";
    const SIZE = 220;

    const wheel = h("div", { class: "wheel" });
    const dim = h("div", { class: "wheel-dim" });
    const handle = h("div", { class: "wheel-handle" });
    const wrap = h("div", { class: "wheel-wrap" }, [wheel, dim, handle]);
    wrap.style.width = SIZE + "px";
    wrap.style.height = SIZE + "px";

    const send = debounce(() => this._sendColor(), 120);
    const flush = () => {
      send.cancel();
      this._sendColor();
    };
    const updateVisual = () => {
      const cb = withColorBrightness ? p.cbPct / 100 : p.v;
      const r = p.s * (SIZE / 2);
      handle.style.left = SIZE / 2 + r * Math.sin((p.h * Math.PI) / 180) + "px";
      handle.style.top = SIZE / 2 - r * Math.cos((p.h * Math.PI) / 180) + "px";
      handle.style.backgroundColor = `rgb(${hsv2rgb(p.h, p.s, cb).join(",")})`;
      dim.style.opacity = String(1 - cb);
    };
    updateVisual();

    const pick = (clientX, clientY) => {
      const rect = wheel.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      p.s = Math.min(1, Math.hypot(dx, dy) / (rect.width / 2));
      p.h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      updateVisual();
      send();
    };
    let dragging = false;
    wrap.addEventListener("pointerdown", (e) => {
      dragging = true;
      if (wrap.setPointerCapture) wrap.setPointerCapture(e.pointerId);
      pick(e.clientX, e.clientY);
    });
    wrap.addEventListener("pointermove", (e) => {
      if (dragging) pick(e.clientX, e.clientY);
    });
    const end = () => {
      if (dragging) {
        dragging = false;
        flush();
      }
    };
    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", end);
    panel.appendChild(wrap);

    if (withColorBrightness) {
      panel.appendChild(
        this._buildPickerSlider("mdi:brightness-7", "Farbhelligkeit", p.cbPct, (val, final) => {
          p.cbPct = val;
          updateVisual();
          if (final) flush();
          else send();
        })
      );
    }
    if (mode === "rgbw") {
      panel.appendChild(
        this._buildPickerSlider("mdi:alpha-w-box", "Weiss-Helligkeit", p.wPct, (val, final) => {
          p.wPct = val;
          if (final) flush();
          else send();
        })
      );
    } else if (mode === "rgbww") {
      panel.appendChild(
        this._buildPickerSlider("mdi:snowflake", "Kaltweiss", p.cwPct, (val, final) => {
          p.cwPct = val;
          if (final) flush();
          else send();
        })
      );
      panel.appendChild(
        this._buildPickerSlider("mdi:fire", "Warmweiss", p.wwPct, (val, final) => {
          p.wwPct = val;
          if (final) flush();
          else send();
        })
      );
    }
  }

  _buildPickerSlider(icon, label, value, onChange) {
    const slider = document.createElement("ha-control-slider");
    slider.min = 0;
    slider.max = 100;
    slider.step = 1;
    slider.value = value;
    slider.addEventListener("slider-moved", (e) => {
      e.stopPropagation();
      if (e.detail && e.detail.value != null) onChange(Math.round(e.detail.value), false);
    });
    slider.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      if (e.detail && e.detail.value != null) onChange(Math.round(e.detail.value), true);
    });
    return h("div", { class: "picker-slider-row" }, [
      h("div", { class: "picker-slider-label" }, [h("ha-icon", { icon }), h("span", { text: label })]),
      slider,
    ]);
  }

  _sendColor() {
    const p = this._pick;
    if (!p) return;
    if (p.mode === "hs") {
      this._callLight({ hs_color: [Math.round(p.h), Math.round(p.s * 100)] });
      return;
    }
    const cb = p.mode === "rgbw" || p.mode === "rgbww" ? p.cbPct / 100 : p.v;
    const rgb = hsv2rgb(p.h, p.s, cb);
    const to255 = (pct) => Math.min(255, Math.max(0, Math.round((pct / 100) * 255)));
    if (p.mode === "rgbww") this._callLight({ rgbww_color: [...rgb, to255(p.cwPct), to255(p.wwPct)] });
    else if (p.mode === "rgbw") this._callLight({ rgbw_color: [...rgb, to255(p.wPct)] });
    else this._callLight({ rgb_color: rgb });
  }

  _closePicker() {
    if (this._pickerOverlay) {
      this._pickerOverlay.remove();
      this._pickerOverlay = null;
    }
    if (this._escHandler) {
      window.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }
  }
}

/* ============================== Der Editor =============================== */

const LABELS = {
  device: "WLED-Geraet",
  name: "Anzeigename (optional)",
  show_brightness: "Helligkeit",
  show_favorites: "Favoriten-Farben",
  show_favorite_presets: "Favoriten-Voreinstellungen",
  show_color_pickers: "Farbwaehler (RGB/Weiss)",
  show_presets: "Voreinstellungen",
  show_palettes: "Farbpaletten",
  show_playlist: "Wiedergabeliste",
  show_effects: "Effekte",
  show_speed: "Geschwindigkeit",
  show_intensity: "Intensitaet",
  collapsible_dropdowns: "Effekteinstellungen einklappbar",
  effect_header: "Effekteinstellungen (aufklappbarer Bereich)",
  dynamic_brightness_color: "Helligkeitsregler in Lichtfarbe",
  extra_controls: "Zusaetzliche Schalter/Buttons",
  favorite_presets: "Favoriten-Voreinstellungen",
  light_entity: "Override: Licht",
  preset_entity: "Override: Voreinstellung",
  palette_entity: "Override: Farbpalette",
  playlist_entity: "Override: Wiedergabeliste",
  speed_entity: "Override: Geschwindigkeit",
  intensity_entity: "Override: Intensitaet",
};

const EDITOR_STYLES = `
  :host{ display:block; }
  ha-form{ display:block; }
  .editor-divider{ display:flex; align-items:center; gap:10px; margin:6px 4px 12px; }
  .editor-divider::before, .editor-divider::after{ content:""; flex:1; height:1px; background:var(--divider-color); }
  .editor-divider-label{ font-size:0.8rem; font-weight:500; color:var(--secondary-text-color); white-space:nowrap; }
  .fav-title{ margin:16px 4px 8px; font-weight:500; color:var(--primary-text-color); }
  .fav-hint{ margin:0 4px 8px; font-size:0.8rem; color:var(--secondary-text-color); }
  .fav-editor{ display:flex; flex-wrap:wrap; gap:12px; align-items:center; padding:0 4px 8px; }
  .fav-cell{ position:relative; }
  .fav-cell input[type=color]{ width:40px; height:40px; border:none; border-radius:8px;
    background:none; cursor:pointer; padding:0; }
  .fav-remove{ position:absolute; top:-6px; right:-6px; width:18px; height:18px;
    border-radius:50%; border:none; background:var(--error-color,#db4437); color:#fff;
    cursor:pointer; font-size:12px; line-height:1; }
  .fav-add{ height:40px; padding:0 14px; border-radius:8px; border:1px dashed var(--divider-color);
    background:none; color:var(--primary-text-color); cursor:pointer; }
`;

class WledControlCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._el = {};
    this._built = false;
    loadHaComponents();
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }
  get hass() {
    return this._hass;
  }

  _render() {
    if (!this._config) return;
    if (!this._built) {
      this._build();
      this._built = true;
    }
    const computeLabel = (s) => LABELS[s.name] || "";
    this._el.form.hass = this._hass;
    this._el.form.data = this._config;
    this._el.form.schema = this._schemaTop();
    this._el.form.computeLabel = computeLabel;
    this._el.form2.hass = this._hass;
    this._el.form2.data = this._config;
    this._el.form2.schema = this._schemaEffects();
    this._el.form2.computeLabel = computeLabel;
    this._renderFavoritesEditor();
  }

  _build() {
    this.shadowRoot.appendChild(h("style", { text: EDITOR_STYLES }));

    // Erster Form-Block (Geraet, Name, obere Anzeige-Schalter).
    const form = document.createElement("ha-form");
    form.addEventListener("value-changed", (e) => this._valueChanged(e));
    this._el.form = form;
    this.shadowRoot.appendChild(form);

    // Echte Trennlinie mit Beschriftung zwischen den beiden ha-form-Bloecken.
    this.shadowRoot.appendChild(
      h("div", { class: "editor-divider" }, [
        h("span", { class: "editor-divider-label", text: "Effekteinstellungen" }),
      ])
    );

    // Zweiter Form-Block (Effekt-Bereich + geraeteabhaengige Optionen).
    const form2 = document.createElement("ha-form");
    form2.addEventListener("value-changed", (e) => this._valueChanged(e));
    this._el.form2 = form2;
    this.shadowRoot.appendChild(form2);

    this.shadowRoot.appendChild(h("div", { class: "fav-title", text: "Favoriten-Farben" }));
    this.shadowRoot.appendChild(
      h("div", { class: "fav-hint", text: "Leer lassen fuer sinnvolle Standardfarben." })
    );
    this._el.favWrap = h("div", { class: "fav-editor" });
    this.shadowRoot.appendChild(this._el.favWrap);
  }

  _schemaTop() {
    return [
      { name: "device", required: true, selector: { device: { integration: "wled", entity: { domain: "light" } } } },
      { name: "name", selector: { text: {} } },
      // Obere Anzeige-Schalter (einspaltig: Label links, Schalter rechts).
      { name: "show_brightness", selector: { boolean: {} } },
      { name: "dynamic_brightness_color", selector: { boolean: {} } },
      { name: "show_favorites", selector: { boolean: {} } },
      { name: "show_favorite_presets", selector: { boolean: {} } },
      { name: "show_color_pickers", selector: { boolean: {} } },
    ];
  }

  _schemaEffects() {
    // Alles hier steht unter der Trennlinie "Effekteinstellungen".
    const schema = [
      { name: "collapsible_dropdowns", selector: { boolean: {} } },
      { name: "show_presets", selector: { boolean: {} } },
      { name: "show_palettes", selector: { boolean: {} } },
      { name: "show_playlist", selector: { boolean: {} } },
      { name: "show_effects", selector: { boolean: {} } },
      { name: "show_speed", selector: { boolean: {} } },
      { name: "show_intensity", selector: { boolean: {} } },
    ];
    const device = this._config && this._config.device;
    if (device && this._hass && this._hass.entities) {
      const ents = Object.values(this._hass.entities).filter((e) => e.device_id === device);
      const idsIn = (domains) =>
        ents.filter((e) => domains.some((d) => e.entity_id.startsWith(d + "."))).map((e) => e.entity_id);
      schema.push({
        name: "extra_controls",
        selector: { entity: { multiple: true, include_entities: idsIn(["switch", "button", "select", "number"]) } },
      });
      // Favoriten-Voreinstellungen: Mehrfachauswahl aus den vorhandenen Presets.
      const roles = discoverEntities(this._hass, this._config);
      const presetSt = roles.preset ? this._hass.states[roles.preset] : null;
      const presetOptions =
        presetSt && Array.isArray(presetSt.attributes.options) ? presetSt.attributes.options : [];
      if (presetOptions.length) {
        schema.push({
          name: "favorite_presets",
          selector: { select: { multiple: true, mode: "list", options: presetOptions } },
        });
      }
      schema.push({ name: "light_entity", selector: { entity: { include_entities: idsIn(["light"]) } } });
      schema.push({ name: "preset_entity", selector: { entity: { include_entities: idsIn(["select"]) } } });
      schema.push({ name: "palette_entity", selector: { entity: { include_entities: idsIn(["select"]) } } });
      schema.push({ name: "playlist_entity", selector: { entity: { include_entities: idsIn(["select"]) } } });
      schema.push({ name: "speed_entity", selector: { entity: { include_entities: idsIn(["number"]) } } });
      schema.push({ name: "intensity_entity", selector: { entity: { include_entities: idsIn(["number"]) } } });
    }
    return schema;
  }

  _valueChanged(e) {
    e.stopPropagation();
    this._config = { ...e.detail.value };
    fireEvent(this, "config-changed", { config: this._cleanConfig(this._config) });
  }

  _cleanConfig(value) {
    const out = { ...value };
    ["name", "light_entity", "preset_entity", "palette_entity", "playlist_entity", "speed_entity", "intensity_entity"].forEach(
      (k) => {
        if (out[k] == null || out[k] === "") delete out[k];
      }
    );
    if (!out.extra_controls || !out.extra_controls.length) delete out.extra_controls;
    if (!out.favorite_presets || !out.favorite_presets.length) delete out.favorite_presets;
    return out;
  }

  /* --- Favoriten-Editor (native Farbeingaben) --- */

  _currentFavorites() {
    const c = this._config.favorite_colors && this._config.favorite_colors.length ? this._config.favorite_colors : DEFAULT_FAVORITES;
    return c.map((x) => (Array.isArray(x) ? x.slice() : hexToRgb(x)));
  }

  _commitFavorites(list) {
    this._config = { ...this._config, favorite_colors: list };
    if (this._el.form) this._el.form.data = this._config;
    fireEvent(this, "config-changed", { config: this._cleanConfig(this._config) });
    this._renderFavoritesEditor();
  }

  _renderFavoritesEditor() {
    const wrap = this._el.favWrap;
    wrap.innerHTML = "";
    this._currentFavorites().forEach((rgb, idx) => {
      const input = h("input", { type: "color", value: toHex(rgb) });
      input.addEventListener("change", () => {
        const l = this._currentFavorites();
        l[idx] = hexToRgb(input.value);
        this._commitFavorites(l);
      });
      const remove = h("button", {
        class: "fav-remove",
        title: "Entfernen",
        text: "×",
        "@click": () => {
          const l = this._currentFavorites();
          l.splice(idx, 1);
          this._commitFavorites(l);
        },
      });
      wrap.appendChild(h("div", { class: "fav-cell" }, [input, remove]));
    });
    wrap.appendChild(
      h("button", {
        class: "fav-add",
        text: "+ Farbe",
        "@click": () => {
          const l = this._currentFavorites();
          l.push([255, 255, 255]);
          this._commitFavorites(l);
        },
      })
    );
  }
}

/* ============================ Registrierung ============================== */

if (!customElements.get("wled-control-card")) {
  customElements.define("wled-control-card", WledControlCard);
}
if (!customElements.get("wled-control-card-editor")) {
  customElements.define("wled-control-card-editor", WledControlCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "wled-control-card")) {
  window.customCards.push({
    type: "wled-control-card",
    name: "WLED Control Card",
    description: "Kompakte Steuerkarte fuer WLED-Geraete (Helligkeit, Farben, Presets, Paletten, Effekte, Zusatz-Schalter).",
    preview: true,
    documentationURL: "https://github.com/Si-Al-Ri/wled-control-card",
  });
}

console.info(
  `%c WLED-CONTROL-CARD %c v${CARD_VERSION} `,
  "color:white;background:#3391ff;font-weight:700;border-radius:3px 0 0 3px;",
  "color:#3391ff;background:#e8f2ff;font-weight:700;border-radius:0 3px 3px 0;"
);
