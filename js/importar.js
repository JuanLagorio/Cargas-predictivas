// ── Importar historial y facturación ───────────────────────────────────────
// Formato CSV para el historial (una fila por producto y día; sirve con
// coma, punto y coma o tabulación, así se puede pegar directo desde Excel):
//
//   fecha,reparto,producto,salida,recarga,vuelta,facturado
//   2026-10-06,Reparto 1,Limpiador Multiuso 5L,12,2,3,11
//
// La fecha puede ser 2026-10-06 o 06/10/2026. El producto se reconoce por
// nombre + medida o por su código. Recarga, vuelta y facturado pueden ir vacíos.

import { normalizar, num, jornadaId, idAleatorio } from './util.js';

export function claveProducto(p) {
  return normalizar(p.nombre + ' ' + (p.medida || ''));
}

export function buscarProducto(texto, productos) {
  const t = normalizar(texto);
  if (!t) return null;
  // primero por código (el de la grilla y la facturación), después por nombre
  const cod = String(texto).trim().split(/[\s/_]/)[0];
  let p = /^\d+$/.test(cod) ? productos.find((x) => x.codigo === cod) : null;
  if (p) return p;
  p = productos.find((x) => normalizar(x.id) === t || claveProducto(x) === t);
  if (p) return p;
  p = productos.find((x) => (x.alias || []).some((a) => normalizar(a) === t));
  if (p) return p;
  const porNombre = productos.filter((x) => normalizar(x.nombre) === t);
  if (porNombre.length === 1) return porNombre[0];
  // nombre con la medida pegada de otra forma (ej. "multiuso 5 lts")
  const tSinL = t.replace(/(lts?|litros?)$/, 'l');
  p = productos.find((x) => claveProducto(x) === tSinL);
  return p || null;
}

function separador(linea) {
  if (linea.includes('\t')) return '\t';
  if (linea.includes(';')) return ';';
  return ',';
}

function partir(linea, sep) {
  // CSV simple con comillas
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') { q = !q; continue; }
    if (c === sep && !q) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function fechaDesdeTexto(t) {
  t = String(t || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  return null;
}

const COLUMNAS = {
  fecha: ['fecha', 'dia'],
  reparto: ['reparto', 'camion', 'ruta', 'repartidor'],
  producto: ['producto', 'articulo', 'codigo', 'descripcion'],
  salida: ['salida', 'sale', 'carga'],
  recarga: ['recarga', 'recargo'],
  vuelta: ['vuelta', 'vuelve', 'llegada', 'retorno', 'devolucion'],
  fact: ['facturado', 'factura', 'facturacion', 'fact']
};

// Devuelve { jornadas: [...], repartosNuevos: [...], errores: [...] }
export function leerHistorialCSV(texto, config) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { jornadas: [], repartosNuevos: [], errores: ['El archivo está vacío.'] };
  const sep = separador(lineas[0]);
  const cab = partir(lineas[0], sep).map(normalizar);
  const idx = {};
  Object.entries(COLUMNAS).forEach(([k, nombres]) => {
    idx[k] = cab.findIndex((c) => nombres.includes(c));
  });
  const errores = [];
  ['fecha', 'reparto', 'producto', 'salida'].forEach((k) => {
    if (idx[k] < 0) errores.push('Falta la columna "' + k + '" en la primera fila.');
  });
  if (errores.length) return { jornadas: [], repartosNuevos: [], errores };

  const repartos = [...config.repartos];
  const repartosNuevos = [];
  const porId = {};

  lineas.slice(1).forEach((linea, i) => {
    const c = partir(linea, sep);
    const nro = i + 2;
    const fecha = fechaDesdeTexto(c[idx.fecha]);
    if (!fecha) { errores.push('Fila ' + nro + ': fecha no válida "' + c[idx.fecha] + '"'); return; }
    const nomRep = c[idx.reparto];
    if (!nomRep) { errores.push('Fila ' + nro + ': falta el reparto'); return; }
    let rep = repartos.find((r) => normalizar(r.id) === normalizar(nomRep) || normalizar(r.nombre) === normalizar(nomRep));
    if (!rep) {
      rep = { id: idAleatorio('r'), nombre: nomRep, activo: true };
      repartos.push(rep);
      repartosNuevos.push(rep);
    }
    const prod = buscarProducto(c[idx.producto], config.productos);
    if (!prod) { errores.push('Fila ' + nro + ': no reconozco el producto "' + c[idx.producto] + '"'); return; }
    const id = jornadaId(fecha, rep.id);
    if (!porId[id]) {
      porId[id] = { id, fecha, repartoId: rep.id, items: {}, pasos: {}, origen: 'importado' };
    }
    const it = {};
    const val = (k) => (idx[k] >= 0 ? num(c[idx[k]]) : null);
    it.salida = val('salida') ?? 0;
    if (val('recarga') != null) it.recarga = val('recarga');
    if (val('vuelta') != null) it.vuelta = val('vuelta');
    if (val('fact') != null) it.fact = val('fact');
    porId[id].items[prod.id] = it;
  });

  const ahora = new Date().toISOString();
  const jornadas = Object.values(porId).map((j) => {
    // Una planilla histórica ya está terminada: salida, vuelta y cierre confirmados.
    j.pasos = { salida: ahora, vuelta: ahora, cierre: ahora };
    return j;
  });
  return { jornadas, repartosNuevos, errores };
}

// Pegar facturación desde Excel: "producto <tab> cantidad" por línea.
export function leerFacturacion(texto, productos) {
  const encontrados = {};
  const noReconocidos = [];
  texto.split(/\r?\n/).forEach((linea) => {
    if (!linea.trim()) return;
    const sep = separador(linea);
    let c = partir(linea, sep).filter((x) => x !== '');
    if (c.length < 2) {
      const m = linea.trim().match(/^(.*?)[\s:]+(-?\d+(?:[.,]\d+)?)$/);
      c = m ? [m[1], m[2]] : c;
    }
    if (c.length < 2) { noReconocidos.push(linea.trim()); return; }
    const cant = num(c[c.length - 1]);
    const nombre = c.slice(0, -1).join(' ');
    const p = cant == null ? null : buscarProducto(nombre, productos);
    if (!p) {
      // cabeceras como "producto / cantidad" no cuentan como error
      if (cant != null) noReconocidos.push(linea.trim());
      return;
    }
    encontrados[p.id] = (encontrados[p.id] || 0) + cant;
  });
  return { encontrados, noReconocidos };
}

export function aCSV(jornadas, config) {
  const nomRep = Object.fromEntries(config.repartos.map((r) => [r.id, r.nombre]));
  const nomProd = Object.fromEntries(config.productos.map((p) => [p.id, (p.nombre + ' ' + (p.medida || '')).trim()]));
  const filas = [['fecha', 'reparto', 'producto', 'prediccion', 'salida', 'recarga', 'vuelta', 'facturado']];
  jornadas
    .slice()
    .sort((a, b) => (a.fecha + a.repartoId).localeCompare(b.fecha + b.repartoId))
    .forEach((j) => {
      Object.entries(j.items || {}).forEach(([pid, it]) => {
        const v = (x) => (x == null ? '' : x);
        filas.push([j.fecha, nomRep[j.repartoId] || j.repartoId, nomProd[pid] || pid,
          v(it.pred), v(it.salida), v(it.recarga), v(it.vuelta), v(it.fact)]);
      });
    });
  return filas.map((f) => f.map((x) => (/[",;\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x)).join(',')).join('\n');
}
