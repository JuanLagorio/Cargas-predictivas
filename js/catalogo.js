// ── Catálogo inicial ───────────────────────────────────────────────────────
// Sale del catálogo de donasol.com.uy (mismos ids, categorías y fotos).
// Es solo el punto de partida: desde Ajustes se pueden agregar, renombrar
// u ocultar productos, y eso queda guardado en la base de datos.

// Miniaturas en /fotos (sacadas de las fotos del sitio, 128 px), así se ven sin internet.
const FOTOS = 'fotos/';

export const CATEGORIAS = [
  { id: 'limpieza', nombre: 'Limpieza' },
  { id: 'lavado',   nombre: 'Ropa y vajilla' },
  { id: 'higiene',  nombre: 'Higiene' },
  { id: 'aromas',   nombre: 'Aromas' },
  { id: 'autos',    nombre: 'Autos' },
  { id: 'textil',   nombre: 'Textil' },
  { id: 'papeles',  nombre: 'Papeles' },
  { id: 'otros',    nombre: 'Otros' }
];

// [categoría, id base, nombre, medidas (una por variante)]
const BASE = [
  ['limpieza', 'multiuso',               'Limpiador Multiuso',           ['5L', '10L']],
  ['limpieza', 'mulcit',                 'Multiuso Cítrico',             ['5L', '10L']],
  ['limpieza', 'desinfectante',          'Limpiador Desinfectante',      ['5L', '10L']],
  ['limpieza', 'amonio-cuaternario',     'Amonio Cuaternario',           ['5L']],
  ['limpieza', 'limpiavidrios',          'Limpia Vidrios',               ['2L']],
  ['limpieza', 'lavandina',              'Lavandina',                    ['10L']],
  ['limpieza', 'cremoso',                'Limpiador Cremoso',            ['750gr']],
  ['limpieza', 'desengrasante',          'Desengrasante',                ['5L']],
  ['limpieza', 'soda-caustica',          'Soda Cáustica Líquida',        ['5L', '10L']],
  ['limpieza', 'cera-pisos',             'Cera al Agua',                 ['5L']],
  ['limpieza', 'hipoclorito',            'Hipoclorito de Sodio',         ['10L']],
  ['limpieza', 'vinagre',                'Vinagre de Limpieza',          ['5L', '10L']],
  ['lavado',   'jabon-ropa',             'Detergente Líquido',           ['10L']],
  ['lavado',   'jabon-liquido-economico','Detergente Líquido Económico', ['10L']],
  ['lavado',   'ideal',                  'Jabón Lavarropas Dúo',         ['5L', '10L']],
  ['lavado',   'suavizante',             'Suavizante',                   ['5L', '10L']],
  ['lavado',   'shampoo-lavarropas',     'Shampoo para Lavarropas',      ['5L', '10L']],
  ['higiene',  'alcohol-gel',            'Alcohol en Gel',               ['1L', '5L']],
  ['higiene',  'alcohol',                'Alcohol Líquido 70 %',         ['1L', '5L', '10L']],
  ['higiene',  'jabon-manos',            'Shampoo para Manos',           ['5L']],
  ['aromas',   'desodorante',            'Desodorante Bactericida',      ['10L']],
  ['aromas',   'esencia',                'Esencia Desodorante',          ['2L']],
  ['aromas',   'perfumador',             'Perfumador Textil',            ['½L', '1L']],
  ['autos',    'emulsion-neumaticos',    'Emulsión Neumáticos',          ['5L']],
  ['autos',    'emulsion-plasticos',     'Emulsión Plásticos',           ['5L']],
  ['textil',   'rejillas',               'Rejillas',                     ['6 u.']],
  ['textil',   'panos-de-piso',          'Paños de Piso',                ['6 u.', '25 u.']],
  ['textil',   'franelas',               'Franelas',                     ['6 u.']],
  ['textil',   'microfibras',            'Microfibras',                  ['5 u.']],
  ['textil',   'guantes-negros',         'Guantes de Látex Negros',      ['10 pares']],
  ['textil',   'guantes-amarillos',      'Guantes de Látex Amarillos',   ['10 pares']],
  ['papeles',  'jumbo-200',              'Toalla Jumbo 200',             ['']],
  ['papeles',  'toalla-intercalada',     'Toalla Intercalada 20 × 23',   ['']],
  ['papeles',  'rollo-cocina',           'Rollo de Cocina 200 Hojas',    ['']],
  ['papeles',  'servilleta-bocadillo',   'Servilleta de Bocadillo',      ['']],
  ['papeles',  'servilleta-mesa',        'Servilleta de Mesa 30 × 29,5', ['']],
  ['papeles',  'servilleta-mesa-22x21',  'Servilleta de Mesa 22 × 21',   ['']],
  ['papeles',  'papel-higienico-dh',     'Papel Higiénico Doble Hoja',   ['']],
  ['papeles',  'papel-higienico-jumbo',  'Papel Higiénico Jumbo 500',    ['']]
];

function skuId(base, medida) {
  if (!medida) return base;
  const m = medida.replace('½', 'medio').replace(/[^0-9a-zA-Z]+/g, '').toLowerCase();
  return base + '_' + m;
}

export function productosIniciales() {
  const out = [];
  BASE.forEach(([cat, base, nombre, medidas]) => {
    medidas.forEach((medida) => {
      out.push({
        id: skuId(base, medida),
        base,
        nombre,
        medida,
        cat,
        foto: FOTOS + base + '.jpg',
        activo: true,
        orden: out.length
      });
    });
  });
  return out;
}

export function configInicial() {
  return {
    productos: productosIniciales(),
    repartos: [
      { id: 'r1', nombre: 'Reparto 1', activo: true },
      { id: 'r2', nombre: 'Reparto 2', activo: true }
    ],
    prediccion: {
      semanas: 8,        // cuántas semanas hacia atrás mira
      margen: 5,         // % extra de seguridad sobre lo que se suele vender
      minMuestras: 2     // mínimo de días iguales (ej. 2 martes) para usar "mismo día"
    },
    // Comparar lo vendido con lo facturado en el paso de control.
    // Apagado por ahora: se prende desde Ajustes cuando se quiera usar.
    facturacion: false
  };
}
