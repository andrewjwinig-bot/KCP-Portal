// Tiny stop-word-based summarizer for maintenance descriptions.
//
// Output is meant for short slots: the table's Description column and the
// auto-generated subject on portal submissions. Strips filler words, takes
// the first few significant tokens, title-cases them. Capped at 6 words to
// stay row-readable.

const STOP_WORDS = new Set([
  // articles + pronouns
  "a", "an", "the",
  "i", "me", "my", "mine", "myself",
  "we", "us", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself",
  "she", "her", "hers", "herself",
  "it", "its", "itself",
  "they", "them", "their", "theirs", "themselves",
  // verbs + helpers
  "is", "are", "was", "were", "be", "been", "being",
  "am", "do", "does", "did", "doing",
  "have", "has", "had", "having",
  "will", "would", "shall", "should", "may", "might", "must",
  "can", "could", "let", "lets",
  // prepositions / conjunctions / fillers
  "and", "or", "but", "nor", "yet", "so", "if", "then", "than",
  "in", "on", "at", "to", "from", "by", "as", "of", "for", "with",
  "into", "onto", "upon", "about", "over", "under", "between",
  "this", "that", "these", "those",
  // intensifiers / pleasantries / common throwaways
  "very", "really", "just", "also", "only", "even", "still", "still",
  "please", "thanks", "thank", "hi", "hello", "hey",
  "ok", "okay", "any", "all", "some", "much", "many", "few", "more",
  "now", "today", "yesterday", "tomorrow", "soon",
  "there", "here", "where", "when", "why", "how",
  "what", "which", "who", "whom",
  // misc connectors
  "again", "also", "around", "back",
]);

const MAX_WORDS = 6;

/**
 * Summarize a free-text description into a title-cased keyword phrase.
 * "my toilet is leaking" → "Toilet Leaking"
 * "no power in the suite please help" → "No Power Suite Help"
 * Empty / all-stop-words input → trimmed first 40 chars as fallback.
 */
export function summarize(text: string, max: number = MAX_WORDS): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";

  // First sentence / line only — the rest is usually context the user added.
  const firstLine = trimmed.split(/\r?\n|(?<=[.!?])\s+/)[0].trim();

  const tokens = firstLine
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((w) => w.length > 0);

  const significant = tokens
    .filter((w) => !STOP_WORDS.has(w))
    .filter((w) => w.length > 1 || /^[0-9]+$/.test(w))
    .slice(0, max);

  if (!significant.length) {
    return firstLine.length > 40 ? firstLine.slice(0, 37) + "…" : firstLine;
  }

  return significant
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
