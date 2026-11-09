// ── Datos ──────────────────────────────────────────────────────────────────
// Dos formas de guardar, con la misma interfaz:
//  • FirebaseStore: datos compartidos entre la tablet, el celular y la PC.
//    Funciona sin internet (guarda en el equipo y sube cuando vuelve la señal).
//  • LocalStore: "modo prueba", datos solo en este navegador.

import { configInicial } from './catalogo.js';
import { firebaseConfig, COLECCION_CONFIG, COLECCION_JORNADAS } from './firebase-config.js';

function esObjeto(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function fusionar(destino, cambios) {
  const out = esObjeto(destino) ? { ...destino } : {};
  Object.entries(cambios || {}).forEach(([k, v]) => {
    out[k] = esObjeto(v) ? fusionar(out[k], v) : v;
  });
  return out;
}

// Completa la configuración guardada con lo que pueda faltar.
function completarConfig(cfg) {
  const base = configInicial();
  if (!cfg) return base;
  return {
    productos: Array.isArray(cfg.productos) && cfg.productos.length ? cfg.productos : base.productos,
    repartos: Array.isArray(cfg.repartos) && cfg.repartos.length ? cfg.repartos : base.repartos,
    prediccion: { ...base.prediccion, ...(cfg.prediccion || {}) },
    facturacion: cfg.facturacion === true
  };
}

// ── Modo prueba (solo este navegador) ──────────────────────────────────────
const CLAVE = 'donasol_cargas_prueba_v1';

export class LocalStore {
  constructor() {
    this.modo = 'prueba';
    this.usuario = 'prueba';
    this.oyentes = new Map();
    this.datos = { config: null, jornadas: {} };
  }

  async init() {
    try {
      const raw = localStorage.getItem(CLAVE);
      if (raw) this.datos = JSON.parse(raw);
    } catch (e) { /* sin almacenamiento: queda en memoria */ }
    if (!this.datos.jornadas) this.datos.jornadas = {};
    window.addEventListener('storage', (e) => {
      if (e.key !== CLAVE) return;
      try { this.datos = JSON.parse(e.newValue) || this.datos; } catch (err) { return; }
      this.oyentes.forEach((cbs, id) => cbs.forEach((cb) => cb(this.datos.jornadas[id] || null)));
    });
  }

  persistir() {
    try { localStorage.setItem(CLAVE, JSON.stringify(this.datos)); } catch (e) { /* lleno o bloqueado */ }
  }

  vacio() {
    return Object.keys(this.datos.jornadas).length === 0;
  }

  async getConfig() {
    this.datos.config = completarConfig(this.datos.config);
    return this.datos.config;
  }

  async saveConfig(cfg) {
    this.datos.config = cfg;
    this.persistir();
  }

  async getJornadas(desde, hasta) {
    return Object.values(this.datos.jornadas)
      .filter((j) => j.fecha >= desde && j.fecha <= hasta)
      .map((j) => structuredClone(j));
  }

  async getJornada(id) {
    const j = this.datos.jornadas[id];
    return j ? structuredClone(j) : null;
  }

  async patchJornada(id, cambios) {
    const prev = this.datos.jornadas[id] || { id };
    const j = fusionar(prev, cambios);
    j.id = id;
    j.actualizado = Date.now();
    j.actualizadoPor = this.usuario;
    this.datos.jornadas[id] = j;
    this.persistir();
    (this.oyentes.get(id) || []).forEach((cb) => cb(structuredClone(j)));
  }

  async reemplazarJornada(id, j) {
    this.datos.jornadas[id] = { ...j, id, actualizado: Date.now(), actualizadoPor: this.usuario };
    this.persistir();
  }

  async borrarJornada(id) {
    delete this.datos.jornadas[id];
    this.persistir();
  }

  // Guarda muchas jornadas juntas (importar historial). Reemplaza las que ya existan.
  async importarJornadas(lista) {
    lista.forEach((j) => {
      this.datos.jornadas[j.id] = { ...j, actualizado: Date.now(), actualizadoPor: this.usuario };
    });
    this.persistir();
  }

  escucharJornada(id, cb) {
    if (!this.oyentes.has(id)) this.oyentes.set(id, new Set());
    this.oyentes.get(id).add(cb);
    return () => this.oyentes.get(id).delete(cb);
  }

  async borrarTodo() {
    this.datos = { config: null, jornadas: {} };
    this.persistir();
  }
}

// ── Firebase ───────────────────────────────────────────────────────────────
export class FirebaseStore {
  constructor() {
    this.modo = 'firebase';
    this.usuario = '';
  }

  static iniciarApp() {
    const fb = window.firebase;
    if (!fb) throw new Error('No se pudo cargar Firebase (¿sin internet la primera vez?)');
    if (!fb.apps.length) {
      fb.initializeApp(firebaseConfig);
      // Guarda en el equipo: si se corta internet se sigue trabajando.
      fb.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});
    }
    return fb;
  }

  async init(user) {
    const fb = FirebaseStore.iniciarApp();
    this.fb = fb;
    this.db = fb.firestore();
    this.usuario = (user && (user.email || user.uid)) || '';
  }

  col() {
    return this.db.collection(COLECCION_JORNADAS);
  }

  async getConfig() {
    const ref = this.db.collection(COLECCION_CONFIG).doc('general');
    const snap = await ref.get();
    if (!snap.exists) {
      const cfg = configInicial();
      await ref.set(cfg);
      return cfg;
    }
    return completarConfig(snap.data());
  }

  async saveConfig(cfg) {
    await this.db.collection(COLECCION_CONFIG).doc('general').set(cfg);
  }

  async getJornadas(desde, hasta) {
    const snap = await this.col().where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  }

  async getJornada(id) {
    const snap = await this.col().doc(id).get();
    return snap.exists ? { ...snap.data(), id } : null;
  }

  async patchJornada(id, cambios) {
    const ts = this.fb.firestore.FieldValue.serverTimestamp();
    // set + merge solo pisa los campos que vienen en "cambios"
    await this.col().doc(id).set({ ...cambios, actualizado: ts, actualizadoPor: this.usuario }, { merge: true });
  }

  async reemplazarJornada(id, j) {
    const ts = this.fb.firestore.FieldValue.serverTimestamp();
    const datos = { ...j, actualizado: ts, actualizadoPor: this.usuario };
    delete datos.id;
    await this.col().doc(id).set(datos);
  }

  async borrarJornada(id) {
    await this.col().doc(id).delete();
  }

  // Guarda muchas jornadas juntas (importar historial), de a 400 por tanda.
  async importarJornadas(lista) {
    const ts = this.fb.firestore.FieldValue.serverTimestamp();
    for (let i = 0; i < lista.length; i += 400) {
      const lote = this.db.batch();
      lista.slice(i, i + 400).forEach((j) => {
        const datos = { ...j, actualizado: ts, actualizadoPor: this.usuario };
        delete datos.id;
        lote.set(this.col().doc(j.id), datos);
      });
      await lote.commit();
    }
  }

  escucharJornada(id, cb) {
    return this.col().doc(id).onSnapshot(
      (snap) => cb(snap.exists ? { ...snap.data(), id } : null),
      () => {}
    );
  }
}
