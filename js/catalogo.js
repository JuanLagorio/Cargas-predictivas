// ── Catálogo inicial ───────────────────────────────────────────────────────
// Los productos de la grilla impresa de reparto: mismos códigos, mismo orden
// (el de la hoja de papel). El código es el mismo que usa la facturación.
// Es el punto de partida: desde Ajustes se pueden agregar, renombrar u ocultar
// productos, y eso queda guardado en la base de datos.

// Miniaturas en /fotos (sacadas de las fotos del sitio), así se ven sin internet.
const FOTOS = 'fotos/';

// Se usan solo para el color de fondo de la miniatura (en pantalla no se muestran).
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

// [código, nombre, medida, categoría, foto]   — en el orden de la grilla
const GRILLA = [
  ['1',    'Shampoo Industrial',                 '10L',   'lavado',   ''],
  ['10',   'Cera al Agua',                       '5L',    'limpieza', 'cera-pisos'],
  ['109',  'Dispensador Shampoo Manos 800cc',    '',      'otros',    ''],
  ['12',   'Espuma Controlada sin Olor',         '5L',    'lavado',   ''],
  ['121',  'Dispensador Jumbo 500 Plástico',     '',      'otros',    ''],
  ['122',  'Multiuso Cítrico',                   '5L',    'limpieza', 'mulcit'],
  ['123',  'Multiuso Cítrico',                   '10L',   'limpieza', 'mulcit'],
  ['138',  'Bolsas 1 × 1,20',                    '',      'otros',    ''],
  ['14',   'Limpiavidrios',                      '2L',    'limpieza', 'limpiavidrios'],
  ['154',  'Dispensador Toalla 2021',            '',      'otros',    ''],
  ['155',  'Dispensador Jumbo 200',              '',      'otros',    ''],
  ['169',  'Ideal',                              '10L',   'lavado',   'ideal'],
  ['17',   'Shampoo para Manos con Olor',        '5L',    'higiene',  'jabon-manos'],
  ['179',  'Alcohol con Atomizador',             '1L',    'higiene',  'alcohol'],
  ['18',   'Envases',                            '10L',   'otros',    ''],
  ['183',  'Bolsas 55 × 60',                     '',      'otros',    ''],
  ['185',  'Limpiador Líquido',                  '10L',   'limpieza', ''],
  ['20',   'Ideal',                              '5L',    'lavado',   'ideal'],
  ['21',   'Desodorante',                        '10L',   'aromas',   'desodorante'],
  ['2',    'Shampoo para Auto Grueso',           '10L',   'autos',    ''],
  ['23',   'Suavizante',                         '5L',    'lavado',   'suavizante'],
  ['29',   'Espuma Controlada con Olor',         '10L',   'lavado',   ''],
  ['3',    'Lavandina',                          '10L',   'limpieza', 'lavandina'],
  ['30',   'Espuma Controlada con Olor',         '5L',    'lavado',   ''],
  ['34',   'Cremoso',                            '750cc', 'limpieza', 'cremoso'],
  ['36',   'Shampoo Auto Siliconado',            '10L',   'autos',    ''],
  ['37',   'Paños',                              '6 u.',  'textil',   'panos-de-piso'],
  ['38',   'Rejillas',                           '6 u.',  'textil',   'rejillas'],
  ['42',   'Soda Cáustica',                      '5L',    'limpieza', 'soda-caustica'],
  ['43',   'Shampoo Económico',                  '10L',   'lavado',   ''],
  ['4',    'Hipoclorito',                        '10L',   'limpieza', 'hipoclorito'],
  ['46',   'Limpiador Multiuso',                 '5L',    'limpieza', 'multiuso'],
  ['53',   'Desodorante Económico',              '10L',   'aromas',   'desodorante'],
  ['6',    'Esencia',                            '2L',    'aromas',   'esencia'],
  ['60',   'Alcohol en Gel',                     '1L',    'higiene',  'alcohol-gel'],
  ['61',   'Perfumador',                         '1L',    'aromas',   'perfumador'],
  ['63',   'Desengrasante',                      '5L',    'limpieza', 'desengrasante'],
  ['64',   'Alcohol',                            '5L',    'higiene',  'alcohol'],
  ['67',   'Alcohol en Gel',                     '5L',    'higiene',  'alcohol-gel'],
  ['68',   'Franelas',                           '6 u.',  'textil',   'franelas'],
  ['7',    'Soda',                               '10L',   'limpieza', 'soda-caustica'],
  ['70',   'Paños Eco',                          '25 u.', 'textil',   'panos-de-piso'],
  ['72',   'Alcohol',                            '10L',   'higiene',  'alcohol'],
  ['73',   'Perfumador',                         '½L',    'aromas',   'perfumador'],
  ['8',    'Shampoo para Manos sin Olor',        '5L',    'higiene',  'jabon-manos'],
  ['82',   'Emulsión Plásticos',                 '5L',    'autos',    'emulsion-plasticos'],
  ['88',   'Shampoo Incoloro',                   '10L',   'lavado',   ''],
  ['9',    'Suavizante',                         '10L',   'lavado',   'suavizante'],
  ['93',   'Limpiador Líquido',                  '5L',    'limpieza', ''],
  ['95',   'Emulsión Neumáticos',                '5L',    'autos',    'emulsion-neumaticos'],
  // OJO: una versión de la planilla dice 96 = 5L y 97 = 10L, la otra al revés.
  ['96',   'Vinagre',                            '5L',    'limpieza', 'vinagre'],
  ['97',   'Vinagre',                            '10L',   'limpieza', 'vinagre'],
  ['99',   'Paños Microfibra',                   '5 u.',  'textil',   'microfibras'],
  ['124',  'Guantes',                            '',      'textil',   'guantes-amarillos'], // agregado a mano en la grilla
  // Papeles (bloque de abajo de la grilla)
  ['1150', 'Servilletas 21 × 22 (96 paq.)',      '',      'papeles',  'servilleta-mesa-22x21'],
  ['104',  'Higiénico Jumbo 500 m',              '',      'papeles',  'papel-higienico-jumbo'],
  ['106',  'Higiénico Duetto (64 rollos)',       '',      'papeles',  'papel-higienico-dh'],
  ['107',  'Toalla Intercalada 2021 (caja 2000)', '',     'papeles',  'toalla-intercalada'],
  ['108',  'Toalla Jumbo 200 m (6 rollos)',      '',      'papeles',  'jumbo-200'],
  ['1185', 'Servilletas 30 × 30 (54 paq.)',      '',      'papeles',  'servilleta-mesa'],
  ['128',  'Servilletas Interfoliadas 10 × 20',  '',      'papeles',  'servilleta-bocadillo'],
  ['89',   'Rollo de Cocina 12 × 200',           '',      'papeles',  'rollo-cocina'],
  ['839',  'Toalla 2023 (5000)',                 '',      'papeles',  'toalla-intercalada'],
  ['729',  'Servilletas 21 × 22 (72 paq.)',      '',      'papeles',  'servilleta-mesa-22x21']
];

export function productosIniciales() {
  return GRILLA.map(([codigo, nombre, medida, cat, foto], i) => ({
    id: 'c' + codigo,
    codigo,
    nombre,
    medida,
    cat,
    foto: foto ? FOTOS + foto + '.jpg' : '',
    activo: true,
    orden: i
  }));
}

// Orden de la lista: el de la grilla de papel.
export function ordenarProductos(productos) {
  return productos.slice().sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));
}

export function configInicial() {
  return {
    productos: productosIniciales(),
    repartos: [
      { id: 'r1', nombre: 'Reparto 1', activo: true },
      { id: 'r2', nombre: 'Reparto 2', activo: true },
      { id: 'r3', nombre: 'Reparto 3', activo: true }
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
