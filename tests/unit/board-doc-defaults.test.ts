// Which sections a board document opens with (app/utils/markdown.ts). Run: npm run test:unit.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { defaultOpenState, outlineMarkdown } from '../../app/utils/markdown.ts'

const openTitles = (md: string): string[] => {
  const outline = outlineMarkdown(md)
  const state = defaultOpenState(outline)
  const all = outline.sections.flatMap((s) => [s, ...s.children])
  return all.filter((s) => state[s.id]).map((s) => s.title)
}

const withShort = `# Styremøte nr. 3

## Til stede
| a | b |

## Saksliste
| Sak | Emne |

## Kortversjon
**Sak 1: Status**
- **Vit:** noe

---

## Detaljer
### Sak 1: Status (10 min)
tekst
### Sak 2: Årsmøte (25 min)
tekst

## Vedtak (fylles ut under møtet)
| Sak | Vedtak |
`

describe('defaultOpenState', () => {
  test('opens only the Kortversjon when the agenda has one', () => {
    assert.deepEqual(openTitles(withShort), ['Kortversjon'])
  })

  test('without a Kortversjon, opens the sections that hold saker and closes every sak', () => {
    const md = withShort.replace(/## Kortversjon[\s\S]*?---\n/, '')
    assert.deepEqual(openTitles(md), ['Detaljer'])
  })

  test('matches the heading case-insensitively, but not a heading that only mentions it', () => {
    assert.deepEqual(openTitles('## kortversjon\ntekst\n## Detaljer\n### Sak 1\nx'), ['kortversjon'])
    assert.deepEqual(openTitles('## Om kortversjonen\ntekst\n## Detaljer\n### Sak 1\nx'), ['Detaljer'])
  })
})
