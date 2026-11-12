// ── Planilla de una jornada: Salida → Recarga → Vuelta → Control ───────────
import { esc, fmt, fmtSigno, num, normalizar, capitalizar, fechaLarga, fechaCorta,
  sumarDias, debounce, jornadaId, DIAS_PLURAL, diaSemana, hoyISO } from '../util.js';
import { estado, totales, controlFacturacion, filaProducto, cargado, tieneMovimiento } from '../calc.js';
import { predecirJornada } from '../predict.js';
import { leerFacturacion } from '../importar.js';
import { ordenarProductos } from '../catalogo.js';
import { fusionar } from '../store.js';
import { datosHoja, imprimirHojas, planillaImprimible, CAMPOS_DATOS, datosDelDia, datosPrevios, valoresUsados } from '../hojas.js';
import { ico, toast, pildoraEstado, pildoraControl, pildora, miniatura, nombreProducto, dialogo, confirmar } from '../ui.js';

const PASOS = [
  { id: 'salida',  n: 1, nombre: 'Salida' },
  { id: 'recarga', n: 2, nombre: 'Recarga' },
  { id: 'vuelta',  n: 3, nombre: 'Vuelta' },
  { id: 'control', n: 4, nombre: 'Control' },
  { id: 'grilla',  n: 0, nombre: 'Planilla completa' }
];

const AYUDA = {
  salida: 'La app sugiere cuánto cargar según lo que se vendió otros días iguales. Ajustá lo que haga falta y confirmá la salida.',
  recarga: 'Sumá lo que se agrega al camión por pedidos que la app no conocía: tocá +1 o +2 en cada producto.',
  vuelta: 'Anotá cuánto volvió de cada producto. Lo que quede vacío se toma como 0 (se vendió todo).',
  control: 'Lo vendido (salida + recarga − vuelta) tiene que coincidir con lo facturado. Las diferencias quedan marcadas.',
  cierre: 'Revisá lo vendido de cada producto (salida + recarga − vuelta), anotá lo que haga falta y cerrá la jornada.',
  grilla: 'Toda la planilla junta, como la hoja impresa. Sirve también para pasar planillas viejas a mano.'
};

function pasoInicial(e) {
  return { pendiente: 'salida', borrador: 'salida', ruta: 'recarga', vuelta: 'control', cerrada: 'control' }[e];
}

const ahoraISO = () => new Date().toISOString();

export async function render({ app, main, params, sigueVigente }) {
  const { fecha, repartoId } = params;
  const id = jornadaId(fecha, repartoId);
  const reparto = app.reparto(repartoId);
  const opts = app.config.prediccion;
  const conFact = app.conFacturacion(); // comparar con facturación (Ajustes)

  main.innerHTML = '<div class="vacio sutil">Calculando la carga sugerida…</div>';
  await app.asegurarRango(sumarDias(fecha, -(opts.semanas * 7 + 7)), fecha);
  try {
    const fresca = await app.store.getJornada(id);
    if (fresca) app.cache.set(id, fresca);
  } catch (e) { /* sin conexión: se usa la copia local */ }
  if (!sigueVigente()) return;

  // ── Estado local ─────────────────────────────────────────────────────────
  let j = app.cache.get(id) ? structuredClone(app.cache.get(id)) : null;
  let baseNueva = false;
  let pend = {};          // cambios sin guardar: { productoId: { campo: valor } }
  let pendOtros = {};     // otros campos (pasos, notas)
  let paso = params.paso && PASOS.some((p) => p.id === params.paso) ? params.paso : pasoInicial(estado(j));
  const filtro = { texto: '', ocultarCeros: false, soloDif: false };

  const productos = app.config.productos.filter((p) => p.activo !== false || (j && j.items && j.items[p.id]));
  if (j && j.items) {
    Object.keys(j.items).forEach((pid) => {
      if (!productos.some((p) => p.id === pid)) productos.push({ id: pid, nombre: pid, medida: '', cat: 'otros' });
    });
  }
  ordenarProductos(productos).forEach((p, i) => { productos[i] = p; }); // orden de la grilla de papel
  const porId = Object.fromEntries(productos.map((p) => [p.id, p]));

  const preds = predecirJornada(app.jornadas(), productos, repartoId, fecha, opts);
  const hayPrediccion = Object.values(preds).some((p) => p.sugerido != null);

  // ── Lectura de valores ───────────────────────────────────────────────────
  const it = (pid) => (j && j.items && j.items[pid]) || {};
  const salidaConfirmada = () => !!(j && j.pasos && j.pasos.salida);
  const vueltaConfirmada = () => !!(j && j.pasos && (j.pasos.vuelta || j.pasos.cierre));
  const cerrada = () => !!(j && j.pasos && j.pasos.cierre);
  const sugerido = (pid) => (preds[pid] ? preds[pid].sugerido : null);
  function salidaMostrada(pid) {
    const v = it(pid).salida;
    if (v != null) return v;
    if (!salidaConfirmada()) return it(pid).pred ?? sugerido(pid);
    return null;
  }
  const esSugerida = (pid) => it(pid).salida == null && !salidaConfirmada();

  // ── Guardado ─────────────────────────────────────────────────────────────
  function crearBase() {
    j = { id, fecha, repartoId, items: {}, pasos: {}, notas: '', datos: datosPrevios(app, fecha, repartoId) };
    productos.forEach((p) => {
      const s = sugerido(p.id);
      if (s != null) j.items[p.id] = { pred: s };
    });
    baseNueva = true;
  }

  async function guardarAhora() {
    if (!baseNueva && !Object.keys(pend).length && !Object.keys(pendOtros).length) return;
    let cambios = { ...pendOtros, items: pend };
    if (baseNueva) {
      cambios = fusionar({ fecha, repartoId, pasos: j.pasos, notas: j.notas || '', datos: j.datos || {}, items: j.items }, cambios);
      baseNueva = false;
    }
    pend = {};
    pendOtros = {};
    await app.guardar(id, cambios);
  }
  const guardarLuego = debounce(guardarAhora, 500);

  function cambiar(pid, campo, valor) {
    if (!j) crearBase();
    if (valor != null) valor = Math.max(0, Math.round(valor));
    j.items[pid] = { ...(j.items[pid] || {}), [campo]: valor };
    pend[pid] = { ...(pend[pid] || {}), [campo]: valor };
    actualizarFila(pid);
    pintarPie();
    guardarLuego();
  }

  function cambiarOtros(cambios) {
    if (!j) crearBase();
    j = fusionar(j, cambios);
    pendOtros = fusionar(pendOtros, cambios);
  }

  // Cambios que llegan de otro equipo (ej. la PC mientras se usa la tablet)
  const dejarDeEscuchar = app.store.escucharJornada(id, (remoto) => {
    if (!remoto) return;
    j = fusionar(fusionar(remoto, { items: pend }), pendOtros);
    app.cache.set(id, remoto);
    document.querySelectorAll('#lista [data-id]').forEach((el) => actualizarFila(el.dataset.id));
    pintarPie();
    pintarCabecera();
  });

  const alSalir = () => { guardarAhora(); };
  window.addEventListener('pagehide', alSalir);
  document.addEventListener('visibilitychange', alSalir);

  // ── Estructura de la pantalla ────────────────────────────────────────────
  main.innerHTML = '<div class="vista">' +
    '<div class="jornada">' +
      '<div class="encabezado">' +
        '<div>' +
          '<a class="volver" href="#/hoy/' + fecha + '">' + ico('atras') + 'Repartos del día</a>' +
          '<h1>' + esc(reparto.nombre) + '</h1>' +
          '<p class="sub">' + capitalizar(fechaLarga(fecha)) + ' <span id="pildora-estado"></span></p>' +
        '</div>' +
        '<div class="acciones">' +
          '<button class="btn btn-sec btn-chico" id="btn-imprimir">' + ico('imprimir') + '<span>Imprimir</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="pasos-tabs" role="tablist" id="tabs"></div>' +
      '<p class="ayuda-paso" id="ayuda"></p>' +
      '<div id="datos-reparto"></div>' +
      '<div class="herramientas" id="herramientas"></div>' +
      '<div id="lista" class="lista"></div>' +
      '<div class="pie-fijo" id="pie"></div>' +
    '</div>' +
    '<div class="solo-impresion" id="impresion"></div></div>';

  // Los eventos van en este contenedor (se descarta al cambiar de pantalla).
  const raiz = main.firstElementChild;
  const $ = (sel) => raiz.querySelector(sel);

  function pintarCabecera() {
    $('#pildora-estado').innerHTML = pildoraEstado(estado(j));
  }

  function pintarTabs() {
    $('#tabs').innerHTML = PASOS.map((p) => {
      const hecho = (p.id === 'salida' && salidaConfirmada()) ||
        (p.id === 'vuelta' && vueltaConfirmada()) || (p.id === 'control' && cerrada());
      return '<button role="tab" class="tab ' + (p.id === paso ? 'activo ' : '') + (p.id === 'grilla' ? 'tab-grilla ' : '') + '" data-paso="' + p.id + '" aria-selected="' + (p.id === paso) + '">' +
        (p.n ? '<span class="tab-n">' + (hecho ? ico('ok') : p.n) + '</span>' : '') +
        '<span>' + p.nombre + '</span></button>';
    }).join('');
    $('#ayuda').textContent = paso === 'control' && !conFact ? AYUDA.cierre : AYUDA[paso];
  }

  function pintarHerramientas() {
    let toggle = '';
    if (paso === 'salida' || paso === 'grilla') toggle = '<label class="interruptor"><input type="checkbox" id="f-ceros"' + (filtro.ocultarCeros ? ' checked' : '') + '><span>Ocultar los que van en 0</span></label>';
    if (paso === 'control' && conFact) toggle = '<label class="interruptor"><input type="checkbox" id="f-dif"' + (filtro.soloDif ? ' checked' : '') + '><span>Solo diferencias</span></label>';
    const extra = paso === 'control' && conFact
      ? '<button class="btn btn-sec btn-chico" id="btn-pegar">' + ico('pegar') + '<span>Pegar facturación</span></button>'
      : '';
    $('#herramientas').innerHTML =
      '<div class="buscador">' + ico('buscar') +
        '<input type="search" id="f-texto" placeholder="Buscar producto" value="' + esc(filtro.texto) + '" aria-label="Buscar producto" /></div>' +
      '<div class="herr-fila">' + toggle + extra + '</div>';
  }

  // ── Qué productos se ven en cada paso ────────────────────────────────────
  function visibles() {
    const t = normalizar(filtro.texto);
    return productos.filter((p) => {
      if (t && !normalizar(p.nombre + ' ' + (p.medida || '')).includes(t) && normalizar(p.codigo) !== t) return false;
      const x = it(p.id);
      if (paso === 'salida' && filtro.ocultarCeros && !(salidaMostrada(p.id) > 0)) return false;
      if (paso === 'grilla' && filtro.ocultarCeros && !tieneMovimiento(x) && !(salidaMostrada(p.id) > 0)) return false;
      if (paso === 'vuelta' && !(cargado(x) > 0) && !(x.vuelta > 0)) return false;
      if (paso === 'control') {
        if (!tieneMovimiento(x)) return false;
        if (filtro.soloDif) {
          const f = filaProducto(j, p.id);
          if (!f.diferencia) return false;
        }
      }
      return true;
    });
  }

  // ── Filas ────────────────────────────────────────────────────────────────
  function stepper(p, campo, valor, { botones = [-1, 1], clase = '' } = {}) {
    const nombre = esc(p.nombre + (p.medida ? ' ' + p.medida : ''));
    // Con botones rápidos (recarga) se ve "+1" y "+2", que es como lo piensa quien carga.
    const rapidos = botones.some((d) => d > 1);
    const btn = (d) => '<button type="button" class="paso-btn ' + (d > 0 && rapidos ? 'paso-rapido' : '') + '" data-d="' + d + '" data-campo="' + campo + '" aria-label="' +
      (d < 0 ? 'Uno menos' : 'Sumar ' + d) + ' – ' + nombre + '">' +
      (d === -1 ? ico('menos') : d === 1 && !rapidos ? ico('mas') : '+' + d) + '</button>';
    const menos = botones.filter((d) => d < 0).map(btn).join('');
    const mas = botones.filter((d) => d > 0).map(btn).join('');
    return '<div class="stepper ' + clase + '">' + menos +
      '<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-campo="' + campo + '" value="' + (valor == null ? '' : valor) + '" aria-label="' + campo + ' – ' + nombre + '" placeholder="0" />' +
      mas + '</div>';
  }

  function confianza(pr) {
    if (!pr || pr.sugerido == null) return '';
    const nivel = { alta: 3, media: 2, baja: 1 }[pr.confianza] || 0;
    return '<span class="conf" aria-label="Confianza ' + pr.confianza + '">' +
      [1, 2, 3].map((k) => '<i class="' + (k <= nivel ? 'lleno' : '') + '"></i>').join('') + '</span>';
  }

  function celdaSugerido(p) {
    const s = it(p.id).pred ?? sugerido(p.id);
    if (s == null) return '<span class="sutil chico">sin datos</span>';
    return '<button type="button" class="sug" data-info="' + p.id + '" aria-label="Por qué se sugiere ' + s + '">' +
      '<span class="sug-et">Sug.</span><b>' + s + '</b>' + confianza(preds[p.id]) + '</button>';
  }

  function fila(p) {
    const x = it(p.id);
    const f = filaProducto(j, p.id);
    const prod = '<div class="fila-prod">' + miniatura(p) + '<span class="fila-nombre">' + nombreProducto(p) + '</span></div>';
    let ref = '', ctrl = '';
    if (paso === 'salida') {
      ref = celdaSugerido(p);
      ctrl = stepper(p, 'salida', salidaMostrada(p.id), { clase: esSugerida(p.id) ? 'es-sugerido' : '' });
    } else if (paso === 'recarga') {
      ref = '<span class="ref">Salió <b>' + fmt(x.salida ?? 0) + '</b></span>';
      ctrl = stepper(p, 'recarga', x.recarga ?? null, { botones: [-1, 1, 2] });
    } else if (paso === 'vuelta') {
      ref = '<span class="ref">Cargó <b>' + fmt(f.cargado) + '</b>' + (x.recarga ? ' <span class="sutil">(' + fmt(x.salida ?? 0) + ' + ' + x.recarga + ')</span>' : '') + '</span>';
      ctrl = stepper(p, 'vuelta', x.vuelta ?? null, { clase: (x.vuelta ?? 0) > f.cargado ? 'error' : '' });
    } else if (paso === 'control') {
      ref = '<span class="ref ref-control">' +
        '<span>Cargó <b>' + fmt(f.cargado) + '</b></span>' +
        '<span>Volvió <b>' + fmt(x.vuelta ?? (vueltaConfirmada() ? 0 : null)) + '</b></span>' +
        '<span>Vendió <b class="vendido">' + fmt(f.vendido) + '</b></span></span>';
      if (conFact) ctrl = '<label class="fact"><span>Facturado</span>' +
        '<input type="text" inputmode="numeric" pattern="[0-9]*" data-campo="fact" value="' + (x.fact ?? '') + '" placeholder="0" aria-label="Facturado – ' + esc(p.nombre) + '" /></label>' +
        '<span class="celda-dif" data-dif></span>';
    }
    return '<div class="fila fila-' + paso + '" data-id="' + p.id + '">' + prod + '<div class="fila-ref">' + ref + '</div><div class="fila-ctrl">' + ctrl + '</div></div>';
  }

  function filaGrilla(p) {
    const inp = (campo, v, extra = '') => '<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-campo="' + campo + '" value="' + (v == null ? '' : v) + '" placeholder="0" class="' + extra + '" aria-label="' + campo + ' – ' + esc(p.nombre) + '" />';
    const x = it(p.id);
    return '<tr data-id="' + p.id + '">' +
      '<th scope="row"><span class="fila-prod">' + miniatura(p) + '<span class="fila-nombre">' + nombreProducto(p) + '</span></span></th>' +
      '<td class="num">' + celdaSugerido(p) + '</td>' +
      '<td>' + inp('salida', salidaMostrada(p.id), esSugerida(p.id) ? 'es-sugerido' : '') + '</td>' +
      '<td>' + inp('recarga', x.recarga) + '</td>' +
      '<td>' + inp('vuelta', x.vuelta) + '</td>' +
      '<td class="num" data-vendido></td>' +
      (conFact ? '<td>' + inp('fact', x.fact) + '</td><td class="num" data-dif></td>' : '') + '</tr>';
  }

  function pintarLista() {
    const lista = $('#lista');
    if (paso !== 'salida' && paso !== 'grilla' && !salidaConfirmada()) {
      lista.innerHTML = '<div class="vacio">' + ico('info') + '<p>Primero hay que confirmar la salida.</p>' +
        '<button class="btn btn-primario" data-ir="salida">Ir a la salida</button></div>';
      return;
    }
    const ps = visibles();
    if (!ps.length) {
      const msg = paso === 'vuelta' ? 'No hay productos cargados para contar.' :
        paso === 'control' && filtro.soloDif ? 'No hay diferencias. ' + ico('ok') : 'No hay productos con ese filtro.';
      lista.innerHTML = '<div class="vacio"><p>' + msg + '</p></div>';
      return;
    }
    let html = '';
    if (paso === 'salida' && !salidaConfirmada()) html += avisoPrediccion();
    if (paso === 'control') html += resumenControl();
    if (paso === 'grilla') {
      html += '<div class="tabla-scroll"><table class="tabla grilla"><thead><tr>' +
        '<th scope="col">Producto</th><th scope="col" class="num">Sug.</th><th scope="col">Salida</th><th scope="col">Recarga</th>' +
        '<th scope="col">Vuelta</th><th scope="col" class="num">Vendió</th>' +
        (conFact ? '<th scope="col">Facturado</th><th scope="col" class="num">Dif.</th>' : '') +
        '</tr></thead><tbody>' + ps.map(filaGrilla).join('') + '</tbody></table></div>';
    } else {
      html += '<div class="grupo">' + ps.map(fila).join('') + '</div>';
    }
    if (paso === 'control') {
      html += '<label class="campo notas"><span>Notas de la jornada</span><textarea id="notas" rows="2" placeholder="Ej.: se rompió una lavandina, cliente pagó al otro día…">' + esc((j && j.notas) || '') + '</textarea></label>';
    }
    lista.innerHTML = html;
    lista.querySelectorAll('[data-id]').forEach((el) => actualizarFila(el.dataset.id));
  }

  function avisoPrediccion() {
    if (!hayPrediccion) {
      return '<div class="aviso">' + ico('info') + '<p><b>Todavía no hay planillas anteriores de este reparto.</b> ' +
        'Completá la salida a mano. Cuando haya jornadas cerradas (o se importen las planillas escaneadas), la app va a sugerir la carga sola.</p></div>';
    }
    const ej = Object.values(preds).find((p) => p.n > 0);
    const base = ej && ej.base === 'dia'
      ? 'los últimos ' + ej.n + ' ' + DIAS_PLURAL[diaSemana(fecha)]
      : 'las últimas ' + (ej ? ej.n : 0) + ' jornadas';
    return '<div class="aviso aviso-sug">' + ico('hoy') + '<p>Carga sugerida según lo vendido ' + base + ' en este reparto. ' +
      'Los números en gris son sugerencias: tocá <b>Sug.</b> para ver de dónde salen.</p></div>';
  }

  function resumenControl() {
    if (!vueltaConfirmada()) {
      return '<div class="aviso">' + ico('info') + '<p>Para ver lo vendido, primero confirmá la vuelta.</p>' +
        '<button class="btn btn-sec btn-chico" data-ir="vuelta">Ir a la vuelta</button></div>';
    }
    return '';
  }

  // Actualiza una fila sin redibujar la lista (para no perder el foco).
  function actualizarFila(pid) {
    const el = $('#lista [data-id="' + CSS.escape(pid) + '"]');
    if (!el) return;
    const x = it(pid);
    const f = filaProducto(j, pid);
    el.querySelectorAll('input[data-campo]').forEach((inp) => {
      const c = inp.dataset.campo;
      // El valor no se toca mientras se está escribiendo; los avisos sí.
      if (inp !== document.activeElement) {
        const v = c === 'salida' ? salidaMostrada(pid) : x[c];
        inp.value = v == null ? '' : v;
      }
      if (c === 'salida') {
        inp.classList.toggle('es-sugerido', esSugerida(pid));
        inp.closest('.stepper') && inp.closest('.stepper').classList.toggle('es-sugerido', esSugerida(pid));
      }
      if (c === 'vuelta') {
        const mal = (x.vuelta ?? 0) > f.cargado;
        (inp.closest('.stepper') || inp).classList.toggle('error', mal);
        el.classList.toggle('fila-error', mal);
      }
    });
    const vEl = el.querySelector('[data-vendido]');
    if (vEl) vEl.textContent = fmt(f.vendido);
    const vb = el.querySelector('.vendido');
    if (vb) vb.textContent = fmt(f.vendido);
    const d = el.querySelector('[data-dif]');
    if (d) {
      // El contenedor (celda o span) no se toca; la marca va adentro.
      if (f.diferencia == null) d.innerHTML = paso === 'grilla' ? '' : '<span class="sutil chico">—</span>';
      else if (f.diferencia === 0) d.innerHTML = '<span class="dif dif-ok">' + ico('ok') + '<span class="sr">coincide</span></span>';
      else {
        const t = f.diferencia > 0 ? 'Se vendió más de lo facturado' : 'Se facturó más de lo vendido';
        d.innerHTML = '<span class="dif dif-mal" title="' + t + '">' + ico('alerta') + '<span>' + fmtSigno(f.diferencia) + '</span></span>';
      }
    }
    const ref = el.querySelector('.fila-ref .ref b');
    if (ref && paso === 'recarga') ref.textContent = fmt(x.salida ?? 0);
  }

  // ── Pie con totales y el botón del paso ──────────────────────────────────
  function pintarPie() {
    const pie = $('#pie');
    const t = totales(j);
    let texto = '', boton = '';
    if (paso === 'salida' || (paso === 'grilla' && !salidaConfirmada())) {
      let tot = 0, prods = 0;
      productos.forEach((p) => { const v = salidaMostrada(p.id) || 0; tot += v; if (v > 0) prods++; });
      if (!salidaConfirmada()) {
        texto = '<b>' + fmt(tot) + '</b> unidades · ' + prods + ' productos';
        boton = '<button class="btn btn-primario" data-accion="confirmar-salida">' + ico('ok') + 'Confirmar salida</button>';
      } else {
        texto = 'Salida confirmada · <b>' + fmt(tot) + '</b> unidades';
        boton = '<button class="btn btn-sec" data-ir="recarga">Ir a la recarga' + ico('adelante') + '</button>';
      }
    } else if (paso === 'recarga') {
      texto = 'Recarga: <b>' + fmtSigno(t.recarga) + '</b> unidades';
      boton = '<button class="btn btn-sec" data-ir="vuelta">Ir a la vuelta' + ico('adelante') + '</button>';
    } else if (paso === 'vuelta' || (paso === 'grilla' && !vueltaConfirmada())) {
      const cargados = productos.filter((p) => cargado(it(p.id)) > 0);
      const contados = cargados.filter((p) => it(p.id).vuelta != null).length;
      texto = 'Contados <b>' + contados + '</b> de ' + cargados.length + ' · volvieron <b>' + fmt(t.vuelta) + '</b>';
      boton = vueltaConfirmada()
        ? '<button class="btn btn-sec" data-ir="control">Ir al control' + ico('adelante') + '</button>'
        : '<button class="btn btn-primario" data-accion="confirmar-vuelta">' + ico('ok') + 'Confirmar vuelta</button>';
    } else {
      const c = controlFacturacion(j);
      const vend = '<span class="pie-vendido">Vendió <b>' + fmt(t.vendido) + '</b> unidades</span>';
      texto = vueltaConfirmada() ? (conFact ? pildoraControl(c) + ' ' : '') + vend : '';
      if (cerrada()) boton = '<button class="btn btn-sec" data-accion="reabrir">Reabrir</button>';
      else if (vueltaConfirmada()) boton = '<button class="btn btn-primario" data-accion="cerrar">' + ico('candado') + 'Cerrar jornada</button>';
    }
    pie.innerHTML = '<div class="pie-in"><div class="pie-texto">' + texto + '</div>' + boton + '</div>';
  }

  // Vendedor, acompañante, camión, libretas y recibo (como el encabezado del papel).
  // Se ve en Salida y en la planilla completa; trae lo de la última vez.
  function pintarDatos() {
    const cont = $('#datos-reparto');
    if (paso !== 'salida' && paso !== 'grilla') { cont.innerHTML = ''; return; }
    const d = datosDelDia(app, j, fecha, repartoId);
    const usados = valoresUsados(app);
    cont.innerHTML = '<details class="bloque datos-reparto"' + (CAMPOS_DATOS.some((c) => !d[c.id]) ? ' open' : '') + '>' +
      '<summary><h2>Datos del reparto</h2><span class="sutil">' +
        esc([d.vendedor, d.acompanante, d.camion].filter(Boolean).join(' · ') || 'Vendedor, acompañante, camión, libretas y recibo') +
      '</span></summary>' +
      '<div class="datos-grilla">' + CAMPOS_DATOS.map((c) =>
        '<label class="campo"><span>' + c.nombre + '</span>' +
          '<input type="text" data-dato="' + c.id + '" value="' + esc(d[c.id] || '') + '" list="dl-' + c.id + '" autocomplete="off"' +
          (c.id.startsWith('libreta') || c.id === 'recibo' ? ' inputmode="numeric"' : '') + ' />' +
          '<datalist id="dl-' + c.id + '">' + [...usados[c.id]].sort().map((v) => '<option value="' + esc(v) + '">').join('') + '</datalist>' +
        '</label>').join('') +
      '</div></details>';
  }

  function pintarTodo() {
    pintarCabecera();
    pintarTabs();
    pintarDatos();
    pintarHerramientas();
    pintarLista();
    pintarPie();
  }

  function irA(p) {
    paso = p;
    history.replaceState(null, '', '#/j/' + fecha + '/' + encodeURIComponent(repartoId) + '?paso=' + p);
    pintarTodo();
    window.scrollTo({ top: 0 });
  }

  // ── Acciones de cada paso ────────────────────────────────────────────────
  async function confirmarSalida() {
    let tot = 0, prods = 0;
    productos.forEach((p) => { const v = salidaMostrada(p.id) || 0; tot += v; if (v > 0) prods++; });
    const ok = await confirmar('Confirmar salida',
      'Salen <b>' + fmt(tot) + '</b> unidades de ' + prods + ' productos. Después se puede seguir corrigiendo si hace falta.',
      'Confirmar salida');
    if (!ok) return;
    if (!j) crearBase();
    productos.forEach((p) => {
      if (it(p.id).salida == null) {
        const v = salidaMostrada(p.id);
        if (v != null) {
          j.items[p.id] = { ...(j.items[p.id] || {}), salida: v };
          pend[p.id] = { ...(pend[p.id] || {}), salida: v };
        }
      }
    });
    cambiarOtros({ pasos: { salida: ahoraISO() } });
    await guardarAhora();
    toast('Salida confirmada', 'bien');
    irA(paso === 'grilla' ? 'grilla' : 'recarga');
  }

  async function confirmarVuelta() {
    const sinAnotar = productos.filter((p) => cargado(it(p.id)) > 0 && it(p.id).vuelta == null);
    const texto = sinAnotar.length
      ? sinAnotar.length + (sinAnotar.length === 1 ? ' producto no tiene' : ' productos no tienen') +
        ' vuelta anotada: se toman como <b>0</b> (se vendió todo).'
      : 'Todos los productos tienen la vuelta anotada.';
    const ok = await confirmar('Confirmar vuelta', texto, 'Confirmar vuelta');
    if (!ok) return;
    sinAnotar.forEach((p) => {
      j.items[p.id] = { ...(j.items[p.id] || {}), vuelta: 0 };
      pend[p.id] = { ...(pend[p.id] || {}), vuelta: 0 };
    });
    cambiarOtros({ pasos: { vuelta: ahoraISO() } });
    await guardarAhora();
    toast('Vuelta confirmada', 'bien');
    irA(paso === 'grilla' ? 'grilla' : 'control');
  }

  async function cerrarJornada() {
    const c = controlFacturacion(j);
    if (conFact && (c.tipo === 'dif' || c.tipo === 'sin-fact')) {
      const ok = await confirmar('Cerrar jornada',
        (c.tipo === 'dif' ? '<b>' + c.texto + '</b> con lo facturado.' : 'Todavía no se cargó lo facturado.') +
        ' ¿Cerrar igual? Queda marcado en el panel para revisar.', 'Cerrar igual');
      if (!ok) return;
    }
    cambiarOtros({ pasos: { cierre: ahoraISO() } });
    await guardarAhora();
    toast('Jornada cerrada', 'bien');
    pintarTodo();
  }

  async function reabrir() {
    cambiarOtros({ pasos: { cierre: null } });
    await guardarAhora();
    pintarTodo();
  }

  async function pegarFacturacion() {
    const r = await dialogo({
      titulo: 'Pegar facturación',
      ancho: 'ancho',
      html: '<p>Copiá del programa de facturación (o de Excel) dos columnas: <b>producto</b> y <b>cantidad</b>, y pegalas acá.</p>' +
        '<textarea id="txt-fact" rows="9" class="area" placeholder="Lavandina&#9;12&#10;Limpiador Multiuso 5L&#9;8"></textarea>',
      botones: [{ texto: 'Cancelar', valor: false }, { texto: 'Cargar', valor: true, clase: 'btn-primario' }]
    });
    if (!r) return;
    const texto = document.getElementById('txt-fact').value;
    const { encontrados, noReconocidos } = leerFacturacion(texto, productos);
    Object.entries(encontrados).forEach(([pid, v]) => {
      if (!j) crearBase();
      j.items[pid] = { ...(j.items[pid] || {}), fact: v };
      pend[pid] = { ...(pend[pid] || {}), fact: v };
    });
    await guardarAhora();
    pintarLista();
    pintarPie();
    const n = Object.keys(encontrados).length;
    if (noReconocidos.length) {
      dialogo({
        titulo: 'Facturación cargada a medias',
        html: '<p>Se cargaron <b>' + n + '</b> productos. Estas líneas no las reconocí; cargalas a mano:</p>' +
          '<ul class="lista-simple">' + noReconocidos.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>'
      });
    } else {
      toast('Facturación cargada: ' + n + ' productos', 'bien');
    }
  }

  function verPrediccion(pid) {
    const p = porId[pid];
    const pr = preds[pid];
    const guardada = it(pid).pred;
    const filas = (pr.muestras || []).map((m) =>
      '<tr><td>' + capitalizar(fechaCorta(m.fecha)) + '</td><td class="num">' + m.vendido + '</td><td>' + (m.agotado ? 'se agotó' : '') + '</td></tr>').join('');
    dialogo({
      titulo: p.nombre + (p.medida ? ' ' + p.medida : ''),
      html: '<p class="sug-grande">Sugerido: <b>' + (guardada ?? pr.sugerido ?? '—') + '</b>' +
        (pr.sugerido != null ? ' · confianza ' + pr.confianza : '') + '</p>' +
        '<p>' + esc(pr.texto) + '</p>' +
        (guardada != null && pr.sugerido != null && guardada !== pr.sugerido
          ? '<p class="sutil">Con los datos de ahora daría ' + pr.sugerido + '. Se guarda el valor del momento en que se armó la planilla.</p>' : '') +
        (filas ? '<table class="tabla compacta"><thead><tr><th>Día</th><th class="num">Vendió</th><th></th></tr></thead><tbody>' + filas + '</tbody></table>' : '')
    });
  }

  // Misma planilla que el panel (igual a la grilla de papel, sin la sugerencia):
  // hoja de carga de hoy en adelante; completa solo con la jornada cerrada.
  async function imprimir() {
    await guardarAhora();
    const modo = planillaImprimible(j, fecha, hoyISO());
    if (!modo) {
      toast(vueltaConfirmada()
        ? 'Cerrá la jornada para imprimir la planilla completa'
        : 'La hoja de carga es de hoy en adelante. La planilla completa se imprime con la jornada cerrada');
      return;
    }
    const h = await datosHoja(app, fecha, repartoId, modo);
    imprimirHojas($('#impresion'), [h]);
  }

  // ── Eventos ──────────────────────────────────────────────────────────────
  raiz.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-ir]');
    if (!t || !raiz.contains(t)) return;
    if (t.dataset.paso) { irA(t.dataset.paso); return; }
    if (t.dataset.ir) { irA(t.dataset.ir); return; }
    if (t.dataset.info) { verPrediccion(t.dataset.info); return; }
    if (t.dataset.d) {
      const fila = t.closest('[data-id]');
      const pid = fila.dataset.id;
      const campo = t.dataset.campo;
      const actual = campo === 'salida' ? salidaMostrada(pid) : it(pid)[campo];
      const nuevo = Math.max(0, (actual || 0) + Number(t.dataset.d));
      cambiar(pid, campo, nuevo);
      return;
    }
    const a = t.dataset.accion;
    if (a === 'confirmar-salida') confirmarSalida();
    else if (a === 'confirmar-vuelta') confirmarVuelta();
    else if (a === 'cerrar') cerrarJornada();
    else if (a === 'reabrir') reabrir();
    else if (t.id === 'btn-pegar') pegarFacturacion();
    else if (t.id === 'btn-imprimir') imprimir();
  });

  raiz.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'f-texto') { filtro.texto = t.value; pintarLista(); return; }
    if (t.id === 'notas') { cambiarOtros({ notas: t.value }); guardarLuego(); return; }
    if (t.dataset.dato) {
      // la primera vez se guardan también los que vinieron de la última jornada
      const base = (j && j.datos && Object.keys(j.datos).length) ? {} : datosDelDia(app, j, fecha, repartoId);
      cambiarOtros({ datos: { ...base, [t.dataset.dato]: t.value.trim() } });
      guardarLuego();
      return;
    }
    if (t.dataset.campo) {
      const limpio = t.value.replace(/[^0-9]/g, '');
      if (limpio !== t.value) t.value = limpio;
      const pid = t.closest('[data-id]').dataset.id;
      cambiar(pid, t.dataset.campo, num(limpio));
    }
  });

  raiz.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'f-ceros') { filtro.ocultarCeros = t.checked; pintarLista(); }
    if (t.id === 'f-dif') { filtro.soloDif = t.checked; pintarLista(); }
  });

  raiz.addEventListener('focusin', (e) => {
    if (e.target.dataset && e.target.dataset.campo) e.target.select();
  });

  // Enter pasa al siguiente casillero de la misma columna
  raiz.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Enter' || !t.dataset || !t.dataset.campo) return;
    e.preventDefault();
    const todos = [...raiz.querySelectorAll('#lista input[data-campo="' + t.dataset.campo + '"]')];
    const sig = todos[todos.indexOf(t) + 1];
    if (sig) sig.focus(); else t.blur();
  });

  pintarTodo();

  return () => {
    guardarAhora();
    dejarDeEscuchar && dejarDeEscuchar();
    window.removeEventListener('pagehide', alSalir);
    document.removeEventListener('visibilitychange', alSalir);
  };
}
