// Generador de PDF mínimo (sin instalar nada): texto, rectángulos, líneas, círculos e imágenes JPEG.
// Las coordenadas se dan desde la esquina superior izquierda, en puntos (1 pt = 1/72 de pulgada).
const REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,...Array(10).fill(556),278,278,584,584,584,556,1015,
  667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,
  556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const NEG = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,...Array(10).fill(556),333,333,584,584,584,611,975,
  722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,
  556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

const n = (v) => String(Math.round(v * 100) / 100);
const rgb = (c) => c.map(n).join(' ');
const limpiar = (s) => String(s).replace(/[\r\n\t]+/g, ' ');
const codificar = (s) => Array.from(limpiar(s), (ch) => (ch.codePointAt(0) < 256 ? ch : '?')).join('');
const escapar = (s) => s.replace(/([\\()])/g, '\\$1');

function medir(s, t, negrita) {
  const tabla = negrita ? NEG : REG;
  let w = 0;
  for (const ch of s) {
    const c = ch.normalize('NFD').charCodeAt(0);
    w += c >= 32 && c <= 126 ? tabla[c - 32] : 556;
  }
  return (w / 1000) * t;
}

function leerJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
      return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7), comp: buf[i + 9] };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

class Pdf {
  constructor(ancho = 595, alto = 842) {
    this.ancho = ancho; this.alto = alto;
    this.paginas = []; this.imagenes = [];
    this.pagina();
  }
  pagina() { this.p = { ops: [], imgs: new Set() }; this.paginas.push(this.p); return this.p; }
  rect(x, y, w, h, o = {}) {
    const ops = [];
    if (o.relleno) ops.push(`${rgb(o.relleno)} rg`);
    if (o.borde) ops.push(`${rgb(o.borde)} RG ${n(o.grosor || 0.8)} w`);
    ops.push(`${n(x)} ${n(this.alto - y - h)} ${n(w)} ${n(h)} re ${o.relleno && o.borde ? 'B' : o.relleno ? 'f' : 'S'}`);
    this.p.ops.push(ops.join(' '));
  }
  linea(x1, y1, x2, y2, o = {}) {
    this.p.ops.push(`${rgb(o.c || [0, 0, 0])} RG ${n(o.g || 0.8)} w ${n(x1)} ${n(this.alto - y1)} m ${n(x2)} ${n(this.alto - y2)} l S`);
  }
  circulo(cx, cy, r, o = {}) {
    const k = 0.5523 * r, Y = this.alto - cy;
    this.p.ops.push(`${rgb(o.relleno || [0, 0, 0])} rg ${n(cx + r)} ${n(Y)} m ${n(cx + r)} ${n(Y + k)} ${n(cx + k)} ${n(Y + r)} ${n(cx)} ${n(Y + r)} c ` +
      `${n(cx - k)} ${n(Y + r)} ${n(cx - r)} ${n(Y + k)} ${n(cx - r)} ${n(Y)} c ${n(cx - r)} ${n(Y - k)} ${n(cx - k)} ${n(Y - r)} ${n(cx)} ${n(Y - r)} c ` +
      `${n(cx + k)} ${n(Y - r)} ${n(cx + r)} ${n(Y - k)} ${n(cx + r)} ${n(Y)} c f`);
  }
  texto(x, y, s, o = {}) {
    const t = o.t || 10, b = !!o.b;
    let str = codificar(s);
    if (o.max && medir(str, t, b) > o.max) {
      while (str.length && medir(str + '...', t, b) > o.max) str = str.slice(0, -1);
      str += '...';
    }
    const w = medir(str, t, b);
    if (o.a === 'd') x -= w; else if (o.a === 'c') x -= w / 2;
    this.p.ops.push(`${rgb(o.c || [0, 0, 0])} rg BT /F${b ? 2 : 1} ${n(t)} Tf ${n(x)} ${n(this.alto - y)} Td (${escapar(str)}) Tj ET`);
  }
  imagenJpeg(datos) {
    const info = leerJpeg(datos);
    if (!info || ![1, 3].includes(info.comp)) throw new Error('JPEG no compatible');
    this.imagenes.push({ datos, ...info });
    return this.imagenes.length;
  }
  dibujar(id, x, y, w, h) {
    const im = this.imagenes[id - 1];
    const esc = Math.min(w / im.ancho, h / im.alto), dw = im.ancho * esc, dh = im.alto * esc;
    this.p.imgs.add(id);
    this.p.ops.push(`q ${n(dw)} 0 0 ${n(dh)} ${n(x + (w - dw) / 2)} ${n(this.alto - y - h + (h - dh) / 2)} cm /Im${id} Do Q`);
  }
  construir() {
    const flujo = (cab, datos) => Buffer.concat([Buffer.from(`<< ${cab} /Length ${datos.length} >>\nstream\n`), datos, Buffer.from('\nendstream')]);
    const objs = [null, null,
      Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')];
    const ids = this.imagenes.map((im) => {
      objs.push(flujo(`/Type /XObject /Subtype /Image /Width ${im.ancho} /Height ${im.alto} /ColorSpace /${im.comp === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode`, im.datos));
      return objs.length;
    });
    const hojas = [];
    for (const p of this.paginas) {
      objs.push(flujo('', Buffer.from(p.ops.join('\n'), 'latin1')));
      const contenido = objs.length;
      const xo = [...p.imgs].map((i) => `/Im${i} ${ids[i - 1]} 0 R`).join(' ');
      objs.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.ancho} ${this.alto}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xo} >> >> /Contents ${contenido} 0 R >>`));
      hojas.push(objs.length);
    }
    objs[0] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
    objs[1] = Buffer.from(`<< /Type /Pages /Kids [${hojas.map((i) => i + ' 0 R').join(' ')}] /Count ${hojas.length} >>`);

    const partes = [Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
    let pos = partes[0].length;
    const offsets = [];
    objs.forEach((o, i) => {
      const cab = Buffer.from(`${i + 1} 0 obj\n`), fin = Buffer.from('\nendobj\n');
      offsets.push(pos);
      partes.push(cab, o, fin);
      pos += cab.length + o.length + fin.length;
    });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`));
    return Buffer.concat(partes);
  }
}

module.exports = Pdf;