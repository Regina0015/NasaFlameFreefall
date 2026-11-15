// Publication policy for findings in the dashboard. Everything the team has not decided is a setting here,
// not a rule buried in a component. Source of the grades: _config/confidence.md.

export const POLICY = {
  // Grades shown as verified conclusions.
  verifiedGrades: ['A', 'B'],

  // Grade C is "an indication, not a conclusion". The team has not decided whether a Grade C finding whose
  // checks were not all reviewed may be published, so it is listed apart and never called verified.
  // Set to [] to withhold Grade C completely, once the team decides.
  indicationGrades: ['C'],

  // A stored chart is drawn only for these categories, and only when the audit passed check C9
  // (every number in the chart comes from the finding or its recalculation).
  chartCategories: ['verified', 'indication', 'gap'],
  chartRequiresC9: true,

  // The proof graph shows where a result came from; it carries no numbers of its own.
  graphCategories: ['verified', 'indication', 'gap'],
}

export const CATEGORY_ORDER = ['verified', 'indication', 'gap', 'pending', 'withheld']
