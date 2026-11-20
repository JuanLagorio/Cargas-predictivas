// ── Registro de Ventas ─────────────────────────────────────────────────────
// Lo que el vendedor anotó en la app Registro de Ventas, para mostrarlo entre
// paréntesis al lado de lo vendido según la planilla (salida + recarga − vuelta).
//
// Registro de Ventas es otro proyecto de Firebase (registroventas-a667e):
//   jornadas/{id}        { fecha: 'AAAA-MM-DD', nombreReparto, vendedor, finalizado, eliminada? }
//   jornadas/{id}/ventas { cliente, items: [{ producto, cantidad, precioUnitario }], total }
// Se lee con un usuario anónimo, igual que la app de ventas (sus reglas lo permiten).
// Solo se lee: desde acá nunca se escribe nada allá.

import { normalizar } from './util.js';

const CONFIG = {
  apiKey:            'AIzaSyDbCKmqrQILDlGi2JImw2GcQzFwGY-FVZI',
  authDomain:        'registroventas-a667e.firebaseapp.com',
  projectId:         'registroventas-a667e',
  storageBucket:     'registroventas-a667e.firebasestorage.app',
  messagingSenderId: '405555596880',
  appId:             '1:405555596880:web:3f2aedd3f2474f29e6cb55'
};

// Producto de Registro de Ventas → código de la grilla.
// Los que no están acá (o no están en la grilla) se avisan aparte, sin perderlos.
const CODIGOS = {
  'Limpiador Multiuso 5L': '46',
  'Limpia Vidrios 2L': '14',
  'Lavandina 10L': '3',
  'Envases 10L': '18',
  'Limpiador Líquido 5L': '93',
  'Limpiador Líquido 10L': '185',
  'Limpiador Cremoso 750gr': '34',
  'Alcohol en Gel 1L': '60',
  'Alcohol en Gel 5L': '67',
  'Desodorante Bactericida 10L': '21',
  'Desodorante Económico 10L': '53',
  'Shampoo para Manos 5L': '17',          // con olor (el sin olor, 8, casi no sale)
  'Detergente Líquido 10L': '1',          // Shampoo Industrial
  'Detergente Líquido ECO 10L': '43',     // Shampoo Económico
  'Detergente Grueso 10L': '2',           // Shampoo para Auto Grueso
  'Detergente Incoloro 10L': '88',        // Shampoo Incoloro
  'Suavizante 5L': '23',
  'Suavizante 10L': '9',
  'Vinagre 5L': '96',
  'Vinagre 10L': '97',
  'Espuma Controlada 5L': '30',           // con olor (la sin olor, 12, casi no sale)
  'Espuma Controlada 10L': '29',
  'Jabón p/Lavarropas Dúo 5L': '20',      // Ideal
  'Jabón p/Lavarropas Dúo 10L': '169',
  'Cera al Agua 5L': '10',
  'Desengrasante 5L': '63',
  'Alcohol Líquido 1L': '179',            // con atomizador
  'Alcohol Líquido 5L': '64',
  'Alcohol Líquido 10L': '72',
  'Soda Cáustica 5L': '42',
  'Soda Cáustica 10L': '7',
  'Hipoclorito de Sodio 10L': '4',
  'Perfumador 1/2L': '73',
  'Perfumador 1L': '61',
  'Emulsión Neumáticos 5L': '95',
  'Emulsión Plásticos 5L': '82',
  'Limpiador Multiuso Cítrico 5L': '122',
  'Limpiador Multiuso Cítrico 10L': '123',
  'Esencia Desodorante 2L': '6',
  'Rejillas (6 unid.)': '38',
  'Paños de Piso (6 unid.)': '37',
  'Paños de Piso (25 unid.)': '70',
  'Franelas (6 unid.)': '68',
  'Microfibras (5 unid.)': '99',
  'Guantes Negros (10 pares)': '124',
  'Guantes Amarillos (10 pares)': '124',
  'Jumbo 200 (funda 6 rollos)': '108',
  'Toalla Intercalada 20x23 (caja 4800 u.)': '839',
  'Servilleta de Bocadillo (caja 6000 u.)': '128',
  'Rollo Cocina 200 Hojas (funda 12 rollos)': '89',
  'Servilleta de Mesa 30x29,5 (36 paq. x 50)': '1185',
  'Servilletas de Mesa 22x21 (72 paq. x 50)': '729',
  'Papel Higiénico Doble Hoja (funda 64 rollos x 30m)': '106',
  'Papel Higiénico Jumbo 500 (funda 8 rollos)': '104'
};

const POR_NOMBRE = new Map(Object.entries(CODIGOS).map(([nombre, codigo]) => [normalizar(nombre), codigo]));

export function codigoDe(nombreVentas) {
  return POR_NOMBRE.get(normalizar(nombreVentas)) || null;
}

// Productos de la planilla que tienen su par en Registro de Ventas (a los otros,
// como bolsas o dispensadores, no se les pone paréntesis).
export function idsEnlazados(productos) {
  const codigos = new Set(Object.values(CODIGOS));
  return new Set(productos.filter((p) => p.codigo && codigos.has(String(p.codigo))).map((p) => p.id));
}

// Repartos que en Registro de Ventas se llaman por la zona.
const ZONAS = {
  'Reparto 4': 'Punta Del Este',
  'Reparto 5': 'Costa De Oro'
};
const ZONA = new Map(Object.entries(ZONAS).map(([reparto, zona]) => [normalizar(reparto), normalizar(zona)]));

// El reparto de la planilla y el elegido en Registro de Ventas se reconocen por
// el nombre (o por la zona, para los de la tabla de arriba).
export function mismoReparto(nombreVentas, reparto) {
  if (!nombreVentas || !reparto || !reparto.nombre) return false;
  const v = normalizar(nombreVentas);
  const n = normalizar(reparto.nombre);
  return v === n || v === ZONA.get(n);
}

// Suma las ventas por producto de la planilla.
//   porProducto: { productoId: unidades }
//   sinEnlazar:  { 'nombre en Registro de Ventas': unidades }  (no se encontró en la grilla)
export function sumarVentas(ventas, productos) {
  const porCodigo = new Map(productos.filter((p) => p.codigo).map((p) => [String(p.codigo), p.id]));
  const out = { porProducto: {}, sinEnlazar: {} };
  (ventas || []).forEach((v) => (v.items || []).forEach((it) => {
    const n = Number(it.cantidad) || 0;
    if (!n) return;
    const codigo = codigoDe(it.producto);
    const pid = codigo && porCodigo.get(codigo);
    if (pid) out.porProducto[pid] = (out.porProducto[pid] || 0) + n;
    else out.sinEnlazar[it.producto] = (out.sinEnlazar[it.producto] || 0) + n;
  }));
  return out;
}

// ── Lectura ────────────────────────────────────────────────────────────────
let conexion = null;

function conectar() {
  if (!conexion) {
    conexion = (async () => {
      const fb = window.firebase;
      const app = fb.apps.find((a) => a.name === 'ventas') || fb.initializeApp(CONFIG, 'ventas');
      // Si ya entró antes en este equipo, Firebase devuelve el mismo usuario anónimo.
      await app.auth().signInAnonymously();
      return app.firestore();
    })();
    conexion.catch(() => { conexion = null; }); // sin internet: se reintenta la próxima vez
  }
  return conexion;
}

// Lo anotado en Registro de Ventas para un reparto y un día. Incluye las
// jornadas que se sacaron de la lista con "Eliminar" (allá siguen contando en
// el resumen del mes) y las que todavía no se finalizaron.
export async function leerVentas(fecha, reparto, productos) {
  const db = await conectar();
  const snap = await db.collection('jornadas').where('fecha', '==', fecha).get();
  const jornadas = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
    .filter((j) => mismoReparto(j.nombreReparto, reparto));
  const listas = await Promise.all(jornadas.map((j) => db.collection('jornadas').doc(j.id).collection('ventas').get()));
  return {
    ...sumarVentas(listas.flatMap((s) => s.docs.map((d) => d.data())), productos),
    jornadas: jornadas.length,
    abiertas: jornadas.filter((j) => !j.finalizado).length,
    vendedores: [...new Set(jornadas.map((j) => j.vendedor).filter(Boolean))]
  };
}
