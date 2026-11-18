// 原創向量圖示

export const ICON_GEAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>`;

export const ICON_STOPWATCH = `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.8h4M12 2.8v3.2M18.2 6.8l1.4-1.4"/></g></svg>`;

// 猜到咒語：金色星星徽章 + 閃光
export const ICON_GUESSED = `<svg viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <radialGradient id="gG" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff6c4"/><stop offset=".55" stop-color="#f7c948"/><stop offset="1" stop-color="#c98a12"/></radialGradient>
    <radialGradient id="gS" cx="40%" cy="30%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe27a"/></radialGradient>
  </defs>
  <circle cx="60" cy="60" r="46" fill="url(#gG)" stroke="#fff3b0" stroke-width="3"/>
  <path d="M60 26l9.6 21.4 23.4 2.4-17.6 15.6 5 23L60 76.6 39.6 88.4l5-23L27 49.8l23.4-2.4z" fill="url(#gS)" stroke="#b97a0a" stroke-width="2.5" stroke-linejoin="round"/>
  <g fill="#fff8d6"><path d="M104 14l2.4 6 6 2.4-6 2.4-2.4 6-2.4-6-6-2.4 6-2.4z"/><path d="M14 92l1.8 4.4 4.4 1.8-4.4 1.8-1.8 4.4-1.8-4.4-4.4-1.8 4.4-1.8z"/></g>
</svg>`;

// 用完指示物：兩枚「是／否」代幣 + 紅色禁止圈
export const ICON_TOKENS_OUT = `<svg viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="46" cy="58" r="26" fill="#2e9d4f" stroke="#c9f2d4" stroke-width="3"/>
  <path d="M34 58l8 8 16-17" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="74" cy="66" r="26" fill="#c63a3a" stroke="#ffd0d0" stroke-width="3"/>
  <path d="M64 56l20 20M84 56L64 76" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="#ff2d2d" stroke-width="9"/>
  <path d="M25 25l70 70" stroke="#ff2d2d" stroke-width="9" stroke-linecap="round"/>
</svg>`;
