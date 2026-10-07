# Design-System · Tokens v2

Design Tokens des Playlist-Konverters. `tokens-v2.css` und `tokens-v2.json` sind unveränderte
Kopien aus dem Collage Maker (`KodiniTools/collage-maker`, `src/design-system/`, Stand `9dc4eca`),
der sie seinerseits aus dem Playlist Generator übernimmt. So teilen Collage Maker, Alarmtool,
Playlist Generator und Playlist-Konverter auf kodinitools.com dieselbe Palette, dieselben Radien
und dieselbe Motion. Werte werden dort gepflegt und hierher kopiert; `tokens-v2.spec.js` hält JSON
und CSS konsistent und prüft den Kontrast (WCAG AA).

## Dateien

| Datei                         | Zweck                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tokens-v2.css`               | **Laufzeit-Quelle.** CSS Custom Properties `--ds-*`, Dark auf `:root`, Light auf `.light-theme` und `:root[data-theme='light']`. |
| `tokens-v2.json`              | Maschinenlesbare Fassung (W3C-Design-Tokens-nah), `$extensions.css` nennt die Variable.                                          |
| `tokens-v2.js`                | Zugriff aus JS (Port von `tokens-v2.ts`), z. B. `themeColorsV2('light')`.                                                        |
| `__tests__/tokens-v2.spec.js` | Konsistenz JSON ↔ CSS, Light-Spiegelung, Namespace, Kontrast-Audit, Einbindung.                                                  |
| `__tests__/tokenTestUtils.js` | CSS-Block-Parser, Token-Walker, Kontrastberechnung.                                                                              |
| `../styles/foundation.css`    | Gemeinsame Grundlage für App und Landing-Seite: Tokens, Supreme, Body, Farbschema, SSI-Partials, reduzierte Bewegung.            |
| `../landing/landing.css`      | Styles der Landing-Seite (`index.html`), nur `--ds-*`, importiert die Grundlage.                                                 |
| `../assets/fonts/Supreme-*`   | Supreme 400 / 500 / 700 (aus dem Collage Maker), per `@font-face` in `foundation.css` gebündelt.                                 |

## Theme-Mechanik

`src/stores/ui.js` setzt `html[data-theme]` (für Tokens und SSI-Partials), `body.light-theme`
(Parität zum Playlist Generator) und weiterhin `html.dark` (Altbestand für externe Skripte) und
schreibt `localStorage.theme`. Ein Inline-Skript in `app.html` setzt `data-theme` vor dem ersten
Paint aus `localStorage.theme`, damit es keinen Dark-Flash gibt. Standard ist Light. Ändert die
SSI-Navigation `data-theme` direkt, übernimmt der Store das per `MutationObserver`.

## Einbindung

- **App (`app.html`):** `src/style.css` importiert `tailwindcss/base`, dann `styles/foundation.css`,
  dann `tailwindcss/components` und `tailwindcss/utilities`. So steht die Body-Regel wie im
  Collage Maker nach dem Preflight.
- **Landing-Seite (`index.html`):** lädt `src/landing/landing.css` (Grundlage + Seitenstyles, ohne
  Tailwind) und hat dasselbe Pre-Paint-Skript sowie dieselbe Theme-Synchronisierung wie die App.
  Der Seiteninhalt liegt in `<main id="app" class="landing">`.
- `faq.html` und `funktion.html` laufen noch auf eigenem Inline-CSS (v1).

## SSI-Partials

Navigation, Footer und Cookie-Banner liegen außerhalb von `#app`; deshalb muss jeder Seiteninhalt in
`#app` liegen. `src/styles/foundation.css` übernimmt die
Partial-Regeln des Collage Makers: eigene Hintergründe transparent, Text `--ds-text`, Links
`--ds-link` (Hover `--ds-accent`), Dropdowns `--ds-surface-1`, Hamburger-Icons in `currentColor`,
Cookie-Banner unverändert und immer oben (`z-index: 10000`).

## Tailwind-Brücke

Tailwind bleibt als Utility-Schicht für Layout. Farben, Radien, Schatten und Dauern kommen aus den
Tokens (`tailwind.config.js`), es gibt keine `dark:`-Varianten mehr:

| Rolle                        | Klasse                                                                                                          | Variable                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Seite, Panel, Eingabe, Hover | `bg-surface-0` … `bg-surface-3`                                                                                 | `--ds-surface-0…3`                        |
| Rahmen, Feldrahmen           | `border-line`, `border-line-strong` (auch nur `border`)                                                         | `--ds-border`, `--ds-border-strong`       |
| Text 1–3                     | `text-ink`, `text-ink-2`, `text-ink-3`                                                                          | `--ds-text`, `--ds-text-2`, `--ds-text-3` |
| Primäraktion                 | `bg-accent hover:bg-accent-hover text-on-accent`                                                                | `--ds-accent*`, `--ds-on-accent`          |
| Auswahl, aktive Fläche       | `bg-accent-soft border-accent`                                                                                  | `--ds-accent-soft`                        |
| Link, Status                 | `text-link`, `text-success`, `text-warning`, `text-danger`, `text-info`                                         | `--ds-link`, `--ds-success` … `--ds-info` |
| Statuskante                  | `border-l-[3px] border-l-success` … `border-l-danger`                                                           | `--ds-success` … `--ds-danger`            |
| Radien                       | `rounded-sm` (6) · `rounded-md` (10) · `rounded-lg` (16) · `rounded-full`                                       | `--ds-radius-*`                           |
| Schatten                     | `shadow-overlay` (nur Player-Bar, Toast) · `shadow-focus`                                                       | `--ds-shadow-overlay`, `--ds-focus-ring`  |
| Motion                       | `transition-colors` (150 ms) · `duration-slow` (250 ms)                                                         | `--ds-duration*`, `--ds-ease`             |
| Control-Höhen                | `h-control-sm` 28 · `h-control-md` 36 · `h-control-lg` 40 · `min-h-row` 44                                      | `--ds-control-*`, `--ds-row-height`       |
| Ebenen                       | `z-player` · `z-toast`                                                                                          | `--ds-z-player`, `--ds-z-toast`           |
| Schriftgrade                 | `text-xs` 12 · `text-sm` 13 · `text-md` 14 · `text-lg` 16 · `text-xl` 20 · `text-2xl` 24 · `text-3xl` 32 (Hero) | `--ds-text-xs…3xl`, `--ds-leading*`       |
| Schrift, Gewichte            | `font-sans`, `font-mono`, `font-medium` 500 · `font-semibold` 600 · `font-bold` 700, `tracking-tight`           | `--ds-font-*`, `--ds-weight-*`            |

## Regeln

- Gold ist Vollfläche nur für die Primäraktion (Konvertieren, Dateien auswählen, Download) und den
  aktiven Play-Button; darauf steht immer `text-on-accent`.
- Ein Rahmen (1 px), drei Radien, Schatten nur für Overlays. Hover ändert Farbe, nie Größe.
- Status wird benannt, nicht gefärbt: Icon (`StatusIcon.vue`) + Text + 3-px-Kante links auf
  `surface-1`, nie als Flächenfüllung. Statusfarben als Text nur auf `surface-1` (auf `surface-2`
  liegen `warning`/`danger` im Light-Theme unter 4.5:1).
- Destruktive Aktionen (Entfernen, Abbrechen) sind `text-danger` auf einer flachen Fläche.
- Fokus immer über `--ds-focus-ring` (global in `style.css`), nie `outline`.
- Deaktiviert nur über Opazität (`opacity-45`), keine Farbänderung.

`src/tests/designTokens.spec.js` verhindert die Rückkehr der alten v1-Palette (`neutral`, `muted`,
`secondary`, `dark`, `accent-dark/-light`), von `dark:`-Varianten, Tailwind-Standardfarben, Blur,
Karten-Schatten, Hover-Lifts und festen Farbwerten in Styles.
