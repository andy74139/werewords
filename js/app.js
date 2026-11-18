import {
  ROLES, NARRATOR, SLOTS, slotEmoji, MIN_PLAYERS, MAX_PLAYERS,
  presetFor, countRoles, uniqueRoles, setupWarnings, joinNames,
} from './roles.js';
import { DIFFICULTIES, WORDS, hintFor, drawWords } from './words.js';
import {
  settings, saveSettings, resetSettings, loadSetup, saveSetup,
  usedWords, markUsed, clearHistory, fmtTime, fmtDuration,
} from './settings.js';
import {
  Token, sleep, unlockAudio, startMusic, stopMusic, refreshMusicLevel,
  sfx, speak, stopSpeech, chineseVoices, keepAwake,
} from './audio.js';
import { ICON_GEAR, ICON_STOPWATCH, ICON_GUESSED, ICON_TOKENS_OUT } from './icons.js';

const app = document.getElementById('app');
const overlay = document.createElement('div');
overlay.id = 'overlay';
overlay.hidden = true;
document.body.appendChild(overlay);
const sheet = document.createElement('div');
sheet.id = 'sheet';
sheet.hidden = true;
document.body.appendChild(sheet);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ======================= 主畫面設定 ======================= */

const saved = loadSetup();
const setup = {
  selected: Array.isArray(saved?.selected) && saved.selected.length === SLOTS.length ? saved.selected : presetFor(8),
  difficulty: DIFFICULTIES.some((d) => d.id === saved?.difficulty) ? saved.difficulty : 'easy',
};
const persist = () => saveSetup(setup);
const playerCount = () => setup.selected.filter(Boolean).length;
const diffInfo = (id = setup.difficulty) => DIFFICULTIES.find((d) => d.id === id);

function nextDifficulty() {
  const i = DIFFICULTIES.findIndex((d) => d.id === setup.difficulty);
  setup.difficulty = DIFFICULTIES[(i + 1) % DIFFICULTIES.length].id;
  persist();
}

const roleInfo = (id) => ROLES[id] || NARRATOR[id];
function teamClass(id) {
  if (id === 'werewolf' || id === 'minion') return 'team-wolf';
  if (id === 'doppelganger') return 'team-doppel';
  if (NARRATOR[id]) return 'team-neutral';
  return 'team-village';
}
function cardHTML(id, { emoji, cls = '', attrs = '', tag = 'div' } = {}) {
  const r = roleInfo(id);
  return `<${tag} class="card ${teamClass(id)} ${cls}" ${attrs}>`
    + `<span class="card-art">${emoji || r.emoji}</span><span class="card-name">${r.name}</span></${tag}>`;
}

function renderMain() {
  cleanupGame();
  stopMusic();
  keepAwake(false);
  const d = diffInfo();
  const warns = setupWarnings(setup.selected);
  app.innerHTML = `
  <div class="main">
    <header class="logo">
      <div class="logo-title">狼人猜詞</div>
      <div class="logo-sub">豪華版・隱藏身份的猜詞遊戲</div>
    </header>
    <div class="grid-wrap"><div class="grid">
      ${SLOTS.map((id, i) => cardHTML(id, {
        emoji: slotEmoji(i), tag: 'button', cls: setup.selected[i] ? 'on' : 'off',
        attrs: `data-slot="${i}" aria-pressed="${setup.selected[i]}"`,
      })).join('')}
    </div></div>
    <div class="controls">
      <div class="row">
        <button class="box players" data-action="players" aria-label="人數，點一下加一，長按減一"><b>${playerCount()}</b>&nbsp;人</button>
        <button class="box diff" data-action="diff" style="color:${d.color}">${d.name}詞彙</button>
      </div>
      <div class="row">
        <button class="box timer ${settings.gameTimerOn ? '' : 'is-off'}" data-action="settings">
          <small>遊戲計時</small><b>${settings.gameTimerOn ? fmtTime(settings.gameTime) : '不限時'}</b>
        </button>
        <button class="play" data-action="play" style="--play:${d.color}">開始</button>
        <button class="icon-btn ${settings.gameTimerOn ? '' : 'is-off'}" data-action="timer-toggle" aria-label="開關倒數計時">${ICON_STOPWATCH}</button>
        <button class="icon-btn" data-action="settings" aria-label="設定">${ICON_GEAR}</button>
      </div>
      <div class="warn-line">${warns.map(esc).join('・')}</div>
    </div>
  </div>`;
  bindPlayersButton();
}

function changePlayers(delta) {
  let n = playerCount() + delta;
  if (n > MAX_PLAYERS) n = MIN_PLAYERS;
  if (n < MIN_PLAYERS) n = MAX_PLAYERS;
  setup.selected = presetFor(n);
  persist();
  renderMain();
}

// 點一下 +1、長按 −1
function bindPlayersButton() {
  const btn = app.querySelector('[data-action=players]');
  let timer = null;
  btn.addEventListener('pointerdown', () => {
    btn.dataset.long = '';
    timer = setTimeout(() => { btn.dataset.long = '1'; sfx('tap'); changePlayers(-1); }, 550);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, () => clearTimeout(timer)));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

async function onPlay() {
  unlockAudio();
  const warns = setupWarnings(setup.selected);
  if (playerCount() < MIN_PLAYERS) {
    await alertBox(`至少需要選 ${MIN_PLAYERS} 個角色。`);
    return;
  }
  if (warns.length && !(await confirmBox(`${warns.map(esc).join('<br>')}<br><br>仍要開始嗎？`, '開始'))) return;
  startGame();
}

/* ======================= 遊戲主持 ======================= */

let game = null;

function startGame() {
  cleanupGame();
  unlockAudio();
  keepAwake(true);
  startMusic();
  game = {
    roles: countRoles(setup.selected),
    inPlay: uniqueRoles(setup.selected),
    difficulty: setup.difficulty,
    mayorRole: null,
    doppelRole: null,
    word: null,
    choices: null,
    steps: [],
    idx: 0,
    token: null,
    phase: 'night',
    paused: false,
    pickResolve: null,
    timer: null,
    interval: null,
    guessState: null,
  };
  game.steps = buildNight();
  runNight(0);
}

function cleanupGame() {
  if (!game) return;
  game.token?.cancel();
  clearInterval(game.interval);
  stopSpeech();
  game = null;
  hideOverlay();
}

function stopGame() {
  renderMain();
}

const has = (r) => !!game.roles[r];

function buildNight() {
  const S = [];
  const step = (who, text, o = {}) => S.push({ who, text, ...o });
  const wakeClose = (id, wake, o) => {
    step(id, wake, o);
    step(id, `${ROLES[id].name}，閉上眼睛。`);
  };

  step('everyone', '所有人，閉上眼睛。');
  step('mayor', '村長，醒過來，並點選你的秘密身份。', { view: 'pickMayorRole' });
  step('mayor', '村長，選擇你的魔法咒語。', { view: 'pickWord' });
  step('mayor', '村長，閉上眼睛。');

  if (has('doppelganger')) {
    step('doppelganger', '化身幽靈，醒過來，查看另一位玩家的身份牌，然後在螢幕上點選那個角色。', { view: 'pickDoppel' });
    // 不論複製了誰都唸同一句，避免其他人從語音得知化身幽靈複製了誰
    step('doppelganger', '化身幽靈，看螢幕。', { view: 'doppelInfo', hold: true });
    step('doppelganger', '化身幽靈，閉上眼睛。');
  }
  if (has('seer')) wakeClose('seer', '先知，醒過來，查看魔法咒語。', { view: 'word', hold: true });
  if (has('fortuneTeller')) wakeClose('fortuneTeller', '占卜師，醒過來，查看魔法咒語第一個字的部首。', { view: 'hint', hold: true });
  if (has('apprentice')) wakeClose('apprentice', '學徒，醒過來，看著螢幕。', { view: 'apprentice', hold: true });
  if (has('beholder')) {
    const thumbs = ['seer', 'fortuneTeller', 'apprentice'].filter(has).map((r) => ROLES[r].name);
    if (thumbs.length) {
      const names = joinNames(thumbs);
      step('beholder', `守望者，醒過來。${names}，保持閉眼，並豎起大拇指，讓守望者知道你們是誰。`, { hold: true });
      step('beholder', `${names}，收回大拇指。守望者，閉上眼睛。`);
    } else {
      wakeClose('beholder', '守望者，醒過來。', { hold: true });
    }
  }
  if (has('watchman')) wakeClose('watchman', '守夜人，醒過來，尋找另一位守夜人。', { hold: true });
  if (has('thing')) wakeClose('thing', '怪東西，醒過來，輕拍你左右其中一位鄰居的肩膀。', { hold: true });
  if (has('werewolf')) wakeClose('werewolf', '狼人，醒過來，尋找其他狼人，並查看魔法咒語。', { view: 'word', hold: true });
  if (has('minion')) {
    if (has('werewolf')) {
      step('minion', '爪牙，醒過來。狼人，保持閉眼，並豎起大拇指，讓爪牙知道你們是誰。', { hold: true });
      step('minion', '狼人，收回大拇指。爪牙，閉上眼睛。');
    } else {
      wakeClose('minion', '爪牙，醒過來。', { hold: true });
    }
  }
  step('day', '所有人，醒過來。');
  return S;
}

async function runNight(from) {
  game.phase = 'night';
  for (let i = from; i < game.steps.length; i++) {
    if (!game) return;
    game.idx = i;
    const token = (game.token = new Token());
    await runStep(game.steps[i], token);
    if (token.cancelled) return;
  }
  startGuess();
}

async function runStep(st, token) {
  const text = typeof st.text === 'function' ? st.text() : st.text;
  const pick = renderNight(st, text);
  // 需要點選的頁面：一點選就停止旁白、馬上進下一頁
  const voice = new Token();
  token.onCancel(() => voice.cancel());
  const spoken = speak(text, voice);
  if (pick) {
    await Promise.race([pick, new Promise((r) => token.onCancel(r))]);
    voice.cancel();
  } else {
    await spoken;
  }
  if (token.cancelled) return;
  await sleep(((st.hold ? settings.viewTime : 0) + settings.linePause) * 1000, token);
}

function waitPick() {
  return new Promise((resolve) => { game.pickResolve = resolve; });
}

function sideHTML(inner) {
  return `<div class="side side-left">${inner}</div><div class="side side-right">${inner}</div>`;
}

function wordView() {
  return {
    content: `<div class="word-label">魔法咒語</div><div class="word-big">${esc(game.word)}</div>`,
    side: sideHTML(`<span class="side-word">${esc(game.word)}</span>`),
  };
}

function hintBoxes() {
  const { radical, length } = hintFor(game.word);
  return `<div class="hint">${Array.from({ length }, (_, i) => `<span class="hint-box">${i === 0 ? esc(radical) : ''}</span>`).join('')}</div>`;
}

function hintView(prefix = '') {
  const { length } = hintFor(game.word);
  return {
    content: `${prefix}<div class="word-label">第一個字的部首・共 ${length} 個字</div>${hintBoxes()}`,
    side: sideHTML(hintBoxes()),
  };
}

function infoView(text) {
  return { content: `<div class="info">${esc(text)}</div>`, side: '' };
}

function apprenticeView() {
  if (game.mayorRole === 'seer') {
    const v = wordView();
    v.content = `<div class="info">村長是先知，你得知魔法咒語：</div>${v.content}`;
    return v;
  }
  if (game.mayorRole === 'fortuneTeller') {
    return hintView('<div class="info">村長是占卜師，你得知第一個字的部首：</div>');
  }
  return infoView('村長不是先知或占卜師。');
}

function doppelView() {
  switch (game.doppelRole) {
    case 'seer': {
      const v = wordView();
      v.content = `<div class="info">你成為先知：</div>${v.content}`;
      return v;
    }
    case 'fortuneTeller': return hintView('<div class="info">你成為占卜師：</div>');
    case 'apprentice': {
      const v = apprenticeView();
      v.content = `<div class="info">你成為學徒：</div>${v.content}`;
      return v;
    }
    case 'werewolf': return infoView('你成為狼人，稍後與狼人一起醒來。');
    case 'minion': return infoView('你成為爪牙，稍後與爪牙一起醒來。');
    case 'watchman': return infoView('你成為守夜人，稍後與守夜人一起醒來。');
    case 'beholder': return infoView('你成為守望者，稍後與守望者一起醒來。');
    case 'thing': return infoView('你成為怪東西：現在輕拍你左右其中一位鄰居的肩膀。之後不用再醒來。');
    case 'villager': return infoView('你成為村民，沒有額外的資訊。');
    default: return infoView('（沒有選擇角色）');
  }
}

function pickGridHTML(roles, kind) {
  return `<div class="pick-grid">${roles.map((r) => cardHTML(r, {
    tag: 'button', cls: 'pickable', attrs: `data-pick="${kind}" data-role="${r}"`,
  })).join('')}</div>`;
}

function choicesHTML() {
  return `<div class="choices">${game.choices.map((w) => `<button class="choice" data-pick="word" data-word="${esc(w)}">${esc(w)}</button>`).join('')}
    <button class="pill small ghost" data-action="reroll">換一組</button></div>`;
}

function drawChoices(avoid = []) {
  return drawWords(game.difficulty, settings.wordChoices, settings.noRepeat ? usedWords() : new Set(), avoid);
}

function renderNight(st, text) {
  let content = '';
  let side = '';
  let pick = null;
  switch (st.view) {
    case 'pickMayorRole':
      content = pickGridHTML(game.inPlay, 'mayor');
      pick = waitPick();
      break;
    case 'pickDoppel':
      content = pickGridHTML(game.inPlay.filter((r) => r !== 'doppelganger'), 'doppel');
      pick = waitPick();
      break;
    case 'pickWord':
      if (!game.choices) game.choices = drawChoices();
      content = choicesHTML();
      pick = waitPick();
      break;
    case 'word': ({ content, side } = wordView()); break;
    case 'hint': ({ content, side } = hintView()); break;
    case 'apprentice': ({ content, side } = apprenticeView()); break;
    case 'doppelInfo': ({ content, side } = doppelView()); break;
    default:
  }
  app.innerHTML = `
  <div class="stage night ${side ? 'has-side' : ''}">
    <div class="portrait">${cardHTML(st.who)}</div>
    <div class="prompt">${esc(text)}</div>
    <div class="content">${content}</div>
    ${side}
    <div class="bottom-bar">
      <button class="pill" data-action="pause">暫停</button>
      <button class="pill" data-action="stop">停止</button>
    </div>
  </div>`;
  return pick;
}

function onPick(el) {
  if (!game?.pickResolve) return;
  sfx('tap');
  const kind = el.dataset.pick;
  if (kind === 'mayor') game.mayorRole = el.dataset.role;
  if (kind === 'doppel') game.doppelRole = el.dataset.role;
  if (kind === 'word') {
    game.word = el.dataset.word;
    if (settings.noRepeat) markUsed(game.word);
  }
  app.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('picked', b === el));
  const resolve = game.pickResolve;
  game.pickResolve = null;
  resolve();
}

/* ---------- 猜咒語倒數 ---------- */

function startGuess(resume) {
  game.phase = 'guess';
  game.token = new Token();
  clearInterval(game.interval);
  const on = settings.gameTimerOn;
  const remaining = resume?.remaining ?? settings.gameTime;
  game.timer = {
    on,
    remaining,
    elapsed: resume?.elapsed ?? 0,
    running: false, // 語音唸完才開始計時
    last: performance.now(),
    warned: remaining <= 60,
    lastTick: null,
  };
  app.innerHTML = `
  <div class="stage guess">
    <div class="guess-actions">
      <button class="big-icon" data-action="tokens-out">${ICON_TOKENS_OUT}<span>用完指示物</span></button>
      <button class="big-icon" data-action="guessed">${ICON_GUESSED}<span>猜到咒語</span></button>
    </div>
    <div class="timer-block">
      <div class="timer-label">${on ? '猜出魔法咒語的剩餘時間' : '不限時・已進行'}</div>
      <div class="timer-big" id="timer">${fmtTime(on ? remaining : game.timer.elapsed)}</div>
    </div>
    <div class="bottom-bar">
      <button class="pill" data-action="pause">暫停</button>
    </div>
  </div>`;
  let text;
  if (resume) text = '繼續找出魔法咒語。';
  else if (on) text = `你們有${fmtDuration(settings.gameTime)}，找出魔法咒語。`;
  else text = '開始找出魔法咒語吧！';
  const token = game.token;
  speak(text, token).then(() => {
    if (token.cancelled || !game || game.phase !== 'guess' || game.paused) return;
    game.timer.running = true;
    game.timer.last = performance.now();
  });
  game.interval = setInterval(tickGuess, 200);
}

function setTimerText(sec, warn = false) {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = fmtTime(sec);
  el.classList.toggle('warn', warn);
}

function tickGuess() {
  const t = game?.timer;
  if (!t || !t.running) return;
  const now = performance.now();
  const dt = (now - t.last) / 1000;
  t.last = now;
  if (!t.on) {
    t.elapsed += dt;
    setTimerText(Math.floor(t.elapsed));
    return;
  }
  t.remaining -= dt;
  if (!t.warned && t.remaining <= 60) {
    t.warned = true;
    sfx('warn');
    speak('剩下一分鐘。');
  }
  const sec = Math.ceil(t.remaining);
  if (sec <= 10 && sec > 0 && sec !== t.lastTick) { t.lastTick = sec; sfx('tick'); }
  if (t.remaining <= 0) {
    clearInterval(game.interval);
    sfx('timeup');
    startVote('village', { timeUp: true });
    return;
  }
  setTimerText(t.remaining, t.remaining <= 10);
}

function endGuess(kind) {
  clearInterval(game.interval);
  game.guessState = { remaining: game.timer.remaining, elapsed: game.timer.elapsed };
  sfx(kind === 'wolves' ? 'win' : 'fail');
  startVote(kind, { timeUp: false });
}

/* ---------- 找人與投票 ---------- */

// 狼人要找的人：先知、占卜師；村長是其中之一時改找學徒；化身幽靈複製了其中之一也要找。
function seerTargets() {
  const list = [];
  if (has('seer')) list.push(game.mayorRole === 'seer' ? 'apprentice' : 'seer');
  if (has('fortuneTeller')) list.push(game.mayorRole === 'fortuneTeller' ? 'apprentice' : 'fortuneTeller');
  const uniq = [...new Set(list)].filter((r) => r !== 'apprentice' || has('apprentice'));
  const d = game.doppelRole;
  if (has('doppelganger') && d && (uniq.includes(d) || d === 'seer' || d === 'fortuneTeller')) uniq.push('doppelganger');
  return uniq;
}

// 大家要找的人：狼人或爪牙；化身幽靈複製了其中之一也算。
function wolfTargets() {
  const list = ['werewolf', 'minion'].filter(has);
  const d = game.doppelRole;
  if (has('doppelganger') && (d === 'werewolf' || d === 'minion')) list.push('doppelganger');
  return list;
}

function startVote(kind, { timeUp }) {
  game.phase = 'vote';
  game.voteKind = kind;
  game.voteTimeUp = timeUp;
  clearInterval(game.interval);
  game.token?.cancel();
  const targets = kind === 'wolves' ? seerTargets() : wolfTargets();
  game.targets = targets;
  const names = joinNames(targets.map((r) => ROLES[r].name), '或');
  const on = kind === 'wolves' ? settings.wolfTimerOn : settings.voteTimerOn;
  const secs = kind === 'wolves' ? settings.wolfTime : settings.voteTime;
  const within = on ? `在${fmtDuration(secs)}內` : '';

  if (!targets.length) {
    const msg = kind === 'wolves'
      ? '恭喜，你們找到魔法咒語了！場上沒有狼人要找的角色，村民陣營獲勝！'
      : '喔不，你們沒找到魔法咒語。場上沒有狼人或爪牙。';
    showResult(msg, '');
    return;
  }

  const text = kind === 'wolves'
    ? `恭喜，你們找到魔法咒語了！狼人們，翻開身份牌，${within}找出${names}。`
    : `${timeUp ? '時間到！' : ''}喔不，你們沒找到魔法咒語。你們要${within}共同找出${names}。`;

  game.timer = { on, remaining: secs, running: false, last: performance.now(), lastTick: null };
  const side = kind === 'wolves' ? sideHTML(`<span class="side-word">${esc(game.word)}</span>`) : '';
  app.innerHTML = `
  <div class="stage vote ${side ? 'has-side' : ''}">
    <div class="vote-top">
      ${timeUp ? '<span></span>' : '<button class="pill ghost" data-action="whoops">按錯了</button>'}
      <button class="pill" data-action="vote-now">立即投票</button>
    </div>
    <div class="prompt">${esc(text)}</div>
    <div class="timer-block" ${on ? '' : 'hidden'}>
      <div class="timer-label red">距離投票剩餘</div>
      <div class="timer-big" id="timer">${fmtTime(secs)}</div>
    </div>
    <div class="targets">${targets.map((r) => cardHTML(r)).join('')}</div>
    ${side}
    <div class="bottom-bar">
      <button class="pill" data-action="pause">暫停</button>
      <button class="pill" data-action="stop">停止</button>
    </div>
  </div>`;

  const token = (game.token = new Token());
  speak(text, token).then(() => {
    if (token.cancelled || !game || game.phase !== 'vote' || game.paused) return;
    game.timer.running = true;
    game.timer.last = performance.now();
  });
  game.interval = setInterval(tickVote, 200);
}

function tickVote() {
  const t = game?.timer;
  if (!t || !t.running || !t.on) return;
  const now = performance.now();
  t.remaining -= (now - t.last) / 1000;
  t.last = now;
  const sec = Math.ceil(t.remaining);
  if (sec <= 10 && sec > 0 && sec !== t.lastTick) { t.lastTick = sec; sfx('tick'); }
  if (t.remaining <= 0) { finishVote(true); return; }
  setTimerText(t.remaining, t.remaining <= 10);
}

function finishVote(timeUp) {
  clearInterval(game.interval);
  game.token?.cancel();
  if (timeUp) sfx('timeup');
  const call = game.voteKind === 'wolves' ? '狼人們，三、二、一，投票！' : '大家，三、二、一，投票！';
  const names = joinNames(game.targets.map((r) => ROLES[r].name), '或');
  const result = game.voteKind === 'wolves'
    ? `若狼人找到了${names}，狼人陣營獲勝；否則村民陣營獲勝。`
    : `若大家找到了${names}，村民陣營獲勝；否則狼人陣營獲勝。`;
  showResult(`${timeUp ? '時間到！' : ''}${call}`, result);
}

function whoops() {
  game.token?.cancel();
  stopSpeech();
  startGuess(game.guessState);
}

/* ---------- 結算 ---------- */

function showResult(spoken, resultText) {
  game.phase = 'result';
  clearInterval(game.interval);
  const d = diffInfo();
  app.innerHTML = `
  <div class="stage result">
    <div class="result-word"><div class="word-label">魔法咒語</div><div class="word-big">${esc(game.word || '')}</div></div>
    <div class="prompt">${esc(resultText || spoken)}</div>
    <div class="targets">${(game.targets || []).map((r) => cardHTML(r)).join('')}</div>
    <div class="result-actions">
      <button class="box diff" data-action="diff" style="color:${d.color}">${d.name}詞彙</button>
      <div class="row">
        <button class="pill big ghost" data-action="main">主畫面</button>
        <button class="pill big" data-action="again">再玩一次</button>
      </div>
    </div>
  </div>`;
  const token = (game.token = new Token());
  speak(spoken, token);
}

/* ---------- 暫停／停止 ---------- */

function pauseGame(withOverlay = true) {
  if (!game || game.paused || game.phase === 'result') return;
  game.paused = true;
  // 夜晚，或計時前的開場語音：取消語音，繼續後直接開始計時
  if (game.phase === 'night' || !game.timer?.running) {
    game.token?.cancel();
  }
  stopSpeech();
  if (game.timer) game.timer.running = false;
  if (withOverlay) {
    showOverlay(`<div class="pause-box">
      <div class="overlay-title">已暫停</div>
      <button class="pill big" data-action="resume">繼續</button>
      <button class="pill big ghost" data-action="stop-now">停止</button>
    </div>`);
  }
}

function resumeGame() {
  hideOverlay();
  if (!game || !game.paused) return;
  game.paused = false;
  if (game.phase === 'night') {
    runNight(game.idx);
  } else if (game.timer) {
    game.timer.running = true;
    game.timer.last = performance.now();
  }
}

async function askStop() {
  if (!game) return;
  pauseGame(false);
  if (await confirmBox('要結束這一局，回到主畫面嗎？', '結束', '繼續玩')) stopGame();
  else resumeGame();
}

/* ======================= 對話框 ======================= */

let modalResolve = null;
function showOverlay(html) { overlay.innerHTML = html; overlay.hidden = false; }
function hideOverlay() { overlay.hidden = true; overlay.innerHTML = ''; }

function confirmBox(msg, ok = '確定', cancel = '取消') {
  return new Promise((resolve) => {
    showOverlay(`<div class="modal"><div class="modal-text">${msg}</div><div class="row">
      <button class="pill ghost" data-modal="0">${cancel}</button>
      <button class="pill" data-modal="1">${ok}</button></div></div>`);
    modalResolve = (v) => { hideOverlay(); resolve(v); };
  });
}
function alertBox(msg) {
  return new Promise((resolve) => {
    showOverlay(`<div class="modal"><div class="modal-text">${msg}</div><div class="row">
      <button class="pill" data-modal="1">好</button></div></div>`);
    modalResolve = () => { hideOverlay(); resolve(); };
  });
}

/* ======================= 設定 ======================= */

const SCHEMA = [
  { section: '時間' },
  { key: 'gameTime', label: '猜咒語時間', type: 'num', min: 60, max: 900, step: 60, fmt: (v) => `${v / 60} 分鐘`, toggle: 'gameTimerOn' },
  { key: 'wolfTime', label: '狼人找先知時間', type: 'time', min: 10, max: 180, step: 5, toggle: 'wolfTimerOn' },
  { key: 'voteTime', label: '大家找狼人時間', type: 'time', min: 10, max: 300, step: 10, toggle: 'voteTimerOn' },
  { section: '主持' },
  { key: 'wordChoices', label: '村長候選詞數', type: 'num', min: 1, max: 5, step: 1, fmt: (v) => `${v} 個` },
  { key: 'viewTime', label: '查看資訊／豎拇指時間', type: 'num', min: 2, max: 20, step: 1, fmt: (v) => `${v} 秒` },
  { key: 'linePause', label: '每句話後的停頓', type: 'num', min: 0, max: 5, step: 0.5, fmt: (v) => `${v} 秒` },
  { section: '聲音' },
  { key: 'voiceOn', label: '語音主持', type: 'bool' },
  { key: 'voiceRate', label: '語速', type: 'num', min: 0.5, max: 1.5, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
  { key: 'voiceName', label: '語音', type: 'voice' },
  { key: 'musicOn', label: '背景音樂', type: 'bool' },
  { key: 'musicVolume', label: '音樂音量', type: 'num', min: 10, max: 100, step: 10, fmt: (v) => `${v}%` },
  { key: 'sfxOn', label: '音效', type: 'bool' },
  { section: '詞庫' },
  { key: 'noRepeat', label: '不重複出過的詞', type: 'bool' },
  { type: 'history' },
];

function switchHTML(key) {
  return `<label class="switch"><input type="checkbox" data-set-bool="${key}" ${settings[key] ? 'checked' : ''}><span></span></label>`;
}
function stepperHTML(item, disabled = false) {
  const v = settings[item.key];
  const text = item.type === 'time' ? fmtTime(v) : item.fmt(v);
  return `<div class="stepper ${disabled ? 'is-off' : ''}">
    <button data-step="${item.key}" data-dir="-1" ${v <= item.min ? 'disabled' : ''}>−</button>
    <span>${text}</span>
    <button data-step="${item.key}" data-dir="1" ${v >= item.max ? 'disabled' : ''}>＋</button></div>`;
}

function renderSettings() {
  const voices = chineseVoices();
  const rows = SCHEMA.map((item) => {
    if (item.section) return `<h3>${item.section}</h3>`;
    if (item.type === 'bool') return `<div class="set-row"><span>${item.label}</span>${switchHTML(item.key)}</div>`;
    if (item.type === 'voice') {
      return `<div class="set-row"><span>${item.label}</span><select data-set-voice>
        <option value="">自動（台灣中文）</option>
        ${voices.map((v) => `<option value="${esc(v.name)}" ${settings.voiceName === v.name ? 'selected' : ''}>${esc(v.name)}（${esc(v.lang)}）</option>`).join('')}
      </select></div>`;
    }
    if (item.type === 'history') {
      const total = Object.values(WORDS).reduce((n, l) => n + l.length, 0);
      const counts = DIFFICULTIES.map((d) => `${d.name} ${WORDS[d.id].length}`).join('・');
      return `<div class="set-row"><span>已出過 ${usedWords().size} / ${total} 個詞<small>${counts}</small></span>
        <button class="pill small ghost" data-action="clear-history">重置</button></div>`;
    }
    const toggle = item.toggle ? switchHTML(item.toggle) : '';
    return `<div class="set-row"><span>${item.label}</span><div class="set-ctl">${stepperHTML(item, item.toggle && !settings[item.toggle])}${toggle}</div></div>`;
  }).join('');
  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head"><h2>設定</h2><button class="pill" data-action="close-settings">完成</button></div>
    ${rows}
    <div class="sheet-foot">
      <button class="pill ghost" data-action="test-voice">試聽語音</button>
      <button class="pill ghost" data-action="reset-settings">恢復預設</button>
    </div>
    <p class="note">倒數開關打開時才會倒數；關閉時改為顯示已進行時間，由你們自行決定何時結束。</p>
  </div>`;
}

function openSettings() {
  renderSettings();
  sheet.hidden = false;
}

function closeSettings() {
  sheet.hidden = true;
  stopSpeech();
  if (!game) renderMain();
}

function updateSetting(fn) {
  const scroll = sheet.scrollTop;
  fn();
  saveSettings();
  refreshMusicLevel();
  renderSettings();
  sheet.scrollTop = scroll;
}

sheet.addEventListener('change', (e) => {
  const b = e.target.closest('[data-set-bool]');
  if (b) updateSetting(() => { settings[b.dataset.setBool] = b.checked; });
  const v = e.target.closest('[data-set-voice]');
  if (v) updateSetting(() => { settings.voiceName = v.value; });
});

/* ======================= 事件 ======================= */

document.addEventListener('click', async (e) => {
  const modalBtn = e.target.closest('[data-modal]');
  if (modalBtn && modalResolve) {
    const r = modalResolve;
    modalResolve = null;
    r(modalBtn.dataset.modal === '1');
    return;
  }

  const slot = e.target.closest('[data-slot]');
  if (slot) {
    const i = Number(slot.dataset.slot);
    setup.selected[i] = !setup.selected[i];
    persist();
    sfx('tap');
    renderMain();
    return;
  }

  const pick = e.target.closest('[data-pick]');
  if (pick) { onPick(pick); return; }

  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn) {
    const item = SCHEMA.find((s) => s.key === stepBtn.dataset.step);
    updateSetting(() => {
      const v = settings[item.key] + item.step * Number(stepBtn.dataset.dir);
      settings[item.key] = Math.round(Math.min(item.max, Math.max(item.min, v)) * 10) / 10;
    });
    return;
  }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'players':
      if (el.dataset.long === '1') return;
      sfx('tap');
      changePlayers(+1);
      break;
    case 'diff':
      nextDifficulty();
      sfx('tap');
      if (game) {
        const d = diffInfo();
        el.textContent = `${d.name}詞彙`;
        el.style.color = d.color;
      } else renderMain();
      break;
    case 'timer-toggle':
      settings.gameTimerOn = !settings.gameTimerOn;
      saveSettings();
      renderMain();
      break;
    case 'settings': openSettings(); break;
    case 'close-settings': closeSettings(); break;
    case 'test-voice':
      unlockAudio();
      speak('所有人，閉上眼睛。村長，醒過來。');
      break;
    case 'reset-settings':
      updateSetting(() => resetSettings());
      break;
    case 'clear-history':
      updateSetting(() => clearHistory());
      break;
    case 'play': onPlay(); break;
    case 'reroll':
      if (game) {
        sfx('tap');
        game.choices = drawChoices(game.choices);
        app.querySelector('.content').innerHTML = choicesHTML();
      }
      break;
    case 'pause': pauseGame(); break;
    case 'resume': resumeGame(); break;
    case 'stop': askStop(); break;
    case 'stop-now': stopGame(); break;
    case 'guessed': if (game?.phase === 'guess') endGuess('wolves'); break;
    case 'tokens-out': if (game?.phase === 'guess') endGuess('village'); break;
    case 'vote-now': if (game?.phase === 'vote') finishVote(false); break;
    case 'whoops': if (game?.phase === 'vote') whoops(); break;
    case 'main': stopGame(); break;
    case 'again': startGame(); break;
    default:
  }
});

/* ======================= 啟動 ======================= */

renderMain();

const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && !isLocal) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
