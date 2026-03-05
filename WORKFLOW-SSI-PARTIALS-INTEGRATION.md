# Workflow: SSI-Partials Integration & Synchronisation

## Referenz-Implementierung: Bildkonverter

Dieses Dokument beschreibt exakt, wie der **Bildkonverter** die SSI-Partials (`nav.html`, `footer.html`, `cookie-banner.html`) fehlerfrei integriert hat, und liefert einen reproduzierbaren Workflow zum Reparieren anderer Tools.

---

## Teil 1: Wie funktioniert es im Bildkonverter?

### 1.1 Architektur-Ueberblick

```
┌─────────────────────────────────────────────────────────┐
│  Apache Server (SSI-Verarbeitung)                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  index.html                                       │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │ <!--#include virtual="/partials/nav.html"--> │  │  │
│  │  │ <div id="app">  (Vue mountet hier)          │  │  │
│  │  │ <!--#include virtual="/partials/footer.html">│  │  │
│  │  │ <!--#include virtual="/partials/cookie-...-->│  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌──────────────────┐
│  SSI-Partials   │  │  Vue App (SPA)   │
│  (statisch,     │  │  (dynamisch,     │
│   kein eigenes  │  │   eigenes CSS    │
│   CSS/JS)       │  │   via variables  │
│                 │  │   .scss)         │
└────────┬────────┘  └────────┬─────────┘
         │                    │
         └────────┬───────────┘
                  ▼
     ┌──────────────────────┐
     │  :root CSS Custom    │
     │  Properties          │
     │  (variables.scss)    │
     │  + data-theme attr   │
     │  auf <html>          │
     └──────────────────────┘
```

### 1.2 Woher nutzen die Partials die CSS-Variablen?

**Die Partials bringen KEIN eigenes CSS mit.** Das ist der Schluessel.

Die CSS Custom Properties werden auf `:root` (= `<html>`) definiert in `src/styles/variables.scss`:

```scss
:root {
  --color-primary: #014f99;
  --color-bg: #ffffff;
  --color-text: #212529;
  --color-border: #dee2e6;
  --color-accent: #c9984d;
  // ... ~40 weitere Variablen
}

:root[data-theme="dark"] {
  --color-bg: #091428;
  --color-text: #f9f2d5;
  --color-border: #1c3a5e;
  // ... kompletter Palette-Swap
}
```

**Warum funktioniert das fuer die Partials?**

1. CSS Custom Properties sind **vererbbar** - sie gelten fuer ALLE Kinder von `:root`
2. Die Partials werden vom Apache **vor** dem Vue-Build in den HTML-Baum injiziert
3. Die Partials liegen im selben DOM-Baum wie die Vue-App
4. Wenn Vite/Vue das CSS laedt, gelten die `:root`-Variablen automatisch fuer alles

**Reihenfolge im Browser:**
```
1. Apache injiziert Partials in index.html (SSI)
2. Browser parst HTML → nav, footer, cookie-banner sind im DOM
3. Vite laedt main.js → laedt variables.scss → :root Variablen gelten
4. Vue mountet in #app
5. Alles teilt dieselben :root CSS-Variablen
```

### 1.3 Theme-Synchronisation (Dark/Light Mode)

**Mechanismus:** `data-theme` Attribut auf `<html>`

```
Nutzer klickt Theme-Button (SSI-Nav)
          │
          ▼
window.dispatchEvent('theme-changed', { detail: { theme: 'dark' } })
          │
          ▼
App.vue: handleGlobalThemeChange()
          │
          ├──► settingsStore.setTheme('dark')
          │       │
          │       ├──► document.documentElement.setAttribute('data-theme', 'dark')
          │       ├──► localStorage.setItem('theme', 'dark')
          │       └──► localStorage.setItem('bildkonverter-theme', 'dark')
          │
          └──► :root[data-theme="dark"] CSS-Regeln greifen
                    │
                    └──► ALLE Elemente (inkl. Partials) bekommen Dark-Farben
```

**Kritische Dateien:**
- `src/stores/settingsStore.js` Zeilen 81-102: `setTheme()`
- `src/App.vue` Zeilen 254-260: `handleGlobalThemeChange()`
- `src/styles/variables.scss` Zeilen 281-306: `:root[data-theme="dark"]`

### 1.4 i18n-Synchronisation mit SSI-Partials

Dies ist der komplexeste Teil. Es gibt **drei separate Mechanismen**:

#### Mechanismus A: Vue-interne i18n (vue-i18n)
Fuer alle Vue-Komponenten. Nutzt `$t('key')` mit Uebersetzungsdateien in `src/i18n/index.js`.

#### Mechanismus B: `data-nav-i18n` Attribute (Externe Navigation)
Fuer die SSI-Navigation (`nav.html`). Die Nav-Elemente tragen Attribute:

```html
<!-- In nav.html (SSI-Partial): -->
<a data-nav-i18n="nav.imageconv" href="/bildkonverter/">Bildkonverter</a>
<button data-nav-i18n-aria="nav.themeAria" data-nav-i18n-title="nav.themeTitle">
```

Die Vue-App uebersetzt diese in `App.vue` Zeilen 147-175:

```javascript
function translateExternalNav(lang) {
  const t = navTranslations[lang]  // Lokales Uebersetzungsobjekt in App.vue
  nav.querySelectorAll('[data-nav-i18n]').forEach(el => {
    const key = el.getAttribute('data-nav-i18n')
    if (t[key]) el.textContent = t[key]       // Text ersetzen
  })
  nav.querySelectorAll('[data-nav-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-nav-i18n-aria')
    if (t[key]) el.setAttribute('aria-label', t[key])  // ARIA ersetzen
  })
  nav.querySelectorAll('[data-nav-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-nav-i18n-title')
    if (t[key]) el.setAttribute('title', t[key])       // Title ersetzen
  })
}
```

#### Mechanismus C: `data-lang-*` Attribute (Footer, Cookie-Banner)
Fuer die anderen SSI-Partials. Elemente tragen beide Sprachen als Attribute:

```html
<!-- In footer.html / cookie-banner.html: -->
<span data-lang-de="Impressum" data-lang-en="Imprint">Impressum</span>
```

Die Vue-App aktualisiert diese in `App.vue` Zeilen 121-140:

```javascript
function dispatchLanguageChanged(lang) {
  window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang } }))

  const attr = `data-lang-${lang}`
  document.querySelectorAll(`[${attr}]`).forEach(el => {
    const text = el.getAttribute(attr)
    if (text) el.textContent = text
  })
}
```

#### Komplett-Ablauf bei Sprachwechsel:

```
Nutzer klickt "EN" in SSI-Nav
          │
          ▼
App.vue: interceptExternalLangSwitcher() (Zeile 269)
  ├──► e.preventDefault()           // Kein SSI-Reload!
  ├──► e.stopImmediatePropagation() // Nav-eigener Handler blockiert
  └──► settings.setLocale('en')
          │
          ▼
settingsStore.setLocale('en') (Zeile 115)
  ├──► i18n.global.locale.value = 'en'     // Vue-i18n umschalten
  ├──► document.documentElement.lang = 'en' // HTML-Attribut
  ├──► localStorage.setItem('locale', 'en') // Persistieren (globaler Key)
  └──► localStorage.setItem('bildkonverter-locale', 'en') // Compat-Key
          │
          ▼
App.vue: watch(settings.locale) (Zeile 212)
  ├──► syncExternalLangButtons('en')   // Active-State der Sprach-Buttons
  ├──► translateExternalNav('en')      // data-nav-i18n Texte ersetzen
  └──► dispatchLanguageChanged('en')   // data-lang-* Texte + Event
          │
          ▼
Ergebnis:
  ✓ Vue-Komponenten:  $t() liefert englische Texte (reaktiv)
  ✓ SSI-Navigation:   data-nav-i18n Texte auf Englisch
  ✓ SSI-Footer:       data-lang-en Texte sichtbar
  ✓ SSI-Cookie-Banner: data-lang-en Texte sichtbar
  ✓ Kein Page-Reload!
```

### 1.5 Externe Navigation: Hoehenanpassung

Die Vue-App misst die Hoehe der SSI-Navigation dynamisch:

```javascript
function updateExternalNavHeight() {
  const externalNav = document.querySelector('.external-nav-wrapper')
  const height = navElement.getBoundingClientRect().height
  document.documentElement.style.setProperty('--external-nav-height', `${height}px`)

  // ResizeObserver fuer dynamische Aenderungen
  externalNavObserver = new ResizeObserver(entries => {
    document.documentElement.style.setProperty('--external-nav-height', `${newHeight}px`)
  })
}
```

Der AppHeader nutzt diese Variable fuer sticky Positioning:
```css
position: sticky;
top: var(--external-nav-height, 50px);
```

### 1.6 MutationObserver: Dynamisch geladene Partials

Falls Partials verzoegert laden, erkennt ein MutationObserver neue DOM-Elemente:

```javascript
domMutationObserver = new MutationObserver((mutations) => {
  // Nur auf neue ELEMENT_NODEs reagieren (nicht Text-Aenderungen)
  const hasRelevantChanges = mutations.some(m => ...)

  // Observer pausieren (verhindert Endlosschleife!)
  domMutationObserver.disconnect()

  updateExternalNavHeight()        // Nav-Hoehe neu messen
  interceptExternalLangSwitcher()  // Lang-Buttons abfangen
  translateExternalNav(locale)     // Nav-Texte uebersetzen
  dispatchLanguageChanged(locale)  // Andere Partials uebersetzen

  // Observer wieder aktivieren nach DOM-Settle
  requestAnimationFrame(() => domMutationObserver.observe(...))
})
```

**WICHTIG:** Ohne das Pausieren des Observers entsteht eine Endlosschleife, weil `translateExternalNav()` selbst DOM-Mutationen ausloest.

### 1.7 localStorage-Key-Konvention

Dual-Key-System fuer Kompatibilitaet zwischen SSI-Partials und Vue-App:

| Zweck    | Globaler Key (Partials lesen) | App-spezifischer Key (Legacy) |
|----------|-------------------------------|-------------------------------|
| Theme    | `theme`                       | `bildkonverter-theme`         |
| Sprache  | `locale`                      | `bildkonverter-locale`        |

**Lesereihenfolge:** Globaler Key > App-spezifischer Key > Fallback

```javascript
const theme = ref(
  localStorage.getItem('theme') || localStorage.getItem('bildkonverter-theme') || 'light'
)
```

---

## Teil 2: Haeufige Missstaende in anderen Tools

### Problem 1: Eigene CSS-Variablen in Partials / Konflikte
**Symptom:** Partials ueberschreiben `:root`-Variablen oder definieren eigene.
**Loesung:** Partials duerfen KEINE eigenen `:root`-Variablen mitbringen. Sie muessen die vom Tool definierten Variablen nutzen.

### Problem 2: Theme wechselt nicht synchron
**Symptom:** Tool wechselt auf Dark, aber Nav/Footer bleiben hell (oder umgekehrt).
**Ursache:** `data-theme` wird nicht auf `<html>` gesetzt, oder Partials nutzen keine `var(--color-*)`.
**Loesung:** Theme muss per `document.documentElement.setAttribute('data-theme', theme)` gesetzt werden.

### Problem 3: Sprachwechsel laedt die Seite neu
**Symptom:** Klick auf Sprach-Button in der Nav laedt die komplette Seite neu.
**Ursache:** Das Default-Verhalten der SSI-Nav Sprach-Buttons wird nicht abgefangen.
**Loesung:** `e.preventDefault()` + `e.stopImmediatePropagation()` im capture-Phase Handler.

### Problem 4: i18n-Texte in Partials aendern sich nicht
**Symptom:** Vue-App wechselt Sprache, aber Nav/Footer zeigen alte Sprache.
**Ursache:** Kein `translateExternalNav()` / `dispatchLanguageChanged()` implementiert.
**Loesung:** Beide Funktionen im App-Root-Component implementieren.

### Problem 5: Hintergrund-Gradient und Partials passen nicht zusammen
**Symptom:** Farbbrueche zwischen App-Hintergrund und Partials.
**Ursache:** Partials haben eigene `background`-Definitionen statt CSS-Variablen.
**Loesung:** Alle Hintergruende muessen `var(--color-bg)` o.ae. nutzen.

### Problem 6: Doppelte localStorage-Keys
**Symptom:** Theme/Sprache springt beim Reload zurueck.
**Ursache:** Tool schreibt nur seinen eigenen Key, liest aber den globalen nicht.
**Loesung:** Dual-Key-System wie oben beschrieben.

---

## Teil 3: Reparatur-Workflow fuer andere Tools

### Checkliste: SSI-Partials korrekt integrieren

Fuehre diese Schritte in exakt dieser Reihenfolge durch:

#### Schritt 1: CSS-Variablen pruefen

- [ ] `:root` Block mit allen notwendigen Custom Properties vorhanden
- [ ] `:root[data-theme="dark"]` Block mit Dark-Mode-Override vorhanden
- [ ] Partials nutzen KEINE eigenen `:root`-Variablen
- [ ] Alle Farben in Partials nutzen `var(--color-*)` Syntax
- [ ] Background des Tools nutzt CSS-Variablen: `var(--color-bg)`, `var(--color-bg-gradient)`

**Minimale CSS-Variablen die vorhanden sein muessen:**
```scss
:root {
  --color-primary: #014f99;
  --color-bg: #ffffff;
  --color-bg-secondary: #f9f2d5;
  --color-bg-gradient: #F5F4D6;
  --color-text: #212529;
  --color-text-light: #6c757d;
  --color-text-muted: #adb5bd;
  --color-border: #dee2e6;
  --color-accent: #c9984d;
  --color-accent-light: #f8e1a9;
  --color-white: #ffffff;
  --color-success: #50e3c2;
  --color-warning: #f8e71c;
  --color-error: #f44336;
  --color-info: #2196f3;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --transition-base: 0.2s ease;
  --external-nav-height: 50px;
}

:root[data-theme="dark"] {
  --color-bg: #091428;
  --color-bg-secondary: #0E1C32;
  --color-bg-gradient: #091428;
  --color-text: #f9f2d5;
  --color-text-light: #f8e1a9;
  --color-text-muted: #7A8DA0;
  --color-border: #1c3a5e;
  --color-white: #142640;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.3);
}
```

#### Schritt 2: index.html pruefen

- [ ] SSI-Includes an richtiger Stelle:
  ```html
  <body>
    <div class="external-nav-wrapper">
      <!--#include virtual="/partials/nav.html" -->
    </div>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
    <!--#include virtual="/partials/footer.html" -->
    <!--#include virtual="/partials/cookie-banner.html" -->
  </body>
  ```
- [ ] Nav in `.external-nav-wrapper` eingebettet
- [ ] `<html lang="de">` vorhanden

#### Schritt 3: Theme-Synchronisation implementieren

Im Settings-Store / State-Management:

```javascript
// Beim Setzen des Themes:
function setTheme(newTheme) {
  // 1. DOM aktualisieren
  document.documentElement.setAttribute('data-theme', newTheme)

  // 2. Dual-Key localStorage
  localStorage.setItem('theme', newTheme)
  localStorage.setItem('<toolname>-theme', newTheme)
}

// Beim Lesen (Initialisierung):
const theme = localStorage.getItem('theme')
  || localStorage.getItem('<toolname>-theme')
  || 'light'
```

Im Root-Component:

```javascript
// Auf Theme-Events der SSI-Nav reagieren
window.addEventListener('theme-changed', (e) => {
  const newTheme = e.detail?.theme
  if (newTheme) setTheme(newTheme)
})
```

#### Schritt 4: i18n-Synchronisation implementieren

**A) Sprach-Button Interception (PFLICHT):**

```javascript
function interceptExternalLangSwitcher() {
  document.querySelectorAll('.global-nav-lang-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      const targetLang = btn.getAttribute('data-lang')
      if (targetLang) setLocale(targetLang)
    }, { capture: true })
  })
}
```

**B) Nav-Uebersetzungen (PFLICHT):**

```javascript
// Uebersetzungsobjekt fuer Nav-Elemente (an eigenes Tool anpassen!)
const navTranslations = {
  de: { 'nav.imageconv': 'Bildkonverter', /* ... */ },
  en: { 'nav.imageconv': 'Image Converter', /* ... */ }
}

function translateExternalNav(lang) {
  const t = navTranslations[lang]
  document.querySelectorAll('[data-nav-i18n]').forEach(el => {
    const key = el.getAttribute('data-nav-i18n')
    if (t[key]) el.textContent = t[key]
  })
  document.querySelectorAll('[data-nav-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-nav-i18n-aria')
    if (t[key]) el.setAttribute('aria-label', t[key])
  })
  document.querySelectorAll('[data-nav-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-nav-i18n-title')
    if (t[key]) el.setAttribute('title', t[key])
  })
}
```

**C) Footer/Cookie-Banner Uebersetzungen (PFLICHT):**

```javascript
function dispatchLanguageChanged(lang) {
  window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang } }))

  const attr = `data-lang-${lang}`
  document.querySelectorAll(`[${attr}]`).forEach(el => {
    const text = el.getAttribute(attr)
    if (text) el.textContent = text
  })
}
```

**D) localStorage Dual-Key (PFLICHT):**

```javascript
// Schreiben:
localStorage.setItem('locale', newLocale)
localStorage.setItem('<toolname>-locale', newLocale)

// Lesen:
const locale = localStorage.getItem('locale')
  || localStorage.getItem('<toolname>-locale')
  || 'de'
```

#### Schritt 5: Externe Nav-Hoehe messen

```javascript
function updateExternalNavHeight() {
  const wrapper = document.querySelector('.external-nav-wrapper')
  if (!wrapper) return

  const navEl = wrapper.querySelector('nav, header') || wrapper
  const height = navEl.getBoundingClientRect().height
  document.documentElement.style.setProperty('--external-nav-height', `${height}px`)

  // ResizeObserver fuer dynamische Aenderungen
  new ResizeObserver(entries => {
    const h = entries[0].contentRect.height
    document.documentElement.style.setProperty('--external-nav-height', `${h}px`)
  }).observe(navEl)
}
```

#### Schritt 6: MutationObserver fuer dynamisches Laden

```javascript
const domObserver = new MutationObserver((mutations) => {
  const hasNewElements = mutations.some(m =>
    m.type === 'childList' && m.addedNodes.length > 0 &&
    Array.from(m.addedNodes).some(n => n.nodeType === Node.ELEMENT_NODE)
  )
  if (!hasNewElements) return

  // WICHTIG: Observer pausieren um Endlosschleife zu verhindern!
  domObserver.disconnect()

  updateExternalNavHeight()
  interceptExternalLangSwitcher()
  translateExternalNav(currentLocale)
  dispatchLanguageChanged(currentLocale)

  requestAnimationFrame(() => {
    domObserver.observe(document.body, { childList: true, subtree: true })
  })
})
domObserver.observe(document.body, { childList: true, subtree: true })
```

#### Schritt 7: Watcher / Reaktive Bindungen

Bei jeder Sprachaenderung muessen ALLE Synchronisations-Funktionen aufgerufen werden:

```javascript
// Vue-Beispiel:
watch(locale, (newLocale) => {
  i18n.global.locale.value = newLocale
  document.documentElement.setAttribute('lang', newLocale)
  syncExternalLangButtons(newLocale)
  translateExternalNav(newLocale)
  dispatchLanguageChanged(newLocale)
}, { immediate: true })

// Vanilla JS / anderes Framework:
function onLocaleChange(newLocale) {
  document.documentElement.setAttribute('lang', newLocale)
  syncExternalLangButtons(newLocale)
  translateExternalNav(newLocale)
  dispatchLanguageChanged(newLocale)
}
```

#### Schritt 8: Cleanup nicht vergessen

```javascript
// Bei Component/App Destroy:
resizeObserver?.disconnect()
mutationObserver?.disconnect()
window.removeEventListener('theme-changed', handler)
abortController.abort()  // Entfernt alle Lang-Button-Listener
```

---

## Teil 4: Schnell-Diagnose fuer bestehende Tools

### Test 1: Theme-Sync
```
1. Tool oeffnen
2. In SSI-Nav auf Theme-Button klicken
3. Pruefen: Wechseln ALLE Bereiche (Nav, App, Footer, Cookie) synchron?
4. Seite neu laden → Bleibt das Theme erhalten?
```

### Test 2: i18n-Sync
```
1. Tool oeffnen (Standard: DE)
2. In SSI-Nav auf "EN" klicken
3. Pruefen: Laedt die Seite neu? (FEHLER wenn ja)
4. Pruefen: Wechselt die Nav auf Englisch?
5. Pruefen: Wechselt der Footer auf Englisch?
6. Pruefen: Wechselt das Cookie-Banner auf Englisch?
7. Pruefen: Wechselt der App-Inhalt auf Englisch?
8. Seite neu laden → Bleibt die Sprache erhalten?
```

### Test 3: CSS-Variablen
```
1. DevTools oeffnen → Elements → <html>
2. Pruefen: Existiert data-theme="light" / "dark"?
3. Computed Styles von :root pruefen:
   - --color-bg vorhanden?
   - --color-text vorhanden?
   - --external-nav-height vorhanden?
4. Theme wechseln → Aendern sich die Variablen-Werte?
```

### Test 4: Hintergrund-Sync
```
1. DevTools → Body/App-Container inspizieren
2. Pruefen: Nutzt background var(--color-bg) oder hartcodierte Farbe?
3. Theme wechseln → Ist der Uebergang smooth (transition)?
4. Gibt es Farbbrueche zwischen Nav und App-Content?
```

---

## Teil 5: Zusammenfassung der Synchronisations-Kanaele

| Kanal                  | Richtung              | Mechanismus                      | Betroffene Elemente          |
|------------------------|-----------------------|----------------------------------|------------------------------|
| CSS Custom Properties  | Tool → Partials       | `:root` Vererbung                | Alle Farben, Spacing, etc.   |
| `data-theme` Attribut  | Bidirektional         | `setAttribute` auf `<html>`      | Theme (Light/Dark)           |
| `theme-changed` Event  | SSI-Nav → Tool        | `CustomEvent` auf `window`       | Theme-Sync                   |
| `language-changed` Ev. | Tool → SSI-Partials   | `CustomEvent` auf `window`       | Footer, Cookie-Banner        |
| `data-nav-i18n`        | Tool → SSI-Nav        | `querySelectorAll` + `textContent`| Nav-Texte                   |
| `data-lang-*`          | Tool → SSI-Partials   | `querySelectorAll` + `textContent`| Footer, Cookie-Banner Texte  |
| `localStorage`         | Bidirektional         | Dual-Key-System                  | Persistenz Theme + Sprache   |
| `lang` Attribut        | Tool → Browser        | `setAttribute` auf `<html>`      | Screenreader, SEO            |
| `--external-nav-height`| SSI-Nav → Tool        | `ResizeObserver` + CSS-Variable  | Sticky Header Positioning    |
| `MutationObserver`     | DOM → Tool            | Erkennung neuer Elemente         | Verzoegert geladene Partials |
