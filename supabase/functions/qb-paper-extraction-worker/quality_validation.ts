export type ExtractionQuality = { status: "pass" | "warning"; flags: string[] };

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export function formatOption(option: unknown): string {
  if (option == null) return "";
  if (typeof option === "string" || typeof option === "number") return String(option);
  if (typeof option !== "object" || Array.isArray(option)) return clean(option);
  const value = option as Record<string, unknown>;
  const label = clean(value.option_number ?? value.label ?? value.key);
  const text = clean(value.option_text ?? value.text ?? value.value);
  return [label, text].filter(Boolean).join(". ");
}

function optionFlags(options: unknown, path: string): string[] {
  if (!Array.isArray(options) || options.length === 0) return [`${path}: MCQ has no captured answer options.`];
  const flags: string[] = [];
  if (options.length < 2) flags.push(`${path}: fewer than two answer options were captured; verify against the PDF.`);
  const labels = options.map((option) => {
    if (option && typeof option === "object" && !Array.isArray(option)) {
      const item = option as Record<string, unknown>;
      return clean(item.option_number ?? item.label ?? item.key);
    }
    return "";
  });
  const texts = options.map((option) => {
    if (option && typeof option === "object" && !Array.isArray(option)) {
      const item = option as Record<string, unknown>;
      return clean(item.option_text ?? item.text ?? item.value);
    }
    return typeof option === "string" ? option.trim() : "";
  });
  if (options.some((option, index) => !formatOption(option) || !texts[index])) {
    flags.push(`${path}: one or more answer options have no readable option text.`);
  }
  const nonEmptyLabels = labels.filter(Boolean);
  if (nonEmptyLabels.length && nonEmptyLabels.length !== labels.length) {
    flags.push(`${path}: option labels are missing or inconsistently structured.`);
  }
  if (nonEmptyLabels.length === labels.length && labels.length > 1) {
    const normalized = labels.map((label) => label.toUpperCase().replace(/[().]/g, ""));
    if (new Set(normalized).size !== normalized.length) flags.push(`${path}: duplicate option labels were detected.`);
    const alpha = normalized.every((label) => /^[A-Z]$/.test(label));
    const numeric = normalized.every((label) => /^\\d+$/.test(label));
    if (alpha || numeric) {
      const values = normalized.map((label) => alpha ? label.charCodeAt(0) : Number(label));
      if (values.some((value, index) => index > 0 && value !== values[index - 1] + 1)) {
        flags.push(`${path}: option labels are not sequential; a choice may be missing or out of order.`);
      }
    }
  }
  const normalizedTexts = texts.filter(Boolean).map((text) => text.toLocaleLowerCase().replace(/\\s+/g, " "));
  if (new Set(normalizedTexts).size !== normalizedTexts.length) flags.push(`${path}: duplicate option text was detected.`);
  return flags;
}

function isMcq(item: Record<string, unknown>): boolean {
  const type = clean(item.question_type).toLowerCase().replace(/[ _-]+/g, " ");
  return type === "mcq" || type === "multiple choice" || type === "multiple choice question";
}

export function assessExtractionQuality(payload: Record<string, unknown>): ExtractionQuality {
  const flags: string[] = [];
  const questionText = clean(payload.question_text);
  if (!questionText && Array.isArray(payload.subquestions) && payload.subquestions.length) {
    // Parent prompts may legitimately consist only of grouped subquestions.
  } else if (!questionText) {
    flags.push("Question stem is empty.");
  }
  if (/\\[(?:unclear|illegible|question text not clearly legible|subquestion text not clearly legible)[^\\]]*\\]/i.test(questionText)) {
    flags.push("Question stem contains an OCR placeholder or unresolved text.");
  }
  if (isMcq(payload)) flags.push(...optionFlags(payload.options, "Main question"));
  if (Array.isArray(payload.subquestions)) {
    payload.subquestions.forEach((part, index) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        flags.push(`Subquestion ${index + 1} is not a valid object.`);
        return;
      }
      const sub = part as Record<string, unknown>;
      const label = clean(sub.original_number) || String(index + 1);
      if (!clean(sub.question_text)) flags.push(`Subquestion ${label} has an empty question stem.`);
      if (/\\[(?:unclear|illegible|question text not clearly legible|subquestion text not clearly legible)[^\\]]*\\]/i.test(clean(sub.question_text))) {
        flags.push(`Subquestion ${label} contains an OCR placeholder or unresolved text.`);
      }
      if (isMcq(sub)) flags.push(...optionFlags(sub.options, `Subquestion ${label}`));
    });
  }
  if (clean(payload.extraction_notes)) flags.push("Extractor supplied a manual-review note.");
  return { status: flags.length ? "warning" : "pass", flags };
}
