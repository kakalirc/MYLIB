import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { strToU8, zipSync } from "npm:fflate@0.8.2";
import { getPdfZipMember, listPdfMembersFromZip } from "./archive.ts";

Deno.test("lists PDF members and ignores non-PDF archive entries", () => {
  const zip = zipSync({
    "set-1.pdf": strToU8("%PDF-1.7\nsample paper"),
    "readme.txt": strToU8("not a paper"),
    "nested/set-2.pdf": strToU8("%PDF-1.4\nsecond set"),
  });
  const members = listPdfMembersFromZip(zip);
  assertEquals(members.map((item) => item.name), ["set-1.pdf", "nested/set-2.pdf"]);
});

Deno.test("returns the requested PDF member exactly", () => {
  const expected = strToU8("%PDF-1.7\npaper");
  const zip = zipSync({ "folder/paper.pdf": expected });
  assertEquals(new TextDecoder().decode(getPdfZipMember(zip, "folder/paper.pdf")), new TextDecoder().decode(expected));
});

Deno.test("rejects invalid ZIP input", () => {
  assertThrows(() => listPdfMembersFromZip(strToU8("not a zip")), Error, "valid ZIP");
});

Deno.test("rejects missing PDF members", () => {
  const zip = zipSync({ "other.pdf": strToU8("%PDF-1.7\npaper") });
  assertThrows(() => getPdfZipMember(zip, "missing.pdf"), Error, "not found");
});

Deno.test("ignores files with a PDF extension but invalid PDF signature", () => {
  const zip = zipSync({ "fake.pdf": strToU8("not a PDF") });
  assertEquals(listPdfMembersFromZip(zip).length, 0);
});
