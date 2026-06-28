# FAC Shack Dashboard

All-in-one ham radio station dashboard for **KJ5NUJ / EM50JI**.

Built with Electron + React + Vite + Tailwind CSS.

---

## Features

- **Rig Control** — frequency display, mode control, S-meter via rigctld (Hamlib)
- **CW Keyer** — WPM control, dit/dah buttons, 4 programmable messages via serial
- **GPS / Grid Square** — live Maidenhead grid from gpsd, 6-character display
- **Band Conditions** — HamQSL solar data, per-band Good/Fair/Poor indicators
- **QSO Log** — auto-watches SKCCLogger ADIF file, shows last 10 QSOs

---

## Prerequisites

### 1. Serial port access (dialout group)

```bash
sudo usermod -aG dialout $USER
# Log out and back in for this to take effect
```

### 2. Xiegu G106 USB driver (CH342)

The G106 uses a CH342 USB-to-serial chip. On Linux Mint / Ubuntu 22.04+ the
driver is usually already included. Verify:

```bash
lsmod | grep ch34
# Should show ch341 or similar
```

If not present, install from the manufacturer or use the kernel module:
```bash
sudo apt install linux-generic
```

### 3. rigctld — Hamlib rig daemon

Install Hamlib:
```bash
sudo apt install hamlib-utils
```

Start rigctld for the Xiegu G106 (Hamlib model 3085 = IC-7000 emulation):
```bash
rigctld -m 3085 -r /dev/ttyUSB0 -s 19200 -T 127.0.0.1 -t 4532
```

To run at startup, add to a systemd user unit or `/etc/rc.local`.

**Verify it works:**
```bash
rigctl -m 2 -r localhost:4532 f
# Should return current frequency
```

### 4. gpsd — GPS daemon

Install and configure gpsd:
```bash
sudo apt install gpsd gpsd-clients
```

Connect your GPS receiver (e.g., USB GPS puck) then:
```bash
sudo gpsd /dev/ttyUSB1 -F /var/run/gpsd.sock
# Adjust device path as needed
```

Test with:
```bash
gpsmon
# or
cgps -s
```

The dashboard connects to gpsd at `localhost:2947` (default).

---

## Development

```bash
# Clone / enter project directory
cd "HAM Dash"

# Install dependencies
npm install

# Run in development mode (hot-reload)
npm run dev
```

## Building the .deb Package

```bash
# Build production bundle
npm run build

# Package as .deb (requires electron-builder)
npm run dist:deb
```

The `.deb` file will be in `release/`. Install with:
```bash
sudo dpkg -i release/fac-shack-dashboard-*.deb
```

---

## Settings

Click **SETTINGS** in the header to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| rigctld Host | `localhost` | Hamlib daemon hostname |
| rigctld Port | `4532` | Hamlib daemon port |
| Keyer Port | `/dev/ttyUSB0` | Serial port for CW keyer |
| ADIF Log Path | `~/skcclogger/log.adi` | SKCCLogger ADIF file to watch |
| MSG1–MSG4 | (CQ/TU/etc.) | Programmable CW messages |

All settings persist between sessions via electron-store.

---

## Local HTTP API

The dashboard exposes a small read-only HTTP API on port **2600** for
constrained LAN clients such as an ESP32 propagation station display.
**No authentication** — LAN use only; do not expose this port to the internet.

### `GET /api/station-summary`

Returns a flat JSON object with short keys suitable for small-RAM clients.
Cached server-side for 5 minutes, so polling every 30–60 s is fine.

```bash
curl http://<machine-ip>:2600/api/station-summary
```

Example response:
```json
{
  "ts":        "2026-06-28T14:32:00.000Z",
  "band_cond": "GOOD",
  "muf":       24.8,
  "luf":        4.1,
  "sfi":       142,
  "kidx":        2,
  "best_band": "20m",
  "grid":      "EM50JI",
  "callsign":  "KJ5NUJ"
}
```

| Field       | Type            | Source                                   |
|-------------|-----------------|------------------------------------------|
| `ts`        | ISO-8601 string | Server clock at response build time      |
| `band_cond` | GOOD/FAIR/POOR  | Majority vote across 4 band groups, calibrated band-conditions algorithm |
| `muf`       | number (MHz)    | KC2G ionosonde MUF(3000) if available, else SFI formula |
| `luf`       | number (MHz)    | Estimated from SFI/K/X-ray and solar zenith |
| `sfi`       | integer         | NOAA `f107_cm_flux.json`, latest value   |
| `kidx`      | integer         | NOAA `planetary_k_index_1m.json`, latest |
| `best_band` | string          | Highest-rated band for current local time-of-day |
| `grid`      | string          | Station grid square (from Settings)      |
| `callsign`  | string          | Station callsign (from Settings)         |

`muf` and `luf` are `null` if no propagation data has loaded yet.

---

## IPC Architecture

```
Renderer (React UI)
    ↕ contextBridge (preload.js)
Electron Main Process
    ├── rigctl.js    → TCP → rigctld :4532
    ├── keyer.js     → Serial → /dev/ttyUSB0
    ├── gps.js       → TCP → gpsd :2947
    ├── adif-watcher.js → chokidar → ~/skcclogger/log.adi
    └── propagation.js  → HTTPS → hamqsl.com/solar.xml
```

## Rig Notes

- **Rig model**: Xiegu G106
- **Hamlib model**: 3085 (IC-7000 emulation)
- **CI-V address**: 0x70
- **Baud rate**: 19200
- **Connection**: USB via CH342 chip → /dev/ttyUSB0

The dashboard polls rigctld every 500ms for frequency, mode, and S-meter.
All hardware connections auto-retry every 5 seconds if disconnected.

---

*KJ5NUJ — EM50JI*
