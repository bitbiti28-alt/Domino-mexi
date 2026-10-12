/*
 * Detecção de pontos (pips) em fotos de pedras de dominó, 100% no navegador.
 *
 * 1. Pedras = parte "branca" da foto (canal mínimo RGB alto). A forma de cada
 *    pedra é preenchida, para que pontos perto da borda continuem dentro dela.
 * 2. Ponto = pixel da pedra bem mais escuro (ou colorido) que o branco da
 *    própria pedra ao redor — assim luz desigual e sombras não atrapalham.
 * 3. A linha do meio de cada pedra localiza as pedras: só contam pontos dentro
 *    delas (cartas, naipes da toalha e outros objetos ficam de fora).
 * 4. Cada mancha é classificada pelo tamanho e formato: ponto (mesmo oco por
 *    reflexo), linha do meio, desenho grande ou vários pontos grudados — estes
 *    separados pela transformada de distância (o centro de cada bolinha é "grosso").
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
   * @param {object} [debug] se informado, recebe as máscaras intermediárias (para testes)
   * @returns {{pips: {x:number,y:number,r:number}[]}}
   */
  function detectPips(img, debug) {
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

    // 3. Cor de referência local: média dos pixels de pedra ao redor (somas por imagem integral).
    //    Duas passadas: na segunda, os pixels já marcados como ponto saem da média, senão
    //    um grupo de pontos claros (ex.: rosa) "tinge" a referência e some.
    const W1 = w + 1, N1 = W1 * (h + 1);
    const sumW = new Uint32Array(N1), sumR = new Uint32Array(N1), sumG = new Uint32Array(N1),
      sumB = new Uint32Array(N1), cnt = new Uint32Array(N1);
    const rw = Math.max(8, Math.round(minDim / 16));
    let pip = new Uint8Array(n);

    for (let pass = 0; pass < 2; pass++) {
      let tileSum = 0, tileCnt = 0;
      for (let y = 0; y < h; y++) {
        let rw0 = 0, rr = 0, rg = 0, rb = 0, rc0 = 0;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (tile[i] && body[i] && !pip[i]) {
            rw0 += white[i]; rr += d[i * 4]; rg += d[i * 4 + 1]; rb += d[i * 4 + 2]; rc0++;
          }
          const j = (y + 1) * W1 + x + 1;
          sumW[j] = sumW[j - W1] + rw0;
          sumR[j] = sumR[j - W1] + rr;
          sumG[j] = sumG[j - W1] + rg;
          sumB[j] = sumB[j - W1] + rb;
          cnt[j] = cnt[j - W1] + rc0;
        }
        tileSum += rw0; tileCnt += rc0;
      }
      if (!tileCnt) return { pips: [] };
      const tileMean = tileSum / tileCnt;

      // Ponto = bem mais escuro que a pedra ao redor OU de cor diferente dela
      // (pontos coloridos claros, como rosa e amarelo, quase não são mais escuros).
      const next = new Uint8Array(n);
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - rw), y1 = Math.min(h, y + rw + 1);
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!body[i]) continue;
          const x0 = Math.max(0, x - rw), x1 = Math.min(w, x + rw + 1);
          const a = y1 * W1 + x1, b = y0 * W1 + x1, c = y1 * W1 + x0, e = y0 * W1 + x0;
          const k = cnt[a] - cnt[b] - cnt[c] + cnt[e];
          const ref = k > 0 ? (sumW[a] - sumW[b] - sumW[c] + sumW[e]) / k : tileMean;
          if (white[i] < ref * 0.72 && ref - white[i] > 30) { next[i] = 1; continue; }
          if (!k) continue;
          // diferença de cor sem a diferença de brilho (sombra não conta)
          const dr = d[i * 4] - (sumR[a] - sumR[b] - sumR[c] + sumR[e]) / k;
          const dg = d[i * 4 + 1] - (sumG[a] - sumG[b] - sumG[c] + sumG[e]) / k;
          const db = d[i * 4 + 2] - (sumB[a] - sumB[b] - sumB[c] + sumB[e]) / k;
          const mean = (dr + dg + db) / 3;
          if ((dr - mean) ** 2 + (dg - mean) ** 2 + (db - mean) ** 2 > 28 * 28) next[i] = 1;
        }
      }
      pip = next;
    }

    if (debug) Object.assign(debug, { tile, body, pip: pip.slice() });

    // 4. Linhas do meio: retângulos escuros, compridos e cheios. Cada uma indica uma
    //    pedra; só contam pontos dentro dessas pedras (cartas, naipes da toalha, mão e
    //    outros objetos da foto ficam de fora).
    const raw = analyze(pip, w, h);
    const maxSide = Math.max(w, h);
    const bars = [];
    // Linha do meio de verdade tem pedra dos dois lados e nas pontas (a borda escura de
    // uma carta ou do tapete, não).
    const onBody = (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      return xi >= 0 && yi >= 0 && xi < w && yi < h && body[yi * w + xi] === 1;
    };
    const surroundedByTile = (c) => {
      const off = c.S / 2 + Math.max(4, 0.6 * c.S);
      let ok = 0, total = 0;
      const probe = (u, v) => {
        total++;
        if (onBody(c.x + u * c.ux - v * c.uy, c.y + u * c.uy + v * c.ux)) ok++;
      };
      for (let k = -0.4; k <= 0.401; k += 0.1) { probe(k * c.L, off); probe(k * c.L, -off); }
      probe(c.L / 2 + off, 0); probe(-c.L / 2 - off, 0);
      return ok / total >= 0.85;
    };
    raw.forEach(c => {
      if (c.S >= 2 && c.L / c.S > 3.2 && c.area / (c.L * c.S) > 0.7 &&
          c.L >= minDim / 40 && c.L <= 0.6 * maxSide && surroundedByTile(c)) bars.push(c);
    });
    if (debug) debug.bars = bars;
    // Pontos ficam num retângulo em volta da linha: até ~0,55× o comprimento dela para
    // os lados e ~1,1× para cima e para baixo (com folga).
    const inTile = (x, y) => bars.some(b => {
      const dx = x - b.x, dy = y - b.y;
      return Math.abs(dx * b.ux + dy * b.uy) <= 0.6 * b.L && Math.abs(-dx * b.uy + dy * b.ux) <= 1.25 * b.L;
    });
    const useTiles = bars.length > 0;

    // 5. Raio típico de um ponto, a partir das manchas isoladas e redondas (dentro das pedras).
    //    Usa a caixa envolvente: reflexos deixam o ponto "oco", mas não mudam seu tamanho.
    const minArea = Math.max(5, n * 0.00001);
    const radii = [];
    raw.forEach(c => {
      if (c.area < minArea || (useTiles && !inTile(c.x, c.y))) return;
      if (c.S / c.L >= 0.7 && c.area / (c.L * c.S) >= 0.3) radii.push((c.L + c.S) / 4);
    });
    const rTyp = median(radii);
    if (debug) debug.rTyp = rTyp;
    if (!rTyp) return { pips: [] };
    const D = 2 * rTyp;

    // 6. Preenche reflexos de luz dentro dos pontos (buracos pequenos na máscara).
    const holes = components(pip, w, h, 0);
    const maxHole = Math.PI * rTyp * rTyp * 0.6;
    for (let i = 0; i < n; i++) {
      const l = holes.labels[i];
      if (l && !holes.stats[l - 1].border && holes.stats[l - 1].area < maxHole) pip[i] = 1;
    }

    // 7. Transformada de distância (chanfro 3-4): distância de cada pixel até fora do ponto.
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

    // 8. Classifica cada mancha.
    const blobs = analyze(pip, w, h, dist);
    const pips = [];
    const clusters = new Set();
    blobs.forEach((c, l) => {
      const { L, S } = c;
      if (c.area < minArea || L < 0.5 * D) return;               // sujeira
      if (c.maxD / 3 > 1.6 * rTyp) return;                       // mancha grande demais: desenho
      if (S < 0.45 * D) return;                                  // fina: risco, fresta, linha do meio
      if (L <= 1.45 * D) {                                       // do tamanho de um ponto (mesmo que oco)
        pips.push({ x: c.x, y: c.y, r: Math.max(L, S) / 2 });
        return;
      }
      if (S < 0.9 * D && L / S > 3.2 && c.area / (L * S) > 0.75) return; // linha do meio grossa
      clusters.add(l + 1);                                       // vários pontos grudados
    });

    // 9. Pontos grudados: separa pelos máximos locais "grossos" da distância.
    const minCore = rTyp * 0.55 * 3; // em unidades do chanfro (×3)
    const peaks = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, v = dist[i];
        if (v < minCore || !clusters.has(blobs.labels[i])) continue;
        if (v >= dist[i - 1] && v >= dist[i + 1] && v >= dist[i - w] && v >= dist[i + w] &&
            v >= dist[i - w - 1] && v >= dist[i - w + 1] && v >= dist[i + w - 1] && v >= dist[i + w + 1]) {
          peaks.push({ x, y, v });
        }
      }
    }
    peaks.sort((a, b) => b.v - a.v);
    const minSep2 = (rTyp * 1.3) ** 2;
    for (const p of peaks) {
      if (pips.some(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < minSep2)) continue;
      pips.push({ x: p.x, y: p.y, r: Math.max(p.v / 3, rTyp * 0.8) });
    }

    if (!useTiles) return { pips };

    // Cor da pedra: média dos pixels brancos (não ponto) no miolo das pedras.
    const inCore = (x, y) => bars.some(b => {
      const dx = x - b.x, dy = y - b.y;
      return Math.abs(dx * b.ux + dy * b.uy) <= 0.35 * b.L && Math.abs(-dx * b.uy + dy * b.ux) <= 0.9 * b.L;
    });
    let tr = 0, tg = 0, tb = 0, tn = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = y * w + x;
        if (!tile[i] || pip[i] || !inCore(x, y)) continue;
        tr += d[i * 4]; tg += d[i * 4 + 1]; tb += d[i * 4 + 2]; tn++;
      }
    }
    tr /= tn || 1; tg /= tn || 1; tb /= tn || 1;
    // Fração do contorno do ponto (a 1,6 raio) que tem cor de pedra; amostras que caem
    // em outro ponto não contam.
    const ringTile = (p) => {
      let ok = 0, total = 0;
      for (let k = 0; k < 24; k++) {
        const a = k * Math.PI / 12;
        const x = Math.round(p.x + 1.6 * rTyp * Math.cos(a)), y = Math.round(p.y + 1.6 * rTyp * Math.sin(a));
        if (x < 0 || y < 0 || x >= w || y >= h) { total++; continue; }
        const i = y * w + x;
        if (pip[i]) continue;
        total++;
        const dr = d[i * 4] - tr, dg = d[i * 4 + 1] - tg, db = d[i * 4 + 2] - tb, mean = (dr + dg + db) / 3;
        if (tile[i] && (dr - mean) ** 2 + (dg - mean) ** 2 + (db - mean) ** 2 < 28 * 28) ok++;
      }
      return total ? ok / total : 0;
    };

    // 10. Fica só o que está numa pedra. Pedra cuja linha do meio não foi achada também
    //     vale, se for uma região branca solta com formato de dominó (retângulo ~2:1, sem
    //     linha e sem encostar na beirada da foto). Cartas, toalha e mão não passam.
    const re = Math.max(2, Math.round(rTyp * 0.8));
    const regions = analyze(morph(body, w, h, re, false), w, h);
    const regionAt = (x, y) => regions.labels[Math.round(Math.min(h - 1, Math.max(0, y))) * w +
                                               Math.round(Math.min(w - 1, Math.max(0, x)))];
    const withBar = new Set(bars.map(b => regionAt(b.x, b.y)));
    const looksLikeTile = (r) => {
      const L = r.L + 2 * re, S = r.S + 2 * re;
      const margin = re + 2;
      const inside = r.x - r.L / 2 > margin && r.y - r.L / 2 > margin &&
        r.x + r.L / 2 < w - 1 - margin && r.y + r.L / 2 < h - 1 - margin;
      return inside && L / S >= 1.5 && L / S <= 2.7 && r.area / (r.L * r.S) > 0.8 && S >= 2.5 * D && S <= 12 * D;
    };
    return {
      pips: pips.filter(p => {
        if (ringTile(p) < 0.6) return false;      // em volta não é pedra: pele, carta, toalha
        if (inTile(p.x, p.y)) return true;
        const l = regionAt(p.x, p.y);
        return !!l && !withBar.has(l) && looksLikeTile(regions[l - 1]);
      }),
    };
  }

  /**
   * Forma de cada mancha (componente 4-conectado de mask === 1): área, centro da caixa
   * orientada (x, y), eixo principal (ux, uy), comprimento L, largura S e, se `dist`
   * for dado, a maior distância interna (maxD). O array devolvido tem `.labels`.
   */
  function analyze(mask, w, h, dist) {
    const n = w * h;
    const { labels, stats } = components(mask, w, h, 1);
    const m = stats.length;
    const sx = new Float64Array(m), sy = new Float64Array(m), sxx = new Float64Array(m),
      syy = new Float64Array(m), sxy = new Float64Array(m), maxD = new Float32Array(m);
    for (let i = 0; i < n; i++) {
      const l = labels[i] - 1;
      if (l < 0) continue;
      const x = i % w, y = (i / w) | 0;
      sx[l] += x; sy[l] += y; sxx[l] += x * x; syy[l] += y * y; sxy[l] += x * y;
      if (dist && dist[i] > maxD[l]) maxD[l] = dist[i];
    }
    const out = stats.map((s, l) => {
      const cx = sx[l] / s.area, cy = sy[l] / s.area;
      const vxx = sxx[l] / s.area - cx * cx, vyy = syy[l] / s.area - cy * cy, vxy = sxy[l] / s.area - cx * cy;
      const th = 0.5 * Math.atan2(2 * vxy, vxx - vyy);
      return { area: s.area, cx, cy, ux: Math.cos(th), uy: Math.sin(th), maxD: maxD[l],
        u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity };
    });
    for (let i = 0; i < n; i++) {
      const l = labels[i] - 1;
      if (l < 0) continue;
      const c = out[l], dx = (i % w) - c.cx, dy = ((i / w) | 0) - c.cy;
      const u = dx * c.ux + dy * c.uy, v = -dx * c.uy + dy * c.ux;
      if (u < c.u0) c.u0 = u;
      if (u > c.u1) c.u1 = u;
      if (v < c.v0) c.v0 = v;
      if (v > c.v1) c.v1 = v;
    }
    for (const c of out) {
      c.L = c.u1 - c.u0 + 1;
      c.S = c.v1 - c.v0 + 1;
      const mu = (c.u0 + c.u1) / 2, mv = (c.v0 + c.v1) / 2;
      c.x = c.cx + c.ux * mu - c.uy * mv;
      c.y = c.cy + c.uy * mu + c.ux * mv;
    }
    out.labels = labels;
    return out;
  }

  global.DominoDetector = { detectPips, MAX_SIDE };
})(typeof window !== 'undefined' ? window : globalThis);
