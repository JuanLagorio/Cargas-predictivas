// ── Planilla para imprimir (igual a la grilla de papel) ────────────────────
// Una hoja por reparto: Código · Producto · Salida · Recarga · Vuelta · Diferencia.
// Sirve para los dos momentos del día:
//  • a la salida: Salida completa; Recarga, Vuelta y Diferencia para anotar a mano.
//  • a la vuelta: todo completo.
// Nunca muestra la carga sugerida: imprime lo que figura en la columna Salida.

import { predecirJornada } from './predict.js';
import { sumarDias, jornadaId, esc, fmt, DIAS, deISO, capitalizar } from './util.js';
import { ordenarProductos } from './catalogo.js';
import { vueltaContada, cargado } from './calc.js';

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

export async function datosHoja(app, fecha, repartoId) {
  const opts = app.config.prediccion;
  await app.asegurarRango(sumarDias(fecha, -(opts.semanas * 7 + 7)), fecha);
  const j = app.cache.get(jornadaId(fecha, repartoId));
  const items = (j && j.items) || {};
  const confirmada = !!(j && j.pasos && j.pasos.salida);
  const contada = vueltaContada(j);

  // todos los productos de la grilla (como el papel) + los desactivados que tengan movimiento
  const productos = ordenarProductos(app.config.productos.filter((p) => p.activo !== false || cargado(items[p.id]) > 0));

  // Sin salida confirmada se imprime lo que la planilla tiene en Salida en este momento
  // (lo mismo que se ve en la pantalla de Salida).
  const preds = confirmada ? {} : predecirJornada(app.jornadas(), productos, repartoId, fecha, opts);
  const filas = productos.map((p) => {
    const it = items[p.id] || {};
    let salida = it.salida;
    if (salida == null && !confirmada) salida = it.pred ?? (preds[p.id] ? preds[p.id].sugerido : null);
    if (salida == null && confirmada) salida = 0;
    const recarga = n0(it.recarga);
    const vuelta = contada ? n0(it.vuelta) : (it.vuelta ?? null);
    const diferencia = contada ? n0(salida) + recarga - n0(vuelta) : null;
    return { p, salida, recarga, vuelta, diferencia };
  });

  const suma = (k) => filas.reduce((a, f) => a + n0(f[k]), 0);
  const conSalida = filas.filter((f) => n0(f.salida) > 0).length;
  return {
    fecha,
    reparto: app.reparto(repartoId),
    datos: datosDelDia(app, j, fecha, repartoId),
    confirmada,
    contada,
    sinDatos: filas.every((f) => f.salida == null),
    conSalida,
    filas,
    tot: { salida: suma('salida'), recarga: suma('recarga'), vuelta: suma('vuelta'), diferencia: contada ? suma('diferencia') : null }
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

export function htmlHojas(hojas) {
  return hojas.map((h) =>
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
        '<img src="icons/logo-donasol.jpg" alt="Doña Sol" class="hoja-logo" />' +
      '</header>' +
      '<table class="hoja-tabla">' +
        '<thead><tr><th class="c-cod">Código</th><th>Productos</th><th class="c-n">Salida</th><th class="c-n">Recarga</th><th class="c-n">Vuelta</th><th class="c-n">Diferencia</th></tr></thead>' +
        '<tbody>' +
        h.filas.map((f, i) =>
          '<tr' + (f.p.cat === 'papeles' && (i === 0 || h.filas[i - 1].p.cat !== 'papeles') ? ' class="inicio-papeles"' : '') + '><td class="c-cod">' + esc(f.p.codigo || '') + '</td>' +
          '<td>' + esc(f.p.nombre) + (f.p.medida ? ' ' + esc(f.p.medida) : '') + '</td>' +
          '<td class="c-n c-salida">' + celda(f.salida) + '</td>' +
          '<td class="c-n">' + (f.recarga ? '+' + f.recarga : '') + '</td>' +
          '<td class="c-n">' + (h.contada ? celda(f.vuelta) : celda(f.vuelta, true)) + '</td>' +
          '<td class="c-n">' + (h.contada ? celda(f.diferencia) : '') + '</td></tr>').join('') +
        '</tbody>' +
        '<tfoot><tr><td></td><th>Total</th>' +
          '<td class="c-n">' + (h.sinDatos ? '' : fmt(h.tot.salida)) + '</td>' +
          '<td class="c-n">' + (h.tot.recarga ? '+' + fmt(h.tot.recarga) : '') + '</td>' +
          '<td class="c-n">' + (h.contada ? fmt(h.tot.vuelta) : '') + '</td>' +
          '<td class="c-n">' + (h.contada ? fmt(h.tot.diferencia) : '') + '</td></tr></tfoot>' +
      '</table>' +
      '<footer class="hoja-pie"><span>Cargó: ______________________</span><span>Controló: ______________________</span></footer>' +
    '</section>').join('');
}

// Imprime (o guarda como PDF desde la ventana de impresión).
export function imprimirHojas(contenedor, hojas, nombre) {
  contenedor.innerHTML = htmlHojas(hojas);
  const titulo = document.title;
  document.title = 'Planilla ' + nombre; // nombre sugerido del PDF
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
  if (h.sinDatos) return 'sin historial: Salida en blanco';
  const estado = h.contada ? 'con vuelta y diferencia' : h.confirmada ? 'salida confirmada' : 'salida todavía sin confirmar';
  return fmt(h.tot.salida) + ' unidades · ' + h.conSalida + ' productos · ' + estado;
}
