# JU Admission Checker: Working Assumptions

These assumptions make the supplied GCE eligibility matrix produce definite results. They are implementation choices for this checker, not claims of university approval. The engine version is `0.3.0`; the active rule set is `2025-2026-working-assumptions-2`.

## Applied to unit and department decisions

- **Seven qualifying subjects:** require at least five passed O-Level subjects and two passed full A-Level subjects. Count the highest grade once per subject, then use the best five O-Level and best two full A-Level results. Retakes do not create extra subject slots.
- **Grade distribution:** among those seven, require at least four grades B or higher and at least three grades C or higher. A higher grade can satisfy either threshold.
- **GCE grade mapping:** A* is above A; A and A* meet an `A-` or `A` cutoff. `A+` means A* for GCE. E counts as a pass for subject-count rules but does not meet the C cutoff. F and U are failures.
- **National curriculum tables:** the explicit GCE criteria replace national GPA/grade-table criteria for GCE candidates. General unit requirements and department-specific GCE requirements apply together.
- **Qualification level:** keep the A-Level binding from the source extraction for A-unit and D life-science subject routes. Public Health accepts O-Level or full A-Level for each of its four subjects. Where B/C and E/IBA give no level, accept O-Level or full A-Level. The English department requires English at both O-Level and full A-Level.
- **A Unit:** every A-unit department requires A-Level Physics, Chemistry and Mathematics at B or higher. Department cutoffs are added on top. CSE/IIT `A+` is interpreted as A*.
- **Unit gateway:** the common GCE baseline plus the unit prerequisite determines exam eligibility. D requires at least one listed D department subject route. C1 uses the common GCE baseline because no separate GCE prerequisite was supplied.
- **E and IBA-JU:** staff select Science, Humanities or Business from the candidate's GCE study track. Science requires Mathematics and English at A- or higher. Humanities/Business requires English and at least one of Accounting, Economics or Mathematics at A or higher. E uses the Business test pattern for Business and the other pattern for Science/Humanities.
- **Unlisted departments:** apply the unit-level subject requirement and standard 36/80 MCQ pass mark. Do not invent another GCE grade or section cutoff.
- **D Public Health:** apply the O/A option to Chemistry, Biology, Mathematics and English. The A-Level only on the other named D routes stays in force.
- **D Biochemistry:** use the A-Level Chemistry and Biology A cutoff used for related life-science departments.
- **D Biology section:** for departments with a Chemistry and Biology section cutoff, Biology is the combined Botany plus Zoology score. Microbiology uses both Chemistry and Biology cutoffs.
- **MCQ:** use the official net total and section scores. The overall pass is 36/80; the 0.20 wrong-answer penalty is assumed already reflected in the official net score. Listed department section percentages are applied to official section net scores.
- **C1 practical:** retain the draft's 8/20 minimum (40%) where a practical is required; show this as a short case note because the supplied matrix did not state a practical cutoff.
- **Verification:** certificate, MCQ and practical verification are recorded in reports but do not alter academic eligibility. Missing grades, years, track, exam scores or practical scores result in Not eligible until entered.

The affected requirement rows display the relevant assumption as a short note. The units and departments screens do not have a separate “Needs review” outcome.

## Not calculated by this eligibility checker

- **Merit points:** the supplied conversion is recorded as A*/A = 5, B = 4, C = 3.5 and D = 3. The checker does not calculate merit rank or equivalent GPA because the document does not define subject aggregation, weighting, extra-subject handling or rounding.
- **Final admission processing:** quotas, tie-breaks, seat allocation, official choice-list access and later notices are outside this eligibility result. “Eligible” means the entered record meets the implemented unit/department conditions; it does not guarantee a seat.
- **Later sessions:** these rules represent the 2025-2026 session in the source draft. A later session needs its own source and rule set.
