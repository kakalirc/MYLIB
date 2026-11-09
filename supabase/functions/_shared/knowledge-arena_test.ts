import { assertEquals } from "jsr:@std/assert";
import { GAME_CATALOG, gameSubjects, validGameType } from "./knowledge-arena.ts";

Deno.test("catalogue contains the 14 approved named games", () => {
  assertEquals(GAME_CATALOG.length, 14);
  assertEquals(GAME_CATALOG.some((game) => game.id === "coding_logic"), false);
});

Deno.test("all approved game IDs pass validation", () => {
  for (const game of GAME_CATALOG) assertEquals(validGameType(game.id), true);
  assertEquals(validGameType("coding_logic"), false);
});

Deno.test("subject routing keeps Math and Science games separate", () => {
  assertEquals(gameSubjects("number_quest", ["Math", "Science"]), ["Math"]);
  assertEquals(gameSubjects("science_explorer", ["Math", "Science"]), ["Science"]);
});

Deno.test("multi-subject games can use the enabled LIB subject catalogue", () => {
  assertEquals(gameSubjects("quick_quiz", ["English", "Economics"]), ["English", "Economics"]);
});
