// ── Panel de control (pensado para la PC, también anda en tablet) ──────────
import { hoyISO, sumarDias, fechaCorta, capitalizar, esc, fmt, fmtSigno, pct, lunesDe, deISO } from '../util.js';
import { estado, totales, vueltaContada, ESTADOS } from '../calc.js';
import { evaluar } from '../predict.js';
import { ico, pildoraEstado, toast } from '../ui.js';
import { datosHoja, imprimirHojas, resumenHoja } from '../hojas.js';
import { diaSemana, jornadaId } from '../util.js';

const RANGOS = [
  { id: '7', nombre: 'Últimos 7 días', dias: 7 },
  { id: '30', nombre: 'Últimos 30 días', dias: 30 },
  { id: '90', nombre: 'Últimos 90 días', dias: 90 },
  { id: 'mes', nombre: 'Este mes' }
];

const filtro = { rango: '30', reparto: '' };

// Qué día y qué repartos imprimir (se recuerda mientras se usa la app):
//  carga → hojas de carga, de hoy en adelante (solo la Salida).
//  final → planillas terminadas, de jornadas cerradas (salida, recarga, vuelta y diferencia).
const cargaSel = { fecha: null, repartos: null };
const finalSel = { fecha: null, repartos: null };

// El día siguiente / anterior de reparto (salta el domingo)
function proximoDia(iso) {
  let d = sumarDias(iso, 1);
  if (diaSemana(d) === 0) d = sumarDias(d, 1);
  return d;
}
function diaAnterior(iso) {
  let d = sumarDias(iso, -1);
  if (diaSemana(d) === 0) d = sumarDias(d, -1);
  return d;
}

function botonDia(tipo, fecha, sel, texto) {
  return '<button class="' + (sel === fecha ? 'activo' : '') + '" data-' + tipo + '-fecha="' + fecha + '">' + texto + '</button>';
}

function desdeDe(rango, hoy) {
  if (rango === 'mes') return hoy.slice(0, 8) + '01';
  const r = RANGOS.find((x) => x.id === rango);
  return sumarDias(hoy, -(r.dias - 1));
}

function tile(label, valor, sub, extra = '') {
  return '<div class="tile">' +
    '<div class="tile-label">' + label + '</div>' +
    '<div class="tile-valor">' + valor + '</div>' +
    (extra || '') +
    (sub ? '<div class="tile-sub">' + sub + '</div>' : '') +
  '</div>';
}

// Agrupa las diferencias por jornada, de la más reciente a la más vieja
function porJornada(difs) {
  const m = new Map();
  difs.forEach((d) => {
    if (!m.has(d.j.id)) m.set(d.j.id, { j: d.j, lista: [] });
    m.get(d.j.id).lista.push(d);
  });
  return [...m.values()]
    .map((g) => ({ ...g, lista: g.lista.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)) }))
    .sort((a, b) => (a.j.fecha + a.j.repartoId < b.j.fecha + b.j.repartoId ? 1 : -1));
}

function medidor(valor) {
  if (valor == null) return '';
  const nivel = valor >= 0.75 ? 'bien' : valor >= 0.5 ? 'aviso' : 'mal';
  return '<div class="medidor medidor-' + nivel + '" role="img" aria-label="' + pct(valor) + '">' +
    '<span style="width:' + Math.round(valor * 100) + '%"></span></div>';
}

export async function render({ app, main, sigueVigente }) {
  const hoy = hoyISO();
  main.innerHTML = '<div class="vacio sutil">Cargando el panel…</div>';

  // ── Hojas de carga (de hoy en adelante) ────────────────────────────────
  async function pintarCarga(raiz) {
    const cont = raiz.querySelector('#hojas-carga');
    const sig = proximoDia(hoy);
    if (!cargaSel.fecha || cargaSel.fecha < hoy) cargaSel.fecha = hoy; // nunca de un día pasado
    const fecha = cargaSel.fecha;
    const activos = app.repartosActivos();
    if (!cargaSel.repartos) cargaSel.repartos = activos.map((r) => r.id);
    const datos = await Promise.all(activos.map((r) => datosHoja(app, fecha, r.id, 'carga')));
    if (!sigueVigente() || !cont.isConnected || fecha !== cargaSel.fecha) return;
    cont.innerHTML = '<h2>' + ico('camion') + 'Hojas de carga</h2>' +
      '<p class="sutil">Para cargar el camión, de hoy en adelante. Sale la <b>Salida</b> de cada producto; ' +
        'recarga, vuelta y diferencia quedan en blanco para anotar a mano.</p>' +
      '<div class="filtros">' +
        '<div class="segmentado" role="group" aria-label="Día de la hoja de carga">' +
          botonDia('carga', hoy, fecha, 'Hoy') + botonDia('carga', sig, fecha, capitalizar(fechaCorta(sig))) +
        '</div>' +
        '<input type="date" id="carga-fecha" min="' + hoy + '" value="' + fecha + '" aria-label="Otro día" />' +
      '</div>' +
      '<div class="hojas-repartos">' + datos.map((h) =>
        '<label class="hoja-opcion"><input type="checkbox" class="carga-rep" value="' + esc(h.reparto.id) + '"' + (cargaSel.repartos.includes(h.reparto.id) ? ' checked' : '') + ' />' +
        '<span><b>' + esc(h.reparto.nombre) + '</b><span class="sutil">' + resumenHoja(h) + '</span></span></label>').join('') + '</div>' +
      '<button class="btn btn-primario" id="btn-carga"' + (cargaSel.repartos.length ? '' : ' disabled') + '>' + ico('imprimir') + 'Imprimir hojas de carga</button>';
  }

  // ── Planillas terminadas (jornadas cerradas) ───────────────────────────
  // Repartos de ese día: los activos y cualquiera que tenga planilla.
  function repartosDelDia(fecha) {
    const ids = app.repartosActivos().map((r) => r.id);
    app.jornadas(fecha, fecha).forEach((j) => { if (!ids.includes(j.repartoId)) ids.push(j.repartoId); });
    return ids.map((id) => ({ id, j: app.cache.get(jornadaId(fecha, id)) }));
  }

  // El último día con alguna jornada cerrada (para arrancar ahí)
  function ultimoDiaCerrado() {
    const fechas = app.jornadas(undefined, hoy).filter((j) => estado(j) === 'cerrada').map((j) => j.fecha).sort();
    return fechas[fechas.length - 1] || hoy;
  }

  async function pintarFinal(raiz) {
    const cont = raiz.querySelector('#hojas-final');
    if (!finalSel.fecha || finalSel.fecha > hoy) { finalSel.fecha = ultimoDiaCerrado(); finalSel.repartos = null; }
    const fecha = finalSel.fecha;
    const ant = diaAnterior(hoy);
    await app.asegurarRango(fecha, fecha);
    const lista = repartosDelDia(fecha);
    const cerradas = lista.filter((x) => estado(x.j) === 'cerrada');
    if (!finalSel.repartos) finalSel.repartos = cerradas.map((x) => x.id);
    const datos = await Promise.all(cerradas.map((x) => datosHoja(app, fecha, x.id, 'completa')));
    if (!sigueVigente() || !cont.isConnected || fecha !== finalSel.fecha) return;
    const porId = new Map(datos.map((h) => [h.reparto.id, h]));
    cont.innerHTML = '<h2>' + ico('imprimir') + 'Planillas terminadas</h2>' +
      '<p class="sutil">Cuando la jornada está <b>cerrada</b> sale completa: lo que salió, la recarga, lo que volvió y la diferencia. ' +
        'En la ventana de impresión se puede elegir <b>Guardar como PDF</b> para mandarla por WhatsApp.</p>' +
      '<div class="filtros">' +
        '<div class="segmentado" role="group" aria-label="Día de la planilla terminada">' +
          botonDia('final', hoy, fecha, 'Hoy') + botonDia('final', ant, fecha, capitalizar(fechaCorta(ant))) +
        '</div>' +
        '<input type="date" id="final-fecha" max="' + hoy + '" value="' + fecha + '" aria-label="Otro día" />' +
      '</div>' +
      '<div class="hojas-repartos">' + lista.map((x) => {
        const nombre = '<b>' + esc(app.reparto(x.id).nombre) + '</b>';
        const h = porId.get(x.id);
        if (h) {
          return '<label class="hoja-opcion"><input type="checkbox" class="final-rep" value="' + esc(x.id) + '"' + (finalSel.repartos.includes(x.id) ? ' checked' : '') + ' />' +
            '<span>' + nombre + '<span class="sutil">' + resumenHoja(h) + '</span></span></label>';
        }
        const falta = !x.j ? 'Sin planilla ese día'
          : 'Falta cerrar la jornada (' + ESTADOS[estado(x.j)].label.toLowerCase() + ') · ' +
            '<a class="enlace" href="#/j/' + fecha + '/' + encodeURIComponent(x.id) + '">Abrirla</a>';
        return '<div class="hoja-opcion hoja-no"><input type="checkbox" disabled aria-label="' + esc(app.reparto(x.id).nombre) + ': sin cerrar" />' +
          '<span>' + nombre + '<span class="sutil">' + falta + '</span></span></div>';
      }).join('') + '</div>' +
      (cerradas.length
        ? '<button class="btn btn-primario" id="btn-final"' + (finalSel.repartos.length ? '' : ' disabled') + '>' + ico('imprimir') + 'Imprimir o guardar PDF</button>'
        : '<p class="sutil">Ese día no hay jornadas cerradas todavía.</p>');
  }

  async function imprimir(raiz, tipo) {
    const sel = tipo === 'final' ? finalSel : cargaSel;
    const posibles = tipo === 'final'
      ? repartosDelDia(sel.fecha).filter((x) => estado(x.j) === 'cerrada').map((x) => x.id)
      : app.repartosActivos().map((r) => r.id);
    const ids = posibles.filter((id) => sel.repartos.includes(id));
    if (!ids.length) { toast('Elegí al menos un reparto'); return; }
    const datos = await Promise.all(ids.map((id) => datosHoja(app, sel.fecha, id, tipo === 'final' ? 'completa' : 'carga')));
    imprimirHojas(raiz.querySelector('#impresion-hojas'), datos);
  }

  const pintar = async (refrescar) => {
    const desde = desdeDe(filtro.rango, hoy);
    if (refrescar) {
      try { await app.refrescar(desde, hoy); } catch (e) { /* sin conexión */ }
    } else {
      await app.asegurarRango(desde, hoy);
    }
    if (!sigueVigente()) return;
    const todas = app.jornadas(desde, hoy).filter((j) => !filtro.reparto || j.repartoId === filtro.reparto);
    const contadas = todas.filter(vueltaContada);
    const conFact = app.conFacturacion();

    // Totales
    let vendido = 0, recarga = 0, vuelta = 0, salida = 0;
    const difs = [];
    const porProducto = {};
    contadas.forEach((j) => {
      const t = totales(j);
      vendido += t.vendido; recarga += t.recarga; vuelta += t.vuelta; salida += t.salida;
      t.diferencias.forEach((d) => difs.push({ j, ...d }));
      Object.entries(j.items || {}).forEach(([pid, it]) => {
        const v = (Number(it.salida) || 0) + (Number(it.recarga) || 0) - (Number(it.vuelta) || 0);
        if (v > 0) porProducto[pid] = (porProducto[pid] || 0) + v;
      });
    });
    const ev = evaluar(contadas);
    const jornadasConDif = new Set(difs.map((d) => d.j.id)).size;
    const sinCerrar = todas.filter((j) => j.fecha < hoy && estado(j) !== 'cerrada')
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    // Hoy
    const hoyHtml = app.repartosActivos().map((r) => {
      const j = app.cache.get(hoy + '_' + r.id);
      return '<a class="hoy-item" href="#/j/' + hoy + '/' + encodeURIComponent(r.id) + '">' +
        '<span class="hoy-nombre">' + ico('camion') + esc(r.nombre) + '</span>' + pildoraEstado(estado(j)) + '</a>';
    }).join('');

    // Por semana
    const semanas = {};
    contadas.forEach((j) => {
      const s = lunesDe(j.fecha);
      (semanas[s] = semanas[s] || []).push(j);
    });
    const filasSemana = Object.keys(semanas).sort().reverse().map((s) => {
      const e = evaluar(semanas[s]);
      const tt = semanas[s].map(totales);
      const suma = (k) => tt.reduce((a, t) => a + t[k], 0);
      const d = deISO(s);
      return '<tr><th scope="row">Semana del ' + d.getDate() + '/' + (d.getMonth() + 1) + '</th>' +
        '<td class="num">' + semanas[s].length + '</td>' +
        '<td class="num">' + fmt(suma('vendido')) + '</td>' +
        '<td class="num">' + fmt(suma('recarga')) + '</td>' +
        '<td class="num">' + fmt(suma('vuelta')) + '</td>' +
        '<td class="celda-medidor">' + (e.acierto == null ? '<span class="sutil">sin predicción</span>' : medidor(e.acierto) + '<span class="num">' + pct(e.acierto) + '</span>') + '</td></tr>';
    }).join('');

    // Ranking de productos
    const top = Object.entries(porProducto).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const max = top.length ? top[0][1] : 1;
    const topHtml = top.map(([pid, v]) => {
      const p = app.producto(pid) || { nombre: pid, medida: '' };
      const nombre = p.nombre + (p.medida ? ' ' + p.medida : '');
      return '<li title="' + esc(nombre) + ': ' + fmt(v) + ' vendidos">' +
        '<span class="rank-nombre">' + esc(nombre) + '</span>' +
        '<span class="rank-barra"><span style="width:' + Math.max(2, (v / max) * 100) + '%"></span><b>' + fmt(v) + '</b></span></li>';
    }).join('');

    const repOpts = '<option value="">Todos los repartos</option>' + app.config.repartos.map((r) =>
      '<option value="' + esc(r.id) + '"' + (filtro.reparto === r.id ? ' selected' : '') + '>' + esc(r.nombre) + '</option>').join('');

    main.innerHTML = '<div class="vista">' +
      '<div class="encabezado"><div><p class="antetitulo">Panel</p><h1>Cómo vienen los repartos</h1></div>' +
        '<button class="btn btn-sec btn-chico" id="btn-refrescar">' + ico('historial') + '<span>Actualizar</span></button></div>' +
      '<div class="filtros">' +
        '<div class="segmentado" role="group" aria-label="Período">' +
          RANGOS.map((r) => '<button class="' + (filtro.rango === r.id ? 'activo' : '') + '" data-rango="' + r.id + '">' + r.nombre + '</button>').join('') +
        '</div>' +
        '<select id="f-reparto" aria-label="Reparto">' + repOpts + '</select>' +
      '</div>' +

      '<section class="bloque"><h2>Hoy</h2><div class="hoy-lista">' + (hoyHtml || '<p class="sutil">Sin repartos.</p>') + '</div></section>' +

      '<section class="bloque" id="hojas-carga"><h2>' + ico('camion') + 'Hojas de carga</h2><p class="sutil">Calculando…</p></section>' +
      '<section class="bloque" id="hojas-final"><h2>' + ico('imprimir') + 'Planillas terminadas</h2><p class="sutil">Calculando…</p></section>' +

      '<div class="tiles">' +
        tile('Vendido', fmt(vendido), 'unidades en ' + contadas.length + ' jornadas') +
        tile('Recargas', fmt(recarga), 'lo que faltó cargar a la salida') +
        tile('Volvió', fmt(vuelta), 'lo que sobró') +
        tile('Acierto de la predicción', ev.acierto == null ? '—' : pct(ev.acierto),
          ev.acierto == null ? 'todavía sin jornadas con predicción' : 'productos donde la sugerencia quedó cerca de lo vendido', medidor(ev.acierto)) +
        (!conFact ? '' : tile('Diferencias con facturación', fmt(difs.length),
          difs.length ? 'productos en ' + jornadasConDif + (jornadasConDif === 1 ? ' jornada' : ' jornadas') : 'todo coincide')) +
      '</div>' +

      (!conFact ? '' : '<section class="bloque"><h2>' + (difs.length ? ico('alerta') : ico('ok')) + 'Diferencias con facturación</h2>' +
        (difs.length
          ? '<p class="sutil">Una fila por jornada. Diferencia positiva: se vendió más de lo que se facturó.</p>' +
            '<div class="tabla-scroll"><table class="tabla tabla-click"><thead><tr><th scope="col">Día</th><th scope="col">Reparto</th>' +
            '<th scope="col">Productos que no coinciden</th><th scope="col" class="num">Unidades</th><th scope="col"></th></tr></thead><tbody>' +
            porJornada(difs).map(({ j, lista }) => {
              const nombres = lista.slice(0, 3).map((d) => {
                const p = app.producto(d.id) || { nombre: d.id, medida: '' };
                return esc(p.nombre + (p.medida ? ' ' + p.medida : '')) + ' (' + fmtSigno(d.diferencia) + ')';
              }).join(', ') + (lista.length > 3 ? ' y ' + (lista.length - 3) + ' más' : '');
              const neto = lista.reduce((a, d) => a + d.diferencia, 0);
              const href = '#/j/' + j.fecha + '/' + encodeURIComponent(j.repartoId) + '?paso=control';
              return '<tr data-href="' + href + '"><td>' + capitalizar(fechaCorta(j.fecha)) + '</td><td>' + esc(app.reparto(j.repartoId).nombre) + '</td>' +
                '<td><b>' + lista.length + '</b> · <span class="sutil">' + nombres + '</span></td>' +
                '<td class="num"><span class="dif dif-mal">' + ico('alerta') + fmtSigno(neto) + '</span></td>' +
                '<td><a class="enlace" href="' + href + '">Revisar</a></td></tr>';
            }).join('') + '</tbody></table></div>'
          : '<p class="sutil">En este período lo vendido coincide con lo facturado en todas las jornadas con facturación cargada.</p>') +
      '</section>') +

      (sinCerrar.length
        ? '<section class="bloque"><h2>' + ico('info') + 'Quedaron sin cerrar</h2><ul class="lista-simple">' +
          sinCerrar.map((j) => '<li><a href="#/j/' + j.fecha + '/' + encodeURIComponent(j.repartoId) + '">' +
            '<span>' + capitalizar(fechaCorta(j.fecha)) + ' · ' + esc(app.reparto(j.repartoId).nombre) + '</span>' +
            '<span class="sutil">' + ESTADOS[estado(j)].label + '</span>' + ico('adelante') + '</a></li>').join('') + '</ul></section>'
        : '') +

      '<div class="dos-columnas">' +
        '<section class="bloque"><h2>Cómo viene la predicción</h2>' +
          '<p class="sutil">Si la predicción mejora, cada semana hay menos recargas y vuelve menos mercadería.</p>' +
          (filasSemana
            ? '<div class="tabla-scroll"><table class="tabla"><thead><tr><th scope="col">Semana</th><th scope="col" class="num">Jornadas</th><th scope="col" class="num">Vendido</th>' +
              '<th scope="col" class="num">Recargas</th><th scope="col" class="num">Volvió</th><th scope="col">Acierto</th></tr></thead><tbody>' + filasSemana + '</tbody></table></div>'
            : '<p class="sutil">Todavía no hay jornadas cerradas en este período.</p>') +
        '</section>' +
        '<section class="bloque"><h2>Lo que más se vende</h2>' +
          (topHtml ? '<ol class="ranking">' + topHtml + '</ol>' : '<p class="sutil">Sin ventas en este período.</p>') +
        '</section>' +
      '</div>' +
      '<div class="solo-impresion" id="impresion-hojas"></div>' +
    '</div>';

    const raiz = main.firstElementChild;
    pintarCarga(raiz);
    pintarFinal(raiz);
    raiz.addEventListener('click', (e) => {
      const fila = e.target.closest('tr[data-href]');
      if (fila && !e.target.closest('a')) { location.hash = fila.dataset.href; return; }
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.rango) { filtro.rango = b.dataset.rango; pintar(false); }
      if (b.id === 'btn-refrescar') pintar(true);
      if (b.dataset.cargaFecha) { cargaSel.fecha = b.dataset.cargaFecha; pintarCarga(raiz); }
      if (b.dataset.finalFecha) { finalSel.fecha = b.dataset.finalFecha; finalSel.repartos = null; pintarFinal(raiz); }
      if (b.id === 'btn-carga') imprimir(raiz, 'carga');
      if (b.id === 'btn-final') imprimir(raiz, 'final');
    });
    raiz.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'carga-fecha' && t.value) {
        if (t.value < hoy) toast('La hoja de carga es de hoy en adelante');
        cargaSel.fecha = t.value < hoy ? hoy : t.value;
        pintarCarga(raiz);
      }
      if (t.id === 'final-fecha' && t.value) {
        if (t.value > hoy) toast('La planilla completa sale cuando la jornada está cerrada');
        finalSel.fecha = t.value > hoy ? hoy : t.value;
        finalSel.repartos = null;
        pintarFinal(raiz);
      }
      if (t.classList.contains('carga-rep')) {
        cargaSel.repartos = [...raiz.querySelectorAll('.carga-rep:checked')].map((x) => x.value);
        raiz.querySelector('#btn-carga').disabled = !cargaSel.repartos.length;
      }
      if (t.classList.contains('final-rep')) {
        finalSel.repartos = [...raiz.querySelectorAll('.final-rep:checked')].map((x) => x.value);
        raiz.querySelector('#btn-final').disabled = !finalSel.repartos.length;
      }
    });
    raiz.querySelector('#f-reparto').addEventListener('change', (e) => { filtro.reparto = e.target.value; pintar(false); });
  };

  await pintar(true);
}
