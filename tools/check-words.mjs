// 檢查詞庫：重複的詞、首字缺部首、部首表重複定義。用法：node tools/check-words.mjs
import { WORDS } from '../js/words.js';
import { RADICALS } from '../js/radicals.js';
import { readFileSync } from 'node:fs';

const all = Object.values(WORDS).flat();
const dups = all.filter((w, i) => all.indexOf(w) !== i);
const missing = [...new Set(all.map((w) => [...w][0]).filter((c) => !RADICALS[c]))];
const src = readFileSync(new URL('../js/radicals.js', import.meta.url), 'utf8');
const listed = [...src.matchAll(/'[^']+': '([^']+)'/g)].flatMap((m) => [...m[1]]);
const twice = listed.filter((c, i) => listed.indexOf(c) !== i);
console.log('詞數', Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, v.length])), '總計', all.length);
console.log('重複的詞：', dups.join(' ') || '無');
console.log('缺部首的首字：', missing.join('') || '無');
console.log('部首表重複定義：', twice.join('') || '無');
process.exit(dups.length || missing.length || twice.length ? 1 : 0);
