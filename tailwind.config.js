export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom color palette
        'accent': {
          DEFAULT: '#F2E28E',
          dark: '#D4C46E',
          light: '#F7EDB5'
        },
        'secondary': {
          DEFAULT: '#A28680',
          dark: '#8A716B',
          light: '#BFA29C'
        },
        'muted': {
          DEFAULT: '#5E5F69',
          dark: '#4A4B54',
          light: '#75767F'
        },
        'neutral': {
          DEFAULT: '#AEAFB7',
          dark: '#9A9BA3',
          light: '#C4C5CB'
        },
        'dark': {
          DEFAULT: '#0C0C10',
          lighter: '#18181F',
          card: '#1E1E26'
        }
      }
    }
  },
  plugins: []
}
