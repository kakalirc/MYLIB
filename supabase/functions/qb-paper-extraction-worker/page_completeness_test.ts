import { assertEquals } from "jsr:@std/assert@1";
import { auditExtractedPage } from "./page_completeness.ts";

Deno.test("flags a page with no extracted examinable content", () => {
  const audit = auditExtractedPage([]);
  assertEquals(audit.status, "review");
  assertEquals(audit.question_count, 0);
  assertEquals(audit.flags.length, 1);
});

Deno.test("flags duplicate question numbers and incomplete MCQ options", () => {
  const audit = auditExtractedPage([
    { item_kind: "question", original_number: "4", payload: { question_text: "Choose one", question_type: "MCQ", options: [{ option_number: "A", option_text: "Alpha" }] } },
    { item_kind: "question", original_number: "4", payload: { question_text: "Another question", question_type: "short_answer" } },
  ]);
  assertEquals(audit.status, "review");
  assertEquals(audit.flags.some((flag) => flag.includes("Duplicate main question number")), true);
  assertEquals(audit.flags.some((flag) => flag.includes("fewer than two captured options")), true);
});

Deno.test("flags OCR placeholders and empty nested question stems", () => {
  const audit = auditExtractedPage([
    { item_kind: "question", original_number: "2", payload: { question_text: "[unclear]", subquestions: [{ original_number: "a", question_text: "" }] } },
  ]);
  assertEquals(audit.status, "review");
  assertEquals(audit.flags.some((flag) => flag.includes("OCR uncertainty")), true);
  assertEquals(audit.flags.some((flag) => flag.includes("empty stem")), true);
});

Deno.test("keeps a structurally complete page clear", () => {
  const audit = auditExtractedPage([
    { item_kind: "question", original_number: "1", payload: { question_text: "Write a short note.", question_type: "short_answer", subquestions: [] } },
    { item_kind: "passage", original_number: "P1", payload: { passage_text: "A complete source passage." } },
  ]);
  assertEquals(audit.status, "clear");
  assertEquals(audit.question_count, 1);
  assertEquals(audit.passage_count, 1);
});
