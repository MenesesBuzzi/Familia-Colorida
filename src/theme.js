// Paleta alegre da Família Colorida
export const palette = {
  coral: '#FF6B6B',
  sun: '#FFC93C',
  orange: '#FF9F1C',
  mint: '#2EC4B6',
  sky: '#4D96FF',
  grape: '#9B5DE5',
  pink: '#F15BB5',
  leaf: '#6BCB77',
};

export const RAINBOW = [palette.coral, palette.orange, palette.sun, palette.leaf, palette.mint, palette.sky, palette.grape, palette.pink];

export const light = {
  mode: 'light',
  bg: '#FFF7EC',
  card: '#FFFFFF',
  cardAlt: '#FFF1DC',
  text: '#2B2140',
  muted: '#7A6F8A',
  border: '#F0E2CC',
  input: '#FFFFFF',
  primary: palette.grape,
  danger: '#E63946',
  success: '#2A9D8F',
};

// Lobisomem: dia (quente) e noite (escuro com lua)
export const night = {
  mode: 'dark',
  bg: '#141633',
  card: '#20244A',
  cardAlt: '#2A2F5E',
  text: '#F4F1FF',
  muted: '#A9A6C9',
  border: '#33386B',
  input: '#1A1D40',
  primary: palette.sun,
  danger: '#FF6B6B',
  success: '#6BCB77',
};

export const day = {
  ...light,
  bg: '#FFF3D6',
  cardAlt: '#FFE6B3',
  primary: palette.orange,
};

export const radius = { sm: 10, md: 16, lg: 24 };

export function colorFor(text = '') {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return RAINBOW[h % RAINBOW.length];
}
