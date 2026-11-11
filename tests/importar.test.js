import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerHistorialCSV, leerFacturacion, buscarProducto, aCSV, fechaDesdeTexto } from '../js/importar.js';
import { configInicial } from '../js/catalogo.js';

const cfg = configInicial();

test('el catálogo es el de la grilla: 64 productos con código (63 impresos + Guantes agregado a mano), en el orden del papel', () => {
  assert.equal(cfg.productos.length, 64);
  assert.equal(cfg.productos[0].codigo, '1');
  assert.equal(cfg.productos[1].codigo, '10');
  assert.equal(cfg.productos[2].codigo, '109');
  assert.equal(new Set(cfg.productos.map((p) => p.codigo)).size, 64);
});

test('reconoce productos por código (como en la grilla y la facturación)', () => {
  assert.equal(buscarProducto('10', cfg.productos).id, 'c10');
  assert.equal(buscarProducto('43_43', cfg.productos).id, 'c43');   // así viene en la e-Factura
  assert.equal(buscarProducto('1185/1310', cfg.productos).id, 'c1185');
});

test('reconoce productos por nombre + medida, sin importar tildes ni mayúsculas', () => {
  assert.equal(buscarProducto('cera al agua 5L', cfg.productos).id, 'c10');
  assert.equal(buscarProducto('SODA CAUSTICA 5 L', cfg.productos).id, 'c42');
  assert.equal(buscarProducto('Lavandina', cfg.productos).id, 'c3');            // una sola medida
  assert.equal(buscarProducto('Multiuso Cítrico', cfg.productos), null);        // ambiguo: 5L o 10L
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
    '07/10/2026;Reparto 3;1;12;;5;',
    '07/10/2026;Reparto 3;Lavandina;8;;4;',
    '07/10/2026;Reparto 9;Lavandina;8;0;1;7',
    '07/10/2026;Reparto 3;Producto inventado;1;;;'
  ].join('\n');
  const r = leerHistorialCSV(csv, cfg);
  assert.equal(r.jornadas.length, 2);
  assert.equal(r.repartosNuevos.length, 1);
  assert.equal(r.repartosNuevos[0].nombre, 'Reparto 9');
  assert.equal(r.errores.length, 1);
  const j = r.jornadas.find((x) => x.repartoId === 'r3');
  assert.deepEqual(j.items.c1, { salida: 12, vuelta: 5 });
  assert.deepEqual(j.items.c3, { salida: 8, vuelta: 4 });
  assert.ok(j.pasos.cierre);
});

test('avisa si faltan columnas obligatorias', () => {
  const r = leerHistorialCSV('fecha,producto\n2026-10-06,Lavandina', cfg);
  assert.ok(r.errores.some((e) => e.includes('reparto')));
});

test('pegar facturación: suma cantidades y separa lo que no reconoce', () => {
  const r = leerFacturacion('Producto\tCantidad\nLavandina\t10\n46\t3\nLavandina\t2\nCosa rara\t4', cfg.productos);
  assert.deepEqual(r.encontrados, { c3: 12, c46: 3 });
  assert.deepEqual(r.noReconocidos, ['Cosa rara\t4']);
});

test('exportar a CSV y volver a importar da lo mismo', () => {
  // la coma de "1 × 1,20" rompería el CSV sin comillas: por eso se exporta con comillas
  const j = [{ fecha: '2026-10-06', repartoId: 'r3', items: { c138: { salida: 5, recarga: 1, vuelta: 0, fact: 6 } } }];
  const salida = aCSV(j, cfg);
  assert.ok(salida.includes('"Bolsas 1 × 1,20"'));
  const r = leerHistorialCSV(salida, cfg);
  assert.equal(r.errores.length, 0);
  assert.deepEqual(r.jornadas[0].items.c138, { salida: 5, recarga: 1, vuelta: 0, fact: 6 });
});

test('config guardada: los productos sin foto toman la del catálogo, salvo si se quitó a propósito', async () => {
  const { completarConfig } = await import('../js/store.js');
  const guardada = configInicial();
  guardada.productos = guardada.productos.map((p) =>
    p.id === 'c1' ? { ...p, foto: '' } : p.id === 'c43' ? { ...p, foto: '', sinFoto: true } : p);
  const c = completarConfig(guardada);
  assert.equal(c.productos.find((p) => p.id === 'c1').foto, 'fotos/shampoo-industrial.jpg');
  assert.equal(c.productos.find((p) => p.id === 'c43').foto, '');
});
