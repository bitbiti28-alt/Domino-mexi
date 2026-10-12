/*
 * Detecção de pontos (pips) em fotos de pedras de dominó, 100% no navegador.
 *
 * 1. Pedras = parte "branca" da foto (canal mínimo RGB alto). A forma de cada
 *    pedra é preenchida, para que pontos perto da borda continuem dentro dela.
 * 2. Ponto = pixel da pedra bem mais escuro (ou colorido) que o branco da
 *    própria pedra ao redor — assim luz desigual e sombras não atrapalham.
 * 3. Pontos grudados entre si ou na linha do meio são separados pela
 *    transformada de distância: o centro de cada bolinha é "grosso" (distância
 *    à borda ≈ raio), enquanto a linha divisória é fina.
 * Funciona melhor com as pedras sobre uma superfície escura ou colorida.
 */
(function (global) {
  'use strict';

  const MAX_SIDE = 1600;

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

  // Dilatação (max) ou erosão (min) binária com janela quadrada, separável.
  function morph(src, w, h, r, dilate) {
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    const hit = dilate ? 1 : 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let v = 1 - hit;
        for (let k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e; k++) {
          if (src[row + k] === hit) { v = hit; break; }
        }
        tmp[row + x] = v;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let v = 1 - hit;
        for (let k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e; k++) {
          if (tmp[k * w + x] === hit) { v = hit; break; }
        }
        out[y * w + x] = v;
      }
    }
    return out;
  }

  /**
   * Rotula componentes 4-conectados de pixels com mask[i] === value.
   * Devolve labels (0 = fora) e estatísticas por componente (índice = label - 1).
   */
  function components(mask, w, h, value) {
    const n = w * h;
    const labels = new Int32Array(n);
    const stack = new Int32Array(n);
    const stats = [];
    for (let s = 0; s < n; s++) {
      if (mask[s] !== value || labels[s]) continue;
      const id = stats.length + 1;
      const st = { area: 0, minx: w, maxx: 0, miny: h, maxy: 0, border: false };
      let sp = 0;
      stack[sp++] = s; labels[s] = id;
      while (sp) {
        const i = stack[--sp];
        const x = i % w, y = (i / w) | 0;
        st.area++;
        if (x < st.minx) st.minx = x;
        if (x > st.maxx) st.maxx = x;
        if (y < st.miny) st.miny = y;
        if (y > st.maxy) st.maxy = y;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) st.border = true;
        if (x > 0 && mask[i - 1] === value && !labels[i - 1]) { labels[i - 1] = id; stack[sp++] = i - 1; }
        if (x < w - 1 && mask[i + 1] === value && !labels[i + 1]) { labels[i + 1] = id; stack[sp++] = i + 1; }
        if (y > 0 && mask[i - w] === value && !labels[i - w]) { labels[i - w] = id; stack[sp++] = i - w; }
        if (y < h - 1 && mask[i + w] === value && !labels[i + w]) { labels[i + w] = id; stack[sp++] = i + w; }
      }
      stats.push(st);
    }
    return { labels, stats };
  }

  /**
   * @param {ImageData} img
   * @returns {{pips: {x:number,y:number,r:number}[]}}
   */
  function detectPips(img) {
    const w = img.width, h = img.height, d = img.data, n = w * h;
    const minDim = Math.min(w, h);

    // 1. "Brancura": canal mínimo. Branco/marfim é alto; preto e cores são baixos.
    const white = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      white[i] = r < g ? (r < b ? r : b) : (g < b ? g : b);
    }
    const tile = new Uint8Array(n);
    const t = otsu(white);
    for (let i = 0; i < n; i++) tile[i] = white[i] > t ? 1 : 0;

    // 2. Corpo das pedras: fecha pequenas falhas e preenche os buracos (pontos, linha).
    const rc = Math.max(2, Math.round(minDim / 300));
    const closed = morph(morph(tile, w, h, rc, true), w, h, rc, false);
    const bg = components(closed, w, h, 0);
    let body = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const l = bg.labels[i];
      body[i] = l && bg.stats[l - 1].border ? 0 : 1;
    }
    body = morph(body, w, h, Math.max(1, Math.round(minDim / 400)), false);

    // 3. Branco de referência local: média da "brancura" dos pixels de pedra ao redor.
    const W1 = w + 1;
    const sum = new Float64Array(W1 * (h + 1)), cnt = new Float64Array(W1 * (h + 1));
    let tileSum = 0, tileCnt = 0;
    for (let y = 0; y < h; y++) {
      let rs = 0, rcnt = 0;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (tile[i] && body[i]) { rs += white[i]; rcnt++; }
        const j = (y + 1) * W1 + x + 1;
        sum[j] = sum[j - W1] + rs;
        cnt[j] = cnt[j - W1] + rcnt;
      }
      tileSum += rs; tileCnt += rcnt;
    }
    if (!tileCnt) return { pips: [] };
    const tileMean = tileSum / tileCnt;
    const rw = Math.max(8, Math.round(minDim / 40));

    const pip = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - rw), y1 = Math.min(h, y + rw + 1);
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!body[i]) continue;
        const x0 = Math.max(0, x - rw), x1 = Math.min(w, x + rw + 1);
        const c = cnt[y1 * W1 + x1] - cnt[y0 * W1 + x1] - cnt[y1 * W1 + x0] + cnt[y0 * W1 + x0];
        const ref = c > 0
          ? (sum[y1 * W1 + x1] - sum[y0 * W1 + x1] - sum[y1 * W1 + x0] + sum[y0 * W1 + x0]) / c
          : tileMean;
        if (white[i] < ref * 0.72 && ref - white[i] > 30) pip[i] = 1;
      }
    }

    // 4. Raio típico de um ponto, a partir das manchas isoladas e redondas.
    const minArea = Math.max(5, n * 0.00001);
    const blobs = components(pip, w, h, 1).stats;
    const radii = [];
    for (const s of blobs) {
      if (s.area < minArea) continue;
      const bw = s.maxx - s.minx + 1, bh = s.maxy - s.miny + 1;
      if (Math.max(bw, bh) / Math.min(bw, bh) <= 1.4 && s.area / (bw * bh) >= 0.45) radii.push((bw + bh) / 4);
    }
    const rTyp = median(radii);
    if (!rTyp) return { pips: [] };

    // 5. Preenche reflexos de luz dentro dos pontos (buracos pequenos na máscara).
    const holes = components(pip, w, h, 0);
    const maxHole = Math.PI * rTyp * rTyp * 0.6;
    for (let i = 0; i < n; i++) {
      const l = holes.labels[i];
      if (l && !holes.stats[l - 1].border && holes.stats[l - 1].area < maxHole) pip[i] = 1;
    }

    // 6. Transformada de distância (chanfro 3-4): distância de cada pixel até fora do ponto.
    const dist = new Float32Array(n);
    const INF = 1e9;
    for (let i = 0; i < n; i++) dist[i] = pip[i] ? INF : 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!dist[i]) continue;
        let v = dist[i];
        if (x > 0) v = Math.min(v, dist[i - 1] + 3); else v = Math.min(v, 3);
        if (y > 0) {
          v = Math.min(v, dist[i - w] + 3);
          if (x > 0) v = Math.min(v, dist[i - w - 1] + 4);
          if (x < w - 1) v = Math.min(v, dist[i - w + 1] + 4);
        } else v = Math.min(v, 3);
        dist[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (!dist[i]) continue;
        let v = dist[i];
        if (x < w - 1) v = Math.min(v, dist[i + 1] + 3); else v = Math.min(v, 3);
        if (y < h - 1) {
          v = Math.min(v, dist[i + w] + 3);
          if (x < w - 1) v = Math.min(v, dist[i + w + 1] + 4);
          if (x > 0) v = Math.min(v, dist[i + w - 1] + 4);
        } else v = Math.min(v, 3);
        dist[i] = v;
      }
    }

    // 7. Centros dos pontos = máximos locais "grossos" da distância.
    const minCore = rTyp * 0.55 * 3; // em unidades do chanfro (×3)
    const peaks = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, v = dist[i];
        if (v < minCore) continue;
        if (v >= dist[i - 1] && v >= dist[i + 1] && v >= dist[i - w] && v >= dist[i + w] &&
            v >= dist[i - w - 1] && v >= dist[i - w + 1] && v >= dist[i + w - 1] && v >= dist[i + w + 1]) {
          peaks.push({ x, y, v });
        }
      }
    }
    peaks.sort((a, b) => b.v - a.v);

    const minSep = rTyp * 1.3, minSep2 = minSep * minSep;
    const pips = [];
    for (const p of peaks) {
      if (pips.some(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < minSep2)) continue;
      pips.push({ x: p.x, y: p.y, r: Math.max(p.v / 3, rTyp * 0.8) });
    }
    return { pips };
  }

  global.DominoDetector = { detectPips, MAX_SIDE };
})(typeof window !== 'undefined' ? window : globalThis);
