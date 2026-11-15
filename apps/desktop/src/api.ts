import type { AcademicInput, ExamInput, Evaluation, PracticalInput } from '../../../packages/eligibility-engine/src/types.js';
import type { TranscriptLevel, TranscriptOcrResult } from '../../../packages/transcript-import/src/types.js';

const origin = (import.meta.env.VITE_API_ORIGIN || 'http://127.0.0.1:3001').replace(/\/$/,'');
export const apiOrigin = origin;
export async function api<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${origin}/api/v1${path}`,{
    method,
    headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const data = await response.json().catch(()=>({error:'Invalid server response'}));
  if(!response.ok) throw new Error(typeof data.error==='string'?data.error:JSON.stringify(data.error));
  return data as T;
}
export async function uploadTranscript(token: string, candidateSessionId: string, level: TranscriptLevel, file: File): Promise<TranscriptOcrResult> {
  const response = await fetch(`${origin}/api/v1/candidate-sessions/${candidateSessionId}/transcripts/${level}/ocr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
    body: file
  });
  const data = await response.json().catch(() => ({error:'Invalid server response'}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  return data as TranscriptOcrResult;
}
export interface CandidateListItem { id:string; internal_reference:string; name:string; candidate_session_id:string }
export interface CandidateDetail {
  candidate: CandidateListItem;
  academic: {id:string;snapshot:AcademicInput}|null;
  exams: {id:string;unit_code:string;snapshot:ExamInput}[];
  practicals: {id:string;department_code:string;snapshot:PracticalInput}[];
}
export const getCandidates = (token:string) => api<CandidateListItem[]>('/candidates',token);
export const getCandidate = (token:string,id:string) => api<CandidateDetail>(`/candidates/${id}`,token);
export const getHistory = (token:string,sessionId:string) => api<Evaluation[]>(`/candidate-sessions/${sessionId}/evaluations`,token);
