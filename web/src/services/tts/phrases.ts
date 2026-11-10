/**
 * Splits narration into short phrases for the voice model: sentences, and long
 * sentences at commas or semicolons. A short first phrase lets audio start
 * sooner; short phrases keep generation ahead of playback.
 */
export function splitPhrases(text: string, maxLength = 160, firstMaxLength = 70): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  const phrases: string[] = [];
  for (const sentence of sentences) {
    const limit = phrases.length === 0 ? firstMaxLength : maxLength;
    if (sentence.length <= limit) {
      phrases.push(sentence);
      continue;
    }
    let current = "";
    for (const part of sentence.split(/(?<=[,;:—])\s+/)) {
      const max = phrases.length === 0 ? firstMaxLength : maxLength;
      if (current && current.length + part.length + 1 > max) {
        phrases.push(current);
        current = part;
      } else current = current ? `${current} ${part}` : part;
    }
    if (current) phrases.push(current);
  }
  return phrases;
}
