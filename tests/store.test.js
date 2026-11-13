import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinVacios } from '../js/store.js';

// En Firebase, un set con merge que trae { items: {} } borra TODOS los productos.
// Pasó el 2026-11-13: al cerrar la jornada (solo cambia "pasos") se borró la planilla.
test('cerrar la jornada no manda items vacío', () => {
  assert.deepEqual(sinVacios({ pasos: { cierre: '2026-11-13T20:00:00Z' }, items: {} }),
    { pasos: { cierre: '2026-11-13T20:00:00Z' } });
});

test('saca objetos vacíos anidados pero deja los valores', () => {
  assert.deepEqual(sinVacios({ items: { c1: {}, c2: { salida: 3 } }, datos: {}, notas: '' }),
    { items: { c2: { salida: 3 } }, notas: '' });
});

test('deja null (reabrir borra el cierre) y el 0', () => {
  assert.deepEqual(sinVacios({ pasos: { cierre: null }, items: { c1: { vuelta: 0, recarga: null } } }),
    { pasos: { cierre: null }, items: { c1: { vuelta: 0, recarga: null } } });
});

test('nada para guardar → objeto vacío', () => {
  assert.deepEqual(sinVacios({ items: {}, pasos: {} }), {});
});
