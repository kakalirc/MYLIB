/**
 * Extract exactly one JSON value from an AI response.
 *
 * The provider may wrap JSON in Markdown fences or short explanatory prose.
 * This scanner finds a complete balanced JSON root without being confused by
 * braces/brackets inside quoted strings or escaped quotes.
 */
export function parseJsonResponse(text: string): unknown {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("AI response was empty; expected one JSON value.");
  }

  const source = text.replace(/^\uFEFF/, "").trim();
  const parsed: unknown[] = [];

  for (let start = 0; start < source.length; start++) {
    const opener = source[start];
    if (opener !== "{" && opener !== "[") continue;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;

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
        continue;
      }
      if (char === "{" || char === "[") {
        stack.push(char);
        continue;
      }
      if (char === "}" || char === "]") {
        const expected = char === "}" ? "{" : "[";
        if (stack.pop() !== expected) break;
        if (stack.length === 0) {
          const candidate = source.slice(start, cursor + 1);
          try {
            parsed.push(JSON.parse(candidate));
          } catch {
            // Keep scanning: a prose example may precede the actual JSON.
          }
          break;
        }
      }
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
