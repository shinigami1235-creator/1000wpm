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
    'asshole', 'bastard', 'wanker', 'porn', 'hitler', 'killyourself', 'kike', 'tranny',
    'penis', 'vagina', 'dildo', 'jizz', 'onlyfans', 'motherf', 'bollock', 'molest', 'pedophile',
    // 29 Nov 2026: more common swears and the spellings people use to slip past
    'fvck', 'phuck', 'phuk', 'fuq', 'biatch', 'beyotch', 'biotch', 'beatch', 'sluts', 'skank',     'pussy', 'cocksuck', 'dickhead', 'dikhead', 'douche', 'blowjob', 'handjob', 'rimjob', 'boner',
    'jerkoff', 'jackoff', 'jackass', 'dumbass', 'fatass', 'badass', 'smartass', 'shithead', 'goddamn', 'bullsh',
    'masturb', 'orgasm', 'erection', 'cumshot', 'creampie', 'hentai', 'nsfw', 'nudes',
    'retart', 'niqq', 'fagg', 'wetback', 'raghead', 'towelhead',
    'kill urself', 'killurself', 'kmsnow', 'neck yourself', 'hang yourself', 'die bitch',
    // Tagalog and Filipino slang
    'putangina', 'putang', 'tangina', 'tanginamo', 'pakyu', 'pakshet', 'kantot', 'pokpok', 'tarantado', 'punyeta',
    'ulol', 'burat', 'pekpek', 'kupal', 'tamod', 'hindot', 'iyot',
  ];
  // regular expressions for spellings that also start harmless words (bitcoin, witch, whorl)
  const PATTERNS = [/bitc(?!oi)/, /btch/, /bytch/, /whore/, /hoe?s?bag/, /cnt(?!r|i)/, /fck/, /fcking/];
  // real words that contain a blocked stem once letters are folded or doubled letters squeezed
  const ALLOW = /^(?:shiitakes?|mishit\w*|cannibal\w*|minibar\w*|poorness|annals?|rapp\w*|retardan\w*|pusillanim\w*|mortgag\w*|niggard\w*|niggl\w*|snigg\w*|denigrat\w*|scunthorpe|whittl\w*|\w*watch\w*|\w*water\w*|\w+sperm\w*|sperma\w*|spermi\w*|spermo\w*|pussycat\w*|pussyfoot\w*|gobbledygook|choker\w*|beanery|marconigraph|wanigan|snazz\w*|monazite|phenazine|denazif\w*|xxx[ivxl]+|titis?|e?vaginat\w*|invaginat\w*|cocktail\w*|cockpit\w*|cockroach\w*|hancock|peacock\w*|shuttlecock|dickens|analys\w*|analog\w*|canal\w*|banal\w*|basement|assassin\w*|classic\w*|grasshopper|bichloride|bichromate|babiche|nebbich|nigrescent|nigrif\w*|nigritude|nigrosine|shenanigan\w*|bastardiz\w*)$/;
  // words written in Thai script (Thai has no spaces, so these match anywhere in the text)
  const THAI = ['ควย', 'เย็ด', 'เหี้ย', 'เหี่ย', 'สัส', 'สัตว์นรก', 'ไอ้สัตว์', 'อีสัตว์', 'ระยำ', 'ส้นตีน', 'แตด', 'กระหรี่', 'อีดอก', 'ชาติหมา', 'หน้าหี', 'จู๋', 'หำ'];
  // match only as a whole word
  const WORDS = new Set([
    'ass', 'arse', 'dick', 'dicks', 'cock', 'cocks', 'cum', 'tit', 'tits', 'titty', 'boob', 'boobs', 'sex', 'sexy',
    'nude', 'nudes', 'rape', 'raped', 'spic', 'chink', 'coon', 'dyke', 'negro', 'fag', 'fags', 'piss', 'damn',
    'crap', 'hoe', 'hoes', 'thot', 'wtf', 'stfu', 'gtfo', 'milf', 'anal', 'rapist', 'pedo', 'horny',
    'kys', 'sht', 'sperm', 'nibba', 'beaner', 'beaners', 'hooker', 'hookers', 'xxx', 'gago', 'twat', 'twats', 'nazi', 'nazis', 'gook', 'gooks', 'prick', 'pricks', 'cunts', 'slag', 'bimbo', 'kms', 'shits', 'shat', 'tit', 'puta', 'titi', 'tite', 'tanga',
    'kuay', 'semen', 'bilat', 'tits', 'butthole', 'arsehole', 'bj', 'stripper', 'sexting',
  ]);
  // names nobody may take, so no one can pass as Art or as staff
  const RESERVED = ['art', '10000wpm', '1000wpm', 'admin', 'moderator', 'mod', 'staff', 'official', 'system', 'server', 'typemaster'];
  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
  const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|gg|io|me|ly|co|tv|xyz|ru|ph|th)\b\S*/gi;

  const fold = s => String(s).toLowerCase().replace(/[013457@$!|+]/g, c => LEET[c] || c);
  const squeeze = s => s.replace(/(.)\1+/g, '$1');
  const letters = s => squeeze(fold(s).replace(/[^a-z]/g, ''));

  // A stem whose squeezed form is under 4 letters matches only as written, since "nigg"
  // squeezed is "nig" and would block night, knight and tonight. The doubled-letter spelling
  // with the double squeezed out is caught by name.
  const stemIn = (f, sq) => STEMS.some(s => { if (s.includes(' ')) return false; const q = squeeze(s); return f.includes(s) || (q.length >= 4 && sq.includes(q)); })
    || (/niger(?!ia)/.test(sq) && f !== 'niger');
  function badToken(tok) {
    const f = fold(tok).replace(/[^a-z]/g, '');
    if (!f || ALLOW.test(f)) return false;
    const sq = squeeze(f);
    if (WORDS.has(f) || WORDS.has(sq)) return true;
    return stemIn(f, sq) || PATTERNS.some(r => r.test(f) || r.test(sq));
  }
  // a word spelled out with spaces or dots, like "f u c k", "s.h.i.t", "w h o r EE" or "b i t ces": every run of
  // tokens that has at least two one- or two-letter tokens is joined (with the word before and after it) and checked
  // as one word
  function spaced(text) {
    const toks = String(text).split(/[\s._\-*]+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      if (fold(toks[i]).replace(/[^a-z]/g, '').length > 2) continue;
      let j = i, shorts = 0;
      while (j < toks.length && fold(toks[j]).replace(/[^a-z]/g, '').length <= 2) { shorts++; j++; }
      if (shorts < 2) continue;
      const from = Math.max(0, i - 1), to = Math.min(toks.length, j + 1);
      for (let a = from; a <= i; a++) for (let b = j; b <= to; b++) {
        const f = fold(toks.slice(a, b).join('')).replace(/[^a-z]/g, ''), l = squeeze(f);
        if (!f) continue;
        if (stemIn(f, l) || WORDS.has(l) || WORDS.has(f) || PATTERNS.some(r => r.test(f) || r.test(l))) return true;
      }
      i = j;
    }
    return false;
  }
  // phrases (stems with a space) and Thai words, checked against the whole message
  function phrase(text) {
    const t = String(text), f = ' ' + fold(t).replace(/[^a-z]+/g, ' ') + ' ';
    if (THAI.some(w => t.includes(w))) return true;
    return STEMS.some(s => s.includes(' ') && f.includes(' ' + s + ' '.slice(0, 0)) && f.includes(s));
  }

  function blocked(text) {
    const t = String(text || '');
    if (LINK.test(t)) { LINK.lastIndex = 0; return true; }
    LINK.lastIndex = 0;
    return t.split(/[^a-z0-9@$!|+]+/i).some(badToken) || spaced(t) || phrase(t);
  }

  function clean(text, max = 140) {
    let t = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    let hidden = 0;
    t = t.replace(LINK, () => { hidden++; return '[link removed]'; });
    t = t.replace(/[a-z0-9@$!|+']+/gi, w => { if (badToken(w)) { hidden++; return '*'.repeat(w.length); } return w; });
    if (spaced(t) || phrase(t)) { hidden++; t = '*'.repeat(Math.min(t.length, 12)); }
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
