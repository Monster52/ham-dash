import https from 'https';
import { ipcMain, app } from 'electron';

const SPOT_URL = 'https://api.pota.app/spot/activator';
const PARK_URL_BASE = 'https://api.pota.app/park/';
const POLL_INTERVAL_MS = 120 * 1000;

let cachedSpots = [];
let parkCoords = {};
const pendingParkFetches = new Set();
let pollTimer = null;
let mainWindowRef = null;

function getBand(freqKhz) {
  const f = parseFloat(freqKhz);
  if (f >= 7000 && f <= 7300)   return '40m';
  if (f >= 21000 && f <= 21450) return '15m';
  if (f >= 28000 && f <= 29700) return '10m';
  return null;
}

function normalizeMode(mode) {
  if (!mode) return '';
  const m = mode.toUpperCase().trim();
  if (m === 'USB' || m === 'LSB') return 'SSB';
  return m;
}

function isWanted(band, mode) {
  if (band === '40m' && mode === 'CW')  return true;
  if (band === '15m' && mode === 'CW')  return true;
  if (band === '10m' && mode === 'CW')  return true;
  if (band === '10m' && mode === 'SSB') return true;
  return false;
}

function minutesSince(spotTime) {
  if (!spotTime) return 0;
  // POTA API returns Eastern Time without TZ indicator — parse as ET (-05:00)
  const t = new Date(spotTime + '-05:00');
  if (isNaN(t.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

async function fetchParkCoords(reference) {
  if (parkCoords[reference] || pendingParkFetches.has(reference)) return;
  pendingParkFetches.add(reference);
  try {
    const { status, body } = await httpGet(PARK_URL_BASE + reference);
    if (status === 200) {
      const d = JSON.parse(body);
      if (d.latitude && d.longitude) {
        parkCoords[reference] = {
          lat: parseFloat(d.latitude),
          lon: parseFloat(d.longitude),
          name: d.name || reference,
        };
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.webContents.send('pota:spots', getSpotsWithCoords());
        }
      }
    }
  } catch {
    // silent — retry on next poll cycle
  } finally {
    pendingParkFetches.delete(reference);
  }
}

function getSpotsWithCoords() {
  return cachedSpots.map(s => ({
    ...s,
    age_min: minutesSince(s.spotTime),
    park_lat: parkCoords[s.reference]?.lat ?? null,
    park_lon: parkCoords[s.reference]?.lon ?? null,
    park_name_full: parkCoords[s.reference]?.name ?? s.parkName,
  }));
}

async function fetchSpots() {
  try {
    const { status, body } = await httpGet(SPOT_URL);
    if (status !== 200) {
      console.warn('[POTA] HTTP', status);
      return;
    }
    const data = JSON.parse(body);
    if (!Array.isArray(data)) return;

    const spots = [];
    for (const spot of data) {
      const band = getBand(spot.frequency);
      if (!band) continue;
      const rawMode = (spot.mode || '').toUpperCase().trim();
      if (['FT8', 'FT4', 'RTTY', 'AM', 'FM'].includes(rawMode)) continue;
      const mode = normalizeMode(rawMode);
      if (!isWanted(band, mode)) continue;

      const freqMhz = parseFloat(spot.frequency) / 1000;
      spots.push({
        id: spot.spotId,
        activator: spot.activator,
        freq_mhz: freqMhz,
        freq_hz: Math.round(freqMhz * 1000000),
        band,
        mode,
        reference: spot.reference,
        parkName: spot.parkName || '',
        locationDesc: spot.locationDesc || '',
        spotTime: spot.spotTime,
        spotter: spot.spotter || '',
        comments: spot.comments || '',
        age_min: minutesSince(spot.spotTime),
      });
    }

    cachedSpots = spots;
    console.log(`[POTA] ${spots.length} spots (40/15/10m CW+SSB)`);

    const refs = [...new Set(spots.map(s => s.reference))];
    for (const ref of refs) {
      fetchParkCoords(ref);
    }

    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('pota:spots', getSpotsWithCoords());
    }
  } catch (e) {
    console.error('[POTA] fetch error:', e.message);
  }
}

function getCachedSpots() {
  return getSpotsWithCoords();
}

function initPOTA(mainWindow) {
  mainWindowRef = mainWindow;

  ipcMain.handle('pota:get', () => getCachedSpots());
  ipcMain.handle('pota:refresh', async () => {
    await fetchSpots();
    return getCachedSpots();
  });

  fetchSpots();
  pollTimer = setInterval(fetchSpots, POLL_INTERVAL_MS);

  app.on('before-quit', () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });
}

function getPOTASpots() {
  return getCachedSpots();
}

export function getPOTABandCounts() {
  const counts = { '40m': 0, '20m': 0, '15m': 0, '10m': 0 }
  for (const spot of cachedSpots) {
    const age = minutesSince(spot.spotTime)
    if (age <= 30 && spot.mode === 'CW' && counts[spot.band] !== undefined) {
      counts[spot.band]++
    }
  }
  return counts
}

export { initPOTA, getPOTASpots };
