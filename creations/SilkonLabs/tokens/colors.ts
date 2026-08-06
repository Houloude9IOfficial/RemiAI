export const colors = {
  canvas: '#010102',
  surface: {
    1: '#0f1011',
    2: '#141516',
    3: '#18191a',
    4: '#191a1b',
  },
  hairline: {
    DEFAULT: '#23252a',
    strong: '#34343a',
    tertiary: '#3e3e44',
  },
  ink: {
    DEFAULT: '#f7f8f8',
    muted: '#d0d6e0',
    subtle: '#8a8f98',
    tertiary: '#62666d',
    inverse: '#000000',
  },
  brand: {
    copper: '#e0551a',
    copperHover: '#eb763c',
    copperFocus: '#c94214',
    steel: '#637385',
    steelHover: '#7e8d9c',
    platinum: '#707a8e',
  },
  light: {
    canvas: '#ffffff',
    surface: {
      1: '#f5f6f6',
      2: '#f6f7f7',
      3: '#fafbfb',
      4: '#fdfdfd',
    },
    hairline: {
      DEFAULT: '#e1e5e9',
      strong: '#c3cad1',
      tertiary: '#a0acb7',
    },
    ink: {
      DEFAULT: '#000000',
      muted: '#3c4152',
      subtle: '#525f70',
      tertiary: '#637385',
      inverse: '#ffffff',
    },
    brand: {
      copper: '#c94214',
      copperHover: '#a13312',
      copperFocus: '#822c13',
      steel: '#525f70',
      steelHover: '#454d60',
      platinum: '#4d5466',
    },
  },
  overlay: {
    DEFAULT: 'rgba(0, 0, 0, 0.6)',
    strong: 'rgba(0, 0, 0, 0.8)',
  },
  focus: {
    DEFAULT: '#e0551a',
    offset: 2,
    width: 2,
  },
} as const;