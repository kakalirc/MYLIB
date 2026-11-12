import { unzipSync } from "npm:fflate@0.8.2";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED_BYTES = 80 * 1024 * 1024;
const MAX_PDF_MEMBERS = 20;

function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, Math.min(1024, bytes.length))).includes("%PDF-");
}

export function listPdfMembersFromZip(bytes: Uint8Array): Array<{ name: string; bytes: Uint8Array }> {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("Archive is not a valid ZIP file.");
  }
  let selectedBytes = 0;
  let selectedFiles = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (!/\.pdf$/i.test(file.name) || file.originalSize <= 0 || file.originalSize > MAX_PDF_BYTES) return false;
      if (selectedFiles >= MAX_PDF_MEMBERS || selectedBytes + file.originalSize > MAX_TOTAL_EXTRACTED_BYTES) return false;
      selectedFiles++;
      selectedBytes += file.originalSize;
      return true;
    },
  });
  const out: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const [name, data] of Object.entries(files)) {
    if (!/\.pdf$/i.test(name) || data.length > MAX_PDF_BYTES || !isPdf(data)) continue;
    out.push({ name, bytes: data });
  }
  return out;
}

export function getPdfZipMember(bytes: Uint8Array, memberName: string): Uint8Array {
  const member = listPdfMembersFromZip(bytes).find((item) => item.name === memberName);
  if (!member) throw new Error("The selected PDF was not found inside the ZIP archive. Run discovery again.");
  return member.bytes;
}
