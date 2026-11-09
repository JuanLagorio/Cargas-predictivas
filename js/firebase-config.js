// Mismo proyecto de Firebase que el sitio de Doña Sol (donasol-9255f).
// Las cargas se guardan en colecciones propias ("cargas_config" y
// "cargas_jornadas"), así que no tocan el catálogo ni los precios.
export const firebaseConfig = {
  apiKey:            'AIzaSyB7vslGtZ0p36LNiczI2UBgS5E3cByeQIw',
  authDomain:        'donasol-9255f.firebaseapp.com',
  projectId:         'donasol-9255f',
  storageBucket:     'donasol-9255f.firebasestorage.app',
  messagingSenderId: '432744152923',
  appId:             '1:432744152923:web:15a269af35fd4674d4e47e'
};

export const COLECCION_CONFIG = 'cargas_config';
export const COLECCION_JORNADAS = 'cargas_jornadas';
