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

// ── Temporada ──────────────────────────────────────────────────────────────
import { predecirJornada, factorTemporada, rangoAnioAnterior } from '../js/predict.js';
import { rangosFaltantes, unirRangos } from '../js/util.js';

// martes de noviembre: venden 10 de 'a' y 10 de 'b' (salen 8, recargan 4, vuelven 2).
// Salen con 8 para que el surtido mínimo no tape lo que hace la temporada.
const vende10 = () => ({ salida: 8, recarga: 4, vuelta: 2 });
const martesNov = ['2026-11-24', '2026-11-17', '2026-11-10', '2026-11-03']
  .map((f) => jornada(f, { a: vende10(), b: vende10() }));

// Año pasado, de lunes a viernes: 'a' vende 10 por jornada y 15 en diciembre (+50 %);
// 'b' vende 10 todo el tiempo; 'poco' vende 1 y 2 en diciembre.
function anioPasado() {
  const out = [];
  for (let f = '2025-09-15'; f <= '2026-01-31'; f = sumarDias(f, 1)) {
    const dow = diaSemana(f);
    if (dow === 0 || dow === 6) continue;
    const dic = f >= '2025-12-01' && f <= '2025-12-31';
    out.push(jornada(f, {
      a: { salida: dic ? 17 : 12, vuelta: 2 },
      b: { salida: 12, vuelta: 2 },
      poco: { salida: dic ? 3 : 2, vuelta: 1 }
    }));
  }
  return out;
}
const productosAB = [{ id: 'a' }, { id: 'b' }];

test('temporada: sin planillas del año pasado, no corrige nada', () => {
  const p = predecirJornada(martesNov, productosAB, 'r1', '2026-12-15', { margen: 0 });
  assert.equal(p.a.temporada, 1);
  assert.equal(p.a.sugerido, 10);
});

test('temporada: cada producto aprende la suya del año pasado', () => {
  const p = predecirJornada([...anioPasado(), ...martesNov], productosAB, 'r1', '2026-12-15', { margen: 0 });
  assert.ok(p.a.temporada > 1.3 && p.a.temporada < 1.5, 'a sube en diciembre: ' + p.a.temporada);
  assert.ok(p.b.temporada >= 1 && p.b.temporada < 1.1, 'b casi no cambia: ' + p.b.temporada);
  assert.ok(p.a.sugerido >= 13);
  assert.match(p.a.texto, /año pasado en estas fechas/);
});

test('temporada: un producto que vende poco se apoya en lo que hizo el reparto entero', () => {
  const todas = [...anioPasado(), ...martesNov];
  const t = factorTemporada(todas, 'r1', '2026-12-15', martesNov.map((j) => j.fecha));
  assert.equal(t.hay, true);
  // 'poco' pasó de 1 a 2 (×2) pero con tan pocas unidades no se le cree del todo
  const f = t.de('poco');
  assert.ok(f > t.reparto && f < 1.6, 'poco: ' + f + ' reparto: ' + t.reparto);
});

test('temporada: en enero baja lo que había subido diciembre', () => {
  const martesDic = ['2026-12-29', '2026-12-22', '2026-12-15', '2026-12-08']
    .map((f) => jornada(f, { a: { salida: 8, recarga: 9, vuelta: 2 }, b: vende10() }));
  const p = predecirJornada([...anioPasado(), ...martesDic], productosAB, 'r1', '2027-01-05', { margen: 0 });
  assert.ok(p.a.temporada < 0.9, 'a baja en enero: ' + p.a.temporada);
  assert.ok(p.b.temporada > 0.95, 'b casi no cambia: ' + p.b.temporada);
});

test('temporada: con el año pasado incompleto no corrige', () => {
  const soloDic = ['2025-12-01', '2025-12-02', '2025-12-03', '2025-12-04']
    .map((f) => jornada(f, { a: { salida: 20, vuelta: 0 } }));
  const t = factorTemporada([...soloDic, ...martesNov], 'r1', '2026-12-01', martesNov.map((j) => j.fecha));
  assert.equal(t.hay, false);
  assert.equal(t.de('a'), 1);
});

test('temporada: el rango del año pasado cae 52 semanas atrás', () => {
  const [d, h] = rangoAnioAnterior('2026-12-01', 8);
  assert.equal(diaSemana(sumarDias(h, -14)), diaSemana('2026-12-01'));
  assert.equal(d, '2025-09-23');
  assert.equal(h, '2025-12-16');
});

test('rangos: solo pide lo que falta y junta los que se tocan', () => {
  const c = [{ desde: '2026-07-20', hasta: '2026-12-02' }];
  assert.deepEqual(rangosFaltantes(c, '2026-09-01', '2026-11-30'), []);
  assert.deepEqual(rangosFaltantes(c, '2025-09-19', '2025-12-16'), [['2025-09-19', '2025-12-16']]);
  assert.deepEqual(rangosFaltantes(c, '2026-07-01', '2026-12-10'),
    [['2026-07-01', '2026-07-19'], ['2026-12-03', '2026-12-10']]);
  assert.deepEqual(unirRangos([...c, { desde: '2025-09-19', hasta: '2025-12-16' }, { desde: '2026-12-03', hasta: '2026-12-09' }]),
    [{ desde: '2025-09-19', hasta: '2025-12-16' }, { desde: '2026-07-20', hasta: '2026-12-09' }]);
});
