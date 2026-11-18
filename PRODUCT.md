# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

PWA used mainly on iPhone (Safari, added to the home screen); must also work in mobile and desktop browsers.

## Users

Brazilian One Piece Card Game players, in two situations with equal weight:

- **At home, cataloguing:** after opening boosters or sorting a binder, scanning a stack of cards in one sitting.
- **At a store or tournament:** quick look-ups during trades, such as "do I already have this card?" and "what is it worth on Liga?"

## Product Purpose

Let a player point the phone at a card, read its printed code (e.g. OP01-120), and keep an accurate personal collection (card code → quantity) that syncs across devices. Success means adding a card takes seconds and the collection is always at hand.

## Positioning

Scanning reads the printed card code rather than recognising the artwork, so it is fast and works on any set. Prices are never copied into the app: the app sends the player to the card's live page on Liga One Piece (ligaonepiece.com.br), the Brazilian price reference.

## Operating Context

- One-handed use on a phone, sometimes in poor store lighting, often between other things.
- Batch scanning of many cards in a row at home.
- Liga One Piece opens in Safari; it sits behind a Cloudflare bot check, so the app can only link to it, never fetch from it.

## Capabilities and Constraints

- Accounts: e-mail + password and Google (Firebase Authentication).
- Collection: one Firestore document per player, `users/{uid} = { cards: { code: quantity } }`; quantity 0 removes the card. Works offline via local cache.
- **Prices are only what the player notes by hand** (changed 2026-11-18 at the user's request): after opening a card on Liga, the app offers to record the Menor / Médio / Maior values the player saw, stored with the date and shown with its age ("há 3 dias"; amber after 7 days). The app never fetches, estimates or invents prices.
- **Never claim a partnership with Liga One Piece** or any official status. There is none.
- Card images: user decision (2026-11-18) is to show Bandai's "SAMPLE"-watermarked card images, loaded from optcgapi.com. Bandai's own server blocks embedding (Cross-Origin-Resource-Policy). A watermark reduces but does not remove copyright risk, so a kill switch (`VITE_CARD_IMAGES=off`) swaps every image for a colour block. Never self-host copies. Catalog (names, colours, rarity, set; no prices) is built from optcgapi.com by `scripts/build-catalog.mjs`.
- Supported card code formats: OP##-###, ST##-###, EB##-###, PRB##-###, P-###.
- Free-tier only (Firebase Spark); all Firebase code is isolated in `src/backend.ts`.
- Undecided: the app's final name (currently the placeholder "OP TCG"), catalog source, variant tracking (parallel / alt art), hosting.

## Brand Commitments

- Interface language: Brazilian Portuguese (pt-BR), short and friendly.
- No Bandai, One Piece or Liga logos in the app's own branding.

## Evidence on Hand

- No users, testimonials, metrics or partnerships exist. Do not fabricate any.
- Spec doc: https://claude.ai/artifact/MKZRA4W9XWqZ3aYoLW9JZ9

## Product Principles

1. Adding a card must be faster than writing it down.
2. Liga is the single source of prices; the app never pretends otherwise.
3. Players' data is private by default and minimal (e-mail + card list), in line with LGPD.
4. Works for a quick glance in a noisy store as well as a long cataloguing session.

## Accessibility & Inclusion

Touch targets at least 44 × 44 pt; legible in low light; text at 16 px or more in inputs (prevents Safari zoom).
