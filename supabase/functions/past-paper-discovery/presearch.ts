// Pure helpers for PDF-focused question-paper discovery. Kept separate for deterministic unit tests.
export function queryTerms(query: string): string[] {
  return query.toLowerCase()
    .replace(/\b(cbse|cisce|icse|isc|question papers?|previous year|past papers?|sample papers?|specimen|pdf|class|grade)\b/g, " ")
    .replace(/\b(x|xii|10|12)\b/g, " ")
    .split(/[^a-z0-9]+/).filter((x) => x.length > 1);
}

export function matchesQuery(label: string, terms: string[]): boolean {
  const value = label.toLowerCase();
  return !terms.length || terms.some((term) => value.includes(term));
}

export function buildPdfQueryVariants(query: string): string[] {
  return [
    query + " question paper filetype:pdf",
    query + " previous year examination paper filetype:pdf",
    query + " annual exam question paper filetype:pdf",
    query + " sample question paper filetype:pdf",
  ];
}

export function isValidDiscoveredDomain(domain: string): boolean {
  return /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain);
}

export function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];
  const octets = value.split(".").map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  return value === "::" || value === "::1" || value.startsWith("fc") ||
    value.startsWith("fd") || value.startsWith("fe80:") || value.startsWith("ff") ||
    (value.startsWith("::ffff:") && isPrivateAddress(value.slice(7)));
}

export function isQuestionPaperPdf(row: any, query: string): boolean {
  let parsed: URL;
  try { parsed = new URL(String(row.url || "")); } catch { return false; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      !isValidDiscoveredDomain(parsed.hostname.toLowerCase())) return false;
  if (row.archive_member) return true;
  // AglaSem collection pages explicitly enumerate question-paper documents.
  // Their single-doc-download endpoints are extensionless and their document
  // titles often contain only the subject, so retain these trusted candidates
  // for later direct-PDF verification instead of applying generic title rules.
  if (row.aglasem_collection_candidate === true) {
    return parsed.hostname.toLowerCase() === "docs.aglasem.com" &&
      /\\/product\\/single-doc-download\\/[a-f0-9-]{30,}/i.test(parsed.pathname);
  }
  if (!parsed.pathname.toLowerCase().endsWith(".pdf") && !row.pdf_search_hint) return false;
  const evidence = [row.title, row.snippet, row.url].join(" ").toLowerCase();
  const normalizedEvidence = " " + evidence.replace(/[^a-z0-9]+/g, " ") + " ";
  const paperSignals = [
    "question paper", "question-paper", "question_paper", "sample paper", "sample-paper",
    "specimen paper", "specimen-paper", "past paper", "exam paper", "board paper", " qp ",
  ];
  return paperSignals.some((signal) => (signal === " qp " ? normalizedEvidence.includes(signal) : evidence.includes(signal))) &&
    matchesQuery(evidence, queryTerms(query));
}

/** Restrict registered board crawling when the query names a specific board. */
export function filterBoardSourcesForQuery<T extends { domain?: string; display_name?: string }>(sources: T[], query: string): T[] {
  const q = query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const families: Array<{ query: RegExp; source: RegExp }> = [
    { query: /\b(karnataka|kseab)\b/, source: /karnataka|kseab|karnataka school examination|secondary education examination board/ },
    { query: /\b(cbse|central board of secondary education)\b/, source: /cbse|central board of secondary education/ },
    { query: /\b(cisce|icse|isc|council for the indian school certificate)\b/, source: /cisce|icse|council for the indian school certificate/ },
    { query: /\b(kerala|kbpe|pareeksha bhavan)\b/, source: /kerala|kbpe|pareeksha bhavan/ },
    { query: /\b(maharashtra|msbshse|msbshe)\b/, source: /maharashtra|msbshse|msbshe/ },
    { query: /\b(tamil nadu|tn state board|dge tn)\b/, source: /tamil nadu|dge tn|dge\.tn/ },
    { query: /\b(andhra pradesh|bse ap|bie ap)\b/, source: /andhra pradesh|bseap|bse ap|bieap/ },
    { query: /\b(telangana|bse ts|bse telangana)\b/, source: /telangana|bse telangana|bse ts/ },
  ];
  const family = families.find((item) => item.query.test(q));
  if (!family) return sources;
  return sources.filter((source) => family.source.test(String(source.domain || '').toLowerCase()) || family.source.test(String(source.display_name || '').toLowerCase()));
}
