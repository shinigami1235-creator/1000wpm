// The chat rooms at #/commons. Areas and rooms are data: add, rename or reorder them here
// and the page, the sim backend and the server pick them up. Bot lines for each room are in
// js/net/chat-lines.js under the room's `lines` key (the room id when there is none).
//
// Room fields
//   id        short, never changes once players have used it (the server keys history by it)
//   name      shown in the room list and the header
//   topic     one line under the room name
//   lang      the language people write in: en, th, tl, ja, pt, es, id, vi, ko, de
//   readOnly  only Art and moderators post (Announcements)
//   kind      'chat' (default) or 'posts' (structured party posts with a Join button)
//   school    open to school accounts limited to the Learn rooms
//   countries bots in a region room come from these countries (sim backend only)
//   busy      share of the online bots the sim backend puts in this room
//   more      listed under "more" in its area until opened
window.CHAT_ROOMS = {
  areas: [
    { id: 'keyspace', name: 'Keyspace', rooms: [
      { id: 'lobby', name: 'Lobby', topic: 'Talk about anything on the site.', lang: 'en', busy: 18 },
      { id: 'intro', name: 'Introductions', topic: 'New here? Say hi and how fast you type.', lang: 'en', busy: 4 },
      { id: 'news', name: 'Announcements', topic: 'Site updates from Art and the moderators.', lang: 'en', readOnly: true, busy: 3 },
    ] },
    { id: 'battles', name: 'Battles', rooms: [
      { id: 'boss', name: 'Syntax Error', topic: 'The World Boss everyone fights together. Call attacks, blocks and damage.', lang: 'en', busy: 14 },
      { id: 'rush', name: 'Boss Rush', topic: 'Runs, scores and how to beat each boss.', lang: 'en', busy: 6 },
      { id: 'duels', name: 'Duels', topic: 'Find someone to duel and talk about matches.', lang: 'en', busy: 7 },
      { id: 'stream', name: 'Superboss', topic: "Art's stream fights. Chat while he plays.", lang: 'en', busy: 5 },
    ] },
    { id: 'party', name: 'Find a party', rooms: [
      { id: 'party', name: 'Party finder', topic: 'Post a party or join one. Posts close after 15 minutes.', lang: 'en', kind: 'posts', busy: 4 },
    ] },
    { id: 'learn', name: 'Learn', rooms: [
      { id: 'academy', name: 'Academy help', topic: 'Questions about the academy lessons.', lang: 'en', school: true, busy: 4 },
      { id: 'gear', name: 'Keyboards and gear', topic: 'Keyboards, switches and desk setups.', lang: 'en', school: true, busy: 4 },
      { id: 'drills', name: 'Tips and drills', topic: 'Practice routines and how to type faster.', lang: 'en', school: true, busy: 3 },
    ] },
    { id: 'regions', name: 'Regions', rooms: [
      { id: 'th', name: 'Thailand', topic: 'Chat in Thai.', lang: 'th', countries: ['TH'], busy: 6 },
      { id: 'ph', name: 'Philippines', topic: 'Chat in Filipino or English.', lang: 'tl', countries: ['PH'], busy: 5 },
      { id: 'jp', name: 'Japan', topic: 'Chat in Japanese.', lang: 'ja', countries: ['JP'], busy: 2 },
      { id: 'br', name: 'Brazil', topic: 'Chat in Portuguese.', lang: 'pt', countries: ['BR'], busy: 2 },
      { id: 'es', name: 'Spanish', topic: 'Chat in Spanish.', lang: 'es', countries: ['MX', 'ES', 'AR', 'CO', 'CL'], busy: 2 },
      { id: 'id', name: 'Indonesia', topic: 'Chat in Indonesian.', lang: 'id', countries: ['ID'], busy: 1, more: true },
      { id: 'vn', name: 'Vietnam', topic: 'Chat in Vietnamese.', lang: 'vi', countries: ['VN'], busy: 1, more: true },
      { id: 'kr', name: 'Korea', topic: 'Chat in Korean.', lang: 'ko', countries: ['KR'], busy: 1, more: true },
      { id: 'de', name: 'Germany', topic: 'Chat in German.', lang: 'de', countries: ['DE'], busy: 1, more: true },
    ] },
  ],
  first: 'lobby',          // the room the page opens on a first visit
  history: 50,             // messages the server sends when a room is opened
  slowMs: 2000,            // one message per 2 seconds in every room unless a room sets its own slowMs
  postMinutes: 15,         // party finder posts close after this
};
