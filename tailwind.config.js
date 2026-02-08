export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom color palette
        'accent': {
          DEFAULT: '#c9984d',
          dark: '#b0832f',
          light: '#f8e1a9'
        },
        'secondary': {
          DEFAULT: '#014f99',
          dark: '#003971',
          light: '#2a6db5'
        },
        'muted': {
          DEFAULT: '#5a6171',
          dark: '#3d4555',
          light: '#7a8294'
        },
        'neutral': {
          DEFAULT: '#c0c2c9',
          dark: '#9a9da5',
          light: '#f9f2d5'
        },
        'dark': {
          DEFAULT: '#091428',
          lighter: '#0E1C32',
          card: '#142640'
        }
      }
    }
  },
  plugins: []
}
