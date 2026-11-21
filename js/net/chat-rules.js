// Rules for a line in the chat rooms at #/commons. No DOM, so the
// server loads this file and runs the same check on every line it receives.
//
//   ChatRules.check(text, { recent, lastAt, now, slowMs })  -> { ok, code, why, text, wait }
//      recent: [{ text, at }] this player's last lines, lastAt: when they last sent (ms),
//      slowMs: the room's slow mode when it differs from SLOW_MS
//      code: 'empty' | 'long' | 'link' | 'email' | 'phone' | 'handle' | 'word' | 'repeat' | 'slow'
//   ChatRules.contact(text)   -> 'link' | 'email' | 'phone' | 'handle' | ''
//   ChatRules.wpm(chars, ms)  -> the speed a line was typed at, or null
//   ChatRules.QUICK           the quick phrases (the only lines under-13 accounts can send)
//   ChatRules.MAX, SLOW_MS, REPEAT_MS, WPM_MAX
//
// Blocked words come from NetFilter (js/net/filter.js) and the TEEN_OFF list in
// js/wordbank.js, so the word lists stay in one place each.
(function (root) {
  const MAX = 140;
  const SLOW_MS = 2000;          // one line every 2 seconds
  const REPEAT_MS = 30000;       // the same line again within 30 seconds is refused
  const REPEAT_N = 3;            // checked against this many of the player's last lines
  const WPM_MAX = 300;
  const QUICK = ['hi', 'gg', 'good luck', 'join my party?', 'rematch?', 'well played'];

  const WHY = {
    empty: '',
    long: `Keep it to ${MAX} characters.`,
    link: "Links can't be posted in chat.",
    email: "Email addresses can't be posted in chat.",
    phone: "Phone numbers can't be posted in chat.",
    handle: "Usernames from other apps can't be posted in chat.",
    word: "That message has a word chat doesn't allow.",
    repeat: 'You sent that a moment ago.',
    slow: 'One message every 2 seconds.',
  };

  // ---------- contact details ----------
  const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.|\s?\(dot\)\s?|\s?\[dot\]\s?)(?:com|net|org|gg|io|me|ly|co|tv|xyz|ru|ph|th|app|link|site|club|info|biz|be|to)\b/i;
  const EMAIL = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\]|\s+dot\s+)\s*[a-z]{2,}/i;
  const MAILHOST = /\b(?:gmail|yahoo|hotmail|outlook|icloud|proton(?:mail)?)\b/i;
  // seven or more digits with only spaces, dots, dashes, brackets or a plus between them
  const PHONE = /(?:\+\s*)?\d(?:[\s().-]*\d){6,}/;
  // a Thai or other non-Latin digit run counts too
  const PHONE_ANY = /[\d\u0E50-\u0E59](?:[\s().-]*[\d\u0E50-\u0E59]){6,}/;
  const AT = /(?:^|[\s(])@[\p{L}\p{N}_.]{2,}/u;
  const APPS = /\b(?:ig|insta|instagram|tiktok|tik tok|snap|snapchat|discord|telegram|whatsapp|facebook|fb|messenger|twitter|kik|wechat|line id|lineid|youtube|twitch|roblox|steam|psn|xbox|epic id)\b|ไลน์|ไอจี|เฟส|ไอดี/i;
  const ASK = /\b(?:my|add|follow|dm|pm|hmu|msg|message|contact|text|call|ko|mo|sub|subscribe|id|user(?:name)?|acc(?:ount)?|is)\b|[:=]|ของ|แอด|ทัก/i;

  function contact(text) {
    const t = String(text || '');
    if (EMAIL.test(t)) return 'email';
    if (LINK.test(t)) return 'link';
    if (PHONE.test(t) || PHONE_ANY.test(t)) return 'phone';
    if (AT.test(t)) return 'handle';
    if (APPS.test(t) && ASK.test(t)) return 'handle';
    if (MAILHOST.test(t)) return 'email';
    return '';
  }

  // ---------- words ----------
  function teenOff(text) {
    const W = root.WordBank;
    if (!W || !W.teenOk) return false;
    return !W.teenOk(String(text).toLowerCase().replace(/[013457@$]/g, c => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' })[c]));
  }
  const wordOff = text => (root.NetFilter && root.NetFilter.blocked(text)) || teenOff(text);

  // ---------- the line itself ----------
  function tidy(text) {
    return String(text || '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
      .replace(/\s+/g, ' ').trim()
      .replace(/(.)\1{5,}/gu, '$1$1$1$1$1');     // "gggggggggg" -> "ggggg"
  }
  const norm = t => tidy(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

  function check(text, ctx = {}) {
    const now = ctx.now != null ? ctx.now : Date.now();
    const t = tidy(text);
    const out = (code, extra = {}) => ({ ok: false, code, why: WHY[code], text: t, ...extra });
    if (!t) return out('empty');
    if (t.length > MAX) return out('long');
    const c = contact(t);
    if (c) return out(c);
    if (wordOff(t)) return out('word');
    const slow = ctx.slowMs || SLOW_MS;
    if (ctx.lastAt != null && now - ctx.lastAt < slow) return out('slow', { wait: slow - (now - ctx.lastAt), why: `One message every ${Math.round(slow / 100) / 10} seconds.` });
    const n = norm(t);
    if (n && (ctx.recent || []).slice(-REPEAT_N).some(r => now - r.at < REPEAT_MS && norm(r.text) === n)) return out('repeat');
    return { ok: true, code: '', why: '', text: t };
  }

  // typed speed from the first keystroke to Enter, in the usual 5 characters a word
  function wpm(chars, ms) {
    if (!chars || !ms || ms <= 0) return null;
    return Math.max(1, Math.min(WPM_MAX, Math.round((chars / 5) / (ms / 60000))));
  }

  root.ChatRules = { check, contact, wpm, tidy, QUICK, WHY, MAX, SLOW_MS, REPEAT_MS, REPEAT_N, WPM_MAX };
})(globalThis);

