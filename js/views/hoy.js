// ── Hoy: los repartos del día y en qué paso está cada uno ──────────────────
import { hoyISO, sumarDias, fechaLarga, fechaCorta, capitalizar, esc, fmt, jornadaId } from '../util.js';
import { estado, totales, controlFacturacion, ESTADOS } from '../calc.js';
import { ico, pildoraEstado, pildoraControl } from '../ui.js';

const ACCION = {
  pendiente: 'Preparar la salida',
  borrador: 'Seguir con la salida',
  ruta: 'Recarga y vuelta',
  vuelta: 'Hacer el control',
  cerrada: 'Ver planilla'
};

function pasos(j) {
  const p = (j && j.pasos) || {};
  const t = totales(j);
  const items = [
    ['Salida', !!p.salida],
    ['Recarga', !!p.salida && t.recarga > 0, t.recarga ? '+' + t.recarga : ''],
    ['Vuelta', !!p.vuelta || !!p.cierre],
    ['Control', !!p.cierre]
  ];
  return '<ol class="pasitos">' + items.map(([n, ok, extra]) =>
    '<li class="' + (ok ? 'hecho' : '') + '">' + (ok ? ico('ok') : '<span class="punto"></span>') +
    '<span>' + n + (extra ? ' <b>' + extra + '</b>' : '') + '</span></li>').join('') + '</ol>';
}

function tarjeta(app, r, fecha) {
  const j = app.cache.get(jornadaId(fecha, r.id));
  const e = estado(j);
  const t = totales(j);
  const ctrl = controlFacturacion(j);
  const href = '#/j/' + fecha + '/' + encodeURIComponent(r.id);
  const cifras = j && j.pasos && j.pasos.salida
    ? '<dl class="cifras">' +
        '<div><dt>Salió</dt><dd>' + fmt(t.salida) + '</dd></div>' +
        '<div><dt>Recarga</dt><dd>' + fmt(t.recarga) + '</dd></div>' +
        '<div><dt>Volvió</dt><dd>' + (t.contada ? fmt(t.vuelta) : '—') + '</dd></div>' +
        '<div><dt>Vendió</dt><dd>' + (t.contada ? fmt(t.vendido) : '—') + '</dd></div>' +
      '</dl>'
    : '<p class="sutil">' + (e === 'pendiente'
      ? 'La app ya tiene la carga sugerida para hoy.'
      : 'Salida sin confirmar todavía.') + '</p>';
  const primario = e !== 'cerrada';
  return '<article class="tarjeta reparto">' +
    '<div class="reparto-cab">' +
      '<h3>' + ico('camion') + esc(r.nombre) + '</h3>' + pildoraEstado(e) +
    '</div>' +
    pasos(j) + cifras +
    (t.contada && app.conFacturacion() ? '<div class="reparto-control">' + pildoraControl(ctrl) + '</div>' : '') +
    '<a class="btn ' + (primario ? 'btn-primario' : 'btn-sec') + ' btn-ancho" href="' + href + '">' +
      ACCION[e] + ico('adelante') + '</a>' +
  '</article>';
}

export async function render({ app, main, params }) {
  const hoy = hoyISO();
  const fecha = params.fecha || hoy;
  main.innerHTML = '<div class="vacio sutil">Cargando…</div>';
  try { await app.refrescar(sumarDias(fecha, -7), fecha); } catch (e) { /* sin conexión: se usa lo que hay */ }

  const repartos = app.repartosActivos();
  const esHoy = fecha === hoy;

  // Pendientes de días anteriores (no cerrados)
  const atrasadas = app.jornadas(sumarDias(fecha, -7), sumarDias(fecha, -1))
    .filter((j) => estado(j) !== 'cerrada')
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  main.innerHTML =
    '<div class="encabezado">' +
      '<div>' +
        '<p class="antetitulo">' + (esHoy ? 'Hoy' : fecha < hoy ? 'Día anterior' : 'Próximo día') + '</p>' +
        '<h1>' + capitalizar(fechaLarga(fecha)) + '</h1>' +
      '</div>' +
      '<div class="selector-fecha">' +
        '<a class="btn-icono" href="#/hoy/' + sumarDias(fecha, -1) + '" aria-label="Día anterior">' + ico('atras') + '</a>' +
        '<input type="date" id="hoy-fecha" value="' + fecha + '" aria-label="Elegir fecha" />' +
        '<a class="btn-icono" href="#/hoy/' + sumarDias(fecha, 1) + '" aria-label="Día siguiente">' + ico('adelante') + '</a>' +
        (esHoy ? '' : '<a class="btn btn-sec btn-chico" href="#/">Hoy</a>') +
      '</div>' +
    '</div>' +
    (repartos.length
      ? '<div class="grilla-repartos">' + repartos.map((r) => tarjeta(app, r, fecha)).join('') + '</div>'
      : '<div class="vacio"><p>No hay repartos cargados.</p><a class="btn btn-primario" href="#/ajustes">Agregar repartos</a></div>') +
    (atrasadas.length
      ? '<section class="bloque"><h2>Quedaron sin cerrar</h2><ul class="lista-simple">' +
        atrasadas.map((j) => '<li><a href="#/j/' + j.fecha + '/' + encodeURIComponent(j.repartoId) + '">' +
          '<span>' + capitalizar(fechaCorta(j.fecha)) + ' · ' + esc(app.reparto(j.repartoId).nombre) + '</span>' +
          '<span class="sutil">' + ESTADOS[estado(j)].label + '</span>' + ico('adelante') + '</a></li>').join('') +
        '</ul></section>'
      : '');

  const inp = document.getElementById('hoy-fecha');
  inp.addEventListener('change', () => {
    if (inp.value) location.hash = inp.value === hoy ? '#/' : '#/hoy/' + inp.value;
  });
}
