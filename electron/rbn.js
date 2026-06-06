
import net from 'net';
import { ipcMain, app } from 'electron';

const HOST = 'telnet.reversebeacon.net';
const PORT = 7000;
const CALLSIGN = 'KJ5NUJ';
const MAX_SPOTS = 50;
const WINDOW_MIN = 720;
const RECONNECT_DELAY_MS = 30000;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

const SKIMMER_GRIDS = {
  // --- North America: New England / Mid-Atlantic ---
  'K1RA':'FM18',   'K1RA-4':'FM18',
  'K3GMQ':'FN20',
  'K3PA':'EM29',   'K3PA-1':'EM29',  'K3PA-2':'EM29',
  'K3WW':'FM29',
  'KD2OGR':'FN20',
  'KM3T':'FN42',   'KM3T-2':'FN42', 'KM3T-3':'FN42', 'KM3T-5':'FN42',
  'N2CR':'FN20',   'N2YCH':'FN30',
  'NN3RP':'FM18',
  'VE3EID':'FN03',
  'W1NT':'FN42',   'W1NT-2':'FN42', 'W1NT-6':'FN42',
  'W2MV':'FN31',   'W2NNN':'FN20',
  'W3LPL':'FM19',  'W3RGA':'FN10',  'W3UA':'FN42',
  'WC2L':'FN32',   'WS2C':'FM29',   'WS3W':'FM19',
  'WW1L':'FN54',
  // --- North America: Southeast ---
  'AA0O':'EL87',   'AA4PA':'EM55',  'AA4VV':'EM84',
  'K4PP':'EM64',   'K4RUM':'EM72',
  'KC4YVA':'FM17', 'KO4BHX':'FM06',
  'N9RU':'EM57',   'NU4F':'EL96',
  'W3OA':'EM95',   'W4KAZ':'FM05',
  // --- North America: Midwest / Great Lakes ---
  'AC0C':'EM28',   'AC0C-1':'EM28',
  'KD9ST':'EN50',
  'K9IMM':'EN53',  'K9LC':'EN52',
  'N8DXE':'EN91',  'N9CO':'EN51',
  'W8WTS':'EN91',  'W9KXQ':'EN52',
  'WC8GOP':'EN72', 'WE9V':'EN52',   'WF8Z':'EM79',
  'WT8P':'CN97',   'WT9U':'EN71',
  // --- North America: South / South-Central ---
  'K5EM':'EM20',   'K5TR':'EM10',
  'N5J':'EM20',    'N5RZ':'EM00',
  'WX7V':'EM12',
  // --- North America: West ---
  'AK6RI':'CM87',  'AK6RI-1':'CM87',
  'K6FOD':'DM04',
  'K7CO':'DN41',
  'K7EK':'EM77',   'K7RUT':'CN87',
  'KW7MM':'DM43',  'KW7MM-2':'DM43', 'KW7MM-3':'DM43',
  'N6TV':'CM97',
  'N7TUG':'CN87',  'N7VVX':'DN40',
  'ND7K':'DM13',   'NG7M':'DN31',
  'W6YX':'CM87',   'WA7LNW':'DN31', 'WZ7I':'DM43',
  // --- Canada ---
  'VE6AO':'DO20',  'VE6JY':'DO33',
  'VE6WZ':'DO33',  'VE6WZ-2':'DO33','VE6WZ-3':'DO33',
  'VE7CC':'CN89',
  // --- Hawaii ---
  'KH6LC':'BK29',
  // --- Europe: UK & Ireland ---
  'EI4HQ':'IO51',
  'G0KTN':'IO92',  'G4IRN':'IO82',  'G4KCM':'IO91',  'G4ZFE':'IO91',
  'GI4DOH':'IO74', 'M1GEO':'IO92',
  // --- Europe: Scandinavia & Iceland ---
  'ES2RR':'KO29',
  'LB9KJ':'JP54',  'LB9KJ-1':'JP54','LB9KJ-2':'JP54',
  'OH4KA':'KP31',  'OH6BG':'KP23',
  'OZ1AAB':'JO65',
  'SM2BYA':'KP05', 'SM7IUN':'JO65',
  'TF3Y':'HP94',
  // --- Europe: Germany / Austria / Switzerland ---
  'DC8YZ':'JO31',
  'DF7GB':'JN49',
  'DK0TE':'JN47',
  'DK3UA':'JO64',  'DK3WW':'JO62',
  'DK8NE':'JO50',  'DK8NE/0':'JO50',
  'DK9IP':'JN48',  'DK9IP-1':'JN48',
  'DL0LA':'JN68',
  'DL1HWS':'JO51', 'DL1HWS-3':'JO51','DL1HWS-4':'JO51',
  'DL5RCN':'JN68', 'DL5RMH':'JN68',
  'DL8LAS':'JO54', 'DL8LAS-1':'JO54',
  'DL8TG':'JO52',  'DL9GTB':'JO50',
  'DO4DXA':'JN58', 'DR4W':'JN59',   'DR5X':'JO54',
  'HB9BXE':'JN47', 'HB9DCO':'JN37', 'HB9YC':'JN46',
  'OE3KLU':'JN88', 'OE9GHV':'JN47',
  // --- Europe: France / Iberia ---
  'CT1EYQ':'IN53',
  'EA1DAV':'IN53',  'EA2CW':'IN83',  'EA5WU':'IM99',
  'F4GOU':'JN05',  'F5AHD':'JN37',  'F5IN':'JN03',
  'F6IIT':'JN06',  'F8DGY':'JN18',
  // --- Europe: BeNeLux ---
  'ON6ZQ':'JO20',
  'PA0O':'JO33',   'PA5KT':'JO11',  'PA5KT-4':'JO11',
  'PA5WT':'JO22',  'PE5TT':'JO21',  'PI4CC':'JO21',
  // --- Europe: Italy / Mediterranean ---
  'IK3STG':'JN55', 'IK4VET':'JN54', 'IK6HIR':'JN63',
  'IK7YTT':'JN81', 'IQ9RG':'JM76',
  'IT9GSF':'JM67',
  'IZ2CPS':'JN45', 'IZ8EYP':'JM88',
  // --- Europe: Eastern / Balkans ---
  'HA8TKS':'KN06',
  'LZ3CB':'KN32',  'LZ4AE':'KN13',  'LZ4UX':'KN23',
  'OK1FCJ':'JO70', 'OK1HRA':'JO60',
  'S53WW':'JN76',  'S58W':'JN76',
  'SP5GQ':'KO02',  'SQ5J':'KO02',
  'SV1CDN':'KM17',
  'UT5R':'KO51',   'UY2RA':'KO51',
  'YO2CK':'KN15',  'YO2KAR':'KN15', 'YO5LD':'KN17',  'YO8CRA':'KN46',
  // --- Europe: Russia / Ukraine ---
  'R4NCU':'LO48',
  'RK3TD':'LO26',  'RK3TD-2':'LO26',
  'RN4WA':'LO66',  'RN6BN':'LN05',  'UA4FER':'LO43',
  // --- Pacific / DX ---
  'JH1YYE':'PM85',
  'VK4CT':'QG62',
  'ZL2AFP':'RF70', 'ZL4YL':'RF80',
  'PY2WC':'GG66',
};

// DX de SPOTTER: FREQ  DX  MODE  SNR dB [SPEED WPM]
const DX_RE = /^DX de (\S+):\s+([\d.]+)\s+(\S+)\s+(\S+)\s+([+-]?\d+)\s+dB(?:\s+(\d+)\s+WPM)?/;

let spots = [];
let spotIdCounter = 0;
let socket = null;
let reconnectTimer = null;
let mainWindowRef = null;
let quitting = false;

function getBand(freqMhz) {
  if (freqMhz >= 1.8   && freqMhz < 3.5)   return '160m';
  if (freqMhz >= 3.5   && freqMhz < 7.0)   return '80m';
  if (freqMhz >= 7.0   && freqMhz < 10.1)  return '40m';
  if (freqMhz >= 10.1  && freqMhz < 14.0)  return '30m';
  if (freqMhz >= 14.0  && freqMhz < 18.068) return '20m';
  if (freqMhz >= 18.068 && freqMhz < 21.0) return '17m';
  if (freqMhz >= 21.0  && freqMhz < 24.89) return '15m';
  if (freqMhz >= 24.89 && freqMhz < 28.0)  return '12m';
  if (freqMhz >= 28.0  && freqMhz < 50.0)  return '10m';
  return 'other';
}

function pruneSpots() {
  const cutoff = Date.now() - WINDOW_MIN * 60 * 1000;
  spots = spots.filter(s => s.timestamp >= cutoff).slice(0, MAX_SPOTS);
}

function updateAges() {
  const now = Date.now();
  spots.forEach(s => { s.age_min = Math.floor((now - s.timestamp) / 60000); });
}

function isDuplicate(spotter, freqMhz) {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  return spots.some(s => s.spotter === spotter && s.freq_mhz === freqMhz && s.timestamp >= cutoff);
}

function parseLine(line) {
  const m = DX_RE.exec(line);
  if (!m) return;

  const [, rawSpotter, freqStr, dx, mode, snrStr, wpmStr] = m;
  if (dx !== CALLSIGN) return;

  const spotter = rawSpotter.replace(/:$/, '');
  const freqMhz = parseFloat(freqStr) / 1000;

  if (isDuplicate(spotter, freqMhz)) return;

  const spot = {
    id: ++spotIdCounter,
    spotter,
    spotter_grid: SKIMMER_GRIDS[spotter] || null,
    freq_mhz: freqMhz,
    band: getBand(freqMhz),
    mode,
    snr_db: parseInt(snrStr, 10),
    speed_wpm: wpmStr ? parseInt(wpmStr, 10) : null,
    timestamp: Date.now(),
    age_min: 0,
  };

  spots.unshift(spot);
  pruneSpots();

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    updateAges();
    mainWindowRef.webContents.send('rbn:spots', spots);
  }
}

function connect() {
  if (quitting) return;

  socket = new net.Socket();
  let buffer = '';

  socket.connect(PORT, HOST, () => {
    console.log('[RBN] Connected to', HOST + ':' + PORT);
    socket.write(CALLSIGN + '\r\n');
  });

  socket.on('data', chunk => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      parseLine(line.trim());
    }
  });

  socket.on('close', () => {
    console.log('[RBN] Connection closed');
    scheduleReconnect();
  });

  socket.on('error', err => {
    console.error('[RBN] Socket error:', err.message);
    socket.destroy();
  });
}

function scheduleReconnect() {
  if (quitting || reconnectTimer) return;
  console.log('[RBN] Reconnecting in', RECONNECT_DELAY_MS / 1000 + 's');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

function getFilteredSpots() {
  pruneSpots();
  updateAges();
  return spots;
}

function initRBN(mainWindow) {
  mainWindowRef = mainWindow;

  ipcMain.handle('rbn:get', () => getFilteredSpots());

  ipcMain.handle('rbn:refresh', () => {
    const current = getFilteredSpots();
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('rbn:spots', current);
    }
    return current;
  });

  connect();

  app.on('before-quit', () => {
    quitting = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.destroy();
      socket = null;
    }
  });
}

function getRBNSpots() {
  return getFilteredSpots();
}

export { initRBN, getRBNSpots };
