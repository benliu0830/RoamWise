---
name: Roamwise
description: Light travel discovery with landscape photography, readable place cards, and restrained teal actions.
colors:
  ink: '#202d2c'
  muted: '#586963'
  teal: '#246b64'
  teal-dark: '#1b514c'
  mint: '#eaf2ef'
  paper: '#f7f9f5'
  line: '#dce4dd'
  white: '#fff'
  danger: '#9d3428'
  category-food: '#ba4b2b'
  category-food-tint: '#fff0e9'
  category-museums: '#7434ca'
  category-museums-tint: '#f3edff'
  category-landmarks: '#2563c9'
  category-landmarks-tint: '#edf3ff'
  category-nature: '#247941'
  category-nature-tint: '#eaf5ed'
  category-entertainment: '#bc2369'
  category-entertainment-tint: '#fff0f6'
  category-shopping: '#975900'
  category-shopping-tint: '#fff5e2'
  category-hidden: '#0b7971'
  category-hidden-tint: '#e7f5f2'
typography:
  display:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: 'clamp(42px, 4.8vw, 66px)'
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: '-0.04em'
  headline:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: 'clamp(27px, 3vw, 40px)'
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: '-0.035em'
  title:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: '21px'
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: '15px'
    lineHeight: 1.65
  label:
    fontFamily: "Manrope, 'Segoe UI', sans-serif"
    fontSize: '13px'
    fontWeight: 650
rounded:
  card: '16px'
  button: '10px'
  field: '9px'
  notice: '10px'
  tag: '5px'
  small-control: '8px'
  search: '12px'
  category-badge: '6px'
  category-chip: '24px'
  branch-row: '12px'
spacing:
  page-gutter: '48px'
  medium-gutter: '30px'
  compact-gutter: '24px'
  phone-gutter: '20px'
  section: '76px'
  section-compact: '50px'
  section-mobile: '40px'
  grid: '25px'
  grid-compact: '20px'
  card-inset: '22px'
  form-inset: '36px'
components:
  button-primary:
    backgroundColor: '{colors.teal}'
    textColor: '{colors.white}'
    rounded: '{rounded.button}'
    padding: '13px 22px'
  button-primary-hover:
    backgroundColor: '{colors.teal-dark}'
  button-secondary:
    backgroundColor: '{colors.white}'
    textColor: '{colors.ink}'
    rounded: '{rounded.button}'
    padding: '13px 22px'
  button-secondary-hover:
    backgroundColor: '{colors.mint}'
  button-quiet:
    backgroundColor: 'transparent'
    textColor: '{colors.teal}'
    rounded: '{rounded.button}'
    padding: '13px 0'
  field:
    backgroundColor: '#fcfdfb'
    textColor: '{colors.ink}'
    rounded: '{rounded.field}'
    padding: '13px 14px'
  choice:
    backgroundColor: '{colors.white}'
    rounded: '{rounded.small-control}'
    padding: '11px 13px'
  choice-selected:
    backgroundColor: '{colors.mint}'
    textColor: '{colors.teal-dark}'
  tag:
    backgroundColor: '{colors.mint}'
    textColor: '{colors.teal-dark}'
    rounded: '{rounded.tag}'
    padding: '7px 11px'
  place-card:
    backgroundColor: '{colors.white}'
    rounded: '{rounded.card}'
  navigation:
    textColor: '{colors.muted}'
    padding: '11px 15px'
  itinerary-stop:
    padding: '20px 0 26px 25px'
  destination-search:
    backgroundColor: '{colors.white}'
    rounded: '{rounded.search}'
    height: '64px'
    width: '820px'
    padding: '6px'
  category-chip:
    backgroundColor: '{colors.white}'
    textColor: '{colors.muted}'
    rounded: '{rounded.category-chip}'
    padding: '10px 15px'
  category-badge:
    rounded: '{rounded.category-badge}'
    padding: '5px 9px'
  branch-row:
    backgroundColor: '{colors.white}'
    rounded: '{rounded.branch-row}'
    padding: '20px'
---

# Design System: Roamwise

## Overview

**Creative North Star: User-pinned premium light travel.**

Retain the user's white/off-white surfaces, charcoal typography, muted teal, generous whitespace, destination photography, and rounded cards. Airbnb and Google Travel remain quality references. The November 6 refinement improves the existing visual system rather than introducing a different identity.

A centered destination search leads into panoramic landscape photography and a direct Local Mode link. The two modes remain photographic choices. Working screens prioritize readable information, comfortable controls, and clear current navigation. The November 9 extension carries category identity into discovery, maps, and itineraries while keeping detailed information progressively disclosed.

**Key Characteristics:**

- Light paper and white surfaces with charcoal and muted teal.
- Prominent destination search and direct Local Mode handoff.
- Self-hosted Manrope with comfortable cards and controls.
- Destination photography with explicit image provenance.
- Category cues paired with labels and stroke icons.
- Compact branch comparisons and accessible native disclosures.

## Colors

Use the frontmatter's exact source values. Teal identifies primary actions and selections and provides a fallback geographic accent; category colors carry place-specific map pins and timeline points. Ink carries the main content; muted ink supports it on paper, white, mint, and warm mode-card surfaces. The text pairs checked during refinement meet at least 4.5:1 contrast (the lowest checked pair is muted copy on the warm mode card at 4.84:1).

Category accents use coral for food and cafes, purple for museums and history, blue for landmarks, green for nature, rose for entertainment, amber for shopping, and teal for hidden gems. Their paired pale tints support badges and selected chips. The same primary category follows a place through cards, map pins and legends, popups, and itinerary stops. Opening status adds labeled green, rust, or muted text; color is accompanied by words.

**The Meaningful Accent Rule.** Use teal to identify actions and selection while category colors identify place type; keep reading surfaces light.

Focus remains a 3px ring in #3d8880 with a 4px offset. Selection uses #cce4db with #163e37 text. Contextual map, imagery, error, and placeholder surfaces remain source-defined. An image disclosure uses an opaque dark-green overlay so white text stays readable over photography.

## Typography

Self-hosted Manrope supports weights 200-800. Keep the source font stack and visible fallback. The home heading uses the frontmatter display scale; tablet uses clamp(40px, 7vw, 56px), and phone uses clamp(34px, 9.6vw, 54px) with 1.13 line height. Other page headings use clamp(32px, 3.5vw, 45px); the compact phone results heading uses 30px.

Place titles use 19px on desktop and 21px on phones, with 700 weight and 1.35 line height; compact map grids retain contextual sizes. Branch address headings use 17px, 650 weight and 1.5 line height, reducing to 16px on phones. Discovery descriptions use 13px with 1.7 line height and a two-line clamp; badges use 11px and metadata generally 12px. Primary body copy stays 15px, introductions 14-16px. Legal/image disclosures can use 11px; functional controls generally use 12-16px. Mobile text-entry fields use 16px where focus zoom is a concern.

## Layout

Containers stay 1320px wide including padding. Gutters are 48px desktop, 30px at 1100px, 24px at 780px, and 20px at 600px. Section spacing is 76px desktop, 50px tablet, and 40px phone. The header is sticky, 80px desktop / 72px compact. Sticky maps and detail panels use a 104px top offset on desktop.

The home hero is a centered vertical composition with a 30px gap: heading and search above a full-width 275px panoramic photograph. At 780px its gap is 24px and photograph 260px high; on phones the copy aligns left and photograph is 235px high. Its white caption panel stays within the photograph. Mode choices use a two-column outer grid and split text/photo interiors; the outer grid stacks at 780px.

Destination photography has a separate white caption area. Three columns reduce to two at 780px, with the third spanning the row, then one column at 600px. All destinations remain visible on phones.

Discovery has three card columns, reducing to two at 1100px. Map view uses a compact two-column card grid and map; its card grid becomes one column at 1100px. At 780px the map stacks above two columns of cards. At 600px every place grid becomes a single column. Branch collections use two columns with a 16px gap, stacking at 780px. Forms, details, builder, and itinerary panels stack at 780px. Phone results compress heading, origin summary, actions, and control spacing so places appear sooner. Additional narrow-phone adjustments apply at 360px.

## Elevation & Depth

The shared ambient shadow is 0 12px 36px #203d2d0c. Forms and discovery place cards use it to stand off the light paper. The destination search uses its own softer 0 8px 26px #203d2d0d shadow, deepening to #203d2d18 on focus. Branch rows use a fine border without a resting shadow. Avoid adding a decorative border underneath that shadow. Selected place cards use a semantic teal selection ring. Cards lift 2px; buttons lift 1px. Mode and destination imagery retains subtle scale transitions.

The single landscape entrance lasts 1.2s with cubic-bezier(0.16, 1, 0.3, 1). Reduced-motion preferences disable animations, transitions, and smooth scrolling.

## Shapes

Cards and major imagery share a 16px radius. Primary controls use 10px, fields 9px, compact controls 8px, and tags 5px. Category badges use 6px corners, category chips a 24px radius, and compact branch rows 12px corners. Circular favorite actions are 44px; circular map markers remain geographic signifiers. Keep the compass, pins, and stroke icons consistent.

## Components

### Buttons and navigation

Teal primary buttons and white secondary buttons share 48px minimum height (44px for small buttons). Quiet buttons keep transparent backgrounds and teal copy. Hover, focus, selected, disabled, and loading states remain clear. Active navigation has a mint surface and aria-current; the mobile toggle identifies its controlled navigation and updates its accessible name when open.

### Search and forms

The home destination search is a single white surface, at most 820px wide and 64px high, with a location icon, accessible field label, clear control, and strong Explore button. On phones it is 62px high with a compact icon submit button that retains its accessible text. Destination suggestions use a keyboard-operable listbox, visible active choice, and loading, empty, and error feedback. A nearby link opens Local Mode directly. Form fields are at least 52px on desktop, with 13px labels, 15px values, and generous grouping. Interest checkboxes use 44px minimum choices. Native validation and all API form behavior are preserved.

### Place cards

Discovery photography uses a 16:10 ratio. Card bodies are flexible columns with 22px padding, keeping actions anchored after the facts. Category badges pair a stroke icon and text on their pale tint. Titles, descriptions, addresses, distance, opening status, selection, and details have distinct weights and spacing. Descriptions are clamped to two lines; detailed content belongs on the venue page. Category-photo disclosures remain visible and missing facts stay explicit.

### Discovery controls and disclosures

Category chips and place-name search remain directly available. Chips have a 44px minimum height, category-colored icons, and a category tint plus inset ring when aria-pressed is true. Advanced filters and destination weather use native details/summary disclosures; opening their summaries reveals the existing controls and context. Search-origin settings retain their own disclosure. Keep names, labels, keyboard behavior, and expanded state accessible.

### Branch collections and venue details

Business collections compare compact, address-led branch rows: business name, address, distance, opening status, favorite, plan selection, and detail actions. Rows use 20px padding (18px on phones), a quiet border, and no resting shadow. Repeated category inspiration photos are omitted here; available provider photos appear as 96-by-72px thumbnails. The collection map lives inside an expandable native disclosure.

Venue details hold the sourced description, weekly opening schedule, address, map, directions, favorite, and plan actions. Descriptions use 14px copy, 1.9 line height, and at most 68ch. Missing or uncertain hours remain labeled; no business website button is presented.

**The Facts Before Detail Rule.** Keep comparison facts readable in results and branch rows; disclose secondary controls and use the venue page for longer sourced content.

### Maps and itineraries

Maps remain interactive Leaflet surfaces with attribution. Itinerary schedules use readable tabular times, a fine route line, larger stop names, 12-13px supporting information, and individual directions links. Detail/map sidebars clear the sticky navigation; stacked panels return to normal positioning on tablet and phone.

### Feedback and saved items

Loading, empty, error, successful saves, AI fallback, geolocation-denied, and blocked-storage states retain their functional copy. Notices and weather strips use comfortable 13px text on tinted surfaces. Favorites and plans use the shared card and control vocabulary. Source notes remain available below results and plans.

## Do's and Don'ts

- **Do** keep the user's light travel identity and use photography with clear provenance.
- **Do** make primary tasks easy to locate; preserve the real data and working routes.
- **Do** keep every destination choice available on mobile.
- **Do** keep controls comfortable, focus visible, and reduced motion supported.
- **Don't** disguise category photography as a photo of the retrieved venue.
- **Don't** treat source, DOM, or contrast calculations as visual browser approval.
- **Do** pair category colors with readable labels and icons across discovery, maps, and itineraries.
- **Do** keep branch collections focused on address, distance, hours, and usable actions.
- **Don't** add monetary preferences, admission information, prices, or spending constraints to cards, forms, or itineraries.

The November 6 pass passed the existing 11 automated tests and syntax checks. Main text/button contrast pairs were calculated. Browser access was unavailable in that earlier pass. This historical record is not approval of the November 9 extension; its source merge does not claim real-device or screen-reader verification.
