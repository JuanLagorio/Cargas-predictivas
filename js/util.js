// ── Utilidades generales (fechas, texto, números) ──────────────────────────

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Fechas siempre como 'AAAA-MM-DD' en hora local (Uruguay).
export function hoyISO() {
  return aISO(new Date());
}

export function aISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function deISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function sumarDias(iso, n) {
  const d = deISO(iso);
  d.setDate(d.getDate() + n);
  return aISO(d);
}

export function diaSemana(iso) {
  return deISO(iso).getDay();
}

export function diasEntre(a, b) {
  return Math.round((deISO(b) - deISO(a)) / 86400000);
}

export function fechaLarga(iso) {
  const d = deISO(iso);
  return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
}

export function fechaCorta(iso) {
  const d = deISO(iso);
  return DIAS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
}

export function capitalizar(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Lunes de la semana de una fecha (para agrupar por semana).
export function lunesDe(iso) {
  const d = deISO(iso);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return aISO(d);
}

// ── Texto ──────────────────────────────────────────────────────────────────
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Para comparar nombres: sin tildes, sin mayúsculas, sin signos.
export function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace('½', 'medio')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// ── Números ────────────────────────────────────────────────────────────────
export function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function fmt(n, dec = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('es-UY', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtSigno(n) {
  if (n == null) return '—';
  return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('es-UY');
}

export function plural(n, uno, varios) {
  return fmt(n) + ' ' + (n === 1 ? uno : varios);
}

export function pct(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n * 100) + ' %';
}

// ── Varios ─────────────────────────────────────────────────────────────────
export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function idAleatorio(prefijo) {
  return prefijo + Math.random().toString(36).slice(2, 8);
}

export function jornadaId(fecha, repartoId) {
  return fecha + '_' + repartoId;
}
