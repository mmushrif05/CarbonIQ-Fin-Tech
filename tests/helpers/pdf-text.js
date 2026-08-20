/**
 * Recover the text of a generated PDF, the way a reader's search box would.
 *
 * The reports embed subsets of real TrueType faces, so a content stream holds
 * glyph ids rather than characters. What makes the text selectable is the
 * /ToUnicode CMap each font carries; reading the document back through that
 * map is therefore also a check that the maps are there and correct — a PDF
 * whose text cannot be extracted is one a reviewer cannot search or quote.
 *
 * Subset glyph ids are per font, so each page is decoded against its own
 * font resources. Decoding a page against another page's fonts yields
 * plausible-looking nonsense rather than an error, which is exactly the kind
 * of failure a test should not be able to pass through.
 */

'use strict';

const zlib = require('zlib');

const utf16 = hex => {
  const h = String(hex).replace(/\s+/g, '');
  let s = '';
  for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.substr(i, 4), 16));
  return s;
};

/**
 * Both bfrange forms:
 *   <lo> <hi> <dst>            a contiguous run
 *   <lo> <hi> [<d0> <d1> ...]  one destination per code — what pdfkit writes
 */
function parseCMap(text) {
  const map = new Map();

  for (const blk of text.match(/beginbfchar[\s\S]*?endbfchar/g) || []) {
    const p = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f\s]+)>/g;
    let x;
    while ((x = p.exec(blk)) !== null) map.set(parseInt(x[1], 16), utf16(x[2]));
  }

  for (const blk of text.match(/beginbfrange[\s\S]*?endbfrange/g) || []) {
    const p = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[\s\S]*?\]|<[0-9A-Fa-f\s]+>)/g;
    let x;
    while ((x = p.exec(blk)) !== null) {
      const lo = parseInt(x[1], 16), hi = parseInt(x[2], 16);
      if (x[3].startsWith('[')) {
        const items = [...x[3].matchAll(/<([0-9A-Fa-f\s]+)>/g)].map(i => utf16(i[1]));
        for (let i = lo; i <= hi && i - lo < items.length; i++) map.set(i, items[i - lo]);
      } else {
        const dst = parseInt(x[3].replace(/[<>\s]/g, ''), 16);
        for (let i = lo; i <= hi && i - lo < 65535; i++) map.set(i, String.fromCodePoint(dst + (i - lo)));
      }
    }
  }
  return map;
}

const decode = (hex, cmap) => {
  let s = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    const code = parseInt(hex.substr(i, 4), 16);
    s += cmap && cmap.has(code) ? cmap.get(code) : '';
  }
  return s;
};

/** @param {Buffer} buf @returns {string} every string the document draws */
function pdfText(buf) {
  const raw = buf.toString('latin1');

  const objects = new Map();
  const re = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const body = m[2];
    let stream = null;
    const sm = /stream(?:\r\n|\n|\r)([\s\S]*?)endstream/.exec(body);
    if (sm) {
      const bytes = Buffer.from(sm[1], 'latin1');
      try { stream = zlib.inflateSync(bytes); } catch (_) { stream = bytes; }
    }
    objects.set(Number(m[1]), { body, stream });
  }

  const cmapOf = new Map();
  for (const [num, o] of objects) {
    const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(o.body);
    if (!tu) continue;
    const cm = objects.get(Number(tu[1]));
    if (cm && cm.stream) cmapOf.set(num, parseCMap(cm.stream.toString('latin1')));
  }

  let out = '';
  for (const [, page] of objects) {
    if (!/\/Type\s*\/Page[^s]/.test(page.body)) continue;

    let resBody = page.body;
    const rr = /\/Resources\s+(\d+)\s+0\s+R/.exec(page.body);
    if (rr && objects.has(Number(rr[1]))) resBody = objects.get(Number(rr[1])).body;

    const names = new Map();
    const fd = /\/Font\s*<<([\s\S]*?)>>/.exec(resBody);
    if (fd) {
      const fr = /\/(\w+)\s+(\d+)\s+0\s+R/g;
      let f;
      while ((f = fr.exec(fd[1])) !== null) names.set(f[1], Number(f[2]));
    }

    const cr = /\/Contents\s+(\d+)\s+0\s+R/.exec(page.body);
    const cobj = cr ? objects.get(Number(cr[1])) : null;
    if (!cobj || !cobj.stream) continue;
    const content = cobj.stream.toString('latin1');

    let active = null;
    const tok = /\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*(?:Tj|TJ)|\[([^\]]*)\]\s*TJ/g;
    let t;
    while ((t = tok.exec(content)) !== null) {
      if (t[1]) { active = cmapOf.get(names.get(t[1])) || null; continue; }
      const hexes = t[2] ? [t[2]] : [...String(t[3]).matchAll(/<([0-9A-Fa-f]+)>/g)].map(x => x[1]);
      for (const hex of hexes) out += decode(hex, active);
      out += ' ';
    }
    out += '\n';
  }
  return out;
}

/** How many pages the document has. */
const pdfPageCount = buf =>
  (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

/** Flattened whitespace, for substring assertions. */
const flat = s => String(s).replace(/\s+/g, ' ');

module.exports = { pdfText, pdfPageCount, flat, parseCMap };
