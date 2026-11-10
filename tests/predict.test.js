import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predecirProducto, historialDe, evaluar } from '../js/predict.js';
import { totales, estado, controlFacturacion, filaProducto } from '../js/calc.js';
import { sumarDias, diaSemana } from '../js/util.js';

// 2026-11-10 es martes
const MARTES = '2026-11-10';

function jornada(fecha, items, pasos = { salida: 1, vuelta: 1 }, repartoId = 'r1') {
  return { fecha, repartoId, items, pasos };
}

test('2026-11-10 es martes (fechas en hora local)', () => {
  assert.equal(diaSemana(MARTES), 2);
  assert.equal(sumarDias(MARTES, -7), '2026-11-03');
});

test('cuentas de una fila: vendido y diferencia con facturación', () => {
  const j = jornada('2026-11-03', { a: { salida: 10, recarga: 2, vuelta: 3, fact: 9 } });
  const f = filaProducto(j, 'a');
  assert.equal(f.cargado, 12);
  assert.equal(f.vendido, 9);
  assert.equal(f.diferencia, 0);
});

test('sin vuelta contada, lo vendido queda pendiente', () => {
  const j = jornada('2026-11-03', { a: { salida: 10 } }, { salida: 1 });
  assert.equal(filaProducto(j, 'a').vendido, null);
  assert.equal(estado(j), 'ruta');
});

test('al confirmar la vuelta, lo que no se anotó cuenta como 0 (se vendió todo)', () => {
  const j = jornada('2026-11-03', { a: { salida: 10, recarga: 1 } });
  assert.equal(filaProducto(j, 'a').vendido, 11);
});

test('control: detecta productos que no coinciden con facturación', () => {
  const j = jornada('2026-11-03', {
    a: { salida: 10, vuelta: 2, fact: 8 },   // coincide
    b: { salida: 5, vuelta: 0, fact: 4 },    // vendió 5, facturó 4
    c: { salida: 3, vuelta: 1 }              // vendió 2, sin facturar → cuenta 0
  });
  const c = controlFacturacion(j);
  assert.equal(c.tipo, 'dif');
  assert.deepEqual(c.t.diferencias.map((d) => [d.id, d.diferencia]), [['b', 1], ['c', 2]]);
});

test('control: si no hay nada facturado todavía, avisa en vez de marcar diferencias', () => {
  const j = jornada('2026-11-03', { a: { salida: 10, vuelta: 2 } });
  assert.equal(controlFacturacion(j).tipo, 'sin-fact');
});

test('totales detectan error de carga (volvió más de lo que salió)', () => {
  const j = jornada('2026-11-03', { a: { salida: 2, vuelta: 5 } });
  assert.equal(totales(j).errores.length, 1);
});

test('predicción usa el mismo día de la semana cuando hay datos', () => {
  const hist = [
    jornada('2026-11-03', { a: { salida: 14, vuelta: 2 } }),   // martes: vendió 12
    jornada('2026-10-27', { a: { salida: 13, vuelta: 1 } }),   // martes: 12
    jornada('2026-10-20', { a: { salida: 14, vuelta: 2 } }),   // martes: 12
    jornada('2026-11-05', { a: { salida: 40, vuelta: 0 } })    // jueves: no debe influir
  ];
  const h = historialDe(hist, 'r1', MARTES, 8);
  const p = predecirProducto(h, 'a', MARTES, { margen: 10 });
  assert.equal(p.base, 'dia');
  assert.equal(p.n, 3);
  assert.ok(Math.abs(p.media - 12) < 1e-9);
  assert.equal(p.sugerido, 13); // 12 + 10 %
});

test('predicción: si no hay suficientes días iguales, usa todos los días', () => {
  const hist = [
    jornada('2026-11-05', { a: { salida: 10, vuelta: 0 } }),
    jornada('2026-11-04', { a: { salida: 10, vuelta: 4 } })
  ];
  const p = predecirProducto(historialDe(hist, 'r1', MARTES, 8), 'a', MARTES, {});
  assert.equal(p.base, 'todos');
  assert.equal(p.n, 2);
  assert.ok(p.sugerido >= 6);
});

test('predicción: si se agotó, se asume que se podía vender un poco más', () => {
  const hist = [
    jornada('2026-11-03', { a: { salida: 10, vuelta: 0 } }),
    jornada('2026-10-27', { a: { salida: 10, vuelta: 0 } })
  ];
  const p = predecirProducto(historialDe(hist, 'r1', MARTES, 8), 'a', MARTES, { margen: 0 });
  assert.equal(p.muestras[0].agotado, true);
  assert.equal(p.sugerido, 11);
});

test('predicción: si se agotó pero hubo recarga, los pedidos ya están contados (no suma extra)', () => {
  const hist = [
    jornada('2026-11-03', { a: { salida: 8, recarga: 2, vuelta: 0 } }),
    jornada('2026-10-27', { a: { salida: 8, recarga: 2, vuelta: 0 } })
  ];
  const p = predecirProducto(historialDe(hist, 'r1', MARTES, 8), 'a', MARTES, { margen: 0 });
  assert.equal(p.sugerido, 10);
});

test('predicción: respeta el surtido mínimo con el que siempre sale', () => {
  // siempre sale 1 cera y casi nunca se vende: igual se sugiere 1
  const hist = ['2026-11-03', '2026-10-27', '2026-10-20', '2026-10-13']
    .map((f) => jornada(f, { cera: { salida: 1, vuelta: 1 }, panos: { salida: 3, vuelta: 2 } }));
  const h = historialDe(hist, 'r1', MARTES, 8);
  const cera = predecirProducto(h, 'cera', MARTES, {});
  assert.equal(cera.sugerido, 1);
  assert.match(cera.texto, /Siempre sale con al menos 1/);
  assert.equal(predecirProducto(h, 'panos', MARTES, {}).sugerido, 3); // vende 1, sale con 3
});

test('predicción: producto que casi nunca se vende sugiere 0', () => {
  const hist = ['2026-11-03', '2026-10-27', '2026-10-20', '2026-10-13', '2026-10-06']
    .map((f, i) => jornada(f, i === 4 ? { a: { salida: 1, vuelta: 0 } } : {}));
  const p = predecirProducto(historialDe(hist, 'r1', MARTES, 8), 'a', MARTES, {});
  assert.equal(p.sugerido, 0);
});

test('predicción: ignora otros repartos, jornadas abiertas y muy viejas', () => {
  const hist = [
    jornada('2026-11-03', { a: { salida: 50 } }, { salida: 1 }),           // sin vuelta
    jornada('2026-10-27', { a: { salida: 50, vuelta: 0 } }, undefined, 'r2'), // otro reparto
    jornada('2026-06-02', { a: { salida: 50, vuelta: 0 } })                  // muy vieja
  ];
  const p = predecirProducto(historialDe(hist, 'r1', MARTES, 8), 'a', MARTES, {});
  assert.equal(p.sugerido, null);
  assert.equal(p.base, 'sin-datos');
});

test('predicción: la jornada más reciente pesa más', () => {
  const hist = [
    jornada('2026-11-03', { a: { salida: 20, vuelta: 0 } }),
    jornada('2026-10-27', { a: { salida: 11, vuelta: 1 } }),
    jornada('2026-10-20', { a: { salida: 11, vuelta: 1 } })
  ];
  const p = predecirProducto(historialDe(hist, 'r1', MARTES, 8), 'a', MARTES, { margen: 0 });
  const promedioSimple = (22 + 10 + 10) / 3;
  assert.ok(p.media > promedioSimple);
});

test('evaluar: mide qué tan cerca estuvo la predicción', () => {
  const js = [
    jornada('2026-11-03', {
      a: { pred: 10, salida: 10, vuelta: 1 },             // vendió 9 → cerca
      b: { pred: 5, salida: 5, recarga: 4, vuelta: 0 }    // vendió 9 → faltaron 4
    })
  ];
  const r = evaluar(js);
  assert.equal(r.lineas, 2);
  assert.equal(r.cerca, 1);
  assert.equal(r.falto, 4);
  assert.equal(r.sobro, 1);
  assert.equal(r.recarga, 4);
});
