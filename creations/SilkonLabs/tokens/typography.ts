/**
 * Silkon Labs — Design Tokens: Typography System
 * Geist/Inter with aggressive negative tracking on display (Linear-inspired)
 * Single voice from display → body, same family, narrower weights.
 */

export const typography = {
  // Font Families
  fontFamily: {
    display: [
      'Geist',
      'Inter',
      'SF Pro Display',
      '-apple-system',
      'system-ui',
      'Segoe UI',
      'Roboto',
      'sans-serif',
    ].join(', '),
    text: [
      'Geist',
      'Inter',
      'SF Pro Text',
      '-apple-system',
      'system-ui',
      'Segoe UI',
      'Roboto',
      'sans-serif',
    ].join(', '),
    mono: [
      'Geist Mono',
      'JetBrains Mono',
      'ui-monospace',
      'SF Mono',
      'Menlo',
      'Monaco',
      'Consolas',
      'monospace',
    ].join(', '),
  },

  // Font Weights
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line Heights
  lineHeight: {
    tight: 1.05,
    snug: 1.1,
    normal: 1.15,
    relaxed: 1.2,
    loose: 1.25,
    body: 1.5,
    caption: 1.4,
  },

  // Letter Spacing (tracking)
  letterSpacing: {
    tightest: '-0.03em',
    tighter: '-0.018em',
    tight: '-0.01em',
    snug: '-0.006em',
    normal: '-0.004em',
    body: '-0.0005em',
    none: '0',
    wide: '0.004em',
    wider: '0.008em',
  },

  // Type Scale
  scale: {
    'display-xl': {
      fontSize: '80px',
      fontWeight: 600,
      lineHeight: 1.05,
      letterSpacing: '-0.03em',
      fontFamily: 'var(--font-display)',
    },
    'display-lg': {
      fontSize: '56px',
      fontWeight: 600,
      lineHeight: 1.1,
      letterSpacing: '-0.018em',
      fontFamily: 'var(--font-display)',
    },
    'display-md': {
      fontSize: '40px',
      fontWeight: 600,
      lineHeight: 1.15,
      letterSpacing: '-0.01em',
      fontFamily: 'var(--font-display)',
    },
    'display-sm': {
      fontSize: '32px',
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: '-0.008em',
      fontFamily: 'var(--font-display)',
    },
    headline: {
      fontSize: '28px',
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: '-0.006em',
      fontFamily: 'var(--font-display)',
    },
    'card-title': {
      fontSize: '22px',
      fontWeight: 500,
      lineHeight: 1.25,
      letterSpacing: '-0.004em',
      fontFamily: 'var(--font-display)',
    },
    subhead: {
      fontSize: '20px',
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: '-0.002em',
      fontFamily: 'var(--font-display)',
    },
    'body-lg': {
      fontSize: '18px',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '-0.001em',
      fontFamily: 'var(--font-text)',
    },
    body: {
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '-0.0005em',
      fontFamily: 'var(--font-text)',
    },
    'body-sm': {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '0',
      fontFamily: 'var(--font-text)',
    },
    caption: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: '0',
      fontFamily: 'var(--font-text)',
    },
    button: {
      fontSize: '14px',
      fontWeight: 500,
      lineHeight: 1.2,
      letterSpacing: '0',
      fontFamily: 'var(--font-text)',
    },
    eyebrow: {
      fontSize: '13px',
      fontWeight: 500,
      lineHeight: 1.3,
      letterSpacing: '0.004em',
      fontFamily: 'var(--font-text)',
    },
    mono: {
      fontSize: '13px',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '0',
      fontFamily: 'var(--font-mono)',
    },
    'mono-sm': {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: '0',
      fontFamily: 'var(--font-mono)',
    },
    'mono-lg': {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '0',
      fontFamily: 'var(--font-mono)',
    },
  },
} as const;

export type Typography = typeof typography;