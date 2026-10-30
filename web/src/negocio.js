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
  pais: 'Argentina'
};
