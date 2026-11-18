// ── Predicción de la carga de salida ───────────────────────────────────────
//
// Idea: lo que conviene cargar mañana es lo que se suele VENDER ese día de la
// semana en ese reparto, más un pequeño margen de seguridad.
//
// 1. Se toman las jornadas cerradas del mismo reparto de las últimas N semanas.
// 2. De cada una se saca lo vendido = salida + recarga − vuelta.
//    Si volvió 0 (se agotó), se suma un poco: seguramente se podía vender más.
// 3. Si hay al menos 2 jornadas del mismo día de la semana (ej. martes), se usan
//    solo esas; si no, se usan todos los días.
// 4. Promedio ponderado: la jornada más reciente pesa más (×0,8 por cada paso atrás).
// 5. Sugerido = promedio + margen, donde margen = el mayor entre el % configurado
//    y media desviación (si las ventas varían mucho, se carga un poco más).
// 6. Si el producto casi nunca se vende (menos de 1 de cada 4 jornadas) se sugiere 0:
//    si alguien lo pide, va en la recarga.
// 7. Surtido mínimo: si en todas esas jornadas el producto salió, nunca se
//    sugiere menos que la menor cantidad con la que salió.
// 8. Temporada: cuando hay planillas del año pasado, cada producto se corrige
//    según cómo se movió en estas mismas fechas hace un año (ej. diciembre
//    contra noviembre). La aprende sola a medida que se juntan planillas.

import { vueltaContada, vendido, cargado } from './calc.js';
import { diaSemana, diasEntre, sumarDias, DIAS_PLURAL, fmt } from './util.js';

const DECAIMIENTO = 0.8;
const MAX_MUESTRAS = 6;

// Temporada
const ANIO = 364;         // 52 semanas atrás: cae el mismo día de la semana
const RADIO = 14;         // ± 2 semanas alrededor de cada fecha del año pasado
const MIN_ANIO = 3;       // jornadas del año pasado que hacen falta en cada tramo
const FACTOR_MIN = 0.5;
const FACTOR_MAX = 2;
const PESO_REPARTO = 3;   // unidades por jornada: debajo de eso, pesa más lo del reparto entero

export function historialDe(jornadas, repartoId, fecha, semanas) {
  const desde = semanas * 7;
  return jornadas
    .filter((j) => j.repartoId === repartoId && j.fecha < fecha && vueltaContada(j))
    .filter((j) => diasEntre(j.fecha, fecha) <= desde)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)); // más reciente primero
}

function muestra(j, productoId) {
  const it = j.items && j.items[productoId];
  const v = Math.max(0, vendido(it, true));
  const agotado = !!it && cargado(it) > 0 && (it.vuelta == null || Number(it.vuelta) === 0);
  // Si se agotó sin recarga, seguro hubo clientes que se quedaron sin producto.
  // Si hubo recarga, los pedidos ya están contados en lo vendido: no se suma nada.
  const sinRecarga = !it || !(Number(it.recarga) > 0);
  const extra = agotado && sinRecarga ? Math.max(1, Math.round(v * 0.1)) : 0;
  return { fecha: j.fecha, vendido: v, agotado, demanda: v + extra };
}

// Qué jornadas se usan para el promedio: las del mismo día de la semana si hay
// suficientes, si no todas. Son las mismas para todos los productos.
export function elegirJornadas(historial, fecha, minMuestras = 2) {
  const dow = diaSemana(fecha);
  const mismoDia = historial.filter((j) => diaSemana(j.fecha) === dow);
  const base = mismoDia.length >= minMuestras ? 'dia' : 'todos';
  return { base, elegidas: (base === 'dia' ? mismoDia : historial).slice(0, MAX_MUESTRAS) };
}

// ── Temporada ──────────────────────────────────────────────────────────────
// Cuando hay planillas del año pasado, cada producto se corrige según cómo se
// movió en estas mismas fechas hace 52 semanas, comparado con las fechas de
// donde sale el promedio. Ej.: el año pasado el shampoo vendió 15 por jornada
// en diciembre y 10 en las semanas de antes → este diciembre se espera ×1,5
// de lo que se viene vendiendo. Cada producto tiene su propia temporada.
//
// Los productos que venden poco tienen pocos datos para medirla: se acercan a
// lo que hizo el reparto entero (todos los productos juntos). Cuanto más vende
// un producto, más pesa su propia historia.
//
// Sin planillas del año pasado, no se corrige nada: el promedio igual sigue
// los cambios, porque las jornadas más recientes pesan más.

// Fechas del año pasado que hay que tener cargadas para medir la temporada.
export function rangoAnioAnterior(fecha, semanas) {
  return [sumarDias(fecha, -ANIO - semanas * 7 - RADIO), sumarDias(fecha, -ANIO + RADIO)];
}

// Lo vendido por jornada alrededor de una fecha: el reparto entero y cada producto.
function ventasAlrededor(jornadas, repartoId, centro) {
  const porProducto = {};
  let total = 0, n = 0;
  jornadas.forEach((j) => {
    if (j.repartoId !== repartoId || !vueltaContada(j) || !j.items) return;
    if (Math.abs(diasEntre(j.fecha, centro)) > RADIO) return;
    Object.entries(j.items).forEach(([pid, it]) => {
      const v = Math.max(0, vendido(it, true));
      total += v;
      porProducto[pid] = (porProducto[pid] || 0) + v;
    });
    n++;
  });
  if (n < MIN_ANIO) return null;
  return { total: total / n, de: (pid) => (porProducto[pid] || 0) / n };
}

const pesos = (n) => Array.from({ length: n }, (_, k) => Math.pow(DECAIMIENTO, k));
const suma = (xs) => xs.reduce((a, b) => a + b, 0);
const acotar = (f) => {
  const g = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, f));
  return Math.abs(g - 1) < 0.01 ? 1 : g;
};

// `fechas` = las jornadas del promedio (más reciente primero).
// Devuelve { hay, reparto, de(productoId) → factor }.
export function factorTemporada(jornadas, repartoId, fecha, fechas) {
  const sin = { hay: false, reparto: 1, de: () => 1 };
  if (!fechas.length) return sin;
  const entonces = ventasAlrededor(jornadas, repartoId, sumarDias(fecha, -ANIO));
  if (!entonces || !entonces.total) return sin;
  const w = pesos(fechas.length);
  const antes = [];
  fechas.forEach((f, k) => {
    const v = ventasAlrededor(jornadas, repartoId, sumarDias(f, -ANIO));
    if (v) antes.push({ peso: w[k], v });
  });
  // hace falta el año pasado de la mayor parte de las fechas del promedio
  const sw = suma(antes.map((a) => a.peso));
  if (sw < suma(w) / 2) return sin;
  const promAntes = (leer) => suma(antes.map((a) => a.peso * leer(a.v))) / sw;
  const totalAntes = promAntes((v) => v.total);
  if (!totalAntes) return sin;
  const reparto = entonces.total / totalAntes;
  const ya = {};
  return {
    hay: true,
    reparto: acotar(reparto),
    de(pid) {
      if (!(pid in ya)) {
        const a = entonces.de(pid);
        const b = promAntes((v) => v.de(pid));
        ya[pid] = acotar((a + PESO_REPARTO * reparto) / (b + PESO_REPARTO));
      }
      return ya[pid];
    }
  };
}

export function predecirProducto(historial, productoId, fecha, opts = {}) {
  const margenPct = opts.margen ?? 5;
  const dow = diaSemana(fecha);
  const fTemp = Number(opts.factorTemporada) > 0 ? Number(opts.factorTemporada) : 1;
  const { base, elegidas } = elegirJornadas(historial, fecha, opts.minMuestras ?? 2);

  if (elegidas.length === 0) {
    return { sugerido: null, base: 'sin-datos', n: 0, confianza: 'ninguna', muestras: [],
      texto: 'Todavía no hay jornadas anteriores de este reparto para calcular.' };
  }

  const muestras = elegidas.map((j) => muestra(j, productoId));
  let sw = 0, swx = 0;
  muestras.forEach((m, k) => {
    const w = Math.pow(DECAIMIENTO, k);
    sw += w;
    swx += w * m.demanda;
  });
  const mediaVendida = swx / sw;
  let sv = 0;
  muestras.forEach((m, k) => {
    sv += Math.pow(DECAIMIENTO, k) * Math.pow(m.demanda - mediaVendida, 2);
  });
  // la temporada mueve las dos cosas: lo que se espera vender y cuánto varía
  const media = mediaVendida * fTemp;
  const sd = Math.sqrt(sv / sw) * fTemp;
  const frecuencia = muestras.filter((m) => m.demanda > 0).length / muestras.length;

  let sugerido, margen = 0;
  if (frecuencia < 0.25) {
    sugerido = 0;
  } else {
    margen = Math.max(media * margenPct / 100, 0.5 * sd);
    sugerido = Math.max(1, Math.round(media + margen));
  }

  // Surtido mínimo: si en todas esas jornadas el producto salió, se respeta
  // la menor cantidad con la que salió (ej. siempre sale 1 cera o 3 paños,
  // aunque casi no se vendan). Probado con las planillas reales: evita la
  // mayoría de las faltas y igual se carga menos que a mano.
  const siempre = elegidas.every((j) => cargado(j.items && j.items[productoId]) > 0);
  const piso = siempre ? Math.min(...elegidas.map((j) => Number(j.items[productoId].salida) || 0)) : 0;
  const porPiso = piso > sugerido;
  if (porPiso) sugerido = piso;

  const n = muestras.length;
  const cv = media > 0 ? sd / media : 0;
  let confianza = 'baja';
  if (n >= 4 && cv <= 0.35) confianza = 'alta';
  else if (n >= 3 || (n >= 2 && cv <= 0.5)) confianza = 'media';

  const cuando = base === 'dia'
    ? 'Últimos ' + n + ' ' + DIAS_PLURAL[dow]
    : 'Últimas ' + n + ' jornadas (pocos ' + DIAS_PLURAL[dow] + ' anteriores)';
  const lista = muestras.map((m) => m.vendido + (m.agotado ? '*' : '')).join(', ');
  let texto = cuando + ' vendió: ' + lista + '.';
  if (muestras.some((m) => m.agotado)) texto += ' (* = se agotó, puede que se vendiera más)';
  if (porPiso) {
    texto += ' Siempre sale con al menos ' + piso + ', así que se sugiere ' + piso + '.';
  } else if (frecuencia < 0.25) {
    texto += ' Casi nunca se vende: si alguien lo pide, va en la recarga.';
  } else if (fTemp !== 1) {
    const pct = Math.round(Math.abs(fTemp - 1) * 100) + ' % ' + (fTemp > 1 ? 'más' : 'menos');
    texto += ' Promedio ' + fmt(mediaVendida, 1) + ' × ' + fmt(fTemp, 2) + ' por temporada = ' + fmt(media, 1) +
      ', + margen ' + fmt(margen, 1) + ' → ' + sugerido + '. Temporada: por cómo se vendió el año pasado en estas fechas, ' +
      'se espera ' + pct + ' que en las semanas anteriores.';
  } else {
    texto += ' Promedio ' + fmt(media, 1) + ' + margen ' + fmt(margen, 1) + ' → ' + sugerido + '.';
  }

  return { sugerido, media, mediaVendida, margen, sd, n, base, confianza, frecuencia, muestras, piso,
    temporada: fTemp, texto };
}

export function predecirJornada(jornadas, productos, repartoId, fecha, opts = {}) {
  const hist = historialDe(jornadas, repartoId, fecha, opts.semanas ?? 8);
  const { elegidas } = elegirJornadas(hist, fecha, opts.minMuestras ?? 2);
  const temporada = factorTemporada(jornadas, repartoId, fecha, elegidas.map((j) => j.fecha));
  const out = {};
  productos.forEach((p) => {
    out[p.id] = predecirProducto(hist, p.id, fecha, { ...opts, factorTemporada: temporada.de(p.id) });
  });
  return out;
}

// ── ¿Qué tan bien viene prediciendo? ───────────────────────────────────────
// Compara lo que se predijo (guardado en cada jornada) con lo que se vendió.
export function evaluar(jornadas) {
  const r = { jornadas: 0, lineas: 0, cerca: 0, falto: 0, sobro: 0, recarga: 0, vuelta: 0, vendido: 0 };
  jornadas.forEach((j) => {
    if (!vueltaContada(j) || !j.items) return;
    const conPred = Object.values(j.items).some((it) => it && it.pred != null);
    if (!conPred) return;
    r.jornadas++;
    Object.values(j.items).forEach((it) => {
      if (!it) return;
      const v = Math.max(0, vendido(it, true));
      r.recarga += Number(it.recarga) || 0;
      r.vuelta += Number(it.vuelta) || 0;
      r.vendido += v;
      if (it.pred == null) return;
      if (it.pred === 0 && v === 0) return; // nada que evaluar
      r.lineas++;
      const err = it.pred - v;
      if (Math.abs(err) <= Math.max(1, Math.round(v * 0.2))) r.cerca++;
      if (err < 0) r.falto += -err;
      else r.sobro += err;
    });
  });
  r.acierto = r.lineas ? r.cerca / r.lineas : null;
  return r;
}
