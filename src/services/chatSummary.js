// ============================================================
//  VaultChat — On-device Chat Summarization (task #91)
//  src/services/chatSummary.js
//
//  Pure-JS algorithmic summarizer — no model file, no network
//  call, runs in milliseconds inside the app process. Designed
//  for the "Summarize this chat" feature on the chat header.
//
//  What it produces:
//    - Stats line:    "23 messages over 2 hours · 65% Sarah, 35% you"
//    - Topic line:    "Topics: dinner, weekend, NYC"
//    - Highlight:     a representative quoted message
//    - Tone hint:     a coarse positive / casual / urgent label
//
//  Limitations vs a real LLM:
//    - Topics are statistical (frequent capitalized + 4+ char
//      words minus stopwords). A noun-phrase extractor would do
//      better, but at the cost of bundling a model.
//    - Tone is keyword-based — looks for ?/! density, profanity,
//      emoji affect. It's a vibes check, not sentiment science.
//    - No paraphrasing. The "highlight" is one of the actual
//      messages, picked for length + topical density.
//
//  Future hardening: swap the topics + tone passes for Apple
//  Intelligence Writing Tools (iOS 18+) when we want a real
//  natural-language summary. The interface stays the same so
//  the call sites in ChatRoomScreen / GroupChatScreen don't move.
// ============================================================

const MEDIA_PREFIXES = [
  'GALLERY:', 'LOCALIMG:', 'IMG:',
  'VIDEOS:',  'LOCALVID:', 'VID:',
  'VOICE:', 'VONCE:', 'FILE:', 'REPLY:',
];

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','else','for','of','to','in','on',
  'at','by','with','from','as','is','am','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should','may',
  'might','must','can','this','that','these','those','i','you','he','she','it',
  'we','they','me','him','her','us','them','my','your','his','its','our','their',
  'so','not','no','yes','yeah','ok','okay','just','really','very','some','any',
  'all','one','two','more','most','also','too','about','into','out','up','down',
  'over','than','then','here','there','where','when','what','who','how','why',
  'lol','haha','hey','hi','hello','thanks','thank','sure','idk','rn','tho',
  'gonna','wanna','gotta','dont','don','cant','wont','im','ill','ive','id','its',
  'youre','youve','theyre','were','wasnt','arent','isnt',
]);

function fmtTimeSpan(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1)  return 'less than a minute';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const hr = Math.round(min / 60);
  if (hr  < 24) return `${hr} hour${hr === 1 ? '' : 's'}`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? '' : 's'}`;
}

function stripMediaPrefix(content) {
  if (typeof content !== 'string') return '';
  for (const p of MEDIA_PREFIXES) {
    if (content.startsWith(p)) {
      // Some prefixes have a trailing caption after \n
      const nl = content.indexOf('\n');
      return nl >= 0 ? content.slice(nl + 1).trim() : '';
    }
  }
  return content;
}

function extractTopics(textBlob) {
  // Single pass: split into words, count, filter stopwords + short words
  const counts = new Map();
  const words = textBlob
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/);

  for (const raw of words) {
    const w = raw.trim();
    if (w.length < 4) continue;
    if (STOPWORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }

  // Top 5 by count, breaking ties on word length (longer = more specific)
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 5)
    .map(([w]) => w);
}

function detectTone(textBlob, msgCount) {
  const exclaim = (textBlob.match(/!/g) || []).length;
  const question = (textBlob.match(/\?/g) || []).length;
  const positiveEmoji = (textBlob.match(/[😀😃😄😁😆😍🥰😊👍❤️🎉🙌✨🔥💯]/gu) || []).length;
  const negativeEmoji = (textBlob.match(/[😢😭😞😔😡🤬👎💔😤😠]/gu) || []).length;
  const urgencyWords = /\b(asap|urgent|now|immediately|emergency|hurry)\b/i.test(textBlob);

  if (urgencyWords || exclaim / Math.max(1, msgCount) > 0.6) return 'urgent';
  if (positiveEmoji > negativeEmoji * 2 && positiveEmoji > 2) return 'positive';
  if (negativeEmoji > positiveEmoji * 2 && negativeEmoji > 2) return 'tense';
  if (question > msgCount * 0.4) return 'inquiring';
  return 'casual';
}

function pickHighlight(messagesWithText) {
  if (messagesWithText.length === 0) return null;
  // Score = length + topical density (presence of capitalized words)
  let best = messagesWithText[0];
  let bestScore = -1;
  for (const m of messagesWithText) {
    const t = m.text || '';
    if (t.length < 12 || t.length > 220) continue;
    const caps = (t.match(/[A-Z][a-z]+/g) || []).length;
    const score = t.length + caps * 8;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/**
 * Build a summary for a chat. Returns { stats, topics, highlight, tone }
 * where each field is a human-readable string the UI can render
 * directly. Pass at most ~50 messages — more than that, the topic
 * extractor's signal-to-noise drops without improving the result.
 *
 * @param {Array<{ sender_id, content, text, created_at }>} messages
 * @param {Object} [opts]
 * @param {string} [opts.myUserId]    — for "you" attribution
 * @param {string} [opts.peerName]    — fallback for the other party
 *                                      (1:1 chats). For group chats
 *                                      omit and we'll list senders.
 */
export function summarizeMessages(messages, opts = {}) {
  const { myUserId, peerName = 'them' } = opts;
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      stats:     'No messages to summarize yet.',
      topics:    null,
      highlight: null,
      tone:      'empty',
    };
  }

  // Normalize each message to { senderId, text, createdAt } (the
  // 1:1 schema uses `content`, group uses `text`).
  const normalized = messages
    .map(m => ({
      senderId:  m.sender_id || m.user_id || 'unknown',
      text:      stripMediaPrefix(m.content || m.text || ''),
      createdAt: m.created_at ? new Date(m.created_at).getTime() : 0,
    }))
    .filter(m => m.text || m.createdAt);

  if (normalized.length === 0) {
    return { stats: 'Only media in this chat — nothing textual to summarize.', topics: null, highlight: null, tone: 'media' };
  }

  // ── Stats ────────────────────────────────────────────────
  const byUser = new Map();
  let earliest = Infinity, latest = -Infinity;
  for (const m of normalized) {
    byUser.set(m.senderId, (byUser.get(m.senderId) || 0) + 1);
    if (m.createdAt && m.createdAt < earliest) earliest = m.createdAt;
    if (m.createdAt && m.createdAt > latest)   latest   = m.createdAt;
  }
  const span = latest - earliest;
  const total = normalized.length;

  const sortedSenders = Array.from(byUser.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([sid, count]) => {
      const pct  = Math.round((count / total) * 100);
      const name = sid === myUserId ? 'you' : peerName;
      return { name, pct };
    });

  // For group chats, sortedSenders has more than 2 entries — fall
  // back to "shared between N people" rather than naming everyone
  // (we don't have a sender_id → name map here).
  const sharePart = sortedSenders.length <= 2
    ? sortedSenders.map(s => `${s.pct}% ${s.name}`).join(', ')
    : `shared across ${sortedSenders.length} people`;

  const stats = `${total} message${total === 1 ? '' : 's'} over ${fmtTimeSpan(span || 1)} · ${sharePart}`;

  // ── Topics ───────────────────────────────────────────────
  const blob = normalized.map(m => m.text).join(' ');
  const topicList = extractTopics(blob);
  const topics = topicList.length
    ? `Topics: ${topicList.join(', ')}`
    : null;

  // ── Highlight ────────────────────────────────────────────
  const hl = pickHighlight(normalized);
  const highlight = hl?.text ? `"${hl.text}"` : null;

  // ── Tone ─────────────────────────────────────────────────
  const tone = detectTone(blob, total);

  return { stats, topics, highlight, tone };
}

/**
 * Render a finished summary as a single multi-line string for an
 * Alert dialog. Skips empty fields so an alert never has a stray
 * "Highlight: null" line.
 */
export function summaryToText(summary) {
  if (!summary) return '';
  const lines = [];
  if (summary.stats)     lines.push(summary.stats);
  if (summary.topics)    lines.push('');
  if (summary.topics)    lines.push(summary.topics);
  if (summary.highlight) lines.push('');
  if (summary.highlight) lines.push(`Highlight:\n${summary.highlight}`);
  if (summary.tone && summary.tone !== 'casual' && summary.tone !== 'empty' && summary.tone !== 'media') {
    lines.push('');
    lines.push(`Vibe: ${summary.tone}`);
  }
  return lines.join('\n');
}
