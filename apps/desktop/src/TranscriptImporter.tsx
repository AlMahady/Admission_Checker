import React, { useEffect, useMemo, useState } from 'react';
import { subjects } from '../../../packages/eligibility-engine/src/catalog.js';
import type { SubjectResult } from '../../../packages/eligibility-engine/src/types.js';
import type { TranscriptLevel, TranscriptOcrResult, TranscriptOcrRow } from '../../../packages/transcript-import/src/types.js';
import { uploadTranscript } from './api.js';

type ReviewRow = TranscriptOcrRow & { reviewSubject: string; reviewGrade: string; included: boolean; manual: boolean };
type ApplyMode = '' | 'REPLACE' | 'APPEND';

function initialRows(result: TranscriptOcrResult): ReviewRow[] {
  return result.rows.map(row => ({...row, reviewSubject:row.suggestedSubject ?? '', reviewGrade:row.grade ?? '', included:true, manual:false}));
}

function confidenceText(value: number | null) {
  if (value === null) return 'Unavailable';
  return `${Math.round(value * 100)}%`;
}

export function TranscriptImporter({
  token, candidateSessionId, level, existingSubjects, onConfirm
}: {
  token: string;
  candidateSessionId: string;
  level: TranscriptLevel;
  existingSubjects: SubjectResult[];
  onConfirm: (rows: SubjectResult[], board: string, year: number | null, mode: Exclude<ApplyMode, ''>) => void;
}) {
  const title = level === 'O' ? 'O-Level' : 'A-Level';
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sourcePage, setSourcePage] = useState(1);
  const [result, setResult] = useState<TranscriptOcrResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [board, setBoard] = useState('');
  const [year, setYear] = useState('');
  const [mode, setMode] = useState<ApplyMode>('');
  const [reviewed, setReviewed] = useState(false);
  const [acknowledgedDuplicates, setAcknowledgedDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!file) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const included = rows.filter(row => row.included);
  const incomplete = included.some(row => !row.reviewSubject || !row.reviewGrade);
  const invalidYear = year.trim() !== '' && (!/^\d{4}$/.test(year.trim()) || Number(year) < 1900 || Number(year) > 2099);
  const duplicates = useMemo(() => included.filter(row => existingSubjects.some(existing => existing.level === level && existing.subject === row.reviewSubject)), [existingSubjects, included, level]);
  const duplicateConfirmationNeeded = !success && mode === 'APPEND' && duplicates.length > 0;
  const canConfirm = Boolean(result && included.length && !incomplete && !invalidYear && reviewed && mode && !busy && !success && (!duplicateConfirmationNeeded || acknowledgedDuplicates));

  const updateRow = (rowId: string, update: Partial<ReviewRow>) => {
    setReviewed(false);
    setAcknowledgedDuplicates(false);
    setSuccess(false);
    setRows(current => current.map(row => row.id === rowId ? {...row, ...update} : row));
  };
  const processFile = async () => {
    if (!file) return;
    setBusy(true); setError(''); setSuccess(false); setResult(null); setRows([]); setReviewed(false); setMode(''); setAcknowledgedDuplicates(false);
    try {
      const extracted = await uploadTranscript(token, candidateSessionId, level, file);
      setResult(extracted);
      setRows(initialRows(extracted));
      setBoard(extracted.examination.board ?? '');
      setYear(extracted.examination.year ? String(extracted.examination.year) : '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };
  const addMissing = () => {
    setReviewed(false); setSuccess(false); setAcknowledgedDuplicates(false);
    setRows(current => [...current, {
      id:crypto.randomUUID(), page:0, printedSubject:'', suggestedSubject:null, grade:null,
      qualification:'FULL', confidence:{subject:null,grade:null}, reviewRequired:true,
      warnings:['Manually added by the officer.'], reviewSubject:'', reviewGrade:'', included:true, manual:true
    }]);
  };
  const confirm = () => {
    if (!canConfirm || !mode) return;
    const confirmed = included.map(row => ({
      id:row.id, level, qualification:row.qualification, subject:row.reviewSubject,
      printedName:row.printedSubject.trim() || row.reviewSubject, grade:row.reviewGrade
    } satisfies SubjectResult));
    onConfirm(confirmed, board.trim(), year.trim() ? Number(year) : null, mode);
    setSuccess(true);
  };

  return <section className="transcript-import" aria-label={`${title} transcript upload and review`}>
    <div className="transcript-import-heading"><div><span className="eyebrow">AI TRANSCRIPT READING</span><h3>Upload {title} transcript</h3></div><span className="privacy-chip">No app-side file storage</span></div>
    <p>The PDF is sent to the university's configured Azure OCR resource and processed in memory. Upload a PDF to extract candidate details, examination information, subjects and grades; nothing enters the form until you confirm it.</p>
    <div className="transcript-upload-controls">
      <label className="pdf-picker"><span>Choose PDF</span><input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event=>{setFile(event.currentTarget.files?.[0] ?? null);setError('');setResult(null);setSuccess(false);}}/></label>
      <button className="button secondary" type="button" disabled={!file || busy} onClick={()=>void processFile()}>{busy?'Reading transcript…':'Extract with AI'}</button>
      {file&&<span className="selected-file">{file.name}</span>}
    </div>
    <small className="transcript-upload-hint">PDF only · up to 20 MB and 100 pages · requires server-side Azure OCR configuration</small>
    {error&&<div role="alert" className="transcript-error">{error}</div>}
    {busy&&<div role="status" className="transcript-progress">Reading all transcript pages. This can take a short while.</div>}
    {result&&<div className="transcript-review">
      <div className="transcript-result-meta">
        <span>{result.pages} PDF page{result.pages===1?'':'s'} processed</span>
        {result.candidate.name&&<span>Candidate: <strong>{result.candidate.name}</strong></span>}
        {result.candidate.number&&<span>Candidate no.: <strong>{result.candidate.number}</strong></span>}
        {result.examination.session&&<span>Session: <strong>{result.examination.session}</strong></span>}
      </div>
      {previewUrl&&<div className="transcript-source-preview"><div className="transcript-source-heading"><strong>Source PDF</strong><span>Page {sourcePage} of {result.pages}</span></div><object data={`${previewUrl}#page=${sourcePage}`} type="application/pdf" aria-label={`${title} transcript source PDF, page ${sourcePage}`}><p>PDF preview is unavailable in this view. The selected file remains available in the system PDF viewer.</p></object></div>}
      <p className="transcript-review-note">Check each subject and grade against the source PDF. Unmatched and low-confidence readings are highlighted. No grade is filled when OCR could not read it clearly.</p>
      <div className="transcript-meta-fields">
        <label>Examination board<input value={board} disabled={success} onChange={event=>setBoard(event.target.value)} placeholder="Not detected"/></label>
        <label>Passing year<input type="number" min="1900" max="2099" step="1" value={year} disabled={success} onChange={event=>{setYear(event.target.value);setReviewed(false);}} inputMode="numeric" placeholder="Not detected"/></label>
      </div>
      {invalidYear&&<p className="transcript-blocked">Enter a four-digit passing year from 1900 through 2099, or leave it blank.</p>}
      {rows.length===0&&<div className="transcript-empty">No subject rows were confidently identified. Add subjects below or enter them in the form manually.</div>}
      <div className="transcript-review-table">
        {rows.map(row=>{
          const lowConfidence = row.confidence.subject===null || row.confidence.subject<0.82 || row.confidence.grade===null || row.confidence.grade<0.82;
          return <article key={row.id} className={`transcript-row ${row.reviewRequired?'needs-review':''} ${!row.included?'excluded':''}`}>
            <div className="transcript-row-source"><div className="transcript-row-actions"><label><input type="checkbox" disabled={success} checked={row.included} onChange={event=>updateRow(row.id,{included:event.target.checked})}/><span>{row.manual?'Manual row':'Include row'}</span></label>{!row.manual&&<button type="button" className="transcript-page-link" onClick={()=>setSourcePage(row.page)}>View PDF page {row.page}</button>}</div><span className={`confidence ${lowConfidence?'low':''}`}>Subject {confidenceText(row.confidence.subject)} · Grade {confidenceText(row.confidence.grade)}</span></div>
            <div className="transcript-row-fields">
              <label>Printed subject<input value={row.printedSubject} disabled={success} placeholder="Enter subject name" onChange={event=>updateRow(row.id,{printedSubject:event.target.value})}/></label>
              <label>Form subject<select value={row.reviewSubject} disabled={success} onChange={event=>updateRow(row.id,{reviewSubject:event.target.value})}><option value="">Choose mapping</option>{subjects.map(subject=><option key={subject} value={subject}>{subject}</option>)}</select></label>
              <label>Grade<select value={row.reviewGrade} disabled={success} onChange={event=>updateRow(row.id,{reviewGrade:event.target.value})}><option value="">Select grade</option>{['A*','A','B','C','D','E','U'].map(grade=><option key={grade} value={grade}>{grade}</option>)}</select></label>
              {level==='A'&&<label>Qualification<select value={row.qualification} disabled={success} onChange={event=>updateRow(row.id,{qualification:event.target.value as 'FULL'|'AS'})}><option value="FULL">Full A-Level</option><option value="AS">AS only</option></select></label>}
            </div>
            {row.warnings.length>0&&<ul className="transcript-warnings">{row.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>}
          </article>;
        })}
      </div>
      <button className="text-button add-transcript-subject" type="button" disabled={success} onClick={addMissing}>+ Add a missing subject</button>
      {duplicates.length>0&&mode==='APPEND'&&!success&&<div className="transcript-warning">{duplicates.length} included subject{duplicates.length===1?' is':'s are'} already in the form. Appending may create duplicate subject rows, which can change the eligibility calculation. Confirm only if these are separate sittings.</div>}
      <label className="transcript-apply-mode">How should these results be applied?
        <select value={mode} disabled={success} onChange={event=>{setMode(event.target.value as ApplyMode);setReviewed(false);setAcknowledgedDuplicates(false);}}><option value="">Choose an option</option><option value="REPLACE">Replace existing {title} rows</option><option value="APPEND">Append to existing {title} rows</option></select>
      </label>
      {duplicateConfirmationNeeded&&<label className="transcript-reviewed duplicate-confirmation"><input type="checkbox" checked={acknowledgedDuplicates} onChange={event=>setAcknowledgedDuplicates(event.target.checked)}/><span>I confirmed each duplicate subject is a separate sitting that should remain as an additional row.</span></label>}
      <label className="transcript-reviewed"><input type="checkbox" checked={reviewed} disabled={success||incomplete||included.length===0} onChange={event=>setReviewed(event.target.checked)}/><span>I checked every included subject and grade against the transcript and resolved the flagged rows.</span></label>
      <button className="button" type="button" disabled={!canConfirm} onClick={confirm}>Confirm and populate {title} form</button>
      {incomplete&&included.length>0&&<p className="transcript-blocked">Choose a form subject and grade for every included row, or exclude rows that do not belong to this transcript.</p>}
      {success&&<div role="status" className="transcript-success">Reviewed results now populate the {title} form. Edit them in the form below if needed. Certificate verification and transcript-complete status remain under officer control.</div>}
    </div>}
  </section>;
}
