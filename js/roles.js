// 角色定義、20 個角色位置、依人數推薦的組合。

export const ROLES = {
  doppelganger: { name: '化身幽靈', emoji: '🎭', team: 'wolf-or-village' },
  seer:         { name: '先知',     emoji: '🔮', team: 'village' },
  fortuneTeller:{ name: '占卜師',   emoji: '🧿', team: 'village' },
  apprentice:   { name: '學徒',     emoji: '📖', team: 'village' },
  beholder:     { name: '守望者',   emoji: '👁️', team: 'village' },
  watchman:     { name: '守夜人',   emoji: '🏮', team: 'village' },
  thing:        { name: '怪東西',   emoji: '🖐️', team: 'village' },
  werewolf:     { name: '狼人',     emoji: '🐺', team: 'wolf' },
  minion:       { name: '爪牙',     emoji: '🦇', team: 'wolf' },
  villager:     { name: '村民',     emoji: '👨‍🌾', team: 'village' },
};

// 主持畫面用的非角色頭像
export const NARRATOR = {
  mayor:    { name: '村長',   emoji: '🎩', team: 'neutral' },
  everyone: { name: '所有人', emoji: '🌙', team: 'neutral' },
  day:      { name: '所有人', emoji: '☀️', team: 'neutral' },
};

// 主畫面的 20 個位置（排列同實體版：4 欄 × 5 列）
export const SLOTS = [
  'doppelganger', 'seer', 'fortuneTeller', 'apprentice',
  'beholder', 'watchman', 'watchman', 'thing',
  'werewolf', 'werewolf', 'werewolf', 'minion',
  'villager', 'villager', 'villager', 'villager',
  'villager', 'villager', 'villager', 'villager',
];

// 村民有兩種造型輪流顯示
export function slotEmoji(i) {
  const id = SLOTS[i];
  if (id === 'villager') {
    const n = SLOTS.slice(0, i).filter((r) => r === 'villager').length;
    return n % 2 === 0 ? '👨‍🌾' : '👩‍🌾';
  }
  return ROLES[id].emoji;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = SLOTS.length;

// 各人數的推薦組合（村民數另計：人數 − 特殊角色數）
//  2 先知+狼人 → 3–6 加村民 → 7 少1村民、多學徒和1狼人 → 8 村民 → 9 怪東西 → 10 村民
//  → 11 少怪東西、多1狼人和守望者 → 12 村民 → 13 少守望者、多2守夜人 → 14 村民
//  → 15 占卜師 → 16 守望者 → 17 怪東西 → 18 村民 → 19 爪牙 → 20 化身幽靈
const PRESETS = {
  2:  { seer: 1, werewolf: 1 },
  7:  { seer: 1, werewolf: 2, apprentice: 1 },
  9:  { seer: 1, werewolf: 2, apprentice: 1, thing: 1 },
  11: { seer: 1, werewolf: 3, apprentice: 1, beholder: 1 },
  13: { seer: 1, werewolf: 3, apprentice: 1, watchman: 2 },
  15: { seer: 1, werewolf: 3, apprentice: 1, watchman: 2, fortuneTeller: 1 },
  16: { seer: 1, werewolf: 3, apprentice: 1, watchman: 2, fortuneTeller: 1, beholder: 1 },
  17: { seer: 1, werewolf: 3, apprentice: 1, watchman: 2, fortuneTeller: 1, beholder: 1, thing: 1 },
  19: { seer: 1, werewolf: 3, apprentice: 1, watchman: 2, fortuneTeller: 1, beholder: 1, thing: 1, minion: 1 },
  20: { seer: 1, werewolf: 3, apprentice: 1, watchman: 2, fortuneTeller: 1, beholder: 1, thing: 1, minion: 1, doppelganger: 1 },
};

/** 回傳長度 20 的布林陣列，表示 n 人時推薦選用的位置。 */
export function presetFor(n) {
  let key = MIN_PLAYERS;
  for (const k of Object.keys(PRESETS).map(Number)) if (k <= n) key = Math.max(key, k);
  const want = { ...PRESETS[key] };
  want.villager = n - Object.values(want).reduce((a, b) => a + b, 0);
  return SLOTS.map((id) => {
    if (want[id] > 0) { want[id]--; return true; }
    return false;
  });
}

/** 已選位置 → 角色計數 { roleId: count } */
export function countRoles(selected) {
  const c = {};
  selected.forEach((on, i) => { if (on) c[SLOTS[i]] = (c[SLOTS[i]] || 0) + 1; });
  return c;
}

/** 依 SLOTS 順序列出場上有的角色（不重複） */
export function uniqueRoles(selected) {
  const seen = [];
  selected.forEach((on, i) => { if (on && !seen.includes(SLOTS[i])) seen.push(SLOTS[i]); });
  return seen;
}

/** 開始前的提醒（不會阻止開始） */
export function setupWarnings(selected) {
  const c = countRoles(selected);
  const n = selected.filter(Boolean).length;
  const w = [];
  if (n < MIN_PLAYERS) w.push(`至少需要 ${MIN_PLAYERS} 個角色`);
  if (!c.werewolf) w.push('場上沒有狼人');
  if (c.apprentice && !c.seer && !c.fortuneTeller) w.push('有學徒，但沒有先知或占卜師');
  if (c.beholder && !c.seer && !c.fortuneTeller && !c.apprentice) w.push('有守望者，但沒有先知、占卜師或學徒');
  if (c.watchman === 1) w.push('守夜人只有 1 位');
  if (c.minion && !c.werewolf) w.push('有爪牙，但沒有狼人');
  return w;
}

/** 「a、b和c」 */
export function joinNames(names, last = '和') {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join('、') + last + names[names.length - 1];
}
