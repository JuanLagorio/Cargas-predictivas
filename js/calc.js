// ── Cuentas de la planilla ─────────────────────────────────────────────────
// Para cada producto de una jornada:
//   cargado    = salida + recarga
//   vendido    = cargado − vuelta
//   diferencia = vendido − facturado   (si da 0, coincide con facturación)
//
// Una jornada guarda en `items` un objeto por producto:
//   { pred, salida, recarga, vuelta, fact }   (cualquiera puede faltar = null)
// y en `pasos` cuándo se confirmó cada etapa: { salida, vuelta, cierre }.

const n0 = (v) => (v == null ? 0 : Number(v) || 0);

export function vueltaContada(j) {
  return !!(j && j.pasos && (j.pasos.vuelta || j.pasos.cierre));
}

export function hayFacturacion(j) {
  if (!j || !j.items) return false;
  return Object.values(j.items).some((it) => it && it.fact != null);
}

export function cargado(it) {
  if (!it) return 0;
  return n0(it.salida) + n0(it.recarga);
}

// null = todavía no se sabe (falta contar la vuelta)
export function vendido(it, contada) {
  if (!it) return contada ? 0 : null;
  if (it.vuelta == null && !contada) return null;
  return cargado(it) - n0(it.vuelta);
}

// null = no hay facturación para comparar
export function diferencia(it, contada, conFact) {
  const v = vendido(it, contada);
  if (v == null) return null;
  if (!conFact) return null;
  const f = it && it.fact != null ? Number(it.fact) : 0;
  return v - f;
}

export function filaProducto(j, productoId) {
  const it = (j && j.items && j.items[productoId]) || {};
  const contada = vueltaContada(j);
  const conFact = hayFacturacion(j);
  return {
    pred: it.pred ?? null,
    salida: it.salida ?? null,
    recarga: it.recarga ?? null,
    vuelta: it.vuelta ?? null,
    fact: it.fact ?? null,
    cargado: cargado(it),
    vendido: vendido(it, contada),
    diferencia: diferencia(it, contada, conFact)
  };
}

// ¿El producto participa de la jornada? (se cargó, volvió o se facturó algo)
export function tieneMovimiento(it) {
  if (!it) return false;
  return n0(it.salida) > 0 || n0(it.recarga) > 0 || n0(it.vuelta) > 0 || n0(it.fact) > 0;
}

export function totales(j) {
  const t = {
    salida: 0, recarga: 0, cargado: 0, vuelta: 0, vendido: 0, fact: 0,
    productos: 0, diferencias: [], errores: [], prediccion: 0
  };
  if (!j || !j.items) return t;
  const contada = vueltaContada(j);
  const conFact = hayFacturacion(j);
  Object.entries(j.items).forEach(([id, it]) => {
    if (!it) return;
    t.prediccion += n0(it.pred);
    if (!tieneMovimiento(it)) return;
    t.productos++;
    t.salida += n0(it.salida);
    t.recarga += n0(it.recarga);
    t.cargado += cargado(it);
    t.vuelta += n0(it.vuelta);
    t.fact += n0(it.fact);
    const v = vendido(it, contada);
    if (v != null) {
      t.vendido += v;
      if (v < 0) t.errores.push({ id, vendido: v });
    }
    const d = diferencia(it, contada, conFact);
    if (d != null && d !== 0) t.diferencias.push({ id, diferencia: d, vendido: v, fact: n0(it.fact) });
  });
  t.contada = contada;
  t.conFact = conFact;
  return t;
}

export const ESTADOS = {
  pendiente: { label: 'Sin empezar',        tono: 'neutro', paso: 0 },
  borrador:  { label: 'Preparando salida',  tono: 'info',   paso: 0 },
  ruta:      { label: 'En la calle',        tono: 'info',   paso: 1 },
  vuelta:    { label: 'Falta el control',   tono: 'aviso',  paso: 3 },
  cerrada:   { label: 'Cerrada',            tono: 'bien',   paso: 3 }
};

export function estado(j) {
  if (!j) return 'pendiente';
  const p = j.pasos || {};
  if (p.cierre) return 'cerrada';
  if (p.vuelta) return 'vuelta';
  if (p.salida) return 'ruta';
  return 'borrador';
}

// Resultado del control contra facturación de una jornada
export function controlFacturacion(j) {
  const t = totales(j);
  if (!t.contada) return { tipo: 'pendiente', texto: 'Falta contar la vuelta', t };
  if (!t.conFact) return { tipo: 'sin-fact', texto: 'Falta cargar lo facturado', t };
  if (t.diferencias.length === 0) return { tipo: 'ok', texto: 'Coincide con facturación', t };
  const n = t.diferencias.length;
  return { tipo: 'dif', texto: n + (n === 1 ? ' producto no coincide' : ' productos no coinciden'), t };
}
