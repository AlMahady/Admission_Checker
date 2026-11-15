import type { TranscriptLevel, TranscriptOcrResult, TranscriptOcrRow } from '../../../../packages/transcript-import/src/types.js';
import { normalizeTranscriptSubject, transcriptGrades } from '../../../../packages/transcript-import/src/subjects.js';
import { PDFDocument } from 'pdf-lib';

const apiVersion = '2024-11-30';
const modelId = 'prebuilt-layout';
const confidenceThreshold = 0.82;
const maxPollingAttempts = 60;
const defaultPollDelayMs = 3000;
const maxTranscriptPages = 100;

interface Span { offset?: number; length?: number }
interface AzureWord { content?: string; confidence?: number; span?: Span }
interface AzureLine { content?: string; spans?: Span[] }
interface AzurePage { pageNumber?: number; words?: AzureWord[]; lines?: AzureLine[] }
interface AzureCell {
  rowIndex?: number;
  columnIndex?: number;
  content?: string;
  spans?: Span[];
  boundingRegions?: { pageNumber?: number }[];
}
interface AzureTable {
  cells?: AzureCell[];
  boundingRegions?: { pageNumber?: number }[];
}
interface AzureAnalyzeResult {
  content?: string;
  pages?: AzurePage[];
  tables?: AzureTable[];
}
interface AzureOperation {
  status?: string;
  analyzeResult?: AzureAnalyzeResult;
  error?: { code?: string; message?: string };
}
interface RowCandidate {
  page: number;
  text: string;
  grade: string | null;
  subjectConfidence: number | null;
  gradeConfidence: number | null;
}

export class TranscriptOcrError extends Error {
  constructor(message: string, readonly statusCode = 502) { super(message); }
}

function serviceConfig() {
  const endpointValue = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim();
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim();
  if (!endpointValue || !key) {
    throw new TranscriptOcrError('Transcript OCR is not configured. Set the Azure Document Intelligence endpoint and key on the API server.', 503);
  }
  let endpoint: URL;
  try { endpoint = new URL(endpointValue); } catch { throw new TranscriptOcrError('The transcript OCR endpoint is invalid.', 503); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new TranscriptOcrError('The transcript OCR endpoint must be a valid HTTPS resource URL.', 503);
  }
  endpoint.pathname = endpoint.pathname.replace(/\/$/, '');
  return { endpoint, key };
}

function responseError(status: number) {
  if (status === 401 || status === 403) return new TranscriptOcrError('The transcript OCR service rejected its server credentials. Check the Azure resource key.', 503);
  if (status === 413) return new TranscriptOcrError('The transcript is too large for the configured OCR resource.', 413);
  if (status === 429) return new TranscriptOcrError('The transcript OCR service is busy. Wait briefly and retry.', 503);
  if (status >= 400 && status < 500) return new TranscriptOcrError('The OCR service could not read this PDF. Check that it opens without a password and try another copy.', 422);
  return new TranscriptOcrError('The transcript OCR service is temporarily unavailable. Please retry.', 502);
}

async function readJson(response: Response): Promise<AzureOperation> {
  try { return await response.json() as AzureOperation; }
  catch { throw new TranscriptOcrError('The OCR service returned an invalid response. Please retry.'); }
}

function safeOperationUrl(value: string, endpoint: URL) {
  let operation: URL;
  try { operation = new URL(value); } catch { throw new TranscriptOcrError('The OCR service returned an invalid operation address.'); }
  if (operation.protocol !== 'https:' || operation.origin !== endpoint.origin) {
    throw new TranscriptOcrError('The OCR service returned an unsafe operation address.');
  }
  return operation;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

async function analyzePdf(pdf: Buffer): Promise<AzureAnalyzeResult> {
  const { endpoint, key } = serviceConfig();
  const signal = AbortSignal.timeout(180_000);
  const analyzeUrl = new URL(`${endpoint.toString().replace(/\/$/, '')}/documentintelligence/documentModels/${modelId}:analyze`, endpoint);
  analyzeUrl.searchParams.set('_overload', 'analyzeDocument');
  analyzeUrl.searchParams.set('api-version', apiVersion);
  analyzeUrl.searchParams.set('stringIndexType', 'utf16CodeUnit');
  let initial: Response;
  try {
    initial = await fetch(analyzeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': key },
      body: JSON.stringify({ base64Source: pdf.toString('base64') }),
      signal
    });
  } catch (error) {
    if (signal.aborted) throw new TranscriptOcrError('Transcript OCR timed out. Please try again with a smaller PDF.', 504);
    throw new TranscriptOcrError('Could not connect to the transcript OCR service. Please retry.', 502);
  }
  if (initial.status !== 202) throw responseError(initial.status);
  const operationLocation = initial.headers.get('operation-location');
  if (!operationLocation) throw new TranscriptOcrError('The OCR service did not return an analysis operation. Please retry.');
  const operationUrl = safeOperationUrl(operationLocation, endpoint);

  for (let attempt = 0; attempt < maxPollingAttempts; attempt++) {
    const retryAfter = Number(initial.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 5000)
      : defaultPollDelayMs;
    try { await delay(waitMs, signal); }
    catch { throw new TranscriptOcrError('Transcript OCR timed out. Please try again with a smaller PDF.', 504); }
    let response: Response;
    try {
      response = await fetch(operationUrl, { headers: { 'Ocp-Apim-Subscription-Key': key }, signal });
    } catch {
      if (signal.aborted) throw new TranscriptOcrError('Transcript OCR timed out. Please try again with a smaller PDF.', 504);
      throw new TranscriptOcrError('Could not retrieve the transcript OCR result. Please retry.', 502);
    }
    if (!response.ok) throw responseError(response.status);
    const operation = await readJson(response);
    if (operation.status === 'succeeded' && operation.analyzeResult) return operation.analyzeResult;
    if (operation.status === 'failed') throw new TranscriptOcrError('The OCR service could not read this PDF. Check that it opens without a password and try another copy.', 422);
    if (operation.status !== 'running' && operation.status !== 'notStarted') {
      throw new TranscriptOcrError('The OCR service returned an unknown analysis status. Please retry.');
    }
    initial = response;
  }
  throw new TranscriptOcrError('Transcript OCR is taking too long. Please retry shortly.', 504);
}

const gradePattern = /(?<![A-Z0-9])A\*(?![A-Z0-9])|(?<![A-Z0-9])[ABCDEU](?![A-Z0-9])/gi;
const gradeSet = new Set<string>(transcriptGrades);
const stripLevelWords = (value: string) => value
  .replace(/\b(?:O\s*[- ]?\s*Level|A\s*[- ]?\s*Level|AS\s*[- ]?\s*Level|Advanced\s+Subsidiary|Ordinary\s+Level|International\s+GCSE|IGCSE|GCE)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function findGrade(value: string): { grade: string | null; token: string | null; ambiguous: boolean } {
  const prepared = stripLevelWords(value);
  const matches = [...prepared.matchAll(gradePattern)].map(match => match[0].toUpperCase());
  const valid = matches.filter(grade => gradeSet.has(grade));
  if (valid.length === 1) return { grade: valid[0], token: matches.length === 1 ? matches[0] : valid[0], ambiguous: false };
  return { grade: null, token: null, ambiguous: valid.length > 1 };
}

function removeGradeToken(value: string, grade: string | null) {
  if (!grade) return value;
  const token = grade === 'A*' ? 'A\\s*\\*' : grade;
  return value.replace(new RegExp(`(?<![A-Z0-9])${token}(?![A-Z0-9])`, 'i'), ' ');
}

function wordConfidence(spans: Span[] | undefined, pages: AzurePage[]) {
  const targets = (spans ?? []).filter(span => Number.isFinite(span.offset) && Number.isFinite(span.length) && (span.length ?? 0) > 0);
  if (!targets.length) return null;
  const values = pages.flatMap(page => page.words ?? []).filter(word => {
    if (!word.span || !Number.isFinite(word.span.offset) || !Number.isFinite(word.span.length)) return false;
    const wordStart = word.span.offset!;
    const wordEnd = wordStart + word.span.length!;
    return targets.some(span => wordStart < span.offset! + span.length! && wordEnd > span.offset!);
  }).map(word => word.confidence).filter((value): value is number => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rowFromText(candidate: RowCandidate): TranscriptOcrRow | null {
  const printedSubject = stripLevelWords(removeGradeToken(candidate.text, candidate.grade))
    .replace(/\b(?:grade|result|qualification)\s*[:\-]?\s*/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:\d{3,}[\w/-]*|[A-Z]{1,3}\s*\d{2,}[\w/-]*)\b/gi, ' ')
    .replace(/[|:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!printedSubject || /^(subject|grade|result|syllabus|code|name|candidate|session|total|points?)$/i.test(printedSubject)) return null;
  const suggestedSubject = normalizeTranscriptSubject(printedSubject);
  const warnings: string[] = [];
  if (!suggestedSubject) warnings.push('Subject is unmatched; choose a canonical subject or Other.');
  if (!candidate.grade) warnings.push('Grade was not read unambiguously; select the grade shown on the transcript.');
  if (candidate.subjectConfidence === null || candidate.subjectConfidence < confidenceThreshold || candidate.gradeConfidence === null || candidate.gradeConfidence < confidenceThreshold) {
    warnings.push('OCR confidence is low or unavailable; check this row against the PDF.');
  }
  const qualification = /\b(?:AS|AS[- ]LEVEL|ADVANCED SUBSIDIARY)\b/i.test(candidate.text) ? 'AS' : 'FULL';
  return {
    id: crypto.randomUUID(),
    page: candidate.page,
    printedSubject,
    suggestedSubject,
    grade: candidate.grade as TranscriptOcrRow['grade'],
    qualification,
    confidence: { subject: candidate.subjectConfidence, grade: candidate.gradeConfidence },
    reviewRequired: warnings.length > 0,
    warnings
  };
}

function tableRows(result: AzureAnalyzeResult): RowCandidate[] {
  const output: RowCandidate[] = [];
  for (const table of result.tables ?? []) {
    const grouped = new Map<number, AzureCell[]>();
    for (const cell of table.cells ?? []) {
      const rowIndex = cell.rowIndex ?? -1;
      if (rowIndex < 0) continue;
      grouped.set(rowIndex, [...(grouped.get(rowIndex) ?? []), cell]);
    }
    for (const cells of grouped.values()) {
      const content = cells.map(cell => cell.content?.trim() ?? '').filter(Boolean);
      if (!content.length) continue;
      const exactGradeCells = cells.filter(cell => gradeSet.has((cell.content ?? '').trim().toUpperCase()));
      const allGrades = content.flatMap(text => [...stripLevelWords(text).matchAll(gradePattern)].map(match => match[0].toUpperCase()).filter(grade => gradeSet.has(grade)));
      let grade: string | null = null;
      let gradeSources: Span[][] = [];
      let ambiguous = false;
      if (exactGradeCells.length === 1) {
        grade = (exactGradeCells[0].content ?? '').trim().toUpperCase();
        gradeSources = [exactGradeCells[0].spans ?? []];
      } else if (exactGradeCells.length > 1) {
        ambiguous = true;
      } else if (allGrades.length === 1) {
        grade = allGrades[0];
        const gradeCell = cells.find(cell => findGrade(cell.content ?? '').grade === grade);
        gradeSources = [gradeCell?.spans ?? []];
      } else if (allGrades.length > 1) {
        ambiguous = true;
      }
      const subjectCells = exactGradeCells.length === 1 ? cells.filter(cell => cell !== exactGradeCells[0]) : cells;
      const subjectText = subjectCells.map(cell => removeGradeToken(cell.content ?? '', grade)).filter(Boolean).join(' ');
      if (!subjectText.trim() || /\b(?:subject|grade|result|syllabus|candidate|session)\b/i.test(subjectText) && !normalizeTranscriptSubject(subjectText)) continue;
      const page = cells.flatMap(cell => cell.boundingRegions ?? []).map(region => region.pageNumber).find(Number.isFinite)
        ?? table.boundingRegions?.map(region => region.pageNumber).find(Number.isFinite)
        ?? 1;
      const subjectConfidence = wordConfidence(subjectCells.flatMap(cell => cell.spans ?? []), result.pages ?? []);
      const gradeConfidence = gradeSources.length ? wordConfidence(gradeSources.flat(), result.pages ?? []) : null;
      output.push({ page, text: subjectText, grade: ambiguous ? null : grade, subjectConfidence, gradeConfidence });
    }
  }
  return output;
}

function lineRows(result: AzureAnalyzeResult, known: RowCandidate[]): RowCandidate[] {
  const output: RowCandidate[] = [];
  for (const page of result.pages ?? []) {
    for (const line of page.lines ?? []) {
      const text = line.content?.trim() ?? '';
      if (!text) continue;
      const parsed = findGrade(text);
      if (!parsed.grade && !parsed.ambiguous) continue;
      const confidence = wordConfidence(line.spans, result.pages ?? []);
      const textSubject = normalizeTranscriptSubject(removeGradeToken(text, parsed.grade));
      const tableRowIndex = known.findIndex(row => row.page === (page.pageNumber ?? 1)
        && (row.grade === parsed.grade || row.grade === null || parsed.grade === null)
        && (textSubject ? normalizeTranscriptSubject(row.text) === textSubject : row.text.toLocaleLowerCase('en').replace(/\s+/g, ' ') === text.toLocaleLowerCase('en').replace(/\s+/g, ' ')));
      if (tableRowIndex >= 0) {
        if (!known[tableRowIndex].grade && parsed.grade) {
          known[tableRowIndex].grade = parsed.grade;
          known[tableRowIndex].gradeConfidence = confidence;
        }
        continue;
      }
      output.push({ page: page.pageNumber ?? 1, text, grade: parsed.grade, subjectConfidence: confidence, gradeConfidence: confidence });
    }
  }
  return output;
}

function metadata(lines: string[]) {
  const labelledValue = (pattern: RegExp) => {
    for (let index = 0; index < lines.length; index++) {
      const match = lines[index].match(pattern);
      if (!match) continue;
      const sameLineValue = match[1]?.replace(/^\s*[:\-]\s*/, '').trim();
      if (sameLineValue) return sameLineValue;
      const nextLine = lines[index + 1]?.trim();
      if (nextLine && !/^(?:candidate|student|board|session|date|centre|center|syllabus)\b/i.test(nextLine)) return nextLine;
    }
    return null;
  };
  const candidateName = labelledValue(/\b(?:candidate|student)(?:'s)?\s+name\s*(.*)$/i);
  const candidateNumber = labelledValue(/\b(?:candidate|student)\s+(?:number|no\.?|id)\s*(.*)$/i);
  const board = lines.map(line => {
    const labelled = line.match(/\b(?:examination\s+)?board\s*[:\-]\s*(.+)$/i)?.[1]?.trim();
    if (labelled) return labelled;
    return line.match(/\b(?:Cambridge International(?: Education)?|Pearson Edexcel|Oxford AQA|British Council)\b/i)?.[0] ?? null;
  }).find(Boolean) ?? null;
  const session = lines.map(line => {
    if (!/\b(?:session|series|examination|exam|may|june|october|oct|november|nov|march|winter|summer)\b/i.test(line)) return null;
    const labelled = line.match(/\b(?:session|series)\s*[:\-]?\s*(.+)$/i)?.[1]?.trim();
    if (labelled) return labelled;
    return line.match(/\b(?:(?:May\s*[/\-]\s*June|Oct(?:ober)?\s*[/\-]\s*Nov(?:ember)?|March|June|November|Winter|Summer)\s*[,/-]?\s*20\d{2}|20\d{2}\s*(?:May\s*[/\-]\s*June|Oct(?:ober)?\s*[/\-]\s*Nov(?:ember)?|March|June|November|Winter|Summer))\b/i)?.[0]?.trim() ?? null;
  }).find(Boolean) ?? null;
  const yearMatch = session?.match(/20\d{2}/);
  return {
    candidate: { name: candidateName, number: candidateNumber },
    examination: { board, session, year: yearMatch ? Number(yearMatch[0]) : null }
  };
}

export async function extractTranscript(pdf: Buffer, level: TranscriptLevel): Promise<TranscriptOcrResult> {
  let pageCount: number;
  try {
    const document = await PDFDocument.load(pdf, { ignoreEncryption:false, updateMetadata:false, throwOnInvalidObject:true });
    pageCount = document.getPageCount();
  } catch {
    throw new TranscriptOcrError('This PDF is encrypted, damaged or unsupported. Save an unlocked copy and upload it again.', 422);
  }
  if (pageCount < 1) throw new TranscriptOcrError('The uploaded PDF contains no pages.', 422);
  if (pageCount > maxTranscriptPages) throw new TranscriptOcrError(`Transcript PDFs must contain ${maxTranscriptPages} pages or fewer.`, 413);
  const analyzed = await analyzePdf(pdf);
  const pages = analyzed.pages ?? [];
  const pageNumbers = new Set(pages.map(page => page.pageNumber).filter((page): page is number => typeof page === 'number'));
  const everyPageReturned = pageNumbers.size === pageCount && Array.from({length:pageCount},(_,index)=>pageNumbers.has(index+1)).every(Boolean);
  if (pages.length !== pageCount || !everyPageReturned) {
    throw new TranscriptOcrError(`OCR processed ${pages.length} of ${pageCount} PDF pages. No results were imported. Configure Azure Document Intelligence Standard (S0) for complete multipage processing, then retry.`, 422);
  }
  const structuredRows = tableRows(analyzed);
  const candidates = [...structuredRows, ...lineRows(analyzed, structuredRows)];
  const rows = candidates.map(rowFromText).filter((row): row is TranscriptOcrRow => row !== null);
  const lines = pages.flatMap(page => (page.lines ?? []).map(line => line.content ?? '')).filter(Boolean);
  const extractedMetadata = metadata(lines);
  return {
    level,
    pages: pages.length,
    ...extractedMetadata,
    rows
  };
}
