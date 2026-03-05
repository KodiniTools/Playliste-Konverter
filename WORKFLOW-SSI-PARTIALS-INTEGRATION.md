# Workflow: SSI-Partials Integration & Synchronisation

## Referenz-Implementierung: Playliste-Konverter

Dieses Dokument beschreibt exakt, wie der **Playliste-Konverter** die SSI-Partials (`nav.html`, `footer.html`, `cookie-banner.html`) fehlerfrei integriert hat, und liefert einen reproduzierbaren Workflow zum Reparieren anderer Tools.

---

## Teil 1: Wie funktioniert es im Playliste-Konverter?

### 1.1 Architektur-Ueberblick

```
+---------------------------------------------------------+
|  Apache Server (SSI-Verarbeitung)                       |
|  +---------------------------------------------------+  |
|  |  app.html / index.html / faq.html / funktion.html |  |
|  |  +---------------------------------------------+  |  |
|  |  | <!--#include virtual="/partials/nav.html"--> |  |  |
|  |  | <div id="app">  (Vue mountet hier)           |  |  |
|  |  | <!--#include virtual="/partials/footer.html-->|  |  |
|  |  | <!--#include virtual="/partials/cookie-...-->  |  |  |
|  |  +---------------------------------------------+  |  |
|  +---------------------------------------------------+  |
+---------------------------------------------------------+
         |                    |
         v                    v
+-----------------+  +------------------+
|  SSI-Partials   |  |  Vue App (SPA)   |
|  (statisch,     |  |  (dynamisch,     |
|   eigenes CSS   |  |   Tailwind CSS   |
|   + JS fuer     |  |   + Pinia Store  |
|   Theme/Lang)   |  |   fuer State)    |
+---------+-------+  +--------+---------+
          |                    |
          +--------+-----------+
                   v
      +------------------------+
      |  Synchronisation via:  |
      |  - CustomEvents        |
      |  - data-theme auf      |
      |    <html>              |
      |  - localStorage        |
      |  - dark CSS-Klasse     |
      +------------------------+
```

### 1.2 Zwei Arten von Seiten

Der Playliste-Konverter hat **zwei verschiedene Seitentypen**, die SSI-Partials unterschiedlich integrieren:

| Seitentyp | Dateien | SSI-Sync-Mechanismus |
|-----------|---------|----------------------|
| **Vue SPA** | `app.html` | Pinia Store (`ui.js`) + vue-i18n |
| **Statische Seiten** | `index.html`, `faq.html`, `funktion.html` | Inline `<script>` mit Vanilla JS |

### 1.3 Wie die SSI-Partials CSS erhalten

**Die Partials bringen ihr eigenes CSS mit**, aber der Playliste-Konverter ueberschreibt gezielt bestimmte Stile in `src/style.css`, um Farbkonsistenz zu erzwingen:

```css
/* Navigation und Footer: transparenter Hintergrund */
body > nav, body > nav *,
body > header, body > header *,
body > footer, body > footer * {
  background: transparent !important;
  background-color: transparent !important;
}
```

**Warum `body > nav` statt Klassen-Selektoren?**

Die SSI-Partials werden direkt als Kinder von `<body>` injiziert. Da die Partials projektuebergreifend geteilt werden, koennen keine Tool-spezifischen Klassen vorausgesetzt werden. Der Kindkombinator `>` ist praezise genug und vermeidet Konflikte mit App-internen `<nav>`-Elementen.

**CSS-Variablen-Vererbung: Warum die Partials kein eigenes CSS brauchen**

Die CSS Custom Properties auf `:root` (= `<html>`) sind vererbbar. Da die Partials im
selben DOM-Baum liegen, erben sie automatisch alle `--color-*`, `--bg-*`, `--border-*`
Variablen. Der Dark-Mode funktioniert ueber `html.dark` / `[data-theme="dark"]` — ein
einziges Attribut auf `<html>` schaltet die gesamte Farbpalette fuer alle Elemente um,
inklusive der SSI-Partials. Die `!important` Overrides in `body > nav` etc. sind nur
noetig, um *hartcodierte* Inline-Styles der Partials zu ueberschreiben (z.B. deren
eigene `background-color`).

### 1.4 Theme-Synchronisation (Dark/Light Mode)

Der Playliste-Konverter nutzt **zwei parallele Dark-Mode-Systeme**:

1. **`data-theme` Attribut auf `<html>`** - von der SSI-Navigation (`nav.html`) gesetzt
2. **Tailwind `dark` Klasse auf `<html>`** - von der Vue-App fuer Tailwind CSS benoetigt

```
SSI-Nav setzt data-theme="dark" auf <html>
          |
          v
window.dispatchEvent('theme-changed', { detail: { theme: 'dark' } })
          |
          v
ui.js: onThemeChanged()
          |
          +---> theme.value = 'dark'
          |
          v
ui.js: watch(theme) -> syncDarkClass()
          |
          +---> document.documentElement.classList.add('dark')
          |
          v
Ergebnis:
  - <html data-theme="dark" class="dark">
  - Tailwind dark: Klassen greifen (Vue-App)
  - [data-theme="dark"] CSS-Regeln greifen (SSI-Partials in style.css)
```

**Kritische Dateien:**
- `src/stores/ui.js` Zeilen 12-18: `syncDarkClass()`
- `src/stores/ui.js` Zeilen 59-64: `onThemeChanged()` Event-Handler
- `src/style.css` Zeilen 13-17: Dark-Mode Body-Hintergrund
- `src/style.css` Zeilen 31-47: Dark-Mode SSI-Element-Styling

**Warum zwei Systeme?**

Tailwind CSS (mit `darkMode: 'class'`) erwartet die Klasse `dark` auf `<html>`. Die SSI-Navigation setzt jedoch `data-theme="dark"`. Der Store synchronisiert beide.

### 1.5 i18n-Synchronisation

#### Vue SPA (app.html)

Die Vue-App hat **zwei i18n-Ebenen**:

**Ebene A: vue-i18n fuer Vue-Komponenten**
```javascript
// src/i18n/index.js - Uebersetzungen fuer Vue-Komponenten
const i18n = createI18n({
  locale: localStorage.getItem('locale') || 'de',
  messages: { de: { ... }, en: { ... } }
})
```

**Ebene B: `data-lang-*` Attribute fuer SSI-Footer/Cookie-Banner**
```javascript
// src/stores/ui.js
function updateDataLangElements(lang) {
  const attr = `data-lang-${lang}`
  document.querySelectorAll(`[${attr}]`).forEach(el => {
    el.textContent = el.getAttribute(attr)
  })
}
```

**Ebene C: `data-nav-i18n` Attribute fuer SSI-Navigation**

Die SSI-Navigation (`nav.html`) enthaelt Elemente mit `data-nav-i18n` Attributen
fuer textContent, title und aria-label. Diese werden NICHT automatisch durch die
Nav selbst uebersetzt, sondern muessen von der jeweiligen Seite aktualisiert werden:

```javascript
// src/stores/ui.js
function updateNavI18nElements(lang) {
  document.querySelectorAll('[data-nav-i18n]').forEach(el => {
    const text = el.getAttribute(`data-nav-text-${lang}`)
    if (text) el.textContent = text
    const title = el.getAttribute(`data-nav-title-${lang}`)
    if (title) el.setAttribute('title', title)
    const aria = el.getAttribute(`data-nav-aria-${lang}`)
    if (aria) el.setAttribute('aria-label', aria)
  })
}
```

**Warum drei Mechanismen?**

| Mechanismus | Zustaendigkeit | Elemente |
|-------------|---------------|----------|
| `data-lang-*` | Footer, Cookie-Banner | Einfache Texte mit beiden Sprachen als Attribute |
| `data-nav-i18n` | SSI-Navigation | Texte, Tooltips, aria-labels in der Nav |
| vue-i18n `$t()` | Vue-Komponenten | Alles innerhalb von `<div id="app">` |

**Ablauf bei Sprachwechsel (Vue SPA):**

```
SSI-Nav dispatcht 'language-changed' Event
          |
          v
ui.js: onLanguageChanged(event)
  +---> _suppressDispatch = true   // Verhindert Echo-Event
  +---> locale.value = newLang
          |
          v
ui.js: watch(locale)
  +---> document.documentElement.setAttribute('lang', newLang)
  +---> updateDataLangElements(newLang)   // Footer/Cookie-Banner
  +---> updateNavI18nElements(newLang)    // SSI-Navigation
  +---> (kein language-changed Event wegen _suppressDispatch)
          |
          v
App.vue: watch(uiStore.locale)
  +---> i18n locale.value = newLang       // Vue-Komponenten uebersetzen
          |
          v
Ergebnis:
  - Vue-Komponenten: $t() liefert neue Sprache (reaktiv)
  - SSI-Navigation: data-nav-i18n Texte + Tooltips aktualisiert
  - SSI-Footer: data-lang-* Texte aktualisiert
  - SSI-Cookie-Banner: data-lang-* Texte aktualisiert
  - Kein Page-Reload!
```

#### Statische Seiten (index.html, faq.html, funktion.html)

Die statischen Seiten nutzen ein **eigenes Inline-Script** mit `data-i18n` Attributen:

```html
<!-- Im HTML: -->
<span data-i18n="hero.title1">Audio-Dateien</span>

<!-- Im Script: -->
<script>
  const translations = {
    de: { 'hero.title1': 'Audio-Dateien', ... },
    en: { 'hero.title1': 'Merge Audio Files', ... }
  };

  function updateLanguage(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[lang]?.[key]) el.textContent = translations[lang][key];
    });
  }

  window.addEventListener('language-changed', (e) => {
    const newLang = e.detail?.lang;
    if (newLang && translations[newLang]) updateLanguage(newLang);
  });

  window.addEventListener('theme-changed', syncDarkClass);
</script>
```

**Wichtig:** Statische Seiten haben KEINE `data-lang-*` Attribute (das ist das SSI-Pattern fuer Footer/Cookie-Banner). Stattdessen nutzen sie `data-i18n` mit einem lokalen Uebersetzungsobjekt.

### 1.6 localStorage-Key-Konvention

**Einfaches Key-System** (kein Dual-Key wie im Bildkonverter):

| Zweck    | Key (global geteilt mit SSI-Nav) |
|----------|----------------------------------|
| Theme    | `theme`                          |
| Sprache  | `locale`                         |

```javascript
// Lesen:
const theme = localStorage.getItem('theme') || 'light'
const locale = localStorage.getItem('locale') || 'de'
```

Die SSI-Navigation (`nav.html`) schreibt dieselben Keys. Es gibt keine Tool-spezifischen Keys.

### 1.7 CSS-Styling der SSI-Elemente (`src/style.css`)

Die SSI-Partials werden durch gezielte CSS-Regeln gestylt:

| Regel | Zweck |
|-------|-------|
| `body > nav/header/footer { background: transparent }` | Partials erben App-Hintergrund |
| `[data-theme="dark"] body > nav * { color: #f9f2d5 }` | Dark-Mode Textfarbe |
| `[data-theme="dark"] body > nav a { color: #c9984d }` | Dark-Mode Link-Farbe (Accent) |
| `body > nav { position: relative; z-index: 100 }` | Nav ueber App-Content |
| `body > nav ul { z-index: 1000 }` | Dropdown-Menues ganz oben |
| `body > nav ul { background-color: var(--bg-card) }` | Dropdown braucht soliden Hintergrund |

**Warum transparent fuer Nav/Footer, aber nicht fuer Dropdowns?**

Nav und Footer sollen nahtlos in den App-Hintergrund uebergehen. Dropdown-Menues muessen jedoch einen soliden Hintergrund haben, da sie ueber anderen Inhalten schweben und sonst unleserlich waeren.

**Cookie-Banner Ausnahme:**

Der Cookie-Banner (`body > div` mit `position: fixed`) wird bewusst NICHT mit `background: transparent` ueberschrieben, da er seinen eigenen Hintergrund benoetigt um ueber dem Content lesbar zu bleiben.

---

## Teil 2: Haeufige Missstaende in anderen Tools

### Problem 1: Theme wechselt nicht synchron
**Symptom:** Tool wechselt auf Dark, aber Nav/Footer bleiben hell (oder umgekehrt).
**Ursache:** `dark` CSS-Klasse und `data-theme` Attribut werden nicht synchron gehalten.
**Loesung:** Bei jedem Theme-Wechsel BEIDES setzen:
```javascript
document.documentElement.setAttribute('data-theme', theme)  // SSI-Partials
document.documentElement.classList.toggle('dark', theme === 'dark')  // Tailwind
```

### Problem 2: SSI-Partials haben eigene Hintergrundfarbe
**Symptom:** Farbbrueche zwischen App-Hintergrund und Nav/Footer.
**Ursache:** Partials haben CSS mit hartcodierten `background-color` Werten.
**Loesung:** Im Tool-CSS die Partials-Hintergruende auf `transparent` zwingen:
```css
body > nav, body > nav *, body > footer, body > footer * {
  background: transparent !important;
}
```

### Problem 3: Dropdown-Menues sind transparent/unleserlich
**Symptom:** Navigation-Dropdowns sind durchsichtig, Text nicht lesbar.
**Ursache:** Die `transparent !important` Regel greift auch fuer Dropdown-Menues.
**Loesung:** Dropdown-Elemente gezielt mit solidem Hintergrund versehen:
```css
body > nav ul, body > nav [class*="dropdown"] {
  background-color: #ffffff !important;
}
[data-theme="dark"] body > nav ul {
  background-color: #142640 !important;
}
```

### Problem 4: i18n-Texte in Partials aendern sich nicht
**Symptom:** Vue-App wechselt Sprache, aber Footer zeigt alte Sprache.
**Ursache:** `data-lang-*` Elemente werden nicht aktualisiert.
**Loesung:** Bei jedem Sprachwechsel alle `data-lang-*` Elemente updaten:
```javascript
const attr = `data-lang-${lang}`
document.querySelectorAll(`[${attr}]`).forEach(el => {
  el.textContent = el.getAttribute(attr)
})
```

### Problem 5: Sprachwechsel loest Echo-Event aus
**Symptom:** Endlosschleife oder doppelte Sprachwechsel.
**Ursache:** Tool empfaengt `language-changed` Event, aendert Locale, dispatcht erneut `language-changed`.
**Loesung:** Flag-basierte Unterdrueckung wie in `ui.js`:
```javascript
let _suppressDispatch = false

// Beim Empfang des externen Events:
function onLanguageChanged(event) {
  _suppressDispatch = true
  locale.value = event.detail.lang
}

// Beim Watch:
watch(locale, (newLocale) => {
  if (!_suppressDispatch) {
    window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang: newLocale } }))
  }
  _suppressDispatch = false
})
```

### Problem 6: Cookie-Banner wird unsichtbar
**Symptom:** Cookie-Banner verschwindet oder hat keinen Hintergrund.
**Ursache:** Die `transparent !important` Regeln treffen auch den Cookie-Banner.
**Loesung:** Cookie-Banner NICHT in die transparent-Regeln einbeziehen. Nur `body > nav`, `body > header`, `body > footer` targeten - nicht `body > div`.

---

## Teil 3: Reparatur-Workflow fuer andere Tools

### Checkliste: SSI-Partials korrekt integrieren

Fuehre diese Schritte in exakt dieser Reihenfolge durch:

#### Schritt 1: HTML-Struktur pruefen

- [ ] SSI-Includes direkt als Kinder von `<body>`:
  ```html
  <body>
    <!--#include virtual="/partials/nav.html" -->
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
    <!--#include virtual="/partials/footer.html" -->
    <!--#include virtual="/partials/cookie-banner.html" -->
  </body>
  ```
- [ ] `<html lang="de">` vorhanden
- [ ] Keine Wrapper-Elemente um die SSI-Includes (sie werden direkt als `body`-Kinder eingefuegt)

#### Schritt 2: CSS fuer SSI-Elemente erstellen

Minimale CSS-Regeln die in der Haupt-Stylesheet-Datei vorhanden sein muessen:

```css
/* 1. Body Dark-Mode Hintergrund */
html.dark body,
[data-theme="dark"] body {
  background-color: #091428 !important;
}

/* 2. SSI-Elemente: transparenter Hintergrund (NICHT Cookie-Banner!) */
body > nav, body > nav *,
body > header, body > header *,
body > footer, body > footer * {
  background: transparent !important;
}

/* 3. Dark-Mode: helle Textfarbe fuer SSI-Elemente */
html.dark body > nav *, html.dark body > header *, html.dark body > footer *,
[data-theme="dark"] body > nav *, [data-theme="dark"] body > header *,
[data-theme="dark"] body > footer * {
  color: #f9f2d5 !important;
  background: transparent !important;
}

/* 4. Dark-Mode: Accent-Farbe fuer Links */
html.dark body > nav a, html.dark body > header a, html.dark body > footer a,
[data-theme="dark"] body > nav a, [data-theme="dark"] body > header a,
[data-theme="dark"] body > footer a {
  color: #c9984d !important;
}

/* 5. SSI-Elemente: z-index */
body > nav, body > header, body > footer {
  position: relative;
  z-index: 100 !important;
}

/* 6. Dropdown-Menues: solider Hintergrund (Light) */
body > nav ul, body > nav [class*="dropdown"], body > nav [class*="menu"] {
  z-index: 1000 !important;
  background-color: #ffffff !important;
}

/* 7. Dropdown-Menues: solider Hintergrund (Dark) */
html.dark body > nav ul, html.dark body > nav [class*="dropdown"],
[data-theme="dark"] body > nav ul, [data-theme="dark"] body > nav [class*="dropdown"] {
  background-color: #142640 !important;
  border-color: #1e3a5f !important;
}
```

#### Schritt 3: Theme-Synchronisation implementieren

**Fuer Vue/Pinia-basierte Tools:**

```javascript
// stores/ui.js
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useUIStore = defineStore('ui', () => {
  const theme = ref(localStorage.getItem('theme') || 'light')
  const locale = ref(localStorage.getItem('locale') || 'de')

  // Tailwind dark-Klasse mit data-theme synchronisieren
  function syncDarkClass(newTheme) {
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // Initial: pruefen ob SSI-Nav schon data-theme gesetzt hat
  const initialTheme = document.documentElement.getAttribute('data-theme')
    || localStorage.getItem('theme') || 'light'
  theme.value = initialTheme
  syncDarkClass(initialTheme)

  watch(theme, syncDarkClass)

  // Auf Theme-Events der SSI-Nav reagieren
  window.addEventListener('theme-changed', (e) => {
    const newTheme = e.detail?.theme
    if (newTheme && newTheme !== theme.value) theme.value = newTheme
  })

  return { theme, locale }
})
```

**Fuer statische Seiten (Vanilla JS):**

```javascript
function syncDarkClass() {
  const theme = document.documentElement.getAttribute('data-theme')
    || localStorage.getItem('theme') || 'light';
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

window.addEventListener('theme-changed', syncDarkClass);
syncDarkClass(); // Initial
```

#### Schritt 4: i18n-Synchronisation implementieren

**A) SSI-Partials (Footer, Cookie-Banner) - `data-lang-*` Pattern (PFLICHT):**

```javascript
function updateDataLangElements(lang) {
  const attr = `data-lang-${lang}`
  document.querySelectorAll(`[${attr}]`).forEach(el => {
    el.textContent = el.getAttribute(attr)
  })
}
```

**B) SSI-Navigation - `data-nav-i18n` Pattern (PFLICHT):**

Die SSI-Nav hat Elemente mit `data-nav-i18n` die textContent, title und aria-label tragen:

```javascript
function updateNavI18nElements(lang) {
  document.querySelectorAll('[data-nav-i18n]').forEach(el => {
    const text = el.getAttribute(`data-nav-text-${lang}`)
    if (text) el.textContent = text
    const title = el.getAttribute(`data-nav-title-${lang}`)
    if (title) el.setAttribute('title', title)
    const aria = el.getAttribute(`data-nav-aria-${lang}`)
    if (aria) el.setAttribute('aria-label', aria)
  })
}
```

**C) Eigene Seiten-Inhalte - `data-i18n` Pattern (fuer statische Seiten):**

```javascript
const translations = { de: { ... }, en: { ... } };

function updateLanguage(lang) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang]?.[key]) el.textContent = translations[lang][key];
  });
}
```

**D) Language-Event Handler mit Echo-Unterdrueckung (PFLICHT):**

```javascript
let _suppressDispatch = false;

// Externes Event empfangen (SSI-Nav -> Tool)
window.addEventListener('language-changed', (e) => {
  const newLang = e.detail?.lang;
  if (newLang && newLang !== locale.value) {
    _suppressDispatch = true;
    locale.value = newLang;
  }
});

// Bei Locale-Aenderung (Tool -> SSI-Partials)
watch(locale, (newLocale) => {
  document.documentElement.setAttribute('lang', newLocale);
  if (!_suppressDispatch) {
    window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang: newLocale } }));
  }
  _suppressDispatch = false;
  updateDataLangElements(newLocale);
  updateNavI18nElements(newLocale);
});
```

#### Schritt 5: Tailwind Dark-Mode konfigurieren

Falls Tailwind CSS verwendet wird:

```javascript
// tailwind.config.js
export default {
  darkMode: 'class',  // WICHTIG: 'class' statt 'media'
  // ...
}
```

#### Schritt 6: Testen

Siehe Teil 4 unten.

---

## Teil 4: Schnell-Diagnose fuer bestehende Tools

### Test 1: Theme-Sync
```
1. Tool oeffnen
2. In SSI-Nav auf Theme-Button klicken
3. Pruefen: Wechseln ALLE Bereiche (Nav, App, Footer, Cookie) synchron?
4. DevTools: Hat <html> sowohl data-theme="dark" ALS AUCH class="dark"?
5. Seite neu laden -> Bleibt das Theme erhalten?
```

### Test 2: i18n-Sync
```
1. Tool oeffnen (Standard: DE)
2. In SSI-Nav auf "EN" klicken
3. Pruefen: Laedt die Seite neu? (FEHLER wenn ja)
4. Pruefen: Wechselt der Footer auf Englisch? (data-lang-en)
5. Pruefen: Wechselt das Cookie-Banner auf Englisch? (data-lang-en)
6. Pruefen: Wechselt der App-Inhalt auf Englisch?
7. Seite neu laden -> Bleibt die Sprache erhalten?
```

### Test 3: CSS-Konsistenz
```
1. DevTools -> Elements -> body > nav inspizieren
2. Pruefen: Ist background transparent?
3. DevTools -> nav > ul (Dropdown) inspizieren
4. Pruefen: Hat Dropdown einen soliden Hintergrund?
5. Theme wechseln -> Pruefen: Dropdown-Hintergrund aendert sich?
6. Pruefen: Gibt es Farbbrueche zwischen Nav und App-Content?
```

### Test 4: Cookie-Banner
```
1. Cookie-Banner oeffnen (ggf. localStorage leeren)
2. Pruefen: Hat Banner einen sichtbaren Hintergrund?
3. Theme wechseln: Bleibt Banner lesbar?
4. Sprache wechseln: Aendern sich Banner-Texte?
```

---

## Teil 5: Zusammenfassung der Synchronisations-Kanaele

| Kanal                   | Richtung            | Mechanismus                         | Betroffene Elemente           |
|-------------------------|---------------------|-------------------------------------|-------------------------------|
| `data-theme` Attribut   | SSI-Nav -> Tool     | `setAttribute` auf `<html>`         | Theme (Light/Dark)            |
| `dark` CSS-Klasse       | Tool intern         | `classList.add/remove` auf `<html>` | Tailwind Dark-Mode            |
| `theme-changed` Event   | SSI-Nav -> Tool     | `CustomEvent` auf `window`          | Theme-Sync                    |
| `language-changed` Ev.  | Bidirektional       | `CustomEvent` auf `window`          | Alle i18n                     |
| `data-lang-*`           | Tool -> SSI-Footer  | `querySelectorAll` + `textContent`  | Footer, Cookie-Banner Texte   |
| `data-nav-i18n`         | Tool -> SSI-Nav     | `querySelectorAll` + Attribute      | Nav-Texte, Tooltips, aria     |
| `data-i18n`             | Tool intern         | `querySelectorAll` + `textContent`  | Statische Seiten-Texte        |
| `localStorage`          | Bidirektional       | Keys: `theme`, `locale`             | Persistenz Theme + Sprache    |
| `lang` Attribut         | Tool -> Browser     | `setAttribute` auf `<html>`         | Screenreader, SEO             |
| CSS Custom Properties   | `:root` -> alle     | Vererbung im DOM-Baum              | Farben, Abstande, Schatten    |
| CSS `body > nav/footer` | Tool -> SSI-Partials| `!important` Overrides              | Hintergrund, Farben, z-index  |

---

## Teil 6: Dateiuebersicht - Wo ist was implementiert?

### Vue SPA (`app.html`)

| Datei | Verantwortung |
|-------|---------------|
| `app.html` | SSI-Includes, Vue-Mount-Point |
| `src/stores/ui.js` | Theme/Locale State, SSI-Event-Handler, dark-Klasse Sync |
| `src/App.vue` | vue-i18n Locale-Sync mit UI-Store |
| `src/i18n/index.js` | Uebersetzungen fuer Vue-Komponenten |
| `src/style.css` | CSS-Overrides fuer SSI-Elemente |
| `tailwind.config.js` | `darkMode: 'class'` Konfiguration |

### Statische Seiten

| Datei | Verantwortung |
|-------|---------------|
| `index.html` | SSI-Includes, Inline-Uebersetzungen (`data-i18n`), Theme/Lang Event-Handler |
| `faq.html` | SSI-Includes, Inline-Uebersetzungen (`data-i18n`), Theme/Lang Event-Handler |
| `funktion.html` | SSI-Includes, Inline-Uebersetzungen (`data-i18n`), Theme/Lang Event-Handler |
