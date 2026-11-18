// 設定、主畫面配置、出過的詞，都存在這台裝置的 localStorage。

const KEY_SETTINGS = 'ww.settings.v1';
const KEY_SETUP = 'ww.setup.v1';
const KEY_HISTORY = 'ww.history.v1';

export const DEFAULTS = {
  gameTime: 240,        // 猜咒語時間（秒）
  gameTimerOn: true,
  wolfTime: 30,         // 狼人找先知時間
  wolfTimerOn: true,
  voteTime: 60,         // 大家找狼人時間
  voteTimerOn: true,
  wordChoices: 3,       // 村長候選詞數
  linePause: 1.5,       // 每句話後的停頓（秒）
  viewTime: 6,          // 查看資訊、豎拇指等的時間（秒）
  voiceOn: true,
  voiceRate: 1.0,
  voiceName: '',
  voiceVolume: 60,      // 0–100
  remindAfter: 15,      // 等點選太久時，幾秒提醒一次
  musicOn: true,
  musicVolume: 70,      // 0–100
  sfxOn: true,
  skipButton: true,     // 測試用：主持時右上角的「下一步」
  noRepeat: true,
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 私密瀏覽等情況 */ }
}

const stored = load(KEY_SETTINGS, {});
// 舊版預設候選詞是 2 個；沒改過的人升級成新預設 3 個
if (!stored.rev && stored.wordChoices === 2) delete stored.wordChoices;
export const settings = { ...DEFAULTS, ...stored, rev: 2 };
// 遊戲計時只用整數分鐘
settings.gameTime = Math.min(900, Math.max(60, Math.round(settings.gameTime / 60) * 60));
export function saveSettings() { save(KEY_SETTINGS, settings); }
export function resetSettings() { Object.assign(settings, DEFAULTS); saveSettings(); }

export function loadSetup() { return load(KEY_SETUP, null); }
export function saveSetup(setup) { save(KEY_SETUP, setup); }

const history = new Set(load(KEY_HISTORY, []));
export function usedWords() { return history; }
export function markUsed(word) { history.add(word); save(KEY_HISTORY, [...history]); }
export function clearHistory() { history.clear(); save(KEY_HISTORY, []); }

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m && s) return `${m}分${s}秒`;
  if (m) return `${m}分鐘`;
  return `${s}秒`;
}
