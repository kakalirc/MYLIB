/**
 * Extract exactly one JSON value from an AI response.
 *
 * Allows Markdown fences or brief prose around the payload. The scanner
 * balances nested objects/arrays and ignores delimiters inside JSON strings.
 */
export function parseJsonResponse(text: string): unknown {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("AI response was empty; expected one JSON value.");
  }

  const source = text.replace(/^\uFEFF/, "").trim();
  const parsed: unknown[] = [];
  let searchFrom = 0;

  while (searchFrom < source.length) {
    let start = searchFrom;
    while (start < source.length && source[start] !== "{" && source[start] !== "[") start++;
    if (start >= source.length) break;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let completedAt = -1;

    for (let cursor = start; cursor < source.length; cursor++) {
      const char = source[cursor];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{" || char === "[") {
        stack.push(char);
      } else if (char === "}" || char === "]") {
        const expected = char === "}" ? "{" : "[";
        if (stack.pop() !== expected) break;
        if (stack.length === 0) {
          completedAt = cursor;
          break;
        }
      }
    }

    if (completedAt >= start) {
      try {
        parsed.push(JSON.parse(source.slice(start, completedAt + 1)));
        searchFrom = completedAt + 1;
      } catch {
        // The opening delimiter may belong to prose or an invalid example.
        // Advance one character so a later, valid root can still be found.
        searchFrom = start + 1;
      }
    } else {
      searchFrom = start + 1;
    }
  }

  if (parsed.length === 0) {
    throw new Error("AI response did not contain a complete valid JSON value.");
  }
  if (parsed.length > 1) {
    throw new Error("AI response contained multiple JSON values; refusing an ambiguous payload.");
  }
  return parsed[0];
}
