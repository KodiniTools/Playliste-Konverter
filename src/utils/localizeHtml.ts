// Erzeugt beim Build aus der fertigen HTML-Datei eine Sprachfassung (z. B. index.en.html),
// deren Head schon ohne JavaScript stimmt: <html lang>, <title>, Description, Canonical,
// og:* und twitter:*. nginx liefert sie für ?lang=en aus, damit Crawler ohne JavaScript
// Englisch sehen. Arbeitet bewusst auf dem String (kein DOM im Node-Build) und bricht ab,
// wenn ein erwartetes Tag fehlt oder doppelt vorkommt: lieber ein roter Build als ein
// falscher Head.

export interface LocalizedHead {
  /** Wert für `<html lang>`, z. B. `en`. */
  lang: string
  title: string
  description: string
  /** Absolute kanonische URL dieser Sprachfassung. */
  canonical: string
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
}

/** Maskiert Text für HTML-Attribute und Elementinhalt. */
export function escapeHtml(value: string): string {
  return value.replace(/[&"<>]/g, (ch) => ESCAPES[ch] ?? ch)
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Setzt `attr` in genau dem Tag, das `tagPattern` trifft.
 * `required`: das Tag muss genau einmal vorkommen; sonst höchstens einmal.
 */
function setTagAttr(
  html: string,
  tagPattern: RegExp,
  attr: string,
  value: string,
  required: boolean,
  label: string,
): string {
  const matches = html.match(new RegExp(tagPattern.source, 'gi')) ?? []
  if (matches.length > 1 || (required && matches.length === 0)) {
    throw new Error(`localizeHtml: ${label} kommt ${matches.length}× vor, erwartet genau 1×`)
  }
  const tag = matches[0]
  if (tag === undefined) return html

  const attrPattern = new RegExp(`(\\s${escapeRegExp(attr)}=)"[^"]*"`, 'i')
  if (!attrPattern.test(tag)) {
    throw new Error(`localizeHtml: ${label} hat kein Attribut ${attr}="…"`)
  }
  const replaced = tag.replace(
    attrPattern,
    (_m, prefix: string) => `${prefix}"${escapeHtml(value)}"`,
  )
  return html.replace(tag, () => replaced)
}

/** `<meta name="…">` bzw. `<meta property="…">` (beide Schreibweisen kommen vor). */
const metaTag = (name: string): RegExp =>
  new RegExp(`<meta\\b[^>]*\\s(?:name|property)="${escapeRegExp(name)}"[^>]*>`)

/**
 * Liefert `html` mit dem Head für `head.lang`. Pflicht: `<html lang>`, `<title>`,
 * meta description und canonical. og:* und twitter:title/description werden angepasst,
 * wenn vorhanden. hreflang-Links und der Body bleiben unverändert.
 */
export function localizeHtml(html: string, head: LocalizedHead): string {
  // Nur bis </head> bearbeiten: <title> in einem SVG im Body darf nicht getroffen werden.
  const headEnd = html.search(/<\/head>/i)
  if (headEnd < 0) throw new Error('localizeHtml: </head> fehlt')
  const rest = html.slice(headEnd)

  let out = setTagAttr(html.slice(0, headEnd), /<html\b[^>]*>/, 'lang', head.lang, true, '<html>')

  const titles = out.match(/<title\b[^>]*>[\s\S]*?<\/title>/gi) ?? []
  const title = titles[0]
  if (titles.length !== 1 || title === undefined) {
    throw new Error(`localizeHtml: <title> kommt ${titles.length}× vor, erwartet genau 1×`)
  }
  out = out.replace(title, () => `<title>${escapeHtml(head.title)}</title>`)

  out = setTagAttr(
    out,
    metaTag('description'),
    'content',
    head.description,
    true,
    'meta description',
  )
  out = setTagAttr(
    out,
    /<link\b[^>]*\srel="canonical"[^>]*>/,
    'href',
    head.canonical,
    true,
    'link canonical',
  )

  const english = head.lang === 'en'
  const optional: Array<[string, string]> = [
    ['og:title', head.title],
    ['og:description', head.description],
    ['og:url', head.canonical],
    ['og:locale', english ? 'en_US' : 'de_DE'],
    ['og:locale:alternate', english ? 'de_DE' : 'en_US'],
    ['twitter:title', head.title],
    ['twitter:description', head.description],
    ['twitter:url', head.canonical],
  ]
  for (const [name, value] of optional) {
    out = setTagAttr(out, metaTag(name), 'content', value, false, `meta ${name}`)
  }
  return out + rest
}
