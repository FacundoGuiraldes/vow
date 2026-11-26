// Textos y datos reales del repo: los tests esperan exactamente lo que la landing y la API usan, sin copiarlos.
import { content } from "../../web/src/content.js";
import { drop01 } from "../../src/data/drop-01.js";
import { MENSAJE_INSTAGRAM_INVALIDO } from "../../src/api/servidor.js";

export const textos = {
  ...content,
  hero: { ...content.hero, titulo: /Tu promesa\.\s*Tu fuerza\./i },
  regiones: {
    manifiesto: "Manifiesto",
    drop: "Los productos",
    acceso: "ACCESO",
  },
  privacidad: "Política de privacidad",
  // Los textos del catálogo viven dentro de web/src/main.js (no se exportan), por eso van acá.
  instagramInvalido: MENSAJE_INSTAGRAM_INVALIDO,
};

export type Producto = {
  drop_numero: number;
  numero: number;
  slug: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  colores: string[];
  destacado: boolean;
  estado: string;
  imagen: string | null;
};

export const productosDrop01: Producto[] = drop01;
