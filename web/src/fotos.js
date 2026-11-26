// Fotos reales de los productos del Drop 00 (WebP, ~750x1000). Una galería por producto y color.
const base = '/img/productos/';
const f = (nombre) => `${base}${nombre}.webp`;

export const FOTOS = {
  gorra: {
    negra: [f('gorra-negra-frente'), f('gorra-negra-atras')],
    beige: [f('gorra-beige-frente'), f('gorra-beige-atras')]
  },
  shaker: {
    negro: [f('shaker-negro-1'), f('shaker-negro-2')],
    claro: [f('shaker-claro-1'), f('shaker-claro-2')]
  },
  // Las medias vienen en negro, hueso (blancas) y beige (crema)
  medias: {
    negro: [f('medias-negro-1'), f('medias-negro-2')],
    hueso: [f('medias-hueso-1'), f('medias-hueso-2')],
    beige: [f('medias-beige-1'), f('medias-beige-2')]
  }
};

export const ALT = {
  gorra: (c) => `Gorra VOW ${c}`,
  shaker: (c) => `Shaker VOW ${c}`,
  medias: (c) => `Medias VOW ${c}`
};

// Foto principal de un grupo y color; si no hay, null
export const fotoDe = (grupo, color) => FOTOS[grupo]?.[color]?.[0] ?? null;
