---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/index.css","src/Decks.tsx","src/Wishlist.tsx"]
---

# Collection app shell (login, collection, wishlist, decks, add card, account)

Mode: operate. Audience: Brazilian OP TCG players, at home cataloguing and at stores checking cards. Tasks: see what I own per set (filter by colour, trait, type, rarity, cost), change quantities, keep a wishlist with prices noted from Liga and a running total of what I plan to buy now, plan several decks that follow the official deck rules and show what I own vs. what is missing, open the card's Liga page, add cards. Constraints: no fetched prices (only prices the player notes); no partnership claims; pt-BR; card art = official "SAMPLE" images.

## Direction contract

THESIS: The collection is a streaming shelf: each set is a horizontal row of card art, and the card you touch grows in place to tell you what it is. Every card face carries its count in one small bubble at its bottom-right corner, never repeated copies side by side. It refuses the category default of a dark-gold card grid buried in badges and chips.

OWN-WORLD: Two grounds chosen by the scene (follows the phone; fixable in Conta): deep neutral ink (#0E1014 / raised #1A1D23) at night or in store light, cool neutral light (#F4F5F7 / raised #FFFFFF) by day. The card art is the only colour; one signal red (fill #D7261E, red text tuned per ground) owns focus, the scan action, totals and the Liga link. Figtree for all text, tabular numerals for codes, counts and money. No gradients, glow, glass or badge soup; a card's colour appears only as one small dot. Cards you don't own sit desaturated with a "faltam N" mark.

STORY: The player sees their sets as rows with real completion, filters them, touches a card to see name, code, rarity and copies, changes the quantity right there, and jumps to Liga for the price. In Desejos they tick what they are buying today and read the total. In Decks they build legal decks, see at a glance what is missing, and send the missing copies to Desejos in one tap.

FIRST VIEWPORT: Header "Minha coleção" with totals; a search field with a Filtros button and active-filter chips; the first set row with its name and completion; one focused tile expanded (art, name, code · rarity, quantity stepper, "Ver preço na Liga"); later rows dimmed while a tile is focused; bottom tab bar with Coleção, Desejos, a red centre Escanear button, Decks and Conta.

FORM: streaming title-card wall, catalog challenger chosen in the bolder re-roll (position 5 of 6 in the dealt hand); seed:e6938034539a1eca. Signature interaction: focus-expand, where the touched tile widens in place, neighbours slide aside, and the other rows dim.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
