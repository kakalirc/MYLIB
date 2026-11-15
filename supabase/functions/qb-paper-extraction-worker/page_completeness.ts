export type PageAuditItem = {
  item_kind: "question" | "passage";
  original_number?: string | null;
  payload?: Record<string, unknown> | null;
};

export type PageAudit = {
  version: 1;
  status: "clear" | "review";
  question_count: number;
  passage_count: number;
  flags: string[];
  checked_at: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

function questionFlags(payload: Record<string, unknown>, label: string): string[] {
  const flags: string[] = [];
  const text = clean(payload.question_text);
  const subquestions = Array.isArray(payload.subquestions) ? payload.subquestions : [];
  if (!text && subquestions.length === 0) flags.push(label + ": empty question stem.");
  if (/\[(?:unclear|illegible|not clearly legible|unreadable)[^\]]*\]/i.test(text)) {
    flags.push(label + ": OCR uncertainty placeholder needs visual verification.");
  }
  if (clean(payload.extraction_notes)) flags.push(label + ": extractor left a manual-review note.");
  const type = clean(payload.question_type).toLowerCase().replace(/[ _-]+/g, " ");
  if (["mcq", "multiple choice", "multiple choice question"].includes(type)) {
    const options = Array.isArray(payload.options) ? payload.options : [];
    if (options.length < 2) flags.push(label + ": MCQ has fewer than two captured options.");
  }
  for (let i = 0; i < subquestions.length; i++) {
    const part = subquestions[i];
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      flags.push(label + ": subquestion " + (i + 1) + " is malformed.");
      continue;
    }
    const sub = part as Record<string, unknown>;
    if (!clean(sub.question_text)) flags.push(label + ": subquestion " + (clean(sub.original_number) || (i + 1)) + " has an empty stem.");
    const subType = clean(sub.question_type).toLowerCase().replace(/[ _-]+/g, " ");
    if (["mcq", "multiple choice", "multiple choice question"].includes(subType) &&
        (!Array.isArray(sub.options) || sub.options.length < 2)) {
      flags.push(label + ": subquestion " + (clean(sub.original_number) || (i + 1)) + " has fewer than two captured MCQ options.");
    }
  }
  return flags;
}

/**
 * Deterministic audit of the extracted representation for one original PDF page.
 * This is a screening signal, not proof that the model captured every visible item.
 */
export function auditExtractedPage(items: PageAuditItem[], checkedAt = new Date().toISOString()): PageAudit {
  const questions = items.filter((item) => item.item_kind === "question");
  const passages = items.filter((item) => item.item_kind === "passage");
  const flags: string[] = [];
  if (items.length === 0) flags.push("No examinable questions or passages were extracted from this page; verify whether it is blank or content was missed.");

  const seenNumbers = new Set<string>();
  for (const item of questions) {
    const number = clean(item.original_number);
    if (number) {
      const normalized = number.toLocaleLowerCase();
      if (seenNumbers.has(normalized)) flags.push("Duplicate main question number detected: " + number + ".");
      seenNumbers.add(normalized);
    }
    flags.push(...questionFlags(item.payload && typeof item.payload === "object" ? item.payload : {}, "Question " + (number || "without a number")));
  }

  for (const item of passages) {
    const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
    if (!clean(payload.passage_text)) flags.push("Passage " + (clean(item.original_number) || "without a number") + " has no passage text.");
    if (/\[(?:unclear|illegible|not clearly legible|unreadable)[^\]]*\]/i.test(clean(payload.passage_text))) {
      flags.push("Passage " + (clean(item.original_number) || "without a number") + " contains an OCR uncertainty placeholder.");
    }
  }

  return {
    version: 1,
    status: flags.length ? "review" : "clear",
    question_count: questions.length,
    passage_count: passages.length,
    flags: [...new Set(flags)],
    checked_at: checkedAt,
  };
}
