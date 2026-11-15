import { subjects } from '../../eligibility-engine/src/catalog.js';

const aliases: Record<string, string> = {
  bangla: 'Bangla',
  bengali: 'Bangla',
  bengalilanguage: 'Bangla',
  bengal: 'Bangla',
  english: 'English',
  englishlanguage: 'English',
  firstlanguageenglish: 'English',
  secondlanguageenglish: 'English',
  mathematics: 'Mathematics',
  math: 'Mathematics',
  maths: 'Mathematics',
  generalmathematics: 'Mathematics',
  furthermathematics: 'Further Mathematics',
  furthermaths: 'Further Mathematics',
  additionalmathematics: 'Further Mathematics',
  statistics: 'Statistics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  economics: 'Economics',
  accounting: 'Accounting',
  accountingandbusiness: 'Accounting',
  businessstudies: 'Business Studies',
  business: 'Business Studies',
  ict: 'ICT',
  informationandcommunicationtechnology: 'ICT',
  informationcommunicationtechnology: 'ICT',
  other: 'Other'
};

const normalizeKey = (value: string) => value.toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '');

/** Exact alias matching only: unknown transcript names remain unmatched for officer review. */
export function normalizeTranscriptSubject(value: string): string | null {
  let name = value.trim();
  name = name.replace(/\([^)]*\d[^)]*\)/g, ' ');
  name = name.replace(/\b(?:syllabus|subject)?\s*(?:code\s*)?\d{3,}[\w/-]*\b/gi, ' ');
  name = name.replace(/\b(?:cambridge|gce|gcse|igcse|ordinary\s+level|advanced\s+subsidiary|(?:o|a|as)\s*[- ]?\s*level)\b/gi, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  const key = normalizeKey(name);
  const exact = aliases[key];
  if (exact && subjects.includes(exact)) return exact;
  return null;
}

export const transcriptGrades = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'] as const;
