// 語音（iOS 內建中文語音）、背景音樂與音效（Web Audio 即時合成，原創旋律）、螢幕常亮。
import { settings } from './settings.js';

/* ---------- 取消權杖：暫停／停止時中斷正在進行的語音與等待 ---------- */
export class Token {
  constructor() { this.cancelled = false; this.fns = []; }
  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.fns.splice(0).forEach((f) => f());
  }
  onCancel(fn) { if (this.cancelled) fn(); else this.fns.push(fn); }
}

export function sleep(ms, token) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    token?.onCancel(() => { clearTimeout(t); resolve(); });
  });
}

/* ---------- Web Audio ---------- */
let ctx = null;
let master, musicBus, sfxBus;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  // 壓縮器讓音樂可以開得更大聲又不破音
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = 1.6;
  master.connect(comp);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.5;
  sfxBus.connect(master);
  return ctx;
}

let speechUnlocked = false;

/** 必須在使用者點擊時呼叫（iOS 限制） */
export function unlockAudio() {
  try {
    // iOS 17+：即使開了靜音鍵也能出聲
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* 不支援就略過 */ }
  const c = ensureCtx();
  if (c && c.state !== 'running') c.resume().catch(() => {});
  // 語音只需要在第一次點擊時解鎖一次；重複送出靜音句子在 iOS 上反而會讓語音佇列卡住
  if (!speechUnlocked && 'speechSynthesis' in window) {
    speechUnlocked = true;
    const u = new SpeechSynthesisUtterance('。');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

// iOS 從背景回來或被語音打斷後，Web Audio 可能停在 suspended／interrupted
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
});

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

function tone(bus, { freq, type = 'sine', at, dur = 0.3, vol = 0.2, attack = 0.005 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(bus);
  o.start(at);
  o.stop(at + dur + 0.05);
}

let noiseBuf = null;
function noise(bus, { at, dur = 0.05, vol = 0.05 }) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(at);
  s.stop(at + dur + 0.02);
}

/* ---------- 背景音樂：輕快的 8 小節循環 ---------- */
const BPM = 108;
const EIGHTH = 60 / BPM / 2;
// 和弦：低音、琶音音群
const CHORDS = [
  { bass: 48, arp: [60, 64, 67, 72] }, // C
  { bass: 45, arp: [57, 60, 64, 69] }, // Am
  { bass: 41, arp: [53, 57, 60, 65] }, // F
  { bass: 43, arp: [55, 59, 62, 67] }, // G
];
const ARP = [0, 2, 1, 2, 3, 2, 1, 2];
const MELODY = [
  [76, 0, 79, 0, 76, 74, 72, 0],
  [72, 0, 76, 0, 74, 72, 69, 0],
  [72, 0, 77, 0, 76, 74, 72, 0],
  [74, 0, 71, 0, 74, 0, 79, 0],
  [79, 0, 0, 76, 0, 0, 72, 0],
  [76, 0, 0, 72, 0, 0, 69, 0],
  [77, 0, 76, 0, 74, 0, 72, 0],
  [71, 0, 74, 0, 79, 0, 0, 0],
];

let musicTimer = null;
let step = 0;
let nextAt = 0;
let ducked = false;

function musicLevel() {
  if (!settings.musicOn) return 0;
  const v = (settings.musicVolume / 100) * 1.4;
  // 旁白時只稍微壓低音樂（iOS 唸語音時本身也會壓低其他聲音）
  return ducked ? v * 0.75 : v;
}

function applyMusicLevel(ramp = 0.3) {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(musicBus.gain.value, t);
  musicBus.gain.linearRampToValueAtTime(musicTimer ? musicLevel() : 0, t + ramp);
}

function scheduleMusic() {
  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    return;
  }
  // 計時器被瀏覽器延遲（背景、語音中斷）時，跳過錯過的拍子，不要一次補排大量音符
  if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;
  while (nextAt < ctx.currentTime + 0.15) {
    const bar = Math.floor(step / 8) % 8;
    const i = step % 8;
    const ch = CHORDS[bar % 4];
    tone(musicBus, { freq: midi(ch.arp[ARP[i]]), type: 'triangle', at: nextAt, dur: 0.28, vol: 0.16 });
    if (i === 0 || i === 4) {
      tone(musicBus, { freq: midi(ch.bass), type: 'sine', at: nextAt, dur: 0.45, vol: 0.3, attack: 0.01 });
      // 低音加一點泛音，手機喇叭才聽得到
      tone(musicBus, { freq: midi(ch.bass + 12), type: 'triangle', at: nextAt, dur: 0.3, vol: 0.12, attack: 0.01 });
    }
    if (i % 2 === 1) noise(musicBus, { at: nextAt, dur: 0.04, vol: 0.06 });
    const m = MELODY[bar][i];
    if (m) {
      tone(musicBus, { freq: midi(m), type: 'triangle', at: nextAt, dur: 0.5, vol: 0.18, attack: 0.01 });
      tone(musicBus, { freq: midi(m + 12), type: 'sine', at: nextAt, dur: 0.25, vol: 0.05 });
    }
    nextAt += EIGHTH;
    step++;
  }
}

export function startMusic() {
  if (!ensureCtx() || musicTimer) return;
  step = 0;
  nextAt = ctx.currentTime + 0.1;
  musicTimer = setInterval(scheduleMusic, 40);
  scheduleMusic();
  applyMusicLevel(0.15);
}

export function stopMusic() {
  if (!musicTimer) return;
  clearInterval(musicTimer);
  musicTimer = null;
  applyMusicLevel(0.4);
}

export function refreshMusicLevel() { applyMusicLevel(0.2); }

function duck(on) { ducked = on; applyMusicLevel(0.25); }

/* ---------- 音效 ---------- */
export function sfx(name) {
  if (!settings.sfxOn || !ensureCtx()) return;
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'tap':
      tone(sfxBus, { freq: 880, type: 'triangle', at: t, dur: 0.08, vol: 0.15 });
      break;
    case 'tick':
      tone(sfxBus, { freq: 1200, type: 'square', at: t, dur: 0.04, vol: 0.12 });
      break;
    case 'warn':
      tone(sfxBus, { freq: midi(81), at: t, dur: 0.3, vol: 0.3 });
      tone(sfxBus, { freq: midi(81), at: t + 0.35, dur: 0.3, vol: 0.3 });
      break;
    case 'win':
      [72, 76, 79, 84, 88].forEach((m, i) => tone(sfxBus, { freq: midi(m), at: t + i * 0.09, dur: 0.6, vol: 0.28 }));
      break;
    case 'fail':
      [67, 63, 60, 55].forEach((m, i) => tone(sfxBus, { freq: midi(m), type: 'triangle', at: t + i * 0.16, dur: 0.4, vol: 0.3 }));
      break;
    case 'timeup':
      [0, 0.45, 0.9].forEach((d) => {
        tone(sfxBus, { freq: midi(84), at: t + d, dur: 0.4, vol: 0.35 });
        tone(sfxBus, { freq: midi(79), at: t + d + 0.18, dur: 0.4, vol: 0.3 });
      });
      break;
    default:
  }
}

/* ---------- 語音 ---------- */
let zhVoices = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  zhVoices = speechSynthesis.getVoices().filter((v) => /^(zh|cmn|yue)/i.test(v.lang));
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

export function chineseVoices() { loadVoices(); return zhVoices; }

function pickVoice() {
  loadVoices();
  if (settings.voiceName) {
    const v = zhVoices.find((x) => x.name === settings.voiceName);
    if (v) return v;
  }
  return zhVoices.find((v) => /zh[-_]TW/i.test(v.lang) && /mei|美佳/i.test(v.name))
    || zhVoices.find((v) => /zh[-_]TW/i.test(v.lang))
    || zhVoices.find((v) => /zh[-_]HK/i.test(v.lang))
    || zhVoices[0]
    || null;
}

function estimateSec(text) {
  const chars = text.replace(/[\s，。、！？：；,.!?]/g, '').length;
  return chars * 0.24 / settings.voiceRate + 0.6;
}

/** 唸出文字；被取消或唸完就 resolve。沒開語音時改為等待大約的閱讀時間。 */
export function speak(text, token) {
  if (!text) return Promise.resolve();
  const canSpeak = settings.voiceOn && 'speechSynthesis' in window;
  if (!canSpeak) return sleep(estimateSec(text) * 1000, token);

  return new Promise((resolve) => {
    const id = ++speechSeq;
    let done = false;
    let started = false;
    let utter = null;
    let guard = null;
    let retry = null;
    const detach = () => { if (utter) { utter.onstart = utter.onend = utter.onerror = null; } };
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      clearTimeout(retry);
      detach();
      if (current === utter) current = null;
      if (id === speechSeq) duck(false);
      resolve();
    };
    const say = () => {
      if (done) return;
      detach();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v?.lang || 'zh-TW';
      u.rate = settings.voiceRate;
      u.volume = settings.voiceVolume / 100;
      u.onstart = () => { started = true; };
      u.onend = finish;
      u.onerror = finish;
      utter = u;
      current = u; // 保留參照，避免 iOS 回收物件後不觸發 onend
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    };

    token?.onCancel(() => { detach(); speechSynthesis.cancel(); finish(); });
    // iOS 偶爾不觸發 onend，用估計時間保底
    guard = setTimeout(finish, (estimateSec(text) * 2 + 4) * 1000);
    duck(true);

    // iOS 在 cancel() 後立刻 speak() 可能整個卡住，所以先等一下再唸
    const busy = speechSynthesis.speaking || speechSynthesis.pending;
    if (busy) speechSynthesis.cancel();
    const t0 = Date.now();
    setTimeout(() => {
      say();
      // 1.5 秒內沒開始唸，就重設語音引擎再試一次
      retry = setTimeout(() => {
        if (started || done) return;
        detach();
        speechSynthesis.cancel();
        setTimeout(() => {
          say();
          retry = setTimeout(() => {
            if (started || done) return;
            // 語音引擎沒有反應：改用估計的閱讀時間，避免每一頁都卡住很久
            detach();
            speechSynthesis.cancel();
            clearTimeout(guard);
            guard = setTimeout(finish, Math.max(0, estimateSec(text) * 1000 - (Date.now() - t0)));
          }, 1500);
        }, 120);
      }, 1500);
    }, busy ? 120 : 0);
  });
}

let speechSeq = 0;
let current = null;

export function stopSpeech() {
  if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
  duck(false);
}

/* ---------- 螢幕常亮 ---------- */
let wakeLock = null;
let wantWake = false;

async function acquire() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* 低電量模式等情況會失敗 */ }
}

export function keepAwake(on) {
  wantWake = on;
  if (on) acquire();
  else if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake) acquire();
});
