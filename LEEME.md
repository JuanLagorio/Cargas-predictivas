# Doña Sol · Cargas de reparto

App web para reemplazar la grilla impresa de los repartos: **qué sale, qué se recarga, qué vuelve** y si lo vendido coincide con lo facturado. A partir de las planillas anteriores **sugiere la carga de salida** de cada reparto.

Funciona en celular, tablet y PC. Se puede instalar como app ("Agregar a pantalla de inicio") y sigue funcionando sin internet: guarda en el equipo y sube cuando vuelve la señal.

## Cómo se usa

Cada reparto tiene una planilla por día, con 4 pasos:

| Paso | Quién / cuándo | Qué se hace |
|---|---|---|
| **1. Salida** | a la mañana | La app propone cuánto cargar de cada producto (en gris). Se ajusta lo que haga falta y se toca **Confirmar salida**. |
| **2. Recarga** | antes de salir o durante el día | Botones **+1 / +2** por producto, para pedidos que la app no conocía. |
| **3. Vuelta** | a la llegada | Se anota cuánto volvió. Lo que queda vacío cuenta como 0 (se vendió todo). |
| **4. Control** | después | Se revisa lo vendido (**salida + recarga − vuelta**), se anotan notas y se toca **Cerrar jornada**. Solo las jornadas cerradas cuentan para la predicción. |

**Control con facturación (apagado por ahora):** desde Ajustes se puede prender. Agrega en el paso 4 la columna *Facturado* (a mano o **pegándola desde Excel**), marca las diferencias con lo vendido y las muestra en el panel y el historial.

Además:
- **Planilla completa**: todas las columnas juntas, como la hoja de papel. Sirve también para pasar a mano planillas viejas (Historial → "Pasar una planilla de otro día").
- **Panel** (pensado para la PC): estado de los repartos de hoy, jornadas sin cerrar, cómo viene acertando la predicción y lo más vendido.
- **Datos del reparto** (arriba de la Salida): vendedor, acompañante, camión, libreta de contado, libreta de crédito y recibo. Cada día trae lo de la vez anterior de ese reparto, menos el recibo.
- **Planilla para imprimir** (en el Panel, o el botón Imprimir de cada planilla): igual a la grilla de papel, en **hoja de oficio**, con el logo, los datos del reparto y las columnas Código · Productos · Salida · Recarga · Vuelta · Diferencia. A la salida sale con la Salida y el resto para anotar a mano; después de la vuelta sale completa. No muestra la carga sugerida. En la ventana de impresión se puede elegir **Guardar como PDF**.
- **Historial**: planillas por mes y movimiento de un producto día por día.
- **Ajustes**: repartos, productos (activar / desactivar / agregar), parámetros de la predicción, importar y exportar.

## Cómo predice la salida

Para cada producto y reparto:

1. Toma las jornadas **cerradas** de las últimas 8 semanas (configurable).
2. De cada una calcula lo vendido. Si se agotó **sin** recarga, suma un poco (seguro se podía vender más).
3. Usa los **mismos días de la semana** (los lunes para un lunes, etc.). Si hay menos de 2, usa todos los días.
4. Promedio ponderado: la jornada más reciente pesa más.
5. Suma un **margen de seguridad** (5 % por defecto, o media desviación si las ventas varían mucho).
6. Si el producto casi nunca se vende, sugiere 0: si alguien lo pide, va en la recarga.
7. **Surtido mínimo:** si el producto salió en todas esas jornadas, nunca se sugiere menos que la menor cantidad con la que salió (por ejemplo, siempre sale 1 cera o 3 paños aunque casi no se vendan).

Los productos y su orden son los de la grilla de papel, con el mismo código (que es el de la facturación). Se puede buscar por nombre o por código.

Tocando **Sug.** en cualquier producto se ve de dónde sale el número ("Últimos 4 lunes vendió: 12, 10, 14, 11…").

La sugerencia de cada día queda guardada, así el panel puede medir qué tan cerca estuvo de lo vendido. Si sobra mucha mercadería, bajá el margen en Ajustes; si hay muchas recargas, subilo.

## Puesta en marcha

Usa el **mismo proyecto de Firebase que la web** (`donasol-9255f`) y la misma forma de entrar (email y contraseña). Los datos van en colecciones nuevas (`cargas_config` y `cargas_jornadas`): no tocan el catálogo ni los precios.

### 1. Reglas de Firestore

En Firebase Console → Firestore → **Reglas**, **agregá** estos dos bloques dentro de `match /databases/{database}/documents { … }`, sin borrar las reglas que ya tiene la web. Cambiá los emails por las cuentas que van a usar la app:

```
    // App de cargas: solo las cuentas autorizadas
    function puedeCargas() {
      return request.auth != null &&
        request.auth.token.email in ['EMAIL_1@ejemplo.com', 'EMAIL_2@ejemplo.com'];
    }
    match /cargas_config/{doc} {
      allow read, write: if puedeCargas();
    }
    match /cargas_jornadas/{doc} {
      allow read, write: if puedeCargas();
    }
```

Se usa una lista de emails, y no "cualquier usuario logueado", porque con la configuración por defecto de Firebase cualquiera puede crearse una cuenta. Conviene además desactivar el registro público: Authentication → Settings → *User actions* → destildar **Enable create (sign-up)**.

### 2. Cuentas

En Authentication → Users, creá una cuenta para cada persona que use la app (por ejemplo, tu madre en la tablet) y agregá su email a la lista de las reglas.

### 3. Publicarla

Con GitHub Pages: en el repo → Settings → Pages → *Deploy from a branch* → `main` / `(root)`. Queda en `https://juanlagorio.github.io/Cargas-predictivas/`.

Después, en Firebase Console → Authentication → Settings → **Authorized domains**, agregá `juanlagorio.github.io` (si no está), o el ingreso va a dar error.

### 4. Instalarla en la tablet y el celular

Abrí la dirección en Chrome (Android) o Safari (iPad / iPhone) → menú → **Agregar a pantalla de inicio**.

## Pasar las planillas escaneadas

La idea es arrancar con historial, así la predicción funciona desde el primer día:

1. Escaneá o sacales foto a las planillas y ponelas en la carpeta [`escaneos/`](escaneos/) (ver instrucciones adentro). Esa carpeta **no se sube a GitHub**.
2. Pedile a Claude que las lea. Cada hoja queda transcripta en `escaneos/transcripcion/` y `node herramientas/armar-historial.mjs` las junta en `escaneos/historial.csv`, revisando que cada fila cierre (salida + recarga − vuelta = la diferencia anotada en la hoja). Lo que no se pudo leer queda en `escaneos/REVISAR.md`.
3. En la app: **Ajustes → Importar planillas anteriores** → elegir el archivo → **Revisar** → **Importar**.

Formato (una fila por producto y día; sirve con coma, punto y coma o tabulación, y se puede pegar directo desde Excel):

```
fecha,reparto,producto,salida,recarga,vuelta,facturado
06/10/2026,Reparto 1,Limpiador Multiuso 5L,12,2,3,11
06/10/2026,Reparto 1,Lavandina 10L,20,0,4,16
```

- **fecha**: `06/10/2026` o `2026-10-06`.
- **reparto**: el nombre; si no existe, se crea.
- **producto**: nombre + medida como en Ajustes (sin importar tildes ni mayúsculas).
- **recarga, vuelta, facturado**: pueden ir vacíos.

Antes de importar, la app muestra cuántas planillas entran, qué filas tienen problemas y cuáles ya existen (esas se reemplazan).

## Modo prueba

En la pantalla de ingreso, **Probar con datos de ejemplo** abre la app con 8 semanas de planillas inventadas, guardadas solo en ese navegador. Sirve para mostrarla o practicar sin tocar los datos reales.

## Para programar

App estática (HTML, CSS y JavaScript sin compilar). Firebase compat 9.23 por CDN, igual que la web.

```
npm test        # pruebas de la predicción, los cálculos y el importador
npm start       # servidor local en http://127.0.0.1:8765
```

| Archivo | Qué tiene |
|---|---|
| `js/predict.js` | la predicción y la medición de acierto |
| `js/calc.js` | cuentas de la planilla (vendido, diferencias, estados) |
| `js/store.js` | guardado en Firebase o en el navegador (modo prueba) |
| `js/importar.js` | importar CSV y pegar facturación |
| `js/catalogo.js` | productos de la grilla (código, nombre, medida, en el orden del papel) y repartos iniciales |
| `herramientas/armar-historial.mjs` | junta las transcripciones de los escaneos en el CSV para importar |
| `js/views/` | pantallas: hoy, jornada, panel, historial, ajustes |
| `fotos/` | miniaturas de los productos (de las fotos de la web) |
