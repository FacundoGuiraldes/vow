// Datos del negocio que se muestran en la web (términos, pie de página). Lo que sea null no se muestra.
// Completar CUIT, condición frente al IVA y domicilio ANTES de abrir la venta (ver docs/operacion/legal-pendientes.md).
export const negocio = {
  marca: 'VOW',
  responsable: 'Facundo Guiraldes',
  razonSocial: null,        // nombre o razón social que figura en ARCA (ex AFIP)
  cuit: null,               // CUIT
  condicionIva: null,       // por ejemplo "Responsable Monotributo"
  domicilio: null,          // domicilio legal o de atención
  email: 'vow2026ar@gmail.com',
  instagram: 'vow_ar',
  pais: 'Argentina',
  // Punto de retiro en persona (se muestra en la tienda y en los términos)
  retiro: {
    direccion: 'Gdor. Marcelino Ugarte 2257, B1636 Olivos, Provincia de Buenos Aires',
    horario: 'de 12 a 21 hs, desde el día siguiente a la compra'
  }
};
