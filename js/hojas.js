// ── Hojas para imprimir ────────────────────────────────────────────────────
// Una hoja por reparto, de dos tipos:
//  • 'carga'    → HOJA DE CARGA, de hoy en adelante: Código · Producto · Carga · casillero
//                 para tildar al subirlo al camión. Solo los productos que hay que cargar.
//  • 'completa' → la jornada ya cerrada, igual a la grilla de papel:
//                 Código · Producto · Salida · Recarga · Vuelta · Diferencia.
// La cantidad a cargar es lo que figura en la Salida (confirmada, o la sugerida si todavía no).

import { predecirJornada } from './predict.js';
import { sumarDias, jornadaId, esc, fmt, DIAS, deISO, capitalizar } from './util.js';
import { ordenarProductos } from './catalogo.js';
import { vueltaContada, cargado, estado } from './calc.js';

// Qué planilla se puede imprimir de una jornada:
//  'completa' → está cerrada.
//  'carga'    → es de hoy en adelante y todavía no se contó la vuelta.
//  null       → ninguna (un día pasado sin cerrar, o con la vuelta contada pero sin cerrar).
export function planillaImprimible(j, fecha, hoy) {
  if (estado(j) === 'cerrada') return 'completa';
  if (fecha >= hoy && !vueltaContada(j)) return 'carga';
  return null;
}

const n0 = (v) => Number(v) || 0;

// ── Datos del reparto de cada día (como el encabezado de la grilla) ────────
export const CAMPOS_DATOS = [
  { id: 'vendedor',       nombre: 'Vendedor' },
  { id: 'acompanante',    nombre: 'Acompañante' },
  { id: 'camion',         nombre: 'Camión' },
  { id: 'libretaContado', nombre: 'Libreta contado' },
  { id: 'libretaCredito', nombre: 'Libreta crédito' },
  { id: 'recibo',         nombre: 'Recibo' }
];

// Lo que se anotó la última vez en ese reparto (menos el recibo, que cambia
// todos los días). Sirve para que no haya que escribir lo mismo cada día.
export function datosPrevios(app, fecha, repartoId) {
  const prev = app.jornadas()
    .filter((x) => x.repartoId === repartoId && x.fecha < fecha && x.datos && Object.values(x.datos).some(Boolean))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
  if (!prev) return {};
  const datos = { ...prev.datos };
  delete datos.recibo;
  return datos;
}

export function datosDelDia(app, j, fecha, repartoId) {
  return { ...datosPrevios(app, fecha, repartoId), ...((j && j.datos) || {}) };
}

// Valores usados antes en cada campo, para sugerirlos al escribir.
export function valoresUsados(app) {
  const out = {};
  CAMPOS_DATOS.forEach((c) => { out[c.id] = new Set(); });
  app.jornadas().forEach((x) => {
    Object.entries(x.datos || {}).forEach(([k, v]) => { if (v && out[k]) out[k].add(String(v)); });
  });
  return out;
}

export async function datosHoja(app, fecha, repartoId, modo = 'carga') {
  const opts = app.config.prediccion;
  await app.asegurarRango(sumarDias(fecha, -(opts.semanas * 7 + 7)), fecha);
  const j = app.cache.get(jornadaId(fecha, repartoId));
  const items = (j && j.items) || {};
  const confirmada = !!(j && j.pasos && j.pasos.salida);
  const completa = modo === 'completa';
  const fija = confirmada || completa; // la Salida ya no cambia

  // todos los productos de la grilla (como el papel) + los desactivados que tengan movimiento
  const productos = ordenarProductos(app.config.productos.filter((p) => p.activo !== false || cargado(items[p.id]) > 0));

  // Sin salida confirmada se imprime lo que la planilla tiene en Salida en este momento
  // (lo mismo que se ve en la pantalla de Salida).
  const preds = fija ? {} : predecirJornada(app.jornadas(), productos, repartoId, fecha, opts);
  const filas = productos.map((p) => {
    const it = items[p.id] || {};
    let salida = it.salida;
    if (salida == null && !fija) salida = it.pred ?? (preds[p.id] ? preds[p.id].sugerido : null);
    if (salida == null && fija) salida = 0;
    const recarga = n0(it.recarga);
    // En la hoja de carga la vuelta y la diferencia van en blanco, para anotar a mano.
    const vuelta = completa ? n0(it.vuelta) : null;
    const diferencia = completa ? n0(salida) + recarga - vuelta : null;
    return { p, salida, recarga, vuelta, diferencia };
  });

  const suma = (k) => filas.reduce((a, f) => a + n0(f[k]), 0);
  const conSalida = filas.filter((f) => n0(f.salida) > 0).length;
  return {
    fecha,
    modo: completa ? 'completa' : 'carga',
    completa,
    reparto: app.reparto(repartoId),
    estado: estado(j),
    datos: datosDelDia(app, j, fecha, repartoId),
    confirmada,
    sinDatos: filas.every((f) => f.salida == null),
    conSalida,
    filas,
    tot: {
      salida: suma('salida'),
      recarga: suma('recarga'),
      vuelta: completa ? suma('vuelta') : null,
      diferencia: completa ? suma('diferencia') : null
    }
  };
}

function celda(v, mostrarCero = false) {
  if (v == null) return '';
  if (v === 0 && !mostrarCero) return '–';
  return String(v);
}

function fechaPapel(iso) {
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
}

const LOGO = '<img src="icons/logo-donasol.jpg" alt="Doña Sol" class="hoja-logo" />';
const PIE = '<footer class="hoja-pie"><span>Cargó: ______________________</span><span>Controló: ______________________</span></footer>';

// Hoja de carga: para tildar cada producto a medida que se sube al camión.
function htmlCarga(h) {
  // Solo lo que hay que cargar. Sin historial (Salida en blanco) van todos, para completar a mano.
  const filas = h.sinDatos ? h.filas : h.filas.filter((f) => n0(f.salida) > 0);
  return '<section class="hoja hoja-carga">' +
    '<header class="hoja-cab">' +
      '<div class="hoja-cab-izq">' +
        '<h1 class="hoja-titulo">Carga</h1>' +
        '<table class="hoja-datos"><tbody>' +
          '<tr><th>Reparto N°</th><td><b>' + esc(h.reparto.nombre) + '</b></td>' +
            '<th>Vendedor</th><td>' + esc(h.datos.vendedor || '') + '</td></tr>' +
          '<tr><th>Fecha</th><td>' + fechaPapel(h.fecha) + ' · ' + capitalizar(DIAS[deISO(h.fecha).getDay()]) + '</td>' +
            '<th>Acompañante</th><td>' + esc(h.datos.acompanante || '') + '</td></tr>' +
          '<tr><th>Productos</th><td>' + (h.sinDatos ? '' : filas.length + ' · ' + fmt(h.tot.salida) + ' unidades') + '</td>' +
            '<th>Camión</th><td>' + esc(h.datos.camion || '') + '</td></tr>' +
        '</tbody></table>' +
      '</div>' +
      LOGO +
    '</header>' +
    '<table class="hoja-tabla">' +
      '<thead><tr><th class="c-cod">Código</th><th>Producto</th><th class="c-carga">Carga</th><th class="c-tick">Cargado</th></tr></thead>' +
      '<tbody>' +
      filas.map((f, i) =>
        '<tr' + (f.p.cat === 'papeles' && (i === 0 || filas[i - 1].p.cat !== 'papeles') ? ' class="inicio-papeles"' : '') + '>' +
        '<td class="c-cod">' + esc(f.p.codigo || '') + '</td>' +
        '<td>' + esc(f.p.nombre) + (f.p.medida ? ' ' + esc(f.p.medida) : '') + '</td>' +
        '<td class="c-carga">' + (f.salida == null ? '' : String(f.salida)) + '</td>' +
        '<td class="c-tick"><span class="tilde"></span></td></tr>').join('') +
      '</tbody>' +
      '<tfoot><tr><td></td><th>Total</th><td class="c-carga">' + (h.sinDatos ? '' : fmt(h.tot.salida)) + '</td><td></td></tr></tfoot>' +
    '</table>' +
    PIE +
  '</section>';
}

export function htmlHojas(hojas) {
  return hojas.map((h) => h.completa ? htmlCompleta(h) : htmlCarga(h)).join('');
}

// Planilla completa, igual a la grilla de papel.
function htmlCompleta(h) {
  return (
    '<section class="hoja">' +
      '<header class="hoja-cab">' +
        '<table class="hoja-datos"><tbody>' +
          '<tr><th>Reparto N°</th><td><b>' + esc(h.reparto.nombre) + '</b></td>' +
            '<th>Vendedor</th><td>' + esc(h.datos.vendedor || '') + '</td>' +
            '<th>Libreta contado</th><td>' + esc(h.datos.libretaContado || '') + '</td></tr>' +
          '<tr><th>Fecha</th><td>' + fechaPapel(h.fecha) + '</td>' +
            '<th>Acompañante</th><td>' + esc(h.datos.acompanante || '') + '</td>' +
            '<th>Libreta crédito</th><td>' + esc(h.datos.libretaCredito || '') + '</td></tr>' +
          '<tr><th>Día</th><td>' + capitalizar(DIAS[deISO(h.fecha).getDay()]) + '</td>' +
            '<th>Camión</th><td>' + esc(h.datos.camion || '') + '</td>' +
            '<th>Recibo</th><td>' + esc(h.datos.recibo || '') + '</td></tr>' +
        '</tbody></table>' +
        LOGO +
      '</header>' +
      '<table class="hoja-tabla">' +
        '<thead><tr><th class="c-cod">Código</th><th>Productos</th><th class="c-n">Salida</th><th class="c-n">Recarga</th><th class="c-n">Vuelta</th><th class="c-n">Diferencia</th></tr></thead>' +
        '<tbody>' +
        h.filas.map((f, i) =>
          '<tr' + (f.p.cat === 'papeles' && (i === 0 || h.filas[i - 1].p.cat !== 'papeles') ? ' class="inicio-papeles"' : '') + '><td class="c-cod">' + esc(f.p.codigo || '') + '</td>' +
          '<td>' + esc(f.p.nombre) + (f.p.medida ? ' ' + esc(f.p.medida) : '') + '</td>' +
          '<td class="c-n c-salida">' + celda(f.salida) + '</td>' +
          '<td class="c-n">' + (f.recarga ? '+' + f.recarga : '') + '</td>' +
          '<td class="c-n">' + celda(f.vuelta) + '</td>' +
          '<td class="c-n">' + celda(f.diferencia) + '</td></tr>').join('') +
        '</tbody>' +
        '<tfoot><tr><td></td><th>Total</th>' +
          '<td class="c-n">' + fmt(h.tot.salida) + '</td>' +
          '<td class="c-n">' + (h.tot.recarga ? '+' + fmt(h.tot.recarga) : '') + '</td>' +
          '<td class="c-n">' + fmt(h.tot.vuelta) + '</td>' +
          '<td class="c-n">' + fmt(h.tot.diferencia) + '</td></tr></tfoot>' +
      '</table>' +
      PIE +
    '</section>');
}

// Nombre sugerido del PDF: "Hoja de carga Reparto 1 2026-11-13" o "Planilla Reparto 1 2026-11-12".
export function nombrePdf(hojas) {
  const h = hojas[0];
  return (h.completa ? 'Planilla ' : 'Hoja de carga ') + (hojas.length === 1 ? h.reparto.nombre + ' ' : '') + h.fecha;
}

// Imprime (o guarda como PDF desde la ventana de impresión).
export function imprimirHojas(contenedor, hojas) {
  contenedor.innerHTML = htmlHojas(hojas);
  const titulo = document.title;
  document.title = nombrePdf(hojas);
  const volver = () => { document.title = titulo; window.removeEventListener('afterprint', volver); };
  window.addEventListener('afterprint', volver);
  const img = contenedor.querySelector('img');
  // espera el logo para que no salga la hoja sin él
  if (img && !img.complete) {
    img.addEventListener('load', () => window.print(), { once: true });
    img.addEventListener('error', () => window.print(), { once: true });
  } else {
    window.print();
  }
}

export function resumenHoja(h) {
  if (h.completa) {
    return 'Salió ' + fmt(h.tot.salida) + (h.tot.recarga ? ' · recarga +' + fmt(h.tot.recarga) : '') +
      ' · volvió ' + fmt(h.tot.vuelta) + ' · diferencia ' + fmt(h.tot.diferencia);
  }
  if (h.sinDatos) return 'sin historial: Salida en blanco';
  const est = h.estado === 'cerrada' ? 'jornada ya cerrada'
    : h.confirmada ? 'salida confirmada' : 'salida sugerida, todavía sin confirmar';
  return fmt(h.tot.salida) + ' unidades · ' + h.conSalida + ' productos · ' + est;
}
