// ── Hojas de carga para imprimir ───────────────────────────────────────────
// Una hoja por reparto con lo que tiene que salir, para quienes cargan los
// camiones. Si la salida ya está confirmada se usan esos números; si no, la
// sugerencia de la app (y la hoja lo aclara). Sin historial, sale la lista de
// productos con la cantidad en blanco para completar a mano.

import { predecirJornada } from './predict.js';
import { sumarDias, jornadaId, fechaLarga, capitalizar, esc, fmt } from './util.js';
import { ordenarProductos as ordenar } from './catalogo.js';

export async function datosHoja(app, fecha, repartoId) {
  const opts = app.config.prediccion;
  await app.asegurarRango(sumarDias(fecha, -(opts.semanas * 7 + 7)), fecha);
  const j = app.cache.get(jornadaId(fecha, repartoId));
  const items = (j && j.items) || {};
  const confirmada = !!(j && j.pasos && j.pasos.salida);

  // activos + los que ya estén en la planilla aunque se hayan desactivado
  const productos = ordenar(app.config.productos.filter((p) => p.activo !== false || (items[p.id] && items[p.id].salida > 0)));
  const preds = confirmada ? {} : predecirJornada(app.jornadas(), productos, repartoId, fecha, opts);

  const filas = productos.map((p) => {
    const it = items[p.id] || {};
    const pr = preds[p.id];
    const cant = confirmada ? (it.salida ?? 0) : (it.salida ?? it.pred ?? (pr ? pr.sugerido : null));
    return { p, cant, recarga: it.recarga || null };
  });
  const conDatos = filas.some((f) => f.cant != null);
  const visibles = conDatos ? filas.filter((f) => f.cant > 0 || f.recarga > 0) : filas;
  return {
    fecha,
    reparto: app.reparto(repartoId),
    estado: confirmada ? 'confirmada' : conDatos ? 'sugerida' : 'sin-datos',
    filas: visibles,
    total: visibles.reduce((a, f) => a + (f.cant || 0), 0)
  };
}

const LEYENDA = {
  confirmada: 'Salida confirmada',
  sugerida: 'Carga sugerida por la app (todavía sin confirmar)',
  'sin-datos': 'Sin historial todavía: completar la cantidad a mano'
};

export function htmlHojas(hojas) {
  return hojas.map((h) =>
    '<section class="hoja">' +
      '<header class="hoja-cab">' +
        '<div><h1>Hoja de carga · ' + esc(h.reparto.nombre) + '</h1>' +
          '<p class="hoja-fecha">' + capitalizar(fechaLarga(h.fecha)) + '</p>' +
          '<p class="hoja-estado">' + LEYENDA[h.estado] + '</p></div>' +
        '<img src="icons/icon-192.png" alt="Doña Sol" />' +
      '</header>' +
      '<table class="hoja-tabla"><thead><tr>' +
        '<th>Producto</th><th class="c-cant">Cargar</th><th class="c-check">Cargado</th><th class="c-rec">Recarga</th>' +
      '</tr></thead><tbody>' +
      h.filas.map((f) =>
        '<tr><td>' + (f.p.codigo ? '<span class="hoja-cod">' + esc(f.p.codigo) + '</span> ' : '') + esc(f.p.nombre) + (f.p.medida ? ' <b>' + esc(f.p.medida) + '</b>' : '') + '</td>' +
        '<td class="c-cant">' + (f.cant == null ? '' : f.cant) + '</td>' +
        '<td class="c-check"><span class="casilla"></span></td>' +
        '<td class="c-rec">' + (f.recarga ? '+' + f.recarga : '') + '</td></tr>').join('') +
      '</tbody></table>' +
      '<footer class="hoja-pie">' +
        (h.estado === 'sin-datos' ? '' : '<p><b>' + fmt(h.total) + '</b> unidades · ' + h.filas.length + ' productos</p>') +
        '<div class="firmas"><span>Cargó: ____________________</span><span>Controló: ____________________</span></div>' +
      '</footer>' +
    '</section>').join('');
}

// Imprime (o guarda como PDF desde el diálogo de impresión).
export function imprimirHojas(contenedor, hojas, fecha) {
  contenedor.innerHTML = htmlHojas(hojas);
  const titulo = document.title;
  document.title = 'Hojas de carga ' + fecha; // nombre sugerido del PDF
  const volver = () => { document.title = titulo; window.removeEventListener('afterprint', volver); };
  window.addEventListener('afterprint', volver);
  window.print();
}
