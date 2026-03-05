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
      |  - locale-changed Ev.  |
      |  - data-theme auf      |
      |    <html> (direkt)     |
      |  - localStorage        |
      |  - dark CSS-Klasse     |
      |  - MutationObserver    |
      +------------------------+
```

### 1.2 Zwei Arten von Seiten

Der Playliste-Konverter hat **zwei verschiedene Seitentypen**, die SSI-Partials unterschiedlich integrieren:

| Seitentyp | Dateien | SSI-Sync-Mechanismus |
|-----------|---------|----------------------|
| **Vue SPA** | `app.html` | Pinia Store (`ui.js`) + vue-i18n |
| **Statische Seiten** | `index.html`, `faq.html`, `funktion.html` | Inline `<script>` mit Vanilla JS |

### 1.3 Wie die SSI-Partials CSS erhalten

**WICHTIG: Die SSI-Navigation (`.global-nav`) hat ihr eigenes CSS mit CSS-Variablen, backdrop-filter und Dark-Mode-Regeln. Diese duerfen NICHT ueberschrieben werden!**

Die Navigation (`nav.html`) bringt eigene Styles mit:
```css
/* nav.html eigene Styles (NICHT ueberschreiben!) */
.global-nav {
  --nav-bg: rgba(255, 255, 255, 0.85);
  --dropdown-bg: #ffffff;
  /* ... weitere CSS-Variablen ... */
  background: var(--nav-bg);
  backdrop-filter: blur(12px);
}
[data-theme="dark"] .global-nav {
  background: rgba(26, 32, 44, 0.9) !important;
}
```

**Fuer Footer und Header** hingegen setzen wir `background: transparent`, damit sie den App-Hintergrund erben:

```css
/* Nur Footer/Header — NICHT die Nav! */
body > header, body > header *,
body > footer, body > footer * {
  background: transparent !important;
}
```

**Cookie-Banner Ausnahme:**

Der Cookie-Banner (`body > div` mit `position: fixed`) wird bewusst NICHT mit `background: transparent` ueberschrieben, da er seinen eigenen Hintergrund benoetigt um ueber dem Content lesbar zu bleiben.

### 1.4 Theme-Synchronisation (Dark/Light Mode)

Der Playliste-Konverter nutzt **zwei parallele Dark-Mode-Systeme**:

1. **`data-theme` Attribut auf `<html>`** - von der SSI-Navigation (`nav.html`) direkt gesetzt
2. **Tailwind `dark` Klasse auf `<html>`** - von der Vue-App fuer Tailwind CSS benoetigt

**WICHTIG: nav.html dispatcht KEIN `theme-changed` Event!** Die Nav setzt `data-theme` direkt via `document.documentElement.setAttribute('data-theme', theme)`. Um Theme-Aenderungen zu erkennen, verwenden wir einen **MutationObserver**:

```
SSI-Nav ruft applyTheme() auf:
  document.documentElement.setAttribute('data-theme', 'dark')
          |
          v (MutationObserver erkennt Aenderung)
ui.js / Inline-Script:
  MutationObserver auf 'data-theme' Attribut
          |
          +---> theme.value = 'dark'
          |
          v
  syncDarkClass()
          |
          +---> document.documentElement.classList.add('dark')
          |
          v
Ergebnis:
  - <html data-theme="dark" class="dark">
  - Tailwind dark: Klassen greifen (Vue-App)
  - [data-theme="dark"] CSS-Regeln greifen (eigene Styles)
  - .global-nav hat eigenes Dark-Mode CSS
```

**Implementierung (Vue SPA):**
```javascript
// src/stores/ui.js
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.attributeName === 'data-theme') {
      const newTheme = document.documentElement.getAttribute('data-theme') || 'light'
      if (newTheme !== theme.value) {
        theme.value = newTheme
      }
    }
  }
})
observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
})
```

**Implementierung (Statische Seiten):**
```javascript
var themeObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.attributeName === 'data-theme') {
      syncDarkClass();
    }
  });
});
themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});
```

### 1.5 i18n-Synchronisation

**WICHTIG: Die SSI-Navigation uebersetzt sich SELBST** via ihre eigene `applyTranslations(lang)` Funktion mit `data-i18n` Attributen und internem `NAV_TRANSLATIONS` Objekt. Die Seiten muessen die Nav-Texte NICHT aktualisieren!

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

**Warum zwei Mechanismen (nicht drei)?**

| Mechanismus | Zustaendigkeit | Elemente |
|-------------|---------------|----------|
| `data-lang-*` | Footer, Cookie-Banner | Einfache Texte mit beiden Sprachen als Attribute |
| vue-i18n `$t()` | Vue-Komponenten | Alles innerhalb von `<div id="app">` |

Die SSI-Navigation braucht KEINEN eigenen Mechanismus — sie uebersetzt sich selbst.

**Ablauf bei Sprachwechsel (Vue SPA):**

```
SSI-Nav dispatcht 'locale-changed' Event mit { detail: { locale: 'en' } }
          |
          v
ui.js: onLocaleChanged(event)
  +---> _suppressDispatch = true   // Verhindert Echo-Event
  +---> locale.value = event.detail.locale
          |
          v
ui.js: watch(locale)
  +---> document.documentElement.setAttribute('lang', newLocale)
  +---> updateDataLangElements(newLocale)   // Footer/Cookie-Banner
  +---> (kein locale-changed Event wegen _suppressDispatch)
          |
          v
App.vue: watch(uiStore.locale)
  +---> i18n locale.value = newLang       // Vue-Komponenten uebersetzen
          |
          v
Ergebnis:
  - Vue-Komponenten: $t() liefert neue Sprache (reaktiv)
  - SSI-Navigation: uebersetzt sich selbst (applyTranslations)
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
    updateDataLangElements(lang);  // Footer/Cookie-Banner
  }

  // nav.html dispatcht 'locale-changed' (NICHT 'language-changed'!)
  window.addEventListener('locale-changed', (e) => {
    const newLang = e.detail?.locale;
    if (newLang && translations[newLang]) updateLanguage(newLang);
  });
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

### 1.7 CSS-Styling der SSI-Elemente

**WICHTIGE REGEL: Die Navigation (.global-nav) darf NICHT mit CSS ueberschrieben werden!**

Die Navigation hat ihr eigenes, sorgfaeltig designtes CSS mit:
- CSS-Variablen (`--nav-bg`, `--dropdown-bg`, etc.)
- `backdrop-filter: blur(12px)`
- Eigene Dark-Mode Regeln via `[data-theme="dark"] .global-nav`
- Eigene Dropdown-Hintergruende und Hover-Effekte

Nur Footer und Header brauchen CSS-Overrides:

| Regel | Zweck |
|-------|-------|
| `body > header/footer { background: transparent }` | Partials erben App-Hintergrund |
| `[data-theme="dark"] body > header/footer * { color: #f9f2d5 }` | Dark-Mode Textfarbe |
| `[data-theme="dark"] body > header/footer a { color: #c9984d }` | Dark-Mode Link-Farbe (Accent) |
| `body > header/footer { position: relative; z-index: 100 }` | Ueber App-Content |

---

## Teil 2: Haeufige Missstaende in anderen Tools

### Problem 1: Zweifarbiger Navigations-Hintergrund
**Symptom:** Nav hat zwei verschiedene Hintergrundfarben, sieht gebrochen aus.
**Ursache:** CSS-Regeln wie `body > nav * { background: transparent !important }` zerstoeren die eigenen CSS-Variablen und Styles der Navigation.
**Loesung:** KEINE CSS-Overrides fuer `body > nav` setzen! Die `.global-nav` handhabt ihr eigenes Styling. Nur `body > header` und `body > footer` transparent machen.

### Problem 2: Theme wechselt nicht synchron
**Symptom:** Tool wechselt auf Dark, aber Footer bleibt hell (oder umgekehrt).
**Ursache:** `dark` CSS-Klasse und `data-theme` Attribut werden nicht synchron gehalten. Falsches Event (`theme-changed` existiert nicht).
**Loesung:** MutationObserver auf `data-theme` Attribut verwenden:
```javascript
var observer = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.attributeName === 'data-theme') syncDarkClass();
  });
});
observer.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});
```

### Problem 3: Sprachwechsel funktioniert nicht
**Symptom:** Klick auf Sprache in der Nav aendert nur die Nav, nicht den Seiteninhalt.
**Ursache:** Falscher Event-Name (`language-changed` statt `locale-changed`) oder falsche Property (`e.detail.lang` statt `e.detail.locale`).
**Loesung:** Event korrekt abhoeren:
```javascript
// RICHTIG:
window.addEventListener('locale-changed', function(e) {
  var newLang = e.detail && e.detail.locale;
  // ...
});

// FALSCH (veraltet):
// window.addEventListener('language-changed', ...)
// e.detail.lang  <-- falsche Property
```

### Problem 4: i18n-Texte in Footer/Cookie-Banner aendern sich nicht
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
**Ursache:** Tool empfaengt `locale-changed` Event, aendert Locale, dispatcht erneut `locale-changed`.
**Loesung:** Flag-basierte Unterdrueckung wie in `ui.js`:
```javascript
let _suppressDispatch = false

// Beim Empfang des externen Events:
function onLocaleChanged(event) {
  _suppressDispatch = true
  locale.value = event.detail.locale
}

// Beim Watch:
watch(locale, (newLocale) => {
  if (!_suppressDispatch) {
    window.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale: newLocale } }))
  }
  _suppressDispatch = false
})
```

### Problem 6: Toter Code: updateNavI18nElements()
**Symptom:** Funktion `updateNavI18nElements()` existiert, tut aber nichts.
**Ursache:** Die Nav hat KEINE `data-nav-i18n` Attribute. Sie uebersetzt sich selbst via `applyTranslations()` mit `data-i18n` und `NAV_TRANSLATIONS`.
**Loesung:** `updateNavI18nElements()` komplett entfernen. Die Nav braucht keine Hilfe.

### Problem 7: Cookie-Banner wird unsichtbar
**Symptom:** Cookie-Banner verschwindet oder hat keinen Hintergrund.
**Ursache:** Die `transparent !important` Regeln treffen auch den Cookie-Banner.
**Loesung:** Cookie-Banner NICHT in die transparent-Regeln einbeziehen. Nur `body > header`, `body > footer` targeten - nicht `body > div` oder `body > nav`.

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

**WICHTIG: KEINE CSS-Overrides fuer `body > nav`!** Die `.global-nav` hat eigenes CSS.

Minimale CSS-Regeln die in der Haupt-Stylesheet-Datei vorhanden sein muessen:

```css
/* 1. Body Dark-Mode Hintergrund */
html.dark body,
[data-theme="dark"] body {
  background-color: #091428 !important;
}

/* 2. Footer/Header: transparenter Hintergrund (NICHT Nav, NICHT Cookie-Banner!) */
body > header, body > header *,
body > footer, body > footer * {
  background: transparent !important;
}

/* 3. Dark-Mode: helle Textfarbe fuer Footer/Header */
html.dark body > header *, html.dark body > footer *,
[data-theme="dark"] body > header *, [data-theme="dark"] body > footer * {
  color: #f9f2d5 !important;
  background: transparent !important;
}

/* 4. Dark-Mode: Accent-Farbe fuer Links */
html.dark body > header a, html.dark body > footer a,
[data-theme="dark"] body > header a, [data-theme="dark"] body > footer a {
  color: #c9984d !important;
}

/* 5. Footer/Header: z-index */
body > header, body > footer {
  position: relative;
  z-index: 100 !important;
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

  // nav.html setzt data-theme direkt, dispatcht KEIN Event.
  // MutationObserver erkennt Aenderungen:
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-theme') {
        const newTheme = document.documentElement.getAttribute('data-theme') || 'light'
        if (newTheme !== theme.value) theme.value = newTheme
      }
    }
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })

  return { theme, locale }
})
```

**Fuer statische Seiten (Vanilla JS):**

```javascript
function syncDarkClass() {
  var theme = document.documentElement.getAttribute('data-theme')
    || localStorage.getItem('theme') || 'light';
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// nav.html setzt data-theme direkt, KEIN Event — MutationObserver:
var themeObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.attributeName === 'data-theme') syncDarkClass();
  });
});
themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});

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

**B) SSI-Navigation braucht NICHTS — sie uebersetzt sich selbst!**

Die Nav hat eine eigene `applyTranslations(lang)` Funktion mit `NAV_TRANSLATIONS` Objekt und `data-i18n` / `data-i18n-aria` Attributen.

**C) Eigene Seiten-Inhalte - `data-i18n` Pattern (fuer statische Seiten):**

```javascript
const translations = { de: { ... }, en: { ... } };

function updateLanguage(lang) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang]?.[key]) el.textContent = translations[lang][key];
  });
  updateDataLangElements(lang);  // Footer/Cookie-Banner
}
```

**D) Locale-Event Handler mit Echo-Unterdrueckung (PFLICHT):**

```javascript
let _suppressDispatch = false;

// Externes Event empfangen (SSI-Nav -> Tool)
// WICHTIG: Event heisst 'locale-changed', Property ist 'locale'
window.addEventListener('locale-changed', (e) => {
  const newLang = e.detail?.locale;
  if (newLang && newLang !== locale.value) {
    _suppressDispatch = true;
    locale.value = newLang;
  }
});

// Bei Locale-Aenderung (Tool -> SSI-Nav)
watch(locale, (newLocale) => {
  document.documentElement.setAttribute('lang', newLocale);
  if (!_suppressDispatch) {
    window.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale: newLocale } }));
  }
  _suppressDispatch = false;
  updateDataLangElements(newLocale);  // Footer/Cookie-Banner
  // Navigation braucht KEIN Update — sie uebersetzt sich selbst
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
1. DevTools -> Elements -> .global-nav inspizieren
2. Pruefen: Hat die Nav ihren EIGENEN Hintergrund (NICHT transparent)?
3. Pruefen: backdrop-filter ist aktiv?
4. Theme wechseln -> Nav-Hintergrund wechselt korrekt?
5. Pruefen: Gibt es KEINE Farbbrueche in der Navigation?
6. DevTools -> body > footer inspizieren
7. Pruefen: Ist Footer-background transparent?
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
| `data-theme` Attribut   | SSI-Nav -> Tool     | `setAttribute` auf `<html>` (direkt, KEIN Event) | Theme (Light/Dark) |
| `dark` CSS-Klasse       | Tool intern         | `classList.add/remove` auf `<html>` | Tailwind Dark-Mode            |
| MutationObserver         | SSI-Nav -> Tool     | Beobachtet `data-theme` Aenderung   | Theme-Sync                    |
| `locale-changed` Event  | Bidirektional       | `CustomEvent` auf `window` mit `{ detail: { locale } }` | Alle i18n |
| `data-lang-*`           | Tool -> SSI-Footer  | `querySelectorAll` + `textContent`  | Footer, Cookie-Banner Texte   |
| Nav-eigene `data-i18n`  | Nav-intern          | `applyTranslations()` + `NAV_TRANSLATIONS` | Nav-Texte, Tooltips, aria |
| Seiten `data-i18n`      | Tool intern         | `querySelectorAll` + `textContent`  | Statische Seiten-Texte        |
| `localStorage`          | Bidirektional       | Keys: `theme`, `locale`             | Persistenz Theme + Sprache    |
| `lang` Attribut         | Tool -> Browser     | `setAttribute` auf `<html>`         | Screenreader, SEO             |
| CSS Custom Properties   | `:root` -> alle     | Vererbung im DOM-Baum              | Farben, Abstande, Schatten    |

---

## Teil 6: Dateiuebersicht - Wo ist was implementiert?

### Vue SPA (`app.html`)

| Datei | Verantwortung |
|-------|---------------|
| `app.html` | SSI-Includes, Vue-Mount-Point |
| `src/stores/ui.js` | Theme/Locale State, MutationObserver fuer Theme, locale-changed Handler, dark-Klasse Sync |
| `src/App.vue` | vue-i18n Locale-Sync mit UI-Store |
| `src/i18n/index.js` | Uebersetzungen fuer Vue-Komponenten |
| `src/style.css` | CSS-Overrides fuer Footer/Header (NICHT Nav!) |
| `tailwind.config.js` | `darkMode: 'class'` Konfiguration |

### Statische Seiten

| Datei | Verantwortung |
|-------|---------------|
| `index.html` | SSI-Includes, Inline-Uebersetzungen (`data-i18n`), MutationObserver + locale-changed Handler |
| `faq.html` | SSI-Includes, Inline-Uebersetzungen (`data-i18n`), MutationObserver + locale-changed Handler |
| `funktion.html` | SSI-Includes, Inline-Uebersetzungen (`data-i18n`), MutationObserver + locale-changed Handler |
