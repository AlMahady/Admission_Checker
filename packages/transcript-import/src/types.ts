export type TranscriptLevel = 'O' | 'A';

export interface TranscriptOcrConfidence {
  subject: number | null;
  grade: number | null;
}

export interface TranscriptOcrRow {
  id: string;
  page: number;
  printedSubject: string;
  suggestedSubject: string | null;
  grade: 'A*' | 'A' | 'B' | 'C' | 'D' | 'E' | 'U' | null;
  qualification: 'FULL' | 'AS';
  confidence: TranscriptOcrConfidence;
  reviewRequired: boolean;
  warnings: string[];
}

export interface TranscriptOcrResult {
  level: TranscriptLevel;
  pages: number;
  candidate: {
    name: string | null;
    number: string | null;
  };
  examination: {
    board: string | null;
    session: string | null;
    year: number | null;
  };
  rows: TranscriptOcrRow[];
}
