import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { pool } from './db.js';
import { departments, patterns, subjects, units } from '../../../packages/eligibility-engine/src/catalog.js';
import { evaluate, validateExam } from '../../../packages/eligibility-engine/src/engine.js';
import type { AcademicInput, CandidateInput, ExamInput, PracticalInput, UnitCode } from '../../../packages/eligibility-engine/src/types.js';
import { extractTranscript, TranscriptOcrError } from './transcripts/azure-document-intelligence.js';
import type { TranscriptLevel } from '../../../packages/transcript-import/src/types.js';
import { provisionalPolicy } from '../../../packages/policy-fixtures/src/provisional.js';

const app = Fastify({ logger: true, bodyLimit: 1024*1024 });
const maxTranscriptBytes = 20 * 1024 * 1024;
app.addContentTypeParser('application/pdf',{parseAs:'buffer'},(request,body,done)=>done(null,body));
await app.register(cors,{origin:(origin,callback)=>{
  const allowed=origin==='ju-app://bundle'||(process.env.NODE_ENV!=='production'&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin||''));
  callback(null,Boolean(allowed));
}});
const roleSet = new Set(['operator','policy_editor','policy_approver','administrator']);
type Staff = { id: string; roles: string[] };
declare module 'fastify' { interface FastifyRequest { staff?: Staff } }
const issuer = process.env.AUTH_ISSUER;
const audience = process.env.AUTH_AUDIENCE;
const jwks = process.env.AUTH_JWKS_URL ? createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL)) : null;
app.addHook('onRequest',async(request,reply)=>{
  if (request.url==='/health' || request.method==='OPTIONS') return;
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return reply.code(401).send({error:'Staff sign-in required'});
  const token = header.slice(7);
  if (process.env.NODE_ENV!=='production' && process.env.DEV_STAFF_TOKEN && token===process.env.DEV_STAFF_TOKEN) {
    request.staff={id:'local-development-operator',roles:['operator','administrator']}; return;
  }
  if (!jwks || !issuer || !audience) return reply.code(503).send({error:'Staff identity provider is not configured'});
  try {
    const verified = await jwtVerify(token,jwks,{issuer,audience});
    const roles = Array.isArray(verified.payload.roles) ? verified.payload.roles.filter((r):r is string=>typeof r==='string'&&roleSet.has(r)) : [];
    request.staff={id:verified.payload.sub!,roles};
  } catch { return reply.code(401).send({error:'Invalid or expired staff token'}); }
});
const authorize = (staff: Staff|undefined, role: string) => Boolean(staff?.roles.includes(role)||staff?.roles.includes('administrator'));
const denied = {error:'This staff role cannot perform the action'};
const id = z.string().uuid();
const subjectSchema = z.object({id:z.string().min(1),level:z.enum(['O','A']),qualification:z.enum(['FULL','AS']),subject:z.string().min(1),printedName:z.string().optional(),syllabusCode:z.string().optional(),grade:z.string().min(1),sitting:z.string().optional()});
const academicSchema = z.object({oBoard:z.string(),aBoard:z.string(),oYear:z.number().int().nullable(),aYear:z.number().int().nullable(),oComplete:z.boolean(),aComplete:z.boolean(),verified:z.boolean(),track:z.enum(['SCIENCE','HUMANITIES','BUSINESS','']).optional(),verificationReference:z.string().optional(),subjects:z.array(subjectSchema),qualifyingSevenIds:z.array(z.string()),selectionApprovalReference:z.string().optional()});
const unitSchema = z.enum(['A','B','C','C1','D','E','IBA']);
const examSchema = z.object({unit:unitSchema,pattern:z.string(),officialTotal:z.string(),scores:z.record(z.string(),z.string()),verified:z.boolean(),resultReference:z.string().optional()});
const practicalSchema = z.object({departmentCode:z.string(),score:z.string(),verified:z.boolean(),reference:z.string().optional()});
const evalSchema = z.object({requestId:z.string().min(1),candidateSessionId:id,academicRevisionId:id,examRevisionIds:z.array(id).default([]),practicalRevisionIds:z.array(id).default([]),policyVersionId:z.string()});
const fail = (reply: any, error: unknown) => reply.code(400).send({error:error instanceof z.ZodError ? z.treeifyError(error) : String(error)});
const audit = async (client: any, actor: string, action: string, entityId: string) => client.query('INSERT INTO audit_events(id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),actor,action,entityId]);

app.get('/health',async()=>({ok:true}));
app.get('/api/v1/sessions',async()=>[{id:'2025-2026',code:'2025-2026',policy:provisionalPolicy,state:'ACTIVE_ASSUMPTIONS'}]);
app.get('/api/v1/sessions/:id/catalog',async(request,reply)=>{
  const params=z.object({id:z.string()}).parse(request.params);
  if(params.id!=='2025-2026') return reply.code(404).send({error:'Unknown session'});
  return {units,departments,patterns,subjects,policy:provisionalPolicy};
});
app.get('/api/v1/candidates',async(request,reply)=>{
  if(!authorize(request.staff,'operator')) return reply.code(403).send(denied);
  const rows=await pool.query('SELECT c.id,c.internal_reference,c.name,cs.id AS candidate_session_id FROM candidates c JOIN candidate_sessions cs ON cs.candidate_id=c.id ORDER BY c.created_at DESC LIMIT 100');
  return rows.rows;
});
app.post('/api/v1/candidates',async(request,reply)=>{
  if(!authorize(request.staff,'operator')) return reply.code(403).send(denied);
  let body; try {body=z.object({internalReference:z.string().min(1).max(80),name:z.string().min(1).max(200)}).parse(request.body);}catch(e){return fail(reply,e);}
  const client=await pool.connect();
  try {await client.query('BEGIN');const candidateId=randomUUID(),sessionId=randomUUID();
    await client.query('INSERT INTO candidates(id,internal_reference,name,created_by) VALUES($1,$2,$3,$4)',[candidateId,body.internalReference,body.name,request.staff!.id]);
    await client.query('INSERT INTO candidate_sessions(id,candidate_id,session_code,curriculum) VALUES($1,$2,$3,$4)',[sessionId,candidateId,'2025-2026','GCE']);
    await audit(client,request.staff!.id,'candidate:create',candidateId);await client.query('COMMIT');
    return reply.code(201).send({id:candidateId,candidateSessionId:sessionId,...body});
  } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
});
app.get('/api/v1/candidates/:id',async(request,reply)=>{
  if(!authorize(request.staff,'operator')) return reply.code(403).send(denied);
  const candidateId=id.parse((request.params as any).id);
  const c=await pool.query('SELECT c.*,cs.id AS candidate_session_id FROM candidates c JOIN candidate_sessions cs ON cs.candidate_id=c.id WHERE c.id=$1',[candidateId]);
  if(!c.rowCount) return reply.code(404).send({error:'Candidate not found'});
  const academic=await pool.query('SELECT id,revision_no,snapshot,created_at FROM academic_revisions WHERE candidate_session_id=$1 ORDER BY revision_no DESC LIMIT 1',[c.rows[0].candidate_session_id]);
  const exams=await pool.query('SELECT DISTINCT ON(unit_code) id,unit_code,revision_no,snapshot FROM exam_revisions WHERE candidate_session_id=$1 ORDER BY unit_code,revision_no DESC',[c.rows[0].candidate_session_id]);
  const practicals=await pool.query('SELECT DISTINCT ON(department_code) id,department_code,revision_no,snapshot FROM practical_revisions WHERE candidate_session_id=$1 ORDER BY department_code,revision_no DESC',[c.rows[0].candidate_session_id]);
  return {candidate:c.rows[0],academic:academic.rows[0]??null,exams:exams.rows,practicals:practicals.rows};
});
app.post('/api/v1/candidate-sessions/:id/transcripts/:level/ocr',{bodyLimit:maxTranscriptBytes},async(request,reply)=>{
  if(!authorize(request.staff,'operator')) return reply.code(403).send(denied);
  const sessionId=id.safeParse((request.params as any).id);
  const levelValue=z.enum(['O','A']).safeParse(String((request.params as any).level).toUpperCase());
  if(!sessionId.success||!levelValue.success) return reply.code(400).send({error:'Choose a valid candidate session and O-Level or A-Level transcript.'});
  if(!request.headers['content-type']?.toLowerCase().startsWith('application/pdf')) return reply.code(415).send({error:'Upload a PDF transcript.'});
  const pdf=request.body;
  if(!Buffer.isBuffer(pdf)||pdf.length<8||pdf.subarray(0,1024).indexOf(Buffer.from('%PDF-'))<0) return reply.code(400).send({error:'The uploaded file is not a readable PDF.'});
  if(pdf.length>maxTranscriptBytes) return reply.code(413).send({error:'PDF uploads must be 20 MB or smaller.'});
  const session=await pool.query('SELECT id FROM candidate_sessions WHERE id=$1',[sessionId.data]);
  if(!session.rowCount) return reply.code(404).send({error:'Candidate session not found'});
  try {
    const result=await extractTranscript(pdf,levelValue.data as TranscriptLevel);
    await pool.query('INSERT INTO audit_events(id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),request.staff!.id,`transcript:ocr:${levelValue.data}`,sessionId.data]);
    return result;
  } catch(error) {
    if(error instanceof TranscriptOcrError) return reply.code(error.statusCode).send({error:error.message});
    throw error;
  }
});
const saveRevision = async (table:'academic_revisions'|'exam_revisions'|'practical_revisions',sessionId:string,key:string|undefined,snapshot:unknown,actor:string) => {
  const client=await pool.connect();
  try {await client.query('BEGIN');
    await client.query('SELECT id FROM candidate_sessions WHERE id=$1 FOR UPDATE',[sessionId]);
    const condition=table==='academic_revisions'?'':' AND '+(table==='exam_revisions'?'unit_code':'department_code')+'=$2';
    const count=await client.query(`SELECT COALESCE(MAX(revision_no),0)+1 AS next FROM ${table} WHERE candidate_session_id=$1${condition}`,[sessionId,...(key?[key]:[])]);
    const revisionId=randomUUID(),number=Number(count.rows[0].next);
    const column=table==='academic_revisions'?'':table==='exam_revisions'?'unit_code,':'department_code,';
    const values=table==='academic_revisions'?'$1,$2,$3,$4,$5':'$1,$2,$3,$4,$5,$6';
    await client.query(`INSERT INTO ${table}(id,candidate_session_id,${column}revision_no,snapshot,actor_id) VALUES(${values})`,[revisionId,sessionId,...(key?[key]:[]),number,snapshot,actor]);
    await audit(client,actor,`${table}:create`,revisionId);await client.query('COMMIT');
    return {id:revisionId,revisionNo:number,snapshot};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
};
app.post('/api/v1/candidate-sessions/:id/academic-revisions',async(request,reply)=>{
  if(!authorize(request.staff,'operator')) return reply.code(403).send(denied);
  try {const body=academicSchema.parse(request.body);return reply.code(201).send(await saveRevision('academic_revisions',id.parse((request.params as any).id),undefined,body,request.staff!.id));}catch(e){return fail(reply,e);}
});
app.post('/api/v1/candidate-sessions/:id/exam-revisions',async(request,reply)=>{
  if(!authorize(request.staff,'operator')) return reply.code(403).send(denied);
  try {const body=examSchema.parse(request.body) as ExamInput;const errors=validateExam(body);if(errors.length)return reply.code(400).send({error:errors});return reply.code(201).send(await saveRevision('exam_revisions',id.parse((request.params as any).id),body.unit,body,request.staff!.id));}catch(e){return fail(reply,e);}
});
app.post('/api/v1/candidate-sessions/:id/practical-revisions',async(request,reply)=>{
  if(!authorize(request.staff,'operator')) return reply.code(403).send(denied);
  try {const body=practicalSchema.parse(request.body);if(!['DRAMA','FINE_ARTS'].includes(body.departmentCode))return reply.code(400).send({error:'Unknown practical department'});if(body.score!==''&&(!/^\d+(\.\d{1,2})?$/.test(body.score)||Number(body.score)>20))return reply.code(400).send({error:'Practical score must be between 0 and 20, with at most two decimals'});return reply.code(201).send(await saveRevision('practical_revisions',id.parse((request.params as any).id),body.departmentCode,body,request.staff!.id));}catch(e){return fail(reply,e);}
});
const runEvaluation = async (request:any,reply:any,phase:'UNITS'|'DEPARTMENTS')=>{
  if(!authorize(request.staff,'operator')) return reply.code(403).send(denied);
  let body;try{body=evalSchema.parse(request.body);}catch(e){return fail(reply,e);}
  if(body.policyVersionId!==provisionalPolicy.version)return reply.code(409).send({error:'Policy version is no longer active'});
  const prior=await pool.query('SELECT result FROM evaluations WHERE actor_id=$1 AND request_id=$2',[request.staff.id,body.requestId]);
  if(prior.rowCount)return prior.rows[0].result;
  const academic=await pool.query('SELECT snapshot FROM academic_revisions WHERE id=$1 AND candidate_session_id=$2',[body.academicRevisionId,body.candidateSessionId]);
  if(!academic.rowCount)return reply.code(404).send({error:'Academic revision not found for candidate session'});
  const identity=await pool.query('SELECT c.internal_reference,c.name FROM candidate_sessions cs JOIN candidates c ON c.id=cs.candidate_id WHERE cs.id=$1',[body.candidateSessionId]);
  if(!identity.rowCount)return reply.code(404).send({error:'Candidate session not found'});
  const exams=body.examRevisionIds.length?await pool.query('SELECT id,snapshot FROM exam_revisions WHERE id=ANY($1::uuid[]) AND candidate_session_id=$2',[body.examRevisionIds,body.candidateSessionId]):{rows:[]};
  const practicals=body.practicalRevisionIds.length?await pool.query('SELECT id,snapshot FROM practical_revisions WHERE id=ANY($1::uuid[]) AND candidate_session_id=$2',[body.practicalRevisionIds,body.candidateSessionId]):{rows:[]};
  if(exams.rows.length!==body.examRevisionIds.length||practicals.rows.length!==body.practicalRevisionIds.length)return reply.code(404).send({error:'An exam or practical revision does not belong to this candidate session'});
  const input:CandidateInput={internalReference:identity.rows[0].internal_reference,name:identity.rows[0].name,academic:academic.rows[0].snapshot as AcademicInput,exams:exams.rows.map(r=>r.snapshot as ExamInput),practicals:practicals.rows.map(r=>r.snapshot as PracticalInput)};
  let result;try{result=evaluate(input,provisionalPolicy,phase);}catch(e){return fail(reply,e);}
  result.id=randomUUID();
  const client=await pool.connect();
  try {await client.query('BEGIN');
    await client.query('INSERT INTO evaluations(id,actor_id,request_id,candidate_session_id,academic_revision_id,exam_revision_ids,practical_revision_ids,phase,policy_version,policy_hash,engine_version,input_snapshot,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[result.id,request.staff.id,body.requestId,body.candidateSessionId,body.academicRevisionId,body.examRevisionIds,body.practicalRevisionIds,phase,result.policyVersion,result.policyHash,result.engineVersion,input,result]);
    await audit(client,request.staff.id,'evaluation:create',result.id);await client.query('COMMIT');return result;
  }catch(e:any){await client.query('ROLLBACK');if(e.code==='23505'){const prior=await pool.query('SELECT result FROM evaluations WHERE actor_id=$1 AND request_id=$2',[request.staff.id,body.requestId]);if(prior.rowCount)return prior.rows[0].result;}throw e;}finally{client.release();}
};
app.post('/api/v1/evaluations/units',(request,reply)=>runEvaluation(request,reply,'UNITS'));
app.post('/api/v1/evaluations/departments',(request,reply)=>runEvaluation(request,reply,'DEPARTMENTS'));
app.get('/api/v1/evaluations/:id',async(request,reply)=>{
  if(!authorize(request.staff,'operator'))return reply.code(403).send(denied);
  const row=await pool.query('SELECT result FROM evaluations WHERE id=$1',[id.parse((request.params as any).id)]);
  return row.rows[0]?.result??reply.code(404).send({error:'Evaluation not found'});
});
app.get('/api/v1/candidate-sessions/:id/evaluations',async(request,reply)=>{
  if(!authorize(request.staff,'operator'))return reply.code(403).send(denied);
  const rows=await pool.query('SELECT result FROM evaluations WHERE candidate_session_id=$1 ORDER BY created_at DESC LIMIT 50',[id.parse((request.params as any).id)]);
  return rows.rows.map(r=>r.result);
});
app.post('/api/v1/choice-list-drafts',async(request,reply)=>{
  if(!authorize(request.staff,'operator'))return reply.code(403).send(denied);
  let body;try{body=z.object({candidateSessionId:id,evaluationId:id,departmentCodes:z.array(z.string()).min(1)}).parse(request.body);}catch(e){return fail(reply,e);}
  const evaluation=await pool.query('SELECT result FROM evaluations WHERE id=$1 AND candidate_session_id=$2',[body.evaluationId,body.candidateSessionId]);
  if(!evaluation.rowCount)return reply.code(404).send({error:'Evaluation not found'});
  const eligible=new Set((evaluation.rows[0].result as ReturnType<typeof evaluate>).decisions.filter(d=>d.status==='ELIGIBLE').map(d=>d.departmentCode));
  if(new Set(body.departmentCodes).size!==body.departmentCodes.length||body.departmentCodes.some(code=>!eligible.has(code)))return reply.code(400).send({error:'Only distinct eligible departments can be added'});
  const draftId=randomUUID();await pool.query('INSERT INTO choice_list_drafts(id,candidate_session_id,evaluation_id,items,actor_id) VALUES($1,$2,$3,$4,$5)',[draftId,body.candidateSessionId,body.evaluationId,body.departmentCodes,request.staff!.id]);
  return reply.code(201).send({id:draftId,advisoryOnly:true,departmentCodes:body.departmentCodes});
});
app.setErrorHandler((error,request,reply)=>{
  request.log.error(error);
  if((error as any).code==='23505')return reply.code(409).send({error:'This reference already exists'});
  reply.code(500).send({error:'Server error; no eligibility decision was recorded'});
});
const port=Number(process.env.PORT||3001);
await app.listen({host:process.env.HOST||'127.0.0.1',port});
