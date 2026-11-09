// ── Piezas de interfaz compartidas ─────────────────────────────────────────
import { esc } from './util.js';
import { ESTADOS } from './calc.js';
import { CATEGORIAS } from './catalogo.js';

export function ico(nombre, clase = '') {
  return '<svg class="ico ' + clase + '" aria-hidden="true"><use href="#i-' + nombre + '"/></svg>';
}

let toastTimer;
export function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast visible ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

const ICONO_TONO = { neutro: 'camion', info: 'camion', aviso: 'alerta', bien: 'ok', mal: 'alerta' };

export function pildora(texto, tono, icono) {
  return '<span class="pildora pildora-' + tono + '">' + ico(icono || ICONO_TONO[tono] || 'info') +
    '<span>' + esc(texto) + '</span></span>';
}

export function pildoraEstado(estadoKey) {
  const e = ESTADOS[estadoKey];
  return pildora(e.label, e.tono);
}

export function pildoraControl(c) {
  const map = {
    ok: ['bien', 'ok'],
    dif: ['mal', 'alerta'],
    'sin-fact': ['aviso', 'info'],
    pendiente: ['neutro', 'info']
  };
  const [tono, icono] = map[c.tipo];
  return pildora(c.texto, tono, icono);
}

export function miniatura(p) {
  const inicial = esc((p.nombre || '?').charAt(0));
  const img = p.foto
    ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy" onerror="this.remove()" />'
    : '';
  return '<span class="mini" data-cat="' + esc(p.cat) + '"><span class="mini-ini">' + inicial + '</span>' + img + '</span>';
}

export function nombreProducto(p) {
  return esc(p.nombre) + (p.medida ? ' <span class="medida">' + esc(p.medida) + '</span>' : '');
}

export function nombreCategoria(id) {
  const c = CATEGORIAS.find((x) => x.id === id);
  return c ? c.nombre : id;
}

// ── Diálogo (en lugar de alert/confirm del navegador) ──────────────────────
export function dialogo({ titulo, html, botones = [{ texto: 'Cerrar', valor: null, clase: 'btn-sec' }], ancho = '' }) {
  const d = document.getElementById('dialogo');
  d.className = 'dialogo ' + ancho;
  d.innerHTML =
    '<form method="dialog" class="dialogo-in">' +
      '<div class="dialogo-cab"><h2>' + esc(titulo) + '</h2>' +
        '<button value="" class="btn-icono" aria-label="Cerrar">' + ico('cerrar') + '</button></div>' +
      '<div class="dialogo-cuerpo">' + html + '</div>' +
      '<div class="dialogo-pie">' +
        botones.map((b, i) => '<button value="' + i + '" class="btn ' + (b.clase || 'btn-sec') + '">' + esc(b.texto) + '</button>').join('') +
      '</div>' +
    '</form>';
  return new Promise((resolve) => {
    d.addEventListener('close', function alCerrar() {
      d.removeEventListener('close', alCerrar);
      const i = d.returnValue;
      resolve(i === '' || i == null ? null : botones[Number(i)].valor);
    });
    d.returnValue = '';
    d.showModal();
  });
}

export function confirmar(titulo, texto, si = 'Sí, seguir', clase = 'btn-primario') {
  return dialogo({
    titulo,
    html: '<p>' + texto + '</p>',
    botones: [
      { texto: 'Cancelar', valor: false, clase: 'btn-sec' },
      { texto: si, valor: true, clase }
    ]
  }).then((v) => v === true);
}

export function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
