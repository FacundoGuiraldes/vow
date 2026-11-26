import { randomUUID } from "node:crypto";
import { idDeCorrida } from "../support/entorno";
import { DOMINIO_DE_PRUEBA } from "../support/base-de-datos";

// Email único e identificable: corrida + aleatorio, en un dominio que no puede existir.
export const emailDePrueba = (): string =>
  `e2e-${idDeCorrida()}-${randomUUID().slice(0, 8)}@${DOMINIO_DE_PRUEBA}`;

export const emailsInvalidos = ["no-es-un-email", "falta@", "@vow.com"];

export const anchosResponsive = [360, 768, 1024, 1440, 1920];
export const ANCHO_MINIMO_INDICE = 1200;
