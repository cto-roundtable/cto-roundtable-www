/** Why a deal ended (hq 048, the CHECK on pipeline_deals.decline_category): coarse on
 *  purpose, the finer why is the reason line (decline_reason). ticket_size must stand out
 *  wherever a no is shown (Snorre 2026-11-11). The page's copy is app/utils/noList.ts;
 *  tests/unit/no-list.test.ts keeps the two equal. */
export const DECLINE_CATEGORIES = ['ticket_size', 'they_declined', 'missed_round', 'not_a_fit', 'company_dead'] as const
export type DeclineCategory = (typeof DECLINE_CATEGORIES)[number]
