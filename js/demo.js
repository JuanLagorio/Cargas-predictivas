// ── Datos de ejemplo (solo para el modo prueba) ────────────────────────────
// Inventa 8 semanas de planillas para dos repartos, de lunes a sábado.
// Las primeras 5 semanas simulan la carga "a ojo" (como se hace hoy en papel);
// las últimas 3 simulan que ya se usa la app: la salida sale de la predicción
// y la recarga cubre lo que faltó. Así se ve cómo mejora con el uso.

import { predecirProducto, historialDe } from './predict.js';
import { hoyISO, sumarDias, diaSemana, jornadaId } from './util.js';

function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACTOR_DIA = [0, 1.2, 0.9, 1.0, 1.1, 1.3, 0.6]; // dom..sáb

export function generarDemo(config) {
  const azar = generador(20261109);
  const hoy = hoyISO();
  const inicio = sumarDias(hoy, -56);
  const productos = config.productos.filter((p) => p.activo);
  const opts = config.prediccion;
  const ahora = new Date().toISOString();

  // Cuánto vende cada reparto de cada producto en un día normal
  const ritmo = {};
  config.repartos.forEach((r, ri) => {
    ritmo[r.id] = {};
    productos.forEach((p) => {
      const x = azar();
      let base = 0;
      if (x < 0.25) base = 0;                       // casi no se vende en este reparto
      else if (x < 0.55) base = 1 + azar() * 3;     // poco
      else if (x < 0.85) base = 4 + azar() * 8;     // normal
      else base = 12 + azar() * 14;                 // mucho
      if (p.cat === 'limpieza' || p.cat === 'lavado') base *= 1.3;
      ritmo[r.id][p.id] = base * (ri === 0 ? 1 : 0.8);
    });
  });

  const jornadas = [];
  const desdeApp = sumarDias(hoy, -21);

  for (let f = inicio; f < hoy; f = sumarDias(f, 1)) {
    const dow = diaSemana(f);
    if (dow === 0) continue;
    config.repartos.forEach((r) => {
      const usaApp = f >= desdeApp;
      const hist = usaApp ? historialDe(jornadas, r.id, f, opts.semanas) : null;
      const items = {};
      productos.forEach((p) => {
        const media = ritmo[r.id][p.id] * FACTOR_DIA[dow];
        let demanda = Math.max(0, Math.round(media * (0.7 + azar() * 0.6)));
        if (media === 0 && azar() < 0.05) demanda = 1;

        let salida, pred = null;
        if (usaApp) {
          pred = predecirProducto(hist, p.id, f, opts).sugerido;
          salida = pred == null ? Math.round(media * 1.2) : pred;
        } else {
          // a ojo: a veces de más, a veces de menos
          salida = Math.max(0, Math.round(media * (0.8 + azar() * 0.6)));
        }
        let recarga = 0;
        if (demanda > salida) {
          const pedidos = demanda - salida;
          recarga = azar() < 0.85 ? pedidos : Math.max(0, pedidos - 1);
        }
        const vendido = Math.min(demanda, salida + recarga);
        const vuelta = salida + recarga - vendido;
        if (!salida && !recarga && pred == null) return;
        let fact = vendido;
        // algún error de facturación en las últimas 2 semanas, para ver el control
        if (vendido > 0 && f >= sumarDias(hoy, -14) && azar() < 0.025) fact = vendido - 1;
        const it = { salida, recarga, vuelta, fact };
        if (pred != null) it.pred = pred;
        items[p.id] = it;
      });
      jornadas.push({
        id: jornadaId(f, r.id), fecha: f, repartoId: r.id, items,
        pasos: { salida: ahora, vuelta: ahora, cierre: ahora },
        notas: '', origen: 'ejemplo'
      });
    });
  }
  return jornadas;
}
