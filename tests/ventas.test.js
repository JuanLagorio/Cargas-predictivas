import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigoDe, idsEnlazados, mismoReparto, sumarVentas } from '../js/ventas.js';
import { productosIniciales } from '../js/catalogo.js';

const productos = productosIniciales();

test('cada producto de Registro de Ventas apunta a un código que existe en la grilla', () => {
  const codigos = new Set(productos.map((p) => p.codigo));
  ['Lavandina 10L', 'Detergente Líquido ECO 10L', 'Perfumador 1/2L', 'Microfibras (5 unid.)',
    'Papel Higiénico Jumbo 500 (funda 8 rollos)'].forEach((n) => {
    assert.ok(codigos.has(codigoDe(n)), n);
  });
  assert.equal(codigoDe('Lavandina 10L'), '3');
  assert.equal(codigoDe('lavandina 10 l'), '3'); // sin importar mayúsculas ni espacios
  assert.equal(codigoDe('Producto Nuevo 3L'), null); // no está en la planilla
});

test('suma las ventas por producto de la planilla y aparta lo que no está en la grilla', () => {
  const ventas = [
    { cliente: 'A', items: [{ producto: 'Lavandina 10L', cantidad: 2 }, { producto: 'Guantes Negros (10 pares)', cantidad: 1 }] },
    { cliente: 'B', items: [{ producto: 'Lavandina 10L', cantidad: '3' }, { producto: 'Guantes Amarillos (10 pares)', cantidad: 2 }] },
    { cliente: 'C', items: [{ producto: 'Producto Nuevo 3L', cantidad: 1 }, { producto: 'Vinagre 5L', cantidad: 0 }] }
  ];
  const r = sumarVentas(ventas, productos);
  assert.deepEqual(r.porProducto, { c3: 5, c124: 3 });
  assert.deepEqual(r.sinEnlazar, { 'Producto Nuevo 3L': 1 });
});

test('bolsas y dispensadores no tienen par en Registro de Ventas', () => {
  const enl = idsEnlazados(productos);
  assert.ok(enl.has('c3'));
  assert.ok(!enl.has('c138'));  // Bolsas
  assert.ok(!enl.has('c109'));  // Dispensador
});

test('el reparto se reconoce por el nombre', () => {
  assert.ok(mismoReparto('Reparto 1', { nombre: 'Reparto 1' }));
  assert.ok(mismoReparto('reparto  1', { nombre: 'Reparto 1' }));
  assert.ok(!mismoReparto('Reparto 1', { nombre: 'Reparto 2' }));
  assert.ok(!mismoReparto('', { nombre: 'Reparto 1' }));
});

test('Reparto 4 y 5 se llaman por la zona en Registro de Ventas', () => {
  assert.ok(mismoReparto('Punta Del Este', { nombre: 'Reparto 4' }));
  assert.ok(mismoReparto('Costa De Oro', { nombre: 'Reparto 5' }));
  assert.ok(mismoReparto('costa de oro', { nombre: 'Costa De Oro' })); // si se renombra acá, igual anda
  assert.ok(!mismoReparto('Costa De Oro', { nombre: 'Reparto 4' }));
  assert.ok(!mismoReparto('Punta Del Este', { nombre: 'Reparto 1' }));
});
