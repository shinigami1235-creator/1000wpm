// Chat and name filter for the multiplayer pages. It runs on the device now and the
// server must run the same check (and proper moderation) once chat goes between
// real players. See NET.md, "Moderation".
//
//   NetFilter.clean(text)    -> { text, hidden }   blocked words become asterisks, links are removed
//   NetFilter.nameOk(name, min = 3) -> { ok, why }  names with blocked words, links or reserved words fail
//   NetFilter.blocked(text)  -> true when anything in the text is blocked
//
// Matching folds case, common letter swaps (0 -> o, 1 -> i, 3 -> e, 4 -> a, 5 -> s, 7 -> t, @ -> a, $ -> s)
// and repeated letters. Short words that live inside harmless words (cock in peacock, cum in
// cucumber) only match as whole words; the longer stems match anywhere, including when the
// letters are spaced out.
(function (root) {
  // match anywhere in the folded text
  const STEMS = [
    'fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'nigg', 'niga', 'fagot', 'faggot', 'retard', 'whore', 'slut',
    'asshole', 'bastard', 'wanker', 'twat', 'porn', 'hitler', 'killyourself', 'kys', 'kike', 'tranny',
    'penis', 'vagina', 'dildo', 'jizz', 'onlyfans', 'motherf', 'bollock', 'nazi', 'molest', 'pedophile',
  ];
  // match only as a whole word
  const WORDS = new Set([
    'ass', 'arse', 'dick', 'dicks', 'cock', 'cocks', 'cum', 'tit', 'tits', 'titty', 'boob', 'boobs', 'sex', 'sexy',
    'nude', 'nudes', 'rape', 'raped', 'spic', 'chink', 'coon', 'dyke', 'negro', 'fag', 'fags', 'piss', 'damn',
    'crap', 'hoe', 'hoes', 'thot', 'wtf', 'stfu', 'gtfo', 'milf', 'anal', 'rapist', 'pedo', 'horny',
  ]);
  // names nobody may take, so no one can pass as Art or as staff
  const RESERVED = ['art', '10000wpm', '1000wpm', 'admin', 'moderator', 'mod', 'staff', 'official', 'system', 'server', 'typemaster'];
  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
  const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|gg|io|me|ly|co|tv|xyz|ru|ph|th)\b\S*/gi;

  const fold = s => String(s).toLowerCase().replace(/[013457@$!|+]/g, c => LEET[c] || c);
  const squeeze = s => s.replace(/(.)\1+/g, '$1');
  const letters = s => squeeze(fold(s).replace(/[^a-z]/g, ''));

  function badToken(tok) {
    const f = fold(tok).replace(/[^a-z]/g, '');
    if (!f) return false;
    const sq = squeeze(f);
    if (WORDS.has(f) || WORDS.has(sq)) return true;
    return STEMS.some(s => f.includes(s) || sq.includes(squeeze(s)));
  }
  // a word spelled out with spaces or dots, like "f u c k" or "s.h.i.t"
  function spaced(text) {
    const runs = String(text).match(/(?:\b[a-z0-9@$]\b[\s._-]*){3,}/gi) || [];
    return runs.some(r => { const l = letters(r); return STEMS.some(s => l.includes(squeeze(s))) || WORDS.has(l); });
  }

  function blocked(text) {
    const t = String(text || '');
    if (LINK.test(t)) { LINK.lastIndex = 0; return true; }
    LINK.lastIndex = 0;
    return t.split(/[^a-z0-9@$!|+]+/i).some(badToken) || spaced(t);
  }

  function clean(text, max = 140) {
    let t = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    let hidden = 0;
    t = t.replace(LINK, () => { hidden++; return '[link removed]'; });
    t = t.replace(/[a-z0-9@$!|+']+/gi, w => { if (badToken(w)) { hidden++; return '*'.repeat(w.length); } return w; });
    if (spaced(t)) { hidden++; t = t.replace(/(?:\b[a-z0-9@$]\b[\s._-]*){3,}/gi, m => '*'.repeat(m.trim().length) + (/\s$/.test(m) ? ' ' : '')); }
    return { text: t, hidden };
  }

  function nameOk(name, min = 3) {
    const n = String(name || '').trim();
    if (n.length < min) return { ok: false, why: `Use at least ${min} characters.` };
    if (n.length > 20) return { ok: false, why: 'Use 20 characters or fewer.' };
    if (!/^[\p{L}\p{N} _.-]+$/u.test(n)) return { ok: false, why: 'Use letters, numbers, spaces, dots, dashes and underscores.' };
    if (blocked(n)) return { ok: false, why: 'Pick another name.' };
    const f = letters(n).replace(/[^a-z0-9]/g, '');
    const plain = n.toLowerCase().replace(/[^a-z0-9]/g, ''), leet = fold(n).replace(/[^a-z0-9]/g, '');
    if (RESERVED.some(r => [plain, leet, f].some(x => x === r || (r.length > 4 && x.includes(r))))) return { ok: false, why: 'That name is reserved.' };
    return { ok: true, why: '' };
  }

  root.NetFilter = { clean, nameOk, blocked, RESERVED };
})(globalThis);
