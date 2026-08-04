import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        glass: {
          bg: 'rgba(10, 10, 15, 0.7)',
          border: 'rgba(255, 255, 255, 0.08)'
        }
      },
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: []
}

export default config