// Gráfica de líneas minimalista sobre <canvas>, sin dependencias.
export function drawLineChart(canvas, points, { label = '', unit = '' } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth;
  const cssHeight = canvas.clientHeight || 220;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const styles = getComputedStyle(document.documentElement);
  const colorAccent = styles.getPropertyValue('--accent').trim() || '#4f8cff';
  const colorText = styles.getPropertyValue('--text-muted').trim() || '#8a93a6';
  const colorGrid = styles.getPropertyValue('--border').trim() || '#2a2f3a';

  if (!points.length) {
    ctx.fillStyle = colorText;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos todavía', cssWidth / 2, cssHeight / 2);
    return;
  }

  const padding = { top: 24, right: 16, bottom: 28, left: 40 };
  const plotW = cssWidth - padding.left - padding.right;
  const plotH = cssHeight - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const rangePad = (max - min) * 0.1;
  min -= rangePad;
  max += rangePad;

  const x = (i) => padding.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v) => padding.top + plotH - ((v - min) / (max - min)) * plotH;

  // Líneas de referencia horizontales
  ctx.strokeStyle = colorGrid;
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = colorText;
  ctx.textAlign = 'right';
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const v = min + ((max - min) * i) / gridLines;
    const yy = y(v);
    ctx.beginPath();
    ctx.moveTo(padding.left, yy);
    ctx.lineTo(cssWidth - padding.right, yy);
    ctx.stroke();
    ctx.fillText(Math.round(v).toString(), padding.left - 6, yy + 3);
  }

  // Área bajo la curva
  ctx.beginPath();
  ctx.moveTo(x(0), y(points[0].value));
  points.forEach((p, i) => ctx.lineTo(x(i), y(p.value)));
  ctx.lineTo(x(points.length - 1), padding.top + plotH);
  ctx.lineTo(x(0), padding.top + plotH);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
  gradient.addColorStop(0, hexToRgba(colorAccent, 0.25));
  gradient.addColorStop(1, hexToRgba(colorAccent, 0));
  ctx.fillStyle = gradient;
  ctx.fill();

  // Línea principal
  ctx.beginPath();
  ctx.moveTo(x(0), y(points[0].value));
  points.forEach((p, i) => ctx.lineTo(x(i), y(p.value)));
  ctx.strokeStyle = colorAccent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Puntos
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(p.value), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = colorAccent;
    ctx.fill();
  });

  // Etiquetas de fecha (primera, media, última)
  ctx.fillStyle = colorText;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const labelIdxs = points.length > 1 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0];
  const seen = new Set();
  labelIdxs.forEach((i) => {
    if (seen.has(i)) return;
    seen.add(i);
    const text = points[i].label;
    ctx.textAlign = i === 0 ? 'left' : i === points.length - 1 ? 'right' : 'center';
    ctx.fillText(text, x(i), cssHeight - 8);
  });
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
