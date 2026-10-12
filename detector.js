/*
 * Detecção de pontos (pips) em fotos de pedras de dominó, 100% no navegador.
 *
 * Ideia: as pedras são a parte "branca" da imagem (canal mínimo RGB alto).
 * Os pontos — pretos ou coloridos — são "buracos" dentro dessa região branca.
 * Contamos os buracos aproximadamente circulares e de tamanho parecido.
 * Funciona melhor com as pedras sobre uma superfície escura ou colorida.
 */
(function (global) {
  'use strict';

  function otsu(values) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < values.length; i++) hist[values[i]]++;
    const total = values.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; threshold = t; }
    }
    return threshold;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /**
   * @param {ImageData} img
   * @returns {{pips: {x:number,y:number,r:number}[], threshold:number}}
   */
  function detectPips(img) {
    const w = img.width, h = img.height, d = img.data, n = w * h;

    // "Brancura": canal mínimo. Branco/marfim é alto; preto e cores são baixos.
    const whiteness = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      whiteness[i] = r < g ? (r < b ? r : b) : (g < b ? g : b);
    }
    const threshold = otsu(whiteness);
    const tile = new Uint8Array(n);
    for (let i = 0; i < n; i++) tile[i] = whiteness[i] > threshold ? 1 : 0;

    // label: 0 = não visitado, -1 = fundo (ligado à borda), >0 = buraco
    const label = new Int32Array(n);
    const stack = new Int32Array(n);

    function flood(start, id, stats) {
      let sp = 0;
      stack[sp++] = start;
      label[start] = id;
      while (sp) {
        const i = stack[--sp];
        const x = i % w, y = (i / w) | 0;
        if (stats) {
          stats.area++; stats.sx += x; stats.sy += y;
          if (x < stats.minx) stats.minx = x;
          if (x > stats.maxx) stats.maxx = x;
          if (y < stats.miny) stats.miny = y;
          if (y > stats.maxy) stats.maxy = y;
        }
        if (x > 0 && !tile[i - 1] && !label[i - 1]) { label[i - 1] = id; stack[sp++] = i - 1; }
        if (x < w - 1 && !tile[i + 1] && !label[i + 1]) { label[i + 1] = id; stack[sp++] = i + 1; }
        if (y > 0 && !tile[i - w] && !label[i - w]) { label[i - w] = id; stack[sp++] = i - w; }
        if (y < h - 1 && !tile[i + w] && !label[i + w]) { label[i + w] = id; stack[sp++] = i + w; }
      }
    }

    // Tudo que não é pedra e encosta na borda da foto é fundo (mesa).
    for (let x = 0; x < w; x++) {
      for (const i of [x, (h - 1) * w + x]) if (!tile[i] && !label[i]) flood(i, -1, null);
    }
    for (let y = 0; y < h; y++) {
      for (const i of [y * w, y * w + w - 1]) if (!tile[i] && !label[i]) flood(i, -1, null);
    }

    // O que sobrou são buracos dentro das pedras: candidatos a ponto.
    const minArea = Math.max(6, n * 0.000015);
    const candidates = [];
    let nextId = 1;
    for (let i = 0; i < n; i++) {
      if (tile[i] || label[i]) continue;
      const s = { area: 0, sx: 0, sy: 0, minx: w, maxx: 0, miny: h, maxy: 0 };
      flood(i, nextId++, s);
      if (s.area < minArea) continue;
      const bw = s.maxx - s.minx + 1, bh = s.maxy - s.miny + 1;
      const aspect = Math.max(bw, bh) / Math.min(bw, bh);
      const fill = s.area / (bw * bh);
      // Círculo: aspecto ~1 e preenchimento ~0,785. A linha divisória da pedra é alongada.
      if (aspect > 1.8 || fill < 0.5) continue;
      candidates.push({ x: s.sx / s.area, y: s.sy / s.area, r: Math.sqrt(s.area / Math.PI), area: s.area });
    }

    // Pontos têm tamanho parecido entre si: descarta o que for muito diferente.
    const med = median(candidates.map(c => c.area));
    const pips = candidates
      .filter(c => c.area >= med * 0.3 && c.area <= med * 3)
      .map(({ x, y, r }) => ({ x, y, r }));

    return { pips, threshold };
  }

  global.DominoDetector = { detectPips };
})(typeof window !== 'undefined' ? window : globalThis);
