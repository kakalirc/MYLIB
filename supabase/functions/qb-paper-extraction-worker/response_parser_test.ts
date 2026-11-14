import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { parseQuestionItems } from "./response_parser.ts";

Deno.test("parses valid extraction JSON without repair", () => {
  const result = parseQuestionItems(JSON.stringify({ items: [
    { item_kind: "question", page_number: 1, payload: { question_text: "ಪ್ರಶ್ನೆ" } },
  ] }));
  assertEquals(result.repaired, false);
  assertEquals(result.items.length, 1);
});

Deno.test("repairs a missing comma in model JSON without another provider request", () => {
  const result = parseQuestionItems('{"items":[{"item_kind":"question","page_number":1 "payload":{"question_text":"ಪ್ರಶ್ನೆ"}}]}');
  assertEquals(result.repaired, true);
  assertEquals(result.items[0].payload.question_text, "ಪ್ರಶ್ನೆ");
});

Deno.test("rejects unsupported item kinds after parsing", async () => {
  await assertRejects(
    async () => parseQuestionItems('{"items":[{"item_kind":"unknown","page_number":1,"payload":{}}]}'),
    Error,
    "unsupported item_kind",
  );
});

Deno.test("rejects unrecoverable malformed output", async () => {
  await assertRejects(
    async () => parseQuestionItems('{"items":[{"item_kind":"question","page_number":'),
    Error,
    "malformed and could not be safely repaired",
  );
});
