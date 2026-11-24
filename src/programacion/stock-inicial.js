// Stock real del Drop 00 contado por Facundo (24/11/2026). Se carga una sola vez al arrancar el servicio; después el stock lo mueven la Caja, el Almacén y las ventas.
// Si hay que volver a cargarlo, se cambia la marca (por ejemplo "stock_inicial_drop00_v2").
export const MARCA_STOCK_INICIAL = "stock_inicial_drop00_v1";
export const STOCK_INICIAL = {
  "gorra-negra": 9,
  "gorra-beige": 9,
  "shaker-negro": 10,
  "shaker-claro": 10, // los shakers transparentes
  "medias-negro-grande": 30,
  "medias-negro-super": 30,
  "medias-hueso-grande": 18,
  "medias-hueso-super": 18,
  "medias-beige-grande": 17, // 18 menos un par que se queda Facundo
  "medias-beige-super": 18,
};
