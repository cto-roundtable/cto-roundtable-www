/**
 * The counting rules of the forening's general meeting (årsmøte), as pure
 * functions: no database, no Nuxt, so they run under `node --test` (tests/unit).
 * server/utils/generalMeetings.ts uses them; the deal votes do NOT (they keep
 * their own resultOf in dealRounds.ts, unchanged). tests/unit/regression-deals
 * pins this module's two_thirds rule to dealRounds.resultOf, so the two cannot
 * drift apart without a failing test.
 *
 * Every rule is a PRESET from the vedtekter, never a free-form fraction:
 *   majority                § 5.5  more than half of the votes cast; a tie goes to lots
 *   two_thirds              § 9    at least 2/3 of the votes cast (vedtektsendring)
 *   three_quarters          § 10   at least 3/4 of the votes cast (oppløsning)
 *   three_quarters_present  § 5.2  at least 3/4 of those present (a sak not on the saksliste)
 * "Votes cast" (avgitte stemmer) is yes + no by default: a blank is not a vote
 * cast (dc-76 H1). A meeting can count blanks as cast instead (count_base
 * 'yes+no+blank'); that is data on the meeting, not code.
 */

export type Preset = 'majority' | 'two_thirds' | 'three_quarters' | 'three_quarters_present'
export type CountBase = 'yes+no' | 'yes+no+blank'
export type BallotKind = 'open' | 'secret'
export type MeetingChoice = 'yes' | 'no' | 'blank'
export type Outcome = 'passed' | 'failed' | 'tie' | 'no_votes'

export const PRESETS: Preset[] = ['majority', 'two_thirds', 'three_quarters', 'three_quarters_present']
export const COUNT_BASES: CountBase[] = ['yes+no', 'yes+no+blank']
export const BALLOT_KINDS: BallotKind[] = ['open', 'secret']
export const MEETING_CHOICES: MeetingChoice[] = ['yes', 'no', 'blank']

interface PresetDef {
  /** yes must reach num/den of the base */
  num: number
  den: number
  /** true: MORE than num/den (majority); false: at least num/den */
  strict: boolean
  /** cast = the votes cast (count_base); present = everyone present for the item */
  over: 'cast' | 'present'
  /** § 5.5: a tie is settled by lots. Only simple majority can tie. */
  tieByLot: boolean
  paragraph: string
}

const DEFS: Record<Preset, PresetDef> = {
  majority: { num: 1, den: 2, strict: true, over: 'cast', tieByLot: true, paragraph: '§ 5.5' },
  two_thirds: { num: 2, den: 3, strict: false, over: 'cast', tieByLot: false, paragraph: '§ 9' },
  three_quarters: { num: 3, den: 4, strict: false, over: 'cast', tieByLot: false, paragraph: '§ 10' },
  three_quarters_present: { num: 3, den: 4, strict: false, over: 'present', tieByLot: false, paragraph: '§ 5.2' },
}

/** The rule snapshot stored on meeting_items.rules. Set by the server only. */
export interface ItemRules {
  preset: Preset
  threshold: string
  strict: boolean
  base: CountBase | 'present'
  ballot: BallotKind
  tie: 'lot' | 'fails'
  paragraph: string
}

export function isPreset(value: unknown): value is Preset {
  return typeof value === 'string' && (PRESETS as string[]).includes(value)
}
export function isCountBase(value: unknown): value is CountBase {
  return typeof value === 'string' && (COUNT_BASES as string[]).includes(value)
}
export function isBallotKind(value: unknown): value is BallotKind {
  return typeof value === 'string' && (BALLOT_KINDS as string[]).includes(value)
}
export function isMeetingChoice(value: unknown): value is MeetingChoice {
  return typeof value === 'string' && (MEETING_CHOICES as string[]).includes(value)
}

export function rulesFor(preset: Preset, countBase: CountBase, ballot: BallotKind): ItemRules {
  const d = DEFS[preset]
  return {
    preset,
    threshold: `${d.num}/${d.den}`,
    strict: d.strict,
    base: d.over === 'present' ? 'present' : countBase,
    ballot,
    tie: d.tieByLot ? 'lot' : 'fails',
    paragraph: d.paragraph,
  }
}

export interface Counts {
  yes: number
  no: number
  blank: number
  /** present for the item: checked in at close, or cast a ballot on it */
  present: number
}

export interface Decision {
  outcome: Outcome
  /** the number the threshold is taken of */
  base: number
  /** the fewest yes votes that pass, with this base (null when the base is 0) */
  needed: number | null
}

/** The base a rule is counted over. */
export function baseOf(c: Counts, rules: Pick<ItemRules, 'base'>): number {
  if (rules.base === 'present') return c.present
  if (rules.base === 'yes+no+blank') return c.yes + c.no + c.blank
  return c.yes + c.no
}

/** Fewest yes votes that pass: more than num/den (strict) or at least num/den of base. */
export function neededFor(base: number, preset: Preset): number | null {
  if (base <= 0) return null
  const d = DEFS[preset]
  return d.strict ? Math.floor((d.num * base) / d.den) + 1 : Math.ceil((d.num * base) / d.den)
}

/**
 * The result of an item. Integer arithmetic only (no floating point near a
 * boundary). A base of 0 (nobody voted yes or no, or nobody present) is
 * 'no_votes': nothing was decided, and nothing is drawn. A majority item where
 * yes = no > 0 is a 'tie' for the chair's lot (§ 5.5); a 2/3 or 3/4 item with
 * yes = no has simply not reached its threshold.
 */
export function decide(c: Counts, rules: Pick<ItemRules, 'preset' | 'base'>): Decision {
  for (const k of ['yes', 'no', 'blank', 'present'] as const) {
    if (!Number.isInteger(c[k]) || c[k] < 0) throw new Error(`count ${k} must be a whole number >= 0`)
  }
  const d = DEFS[rules.preset]
  const base = baseOf(c, rules)
  if (base === 0) return { outcome: 'no_votes', base, needed: null }
  const needed = neededFor(base, rules.preset)
  if (d.tieByLot && c.yes === c.no && c.yes > 0) return { outcome: 'tie', base, needed }
  const passes = d.strict ? c.yes * d.den > d.num * base : c.yes * d.den >= d.num * base
  return { outcome: passes ? 'passed' : 'failed', base, needed }
}

/** What stands after the lot of a tie: the lot's outcome, else the counted one. */
export function finalOutcome(result: Outcome | null, lot: 'passed' | 'failed' | null): Outcome | null {
  if (result === 'tie') return lot ?? 'tie'
  return result
}

export interface OpenBallot {
  person_id: string
  choice: MeetingChoice
  cast_at: string
}

/**
 * Count an OPEN-ballot item: the latest ballot per person counts, and only
 * ballots from the roster. `present` is everyone checked in at close plus anyone
 * who voted on the item (a member who voted and then left still cast a vote).
 */
export function countOpenItem(rosterIds: string[], presentIds: string[], ballots: OpenBallot[]) {
  const onRoster = new Set(rosterIds)
  const latest = new Map<string, OpenBallot>()
  for (const b of ballots) {
    if (!onRoster.has(b.person_id)) continue
    const prev = latest.get(b.person_id)
    if (!prev || Date.parse(b.cast_at) >= Date.parse(prev.cast_at)) latest.set(b.person_id, b)
  }
  const counts: Counts = { yes: 0, no: 0, blank: 0, present: 0 }
  for (const b of latest.values()) counts[b.choice]++
  const present = new Set(presentIds.filter((id) => onRoster.has(id)))
  for (const id of latest.keys()) present.add(id)
  counts.present = present.size
  return { counts, voters: [...latest.values()], present: [...present] }
}

/**
 * Count a SECRET-ballot item: choices carry no person. `receiptIds` are the
 * people who voted (one receipt each); the number of choices must equal the
 * number of receipts, or the count is refused rather than guessed.
 */
export function countSecretItem(
  rosterIds: string[],
  presentIds: string[],
  receiptIds: string[],
  choices: MeetingChoice[],
) {
  if (choices.length !== receiptIds.length) {
    throw new Error(`secret ballot mismatch: ${choices.length} choices, ${receiptIds.length} receipts`)
  }
  const onRoster = new Set(rosterIds)
  const counts: Counts = { yes: 0, no: 0, blank: 0, present: 0 }
  for (const c of choices) counts[c]++
  const present = new Set(presentIds.filter((id) => onRoster.has(id)))
  for (const id of receiptIds) present.add(id)
  counts.present = present.size
  return { counts, voters: receiptIds, present: [...present] }
}

/** Who is present now, from append-only in/out rows: the latest row per person wins. */
export function presentFrom(rows: { person_id: string; present: boolean; at: string }[]): string[] {
  const latest = new Map<string, { present: boolean; at: number }>()
  for (const r of rows) {
    const at = Date.parse(r.at)
    const prev = latest.get(r.person_id)
    if (!prev || at >= prev.at) latest.set(r.person_id, { present: r.present, at })
  }
  return [...latest.entries()].filter(([, v]) => v.present).map(([id]) => id)
}

const PRESET_NB: Record<Preset, string> = {
  majority: 'alminnelig flertall, mer enn halvparten av de avgitte stemmene (§ 5.5)',
  two_thirds: 'minst 2/3 av de avgitte stemmene (§ 9)',
  three_quarters: 'minst 3/4 av de avgitte stemmene (§ 10)',
  three_quarters_present: 'minst 3/4 av de fremmøtte (§ 5.2)',
}
const OUTCOME_NB: Record<Outcome, string> = {
  passed: 'Vedtatt',
  failed: 'Ikke vedtatt',
  tie: 'Stemmelikhet, avgjøres ved loddtrekning',
  no_votes: 'Ikke vedtatt, ingen avgitte stemmer',
}

export interface ItemProtocolInput {
  position: number
  title: string
  rules: ItemRules
  counts: Counts
  decision: Decision
  presentNames: string[]
  ballot: BallotKind
  lot: { outcome: 'passed' | 'failed'; note: string; byName: string } | null
}

const votesNb = (n: number) => `${n} ${n === 1 ? 'stemme' : 'stemmer'}`

/** The item's protocol in Norwegian, for the minutes. Deterministic from frozen data. */
export function itemProtocolText(p: ItemProtocolInput): string {
  const c = p.counts
  const lines = [
    `Sak ${p.position}: ${p.title}`,
    `Til stede: ${c.present}${p.presentNames.length ? ` (${p.presentNames.join(', ')})` : ''}.`,
    `Stemmegivning: ${p.ballot === 'secret' ? 'skriftlig og hemmelig' : 'åpen'}.`,
    `Ja ${c.yes}, nei ${c.no}, blankt ${c.blank}.`,
    `Krav: ${PRESET_NB[p.rules.preset]}. ${
      p.rules.base === 'present'
        ? `Grunnlaget er ${p.decision.base} fremmøtte.`
        : p.rules.base === 'yes+no+blank'
          ? `Blanke stemmer regnes som avgitt. Grunnlaget er ${votesNb(p.decision.base)}.`
          : `Blanke stemmer regnes ikke som avgitt. Grunnlaget er ${votesNb(p.decision.base)}.`
    }${p.decision.needed !== null ? ` Det trengs minst ${p.decision.needed} ja.` : ''}`,
  ]
  if (p.decision.outcome === 'tie' && p.lot) {
    lines.push(
      `Resultat: Stemmelikhet, avgjort ved loddtrekning (${p.lot.note}, ført av ${p.lot.byName}): ${
        p.lot.outcome === 'passed' ? 'vedtatt' : 'ikke vedtatt'
      }.`,
    )
  } else {
    lines.push(`Resultat: ${OUTCOME_NB[p.decision.outcome]}.`)
  }
  return lines.join('\n')
}
