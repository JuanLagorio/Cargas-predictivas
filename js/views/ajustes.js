// ── Ajustes: repartos, productos, predicción, importar / exportar ──────────
import { esc, normalizar, idAleatorio, hoyISO, fmt, fechaCorta, capitalizar, plural } from '../util.js';
import { CATEGORIAS } from '../catalogo.js';
import { leerHistorialCSV, aCSV } from '../importar.js';
import { generarDemo } from '../demo.js';
import { ico, toast, confirmar, descargar, dialogo, miniatura } from '../ui.js';

const PLANTILLA = 'fecha,reparto,producto,salida,recarga,vuelta,facturado\n' +
  '06/10/2026,Reparto 1,Limpiador Multiuso 5L,12,2,3,11\n' +
  '06/10/2026,Reparto 1,Lavandina 10L,20,0,4,16\n';

// Achica la foto a 160 px (JPEG liviano) para guardarla junto con la configuración.
function achicarFoto(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const lado = 160;
      const k = Math.min(lado / img.width, lado / img.height, 1);
      const w = Math.round(img.width * k), h = Math.round(img.height * k);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
}

const temaActual = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export async function render({ app, main }) {
  let cfg = structuredClone(app.config);
  let sucio = false;
  let importacion = null;

  const catOpts = (sel) => CATEGORIAS.map((c) => '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('');

  function htmlRepartos() {
    return cfg.repartos.map((r, i) =>
      '<div class="fila-ajuste" data-rep="' + i + '">' +
        '<input type="text" value="' + esc(r.nombre) + '" data-campo="nombre" aria-label="Nombre del reparto" />' +
        '<label class="interruptor"><input type="checkbox" data-campo="activo"' + (r.activo !== false ? ' checked' : '') + '><span>Activo</span></label>' +
      '</div>').join('');
  }

  function htmlProductos() {
    const sinFoto = cfg.productos.filter((p) => !p.foto).length;
    return (sinFoto ? '<p class="aviso">' + ico('info') + '<span><b>' + plural(sinFoto, 'producto no tiene', 'productos no tienen') + ' foto.</b> ' +
        'Tocá el cuadradito de la foto para sacarle una con la tablet o elegir una imagen.</span></p>' : '') +
      '<div class="tabla-scroll"><table class="tabla tabla-ajustes"><thead><tr><th scope="col">Foto</th><th scope="col">Activo</th><th scope="col">Código</th><th scope="col">Nombre</th><th scope="col">Medida</th><th scope="col">Categoría</th></tr></thead><tbody>' +
      cfg.productos.map((p, i) =>
        '<tr data-prod="' + i + '">' +
          '<td><label class="foto-editar' + (p.foto ? '' : ' sin-foto') + '" title="' + (p.foto ? 'Cambiar la foto' : 'Ponerle foto') + '">' +
            miniatura(p) + (p.foto ? '' : '<span class="foto-mas">' + ico('mas') + '</span>') +
            '<input type="file" accept="image/*" capture="environment" data-foto="' + i + '" hidden />' +
          '</label>' +
          (p.foto ? '<button type="button" class="btn-link chico" data-quitar-foto="' + i + '">Quitar</button>' : '') + '</td>' +
          '<td><input type="checkbox" data-campo="activo"' + (p.activo !== false ? ' checked' : '') + ' aria-label="Activo" /></td>' +
          '<td class="num sutil">' + esc(p.codigo || '') + '</td>' +
          '<td><input type="text" data-campo="nombre" value="' + esc(p.nombre) + '" aria-label="Nombre" /></td>' +
          '<td><input type="text" data-campo="medida" value="' + esc(p.medida || '') + '" class="corto" aria-label="Medida" /></td>' +
          '<td><select data-campo="cat" aria-label="Categoría">' + catOpts(p.cat) + '</select></td>' +
        '</tr>').join('') +
      '</tbody></table></div>';
  }

  function htmlImportacion() {
    if (!importacion) return '';
    const { jornadas, repartosNuevos, errores } = importacion;
    const fechas = jornadas.map((j) => j.fecha).sort();
    const existentes = jornadas.filter((j) => app.cache.has(j.id)).length;
    return '<div class="aviso ' + (errores.length ? 'aviso-mal' : '') + '">' +
      '<div><p><b>' + plural(jornadas.length, 'planilla lista', 'planillas listas').replace(/ (lista|listas)$/, '</b> $1') + ' para importar' +
        (fechas.length ? ' (del ' + capitalizar(fechaCorta(fechas[0])) + ' al ' + capitalizar(fechaCorta(fechas[fechas.length - 1])) + ')' : '') + '.</p>' +
        (repartosNuevos.length ? '<p>Repartos nuevos que se van a crear: <b>' + repartosNuevos.map((r) => esc(r.nombre)).join(', ') + '</b></p>' : '') +
        (existentes ? '<p>' + ico('alerta') + ' ' + (existentes === 1 ? '1 ya existe y se va a <b>reemplazar</b>.' : existentes + ' ya existen y se van a <b>reemplazar</b>.') + '</p>' : '') +
        (errores.length ? '<p><b>' + plural(errores.length, 'fila con problemas', 'filas con problemas') + '</b> (no se importan):</p><ul class="lista-errores">' +
          errores.slice(0, 15).map((e) => '<li>' + esc(e) + '</li>').join('') + (errores.length > 15 ? '<li>…y ' + (errores.length - 15) + ' más</li>' : '') + '</ul>' : '') +
        (jornadas.length ? '<button class="btn btn-primario btn-chico" id="btn-importar-ok">Importar ' + plural(jornadas.length, 'planilla', 'planillas') + '</button>' : '') +
      '</div></div>';
  }

  // Contenedor fijo: se redibuja por dentro y los eventos quedan enganchados.
  main.innerHTML = '<div class="vista ajustes"></div>';
  const raiz = main.firstElementChild;

  function pintar() {
    const p = cfg.prediccion;
    raiz.innerHTML =
      '<div class="encabezado"><div><p class="antetitulo">Ajustes</p><h1>Configuración</h1></div></div>' +

      '<section class="bloque"><h2>Repartos</h2>' +
        '<p class="sutil">Cada reparto tiene su propia planilla diaria y su propio historial para predecir.</p>' +
        '<div id="lista-repartos">' + htmlRepartos() + '</div>' +
        '<button class="btn btn-sec btn-chico" id="btn-add-rep">' + ico('mas') + 'Agregar reparto</button>' +
      '</section>' +

      '<section class="bloque"><h2>Predicción</h2>' +
        '<div class="form-linea">' +
          '<label class="campo"><span>Mirar hacia atrás</span><select id="cfg-semanas">' +
            [4, 6, 8, 12, 16].map((n) => '<option value="' + n + '"' + (p.semanas === n ? ' selected' : '') + '>' + n + ' semanas</option>').join('') + '</select></label>' +
          '<label class="campo"><span>Margen de seguridad</span><select id="cfg-margen">' +
            [0, 5, 10, 15, 20, 30].map((n) => '<option value="' + n + '"' + (p.margen === n ? ' selected' : '') + '>' + n + ' %</option>').join('') + '</select></label>' +
        '</div>' +
        '<p class="sutil">La sugerencia es el promedio de lo vendido los mismos días de la semana (los más recientes pesan más), más el margen. ' +
          'Si sobra mucha mercadería, bajá el margen; si hay muchas recargas, subilo.</p>' +
      '</section>' +

      '<section class="bloque"><h2>Control con facturación</h2>' +
        '<label class="interruptor"><input type="checkbox" id="cfg-fact"' + (cfg.facturacion ? ' checked' : '') + '><span>Comparar lo vendido con lo facturado</span></label>' +
        '<p class="sutil">Apagado, el último paso de la planilla es solo el cierre del día (lo vendido y las notas). ' +
          'Prendido, aparece la columna Facturado, se puede pegar la facturación desde Excel y el panel marca las diferencias.</p>' +
      '</section>' +

      '<section class="bloque"><h2>Productos</h2>' +
        '<p class="sutil">Desactivá los que no salen en reparto (no se borran: el historial queda). Conviene que los nombres sean como en la planilla de papel, así se importa el historial sin problemas.</p>' +
        '<div id="lista-productos">' + htmlProductos() + '</div>' +
        '<div class="form-linea agregar-prod">' +
          '<label class="campo"><span>Nombre</span><input type="text" id="np-nombre" placeholder="Ej.: Lavandina" /></label>' +
          '<label class="campo"><span>Medida</span><input type="text" id="np-medida" placeholder="Ej.: 5L" class="corto" /></label>' +
          '<label class="campo"><span>Categoría</span><select id="np-cat">' + catOpts('limpieza') + '</select></label>' +
          '<button class="btn btn-sec btn-chico" id="btn-add-prod">' + ico('mas') + 'Agregar producto</button>' +
        '</div>' +
      '</section>' +

      '<section class="bloque"><h2>Importar planillas anteriores</h2>' +
        '<p class="sutil">Para cargar el historial (por ejemplo, las planillas escaneadas ya pasadas a Excel). ' +
          'Una fila por producto y día con las columnas <b>fecha, reparto, producto, salida, recarga, vuelta, facturado</b>.</p>' +
        '<div class="form-linea">' +
          '<label class="btn btn-sec btn-chico btn-archivo">' + ico('subir') + 'Elegir archivo CSV<input type="file" id="archivo-csv" accept=".csv,.txt,text/csv" hidden /></label>' +
          '<button class="btn btn-link" id="btn-plantilla">' + ico('bajar') + 'Descargar plantilla de ejemplo</button>' +
        '</div>' +
        '<label class="campo"><span>O pegá acá las filas copiadas de Excel</span><textarea id="txt-import" rows="4" class="area" placeholder="fecha&#9;reparto&#9;producto&#9;salida&#9;recarga&#9;vuelta&#9;facturado"></textarea></label>' +
        '<button class="btn btn-sec btn-chico" id="btn-revisar">Revisar antes de importar</button>' +
        '<div id="res-import">' + htmlImportacion() + '</div>' +
      '</section>' +

      '<section class="bloque"><h2>Exportar</h2>' +
        '<p class="sutil">Todas las planillas en un archivo que abre Excel, o una copia de seguridad completa.</p>' +
        '<div class="form-linea">' +
          '<button class="btn btn-sec btn-chico" id="btn-csv">' + ico('bajar') + 'Planillas en Excel (CSV)</button>' +
          '<button class="btn btn-sec btn-chico" id="btn-json">' + ico('bajar') + 'Copia de seguridad</button>' +
        '</div>' +
      '</section>' +

      '<section class="bloque"><h2>Pantalla</h2>' +
        '<div class="segmentado" role="group" aria-label="Modo de pantalla">' +
          '<button class="' + (temaActual() === 'dark' ? 'activo' : '') + '" data-tema="dark">Oscuro</button>' +
          '<button class="' + (temaActual() === 'light' ? 'activo' : '') + '" data-tema="light">Claro</button>' +
        '</div>' +
        '<p class="sutil">El modo oscuro es el predeterminado. Lo que elijas acá vale solo para este equipo.</p>' +
      '</section>' +

      '<section class="bloque"><h2>Cuenta</h2>' +
        (app.store.modo === 'prueba'
          ? '<p>Estás en <b>modo prueba</b>: los datos son inventados y quedan solo en este navegador.</p>' +
            '<div class="form-linea"><button class="btn btn-sec btn-chico" id="btn-regenerar">Volver a generar datos de ejemplo</button>' +
            '<button class="btn btn-primario btn-chico" id="btn-salir">Salir del modo prueba</button></div>'
          : '<p>Conectado como <b>' + esc(app.store.usuario) + '</b>. Los datos se comparten entre todos los equipos con esta cuenta.</p>' +
            '<button class="btn btn-sec btn-chico" id="btn-salir">Cerrar sesión</button>') +
      '</section>' +

      '<div class="pie-fijo" id="pie-guardar" ' + (sucio ? '' : 'hidden') + '><div class="pie-in">' +
        '<div class="pie-texto">Hay cambios sin guardar</div>' +
        '<button class="btn btn-sec" id="btn-descartar">Descartar</button>' +
        '<button class="btn btn-primario" id="btn-guardar">' + ico('ok') + 'Guardar cambios</button></div></div>';
  }

  function repintarProductos() {
    const cont = raiz.querySelector('#lista-productos');
    const scroll = cont.querySelector('.tabla-scroll');
    const y = scroll ? scroll.scrollTop : 0;
    cont.innerHTML = htmlProductos();
    const nuevo = cont.querySelector('.tabla-scroll');
    if (nuevo) nuevo.scrollTop = y;
  }

  function marcarSucio() {
    sucio = true;
    const pie = main.querySelector('#pie-guardar');
    if (pie) pie.hidden = false;
  }

  function revisar(texto) {
    importacion = leerHistorialCSV(texto, cfg);
    main.querySelector('#res-import').innerHTML = htmlImportacion();
  }

  pintar();

  raiz.addEventListener('input', (e) => {
    const t = e.target;
    const rep = t.closest('[data-rep]');
    const prod = t.closest('[data-prod]');
    if (rep && t.dataset.campo === 'nombre') { cfg.repartos[rep.dataset.rep].nombre = t.value; marcarSucio(); }
    if (prod && (t.dataset.campo === 'nombre' || t.dataset.campo === 'medida')) { cfg.productos[prod.dataset.prod][t.dataset.campo] = t.value; marcarSucio(); }
  });

  raiz.addEventListener('change', (e) => {
    const t = e.target;
    const rep = t.closest('[data-rep]');
    const prod = t.closest('[data-prod]');
    if (rep && t.dataset.campo === 'activo') { cfg.repartos[rep.dataset.rep].activo = t.checked; marcarSucio(); }
    if (prod && t.dataset.campo === 'activo') { cfg.productos[prod.dataset.prod].activo = t.checked; marcarSucio(); }
    if (prod && t.dataset.campo === 'cat') { cfg.productos[prod.dataset.prod].cat = t.value; marcarSucio(); }
    if (t.id === 'cfg-semanas') { cfg.prediccion.semanas = Number(t.value); marcarSucio(); }
    if (t.id === 'cfg-margen') { cfg.prediccion.margen = Number(t.value); marcarSucio(); }
    if (t.id === 'cfg-fact') { cfg.facturacion = t.checked; marcarSucio(); }
    if (t.dataset.foto != null && t.files[0]) {
      const i = Number(t.dataset.foto);
      achicarFoto(t.files[0]).then((dataUrl) => {
        cfg.productos[i].foto = dataUrl;
        delete cfg.productos[i].sinFoto;
        marcarSucio();
        repintarProductos();
        toast('Foto lista. Guardá los cambios.');
      }).catch(() => toast('No se pudo leer esa imagen', 'mal'));
      return;
    }
    if (t.id === 'archivo-csv' && t.files[0]) {
      t.files[0].text().then((txt) => {
        main.querySelector('#txt-import').value = '';
        revisar(txt);
      });
    }
  });

  raiz.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.quitarFoto != null) {
      cfg.productos[Number(b.dataset.quitarFoto)].foto = '';
      cfg.productos[Number(b.dataset.quitarFoto)].sinFoto = true;
      marcarSucio();
      repintarProductos();
      return;
    }
    if (b.dataset.tema) {
      document.documentElement.dataset.theme = b.dataset.tema;
      try { localStorage.setItem('donasol_cargas_tema', b.dataset.tema); } catch (err) { /* sin almacenamiento */ }
      raiz.querySelectorAll('[data-tema]').forEach((x) => x.classList.toggle('activo', x === b));
      return;
    }
    switch (b.id) {
      case 'btn-add-rep': {
        cfg.repartos.push({ id: idAleatorio('r'), nombre: 'Reparto ' + (cfg.repartos.length + 1), activo: true });
        main.querySelector('#lista-repartos').innerHTML = htmlRepartos();
        marcarSucio();
        const inputs = main.querySelectorAll('#lista-repartos input[type=text]');
        inputs[inputs.length - 1].select();
        break;
      }
      case 'btn-add-prod': {
        const nombre = main.querySelector('#np-nombre').value.trim();
        const medida = main.querySelector('#np-medida').value.trim();
        if (!nombre) { toast('Escribí el nombre del producto'); return; }
        let id = normalizar(nombre) + (medida ? '_' + normalizar(medida) : '');
        while (cfg.productos.some((p) => p.id === id)) id += 'x';
        cfg.productos.push({ id, base: normalizar(nombre), nombre, medida, cat: main.querySelector('#np-cat').value, foto: '', activo: true, orden: cfg.productos.length });
        marcarSucio();
        const y = window.scrollY;
        pintar();
        window.scrollTo({ top: y });
        toast('Producto agregado. Guardá los cambios.');
        break;
      }
      case 'btn-guardar':
        try {
          await app.guardarConfig(cfg);
          cfg = structuredClone(app.config);
          sucio = false;
          main.querySelector('#pie-guardar').hidden = true;
          toast('Cambios guardados', 'bien');
        } catch (err) { /* el toast ya avisó */ }
        break;
      case 'btn-descartar':
        cfg = structuredClone(app.config);
        sucio = false;
        pintar();
        break;
      case 'btn-plantilla':
        descargar('plantilla-planillas.csv', PLANTILLA);
        break;
      case 'btn-revisar': {
        const txt = main.querySelector('#txt-import').value;
        if (!txt.trim()) { toast('Pegá las filas o elegí un archivo'); return; }
        revisar(txt);
        break;
      }
      case 'btn-importar-ok': {
        if (!importacion || !importacion.jornadas.length) return;
        b.disabled = true;
        b.textContent = 'Importando…';
        try {
          if (importacion.repartosNuevos.length) {
            cfg.repartos.push(...importacion.repartosNuevos);
            await app.guardarConfig(cfg);
            cfg = structuredClone(app.config);
          }
          await app.importar(importacion.jornadas);
          toast(plural(importacion.jornadas.length, 'planilla importada', 'planillas importadas'), 'bien');
          importacion = null;
          main.querySelector('#txt-import').value = '';
          main.querySelector('#res-import').innerHTML = '';
          main.querySelector('#lista-repartos').innerHTML = htmlRepartos();
        } catch (err) {
          console.error(err);
          toast('No se pudo importar. Revisá la conexión y los permisos.', 'mal');
          b.disabled = false;
        }
        break;
      }
      case 'btn-csv':
      case 'btn-json': {
        const todas = await app.store.getJornadas('2000-01-01', '2100-12-31');
        const fecha = hoyISO();
        if (b.id === 'btn-csv') descargar('planillas-donasol-' + fecha + '.csv', aCSV(todas, app.config));
        else descargar('copia-cargas-donasol-' + fecha + '.json', JSON.stringify({ config: app.config, jornadas: todas }, null, 1), 'application/json');
        toast(plural(todas.length, 'planilla exportada', 'planillas exportadas'));
        break;
      }
      case 'btn-regenerar': {
        const ok = await confirmar('Datos de ejemplo', 'Se borran los datos de prueba de este equipo y se generan de nuevo.', 'Regenerar');
        if (!ok) return;
        await app.store.borrarTodo();
        app.config = await app.store.getConfig();
        await app.store.importarJornadas(generarDemo(app.config));
        location.hash = '#/';
        location.reload();
        break;
      }
      case 'btn-salir': {
        if (sucio) {
          const ok = await confirmar('Hay cambios sin guardar', 'Si salís ahora se pierden.', 'Salir igual');
          if (!ok) return;
        }
        app.salir();
        break;
      }
      default:
    }
  });

  return () => {
    if (sucio) toast('Los cambios de Ajustes no se guardaron');
  };
}
