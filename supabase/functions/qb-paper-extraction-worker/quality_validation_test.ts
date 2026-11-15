import { assertEquals } from "jsr:@std/assert@1";
import { assessExtractionQuality, formatOption } from "./quality_validation.ts";

Deno.test("formats structured options without producing [object Object]", () => {
  assertEquals(formatOption({ option_number: "A", option_text: "Choice one" }), "A. Choice one");
});

Deno.test("flags a missing middle option label in an MCQ", () => {
  const result = assessExtractionQuality({
    question_text: "Choose the correct answer",
    question_type: "MCQ",
    options: [
      { option_number: "A", option_text: "One" },
      { option_number: "C", option_text: "Three" },
      { option_number: "D", option_text: "Four" },
    ],
    subquestions: [],
  });
  assertEquals(result.status, "warning");
  assertEquals(result.flags.some((flag) => flag.includes("not sequential")), true);
});

Deno.test("flags MCQs with no captured options but permits short answers without options", () => {
  const mcq = assessExtractionQuality({ question_text: "Select one", question_type: "MCQ", options: null });
  const shortAnswer = assessExtractionQuality({ question_text: "Write one sentence", question_type: "short_answer", options: null });
  assertEquals(mcq.status, "warning");
  assertEquals(mcq.flags.some((flag) => flag.includes("no captured answer options")), true);
  assertEquals(shortAnswer.status, "pass");
});

Deno.test("validates options on nested MCQ subquestions independently", () => {
  const result = assessExtractionQuality({
    question_text: "Read the passage and answer",
    question_type: "comprehension",
    subquestions: [
      { original_number: "I", question_text: "Choose the answer", question_type: "MCQ", options: [{ option_number: "A", option_text: "Yes" }] },
      { original_number: "II", question_text: "Answer in one sentence", question_type: "short_answer", options: null },
    ],
  });
  assertEquals(result.status, "warning");
  assertEquals(result.flags.some((flag) => flag.includes("Subquestion I") && flag.includes("not sequential") === false), true);
  assertEquals(result.flags.some((flag) => flag.includes("Subquestion II") && flag.includes("no captured answer options")), false);
});

Deno.test("flags OCR placeholders and extractor notes for manual review", () => {
  const result = assessExtractionQuality({
    question_text: "[Subquestion text not clearly legible]",
    question_type: "short_answer",
    extraction_notes: "Part of the stem is unclear.",
  });
  assertEquals(result.status, "warning");
  assertEquals(result.flags.some((flag) => flag.includes("placeholder")), true);
  assertEquals(result.flags.some((flag) => flag.includes("manual-review")), true);
});
