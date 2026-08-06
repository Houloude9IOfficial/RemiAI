import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#010102',
        surface: {
          1: '#0f1011',
          2: '#141516',
          3: '#18191a',
          4: '#191a1b',
        },
        hairline: '#23252a',
        'hairline-strong': '#34343a',
        ink: '#f7f8f8',
        'ink-muted': '#d0d6e0',
        'ink-subtle': '#8a8f98',
        'ink-tertiary': '#62666d',
        'ink-inverse': '#0b0c0d',
        copper: {
          DEFAULT: '#e0551a',
          hover: '#eb763c',
          focus: '#c94214',
          400: '#eb763c',
          500: '#e0551a',
        },
        'brand-copper': '#e0551a',
        steel: {
          DEFAULT: '#637385',
          400: '#8a96a6',
          500: '#637385',
        },
        platinum: {
          DEFAULT: '#707a8e',
          400: '#98a2b5',
          500: '#707a8e',
        },
        success: {
          DEFAULT: '#27a644',
          400: '#3ec25a',
          500: '#27a644',
        },
        warning: {
          DEFAULT: '#d29922',
          400: '#e0b24e',
          500: '#d29922',
        },
        danger: {
          DEFAULT: '#f85149',
          400: '#fb6f68',
          500: '#f85149',
        },
      },
      fontFamily: {
        display: ['var(--font-inter, Inter)', 'Inter', 'system-ui', 'sans-serif'],
        text: ['var(--font-inter, Inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono, JetBrains Mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': ['5rem', { lineHeight: '1.05', fontWeight: '600', letterSpacing: '-0.03em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.1', fontWeight: '600', letterSpacing: '-0.018em' }],
        'display-md': ['2.5rem', { lineHeight: '1.15', fontWeight: '600', letterSpacing: '-0.01em' }],
        'display-sm': ['2rem', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.008em' }],
        'headline': ['1.75rem', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.006em' }],
        'card-title': ['1.375rem', { lineHeight: '1.25', fontWeight: '500', letterSpacing: '-0.004em' }],
        'subhead': ['1.25rem', { lineHeight: '1.4', fontWeight: '400', letterSpacing: '-0.002em' }],
        'body-lg': ['1.125rem', { lineHeight: '1.5', fontWeight: '400', letterSpacing: '-0.001em' }],
        'body': ['1rem', { lineHeight: '1.5', fontWeight: '400', letterSpacing: '-0.0005em' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
        'button': ['0.875rem', { lineHeight: '1.2', fontWeight: '500' }],
        'eyebrow': ['0.8125rem', { lineHeight: '1.3', fontWeight: '500', letterSpacing: '0.004em' }],
        'mono': ['0.8125rem', { lineHeight: '1.5', fontWeight: '400' }],
        'mono-sm': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
      },
      spacing: {
        section: '96px',
        hero: '128px',
      },
      transitionDuration: {
        'fast': '100ms',
        'normal': '150ms',
        'slow': '200ms',
      },
      transitionTimingFunction: {
        'signature': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      zIndex: {
        'dropdown': '10',
        'sticky': '20',
        'fixed': '30',
        'modal': '50',
      },
      backdropBlur: {
        'xl': '24px',
      },
    },
    container: {
      center: true,
      padding: {
        DEFAULT: '1.25rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1152px',
        '2xl': '1152px',
      },
    },
  },
  plugins: [typography],
};

export default config;
