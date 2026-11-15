import { describe, expect, it } from 'vitest';
import { departments } from './catalog.js';
import { evaluate, validateExam } from './engine.js';
import type { CandidateInput, ExamInput, Policy, SubjectResult } from './types.js';

const approved:Policy={version:'test-reviewed',hash:'test',approved:{P01:true,P02:true,P03:true,P04:true,P05:true,P09:true,P11:true,P12:true}};
const row=(id:string,level:'O'|'A',subject:string,grade='B'):SubjectResult=>({id,level,subject,grade,qualification:'FULL'});
const base=():CandidateInput=>{
  const subjects=[row('o1','O','English'),row('o2','O','Bangla'),row('o3','O','Biology'),row('o4','O','ICT'),row('o5','O','Economics'),row('a1','A','Physics'),row('a2','A','Chemistry'),row('a3','A','Mathematics'),row('a4','A','Biology')];
  return {internalReference:'TEST-001',name:'Example Candidate',academic:{oBoard:'Cambridge',aBoard:'Cambridge',oYear:2021,aYear:2025,oComplete:true,aComplete:true,verified:true,subjects,qualifyingSevenIds:['o1','o2','o3','o4','o5','a1','a2'],selectionApprovalReference:'review-1'},exams:[],practicals:[]};
};
const examA=(mathematics:string,physics:string):ExamInput=>({unit:'A',pattern:'A',officialTotal:'',scores:{BANGLA:'3',ENGLISH:'3',MATHEMATICS:mathematics,PHYSICS:physics,CHEMISTRY:'22',ICT:'8'},verified:true});
const finalize=(exam:ExamInput):ExamInput=>({...exam,officialTotal:(Object.values(exam.scores).reduce((a,v)=>a+Number(v),0)).toFixed(2)});
const decision=(candidate:CandidateInput,unit:string,code:string,policy=approved)=>evaluate(candidate,policy,'DEPARTMENTS').decisions.find(d=>d.unitCode===unit&&d.departmentCode===code)!;
const reviewedPolicy:Policy={...approved,approved:{...approved.approved,P06:true,P07:true,P08:true},subjectLevelBindings:{A_STATISTICS:'A',A_ENVIRONMENT:'A',B_ECONOMICS:'A',B_PLANNING:'A',C_BANGLA:'A',D_PUBLIC_HEALTH:'A'}};

describe('source rule boundaries',()=>{
  it('treats seven B grades as four B and seven C or better',()=>{
    const c=base();const result=evaluate(c,approved,'UNITS').decisions[0];
    expect(result.checks.find(x=>x.ruleId==='GCE-FOUR-B')?.result).toBe('PASS');
    expect(result.checks.find(x=>x.ruleId==='GCE-SEVEN-C')?.result).toBe('PASS');
  });
  it('fails four-B condition with only three B grades',()=>{
    const c=base();for(const id of ['o4','o5','a1','a2'])c.academic.subjects.find(r=>r.id===id)!.grade='C';
    expect(evaluate(c,approved,'UNITS').decisions[0].checks.find(x=>x.ruleId==='GCE-FOUR-B')?.result).toBe('FAIL');
  });
  it('fails definitive year and count conditions',()=>{
    const c=base();c.academic.oYear=2019;c.academic.aYear=2023;c.academic.subjects=c.academic.subjects.filter(r=>!['o4','o5','a2','a3','a4'].includes(r.id));
    const checks=evaluate(c,approved,'UNITS').decisions[0].checks;
    for(const id of ['GCE-O-YEAR','GCE-A-YEAR','GCE-O-COUNT','GCE-A-COUNT'])expect(checks.find(x=>x.ruleId===id)?.result).toBe('FAIL');
  });
  it('counts E as a pass, but not toward the qualifying-seven C minimum',()=>{
    const c=base();c.academic.subjects.find(r=>r.id==='o5')!.grade='E';
    const checks=evaluate(c,approved,'UNITS').decisions[0].checks;
    expect(checks.find(x=>x.ruleId==='GCE-O-COUNT')?.result).toBe('PASS');
    expect(checks.find(x=>x.ruleId==='GCE-SEVEN-C')?.result).toBe('FAIL');
    c.academic.subjects.find(r=>r.id==='o5')!.grade='U';
    expect(evaluate(c,approved,'UNITS').decisions[0].checks.find(x=>x.ruleId==='GCE-O-COUNT')?.result).toBe('FAIL');
  });
  it('does not count duplicate O-Level subject attempts as separate subjects',()=>{
    const c=base();c.academic.subjects.find(r=>r.id==='o5')!.subject='English';
    expect(evaluate(c,approved,'UNITS').decisions[0].checks.find(x=>x.ruleId==='GCE-O-COUNT')?.result).toBe('FAIL');
  });
  it('requires review for an unapproved extra-subject selection',()=>{
    const c=base();const p={...approved,approved:{...approved.approved,P02:false}};
    expect(evaluate(c,p,'UNITS').decisions[0].checks.find(x=>x.ruleId==='GCE-SEVEN-SELECTION')?.result).toBe('UNKNOWN');
  });
  it('requires selection review for multiple sittings even with seven rows',()=>{
    const c=base();c.academic.subjects=c.academic.subjects.slice(0,7);c.academic.qualifyingSevenIds=[];
    c.academic.subjects[0].sitting='2020';c.academic.subjects[1].sitting='2021';
    expect(evaluate(c,approved,'UNITS').decisions[0].checks.find(x=>x.ruleId==='GCE-SEVEN-SELECTION')?.result).toBe('UNKNOWN');
  });
  it('compares official overall and IIT section boundaries exactly',()=>{
    const c=base();c.exams=[finalize(examA('13.00','13.20'))];
    const result=decision(c,'A','IIT');
    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.checks.find(x=>x.ruleId==='A-IIT-MATHEMATICS-60')?.result).toBe('FAIL');
    c.exams=[finalize(examA('13.20','13.20'))];
    expect(decision(c,'A','IIT').checks.find(x=>x.ruleId==='A-IIT-MATHEMATICS-60')?.result).toBe('PASS');
  });
  it('distinguishes 35.80 from 36.00 overall',()=>{
    const c=base();c.exams=[{unit:'B',pattern:'B',officialTotal:'35.80',scores:{},verified:true}];
    expect(decision(c,'B','ECONOMICS').checks.find(x=>x.ruleId==='MCQ-OVERALL')?.result).toBe('FAIL');
    c.exams[0].officialTotal='36.00';
    expect(decision(c,'B','ECONOMICS').checks.find(x=>x.ruleId==='MCQ-OVERALL')?.result).toBe('PASS');
    expect(decision(c,'B','ECONOMICS').status).toBe('NEEDS_REVIEW');
  });
  it('rejects mismatched total and excessive precision',()=>{
    const e=finalize(examA('13.20','13.20'));e.officialTotal='70.00';
    expect(validateExam(e)).toContain('Official total does not match the sum of all section scores');
    e.scores.PHYSICS='13.201';
    expect(validateExam(e).some(x=>x.includes('at most two decimals'))).toBe(true);
  });
  it('derives D Biology without double-counting it',()=>{
    const c=base();c.exams=[{unit:'D',pattern:'D',officialTotal:'52.00',scores:{BANGLA:'4',ENGLISH:'4',INTELLIGENCE:'4',CHEMISTRY:'18',BOTANY:'12',ZOOLOGY:'10'},verified:true}];
    expect(decision(c,'D','BOTANY').checks.find(x=>x.ruleId==='D-BOTANY-BOTANY-50')?.result).toBe('PASS');
    expect(decision(c,'D','ZOOLOGY').checks.find(x=>x.ruleId==='D-ZOOLOGY-ZOOLOGY-50')?.result).toBe('FAIL');
    expect(decision(c,'D','PHARMACY').checks.find(x=>x.ruleId==='D-PHARMACY-BIOLOGY-50')?.result).toBe('PASS');
  });
  it('keeps C1 practical pending and checks 8.00 boundary',()=>{
    const c=base();c.exams=[{unit:'C1',pattern:'C1',officialTotal:'40.00',scores:{BANGLA:'5',ENGLISH:'5',GENERAL_KNOWLEDGE:'10',DEPARTMENT_TOPICS:'20'},verified:true}];
    expect(decision(c,'C1','DRAMA').checks.find(x=>x.ruleId==='DRAMA-PRACTICAL')?.result).toBe('UNKNOWN');
    c.practicals=[{departmentCode:'DRAMA',score:'7.80',verified:true}];
    expect(decision(c,'C1','DRAMA').checks.find(x=>x.ruleId==='DRAMA-PRACTICAL')?.result).toBe('FAIL');
    c.practicals[0].score='8.00';
    expect(decision(c,'C1','DRAMA').checks.find(x=>x.ruleId==='DRAMA-PRACTICAL')?.result).toBe('PASS');
  });
  it('shows not attempted and covers all 37 options',()=>{
    const c=base();const result=evaluate(c,approved,'DEPARTMENTS');
    expect(departments).toHaveLength(37);
    expect(result.decisions).toHaveLength(37);
    expect(result.decisions.every(d=>d.status==='NOT_ATTEMPTED')).toBe(true);
  });
  it('keeps a definite failure despite unrelated unknown checks',()=>{
    const c=base();c.academic.oYear=2019;c.exams=[{unit:'B',pattern:'B',officialTotal:'',scores:{},verified:false}];
    expect(decision(c,'B','ECONOMICS').status).toBe('NOT_ELIGIBLE');
  });
  it('uses O-Level English as an alternative to A-Level English',()=>{
    const c=base();c.academic.subjects.push(row('a5','A','English','C'));
    c.exams=[{unit:'B',pattern:'B',officialTotal:'50.00',scores:{BANGLA:'12',ENGLISH:'12',GENERAL_MATHEMATICS:'12',GENERAL_KNOWLEDGE:'10',LOGICAL_ANALYSIS:'4'},verified:true}];
    expect(decision(c,'B','GEOGRAPHY').checks.find(x=>x.ruleId==='B-ENGLISH')?.result).toBe('PASS');
  });
  it('does not mark a commerce profile eligible for Unit A without an A-unit pathway',()=>{
    const c=base();
    for(const [id,subject] of [['a1','Economics'],['a2','Accounting'],['a3','Business Studies'],['a4','ICT']] as const)c.academic.subjects.find(r=>r.id===id)!.subject=subject;
    const result=evaluate(c,reviewedPolicy,'UNITS').decisions.find(d=>d.unitCode==='A')!;
    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.checks.find(x=>x.ruleId==='A-ROUTE')?.result).toBe('FAIL');
  });
  it('keeps a commerce Unit A case under review when the unit gateway is unapproved',()=>{
    const c=base();
    for(const [id,subject] of [['a1','Economics'],['a2','Accounting'],['a3','Business Studies'],['a4','ICT']] as const)c.academic.subjects.find(r=>r.id===id)!.subject=subject;
    const provisional:Policy={version:'provisional',hash:'unverified',approved:{}};
    const result=evaluate(c,provisional,'UNITS').decisions.find(d=>d.unitCode==='A')!;
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.checks.find(x=>x.ruleId==='A-ROUTE')?.actual).toContain('STATISTICS: FAIL');
  });
  it('keeps a Statistics exception unresolved when it is the only possible A pathway',()=>{
    const c=base();
    for(const [id,subject] of [['a1','Economics'],['a2','Accounting'],['a4','ICT']] as const)c.academic.subjects.find(r=>r.id===id)!.subject=subject;
    c.academic.subjects.find(r=>r.id==='a3')!.subject='Mathematics';
    c.exams=[finalize(examA('22','22'))];
    const unresolvedStats:Policy={...reviewedPolicy,approved:{...reviewedPolicy.approved,P03:false}};
    const result=evaluate(c,unresolvedStats,'UNITS').decisions.find(d=>d.unitCode==='A')!;
    expect(result.status).toBe('NEEDS_REVIEW');
    const statistics=decision(c,'A','STATISTICS',unresolvedStats);
    expect(statistics.checks.find(x=>x.ruleId==='A-STAT-GENERAL')?.informational).toBe(true);
    expect(statistics.checks.find(x=>x.ruleId==='A-STAT-ROUTE')?.result).toBe('UNKNOWN');
  });
  it('marks named B and D subject conditions as definite failures when the complete transcripts lack them',()=>{
    const c=base();
    for(const [id,subject] of [['o5','ICT'],['a1','Chemistry'],['a2','Biology'],['a3','Business Studies'],['a4','ICT']] as const)c.academic.subjects.find(r=>r.id===id)!.subject=subject;
    c.exams=[{unit:'B',pattern:'B',officialTotal:'36.00',scores:{},verified:true},{unit:'C',pattern:'C',officialTotal:'36.00',scores:{},verified:true},{unit:'D',pattern:'D',officialTotal:'36.00',scores:{},verified:true}];
    expect(decision(c,'B','ECONOMICS',reviewedPolicy).checks.find(x=>x.ruleId==='B-ECONOMICS-ALTERNATIVE')?.result).toBe('FAIL');
    expect(decision(c,'B','PLANNING',reviewedPolicy).checks.find(x=>x.ruleId==='B-PLANNING-MATHEMATICS')?.result).toBe('FAIL');
    expect(decision(c,'C','BANGLA',reviewedPolicy).checks.find(x=>x.ruleId==='C-BANGLA-SUBJECT')?.result).toBe('FAIL');
    expect(decision(c,'D','PUBLIC_HEALTH',reviewedPolicy).checks.find(x=>x.ruleId==='D-PUBLIC-HEALTH-ACADEMIC')?.result).toBe('FAIL');
  });
  it('applies the listed A- and D-unit combinations to their own departments',()=>{
    const c=base();c.exams=[{unit:'A',pattern:'A',officialTotal:'36.00',scores:{},verified:true},{unit:'D',pattern:'D',officialTotal:'36.00',scores:{},verified:true}];
    expect(decision(c,'A','ENVIRONMENT',reviewedPolicy).checks.find(x=>x.ruleId==='A-ENV-ACADEMIC')?.result).toBe('PASS');
    for(const code of ['BOTANY','ZOOLOGY','BIOCHEMISTRY','MICROBIOLOGY','PHARMACY','BIOTECH']) {
      expect(decision(c,'D',code,reviewedPolicy).checks.find(x=>x.ruleId===`D-${code}-ACADEMIC`)?.result).toBe('PASS');
    }
    c.academic.subjects.find(r=>r.id==='a3')!.grade='C';
    expect(decision(c,'D','PHARMACY',reviewedPolicy).checks.find(x=>x.ruleId==='D-PHARMACY-ACADEMIC')?.result).toBe('FAIL');
  });
  it('keeps GCE academic equivalence unresolved for C1, E and IBA',()=>{
    const c=base();c.exams=[{unit:'C1',pattern:'C1',officialTotal:'36.00',scores:{},verified:true},{unit:'E',pattern:'E_BUSINESS',officialTotal:'36.00',scores:{},verified:true},{unit:'IBA',pattern:'IBA',officialTotal:'36.00',scores:{},verified:true}];
    const noEquivalence:Policy={...reviewedPolicy,approved:{...reviewedPolicy.approved,P08:false}};
    for(const [unit,code] of [['C1','DRAMA'],['E','FINANCE'],['IBA','IBA_JU']] as const) {
      const result=decision(c,unit,code,noEquivalence);
      expect(result.checks.find(x=>x.ruleId==='P08')?.result).toBe('UNKNOWN');
    }
  });
  it('checks both Law section marks even when the total passes',()=>{
    const c=base();c.exams=[{unit:'C',pattern:'C',officialTotal:'63.80',scores:{BANGLA:'12',ENGLISH:'11.80',GENERAL_DEPARTMENT:'40'},verified:true}];
    const checks=decision(c,'C','LAW').checks;
    expect(checks.find(x=>x.ruleId==='C-LAW-BANGLA-60')?.result).toBe('PASS');
    expect(checks.find(x=>x.ruleId==='C-LAW-ENGLISH-60')?.result).toBe('FAIL');
  });
  it('does not let an official total replace missing section marks',()=>{
    const c=base();c.exams=[{unit:'A',pattern:'A',officialTotal:'50.00',scores:{},verified:true}];
    const result=decision(c,'A','IIT');
    expect(result.checks.find(x=>x.ruleId==='MCQ-SECTIONS-COMPLETE')?.result).toBe('UNKNOWN');
    expect(result.checks.find(x=>x.ruleId==='A-IIT-MATHEMATICS-60')?.result).toBe('UNKNOWN');
    expect(result.status).toBe('NEEDS_REVIEW');
  });
  it('keeps the provisional policy from giving a green outcome',()=>{
    const c=base();c.exams=[finalize(examA('14','14'))];
    const provisional:Policy={version:'provisional',hash:'unverified',approved:{}};
    expect(decision(c,'A','IIT',provisional).status).toBe('NEEDS_REVIEW');
    expect(evaluate(c,provisional,'UNITS').decisions.every(d=>d.status!=='ELIGIBLE')).toBe(true);
  });
});
