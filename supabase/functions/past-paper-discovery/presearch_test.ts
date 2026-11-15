import {
  buildPdfQueryVariants,
  isPrivateAddress,
  isQuestionPaperPdf,
  isValidDiscoveredDomain,
} from "./presearch.ts";

Deno.test("all generated search variants require PDF results", () => {
  const variants = buildPdfQueryVariants("KSEAB Class 10 Kannada 2026");
  if (variants.length < 4 || variants.some((query) => !query.includes("filetype:pdf"))) {
    throw new Error("Every query variation must include the PDF filetype operator.");
  }
});

Deno.test("accepts a relevant HTTPS question-paper PDF", () => {
  const accepted = isQuestionPaperPdf({
    url: "https://school.example.edu/downloads/kannada-annual-question-paper-2026.pdf",
    title: "Class 10 Kannada Annual Question Paper 2026",
    snippet: "Annual examination question paper",
  }, "Class 10 Kannada 2026");
  if (!accepted) throw new Error("A matching question-paper PDF should be accepted.");
});

Deno.test("rejects non-paper PDFs and ordinary web pages", () => {
  const textbook = isQuestionPaperPdf({
    url: "https://school.example.edu/kannada-textbook-2026.pdf",
    title: "Kannada Textbook 2026",
    snippet: "Textbook download",
  }, "Class 10 Kannada 2026");
  const webpage = isQuestionPaperPdf({
    url: "https://school.example.edu/kannada-question-paper-2026",
    title: "Kannada Question Paper 2026",
    snippet: "Question paper page",
  }, "Class 10 Kannada 2026");
  const timetable = isQuestionPaperPdf({
    url: "https://school.example.edu/annual-examination-schedule-2026.pdf",
    title: "Annual Examination Schedule 2026",
    snippet: "Examination timetable and dates",
  }, "Class 10 Kannada 2026");
  if (textbook || webpage || timetable) throw new Error("Textbooks, timetables and HTML pages must not become paper candidates.");
});

Deno.test("rejects non-HTTPS paper links", () => {
  const accepted = isQuestionPaperPdf({
    url: "http://school.example.edu/kannada-question-paper-2026.pdf",
    title: "Kannada Question Paper 2026",
    snippet: "Question paper",
  }, "Kannada 2026");
  const ipHost = isQuestionPaperPdf({
    url: "https://127.0.0.1/kannada-question-paper-2026.pdf",
    title: "Kannada Question Paper 2026",
    snippet: "Question paper",
  }, "Kannada 2026");
  if (accepted || ipHost) throw new Error("Non-HTTPS and IP-literal paper links must be rejected.");
});

Deno.test("validates discovered public DNS names", () => {
  if (!isValidDiscoveredDomain("papers.school.example.in")) throw new Error("Expected a valid domain.");
  if (isValidDiscoveredDomain("127.0.0.1") || isValidDiscoveredDomain("localhost") ||
      isValidDiscoveredDomain("bad..example.com")) throw new Error("Unsafe or malformed hostnames must be rejected.");
});

Deno.test("blocks private and reserved IP ranges", () => {
  for (const address of ["127.0.0.1", "10.0.0.5", "172.16.0.2", "192.168.1.1", "169.254.1.2", "::1", "fd00::1"]) {
    if (!isPrivateAddress(address)) throw new Error("Expected private address to be blocked: " + address);
  }
  if (isPrivateAddress("8.8.8.8")) throw new Error("A public resolver must not be classified as private.");
});
