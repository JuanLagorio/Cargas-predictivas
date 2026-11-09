import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerHistorialCSV, leerFacturacion, buscarProducto, aCSV, fechaDesdeTexto } from '../js/importar.js';
import { configInicial } from '../js/catalogo.js';

const cfg = configInicial();

test('reconoce productos por nombre + medida, sin importar tildes ni mayúsculas', () => {
  assert.equal(buscarProducto('limpiador multiuso 5L', cfg.productos).id, 'multiuso_5l');
  assert.equal(buscarProducto('SODA CAUSTICA LIQUIDA 10 L', cfg.productos).id, 'soda-caustica_10l');
  assert.equal(buscarProducto('Lavandina', cfg.productos).id, 'lavandina_10l'); // tiene una sola medida
  assert.equal(buscarProducto('Limpiador Multiuso', cfg.productos), null);     // ambiguo: 5L o 10L
  assert.equal(buscarProducto('multiuso_10l', cfg.productos).id, 'multiuso_10l');
});

test('fechas en formato uruguayo o ISO', () => {
  assert.equal(fechaDesdeTexto('6/10/2026'), '2026-10-06');
  assert.equal(fechaDesdeTexto('06-10-26'), '2026-10-06');
  assert.equal(fechaDesdeTexto('2026-10-06'), '2026-10-06');
  assert.equal(fechaDesdeTexto('ayer'), null);
});

test('importa un CSV pegado desde Excel (punto y coma) y crea repartos nuevos', () => {
  const csv = [
    'Fecha;Reparto;Producto;Salida;Recarga;Vuelta;Facturado',
    '06/10/2026;Reparto 1;Limpiador Multiuso 5L;12;2;3;11',
    '06/10/2026;Reparto 1;Lavandina;20;;4;16',
    '06/10/2026;Camión Este;Lavandina;8;0;1;7',
    '06/10/2026;Reparto 1;Producto inventado;1;;;'
  ].join('\n');
  const r = leerHistorialCSV(csv, cfg);
  assert.equal(r.jornadas.length, 2);
  assert.equal(r.repartosNuevos.length, 1);
  assert.equal(r.repartosNuevos[0].nombre, 'Camión Este');
  assert.equal(r.errores.length, 1);
  const j1 = r.jornadas.find((j) => j.repartoId === 'r1');
  assert.deepEqual(j1.items.multiuso_5l, { salida: 12, recarga: 2, vuelta: 3, fact: 11 });
  assert.deepEqual(j1.items.lavandina_10l, { salida: 20, vuelta: 4, fact: 16 });
  assert.ok(j1.pasos.cierre);
});

test('avisa si faltan columnas obligatorias', () => {
  const r = leerHistorialCSV('fecha,producto\n2026-10-06,Lavandina', cfg);
  assert.ok(r.errores.some((e) => e.includes('reparto')));
});

test('pegar facturación: suma cantidades y separa lo que no reconoce', () => {
  const r = leerFacturacion('Producto\tCantidad\nLavandina\t10\nLimpiador Multiuso 5L\t3\nLavandina\t2\nCosa rara\t4', cfg.productos);
  assert.deepEqual(r.encontrados, { lavandina_10l: 12, multiuso_5l: 3 });
  assert.deepEqual(r.noReconocidos, ['Cosa rara\t4']);
});

test('exportar a CSV y volver a importar da lo mismo', () => {
  // la coma de "29,5" rompería el CSV sin comillas: por eso se exporta con comillas
  const j = [{ fecha: '2026-10-06', repartoId: 'r1', items: { 'servilleta-mesa': { salida: 5, recarga: 1, vuelta: 0, fact: 6 } } }];
  const salida = aCSV(j, cfg);
  assert.ok(salida.includes('"Servilleta de Mesa 30 × 29,5"'));
  const r = leerHistorialCSV(salida, cfg);
  assert.equal(r.errores.length, 0);
  assert.deepEqual(r.jornadas[0].items['servilleta-mesa'], { salida: 5, recarga: 1, vuelta: 0, fact: 6 });
});
