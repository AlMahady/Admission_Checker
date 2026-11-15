export type UnitCode = 'A' | 'B' | 'C' | 'C1' | 'D' | 'E' | 'IBA';
export type Status = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_REVIEW' | 'NOT_ATTEMPTED';
export type CheckResult = 'PASS' | 'FAIL' | 'UNKNOWN';
export interface Source { pdfPage: number; section: string }
export interface Check {
  ruleId: string;
  label: string;
  result: CheckResult;
  actual: string;
  required: string;
  source: Source;
  informational?: boolean;
}
export interface SubjectResult {
  id: string;
  level: 'O' | 'A';
  qualification: 'FULL' | 'AS';
  subject: string;
  printedName?: string;
  syllabusCode?: string;
  grade: string;
  sitting?: string;
}
export interface AcademicInput {
  oBoard: string;
  aBoard: string;
  oYear: number | null;
  aYear: number | null;
  oComplete: boolean;
  aComplete: boolean;
  verified: boolean;
  track?: 'SCIENCE' | 'HUMANITIES' | 'BUSINESS' | '';
  verificationReference?: string;
  subjects: SubjectResult[];
  qualifyingSevenIds: string[];
  selectionApprovalReference?: string;
}
export interface ExamInput {
  unit: UnitCode;
  pattern: string;
  officialTotal: string;
  scores: Record<string, string>;
  verified: boolean;
  resultReference?: string;
}
export interface PracticalInput {
  departmentCode: string;
  score: string;
  verified: boolean;
  reference?: string;
}
export interface CandidateInput {
  internalReference: string;
  name: string;
  academic: AcademicInput;
  exams: ExamInput[];
  practicals: PracticalInput[];
}
export interface Decision {
  unitCode: UnitCode;
  departmentCode?: string;
  departmentName?: string;
  status: Status;
  checks: Check[];
}
export interface Evaluation {
  id?: string;
  session: '2025-2026';
  policyVersion: string;
  policyHash: string;
  engineVersion: string;
  phase: 'UNITS' | 'DEPARTMENTS';
  candidate: { internalReference: string; name: string };
  inputSnapshot: CandidateInput;
  createdAt: string;
  decisions: Decision[];
}
export interface Policy {
  version: string;
  hash: string;
  approved: Partial<Record<'P01'|'P02'|'P03'|'P04'|'P05'|'P06'|'P07'|'P08'|'P09'|'P11'|'P12', boolean>>;
  /** Explicit authority decisions for conditions whose accepted qualification level is unclear in the draft. */
  subjectLevelBindings?: Partial<Record<'A_STATISTICS'|'A_ENVIRONMENT'|'B_ECONOMICS'|'B_PLANNING'|'C_BANGLA'|'D_PUBLIC_HEALTH', 'O'|'A'|'EITHER'>>;
}
