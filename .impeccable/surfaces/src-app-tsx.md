---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/index.css"]
---

# Collection app shell (login, collection, add card, account)

Mode: operate. Audience: Brazilian OP TCG players, at home cataloguing and at stores checking cards. Task: see what I own per set, change quantities, open the card's Liga page, add cards. Constraints: no prices in-app; no partnership claims; pt-BR; card art = official "SAMPLE" images.

## Direction contract

THESIS: The collection is a streaming shelf: each set is a horizontal row of card art, and the card you touch grows in place to tell you what it is. It refuses the category default of a dark-gold card grid buried in badges and chips.

OWN-WORLD: Deep neutral ink ground (#0E1014) and raised ink (#1A1D23); the card art is the only colour; one signal orange (#FF6B3D) owns focus, the scan action and the Liga link. Figtree for all text, tabular numerals for codes and counts. No gradients, glow, glass or badge soup; a card's colour appears only as one small dot.

STORY: The player sees their sets as rows with real completion (owned / cards in set), touches a card to see name, code, rarity and copies, changes the quantity right there, and jumps to Liga for the price. Scanning or typing a code adds a card.

FIRST VIEWPORT: Header "Minha coleção" with totals and the account button; a search field; the first set row with its name and completion; one focused tile expanded (art, name, code · rarity, quantity stepper, "Ver preço na Liga"); later rows dimmed while a tile is focused; bottom tab bar with Coleção, an orange centre Escanear button, and Conta.

FORM: streaming title-card wall, catalog challenger chosen in the bolder re-roll (position 5 of 6 in the dealt hand); seed:e6938034539a1eca. Signature interaction: focus-expand, where the touched tile widens in place, neighbours slide aside, and the other rows dim.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
