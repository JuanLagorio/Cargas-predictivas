// ── Arranque, ingreso, rutas y guardado ────────────────────────────────────
import { LocalStore, FirebaseStore, fusionar } from './store.js';
import { generarDemo } from './demo.js';
import { hoyISO, sumarDias } from './util.js';
import { ico, toast } from './ui.js';
import * as vistaHoy from './views/hoy.js';
import * as vistaJornada from './views/jornada.js';
import * as vistaPanel from './views/panel.js';
import * as vistaHistorial from './views/historial.js';
import * as vistaAjustes from './views/ajustes.js';

const CLAVE_MODO = 'donasol_cargas_modo';
const $ = (id) => document.getElementById(id);

function leerModo() {
  try { return localStorage.getItem(CLAVE_MODO); } catch (e) { return null; }
}
function guardarModo(m) {
  try { m ? localStorage.setItem(CLAVE_MODO, m) : localStorage.removeItem(CLAVE_MODO); } catch (e) { /* nada */ }
}

// ── Estado de la app ───────────────────────────────────────────────────────
export const app = {
  store: null,
  config: null,
  cache: new Map(),     // id → jornada
  cubierto: null,       // { desde, hasta } rango de fechas ya traído
  pendientes: 0,
  error: false,

  // Trae (una sola vez) las jornadas de un rango de fechas.
  async asegurarRango(desde, hasta) {
    const tramos = [];
    if (!this.cubierto) tramos.push([desde, hasta]);
    else {
      if (desde < this.cubierto.desde) tramos.push([desde, sumarDias(this.cubierto.desde, -1)]);
      if (hasta > this.cubierto.hasta) tramos.push([sumarDias(this.cubierto.hasta, 1), hasta]);
    }
    for (const [d, h] of tramos) {
      const lista = await this.store.getJornadas(d, h);
      lista.forEach((j) => this.cache.set(j.id, j));
    }
    this.cubierto = this.cubierto
      ? { desde: desde < this.cubierto.desde ? desde : this.cubierto.desde,
          hasta: hasta > this.cubierto.hasta ? hasta : this.cubierto.hasta }
      : { desde, hasta };
  },

  // Vuelve a pedir un rango aunque ya esté (para ver cambios de otros equipos).
  async refrescar(desde, hasta) {
    const lista = await this.store.getJornadas(desde, hasta);
    [...this.cache.values()].forEach((j) => {
      if (j.fecha >= desde && j.fecha <= hasta) this.cache.delete(j.id);
    });
    lista.forEach((j) => this.cache.set(j.id, j));
  },

  jornadas(desde, hasta) {
    return [...this.cache.values()].filter((j) => (!desde || j.fecha >= desde) && (!hasta || j.fecha <= hasta));
  },

  repartosActivos() {
    return this.config.repartos.filter((r) => r.activo !== false);
  },

  reparto(id) {
    return this.config.repartos.find((r) => r.id === id) || { id, nombre: id };
  },

  // ¿Se compara con facturación? (se activa en Ajustes)
  conFacturacion() {
    return this.config.facturacion === true;
  },

  productosActivos() {
    return this.config.productos.filter((p) => p.activo !== false);
  },

  producto(id) {
    return this.config.productos.find((p) => p.id === id);
  },

  // Guarda cambios de una jornada (solo los campos que cambian).
  async guardar(id, cambios) {
    this.cache.set(id, fusionar(this.cache.get(id) || { id }, cambios));
    this.pendientes++;
    pintarGuardado();
    try {
      await this.store.patchJornada(id, cambios);
      this.error = false;
    } catch (e) {
      this.error = true;
      console.error(e);
      toast(mensajeError(e), 'mal');
    } finally {
      this.pendientes--;
      pintarGuardado();
    }
  },

  async guardarConfig(cfg) {
    this.config = cfg;
    try {
      await this.store.saveConfig(cfg);
    } catch (e) {
      toast(mensajeError(e), 'mal');
      throw e;
    }
  },

  async importar(lista) {
    await this.store.importarJornadas(lista);
    lista.forEach((j) => this.cache.set(j.id, j));
  },

  async salir() {
    if (this.store && this.store.modo === 'prueba') {
      guardarModo(null);
      location.hash = '';
      location.reload();
      return;
    }
    await window.firebase.auth().signOut();
    location.hash = '';
    location.reload();
  },

  async entrarPrueba() {
    guardarModo('prueba');
    location.hash = '';
    location.reload();
  }
};

function mensajeError(e) {
  const c = (e && e.code) || '';
  if (c.includes('permission')) return 'Firebase no da permiso para guardar las cargas. Revisá las reglas (ver LEEME).';
  if (c.includes('unavailable')) return 'Sin conexión: se guarda cuando vuelva internet.';
  return 'No se pudo guardar. Probá de nuevo.';
}

// ── Indicador de guardado ──────────────────────────────────────────────────
function pintarGuardado() {
  const el = $('estado-guardado');
  if (!el || !app.store) return;
  let html, clase;
  const online = navigator.onLine;
  if (app.store.modo === 'prueba') {
    html = ico('candado') + '<span>Solo este equipo</span>'; clase = 'neutro';
  } else if (app.pendientes > 0 && !online) {
    html = ico('sin-nube') + '<span>Sin señal · guardado en el equipo</span>'; clase = 'aviso';
  } else if (app.pendientes > 0) {
    html = ico('nube') + '<span>Guardando…</span>'; clase = 'neutro';
  } else if (!online) {
    html = ico('sin-nube') + '<span>Sin señal</span>'; clase = 'aviso';
  } else if (app.error) {
    html = ico('alerta') + '<span>Error al guardar</span>'; clase = 'mal';
  } else {
    html = ico('nube') + '<span>Al día</span>'; clase = 'bien';
  }
  el.className = 'estado-guardado ' + clase;
  el.innerHTML = html;
}
window.addEventListener('online', pintarGuardado);
window.addEventListener('offline', pintarGuardado);

// ── Rutas ──────────────────────────────────────────────────────────────────
const RUTAS = [
  { re: /^#?\/?$/, nav: 'hoy', vista: vistaHoy, params: () => ({}) },
  { re: /^#\/hoy\/(\d{4}-\d{2}-\d{2})$/, nav: 'hoy', vista: vistaHoy, params: (m) => ({ fecha: m[1] }) },
  { re: /^#\/j\/(\d{4}-\d{2}-\d{2})\/([^/?]+)(?:\?paso=(\w+))?$/, nav: 'hoy', vista: vistaJornada,
    params: (m) => ({ fecha: m[1], repartoId: decodeURIComponent(m[2]), paso: m[3] }) },
  { re: /^#\/panel$/, nav: 'panel', vista: vistaPanel, params: () => ({}) },
  { re: /^#\/historial$/, nav: 'historial', vista: vistaHistorial, params: () => ({}) },
  { re: /^#\/ajustes$/, nav: 'ajustes', vista: vistaAjustes, params: () => ({}) }
];

let limpiarVista = null;
let generacion = 0;

async function navegar() {
  const hash = location.hash || '#/';
  const ruta = RUTAS.find((r) => r.re.test(hash)) || RUTAS[0];
  const params = ruta.params(hash.match(ruta.re) || []);
  if (limpiarVista) { try { limpiarVista(); } catch (e) { /* nada */ } limpiarVista = null; }
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === ruta.nav));
  const main = $('main');
  const gen = ++generacion;
  main.classList.add('recargando');
  try {
    const limpiar = await ruta.vista.render({ app, main, params, sigueVigente: () => gen === generacion });
    if (gen === generacion) limpiarVista = limpiar || null;
    else if (limpiar) limpiar();
  } catch (e) {
    console.error(e);
    main.innerHTML = '<div class="vacio">' + ico('alerta') + '<p>Algo salió mal al abrir esta pantalla.</p><p class="sutil">' +
      (e && e.message ? e.message.replace(/</g, '&lt;') : '') + '</p></div>';
  }
  main.classList.remove('recargando');
}

// ── Inicio ─────────────────────────────────────────────────────────────────
async function arrancar(store) {
  app.store = store;
  try {
    app.config = await store.getConfig();
  } catch (e) {
    console.error(e);
    mostrarErrorInicio(e);
    return;
  }
  if (store.modo === 'prueba' && store.vacio()) {
    await store.importarJornadas(generarDemo(app.config));
  }
  const hoy = hoyISO();
  await app.asegurarRango(sumarDias(hoy, -120), sumarDias(hoy, 14));
  $('pantalla-ingreso').hidden = true;
  $('app').hidden = false;
  $('aviso-prueba').hidden = store.modo !== 'prueba';
  $('cargando').hidden = true;
  pintarGuardado();
  window.addEventListener('hashchange', navegar);
  navegar();
}

function mostrarErrorInicio(e) {
  $('cargando').hidden = true;
  $('pantalla-ingreso').hidden = true;
  $('app').hidden = false;
  const permiso = e && e.code && e.code.includes('permission');
  $('main').innerHTML =
    '<div class="vacio">' + ico('alerta') +
    '<h2>' + (permiso ? 'Falta habilitar las cargas en Firebase' : 'No se pudo abrir la app') + '</h2>' +
    '<p>' + (permiso
      ? 'La cuenta entró bien, pero Firebase todavía no deja leer las colecciones de cargas. Hay que agregar las reglas que están en el archivo LEEME.md (sección “Firebase”).'
      : 'Revisá la conexión a internet y volvé a intentar.') + '</p>' +
    '<p><button class="btn btn-sec" id="btn-salir-error">Salir</button></p></div>';
  $('btn-salir-error').onclick = () => app.salir();
}

function mostrarIngreso(errorCarga) {
  $('cargando').hidden = true;
  $('app').hidden = true;
  $('pantalla-ingreso').hidden = false;
  if (errorCarga) {
    $('ingreso-error').textContent = 'No se pudo conectar con Firebase. Revisá internet o probá el modo de ejemplo.';
  }
}

function prepararIngreso() {
  $('btn-prueba').onclick = () => app.entrarPrueba();
  $('form-ingreso').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-ingresar');
    $('ingreso-error').textContent = '';
    btn.disabled = true;
    btn.textContent = 'Ingresando…';
    try {
      await window.firebase.auth().signInWithEmailAndPassword($('ingreso-email').value.trim(), $('ingreso-clave').value);
    } catch (err) {
      const c = (err && err.code) || '';
      $('ingreso-error').textContent = c.includes('network')
        ? 'Sin conexión. Para entrar la primera vez hace falta internet.'
        : c.includes('unauthorized-domain')
          ? 'Esta dirección no está autorizada en Firebase (ver LEEME).'
          : 'Email o contraseña incorrectos.';
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });
}

function iniciar() {
  prepararIngreso();
  if (leerModo() === 'prueba') {
    const s = new LocalStore();
    s.init().then(() => arrancar(s));
    return;
  }
  let fb;
  try {
    fb = FirebaseStore.iniciarApp();
  } catch (e) {
    mostrarIngreso(true);
    return;
  }
  let arrancado = false;
  fb.auth().onAuthStateChanged(async (user) => {
    if (user && !arrancado) {
      arrancado = true;
      const s = new FirebaseStore();
      await s.init(user);
      arrancar(s);
    } else if (!user) {
      mostrarIngreso(false);
    }
  });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

iniciar();
