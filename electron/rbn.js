
import net from 'net';
import { ipcMain, app } from 'electron';
import { getPOTABandCounts } from './pota.js';

const HOST = 'telnet.reversebeacon.net';
const PORT = 7000;
const CALLSIGN = 'KJ5NUJ';
const MAX_SPOTS = 50;
const WINDOW_MIN = 720;
const RECONNECT_DELAY_MS = 30000;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

const SKIMMER_GRIDS = {
  'VK2RH':'QF56', 'K3GMQ':'FN20', 'K6FOD':'DM04', 'TF3Y':'HP94',
  'N7TUG':'CN87', 'WF8Z':'EM79', 'ND7K':'DM34', 'AK6RI-1':'CM87',
  'K5EM':'CN87', 'K9IMM':'EN52', 'WX7V/5':'EM12', 'ET3AA':'KJ99',
  'E28AC':'OK01', 'WC2L':'FN32', 'NH6HI':'BL01', 'W4KAZ':'FM05',
  'W1NT-2':'FN42', 'G4KCM':'IO91', 'YO5LD':'KN05', 'VE4DRK':'EN19',
  'PA5WT':'JO22', 'OK4YL':'JN99', 'LB9KJ-1':'JO29', 'DK0TE':'JN47',
  'OH4KA':'KP20', 'WZ7I':'FN20', 'LZ3CB':'KN32', 'W2NNN':'FN20',
  '9M2CNC':'OJ03', 'DK3WW':'JO62', 'SQ5J':'KO02', '3B8GL':'LG89',
  'VK6ANC':'OF78', 'OZ1AAB':'JO65', 'WS2C':'FM29', 'K7EK':'EM77',
  'W6DVN':'DM04', 'BG2TFW':'PN11', 'ES2RR':'KO29', 'DR4W':'JN59',
  '5Z4GO':'KI96', 'VU2OY':'MJ88', 'YO2CK':'KN15', 'BH4XDZ':'OM94',
  'W3LPL':'FM19', 'WB6BEE':'FM17', 'JJ2VLY':'PM95', 'AA4PA':'EM55',
  'W3UA':'FN42', 'YO2KAR':'KN15', 'VE6WZ-3':'DO21', 'KM3T-5':'FN42',
  'EA5WU':'IM99', 'LU8XW':'FD55', 'BH4RXP':'OM91', 'G4ZFE':'IO91',
  'BD4UNT':'OM92', 'S50U':'JN66', 'ZF9CW':'FK09', 'SP5GQ':'KO02',
  'KM3T-3':'FN42', 'JA1JRS':'PM95', 'DK2GOX':'JN49', 'EI4HQ':'IO51',
  'RK3TD':'LO16', 'HS0ZGZ':'OK16', 'N0CALL':'IO92', 'N9CO':'EN52',
  'WC8GOP':'EN72', 'G0KTN':'IO81', 'VU2TUM':'ML88', 'W1NT-6':'FN42',
  'LZ4AE':'KN13', 'OK1HRA':'JO60', 'RK3TD-2':'LO26', 'N2YCH':'FN31',
  'K3PA-1':'EM29', 'MM9PSY':'IO86', 'W8WWV':'EN91', 'PT2FHC':'GH64',
  'DK9DA':'JO33', 'DL0LA':'JN68', 'KM3T-1':'FN42', 'K1RA':'FM18',
  'DC8YZ':'JN59', 'K1RA-4':'FM18', 'R4NCU':'LO48', 'VK3RASA':'QF21',
  'VE6WZ-1':'DO21', 'HB9EMP':'JN47', 'SZ1A':'KM08', 'K7CO':'DN40',
  'DM5GG':'JO61', 'ON6ZQ':'JO20', 'NU4F':'EL96', 'HB9BXE':'JN47',
  'PY2PE':'GG66', 'DK3UA':'JO64', 'DK9IP-1':'JN48', 'N2EPE':'FN13',
  'DK9IP':'JN48', 'NA3M':'FM19', 'V51YJ':'JG87', 'OH0K/6':'KP03',
  'BG4GOV':'PM00', 'SM1HEV':'JO97', 'ZL4YL':'RF80', 'IK7YTT':'JN81',
  'TA3ETT':'KN40', 'PA5KT-4':'JO11', 'LZ4UX':'KN23', 'PY2KNK':'GG56',
  'BH4RRG0':'OM92', 'WT9U':'EN71', 'LZ5DI':'KN12', 'SM7IUN':'JO65',
  'EY8ZE':'MM48', 'HA2NA':'JN97', 'DL8LAS-3':'JO54', 'W6YX':'CM87',
  'IU3PMA':'JN64', 'CT1EYQ':'IM58', 'N9RU':'EM57', 'KH6LC':'BK29',
  'JO1YYP':'PM95', 'IZ2CPS':'JN45', 'WW1L':'FN54', 'ZL3X':'RE66',
  'N6TV':'CM97', 'W3RGA':'FN10', 'DL8LAS':'JO54', 'IW9GDC':'JM78',
  'ZF1A':'EK99', 'GM0UDL':'IO77', 'W8WTS':'EN91', 'JE1AEX-1':'PM95',
  'F4VVG':'JN48', 'K9LC':'EN52', 'IQ9RG':'JM76', 'KD2OGR':'FN20',
  'DE1LON':'JO31', 'N7VVX':'DN40', 'DP5G':'JO30', 'JN1ILK':'PM95',
  'DO4DXA':'JN58', 'DK8NE/0':'JO50', 'KC4YVA':'FM17', 'DK8NE':'JO50',
  'K4PP':'EM64', 'JA1CCA':'PM95', 'HB9DCO':'JN37', 'EA2RCF-4':'IN82',
  'VE6WZ-2':'DO21', 'PI4CC':'JO21', 'UY2RA':'KO51', 'NN3RP':'FM18',
  'G4YBU':'IO91', 'VE6JY':'DO33', 'CX6VM':'GF27', 'NG7M':'DN31',
  'JE1AEX-2':'PM95', 'EA4RKC':'IM69', 'AC0C-1':'EM28', 'WA7LNW':'DM37',
  'TI7W':'EK70', 'IK4VET':'JN54', 'VE6WZ':'DO21', 'G4IRN':'IO82',
  'UT5R':'KO51', 'M1GEO':'JO02', 'NA3M 2':'FM19', 'W2MV':'FN31',
  'OE3KLU':'JN88', 'JI1HFJ':'PM95', 'WS3W':'FM19', 'OZ1BZS':'JO46',
  'VE7CC':'CN89', 'SE5E':'JO89', 'ZS1NN':'JF96', 'DF7GB':'JN49',
  'DL1HWS-3':'JO61', 'PD2RPS':'JO22', 'DL1HWS':'JO61', 'LZ7AA':'KN12',
  'DL8LAS-1':'JO54', 'IK3STG':'JN55', 'BI7JMD':'OL63', 'SV1CDN':'KM17',
  'KE3BK':'CM97', 'OH6BG':'KP03', 'PE5TT':'JO21', 'ZL2KS':'RE68',
  'HA1VHF':'JN87', 'S53WW':'JN76', 'F4GOU':'JN05', 'N2CR':'FN20',
  'JH7CSU1':'PM95', 'AA0O':'EL87', 'OK2RZ':'JN99', 'W3OA':'EM95',
  'DM6EE':'JO52', 'WE9V':'EN52', 'BH4RRG':'OM92', 'K5TR':'EM00',
  'RL3A':'KO75', 'BD7JNA':'OL63', 'KD7EFG':'DN31', 'ES5PC':'KO38',
  'S54L':'JN75', 'VU2PTT':'MK82', 'DL5RCN':'JN68', 'IT9GSF':'JM67',
  'HG8A':'JN96', 'PA8MM':'JO22', 'BD8CS':'OM30', 'GE0FRE':'IO82',
  'IZ8EYP':'JM88', 'RU9CZD':'MO07', 'S53A':'JN75', 'VK3VB':'QF21',
  'OK1FCJ':'JO70', 'EA1DAV':'IN53', 'GI4DOH':'IO74', 'JK1QLQ':'PM96',
  'JE2YCR':'PM84', 'KO4BHX':'FM06', 'GX0FRE':'IO82', 'KM3T-2':'FN42',
  'UA4CC':'LO31', 'F6IIT':'JN06', 'BA6KC':'OM65', 'OH8KA':'KP25',
  'DL1HWS-4':'JO61', 'IK6HIR':'JN63', 'BI4MPH':'PM07', 'JH4UTP':'PM64',
  'VK2GEL':'QF55', 'F5AHD':'JN37', 'N6RUN':'CM97', 'JM8SMO':'QN13',
  'S58W':'JN65', 'OE9GHV':'JN47', 'HB9GVO':'JN46', 'LY3G':'KO05',
  'G0TMX':'JO02', 'KW7MM-3':'DM42', 'KW7MM-2':'DM42', 'KW7MM':'DM42',
  'HA8TKS':'JN96', 'HA8TKS-2':'JN96', 'DL1GME':'JN49', 'VU2CPL-2':'MK83',
  'VU2CPL-1':'MK83', 'LY2XW':'KO25', 'EU8RO':'KO52', 'KK4HHP':'FM18',
  'VE3EID':'FN05', 'DL8TG':'JO52', 'BH4HKZ':'PM01', 'G4HDS':'IO85',
  'DJ3AK':'JO52', 'F8DGY':'JN18', 'VU2CPL-4':'MK83', 'BG0AJO/0':'NN33',
  'WQ2H':'FN32', 'MM0ZBH':'IO86', 'K1JFJ':'FM08', 'VU2CPL-3':'MK83',
  'W2NAF':'FN21', 'F4BPO':'JN36', 'KB5NJD':'EM12', 'LB9KJ':'JO29',
  'LZ2HQ':'KN12', 'EA2CW':'IN83', 'LB9KJ-3':'JO29', 'N5RZ':'EM00',
  'G3YPP':'JO02', 'W3DAN':'EN91', 'N8DXE':'EN91', 'WT8P':'CN87',
  'LB9KJ-2':'JO29', 'F6KGL':'JN18', 'SP8R':'KO10', 'N4HAC':'FM08',
  'DM6CS':'JN58', 'HB9YC-SDR':'JN46', 'KB9HV':'EN43', 'LA6TPA':'JP54',
  'RN4WA':'LO66', 'DL3OBQ':'JN57', 'K7RUT':'CN87', 'VU22DX':'MK65',
  'GM0UDL-1':'IO77', 'K3PA-2':'EM29', 'LU6KK':'FG75', 'N0OI':'DM13',
  'EA8/DF4UE':'IL38', 'KD2M':'EL87', 'DR5X':'JO54', 'VE6AO':'DO31',
  'SM0ECF':'JO89', 'DL5RMH':'JN68', 'DD0VS':'JN59', 'JQ1BVI':'PM95',
  '3D2AG':'RH91', 'DL8LAS-2':'JO54', 'VU2CPL':'MK83', 'HA7GN':'JN97',
  'DF4UE':'IL38', 'EA8-DF4UE':'IL38', 'CX7ACH':'GF15', 'PR1T':'GG87',
  'UR6EA':'KN68', 'PC5Q':'JO22', 'NX5M':'EM10', 'KF8I':'EN70',
  'OG66X':'KP24', 'HA5PP':'JN97', 'HA5E':'JN97', 'EU1ST':'KO33',
  'EA/VE3NZ':'IM76', 'F8DGY-1':'JN18', 'F1EYG':'JN18', 'KE6X':'CM87',
  'BI4UYX':'VJ91', 'VR2FUN-77':'OL62', 'BH4RRG01':'OM92', 'W4AX':'EM74',
  'HA5PP-3':'JN86', 'M9SJM':'IO92', 'DL1AMQ':'JO50', 'HA5PP-2':'JN86',
  'M9PSY':'IO86', 'KO7SS':'DM42', 'W3RGA-1':'FN10', 'DF2JP':'JO31',
  'DD5XX':'JN48', 'W8NJH':'EN81', 'DL6NDW-1':'JN58', 'KL2R':'BP64',
  'JG1DLY':'QM05', 'LA7GIA':'JO59', 'DE2SAX':'JN48', 'HG0Y':'JN97',
  'UA4M':'LO44', 'KP3CW':'FK68', 'F5UTN':'JN08', 'DL6NDW':'JN58',
  'G1VWC':'IO92', 'G3BJ':'IO82'
};

// Fallback: derive approximate grid from callsign prefix when the exact
// callsign isn't in SKIMMER_GRIDS.  Tries 3-char, 2-char, 1-char prefixes.
const PREFIX_GRID = {
  // North America
  'W1':'FN42','K1':'FN42','N1':'FN42',
  'W2':'FN20','K2':'FN20','N2':'FN20',
  'W3':'FM19','K3':'FM19','N3':'FM19',
  'W4':'EM74','K4':'EM74','N4':'EM74',
  'W5':'EM20','K5':'EM20','N5':'EM20',
  'W6':'DM04','K6':'DM04','N6':'DM04',
  'W7':'DN31','K7':'DN31','N7':'DN31',
  'W8':'EN82','K8':'EN82','N8':'EN82',
  'W9':'EN52','K9':'EN52','N9':'EN52',
  'W0':'EN34','K0':'EN34','N0':'EN34',
  'AA':'FN20','AB':'FN20','AC':'EN34','AD':'DM79','AE':'FN20',
  'AF':'FN20','AG':'FN20','AI':'FN20','AJ':'FN20','AK':'DN70',
  // A-prefix district overrides (3-char beats 2-char in lookup)
  'AA0':'EN34','AB0':'EN34','AC0':'EN34',
  'AA1':'FN42','AB1':'FN42','AC1':'FN42',
  'AA2':'FN20','AB2':'FN20','AC2':'FN20',
  'AA3':'FM19','AB3':'FM19','AC3':'FM19',
  'AA4':'EM74','AB4':'EM74','AC4':'EM74',
  'AA5':'EM20','AB5':'EM20','AC5':'EM20',
  'AA6':'DM04','AB6':'DM04','AC6':'DM04',
  'AA7':'DN31','AB7':'DN31','AC7':'DN31',
  'AA8':'EN82','AB8':'EN82','AC8':'EN82',
  'AA9':'EN52','AB9':'EN52','AC9':'EN52',
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

const ACTIVITY_BANDS = ['40m', '20m', '15m', '10m'];
const ACTIVITY_WINDOW_MS = 30 * 60 * 1000;

let bandActivity = {
  '40m': new Map(),
  '20m': new Map(),
  '15m': new Map(),
  '10m': new Map(),
};

const NA_GRID_PREFIXES = new Set([
  'DL','DM','DN',
  'EK','EL','EM','EN',
  'FK','FL','FM','FN',
  'GN',
]);

function isNorthAmerica(grid) {
  if (!grid || grid.length < 2) return false;
  return NA_GRID_PREFIXES.has(grid.slice(0, 2).toUpperCase());
}

function recordBandActivity(freqMhz, spotterCall, spottedCall) {
  const baseCall = spotterCall.includes('-') ? spotterCall.split('-')[0] : spotterCall;
  const grid = SKIMMER_GRIDS[baseCall] || prefixToGrid(baseCall);
  if (!isNorthAmerica(grid)) return;
  const band = getBand(freqMhz);
  if (!bandActivity[band]) return;
  const now = Date.now();
  bandActivity[band].set(spottedCall, now);
  const cutoff = now - ACTIVITY_WINDOW_MS;
  for (const [call, time] of bandActivity[band]) {
    if (time < cutoff) bandActivity[band].delete(call);
  }
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('propagation:bandactivity', buildBandActivityData());
  }
}

function getBandStatus(band) {
  const count = bandActivity[band]?.size || 0;
  if (count >= 20) return { status: 'ACTIVE', count };
  if (count >= 5)  return { status: 'MARGINAL', count };
  return { status: 'QUIET', count };
}

function buildBandActivityData() {
  const potaCounts = getPOTABandCounts();
  const result = {};
  for (const band of ACTIVITY_BANDS) {
    const { status, count } = getBandStatus(band);
    result[band] = { status, count, potaCount: potaCounts[band] || 0 };
  }
  return result;
}

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
  const freqMhz = parseFloat(freqStr) / 1000;
  const spotterCall = rawSpotter.replace(/:$/, '');

  if (mode === 'CW') recordBandActivity(freqMhz, spotterCall, dx);

  if (dx !== CALLSIGN) return;

  const spotter = spotterCall;
  const spotterBase = spotter.includes('-') ? spotter.split('-')[0] : spotter;

  if (isDuplicate(spotter, freqMhz)) return;

  const spot = {
    id: ++spotIdCounter,
    spotter,
    spotter_grid: SKIMMER_GRIDS[spotterBase] || prefixToGrid(spotterBase) || null,
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
