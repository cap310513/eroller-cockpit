(() => {
'use strict';

const APP_VERSION = '0.1.2';
const KMH_TO_MPH = 0.621371;

/* =====================================================================
   Helfer
   ===================================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const root = document.documentElement;

const store = {
  get(k, d) {
    try { const v = localStorage.getItem('eroller.' + k); return v === null ? d : JSON.parse(v); }
    catch { return d; }
  },
  set(k, v) { try { localStorage.setItem('eroller.' + k, JSON.stringify(v)); } catch { /* privater Modus */ } },
  clear() {
    try { Object.keys(localStorage).filter((k) => k.startsWith('eroller.')).forEach((k) => localStorage.removeItem(k)); } catch { /* egal */ }
  },
};

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* =====================================================================
   Einstellungen
   ===================================================================== */
const DEFAULTS = {
  level: 10,
  zeroStart: false,
  maxLevel: 22,
  levelKind: 'level',   // 'level' = Stufe, 'kmh' = km/h
  gaugeMax: 30,         // km/h
  unit: 'kmh',
  source: 'auto',       // auto | scooter | gps
  wake: true,
  demo: false,
  theme: { preset: 'cyan', accent: '#22d3ee', accent2: '#6366f1', mode: 'dark' },
};

function loadSettings() {
  const s = store.get('settings', {});
  return { ...DEFAULTS, ...s, theme: { ...DEFAULTS.theme, ...(s.theme || {}) } };
}
const settings = loadSettings();
const saveSettings = () => store.set('settings', settings);

/* =====================================================================
   Design / Farben
   ===================================================================== */
const PRESETS = [
  { id: 'cyan',   name: 'Neon Cyan',   a: '#22d3ee', b: '#6366f1' },
  { id: 'lime',   name: 'Lime',        a: '#a3e635', b: '#16a34a' },
  { id: 'sunset', name: 'Sunset',      a: '#fb923c', b: '#f43f5e' },
  { id: 'violet', name: 'Violett',     a: '#c084fc', b: '#ec4899' },
  { id: 'red',    name: 'Racing Rot',  a: '#ff4d4d', b: '#ff9a3c' },
  { id: 'ice',    name: 'Eis',         a: '#e2e8f0', b: '#60a5fa' },
];

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
  }
  return [hh, s, l];
}
function hslToHex([hh, s, l]) {
  hh = ((hh % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + hh / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function applyTheme() {
  const t = settings.theme;
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent2', t.accent2);
  root.style.setProperty('--accent-rgb', hexToRgb(t.accent).join(', '));
  root.style.setProperty('--accent2-rgb', hexToRgb(t.accent2).join(', '));
  root.dataset.mode = t.mode;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = t.mode === 'light' ? '#eef1f6' : t.mode === 'amoled' ? '#000000' : '#07090d';
  $$('.swatch').forEach((s) => s.classList.toggle('sel', s.dataset.id === t.preset));
  $('#customColor').value = t.accent;
}

function buildSwatches() {
  const box = $('#swatches');
  PRESETS.forEach((p) => {
    const b = h('button', { class: 'swatch', type: 'button', 'data-id': p.id, 'aria-label': p.name, title: p.name });
    b.style.setProperty('--a', p.a);
    b.style.setProperty('--b', p.b);
    b.addEventListener('click', () => {
      Object.assign(settings.theme, { preset: p.id, accent: p.a, accent2: p.b });
      saveSettings(); applyTheme();
    });
    box.append(b);
  });
  $('#customColor').addEventListener('input', (e) => {
    const [hh, s, l] = rgbToHsl(hexToRgb(e.target.value));
    Object.assign(settings.theme, {
      preset: 'custom', accent: e.target.value, accent2: hslToHex([hh + 45, s, l * .9]),
    });
    saveSettings(); applyTheme();
  });
}

/* =====================================================================
   Tacho
   ===================================================================== */
const G = { cx: 160, cy: 160, r: 118, start: 135, sweep: 270 };
const SVGNS = 'http://www.w3.org/2000/svg';
const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [G.cx + r * Math.cos(a), G.cy + r * Math.sin(a)];
};
const arcPath = (r) => {
  const [x1, y1] = polar(G.start, r);
  const [x2, y2] = polar(G.start + G.sweep, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 1 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
const unitFactor = () => (settings.unit === 'mph' ? KMH_TO_MPH : 1);
const unitLabel = () => (settings.unit === 'mph' ? 'mph' : 'km/h');
const gaugeScale = () => Math.max(10, Math.ceil((settings.gaugeMax * unitFactor()) / 5) * 5);

let ticks = [];
let gaugeEls = {};
function svgEl(name, attrs) {
  const el = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function buildGauge() {
  const svg = $('#gauge');
  svg.replaceChildren();
  const max = gaugeScale();

  const defs = svgEl('defs', {});
  const grad = svgEl('linearGradient', { id: 'gGrad', gradientUnits: 'userSpaceOnUse', x1: 40, y1: 240, x2: 280, y2: 60 });
  grad.append(
    svgEl('stop', { offset: 0, style: 'stop-color:var(--accent2)' }),
    svgEl('stop', { offset: 1, style: 'stop-color:var(--accent)' }),
  );
  defs.append(grad);
  svg.append(defs);

  svg.append(svgEl('path', { class: 'g-track', d: arcPath(G.r) }));

  ticks = [];
  const step = max <= 40 ? 1 : 5;
  const major = max <= 40 ? 5 : 10;
  for (let v = 0; v <= max; v += step) {
    const deg = G.start + (G.sweep * v) / max;
    const isMajor = v % major === 0;
    const [x1, y1] = polar(deg, G.r - 16);
    const [x2, y2] = polar(deg, G.r - (isMajor ? 27 : 22));
    const line = svgEl('line', { class: 'g-tick' + (isMajor ? ' major' : ''), x1, y1, x2, y2 });
    svg.append(line);
    ticks.push({ v, line });
    if (isMajor) {
      const [tx, ty] = polar(deg, G.r - 42);
      const t = svgEl('text', { class: 'g-lbl', x: tx, y: ty });
      t.textContent = v;
      svg.append(t);
    }
  }

  const arc = svgEl('path', { class: 'g-arc', d: arcPath(G.r), pathLength: 100, stroke: 'url(#gGrad)' });
  const knob = svgEl('circle', { class: 'g-knob', r: 6 });
  svg.append(arc, knob);
  gaugeEls = { arc, knob };
  drawGauge(shown, true);
}

let lastTickIdx = -1;
function drawGauge(v, force) {
  const max = gaugeScale();
  const p = clamp(v / max, 0, 1);
  const { arc, knob } = gaugeEls;
  if (!arc) return;
  arc.style.strokeDasharray = `${(p * 100).toFixed(2)} 100`;
  arc.style.opacity = p < 0.004 ? 0 : 1;
  const [x, y] = polar(G.start + G.sweep * p, G.r);
  knob.setAttribute('cx', x.toFixed(2));
  knob.setAttribute('cy', y.toFixed(2));
  const idx = ticks.filter((t) => t.v <= v + 0.001).length;
  if (force || idx !== lastTickIdx) {
    ticks.forEach((t, i) => t.line.classList.toggle('on', i < idx && v > 0.05));
    lastTickIdx = idx;
  }
}

/* =====================================================================
   Messwerte (Roller / GPS / Demo)
   ===================================================================== */
const state = {
  scooter: null,   // { speed(km/h), battery, t, src }
  gps: null,       // { kmh, t }
  gpsId: null,
  trip: 0,         // km
  moving: 0,       // s
  max: 0,          // km/h
  kmh: 0,          // aktuell angezeigte Geschwindigkeit
  lastTick: Date.now(),
};
let shown = 0;

function pushTelemetry(t, src = 'roller') {
  const prev = state.scooter || {};
  state.scooter = {
    speed: t.speed ?? prev.speed ?? 0,
    battery: t.battery ?? prev.battery ?? null,
    t: Date.now(),
    src,
  };
}

function currentSource() {
  const now = Date.now();
  const sc = state.scooter && now - state.scooter.t < 3500 ? state.scooter : null;
  // GPS: ein Fix gilt 20 s als "Signal da". Kommt länger als 4 s kein Update, steht man (Tempo 0).
  const fix = state.gps && now - state.gps.t < 20000 ? state.gps : null;
  const gp = fix ? { kmh: now - fix.t < 4000 ? fix.kmh : 0 } : null;
  const mode = settings.source;
  if (mode === 'scooter') return sc ? { kmh: sc.speed, label: sc.src === 'demo' ? 'Demo' : 'Roller' } : null;
  if (mode === 'gps') return gp ? { kmh: gp.kmh, label: 'GPS' } : null;
  if (sc) return { kmh: sc.speed, label: sc.src === 'demo' ? 'Demo' : 'Roller' };
  if (gp) return { kmh: gp.kmh, label: 'GPS' };
  return null;
}

function startGps() {
  if (state.gpsId != null) return;
  if (!navigator.geolocation) { toast('Dieses Gerät hat kein GPS.'); return; }
  state.gpsId = navigator.geolocation.watchPosition(
    (pos) => {
      const v = pos.coords.speed;
      state.gps = { kmh: v == null || Number.isNaN(v) ? 0 : Math.max(0, v * 3.6), t: Date.now() };
    },
    (err) => {
      stopGps();
      toast(err.code === 1 ? 'Standortzugriff abgelehnt. Bitte in den Einstellungen erlauben.' : 'GPS nicht verfügbar.');
      updateBadge();
    },
    { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 },
  );
  updateBadge();
}
function stopGps() {
  if (state.gpsId != null) navigator.geolocation.clearWatch(state.gpsId);
  state.gpsId = null;
  state.gps = null;
}

/* Simulierte Fahrt */
let demoTimer = null;
let demoSpeed = 0;
let demoBat = 87;
function startDemo() {
  stopDemo();
  demoTimer = setInterval(() => {
    const target = settings.levelKind === 'kmh' ? settings.level : (settings.level / settings.maxLevel) * 22;
    demoSpeed += (target - demoSpeed) * 0.07 + (Math.random() - .5) * .25;
    demoSpeed = Math.max(0, demoSpeed);
    demoBat = Math.max(5, demoBat - 0.004);
    pushTelemetry({ speed: demoSpeed, battery: Math.round(demoBat) }, 'demo');
  }, 200);
}
function stopDemo() {
  clearInterval(demoTimer);
  demoTimer = null;
  if (state.scooter && state.scooter.src === 'demo') state.scooter = null;
  demoSpeed = 0;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  return `${Math.floor(m / 60) ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function updateBadge() {
  const b = $('#srcBadge');
  const src = currentSource();
  if (src) { b.textContent = src.label; b.disabled = false; }
  else if (state.gpsId != null) b.textContent = 'GPS sucht…';
  else b.textContent = 'GPS starten';
}

function tick() {
  const now = Date.now();
  const dt = Math.min(1, (now - state.lastTick) / 1000);
  state.lastTick = now;
  const src = currentSource();
  const kmh = src ? src.kmh : 0;
  state.kmh = kmh;
  if (kmh > 1) { state.trip += (kmh * dt) / 3600; state.moving += dt; }
  state.max = Math.max(state.max, kmh);
  updateBadge();
  updateStats();
}
setInterval(tick, 200);

function updateStats() {
  const f = unitFactor();
  const bat = state.scooter && Date.now() - state.scooter.t < 5000 ? state.scooter.battery : null;
  $('#stBat').textContent = bat == null ? '–' : bat + '%';
  $('#stTrip').textContent = (state.trip * f).toFixed(1) + (settings.unit === 'mph' ? ' mi' : ' km');
  $('#stMax').textContent = Math.round(state.max * f);
  $('#stTime').textContent = fmtTime(state.moving);
}

let lastNum = -1;
function frame() {
  const target = (state.kmh || 0) * unitFactor();
  shown += (target - shown) * 0.14;
  if (Math.abs(target - shown) < 0.02) shown = target;
  drawGauge(shown);
  const n = Math.round(shown);
  if (n !== lastNum) { $('#speedNum').textContent = n; lastNum = n; }
  requestAnimationFrame(frame);
}

/* =====================================================================
   Regler & Nullstart
   ===================================================================== */
let sendTimer;
function setLevel(n, send = true) {
  n = clamp(Math.round(n), 1, settings.maxLevel);
  settings.level = n;
  saveSettings();
  renderLevel();
  if (send) {
    clearTimeout(sendTimer);
    sendTimer = setTimeout(() => sendToScooter('level', n), 180);
  }
}

function renderLevel() {
  const max = settings.maxLevel;
  const slider = $('#level');
  slider.max = max;
  slider.value = settings.level;
  slider.style.setProperty('--r', (settings.level - 1) / Math.max(1, max - 1));
  $('#levelNum').textContent = settings.level;
  $('#levelMax').textContent = settings.levelKind === 'kmh' ? ' km/h' : '/' + max;
  $('#sliderMaxLbl').textContent = max;
  $('#levelTitle').textContent = settings.levelKind === 'kmh' ? 'Geschwindigkeit' : 'Stufe';
  $('#level').setAttribute('aria-label', $('#levelTitle').textContent);
  $('#zeroStart').checked = settings.zeroStart;
}

async function sendToScooter(kind, value) {
  const p = ble.profile;
  if (!ble.connected || !p) return;
  if (!p.confirmed) return;
  try {
    if (kind === 'level') await p.setLevel(ble.link, value);
    else await p.setZeroStart(ble.link, value);
  } catch (e) {
    bleLog('ERR', 'Senden fehlgeschlagen: ' + errText(e));
    toast('Senden fehlgeschlagen');
  }
}

function updateBanner() {
  const b = $('#banner');
  if (settings.demo) b.innerHTML = '<b>Demo-Modus:</b> Alle Werte sind simuliert.';
  else if (!ble.connected) b.innerHTML = '<b>Vorschau:</b> Noch nicht mit dem Roller verbunden. Regler und Schalter wirken nur in der App.';
  else if (!ble.profile || !ble.profile.confirmed) b.innerHTML = '<b>Verbunden, aber noch nicht freigeschaltet:</b> Das Roller-Protokoll ist noch unbekannt, Regler und Schalter werden daher nicht gesendet. Im Tab <b>Bluetooth</b> kannst du den Roller auslesen.';
  else b.textContent = '';
}

/* =====================================================================
   Bluetooth
   ===================================================================== */
const ble = { device: null, server: null, connected: false, profile: null, link: null, services: [], manual: false, subs: new Map(), reconnects: 0 };
const logLines = [];

function toHex(dv) {
  const u = dv instanceof DataView ? new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength) : dv;
  return [...u].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}
function toAscii(dv) {
  const u = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  return [...u].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
}
function parseHex(str) {
  const clean = str.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (!clean || clean.length % 2) throw new Error('Ungültige Hex-Eingabe (gerade Anzahl Zeichen 0-9, a-f)');
  return Uint8Array.from(clean.match(/../g).map((x) => parseInt(x, 16)));
}

function bleLog(type, text) {
  const time = new Date().toLocaleTimeString('de-DE');
  logLines.push({ time, type, text });
  if (logLines.length > 600) logLines.shift();
  const box = $('#bleLog');
  const cls = { RX: 'rx', TX: 'tx', ERR: 'err', INFO: 'info' }[type] || '';
  const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.append(h('div', {}, h('span', { class: 't' }, time + ' '), h('span', { class: cls }, `[${type}] ${text}`)));
  while (box.children.length > 600) box.firstChild.remove();
  if (stick) box.scrollTop = box.scrollHeight;
}

const NAMES = {
  '00001800': 'Generic Access', '00001801': 'Generic Attribute', '0000180a': 'Device Information', '0000180f': 'Battery',
  '00002a00': 'Device Name', '00002a01': 'Appearance', '00002a19': 'Battery Level', '00002a24': 'Model Number',
  '00002a25': 'Serial Number', '00002a26': 'Firmware Revision', '00002a27': 'Hardware Revision', '00002a28': 'Software Revision',
  '00002a29': 'Manufacturer', '00002a50': 'PnP ID', '6e400001': 'Nordic UART Service', '6e400002': 'Nordic UART RX (write)',
  '6e400003': 'Nordic UART TX (notify)', '0000ffe0': 'Serial (HM-10 Stil)', '0000ffe1': 'Serial Daten', '0000fff0': 'Hersteller-Service (FFF0)',
};
const nameOf = (uuid) => NAMES[uuid.slice(0, 8)] || '';

/* Immer die lange 128-Bit-Schreibweise: iPhone-Browser wie Bluefy sind bei Kurzformen (Zahlen) pingelig. */
const uuid16 = (n) => `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;

function serviceList(mode = 'full') {
  const set = new Set();
  [0x1800, 0x1801, 0x180a, 0x180f, 0x1812, 0x1814, 0x1816, 0x181c, 0x1820, 0xae00, 0xae30, 0xa000, 0xd0ff, 0x1910, 0xfd00, 0xfe00, 0xfe59, 0xfe95, 0xffe0, 0xfff0]
    .forEach((n) => set.add(uuid16(n)));
  set.add('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
  if (mode === 'full') for (let i = 0xff00; i <= 0xffff; i++) set.add(uuid16(i));
  for (const raw of ($('#extraUuids').value || '').split(/[\s,;]+/).filter(Boolean)) {
    const u = raw.toLowerCase();
    if (/^[0-9a-f]{4}$/.test(u)) set.add(uuid16(parseInt(u, 16)));
    else if (/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(u)) set.add(u);
  }
  return [...set];
}

/* Fehler lesbar machen, auch wenn der Browser keinen normalen Error wirft (z. B. nur einen Text) */
function errText(e) {
  if (e == null) return String(e);
  if (typeof e === 'string') return e;
  const parts = [e.name, e.message].filter(Boolean);
  if (parts.length) return parts.join(': ');
  try {
    const j = JSON.stringify(e);
    if (j && j !== '{}') return j;
  } catch { /* egal */ }
  return `${Object.prototype.toString.call(e)} ${String(e)}`;
}
// "Abbrechen" im Auswahlfenster. Chrome meldet auch "Bluetooth adapter not available" als NotFoundError, das zählt NICHT als Abbruch.
const isCancel = (e) => /cancel|abgebrochen|dismiss/i.test(errText(e)) || (!!e && e.name === 'NotFoundError' && !e.message);

async function selfTest() {
  const bt = navigator.bluetooth;
  bleLog('INFO', `E-Roller Cockpit v${APP_VERSION}`);
  bleLog('INFO', `Browser: ${navigator.userAgent}`);
  bleLog('INFO', `https: ${isSecureContext ? 'ja' : 'NEIN'} · Web Bluetooth: ${bt ? 'ja' : 'NEIN (Bluefy nutzen)'}`);
  if (!bt) return;
  bleLog('INFO', 'Funktionen: ' + ['requestDevice', 'getAvailability', 'getDevices'].map((k) => `${k} ${typeof bt[k] === 'function' ? 'ja' : 'nein'}`).join(', '));
  if (typeof bt.getAvailability === 'function') {
    try { bleLog('INFO', `Bluetooth am Gerät verfügbar: ${await bt.getAvailability()}`); }
    catch (e) { bleLog('ERR', `getAvailability: ${errText(e)}`); }
  }
}

function setConnUi(stateName, label) {
  const chip = $('#connChip');
  chip.dataset.state = stateName;
  $('#connLabel').textContent = label;
  $('#bleConnect').disabled = stateName === 'busy';
  $('#bleDisconnect').disabled = !ble.connected;
}

function refreshChip() {
  if (ble.connected) setConnUi('on', ble.device.name || 'Roller verbunden');
  else if (settings.demo) setConnUi('demo', 'Demo');
  else setConnUi('off', 'Nicht verbunden');
  updateBanner();
}

let bleBusy = false;
async function bleConnect() {
  if (!navigator.bluetooth) { $('#bleUnsupported').classList.remove('hidden'); showView('ble'); toast('Bitte in Bluefy öffnen'); return; }
  if (bleBusy) return;   // Doppeltipp: nicht zwei Auswahlfenster gleichzeitig
  bleBusy = true;
  try { await bleSearch(); } finally { bleBusy = false; }
}

async function bleSearch() {
  bleLog('INFO', 'Suche gestartet …');
  // Stufenweise Anfragen: erst mit großer Service-Liste, dann kleiner, dann ganz ohne.
  const attempts = [
    ['große Liste', () => ({ acceptAllDevices: true, optionalServices: serviceList('full') })],
    ['kleine Liste', () => ({ acceptAllDevices: true, optionalServices: serviceList('small') })],
    ['ohne Zusatzliste', () => ({ acceptAllDevices: true })],
  ];
  let dev = null;
  let lastErr = null;
  for (const [label, makeOpts] of attempts) {
    try {
      dev = await navigator.bluetooth.requestDevice(makeOpts());
      if (label !== attempts[0][0]) bleLog('INFO', `Suche mit „${label}“ hat funktioniert.`);
      break;
    } catch (e) {
      if (isCancel(e)) { bleLog('INFO', 'Kein Gerät ausgewählt (Suche abgebrochen oder nichts gefunden).'); return; }
      lastErr = e;
      bleLog('ERR', `Suche mit „${label}“ abgelehnt: ${errText(e)}`);
    }
  }
  if (!dev) {
    toast(`Suche fehlgeschlagen: ${errText(lastErr)}`, 6000);
    bleLog('INFO', 'Bitte prüfen: iPhone-Einstellungen → Bluefy → Bluetooth erlauben · Bluetooth am iPhone an · Roller an und nicht mit der HITWAY-App verbunden · Bluefy neu starten. Dann „Bericht teilen“ und an Jan schicken.');
    return;
  }
  await connectDevice(dev);
}

async function connectDevice(dev) {
  setConnUi('busy', 'Verbinde …');
  try {
    // Anderes Gerät noch verbunden? Erst sauber trennen, sonst zwei Verbindungen gleichzeitig.
    if (ble.device && ble.device !== dev) {
      ble.device.removeEventListener('gattserverdisconnected', onBleDisconnect);
      try { if (ble.device.gatt.connected) ble.device.gatt.disconnect(); } catch { /* egal */ }
      ble.subs.clear();
    }
    ble.manual = false;
    dev.removeEventListener('gattserverdisconnected', onBleDisconnect);
    dev.addEventListener('gattserverdisconnected', onBleDisconnect);
    bleLog('INFO', `Verbinde mit „${dev.name || 'unbenannt'}“ …`);
    const server = await dev.gatt.connect();
    ble.device = dev;
    ble.server = server;
    ble.connected = true;
    ble.reconnects = 0;
    try { await discover(); }
    catch (e) {
      ble.services = [];
      bleLog('ERR', `Services nicht lesbar: ${errText(e)}`);
      bleLog('INFO', 'Verbunden, aber der Browser gibt keine Services frei. Trage die UUIDs aus nRF Connect unter „Zusätzliche Service-UUIDs“ ein und verbinde neu.');
    }
    ble.link = makeLink();
    ble.profile = (window.ScooterProtocols || []).find((p) => p.matches(dev.name)) || null;
    if (ble.profile) {
      bleLog('INFO', `Profil „${ble.profile.label}“ ${ble.profile.confirmed ? 'aktiv' : 'erkannt, aber noch nicht freigeschaltet'}.`);
      if (ble.profile.confirmed) await ble.profile.attach(ble.link);
    } else bleLog('INFO', 'Kein passendes Roller-Profil gefunden.');
    toast('Verbunden mit ' + (dev.name || 'Roller'));
    safeReads();
  } catch (e) {
    ble.connected = false;
    bleLog('ERR', 'Verbindung fehlgeschlagen: ' + errText(e));
    toast('Verbindung fehlgeschlagen: ' + errText(e), 5000);
  }
  renderBle();
  refreshChip();
}

function onBleDisconnect() {
  const wasConnected = ble.connected;
  ble.connected = false;
  ble.subs.clear();
  bleLog('INFO', 'Verbindung getrennt.');
  refreshChip();
  renderBle();
  if (wasConnected && !ble.manual && ble.reconnects < 2 && ble.device) {
    ble.reconnects++;
    setTimeout(() => { if (!ble.connected && !ble.manual) connectDevice(ble.device); }, 1500);
  }
}

async function bleDisconnect() {
  ble.manual = true;
  if (ble.device && ble.device.gatt.connected) ble.device.gatt.disconnect();
  ble.connected = false;
  refreshChip();
  renderBle();
}

async function discover() {
  ble.services = [];
  const services = await ble.server.getPrimaryServices();
  for (const s of services) {
    const entry = { uuid: s.uuid, ref: s, chars: [] };
    try {
      for (const c of await s.getCharacteristics()) {
        const p = c.properties;
        entry.chars.push({
          uuid: c.uuid, ref: c,
          props: ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter((k) => p[k]),
          value: null,
        });
      }
    } catch (e) { bleLog('ERR', `Merkmale von ${s.uuid} nicht lesbar: ${errText(e)}`); }
    ble.services.push(entry);
  }
  bleLog('INFO', `${ble.services.length} Services gefunden.`);
  if (!ble.services.length) bleLog('INFO', 'Tipp: Fehlende Services? Trage ihre UUIDs unter „Zusätzliche Service-UUIDs“ ein und verbinde neu.');
}

function findChar(svc, chr) {
  const s = ble.services.find((x) => x.uuid === svc);
  return s && s.chars.find((c) => c.uuid === chr);
}

function makeLink() {
  return {
    device: ble.device,
    emit: (t) => pushTelemetry(t, 'roller'),
    log: (t) => bleLog('INFO', t),
    async read(svc, chr) { return (await findChar(svc, chr).ref.readValue()); },
    async write(svc, chr, bytes) {
      const c = findChar(svc, chr).ref;
      bleLog('TX', `${chr.slice(4, 8)}: ${toHex(bytes)}`);
      if (c.properties.writeWithoutResponse && !c.properties.write) await c.writeValueWithoutResponse(bytes);
      else await c.writeValueWithResponse(bytes);
    },
    async subscribe(svc, chr, cb) {
      const c = findChar(svc, chr).ref;
      await c.startNotifications();
      c.addEventListener('characteristicvaluechanged', (e) => cb(e.target.value));
    },
  };
}

/* Nur ungefährliche Lesezugriffe: Geräteinfos und Akku-Stand */
async function safeReads() {
  const info = ['00002a29', '00002a24', '00002a26', '00002a27', '00002a28', '00002a19'];
  for (const s of ble.services) {
    for (const c of s.chars) {
      if (!c.props.includes('read') || !info.includes(c.uuid.slice(0, 8))) continue;
      try {
        const dv = await c.ref.readValue();
        c.value = dv;
        bleLog('RX', `${nameOf(c.uuid) || c.uuid}: ${c.uuid.startsWith('00002a19') ? dv.getUint8(0) + ' %' : toAscii(dv)}`);
        if (c.uuid.startsWith('00002a19')) pushTelemetry({ battery: dv.getUint8(0) }, 'roller');
      } catch { /* egal */ }
    }
  }
  renderBle();
}

async function readChar(c) {
  try {
    const dv = await c.ref.readValue();
    c.value = dv;
    bleLog('RX', `${c.uuid.slice(4, 8)} gelesen: ${toHex(dv)}  | ${toAscii(dv)}`);
  } catch (e) { bleLog('ERR', `Lesen: ${errText(e)}`); }
  renderBle();
}

async function toggleNotify(c) {
  try {
    if (ble.subs.has(c.uuid)) {
      await c.ref.stopNotifications();
      c.ref.removeEventListener('characteristicvaluechanged', ble.subs.get(c.uuid));
      ble.subs.delete(c.uuid);
      bleLog('INFO', `Abo beendet: ${c.uuid.slice(4, 8)}`);
    } else {
      const fn = (e) => {
        c.value = e.target.value;
        bleLog('RX', `${c.uuid.slice(4, 8)} ← ${toHex(e.target.value)}  | ${toAscii(e.target.value)}`);
      };
      await c.ref.startNotifications();
      c.ref.addEventListener('characteristicvaluechanged', fn);
      ble.subs.set(c.uuid, fn);
      bleLog('INFO', `Abo gestartet: ${c.uuid.slice(4, 8)}`);
    }
  } catch (e) { bleLog('ERR', `Benachrichtigung: ${errText(e)}`); }
  renderBle();
}

async function writeChar(c, hexStr) {
  if (!$('#bleWriteOk').checked) { toast('Erst „Schreiben freischalten“ aktivieren'); return; }
  try {
    const bytes = parseHex(hexStr);
    bleLog('TX', `${c.uuid.slice(4, 8)}: ${toHex(bytes)}`);
    if (c.props.includes('writeWithoutResponse') && !c.props.includes('write')) await c.ref.writeValueWithoutResponse(bytes);
    else await c.ref.writeValueWithResponse(bytes);
  } catch (e) { bleLog('ERR', `Schreiben: ${errText(e)}`); toast(errText(e)); }
}

function renderBle() {
  $('#bleInfo').classList.toggle('hidden', !ble.device);
  $('#bleDisconnect').disabled = !ble.connected;
  if (!ble.device) return;

  const kv = $('#bleDevice');
  kv.replaceChildren(
    h('span', {}, 'Name'), h('span', {}, ble.device.name || '(ohne Namen)'),
    h('span', {}, 'Status'), h('span', {}, ble.connected ? 'verbunden' : 'getrennt'),
    h('span', {}, 'Profil'), h('span', {}, ble.profile ? `${ble.profile.label} (${ble.profile.confirmed ? 'aktiv' : 'noch nicht freigeschaltet'})` : 'keins'),
  );

  const tree = $('#bleTree');
  tree.replaceChildren();
  for (const s of ble.services) {
    const box = h('div', { class: 'svc' },
      h('div', { class: 'svc-name' }, nameOf(s.uuid) || 'Service', h('small', {}, s.uuid)));
    for (const c of s.chars) {
      const row = h('div', { class: 'chr' },
        h('div', { class: 'chr-id' }, c.uuid, nameOf(c.uuid) ? ` · ${nameOf(c.uuid)}` : ''),
        h('div', { class: 'props' }, c.props.map((p) => h('span', { class: 'prop' + (p.startsWith('write') ? ' w' : p === 'notify' || p === 'indicate' ? ' n' : '') }, p))));
      const actions = h('div', { class: 'chr-actions' });
      if (c.props.includes('read')) actions.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => readChar(c) }, 'Lesen'));
      if (c.props.includes('notify') || c.props.includes('indicate')) {
        actions.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => toggleNotify(c) }, ble.subs.has(c.uuid) ? 'Abo beenden' : 'Abonnieren'));
      }
      if (actions.children.length) row.append(actions);
      if (c.props.includes('write') || c.props.includes('writeWithoutResponse')) {
        const inp = h('input', { type: 'text', placeholder: 'Hex, z. B. A5 01 0B', autocomplete: 'off', autocapitalize: 'off' });
        row.append(h('div', { class: 'chr-write' }, inp, h('button', { class: 'btn ghost', type: 'button', onclick: () => writeChar(c, inp.value) }, 'Senden')));
      }
      if (c.value) row.append(h('div', { class: 'chr-val' }, `${toHex(c.value)}  |  ${toAscii(c.value)}`));
      box.append(row);
    }
    tree.append(box);
  }
}

async function readAll() {
  for (const s of ble.services) for (const c of s.chars) if (c.props.includes('read')) await readChar(c);
}
async function subscribeAll() {
  for (const s of ble.services) {
    for (const c of s.chars) {
      if ((c.props.includes('notify') || c.props.includes('indicate')) && !ble.subs.has(c.uuid)) await toggleNotify(c);
    }
  }
}

function buildReport() {
  const out = [];
  out.push(`E-Roller Cockpit ${APP_VERSION} – Bluetooth-Bericht`);
  out.push(`Browser: ${navigator.userAgent}`);
  out.push(`Gerät: ${ble.device ? ble.device.name || '(ohne Namen)' : '(keins)'}`);
  out.push('');
  out.push('SERVICES');
  for (const s of ble.services) {
    out.push(`- ${s.uuid} ${nameOf(s.uuid)}`);
    for (const c of s.chars) {
      out.push(`    ${c.uuid} [${c.props.join(',')}] ${nameOf(c.uuid)}${c.value ? '  = ' + toHex(c.value) : ''}`);
    }
  }
  out.push('');
  out.push('PROTOKOLL');
  for (const l of logLines) out.push(`${l.time} [${l.type}] ${l.text}`);
  return out.join('\n');
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0;font-size:16px' });
    ta.value = text;
    document.body.append(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* egal */ }
    ta.remove();
    return ok;
  }
}

/* Klappt Kopieren/Teilen nicht, zeigen wir den Bericht zum Selbst-Markieren (lange drücken → Kopieren) */
function showReport(text) {
  const box = $('#reportBox');
  box.value = text;
  box.classList.remove('hidden');
  box.focus();
  box.select();
  box.setSelectionRange(0, text.length);
  box.scrollIntoView({ block: 'center' });
}

async function copyOrShow(text) {
  if (await copyText(text)) { toast('Bericht kopiert'); return; }
  showReport(text);
  toast('Kopieren geht nicht. Text unten markieren und kopieren.', 5000);
}

/* Neue Version da? GitHub liefert Seiten bis zu 10 Min. aus dem Zwischenspeicher, das umgehen wir hier. */
async function checkForUpdate() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { version } = await r.json();
    const params = new URLSearchParams(location.search);
    if (version && version !== APP_VERSION && params.get('v') !== version) {   // v-Prüfung verhindert Endlosschleife
      params.set('v', version);
      toast(`Neue Version ${version} wird geladen …`, 3000);
      setTimeout(() => location.replace(`${location.pathname}?${params}`), 700);
    }
  } catch { /* offline */ }
}

/* =====================================================================
   PIN-Sperre
   ===================================================================== */
const Lock = {
  mode: 'unlock',   // unlock | set1 | set2 | verifyRemove | verifySet
  entry: '',
  first: '',
  fails: 0,
  until: 0,
  hiddenAt: 0,
  get hash() { return store.get('pinHash', null); },
  get len() { return store.get('pinLen', 4); },
};

async function sha(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let x = 5381;
    for (const ch of text) x = ((x << 5) + x + ch.charCodeAt(0)) | 0;
    return 'weak' + x;
  }
}
const pinHash = (pin) => sha('eroller|' + (store.get('pinSalt', '') || '') + '|' + pin);

function lockRender() {
  const dots = $('#pinDots');
  const settingMode = Lock.mode === 'set1' || Lock.mode === 'set2';
  const n = settingMode ? Math.max(4, Lock.entry.length) : Lock.len;
  dots.replaceChildren(...Array.from({ length: n }, (_, i) => h('i', { class: i < Lock.entry.length ? 'on' : '' })));
  $('#pinOk').classList.toggle('hidden', !settingMode);
  $('#pinCancel').style.visibility = Lock.mode === 'unlock' ? 'hidden' : 'visible';
  $('#pinForgot').classList.toggle('hidden', Lock.mode !== 'unlock');
}

function lockOpen(mode, title, sub) {
  Lock.mode = mode;
  Lock.entry = '';
  $('#lockTitle').textContent = title;
  $('#lockSub').textContent = sub || '';
  $('#lock').classList.remove('hidden');
  lockRender();
}
const lockClose = () => $('#lock').classList.add('hidden');

function lockShake(msg) {
  const d = $('#pinDots');
  d.classList.remove('shake');
  void d.offsetWidth;
  d.classList.add('shake');
  $('#lockSub').textContent = msg;
  Lock.entry = '';
  lockRender();
}

async function lockSubmit() {
  const pin = Lock.entry;
  if (Date.now() < Lock.until) { lockShake(`Zu viele Versuche. Warte ${Math.ceil((Lock.until - Date.now()) / 1000)} s.`); return; }

  if (Lock.mode === 'set1') {
    if (pin.length < 4) { lockShake('Mindestens 4 Ziffern'); return; }
    Lock.first = pin;
    lockOpen('set2', 'PIN wiederholen', 'Gib die PIN zur Bestätigung noch einmal ein.');
    return;
  }
  if (Lock.mode === 'set2') {
    if (pin !== Lock.first) { lockShake('Die PINs stimmen nicht überein.'); Lock.mode = 'set1'; $('#lockTitle').textContent = 'Neue PIN'; return; }
    store.set('pinSalt', Math.random().toString(36).slice(2) + Date.now().toString(36));
    store.set('pinHash', await pinHash(pin));
    store.set('pinLen', pin.length);
    lockClose(); lockSettingsRender(); toast('PIN gespeichert');
    return;
  }

  const ok = (await pinHash(pin)) === Lock.hash;
  if (!ok) {
    Lock.fails++;
    if (Lock.fails >= 5) { Lock.until = Date.now() + 30000; Lock.fails = 0; lockShake('Zu viele Versuche. Bitte 30 s warten.'); }
    else lockShake('Falsche PIN');
    return;
  }
  Lock.fails = 0;
  if (Lock.mode === 'unlock') lockClose();
  else if (Lock.mode === 'verifyRemove') {
    store.set('pinHash', null); lockClose(); lockSettingsRender(); toast('PIN entfernt');
  } else if (Lock.mode === 'verifySet') lockOpen('set1', 'Neue PIN', 'Wähle 4–8 Ziffern.');
}

function lockKey(k) {
  if (k === 'cancel') { lockClose(); return; }
  if (k === 'del') Lock.entry = Lock.entry.slice(0, -1);
  else if (Lock.entry.length < 8) Lock.entry += k;
  lockRender();
  const settingMode = Lock.mode === 'set1' || Lock.mode === 'set2';
  if (!settingMode && Lock.entry.length === Lock.len) lockSubmit();
}

function lockSettingsRender() {
  const has = !!Lock.hash;
  $('#lockSet').textContent = has ? 'PIN ändern' : 'PIN festlegen';
  $('#lockRemove').classList.toggle('hidden', !has);
  $('#lockNow').classList.toggle('hidden', !has);
  $('#lockHint').textContent = has
    ? 'Die App ist durch deine PIN geschützt und sperrt sich nach 30 Sekunden im Hintergrund automatisch.'
    : 'Schütze die App mit deiner eigenen PIN (4–8 Ziffern).';
}

function initLock() {
  $$('.keypad button').forEach((b) => b.addEventListener('click', () => lockKey(b.dataset.k)));
  $('#pinOk').addEventListener('click', lockSubmit);
  $('#pinForgot').addEventListener('click', () => {
    if (confirm('PIN vergessen? Dann müssen alle App-Daten (PIN, Farben, Einstellungen) gelöscht werden. Das betrifft nur diese App, nicht den Roller.')) {
      store.clear();
      location.reload();
    }
  });
  $('#lockSet').addEventListener('click', () => {
    if (Lock.hash) lockOpen('verifySet', 'Aktuelle PIN', 'Gib zuerst deine bisherige PIN ein.');
    else lockOpen('set1', 'Neue PIN', 'Wähle 4–8 Ziffern und bestätige mit OK.');
  });
  $('#lockRemove').addEventListener('click', () => lockOpen('verifyRemove', 'PIN entfernen', 'Gib zur Bestätigung deine PIN ein.'));
  $('#lockNow').addEventListener('click', () => lockOpen('unlock', 'PIN eingeben', ''));
  lockSettingsRender();
  if (Lock.hash) lockOpen('unlock', 'PIN eingeben', '');

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Lock.hiddenAt = Date.now();
    else if (Lock.hash && Lock.hiddenAt && Date.now() - Lock.hiddenAt > 30000 && $('#lock').classList.contains('hidden')) {
      lockOpen('unlock', 'PIN eingeben', '');
    }
  });
}

/* =====================================================================
   Navigation & Einstellungen binden
   ===================================================================== */
function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $('main').scrollTop = 0;
}

function getPath(obj, path) { return path.split('.').reduce((o, k) => o[k], obj); }
function setPath(obj, path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = val;
}

function initSettings() {
  $$('.seg').forEach((seg) => {
    const key = seg.dataset.setting;
    const sync = () => $$('button', seg).forEach((b) => b.classList.toggle('sel', b.dataset.value === getPath(settings, key)));
    $$('button', seg).forEach((b) => b.addEventListener('click', () => {
      setPath(settings, key, b.dataset.value);
      saveSettings(); sync(); onSettingChanged(key);
    }));
    sync();
  });

  const numField = (id, key, min, max) => {
    const el = $(id);
    el.value = settings[key];
    el.addEventListener('change', () => {
      settings[key] = clamp(parseInt(el.value, 10) || DEFAULTS[key], min, max);
      el.value = settings[key];
      saveSettings(); onSettingChanged(key);
    });
  };
  numField('#maxLevel', 'maxLevel', 2, 99);
  numField('#gaugeMax', 'gaugeMax', 10, 120);

  const wake = $('#wake');
  wake.checked = settings.wake;
  wake.addEventListener('change', () => { settings.wake = wake.checked; saveSettings(); requestWake(); });

  const demo = $('#demo');
  demo.checked = settings.demo;
  demo.addEventListener('change', () => {
    settings.demo = demo.checked;
    saveSettings();
    if (settings.demo) startDemo(); else stopDemo();
    refreshChip();
    toast(settings.demo ? 'Demo-Modus an' : 'Demo-Modus aus');
  });

  $('#resetTrip').addEventListener('click', () => { state.trip = 0; state.moving = 0; state.max = 0; updateStats(); toast('Fahrt zurückgesetzt'); });
}

function onSettingChanged(key) {
  if (key === 'unit') { $('#speedUnit').textContent = unitLabel(); buildGauge(); lastNum = -1; }
  if (key === 'gaugeMax') buildGauge();
  if (key === 'maxLevel') { settings.level = clamp(settings.level, 1, settings.maxLevel); saveSettings(); renderLevel(); }
  if (key === 'levelKind') renderLevel();
  if (key === 'source' && settings.source !== 'scooter') startGps();
  updateBadge();
}

/* Display anlassen */
let wakeLock = null;
async function requestWake() {
  try {
    if (!settings.wake) { if (wakeLock) await wakeLock.release(); wakeLock = null; return; }
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* nicht unterstützt */ }
}

/* =====================================================================
   Start
   ===================================================================== */
function init() {
  $('#ver').textContent = 'v' + APP_VERSION;
  buildSwatches();
  applyTheme();
  buildGauge();
  $('#speedUnit').textContent = unitLabel();

  // Navigation
  $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  $('#connChip').addEventListener('click', () => {
    if (ble.connected) showView('ble');
    else bleConnect();
  });

  // Regler
  $('#level').addEventListener('input', (e) => setLevel(+e.target.value));
  $('#lvlMinus').addEventListener('click', () => setLevel(settings.level - 1));
  $('#lvlPlus').addEventListener('click', () => setLevel(settings.level + 1));
  $('#zeroStart').addEventListener('change', (e) => {
    settings.zeroStart = e.target.checked;
    saveSettings();
    sendToScooter('zero', settings.zeroStart);
  });
  settings.level = clamp(settings.level, 1, settings.maxLevel);
  renderLevel();

  // GPS-Knopf
  $('#srcBadge').addEventListener('click', () => {
    if (state.gpsId == null) { startGps(); return; }
    const src = currentSource();
    if (!src || src.label === 'GPS') { stopGps(); toast('GPS-Tacho aus'); updateBadge(); }
  });
  if (settings.source !== 'scooter' && navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((r) => { if (r.state === 'granted') startGps(); }).catch(() => {});
  }

  // Bluetooth
  if (!navigator.bluetooth) $('#bleUnsupported').classList.remove('hidden');
  $('#bleConnect').addEventListener('click', bleConnect);
  $('#bleDisconnect').addEventListener('click', bleDisconnect);
  $('#bleReadAll').addEventListener('click', readAll);
  $('#bleSubAll').addEventListener('click', subscribeAll);
  $('#logClear').addEventListener('click', () => { logLines.length = 0; $('#bleLog').replaceChildren(); });
  $('#logCopy').addEventListener('click', () => copyOrShow(buildReport()));
  $('#logShare').addEventListener('click', async () => {
    const text = buildReport();
    if (navigator.share) {
      try { await navigator.share({ title: 'E-Roller Bluetooth-Bericht', text }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    await copyOrShow(text);
  });

  initSettings();
  initLock();
  if (settings.demo) startDemo();
  refreshChip();
  updateBanner();
  selfTest();
  checkForUpdate();

  requestWake();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { wakeLock = null; requestWake(); } });
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
})();
