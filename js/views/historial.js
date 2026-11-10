// ── Historial: planillas anteriores y movimiento por producto ──────────────
import { hoyISO, sumarDias, fechaCorta, capitalizar, esc, fmt, deISO, aISO } from '../util.js';
import { estado, totales, controlFacturacion, vueltaContada, filaProducto } from '../calc.js';
import { ordenarProductos } from '../catalogo.js';
import { ico, pildoraEstado, pildoraControl } from '../ui.js';

const filtro = { mes: hoyISO().slice(0, 7), reparto: '', vista: 'planillas', producto: '' };

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function opcionesMes(sel) {
  const d = deISO(hoyISO().slice(0, 8) + '01');
  let html = '';
  for (let i = 0; i < 36; i++) {
    const v = aISO(d).slice(0, 7);
    html += '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + MESES[d.getMonth()] + ' ' + d.getFullYear() + '</option>';
    d.setMonth(d.getMonth() - 1);
  }
  return html;
}

function rangoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return [mes + '-01', aISO(new Date(y, m, 0))];
}

export async function render({ app, main, sigueVigente }) {
  main.innerHTML = '<div class="vacio sutil">Cargando…</div>';

  const pintar = async () => {
    const [desde, hasta] = rangoMes(filtro.mes);
    await app.asegurarRango(desde, hasta);
    if (!sigueVigente()) return;
    const js = app.jornadas(desde, hasta)
      .filter((j) => !filtro.reparto || j.repartoId === filtro.reparto)
      .sort((a, b) => (a.fecha + a.repartoId < b.fecha + b.repartoId ? 1 : -1));

    const repOpts = (sel, todos) => (todos ? '<option value="">Todos los repartos</option>' : '') +
      app.config.repartos.map((r) => '<option value="' + esc(r.id) + '"' + (sel === r.id ? ' selected' : '') + '>' + esc(r.nombre) + '</option>').join('');

    let cuerpo = '';
    const conFact = app.conFacturacion();
    if (filtro.vista === 'planillas') {
      cuerpo = js.length
        ? '<div class="tabla-scroll"><table class="tabla tabla-click"><thead><tr><th scope="col">Día</th><th scope="col">Reparto</th><th scope="col">Estado</th>' +
          '<th scope="col" class="num">Salió</th><th scope="col" class="num">Recarga</th><th scope="col" class="num">Volvió</th><th scope="col" class="num">Vendió</th>' +
          (conFact ? '<th scope="col">Facturación</th>' : '') + '</tr></thead><tbody>' +
          js.map((j) => {
            const t = totales(j);
            const href = '#/j/' + j.fecha + '/' + encodeURIComponent(j.repartoId);
            return '<tr data-href="' + href + '"><th scope="row"><a href="' + href + '">' + capitalizar(fechaCorta(j.fecha)) + '</a></th>' +
              '<td>' + esc(app.reparto(j.repartoId).nombre) + '</td>' +
              '<td>' + pildoraEstado(estado(j)) + '</td>' +
              '<td class="num">' + fmt(t.salida) + '</td><td class="num">' + fmt(t.recarga) + '</td>' +
              '<td class="num">' + (t.contada ? fmt(t.vuelta) : '—') + '</td><td class="num">' + (t.contada ? fmt(t.vendido) : '—') + '</td>' +
              (conFact ? '<td>' + pildoraControl(controlFacturacion(j)) + '</td>' : '') + '</tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="vacio"><p>No hay planillas en este mes.</p></div>';
    } else {
      const prods = ordenarProductos(app.config.productos);
      if (!filtro.producto) filtro.producto = prods[0] ? prods[0].id : '';
      const sel = '<select id="f-producto" aria-label="Producto">' + prods.map((p) =>
        '<option value="' + esc(p.id) + '"' + (filtro.producto === p.id ? ' selected' : '') + '>' + esc((p.codigo ? p.codigo + ' · ' : '') + p.nombre + (p.medida ? ' ' + p.medida : '')) + '</option>').join('') + '</select>';
      const filas = js.filter((j) => j.items && j.items[filtro.producto]).map((j) => {
        const f = filaProducto(j, filtro.producto);
        const c = (v) => (v == null ? '—' : fmt(v));
        return '<tr><th scope="row"><a href="#/j/' + j.fecha + '/' + encodeURIComponent(j.repartoId) + '">' + capitalizar(fechaCorta(j.fecha)) + '</a></th>' +
          '<td>' + esc(app.reparto(j.repartoId).nombre) + '</td>' +
          '<td class="num">' + c(f.pred) + '</td><td class="num">' + c(f.salida) + '</td><td class="num">' + c(f.recarga) + '</td>' +
          '<td class="num">' + c(f.vuelta) + '</td><td class="num"><b>' + c(f.vendido) + '</b></td>' + (conFact ? '<td class="num">' + c(f.fact) + '</td>' : '') + '</tr>';
      }).join('');
      cuerpo = '<div class="filtros">' + sel + '</div>' + (filas
        ? '<div class="tabla-scroll"><table class="tabla"><thead><tr><th scope="col">Día</th><th scope="col">Reparto</th><th scope="col" class="num">Sugerido</th>' +
          '<th scope="col" class="num">Salida</th><th scope="col" class="num">Recarga</th><th scope="col" class="num">Vuelta</th><th scope="col" class="num">Vendió</th>' +
          (conFact ? '<th scope="col" class="num">Facturado</th>' : '') + '</tr></thead><tbody>' + filas + '</tbody></table></div>'
        : '<div class="vacio"><p>Este producto no tuvo movimiento en el mes.</p></div>');
    }

    main.innerHTML = '<div class="vista">' +
      '<div class="encabezado"><div><p class="antetitulo">Historial</p><h1>Planillas anteriores</h1></div></div>' +
      '<div class="filtros">' +
        '<div class="segmentado" role="group" aria-label="Vista">' +
          '<button class="' + (filtro.vista === 'planillas' ? 'activo' : '') + '" data-vista="planillas">Planillas</button>' +
          '<button class="' + (filtro.vista === 'producto' ? 'activo' : '') + '" data-vista="producto">Por producto</button>' +
        '</div>' +
        '<select id="f-mes" aria-label="Mes">' + opcionesMes(filtro.mes) + '</select>' +
        '<select id="f-reparto" aria-label="Reparto">' + repOpts(filtro.reparto, true) + '</select>' +
      '</div>' +
      cuerpo +
      '<section class="bloque nueva-planilla">' +
        '<h2>Pasar una planilla de otro día</h2>' +
        '<p class="sutil">Para cargar a mano una hoja de papel de un día anterior. Abre la planilla completa para llenar todas las columnas.</p>' +
        '<div class="filtros">' +
          '<input type="date" id="np-fecha" value="' + sumarDias(hoyISO(), -1) + '" aria-label="Fecha de la planilla" />' +
          '<select id="np-reparto" aria-label="Reparto">' + repOpts(app.repartosActivos()[0] && app.repartosActivos()[0].id, false) + '</select>' +
          '<button class="btn btn-primario btn-chico" id="np-abrir">Abrir planilla</button>' +
        '</div>' +
      '</section>' +
    '</div>';

    const raiz = main.firstElementChild;
    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('button, tr[data-href]');
      if (!b) return;
      if (b.dataset.vista) { filtro.vista = b.dataset.vista; pintar(); }
      else if (b.id === 'np-abrir') {
        const f = raiz.querySelector('#np-fecha').value;
        const r = raiz.querySelector('#np-reparto').value;
        if (f && r) location.hash = '#/j/' + f + '/' + encodeURIComponent(r) + '?paso=grilla';
      } else if (b.dataset.href && !e.target.closest('a')) location.hash = b.dataset.href;
    });
    raiz.querySelector('#f-mes').addEventListener('change', (e) => { if (e.target.value) { filtro.mes = e.target.value; pintar(); } });
    raiz.querySelector('#f-reparto').addEventListener('change', (e) => { filtro.reparto = e.target.value; pintar(); });
    const fp = raiz.querySelector('#f-producto');
    if (fp) fp.addEventListener('change', (e) => { filtro.producto = e.target.value; pintar(); });
  };

  await pintar();
}
