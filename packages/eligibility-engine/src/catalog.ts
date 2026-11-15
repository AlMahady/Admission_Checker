import type { UnitCode } from './types.js';

export interface Section { code: string; name: string; maximum: number }
export interface Pattern { code: string; unit: UnitCode; name: string; sections: Section[] }
export interface Minimum { section: string; percent: number }
export interface Department { code: string; name: string; unit: UnitCode; page: number; minimums: Minimum[]; practical?: boolean }

const s = (code: string, name: string, maximum: number): Section => ({ code, name, maximum });
export const patterns: Pattern[] = [
  { code: 'A', unit: 'A', name: 'Unit A', sections: [s('BANGLA','Bangla',3),s('ENGLISH','English',3),s('MATHEMATICS','Mathematics',22),s('PHYSICS','Physics',22),s('CHEMISTRY','Chemistry',22),s('ICT','ICT',8)] },
  { code: 'B', unit: 'B', name: 'Unit B', sections: [s('BANGLA','Bangla',20),s('ENGLISH','English',20),s('GENERAL_MATHEMATICS','General Mathematics',20),s('GENERAL_KNOWLEDGE','General Knowledge',15),s('LOGICAL_ANALYSIS','Logical Analysis',5)] },
  { code: 'C', unit: 'C', name: 'Unit C', sections: [s('BANGLA','Bangla',20),s('ENGLISH','English',20),s('GENERAL_DEPARTMENT','General Knowledge and Department Topics',40)] },
  { code: 'C1', unit: 'C1', name: 'Unit C1', sections: [s('BANGLA','Bangla',10),s('ENGLISH','English',10),s('GENERAL_KNOWLEDGE','General Knowledge',20),s('DEPARTMENT_TOPICS','Department Topics',40)] },
  { code: 'D', unit: 'D', name: 'Unit D', sections: [s('BANGLA','Bangla',4),s('ENGLISH','English',4),s('INTELLIGENCE','Intelligence',4),s('CHEMISTRY','Chemistry',24),s('BOTANY','Botany',22),s('ZOOLOGY','Zoology',22)] },
  { code: 'E_BUSINESS', unit: 'E', name: 'E · business studies', sections: [s('BANGLA','Bangla',20),s('ENGLISH','English',20),s('ACCOUNTING','Accounting',20),s('MANAGEMENT','Management',20)] },
  { code: 'E_OTHER', unit: 'E', name: 'E · science, humanities or equivalent', sections: [s('BANGLA','Bangla',20),s('ENGLISH','English',20),s('MATH_ANALYTICAL','Mathematics and Analytical Ability',20),s('BUSINESS_GK','Business General Knowledge',20)] },
  { code: 'IBA', unit: 'IBA', name: 'IBA-JU', sections: [s('BANGLA','Bangla',5),s('ENGLISH','English',30),s('MATH_IQ','Mathematical Aptitude and IQ',30),s('CONTEMPORARY','Contemporary and Analytical Topics',15)] }
];
const d = (unit: UnitCode, code: string, name: string, page: number, minimums: Minimum[] = [], practical = false): Department => ({ unit, code, name, page, minimums, practical });
const m = (section: string, percent: number): Minimum => ({ section, percent });
export const departments: Department[] = [
  d('A','MATHEMATICS','Mathematics',2,[m('MATHEMATICS',50)]),
  d('A','STATISTICS','Statistics and Data Science',2),
  d('A','CHEMISTRY','Chemistry',2,[m('CHEMISTRY',60)]),
  d('A','PHYSICS','Physics',2),
  d('A','GEOLOGY','Geological Sciences',2),
  d('A','CSE','Computer Science and Engineering',2,[m('MATHEMATICS',60),m('PHYSICS',60)]),
  d('A','ENVIRONMENT','Environmental Sciences',2),
  d('A','IIT','Institute of Information Technology',2,[m('MATHEMATICS',60),m('PHYSICS',60)]),
  d('B','ECONOMICS','Economics',2),
  d('B','GEOGRAPHY','Geography and Environment',2),
  d('B','GOVERNMENT','Government and Politics',2),
  d('B','ANTHROPOLOGY','Anthropology',2,[m('BANGLA',50),m('ENGLISH',50)]),
  d('B','PLANNING','Urban and Regional Planning',2),
  d('B','PUBLIC_ADMIN','Public Administration',2),
  d('C','BANGLA','Bangla',3,[m('BANGLA',50),m('ENGLISH',30)]),
  d('C','ENGLISH','English',3,[m('ENGLISH',60)]),
  d('C','HISTORY','History',3),
  d('C','PHILOSOPHY','Philosophy',3),
  d('C','ARCHAEOLOGY','Archaeology',3),
  d('C','INTERNATIONAL_RELATIONS','International Relations',3),
  d('C','JOURNALISM','Journalism and Media Studies',3,[m('ENGLISH',60)]),
  d('C','LAW','Law and Justice',3,[m('BANGLA',60),m('ENGLISH',60)]),
  d('C','COMPARATIVE_LITERATURE','Comparative Literature and Culture',3),
  d('C1','DRAMA','Drama and Dramatics',3,[],true),
  d('C1','FINE_ARTS','Fine Arts',3,[],true),
  d('D','BOTANY','Botany',3,[m('BOTANY',50)]),
  d('D','ZOOLOGY','Zoology',3,[m('ZOOLOGY',50)]),
  d('D','PHARMACY','Pharmacy',3,[m('CHEMISTRY',50),m('BIOLOGY',50)]),
  d('D','BIOCHEMISTRY','Biochemistry and Molecular Biology',3,[m('CHEMISTRY',50),m('BIOLOGY',50)]),
  d('D','MICROBIOLOGY','Microbiology',3,[m('CHEMISTRY',50),m('BIOLOGY',50)]),
  d('D','BIOTECH','Biotechnology and Genetic Engineering',3,[m('CHEMISTRY',50),m('BIOLOGY',50)]),
  d('D','PUBLIC_HEALTH','Public Health and Informatics',3),
  d('E','FINANCE','Finance and Banking',3),
  d('E','MARKETING','Marketing',3),
  d('E','ACCOUNTING','Accounting and Information Systems',3),
  d('E','MANAGEMENT','Management Studies',3),
  d('IBA','IBA_JU','Institute of Business Administration, IBA-JU',4)
];
export const units: UnitCode[] = ['A','B','C','C1','D','E','IBA'];
export const subjects = ['Bangla','English','Mathematics','Further Mathematics','Statistics','Physics','Chemistry','Biology','Economics','Accounting','Business Studies','ICT','Other'];
