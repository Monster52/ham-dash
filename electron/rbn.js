
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
  // North America — Eastern
  'W9KXQ':'EN52','K3WW':'FM29','WZ7I':'DM43',
  'AA4VV':'EM84','K4RUM':'EM72','KM3T':'FN42',
  'W1NT':'FN42','VE3EID':'FN03','N5J':'EM20',
  'KD9ST':'EN50','K1TTT':'FN32','W3OA':'FM19',
  'WA2CP':'FN30','K8AZ':'EN91','W4MYA':'FM07',
  'KD4D':'FM18','N4ZR':'FM19','W2NAF':'FN30',
  'WB2REM':'FN30','K2DSL':'FN20','W3LPL':'FM19',
  'AA1K':'FN31','KV4TT':'FK88','NP4A':'FK68',
  'WP3C':'FK68','KP3W':'FK68','N3HBX':'FM19',
  'WA7LNW':'DN31','K8UT':'EN82','W8WWV':'EN91',
  'N8BV':'EN80','K9IMM':'EN61','WB9LYH':'EN52',
  'K0BBC':'EN34','K0GW':'DN70','W0GJ':'DN70',
  'WA0KKG':'EN22','K5TR':'EM10','W5RU':'EM40',
  'N5XZ':'EM40','K5GN':'EM20','W5PR':'EM31',
  'AA5B':'EM40','W6YX':'CM87','K7CO':'DN70',
  'VE7CC':'CN89','N7TR':'DN31','K7ARJ':'DN21',
  'W7RN':'DM09','VE6JY':'DO33','VE6WZ':'DO33',
  'VE5MX':'DO43','VE3RCN':'FN03','VA7RR':'CN89',
  'VY2ZM':'FN76','VE9ML':'FN65','VO1FOG':'GN37',
  // North America — Caribbean/South
  'KP4BD':'FK68','WP4G':'FK68','HR2DMR':'EK43',
  // Europe — Western
  'OH6BG':'KP23','DK9IP':'JO31','DL9GTB':'JO50',
  'PA0O':'JO33','G4ZFE':'IO91','F5IN':'JN03',
  'SM2BYA':'KP05','LA5YJ':'JP99','OZ1HDF':'JO55',
  'OZ7IT':'JO65','EI7GL':'IO51','G3SED':'IO91',
  'G3YYD':'IO93','M0URX':'IO92','GM4SLV':'IO87',
  'GW4SSG':'IO81','GI3PDN':'IO74','PA3A':'JO21',
  'PA4TT':'JO22','PI4GN':'JO33','ON5KQ':'JO20',
  'LX1NO':'JN39','DL6RAI':'JN59','DJ9MH':'JN58',
  'DL8LAS':'JO52','DF7GB':'JN57','DL0LA':'JO64',
  'OE5RFP':'JN68','OE3GBB':'JN88','HB9DCO':'JN47',
  'HB9DRS':'JN37','F6IIT':'JN03','TM0HQ':'JN03',
  'EA5WU':'IM98','EA4KD':'IN80','EA8BFK':'IL18',
  'CT1BOL':'IM57','CT7ANO':'IM57',
  // Europe — Eastern
  'YO8CRA':'KN46','HA8TKS':'KN06','IK4VET':'JN54',
  'RN6BN':'LN05','UA4FER':'LO43','UA3TT':'KO85',
  'RK3IT':'KO85','R3LW':'KO85','UT5NX':'KN88',
  'UR5LX':'KN89','UX5UO':'KN88','LZ3CB':'KN32',
  'SV8CS':'KM07','SV3DHQ':'KM07','9A1CIG':'JN75',
  'S52AL':'JN76','S53WW':'JN75','YU1LA':'KN04',
  'YT7TBL':'KN04','OK2EQ':'JN89','OK1HRA':'JN69',
  'SP5GRM':'KO02','SP3GTS':'JO82','SP2HMR':'JO94',
  'SP9BRP':'KN09','OM3KII':'JN98','OM5M':'JN98',
  // Asia-Pacific
  'JH1YYE':'PM85','JA7QVI':'QM08','JH7CSU':'QM08',
  'VK4CT':'QG62','VK2GR':'QF56','VK3TDX':'QF22',
  'ZL2AFP':'RF70','ZL3X':'RE66',
  // South America
  'PY2WC':'GG66','LU5HTV':'GF05','CE3CT':'FF46',
  // Africa/Middle East
  'ZS4TX':'KG44','5B4AHJ':'KM64','4X1RF':'KM72',
};

// Fallback: derive approximate grid from callsign prefix when the exact
// callsign isn't in SKIMMER_GRIDS.  Tries 3-char, 2-char, 1-char prefixes.
const PREFIX_GRID = {
  // North America
  'W1':'FN42','K1':'FN42','N1':'FN42',
  'W2':'FN20','K2':'FN20','N2':'FN20',
  'W3':'FM19','K3':'FM19','N3':'FM19',
  'W4':'EM63','K4':'EM63','N4':'EM63',
  'W5':'EM20','K5':'EM20','N5':'EM20',
  'W6':'DM04','K6':'DM04','N6':'DM04',
  'W7':'DN31','K7':'DN31','N7':'DN31',
  'W8':'EN82','K8':'EN82','N8':'EN82',
  'W9':'EN52','K9':'EN52','N9':'EN52',
  'W0':'DN70','K0':'DN70','N0':'DN70',
  'AA':'FN20','AB':'FN20','AC':'EN34','AD':'DM79','AE':'FN20',
  'AF':'FN20','AG':'FN20','AI':'FN20','AJ':'FN20','AK':'DN70',
  'WA':'FN20','WB':'FN20','WC':'FN20','WD':'FN20','WE':'EN52',
  'WF':'EN52','WG':'EN52','WI':'EN52','WJ':'FN20','WK':'FN20',
  'WN':'FN20','WO':'EN52','WP':'FK68','WQ':'FN20','WR':'FN20',
  'WS':'FN20','WT':'EN52','WU':'FN20','WV':'EM63','WX':'DN31',
  'WY':'DN31','WZ':'DM43',
  'KA':'FN20','KB':'EN52','KC':'EN52','KD':'DM43','KE':'FM19',
  'KF':'FM19','KG':'FM19','KI':'EN52','KJ':'FM19','KK':'EN52',
  'KN':'FN20','KO':'EM63','KQ':'EN52','KR':'FM19','KS':'EN52',
  'KT':'EN52','KU':'DN31','KV':'EM63','KW':'DN31','KX':'EN52',
  'KY':'FM19','KZ':'EN52',
  // Canada
  'VE1':'FN74','VE2':'FN35','VE3':'FN03','VE4':'EN19',
  'VE5':'DO33','VE6':'DO20','VE7':'CN89','VE8':'CP47','VE9':'FN65',
  'VA':'FN25','VY':'FP62',
  // Europe — UK / Ireland
  'G':'IO91','M':'IO91','2E':'IO91','GW':'IO71','GM':'IO75',
  'GI':'IO74','GJ':'IN89','GU':'IN89','EI':'IO63',
  // Europe — Scandinavia
  'LA':'JP99','LB':'JP99','LC':'JP99','LD':'JP99','LE':'JP99',
  'LF':'JP99','LG':'JP99','LH':'JP99','LJ':'JP99',
  'SM':'JP70','SA':'JP70','SB':'JP70','SC':'JP70',
  'SD':'JP70','SE':'JP70','SF':'JP70','SG':'JP70','SH':'JP70',
  'SI':'JP70','SJ':'JP70','SK':'JP70','SL':'JP70',
  'OZ':'JO55','5P':'JO55',
  'OH':'KP20','OF':'KP20','OG':'KP20','OI':'KP20','OJ':'KP20',
  'ES':'KO29',
  'YL':'KO26','LY':'KO24',
  'TF':'HP94',
  // Europe — Germany / DACH
  'DL':'JO31','DJ':'JO31','DK':'JO31','DA':'JO31','DB':'JO31',
  'DC':'JO31','DD':'JO31','DE':'JO31','DF':'JN49','DG':'JO31',
  'DH':'JO31','DI':'JO31','DM':'JO31','DN':'JO31','DO':'JO31',
  'DP':'JO31','DQ':'JO31','DR':'JO31',
  'OE':'JN77','HB':'JN47',
  // Europe — France / Iberia
  'F':'JN03','TM':'JN03',
  'EA':'IM68','EB':'IM68','EC':'IM68','ED':'IM68',
  'CT':'IM58',
  // Europe — BeNeLux
  'PA':'JO22','PB':'JO22','PC':'JO22','PD':'JO22','PE':'JO22',
  'PF':'JO22','PG':'JO22','PH':'JO22','PI':'JO22',
  'ON':'JO20',
  // Europe — Italy
  'I':'JN45','IK':'JN45','IW':'JN45','IZ':'JN45','II':'JN45',
  'IT':'JM67',
  // Europe — Eastern
  'HA':'JN97','HG':'JN97',
  'OK':'JO70','OL':'JO70','OM':'JN98',
  'SP':'KO02','SN':'KO02','SO':'KO02','SQ':'KO02','SR':'KO02',
  'S5':'JN76',
  'YO':'KN46','YP':'KN46','YQ':'KN46','YR':'KN46',
  'LZ':'KN22',
  'SV':'KM18','J4':'KM18',
  // Europe — Balkans / former Soviet
  'UT':'KO50','UR':'KO50','US':'KO50','UV':'KO50','UW':'KO50',
  'EM':'KO50','EN':'KO50','EO':'KO50',
  'RA':'KO85','RN':'KO85','RK':'KO85','RU':'KO85','RV':'KO85',
  'UA':'KO85','RW':'KO85','RX':'KO85','RY':'KO85','RZ':'KO85',
  'R9':'MP40','R0':'OP62',
  // Asia / Pacific
  'JA':'PM86','JH':'PM86','JI':'PM86','JJ':'PM86','JK':'PM86',
  'JL':'PM86','JM':'PM86','JN':'PM86','JO':'PM86',
  'HL':'PM37','DS':'PM37',
  'VK':'QF22','VK2':'QF56','VK3':'QF22','VK4':'QG62',
  'ZL':'RF70',
  // South America
  'PY':'GG87','PP':'GG87','PQ':'GG87','PR':'GG87','PS':'GG87',
  'PT':'GG87','PU':'GG87','PV':'GG87','PW':'GG87','PX':'GG87',
  'LU':'GF05','LW':'GF05',
  // Africa / Middle East
  'ZS':'KG33','ZR':'KG33','ZT':'KG33','ZU':'KG33',
  'EA8':'IL18',
};

function prefixToGrid(call) {
  if (!call) return null;
  const c = call.toUpperCase().replace(/[-/].*$/, ''); // strip -2, /P, etc.
  for (let len = 3; len >= 1; len--) {
    const g = PREFIX_GRID[c.slice(0, len)];
    if (g) return g;
  }
  return null;
}

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
    spotter_grid: SKIMMER_GRIDS[spotter] || prefixToGrid(spotter) || null,
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
