/** @type {import('tailwindcss').Config} */

/*
 * Tailwind ist die Utility-Schicht für Layout. Farben, Radien, Schatten und
 * Dauern kommen aus den Design-Tokens (src/design-system/tokens-v2.css, --ds-*),
 * die mit Collage Maker, Alarmtool und Playlist Generator geteilt werden. Die
 * Variablen wechseln mit dem Theme (html[data-theme]), deshalb braucht es keine
 * dark:-Varianten. Rollen und Regeln: src/design-system/README.md
 */
const colors = {
  transparent: 'transparent',
  current: 'currentColor',
  white: '#ffffff',
  black: '#000000',
  // Flächen: Seite, Panel, Eingabe/Chip, Hover
  surface: {
    0: 'var(--ds-surface-0)',
    1: 'var(--ds-surface-1)',
    2: 'var(--ds-surface-2)',
    3: 'var(--ds-surface-3)',
  },
  // Rahmen und Trennlinien; strong für Felder und Sekundär-Buttons
  line: {
    DEFAULT: 'var(--ds-border)',
    strong: 'var(--ds-border-strong)',
  },
  // Text in drei Stufen
  ink: {
    DEFAULT: 'var(--ds-text)',
    2: 'var(--ds-text-2)',
    3: 'var(--ds-text-3)',
  },
  // Die einzige Aktionsfarbe: Primäraktion, Fokus, aktive Zustände
  accent: {
    DEFAULT: 'var(--ds-accent)',
    hover: 'var(--ds-accent-hover)',
    soft: 'var(--ds-accent-soft)',
  },
  'on-accent': 'var(--ds-on-accent)',
  link: 'var(--ds-link)',
  success: 'var(--ds-success)',
  warning: 'var(--ds-warning)',
  danger: 'var(--ds-danger)',
  info: 'var(--ds-info)',
}

export default {
  content: ['./app.html', './src/**/*.{vue,js}'],
  theme: {
    colors,
    borderColor: {
      ...colors,
      DEFAULT: 'var(--ds-border)',
    },
    ringColor: {
      ...colors,
      DEFAULT: 'var(--ds-accent)',
    },
    // Drei Radien: 6 / 10 / 16 (plus voll gerundet)
    borderRadius: {
      none: '0',
      DEFAULT: 'var(--ds-radius-sm)',
      sm: 'var(--ds-radius-sm)',
      md: 'var(--ds-radius-md)',
      lg: 'var(--ds-radius-lg)',
      full: 'var(--ds-radius-full)',
    },
    // Schatten nur für Overlays; der Fokus-Ring ist ein box-shadow
    boxShadow: {
      none: 'none',
      overlay: 'var(--ds-shadow-overlay)',
      focus: 'var(--ds-focus-ring)',
    },
    transitionDuration: {
      DEFAULT: 'var(--ds-duration)',
      slow: 'var(--ds-duration-slow)',
    },
    transitionTimingFunction: {
      DEFAULT: 'var(--ds-ease)',
    },
    // Typografie: sieben Stufen 12 / 13 / 14 / 16 / 20 / 24 / 32 mit den
    // Token-Namen (text-md statt text-base), Zeilenhöhe hängt an der Stufe.
    fontFamily: {
      sans: 'var(--ds-font-sans)',
      mono: 'var(--ds-font-mono)',
    },
    fontSize: {
      xs: ['var(--ds-text-xs)', { lineHeight: 'var(--ds-leading)' }],
      sm: ['var(--ds-text-sm)', { lineHeight: 'var(--ds-leading)' }],
      md: ['var(--ds-text-md)', { lineHeight: 'var(--ds-leading)' }],
      lg: ['var(--ds-text-lg)', { lineHeight: 'var(--ds-leading)' }],
      xl: ['var(--ds-text-xl)', { lineHeight: 'var(--ds-leading-tight)' }],
      '2xl': ['var(--ds-text-2xl)', { lineHeight: 'var(--ds-leading-tight)' }],
      '3xl': ['var(--ds-text-3xl)', { lineHeight: 'var(--ds-leading-tight)' }],
    },
    fontWeight: {
      normal: 'var(--ds-weight-regular)',
      medium: 'var(--ds-weight-medium)',
      semibold: 'var(--ds-weight-semibold)',
      bold: 'var(--ds-weight-bold)',
    },
    lineHeight: {
      none: '1',
      tight: 'var(--ds-leading-tight)',
      normal: 'var(--ds-leading)',
    },
    letterSpacing: {
      normal: '0',
      tight: 'var(--ds-tracking-tight)',
    },
    extend: {
      zIndex: {
        topbar: 'var(--ds-z-topbar)',
        player: 'var(--ds-z-player)',
        backdrop: 'var(--ds-z-backdrop)',
        dialog: 'var(--ds-z-dialog)',
        toast: 'var(--ds-z-toast)',
      },
      // Deaktivierte Controls (opacity-disabled der Tokens)
      opacity: {
        45: '0.45',
      },
      height: {
        'control-sm': 'var(--ds-control-sm)',
        'control-md': 'var(--ds-control-md)',
        'control-lg': 'var(--ds-control-lg)',
      },
      minHeight: {
        row: 'var(--ds-row-height)',
      },
    },
  },
  plugins: [],
}
