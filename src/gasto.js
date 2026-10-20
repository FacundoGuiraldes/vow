// Muestra cuánto se gastó este mes contra el tope.   Uso: npm run gasto
import "dotenv/config";
import { estadoDelMes, libroEnDisco, mesDe, topeDesdeEntorno } from "./presupuesto.js";
import { RUTA_LIBRO } from "./cliente-real.js";

const libro = await libroEnDisco(RUTA_LIBRO).leer();
const estado = estadoDelMes(libro, { mes: mesDe(new Date()), topeUSD: topeDesdeEntorno() });
const porOrigen = new Map();
for (const m of libro.movimientos.filter((x) => x.mes === estado.mes)) porOrigen.set(m.origen, (porOrigen.get(m.origen) ?? 0) + m.costoUSD);

console.log(`Gasto de ${estado.mes}: US$ ${estado.gastado.toFixed(2)} de US$ ${estado.topeUSD.toFixed(2)} (te quedan US$ ${estado.restante.toFixed(2)}).`);
for (const [origen, costo] of [...porOrigen].sort((a, b) => b[1] - a[1])) console.log(`  ${origen}: US$ ${costo.toFixed(2)}`);
if (estado.agotado) console.log("Tope alcanzado: los comandos de pago se cortan hasta el mes que viene o hasta que subas TOPE_MENSUAL_USD en el .env.");
