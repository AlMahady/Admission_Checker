import type { Policy } from '../../eligibility-engine/src/types.js';

// This working interpretation applies the user's GCE matrix as executable rules.
// It is a definite checker policy, not a representation of university sign-off.
export const provisionalPolicy: Policy = {
  version: '2025-2026-working-assumptions-2',
  hash: 'ju-gce-assumptions-2026-11-14',
  // Kept for the legacy policy shape; no university approval is implied.
  approved: {},
  subjectLevelBindings: {}
};
