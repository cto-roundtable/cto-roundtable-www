# huddle review-kit: the frame half (the bridge)

`review-bridge.js` is copied byte for byte from huddle (`vongohren/huddle`,
`static/review-bridge.js` at commit `3c9fe2f91fc1ba7b87bd69850c3ea8365dfd4640`,
review-kit 0.7.0). huddle's CI builds that file from `packages/review-kit` and
fails on any byte that differs, so it is exactly that source. MIT, see `LICENSE`.

sha256 `d9b3511c1247a1041bcf872e057088c27bbc0a02bd0def9c529ce366879d881d`

**Only the frame half.** Snorre, ctori-4 dc-65 H1 (2026-10-30): copy the part
that runs inside the document into this public repo (it runs in members'
browsers anyway), not the shell. The shell, the comments' storage and who sees
what are the portal's own: `app/components/invest/DeckCommentLayer.vue`,
`server/utils/investComments.ts`.

What it does in the deck frame: a tap or a selection names the block it landed
on (`part1~p[2]`) and posts it to the portal; the portal sends back numbered
markers (`pins`) and the frame draws them on the blocks. The protocol is
`{hb: 1, type}` over postMessage; the portal checks `event.source`. It reads the
page and posts, nothing else: no network, no storage, no cookies (and the frame
is an opaque origin, so there are none to read).

**Updating:** take `static/review-bridge.js` from a newer huddle commit, replace
the file, put the new commit and sha256 here, and check the deck with
`e2e/preview.sh`. Never edit the file here: a change goes into huddle first.
Biome skips this directory (`biome.json`), so the file stays byte-identical.
