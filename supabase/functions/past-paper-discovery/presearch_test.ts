import {
  buildPdfQueryVariants,
  isPrivateAddress,
  isQuestionPaperPdf,
  isValidDiscoveredDomain,
} from "./presearch.ts";
import { isAglaSemCollectionUrl, isAglaSemDomain } from "./source-domain.ts";

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

Deno.test("accepts extensionless PDF search results only with a PDF hint", () => {
  const accepted = isQuestionPaperPdf({
    url: "https://school.example.edu/download?id=2026-kannada",
    title: "Class 10 Kannada Question Paper 2026",
    snippet: "Question paper PDF download",
    pdf_search_hint: true,
  }, "Class 10 Kannada 2026");
  const unhinted = isQuestionPaperPdf({
    url: "https://school.example.edu/kannada-question-paper-2026",
    title: "Class 10 Kannada Question Paper 2026",
    snippet: "Question paper page",
  }, "Class 10 Kannada 2026");
  if (!accepted || unhinted) throw new Error("Extensionless results require the PDF search hint and are verified as direct PDFs later.");
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

Deno.test("accepts AglaSem single-document download endpoints as unverified PDF candidates", () => {
  const accepted = isQuestionPaperPdf({
    url: "https://docs.aglasem.com/product/single-doc-download/b02eb080-930a-11f1-bf7d-0aa932765c8b?url=https%3A%2F%2Fdocs.aglasem.com%2Fview%2Fb02eb080-930a-11f1-bf7d-0aa932765c8b",
    title: "NIOS Class 12 April 2024 Question Paper Accountancy",
    snippet: "AglaSem document download endpoint · NIOS Class 12 April 2024 Question Paper Accountancy",
    pdf_search_hint: true,
  }, "question paper");
  if (!accepted) throw new Error("AglaSem extensionless document download endpoints should be retained as PDF candidates for later verification.");
  const inheritedCollectionContext = isQuestionPaperPdf({
    url: "https://docs.aglasem.com/product/single-doc-download/4e86fedc-9314-11f1-ae33-0aa932765c8b",
    title: "Accountancy",
    snippet: "Question paper PDF download endpoint linked from AglaSem collection /org/nios/nios-class-12/question-paper · Accountancy",
    pdf_search_hint: true,
  }, "NIOS Class 12");
  if (!inheritedCollectionContext) throw new Error("A document download linked from a question-paper collection must retain the parent collection context even when the document title omits 'question paper'.");
});

Deno.test("recognizes AglaSem collection URLs and first-party subdomains", () => {
  const nios = isAglaSemCollectionUrl(new URL("https://docs.aglasem.com/org/nios/nios-class-12/question-paper"));
  const legacy = isAglaSemCollectionUrl(new URL("https://aglasem.com/cbse-class-12-question-paper-sanskrit-core/"));
  const docs = isAglaSemDomain("docs.aglasem.com");
  const cdn = isAglaSemDomain("cdn.aglasem.com");
  const unrelated = isAglaSemDomain("aglasem.example.org");
  if (!nios || !legacy || !docs || !cdn || unrelated) {
    throw new Error("AglaSem collection pages and first-party subdomains must be recognized without accepting unrelated domains.");
  }
});
