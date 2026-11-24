// Misma interfaz que repositorio.js, pero en memoria: para probar toda la lógica sin base de datos.
const copiar = (valor) => (valor === null || valor === undefined ? valor : structuredClone(valor));

export function crearRepositorioMemoria() {
  const estado = new Map();
  let novedades = [];
  const ids = { novedad: 1 };

  return {
    async leerEstado(clave) { return estado.has(clave) ? copiar(estado.get(clave)) : null; },
    async guardarEstado(clave, valor) { estado.set(clave, copiar(valor)); },
    async tomarEstado(clave, valor) {
      if (estado.has(clave) && JSON.stringify(estado.get(clave)) === JSON.stringify(valor)) return false;
      estado.set(clave, copiar(valor));
      return true;
    },
    async agregarNovedad(texto) { novedades.push({ id: ids.novedad++, texto, usada: false, fecha: new Date().toISOString().slice(0, 10) }); },
    async novedadesPendientes() { return novedades.filter((n) => !n.usada).map(({ id, texto }) => ({ id, texto })); },
    async novedadesRecientes(limite = 20) { return novedades.slice(-limite).reverse().map(({ id, texto, fecha, usada }) => ({ id, texto, fecha, usada })); },
    async marcarNovedadesUsadas(lista) { for (const n of novedades) if (lista.includes(n.id)) n.usada = true; },
  };
}
