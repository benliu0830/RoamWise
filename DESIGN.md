---
name: Roamwise
description: Premium light travel discovery with real destination photography and restrained teal accents.
colors:
  ink: "#202d2c"
  muted: "#5c6b68"
  teal: "#246b64"
  teal-dark: "#1b514c"
  mint: "#eaf2ef"
  paper: "#fafbf8"
  line: "#dde4df"
  white: "#fff"
  danger: "#9d3428"
typography:
  display:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: "clamp(45px, 5.2vw, 73px)"
    fontWeight: 600
    lineHeight: 1.09
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: "clamp(27px, 3vw, 40px)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: "15px"
    lineHeight: 1.65
  label:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 650
rounded:
  card: "14px"
  button: "8px"
  field: "7px"
  notice: "9px"
  tag: "5px"
spacing:
  page-gutter: "48px"
  medium-gutter: "30px"
  compact-gutter: "22px"
  section: "68px"
  section-compact: "45px"
  section-mobile: "35px"
  grid: "25px"
  grid-compact: "18px"
  card-inset: "19px"
  form-inset: "30px"
components:
  button-primary:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "13px 22px"
  button-primary-hover:
    backgroundColor: "{colors.teal-dark}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "13px 22px"
  button-secondary-hover:
    backgroundColor: "{colors.mint}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.teal}"
    rounded: "{rounded.button}"
    padding: "13px 0"
  field:
    backgroundColor: "#fcfdfb"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "11px 12px"
  choice:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.field}"
    padding: "9px 12px"
  choice-selected:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.teal-dark}"
  tag:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.teal-dark}"
    rounded: "{rounded.tag}"
    padding: "4px 9px"
  place-card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.card}"
  navigation:
    textColor: "{colors.muted}"
    padding: "9px 0"
  itinerary-stop:
    padding: "18px 0 20px 20px"
---

# Design System: Roamwise

## Overview

**Creative North Star: "User-pinned premium light travel"**

Roamwise follows the user's established white/off-white, charcoal, muted-teal travel direction. Airbnb and Google Travel are quality references: generous whitespace, elegant headings, destination photography, rounded cards, and restrained motion. The North Star above describes that established direction; it is not a new creative decision.

Landscape imagery and quiet surfaces invite exploration, while structured labels keep search, place discovery, and itinerary planning understandable. The interface shares one restrained typography and component vocabulary across those tasks.

**Key Characteristics:**
- Light paper and white surfaces with charcoal text.
- Muted teal for actions, selection, and geographic cues.
- Self-hosted Manrope throughout.
- Photographic cards, subtle depth, and responsive grids.
- Explicit labels for inspiration imagery, missing facts, and estimates.

Extracted from `public/css/styles.css`, `public/index.html`, and `public/js/app.js`. Source/DOM workflows and live APIs were reported as passing in this session. The browser automation bridge failed to attach: no screenshot, rendered visual approval, or real-device visual verification exists. Desktop and mobile visual QA remain outstanding.

## Colors

The frontmatter preserves the CSS custom-property values. The palette uses one restrained teal accent family and warm light neutrals.

### Primary
- **Muted Teal** (`teal`): primary actions, active navigation, categories, map markers, and timeline points.
- **Deep Teal** (`teal-dark`): primary hover and text on mint notices or selected choices.

### Neutral
- **Charcoal Ink** (`ink`): headings, body text, and toast backgrounds.
- **Soft Muted Ink** (`muted`): supporting copy, facts, addresses, and resting navigation.
- **Mint Surface** (`mint`): selected interests, notices, tags, and image placeholders.
- **Off-white Paper** (`paper`): page background and timeline-point borders.
- **White Surface** (`white`): cards, forms, secondary controls, and navigation.
- **Quiet Line** (`line`): dividers and control borders.

Error text uses `danger` on a pale warm notice surface. Focus rings use the implemented medium teal (`#3d8880`). Selection, scrollbars, image overlays, and supporting panels have contextual local CSS colors rather than additional global palette roles.

**The Meaningful Accent Rule.** Use teal to identify actions, selection, and geographic cues while keeping reading surfaces light.

## Typography

**Display Font:** Manrope with Segoe UI and sans-serif fallbacks.
**Body Font:** The same stack. The local variable font supports weights (200-800) with `font-display: swap`.

The type is clear and softly geometric. Headings use tight tracking and balanced wrapping; supporting copy uses generous leading. Paragraphs have a global maximum measure (70ch), with narrower contextual limits.

### Hierarchy
- **Display:** the frontmatter describes the home hero. Overrides set its size to (58px) at 1100px and below, (43px) at 780px and below, and (51px) with line-height (1.1) at 540px and below.
- **Headline:** the frontmatter describes default section headings. Page-level headings use a separate base scale with contextual page/detail overrides.
- **Title:** the frontmatter describes default third-level headings. Place titles use (16px), increasing to (18px) on small screens; timeline titles use (17px), reducing to (15px) on small screens.
- **Body:** the default role supports normal reading. Supporting interface text commonly uses (11-14px); the hero introduction uses (16px) before responsive overrides.
- **Label:** the label role describes form labels; desktop navigation uses (14px, weight 600). Metadata uses the same font family.

## Layout

Containers and navigation are capped at (1320px), including horizontal padding. Gutters follow the frontmatter scale: desktop, medium at 1100px and below, compact at 780px and below. Standard section spacing reduces at 780px and again at 540px. Pages use top/bottom padding (42px/80px), reducing to (25px/45px) on small screens.

Desktop discovery uses three card columns. Map view uses two card columns beside a map, reduces its card area to one column at 1100px, and stacks the map above two card columns at 780px. All place grids become single columns at 540px. Forms, details, builder, and itinerary sidebars stack at 780px; the form's photographic aside is hidden there.

The home hero remains split through tablet widths and stacks at 540px. Mode cards retain their internal split while their outer grid stacks at 780px. The destination grid becomes one column at 540px and shows its first destination only. Navigation becomes an expandable vertical panel at 540px. A large-screen breakpoint (min-width 1500px) increases hero-photo height.

## Elevation & Depth

Depth comes from tonal surfaces, photography, thin dividers, and ambient shadows. The shared surface shadow is `0 8px 28px #203d2d0b` on search, forms, place cards, and saved-plan cards. Map markers, floating controls, navigation, toasts, and map messages have contextual shadows in the sidecar. Cards lift on hover (3px); primary and secondary buttons lift (1px).

The landscape entrance lasts (1.2s) with `cubic-bezier(0.16, 1, 0.3, 1)`. Photo hover scales run over (0.6s), buttons transition over (0.18s), and cards over (0.2s). Reduced-motion preferences disable animations/transitions and smooth scrolling.

## Shapes

Cards, major photographs, and maps share the card radius. Buttons, fields, notices, and tags use the smaller frontmatter radii. Favorite buttons, timeline points, and numbered markers are circular. Place markers use a rotated pin silhouette. Fine borders keep surfaces quiet while geographic and chronological cues carry stronger teal.

## Components

### Buttons

Primary buttons use teal and white; secondary buttons use white, ink, and a line border. Both share the button radius/inset, weight (650), gap (11px), and line-height (1.6). Primary hover deepens the background; secondary hover uses mint. Small buttons use padding (9px 14px) and type (13px), with contextual card variants. Quiet buttons use transparent backgrounds and teal text. Disabled buttons use wait cursors and opacity (0.65). All inherit the global focus ring.

### Chips

Interest choices are bordered checkbox labels. Selection changes the surface to mint, text to deep teal, and border to (`#89aaa0`). Tags use mint and deep teal. Day tabs use white at rest and teal with white text when active. Keep checked and active semantics in markup.

### Cards / Containers

Place cards use white, the card radius, clipped photography, the shared ambient shadow, and the card inset. Photo height is (190px), increasing to (220px) on small screens. Category, title, description, address, known/missing facts, selection, and details remain distinct. Inspiration images carry a visible disclosure overlay. Mode cards use tinted split-photography surfaces; saved plans share the core card vocabulary.

### Inputs / Fields

Fields use a lightly tinted surface, ink text, a thin border (`#d5ded7`), the field radius, and minimum height (46px). Labels have a (7px) gap; helper text uses muted ink. The global focus ring is (3px) with a (4px) offset. Errors use a warm notice with explicit text; a separate invalid-field border style is not defined.

### Navigation

Desktop navigation is a horizontal row of muted semibold links; the active route uses teal. Saved items have an outlined control and mint count badge. The header is nearly opaque white with a bottom line. At 540px and below, a button toggles the vertical panel and its expanded state.

### Itinerary Timeline

Tabular times occupy a narrow left column. Stop content follows a vertical line (`#bdd0c4`) with teal circular points, headings, assumptions, travel estimates, and directions. Desktop columns are (55px / remaining width), reducing to (45px / remaining width) on small screens. The adjacent map has numbered markers and stacks above the timeline at tablet widths.

### Feedback

Notices and weather strips use muted tinted surfaces. Loading uses a teal spinner; empty states use a quiet rounded panel. Toasts use charcoal, white text, and a short opacity/position transition. Provider failures, missing facts, permission failures, and persistence failures remain legible text.

## Do's and Don'ts

### Do:
- **Do** retain the user's light surfaces, charcoal type, muted teal, destination imagery, and Manrope.
- **Do** reuse the existing card, control, spacing, and focus treatments when adding screens.
- **Do** keep inspiration-photo disclosures, unknown facts, and scheduling estimates visible.
- **Do** preserve responsive stacking and reduced-motion support.

### Don't:
- **Don't** introduce a different visual identity without user direction.
- **Don't** present category inspiration imagery as a photo of a retrieved place.
- **Don't** treat source/DOM checks as screenshot or real-device visual approval.
