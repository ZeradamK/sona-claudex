/**
 * Buffers token deltas from the SSE chat stream and flushes whole words.
 *
 * The product constraint is "word-by-word streaming only" — never per character,
 * never per line. We accept arbitrary-length text deltas from the model and
 * re-emit them split on word boundaries so the UI types one word at a time.
 */
export function createWordEmitter(onWord: (word: string) => void) {
  let buffer = "";

  function flushReady() {
    // Match a chunk ending in whitespace (the "ready" word + its trailing space/newline).
    const pattern = /^(\S+\s+)/;
    let match = buffer.match(pattern);
    while (match) {
      onWord(match[1]);
      buffer = buffer.slice(match[1].length);
      match = buffer.match(pattern);
    }
  }

  return {
    push(delta: string) {
      buffer += delta;
      flushReady();
    },
    end() {
      if (buffer.length > 0) {
        onWord(buffer);
        buffer = "";
      }
    }
  };
}
