import { departments, patterns, units, type Department } from './catalog.js';
import type { AcademicInput, CandidateInput, Check, CheckResult, Decision, Evaluation, ExamInput, Policy, Source, SubjectResult, UnitCode } from './types.js';

export const ENGINE_VERSION = '0.3.0';
const entry: Source = { pdfPage: 1, section: '1(d), GCE entry' };
const gce: Source = { pdfPage: 2, section: '1(e), English-medium conditions' };
const mcq: Source = { pdfPage: 4, section: '3(a)-(b), MCQ pass' };
const patternSource: Source = { pdfPage: 4, section: '2, unit exam patterns' };
const check = (ruleId: string, label: string, result: CheckResult, actual: string, required: string, source: Source, informational = false): Check => ({ ruleId, label, result, actual, required, source, informational });
const resultOf = (checks: Check[]): CheckResult => {
  const required = checks.filter(c => !c.informational);
  return required.some(c => c.result === 'FAIL') ? 'FAIL' : required.every(c => c.result === 'PASS') ? 'PASS' : 'UNKNOWN';
};
const statusOf = (checks: Check[]): Decision['status'] => resultOf(checks) === 'PASS' ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
const all = (values: CheckResult[]): CheckResult => values.includes('FAIL') ? 'FAIL' : values.every(v => v === 'PASS') ? 'PASS' : 'UNKNOWN';
const any = (values: CheckResult[]): CheckResult => values.includes('PASS') ? 'PASS' : values.every(v => v === 'FAIL') ? 'FAIL' : 'UNKNOWN';

// JU's A-/A/A+ cutoffs have no direct GCE plus/minus grades. We treat A or A*
// as meeting A-/A, and A* as meeting A+. That assumption is shown in each row.
const gradeRank = (grade: string): number | null => {
  const normalized = grade.trim().toUpperCase();
  const ranks: Record<string, number> = { U: -1, F: -1, E: 0, D: 1, C: 2, B: 3, A: 4, 'A*': 5 };
  return ranks[normalized] ?? null;
};
const gradeThreshold: Record<GradeMinimum, number> = { B: 3, C: 2, 'A-': 4, A: 4, 'A+': 5 };
type GradeMinimum = 'B' | 'C' | 'A-' | 'A' | 'A+';
type Level = 'O' | 'A' | 'EITHER' | 'BOTH';
const gradeRequirement = (minimum: GradeMinimum, level: Level) => {
  const threshold = minimum === 'A+' ? 'A+ (GCE A* assumed)' : minimum === 'A-' ? 'A- (GCE A or A* assumed)' : minimum === 'A' ? 'A (GCE A or A* assumed)' : `${minimum} or better`;
  const levelText = level === 'EITHER' ? 'in O-Level or full A-Level' : level === 'BOTH' ? 'in both O-Level and full A-Level' : `in ${level}-Level`;
  return `${threshold} ${levelText}`;
};
const rowResult = (row: SubjectResult | undefined, minimum: GradeMinimum): CheckResult => {
  if (!row || (row.level === 'A' && row.qualification !== 'FULL')) return 'UNKNOWN';
  const rank = gradeRank(row.grade);
  return rank === null ? 'UNKNOWN' : rank >= gradeThreshold[minimum] ? 'PASS' : 'FAIL';
};
const bestPerSubject = (rows: SubjectResult[]): SubjectResult[] => {
  const best = new Map<string, SubjectResult>();
  for (const row of rows) {
    if (!row.subject) continue;
    const previous = best.get(row.subject);
    const currentRank = gradeRank(row.grade) ?? -2;
    const previousRank = previous ? gradeRank(previous.grade) ?? -2 : -3;
    if (!previous || currentRank > previousRank) best.set(row.subject, row);
  }
  return [...best.values()];
};
const selectedSeven = (academic: AcademicInput): SubjectResult[] => {
  const o = bestPerSubject(academic.subjects.filter(row => row.level === 'O' && (gradeRank(row.grade) ?? -2) >= 0));
  const a = bestPerSubject(academic.subjects.filter(row => row.level === 'A' && row.qualification === 'FULL' && (gradeRank(row.grade) ?? -2) >= 0));
  const order = (left: SubjectResult, right: SubjectResult) => (gradeRank(right.grade) ?? -2) - (gradeRank(left.grade) ?? -2) || left.subject.localeCompare(right.subject);
  return [...o.sort(order).slice(0, 5), ...a.sort(order).slice(0, 2)];
};

const subjectCheck = (academic: AcademicInput, subject: string, level: Level, minimum: GradeMinimum, id: string): Check => {
  const rows = academic.subjects.filter(row => row.subject === subject && (level === 'EITHER' || level === 'BOTH' || row.level === level));
  const byLevel = (current: 'O' | 'A') => {
    const matches = rows.filter(row => row.level === current);
    if (!matches.length) return current === 'O' ? academic.oComplete ? 'FAIL' as const : 'UNKNOWN' as const : academic.aComplete ? 'FAIL' as const : 'UNKNOWN' as const;
    return any(matches.map(row => rowResult(row, minimum)));
  };
  let result: CheckResult;
  if (level === 'BOTH') result = all([byLevel('O'), byLevel('A')]);
  else if (level === 'EITHER') result = any([byLevel('O'), byLevel('A')]);
  else result = any(rows.filter(row => row.level === level).map(row => rowResult(row, minimum)));
  const actual = rows.length ? rows.map(row => `${row.grade || 'No grade'} (${row.level}${row.qualification === 'AS' ? ' AS' : ''})`).join(', ') : 'Not entered';
  return check(id, `${subject} grade`, result, actual, gradeRequirement(minimum, level), gce);
};
const groupCheck = (academic: AcademicInput, specs: [string, Level, GradeMinimum][], id: string, label: string): Check => {
  const children = specs.map(([subject, level, minimum]) => subjectCheck(academic, subject, level, minimum, `${id}-${subject}`));
  return check(id, label, all(children.map(child => child.result)), children.map(child => `${child.label}: ${child.actual}`).join('; '), children.map(child => child.required).join('; '), gce);
};
const alternativeCheck = (academic: AcademicInput, alternatives: string[], level: Level, minimum: GradeMinimum, id: string, label: string): Check => {
  const children = alternatives.map(subject => subjectCheck(academic, subject, level, minimum, `${id}-${subject}`));
  return check(id, label, any(children.map(child => child.result)), children.map(child => `${child.label}: ${child.actual}`).join('; '), `At least one: ${children.map(child => `${child.label} ${gradeRequirement(minimum, level)}`).join(' OR ')}`, gce);
};
const assumptionCheck = (id: string, label: string, actual: string, source = gce): Check => check(id, label, 'PASS', actual, 'Working interpretation applied', source, true);
const trackChecks = (academic: AcademicInput, prefix: string): Check[] => {
  if (academic.track === 'SCIENCE') return [
    groupCheck(academic, [['Mathematics', 'EITHER', 'A-'], ['English', 'EITHER', 'A-']], `${prefix}-SCIENCE`, 'Science track subjects')
  ];
  if (academic.track === 'HUMANITIES' || academic.track === 'BUSINESS') return [
    subjectCheck(academic, 'English', 'EITHER', 'A', `${prefix}-ENGLISH`),
    alternativeCheck(academic, ['Accounting', 'Economics', 'Mathematics'], 'EITHER', 'A', `${prefix}-QUANT`, 'Quantitative or business subject')
  ];
  return [check(`${prefix}-TRACK`, 'GCE study track', 'FAIL', 'Not entered', 'Choose Science, Humanities or Business', gce)];
};

const commonChecks = (academic: AcademicInput): Check[] => {
  const o = bestPerSubject(academic.subjects.filter(row => row.level === 'O' && (gradeRank(row.grade) ?? -2) >= 0));
  const a = bestPerSubject(academic.subjects.filter(row => row.level === 'A' && row.qualification === 'FULL' && (gradeRank(row.grade) ?? -2) >= 0));
  const seven = selectedSeven(academic);
  const countCheck = (count: number, minimum: number, id: string, label: string) => check(id, label, count >= minimum ? 'PASS' : 'FAIL', `${count} passed distinct subjects`, `At least ${minimum}`, entry);
  const yearCheck = (value: number | null, valid: (year: number) => boolean, label: string, required: string, id: string) => check(id, label, value !== null && valid(value) ? 'PASS' : 'FAIL', value === null ? 'Not entered' : String(value), required, entry);
  const bCount = seven.filter(row => (gradeRank(row.grade) ?? -2) >= 3).length;
  const cCount = seven.filter(row => (gradeRank(row.grade) ?? -2) >= 2).length;
  return [
    yearCheck(academic.oYear, year => year >= 2020, 'O-Level passing year', '2020 or later', 'GCE-O-YEAR'),
    yearCheck(academic.aYear, year => year === 2024 || year === 2025, 'A-Level passing year', '2024 or 2025', 'GCE-A-YEAR'),
    countCheck(o.length, 5, 'GCE-O-COUNT', 'Passed O-Level subjects'),
    countCheck(a.length, 2, 'GCE-A-COUNT', 'Passed full A-Level subjects'),
    check('GCE-O-COMPLETE', 'O-Level transcript complete', academic.oComplete ? 'PASS' : 'FAIL', academic.oComplete ? 'Complete' : 'Incomplete', 'All O-Level results entered', entry),
    check('GCE-A-COMPLETE', 'A-Level transcript complete', academic.aComplete ? 'PASS' : 'FAIL', academic.aComplete ? 'Complete' : 'Incomplete', 'All A-Level results entered', entry),
    check('GCE-SEVEN-SELECTION', 'Qualifying seven subjects', seven.length === 7 ? 'PASS' : 'FAIL', seven.length === 7 ? seven.map(row => `${row.subject} ${row.grade} (${row.level})`).join(', ') : `${seven.length} eligible subjects selected`, 'Best five distinct O-Level and best two distinct full A-Level subjects; highest grade per subject', entry),
    check('GCE-FOUR-B', 'At least four B or higher', seven.length === 7 && bCount >= 4 ? 'PASS' : 'FAIL', `${bCount} of 7`, 'At least 4', entry),
    check('GCE-THREE-C', 'At least three C or higher', seven.length === 7 && cCount >= 3 ? 'PASS' : 'FAIL', `${cCount} of 7`, 'At least 3', entry),
    check('CERT-VERIFIED', 'Certificate verification (record only)', academic.verified ? 'PASS' : 'FAIL', academic.verified ? academic.verificationReference || 'Verified' : 'Not verified', 'Staff verification before final admission processing', entry, true),
    assumptionCheck('CASE-GCE-SEVEN', 'Case · seven-subject selection', 'Extra subjects and retakes use the highest grade per subject; the best five O-Level plus best two full A-Level subjects are counted.')
  ];
};

const aCore = (academic: AcademicInput) => groupCheck(academic, [['Physics', 'A', 'B'], ['Chemistry', 'A', 'B'], ['Mathematics', 'A', 'B']], 'A-GENERAL', 'A-unit A-Level prerequisite');
const englishCore = (academic: AcademicInput, unit: 'B' | 'C') => subjectCheck(academic, 'English', 'EITHER', 'B', `${unit}-ENGLISH`);
const dSpecs: Record<string, [string, Level, GradeMinimum][]> = {
  BOTANY: [['Biology', 'A', 'A-']],
  ZOOLOGY: [['Biology', 'A', 'A']],
  PHARMACY: [['Chemistry', 'A', 'A'], ['Biology', 'A', 'A']],
  BIOCHEMISTRY: [['Chemistry', 'A', 'A'], ['Biology', 'A', 'A']],
  MICROBIOLOGY: [['Chemistry', 'A', 'A'], ['Biology', 'A', 'A']],
  BIOTECH: [['Chemistry', 'A', 'A'], ['Biology', 'A', 'A'], ['Physics', 'A', 'A-'], ['Mathematics', 'A', 'A-']]
};
const dAcademicChecks = (department: Department, academic: AcademicInput): Check[] => {
  if (department.code === 'PUBLIC_HEALTH') return [
    groupCheck(academic, [['Chemistry', 'EITHER', 'B'], ['Biology', 'EITHER', 'B'], ['Mathematics', 'EITHER', 'B'], ['English', 'EITHER', 'B']], 'D-PUBLIC-HEALTH', 'Public Health subject combination'),
    assumptionCheck('CASE-D-PUBLIC-HEALTH', 'Case · Public Health', 'The O/A wording is applied to every listed subject.')
  ];
  const specs = dSpecs[department.code];
  if (!specs) return [assumptionCheck('CASE-D-BASELINE', 'Case · department subjects', 'No additional GCE subject cutoff was listed; the common GCE baseline applies.')];
  const checks = [groupCheck(academic, specs, `D-${department.code}-ACADEMIC`, `${department.name} subject requirement`)];
  if (department.code === 'BIOCHEMISTRY') checks.push(assumptionCheck('CASE-D-BIOCHEMISTRY', 'Case · Biochemistry', 'Applied the Chemistry and Biology A-Level grades used for related life-science departments.'));
  return checks;
};
const academicChecks = (department: Department, academic: AcademicInput): Check[] => {
  const { unit, code } = department;
  const checks: Check[] = [];
  if (unit === 'A') {
    checks.push(aCore(academic));
    if (code === 'MATHEMATICS') checks.push(subjectCheck(academic, 'Mathematics', 'A', 'A', 'A-MATH-DEPT'));
    if (code === 'CSE' || code === 'IIT') checks.push(groupCheck(academic, [['Mathematics', 'A', 'A+'], ['Physics', 'A', 'A+']], `A-${code}-SUBJECTS`, 'Computer science subject requirement'));
    if (code === 'PHYSICS') checks.push(groupCheck(academic, [['Physics', 'A', 'A-'], ['Mathematics', 'A', 'A-']], 'A-PHYSICS-SUBJECTS', 'Physics department subjects'));
    if (code === 'CHEMISTRY') checks.push(groupCheck(academic, [['Chemistry', 'A', 'A'], ['Mathematics', 'A', 'A-']], 'A-CHEM-SUBJECTS', 'Chemistry department subjects'));
    if (code === 'ENVIRONMENT') checks.push(groupCheck(academic, [['Chemistry', 'A', 'A-'], ['Physics', 'A', 'A-'], ['Mathematics', 'A', 'A-'], ['Biology', 'A', 'A-']], 'A-ENV-SUBJECTS', 'Environmental Sciences subjects'));
    if (!['MATHEMATICS', 'CSE', 'IIT', 'PHYSICS', 'CHEMISTRY', 'ENVIRONMENT'].includes(code)) checks.push(assumptionCheck(`CASE-A-${code}`, 'Case · department subjects', 'No extra subject grade was listed; the A-unit A-Level prerequisite applies.'));
  }
  if (unit === 'B') {
    checks.push(englishCore(academic, 'B'));
    if (code === 'ECONOMICS') checks.push(subjectCheck(academic, 'English', 'EITHER', 'A-', 'B-ECONOMICS-ENGLISH'), alternativeCheck(academic, ['Mathematics', 'Statistics', 'Economics', 'Accounting'], 'EITHER', 'A-', 'B-ECONOMICS-QUANT', 'Economics quantitative or business subject'));
    if (code === 'GEOGRAPHY' || code === 'GOVERNMENT' || code === 'ANTHROPOLOGY') checks.push(groupCheck(academic, [['Bangla', 'EITHER', 'A-'], ['English', 'EITHER', 'A-']], `B-${code}-SUBJECTS`, 'Social science department subjects'));
    if (code === 'PLANNING') checks.push(groupCheck(academic, [['Mathematics', 'EITHER', 'A-'], ['English', 'EITHER', 'A-']], 'B-PLANNING-SUBJECTS', 'Town Planning subjects'));
    if (code === 'PUBLIC_ADMIN') checks.push(subjectCheck(academic, 'English', 'EITHER', 'A-', 'B-PUBLIC-ADMIN-ENGLISH'));
    if (!['ECONOMICS', 'GEOGRAPHY', 'GOVERNMENT', 'ANTHROPOLOGY', 'PLANNING', 'PUBLIC_ADMIN'].includes(code)) checks.push(assumptionCheck(`CASE-B-${code}`, 'Case · department subjects', 'No extra GCE subject grade was listed; the B-unit English prerequisite applies.'));
  }
  if (unit === 'C') {
    checks.push(englishCore(academic, 'C'));
    if (code === 'BANGLA') checks.push(groupCheck(academic, [['Bangla', 'EITHER', 'A-'], ['English', 'EITHER', 'B']], 'C-BANGLA-SUBJECTS', 'Bangla department subjects'));
    if (code === 'ENGLISH') checks.push(subjectCheck(academic, 'English', 'BOTH', 'A', 'C-ENGLISH-BOTH'));
    if (['LAW', 'INTERNATIONAL_RELATIONS', 'HISTORY', 'PHILOSOPHY'].includes(code)) checks.push(subjectCheck(academic, 'English', 'EITHER', 'A-', `C-${code}-ENGLISH`));
    if (!['BANGLA', 'ENGLISH', 'LAW', 'INTERNATIONAL_RELATIONS', 'HISTORY', 'PHILOSOPHY'].includes(code)) checks.push(assumptionCheck(`CASE-C-${code}`, 'Case · department subjects', 'No extra GCE subject grade was listed; the C-unit English prerequisite applies.'));
  }
  if (unit === 'D') checks.push(...dAcademicChecks(department, academic));
  if (unit === 'C1') checks.push(assumptionCheck(`CASE-C1-${code}`, 'Case · C1 academic rule', 'No GCE department-specific grade was listed; the common GCE baseline applies.'));
  if (unit === 'E' || unit === 'IBA') checks.push(...trackChecks(academic, `${unit}-${code}`));
  return checks;
};

const unitAcademicChecks = (unit: UnitCode, academic: AcademicInput): Check[] => {
  if (unit === 'A') return [aCore(academic)];
  if (unit === 'B' || unit === 'C') return [englishCore(academic, unit)];
  if (unit === 'D') {
    const routes = departments.filter(department => department.unit === 'D').map(department => ({ department, result: resultOf(dAcademicChecks(department, academic).filter(item => !item.informational)) }));
    const result = any(routes.map(route => route.result));
    return [check('D-ROUTE', 'At least one D department subject route', result, routes.map(route => `${route.department.code}: ${route.result}`).join('; '), 'Meet one listed D department route', gce)];
  }
  if (unit === 'E' || unit === 'IBA') return trackChecks(academic, `${unit}-UNIT`);
  return [assumptionCheck(`CASE-${unit}-BASELINE`, `Case · ${unit} unit entry`, 'No extra GCE subject prerequisite was listed; the common GCE baseline applies.')];
};

const parseCents = (value: string): number | null => {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + (whole.startsWith('-') ? -1 : 1) * Number(fraction.padEnd(2, '0'));
};
export const validateExam = (exam: ExamInput): string[] => {
  const errors: string[] = [];
  const pattern = patterns.find(item => item.code === exam.pattern && item.unit === exam.unit);
  if (!pattern) return ['Exam pattern does not match unit'];
  for (const section of pattern.sections) {
    const value = exam.scores[section.code];
    if (value === undefined || value === '') continue;
    const cents = parseCents(value);
    if (cents === null || cents > section.maximum * 100) errors.push(`${section.name}: use at most two decimals and a score no higher than ${section.maximum}`);
  }
  const total = parseCents(exam.officialTotal);
  if (exam.officialTotal !== '' && (total === null || total > 8000)) errors.push('Official total must be a valid net score with at most two decimals');
  const values = pattern.sections.map(section => parseCents(exam.scores[section.code] ?? ''));
  if (total !== null && values.every(value => value !== null) && values.reduce((sum, value) => sum + (value ?? 0), 0) !== total) errors.push('Official total does not match the sum of all section scores');
  return errors;
};
const scoreChecks = (exam: ExamInput, department: Department, academic: AcademicInput): Check[] => {
  const pattern = patterns.find(item => item.code === exam.pattern && item.unit === exam.unit);
  if (!pattern) return [check('MCQ-PATTERN', 'Exam pattern', 'FAIL', 'Not selected', 'Select the pattern for this unit', patternSource)];
  const errors = validateExam(exam);
  if (errors.length) throw new Error(errors.join('; '));
  const expectedEPattern = academic.track === 'BUSINESS' ? 'E_BUSINESS' : academic.track ? 'E_OTHER' : '';
  const total = parseCents(exam.officialTotal);
  const checks: Check[] = [
    check('MCQ-OVERALL', 'Overall official net MCQ score', total !== null && total >= 3600 ? 'PASS' : 'FAIL', total === null ? 'Not entered' : `${(total / 100).toFixed(2)} / 80`, '36.00 / 80 (45%)', mcq),
    check('MCQ-SECTIONS-COMPLETE', 'Official net section scores', pattern.sections.every(section => parseCents(exam.scores[section.code] ?? '') !== null) ? 'PASS' : 'FAIL', pattern.sections.filter(section => parseCents(exam.scores[section.code] ?? '') === null).map(section => section.name).join(', ') || 'All entered', 'Every section entered', patternSource),
    check('EXAM-VERIFIED', 'Official result verification (record only)', exam.verified ? 'PASS' : 'FAIL', exam.verified ? exam.resultReference || 'Verified' : 'Not verified', 'Staff verification before final admission processing', mcq, true)
  ];
  if (exam.unit === 'E') checks.push(check('E-PATTERN-TRACK', 'E-unit exam pattern matches study track', expectedEPattern && exam.pattern === expectedEPattern ? 'PASS' : 'FAIL', exam.pattern, expectedEPattern || 'Enter study track', patternSource));
  for (const minimum of department.minimums) {
    const section = minimum.section === 'BIOLOGY' ? { name: 'Biology (Botany + Zoology)', maximum: 44 } : pattern.sections.find(item => item.code === minimum.section);
    if (!section) {
      checks.push(check('PATTERN-SECTION', `${minimum.section} section`, 'FAIL', 'Not available', 'Score section in selected pattern', patternSource));
      continue;
    }
    const value = minimum.section === 'BIOLOGY' ? (() => {
      const botany = parseCents(exam.scores.BOTANY ?? '');
      const zoology = parseCents(exam.scores.ZOOLOGY ?? '');
      return botany === null || zoology === null ? null : botany + zoology;
    })() : parseCents(exam.scores[minimum.section] ?? '');
    const required = section.maximum * minimum.percent;
    checks.push(check(`${department.unit}-${department.code}-${minimum.section}-${minimum.percent}`, `${section.name} section minimum`, value !== null && value >= required ? 'PASS' : 'FAIL', value === null ? 'Not entered' : `${(value / 100).toFixed(2)} / ${section.maximum}`, `${(required / 100).toFixed(2)} / ${section.maximum} (${minimum.percent}%)`, { pdfPage: department.page, section: `${department.name} row` }));
  }
  return checks;
};
const practicalChecks = (candidate: CandidateInput, department: Department): Check[] => {
  if (!department.practical) return [];
  const practical = candidate.practicals.find(item => item.departmentCode === department.code);
  const value = parseCents(practical?.score ?? '');
  const source = { pdfPage: 3, section: `${department.name} practical row` };
  return [
    check(`${department.code}-PRACTICAL`, `Practical result for ${department.name}`, value !== null && value >= 800 && value <= 2000 ? 'PASS' : 'FAIL', value === null ? 'Not entered' : `${(value / 100).toFixed(2)} / 20`, '8.00 / 20 (40%; draft threshold assumption)', source),
    check(`${department.code}-PRACTICAL-VERIFIED`, 'Practical verification (record only)', practical?.verified ? 'PASS' : 'FAIL', practical?.verified ? practical.reference || 'Verified' : 'Not verified', 'Staff verification before final admission processing', source, true)
  ];
};
const finalChecks = (checks: Check[]): Check[] => checks.map(item => item.result === 'UNKNOWN' ? { ...item, result: 'FAIL', actual: item.actual === 'Unresolved' ? 'Missing information' : item.actual } : item);

export const evaluate = (candidate: CandidateInput, policy: Policy, phase: Evaluation['phase']): Evaluation => {
  const common = commonChecks(candidate.academic);
  const decisions: Decision[] = phase === 'UNITS'
    ? units.map(unit => ({ unitCode: unit, status: statusOf(finalChecks([...common, ...unitAcademicChecks(unit, candidate.academic)])), checks: finalChecks([...common, ...unitAcademicChecks(unit, candidate.academic)]) }))
    : departments.map(department => {
      const exam = candidate.exams.find(item => item.unit === department.unit);
      if (!exam) return { unitCode: department.unit, departmentCode: department.code, departmentName: department.name, status: 'NOT_ATTEMPTED' as const, checks: [] };
      const checks = finalChecks([...common, ...academicChecks(department, candidate.academic), ...scoreChecks(exam, department, candidate.academic), ...practicalChecks(candidate, department)]);
      return { unitCode: department.unit, departmentCode: department.code, departmentName: department.name, status: statusOf(checks), checks };
    });
  const selected = selectedSeven(candidate.academic);
  const inputSnapshot = structuredClone(candidate);
  inputSnapshot.academic.qualifyingSevenIds = selected.map(row => row.id);
  return { session: '2025-2026', policyVersion: policy.version, policyHash: policy.hash, engineVersion: ENGINE_VERSION, phase, candidate: { internalReference: candidate.internalReference, name: candidate.name }, inputSnapshot, createdAt: new Date().toISOString(), decisions };
};
