"""用 pypinyin 核對詞庫每個詞首字的第一個注音（js/zhuyin.js）。

用法（需要 node 與 pypinyin）：
    python3 -m venv .venv && .venv/bin/pip install pypinyin
    .venv/bin/python tools/check-zhuyin.py

pypinyin 以大陸讀音與詞典為主，下列詞已確認以台灣讀音為準，不列為錯誤。
"""
import json
import pathlib
import subprocess

from pypinyin import Style, pinyin

# 已人工確認：pypinyin 判斷不同，但台灣讀音以我們的為準
TAIWAN_READING = {
    '長頸鹿': 'ㄔ',  # 長 ㄔㄤˊ；pypinyin 誤判為 ㄓㄤˇ
    '蚵仔煎': 'ㄜ',  # 台灣唸 ㄜˊ 仔煎；pypinyin 只有 ㄏㄜˊ
}

ROOT = pathlib.Path(__file__).resolve().parent.parent
dump = subprocess.run(
    ['node', '--input-type=module', '-e',
     "import {WORDS, hintFor} from './js/words.js';"
     "console.log(JSON.stringify(Object.entries(WORDS).flatMap(([lv, l]) =>"
     " l.map((w) => ({lv, w, mine: hintFor(w).symbol})))));"],
    cwd=ROOT, capture_output=True, text=True, check=True,
).stdout

diff = []
for item in json.loads(dump):
    w, mine = item['w'], item['mine']
    expected = TAIWAN_READING.get(w) or pinyin(w, style=Style.BOPOMOFO, errors='ignore')[0][0][0]
    if mine != expected:
        diff.append(f"{item['lv']}\t{w}\t目前：{mine}\t應為：{expected}")

print(f'不一致：{len(diff)}')
print('\n'.join(diff))
raise SystemExit(1 if diff else 0)
