import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planillaImprimible, datosHoja, nombrePdf, htmlHojas, escalaParaUnaHoja } from '../js/hojas.js';

const HOY = '2026-11-12';

function jornada(fecha, items, pasos) {
  return { id: fecha + '_r1', fecha, repartoId: 'r1', items, pasos };
}

// App mínima: lo que usa datosHoja
function appCon(jornadas) {
  const cache = new Map(jornadas.map((j) => [j.id, j]));
  return {
    cache,
    config: {
      prediccion: { semanas: 8 },
      productos: [
        { id: 'a', codigo: '1', nombre: 'Limpiador', medida: '5L', orden: 1 },
        { id: 'b', codigo: '2', nombre: 'Lavandina', medida: '10L', orden: 2 }
      ]
    },
    async asegurarRango() {},
    async asegurarHistorial() {},
    jornadas: () => [...cache.values()],
    reparto: (id) => ({ id, nombre: 'Reparto 1' })
  };
}

test('hoja de carga: solo de hoy en adelante y sin vuelta contada', () => {
  assert.equal(planillaImprimible(null, HOY, HOY), 'carga');
  assert.equal(planillaImprimible(null, '2026-11-20', HOY), 'carga');
  assert.equal(planillaImprimible(jornada(HOY, {}, { salida: 1 }), HOY, HOY), 'carga');
  // un día pasado sin cerrar: ninguna
  assert.equal(planillaImprimible(null, '2026-11-11', HOY), null);
  assert.equal(planillaImprimible(jornada('2026-11-11', {}, { salida: 1 }), '2026-11-11', HOY), null);
  // hoy con la vuelta contada pero sin cerrar: ninguna (falta cerrar)
  assert.equal(planillaImprimible(jornada(HOY, {}, { salida: 1, vuelta: 1 }), HOY, HOY), null);
});

test('planilla completa: solo con la jornada cerrada (de cualquier día pasado o de hoy)', () => {
  const pasos = { salida: 1, vuelta: 1, cierre: 1 };
  assert.equal(planillaImprimible(jornada('2026-10-06', {}, pasos), '2026-10-06', HOY), 'completa');
  assert.equal(planillaImprimible(jornada(HOY, {}, pasos), HOY, HOY), 'completa');
});

test('la hoja de carga deja vuelta y diferencia en blanco aunque ya se hayan anotado', async () => {
  const j = jornada(HOY, { a: { salida: 10, recarga: 2, vuelta: 3 }, b: { salida: 5 } }, { salida: 1, vuelta: 1, cierre: 1 });
  const h = await datosHoja(appCon([j]), HOY, 'r1', 'carga');
  assert.equal(h.completa, false);
  assert.deepEqual(h.filas.map((f) => [f.salida, f.recarga, f.vuelta, f.diferencia]), [[10, 2, null, null], [5, 0, null, null]]);
  assert.equal(h.tot.vuelta, null);
  assert.equal(nombrePdf([h]), 'Hoja de carga Reparto 1 ' + HOY);
});

test('la hoja de carga impresa: título CARGA, cantidad y casillero, solo lo que hay que cargar', async () => {
  const j = jornada(HOY, { a: { salida: 10 }, b: { salida: 0 } }, { salida: 1 });
  const html = htmlHojas([await datosHoja(appCon([j]), HOY, 'r1', 'carga')]);
  assert.match(html, /<h1 class="hoja-titulo">Carga<\/h1>/);
  assert.match(html, />Cargado</);
  assert.doesNotMatch(html, /Recarga|Vuelta|Diferencia|>Salida</);
  assert.match(html, /Limpiador 5L/);
  assert.doesNotMatch(html, /Lavandina/); // salida 0: no se carga
  assert.equal((html.match(/class="tilde"/g) || []).length, 1);
});

test('la planilla completa trae salida, recarga, vuelta y diferencia', async () => {
  const j = jornada('2026-11-11', { a: { salida: 10, recarga: 2, vuelta: 3 }, b: { salida: 5 } }, { salida: 1, vuelta: 1, cierre: 1 });
  const h = await datosHoja(appCon([j]), '2026-11-11', 'r1', 'completa');
  assert.deepEqual(h.filas.map((f) => [f.salida, f.recarga, f.vuelta, f.diferencia]), [[10, 2, 3, 9], [5, 0, 0, 5]]);
  assert.deepEqual(h.tot, { salida: 15, recarga: 2, vuelta: 3, diferencia: 14, registrado: null });
  assert.equal(nombrePdf([h]), 'Planilla Reparto 1 2026-11-11');
  assert.doesNotMatch(htmlHojas([h]), /Reg\. ventas/); // sin Registro de Ventas, la hoja queda igual
});

test('planilla completa: entre paréntesis, lo anotado en Registro de Ventas', async () => {
  const j = jornada('2026-11-11', {
    a: { salida: 10, recarga: 2, vuelta: 3 },
    b: { salida: 5, vuelta: 5 },
    x: { salida: 4, vuelta: 1 }
  }, { salida: 1, vuelta: 1, cierre: 1 });
  const app = appCon([j]);
  app.config.productos.push(
    { id: 'x', codigo: '138', nombre: 'Bolsas', medida: '', orden: 3 },      // no está en Registro de Ventas
    { id: 'y', codigo: '3', nombre: 'Lavandina', medida: '10L', orden: 4 }   // sin movimiento ni ventas
  );
  app.ventasRegistradas = async () => ({ porProducto: { a: 8 }, sinEnlazar: {}, jornadas: 1, abiertas: 0, vendedores: ['Dilan'] });
  const h = await datosHoja(app, '2026-11-11', 'r1', 'completa');
  // los que no anotaron (b, aunque tuvo movimiento) van sin "(0)"
  assert.deepEqual(h.filas.map((f) => [f.p.id, f.diferencia, f.registrado]), [['a', 9, 8], ['b', 0, null], ['x', 3, null], ['y', 0, null]]);
  assert.equal(h.tot.registrado, 8);
  const html = htmlHojas([h]);
  assert.match(html, /<th class="c-n">Diferencia<\/th>/); // sin "(Reg. ventas)" en el título
  assert.doesNotMatch(html, /Reg\. ventas/);
  assert.match(html, /<td class="c-n">9 <span class="c-rv">\(8\)<\/span><\/td>/);
  assert.doesNotMatch(html, /\(0\)/);
});

test('cada planilla entra en una hoja: si es más larga, se achica lo justo', () => {
  assert.equal(escalaParaUnaHoja(800, 1000), 1);          // entra: no se toca
  assert.equal(escalaParaUnaHoja(1100, 1000), 0.88);      // se pasa: 970 / 1100
  assert.ok(escalaParaUnaHoja(2000, 1000) * 2000 <= 970); // con muchos productos, igual entra
  assert.equal(escalaParaUnaHoja(0, 1000), 1);
});
