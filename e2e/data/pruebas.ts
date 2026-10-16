import { randomUUID } from "node:crypto";
import { idDeCorrida } from "../support/entorno";
import { DOMINIO_DE_PRUEBA } from "../support/base-de-datos";
import { productosDrop01, type Producto } from "./textos";

// Email único e identificable: corrida + aleatorio, en un dominio que no puede existir.
export const emailDePrueba = (): string =>
  `e2e-${idDeCorrida()}-${randomUUID().slice(0, 8)}@${DOMINIO_DE_PRUEBA}`;

export const emailsInvalidos = ["no-es-un-email", "falta@", "@vow.com"];

// Producto con HTML en los textos: la landing tiene que mostrarlo como texto, sin interpretarlo.
export const productoMalicioso: Producto = {
  ...productosDrop01[0],
  slug: "producto-malicioso",
  nombre: `<img src=x onerror="window.__xss = true">`,
  descripcion: `<script>window.__xss = true</script>`,
};

export const anchosResponsive = [360, 768, 1024, 1440, 1920];
export const ANCHO_MINIMO_INDICE = 1200;
