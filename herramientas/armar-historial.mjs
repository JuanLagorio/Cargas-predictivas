// Junta las transcripciones de escaneos/transcripcion/*.txt en historial.csv
// (el formato que importa la app) y revisa que cada fila cierre:
//   salida + recarga − vuelta = diferencia (lo vendido, anotado a mano en la hoja)
//
// Cada .txt tiene "fecha AAAA-MM-DD", "reparto Reparto N" y una línea por
// producto: código salida recarga vuelta diferencia  (x = tachado, ? = no se lee).
// Los escaneos y las transcripciones quedan en escaneos/, que no se sube a GitHub.
//
// Uso:  node herramientas/armar-historial.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productosIniciales } from '../js/catalogo.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const escaneos = join(aqui, '..', 'escaneos');
const dir = join(escaneos, 'transcripcion');
const codigos = new Set(productosIniciales().map((p) => p.codigo));

const filas = [['fecha', 'reparto', 'producto', 'salida', 'recarga', 'vuelta']];
const problemas = [];
const sinFecha = [];
const vistas = new Map(); // fecha|reparto → archivo (para detectar hojas repetidas)
let hojas = 0, lineas = 0;

for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
  const txt = readFileSync(join(dir, f), 'utf8');
  let fecha = null, reparto = null;
  const items = [];
  txt.split(/\r?\n/).forEach((l, i) => {
    const sinComentario = l.replace(/#.*$/, '').trim();
    if (!sinComentario) return;
    const [k, ...resto] = sinComentario.split(/\s+/);
    if (k === 'fecha') { fecha = resto[0]; return; }
    if (k === 'reparto') { reparto = resto.join(' '); return; }
    if (k === 'dia' || k === 'nota') return;
    const [s, r, v, d] = resto;
    items.push({ cod: k, s, r, v, d, linea: i + 1 });
  });
  if (!fecha || !reparto) { problemas.push(f + ': falta fecha o reparto'); continue; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    // sin fecha no sirve para predecir: queda afuera hasta que se sepa el día
    sinFecha.push(f + ' (' + fecha + ', ' + reparto + ', ' + items.length + ' filas)');
    continue;
  }
  const clave = fecha + '|' + reparto;
  if (vistas.has(clave)) problemas.push(f + ': misma fecha y reparto que ' + vistas.get(clave));
  vistas.set(clave, f);
  hojas++;
  const n = (x) => (x === undefined || x === '-' || x === 'x' ? 0 : Number(x));
  for (const it of items) {
    if (!codigos.has(it.cod)) problemas.push(f + ':' + it.linea + ' código desconocido ' + it.cod);
    const s = n(it.s), r = n(it.r), v = n(it.v);
    if ([s, r, v].some((x) => !Number.isFinite(x))) { problemas.push(f + ':' + it.linea + ' número no válido'); continue; }
    if (it.d !== undefined && it.d !== '?' && it.d !== '*' && s + r - v !== n(it.d)) {
      problemas.push(f + ':' + it.linea + ' cod ' + it.cod + ': ' + s + '+' + r + '-' + v + ' = ' + (s + r - v) + ' pero la hoja dice ' + it.d);
    }
    if (s + r - v < 0) problemas.push(f + ':' + it.linea + ' cod ' + it.cod + ': volvió más de lo que salió');
    filas.push([fecha, reparto, it.cod, s, r || '', v]);
    lineas++;
  }
}

writeFileSync(join(escaneos, 'historial.csv'), filas.map((f) => f.join(',')).join('\n') + '\n');
console.log(hojas + ' hojas, ' + lineas + ' filas → escaneos/historial.csv');
console.log(problemas.length ? problemas.length + ' para revisar:\n  ' + problemas.join('\n  ') : 'Todas las filas cierran.');
if (sinFecha.length) console.log('Afuera por no tener fecha:\n  ' + sinFecha.join('\n  '));
