(function () {
  'use strict';

  const STORAGE_KEY = 'domino-mexicano:v1';
  const MAX_PHOTO_SIDE = window.DominoDetector.MAX_SIDE;

  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  };

  // ---------- Estado ----------

  const BLANK_ALONE_POINTS = 100;

  let state = load() || freshState([]);

  function freshState(players) {
    return { view: 'setup', players, maxDouble: 12, zeroRound: false, blankAlone100: true, rounds: [], current: 0 };
  }

  function load() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
    if (!saved) return null;
    // Jogos salvos antes destas opções existirem tinham a rodada do duplo zero.
    if (saved.zeroRound === undefined) saved.zeroRound = saved.rounds.length > 0;
    if (saved.blankAlone100 === undefined) saved.blankAlone100 = true;
    delete saved.doubleBlank50;
    return saved;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* sem armazenamento */ }
  }

  const roundCount = () => state.maxDouble + (state.zeroRound ? 1 : 0);
  const doubleOf = (roundIndex) => state.maxDouble - roundIndex;
  const isRoundFilled = (r) => state.players.every(p => Number.isFinite(r.scores[p.id]));

  function totals() {
    const t = {};
    for (const p of state.players) t[p.id] = 0;
    for (const r of state.rounds) {
      for (const p of state.players) t[p.id] += Number(r.scores[p.id]) || 0;
    }
    return t;
  }

  function parseScore(value) {
    return value === null || value === '' || isNaN(value) ? null : Math.max(0, Math.round(Number(value)));
  }

  function setScore(playerId, value) {
    state.rounds[state.current].scores[playerId] = parseScore(value);
    save();
    renderGame();
  }

  // ---------- Telas ----------

  function render() {
    $('screen-setup').hidden = state.view !== 'setup';
    $('screen-game').hidden = state.view !== 'game';
    $('screen-final').hidden = state.view !== 'final';
    $('btn-new-game').hidden = state.view === 'setup';
    if (state.view === 'setup') renderSetup();
    if (state.view === 'game') renderGame();
    if (state.view === 'final') renderFinal();
  }

  function renderSetup() {
    const list = $('setup-players');
    list.replaceChildren(...state.players.map((p, i) => el('li', {}, [
      el('span', { textContent: `${i + 1}. ${p.name}` }),
      el('button', { className: 'ghost', textContent: 'Remover', onclick: () => {
        state.players = state.players.filter(x => x.id !== p.id);
        save(); renderSetup();
      } }),
    ])));
    $('select-max-double').value = String(state.maxDouble);
    $('check-zero-round').checked = state.zeroRound;
    $('check-blank-100').checked = state.blankAlone100;
    $('rounds-summary').textContent =
      `${roundCount()} rodadas: do duplo ${state.maxDouble} ao duplo ${doubleOf(roundCount() - 1)}.`;
    $('btn-start').disabled = state.players.length < 2;
  }

  function renderGame() {
    const round = state.rounds[state.current];
    $('round-number').textContent = state.current + 1;
    $('round-total').textContent = roundCount();
    $('round-double').textContent = doubleOf(state.current);
    $('btn-prev-round').disabled = state.current === 0;
    $('btn-next-round').disabled = state.current >= state.rounds.length - 1;

    $('round-entries').replaceChildren(...state.players.map(p => {
      const value = round.scores[p.id];
      const zero = el('button', { className: 'ghost zero' + (value === 0 ? ' active' : ''), textContent: 'Bateu',
        title: 'Bateu (0 pontos)', onclick: () => setScore(p.id, 0) });
      const input = el('input', {
        type: 'number', inputMode: 'numeric', min: 0, placeholder: '—',
        value: Number.isFinite(value) ? value : '',
        // Ao digitar, não recria a lista (o campo perderia o foco): só atualiza o placar.
        onchange: (e) => {
          round.scores[p.id] = parseScore(e.target.value);
          save();
          zero.classList.toggle('active', round.scores[p.id] === 0);
          renderScoreboard($('scoreboard'), true);
        },
      });
      input.setAttribute('aria-label', `Pontos de ${p.name}`);
      return el('li', {}, [
        el('span', { className: 'name', textContent: p.name }),
        input,
        el('button', { className: 'ghost', textContent: '📷', title: 'Fotografar pedras',
          onclick: () => startPhoto(p) }),
        zero,
      ]);
    }));

    const last = state.current === roundCount() - 1;
    $('btn-finish-round').textContent = last ? 'Fechar rodada e ver resultado' : 'Fechar rodada';
    renderScoreboard($('scoreboard'), true);
  }

  function renderScoreboard(table, highlightCurrent) {
    const t = totals();
    const best = Math.min(...Object.values(t));
    const head = el('tr', {}, [el('th', { textContent: 'Duplo' }), ...state.players.map(p => el('th', { textContent: p.name }))]);
    const rows = state.rounds.map((r, i) => el('tr', { className: highlightCurrent && i === state.current ? 'current' : '' }, [
      el('td', { textContent: doubleOf(i) }),
      ...state.players.map(p => el('td', { textContent: Number.isFinite(r.scores[p.id]) ? r.scores[p.id] : '–' })),
    ]));
    const total = el('tr', { className: 'total' }, [
      el('td', { textContent: 'Total' }),
      ...state.players.map(p => el('td', { className: t[p.id] === best ? 'leader' : '', textContent: t[p.id] })),
    ]);
    table.replaceChildren(el('thead', {}, head), el('tbody', {}, [...rows, total]));
  }

  function renderFinal() {
    const t = totals();
    const ranked = state.players.slice().sort((a, b) => t[a.id] - t[b.id]);
    $('final-ranking').replaceChildren(...ranked.map(p => el('li', { textContent: `${p.name} — ${t[p.id]} pontos` })));
    renderScoreboard($('final-scoreboard'), false);
  }

  // ---------- Ações ----------

  $('form-player').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('input-player').value.trim();
    if (!name) return;
    state.players.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name });
    $('input-player').value = '';
    save(); renderSetup();
    $('input-player').focus();
  });

  $('select-max-double').addEventListener('change', (e) => { state.maxDouble = Number(e.target.value); save(); renderSetup(); });
  $('check-zero-round').addEventListener('change', (e) => { state.zeroRound = e.target.checked; save(); renderSetup(); });
  $('check-blank-100').addEventListener('change', (e) => { state.blankAlone100 = e.target.checked; save(); });

  $('btn-start').addEventListener('click', () => {
    state.rounds = [{ scores: {} }];
    state.current = 0;
    state.view = 'game';
    save(); render();
  });

  $('btn-prev-round').addEventListener('click', () => { state.current--; save(); renderGame(); });
  $('btn-next-round').addEventListener('click', () => { state.current++; save(); renderGame(); });

  $('btn-finish-round').addEventListener('click', () => {
    const round = state.rounds[state.current];
    if (!isRoundFilled(round)) {
      const missing = state.players.filter(p => !Number.isFinite(round.scores[p.id])).map(p => p.name);
      alert(`Falta lançar os pontos de: ${missing.join(', ')}`);
      return;
    }
    if (state.current === roundCount() - 1) {
      state.view = 'final';
    } else {
      state.current++;
      if (!state.rounds[state.current]) state.rounds.push({ scores: {} });
    }
    save(); render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('btn-reopen').addEventListener('click', () => { state.view = 'game'; save(); render(); });

  function newGame() {
    state = Object.assign(freshState(state.players), { maxDouble: state.maxDouble, zeroRound: state.zeroRound, blankAlone100: state.blankAlone100 });
    save(); render();
  }
  $('btn-new-game').addEventListener('click', () => {
    if (confirm('Começar um novo jogo? O placar atual será apagado.')) newGame();
  });
  $('btn-new-game-2').addEventListener('click', newGame);

  // ---------- Foto e contagem ----------

  const dialog = $('dialog-photo');
  const canvas = $('photo-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let photo = null; // { player, image, pips }

  function startPhoto(player) {
    photo = { player, image: null, pips: [] };
    $('file-input').value = '';
    $('file-input').click();
  }

  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !photo) return;
    $('photo-title').textContent = `Pedras de ${photo.player.name}`;
    if (!dialog.open) {
      $('photo-extra').value = 0;
      $('photo-blank').checked = false;
      $('photo-blank-row').hidden = !state.blankAlone100;
      dialog.showModal();
    }
    $('photo-loading').hidden = false;
    try {
      const image = await loadImage(file);
      const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      photo.image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      await new Promise(r => setTimeout(r, 30)); // deixa o "Analisando…" aparecer
      photo.pips = window.DominoDetector.detectPips(photo.image).pips;
    } catch (err) {
      alert('Não foi possível ler a foto. Tente novamente.');
      dialog.close();
      return;
    } finally {
      $('photo-loading').hidden = true;
    }
    drawPhoto();
  });

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function typicalRadius() {
    if (!photo.pips.length) return Math.max(6, canvas.width / 80);
    const rs = photo.pips.map(p => p.r).sort((a, b) => a - b);
    return rs[Math.floor(rs.length / 2)];
  }

  function drawPhoto() {
    ctx.putImageData(photo.image, 0, 0);
    const lw = Math.max(2, canvas.width / 300);
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    for (const p of photo.pips) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + lw * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    updatePhotoTotal();
  }

  function photoTotal() {
    if (state.blankAlone100 && $('photo-blank').checked) return BLANK_ALONE_POINTS;
    return photo.pips.length + (Number($('photo-extra').value) || 0);
  }

  function updatePhotoTotal() {
    $('photo-count').textContent = photo.pips.length;
    $('photo-ok-total').textContent = Math.max(0, photoTotal());
  }

  canvas.addEventListener('click', (e) => {
    if (!photo || !photo.image) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const r = typicalRadius();
    const hitRadius = Math.max(r * 1.8, 14 * canvas.width / rect.width);
    let nearest = -1, nearestDist = Infinity;
    photo.pips.forEach((p, i) => {
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < nearestDist) { nearest = i; nearestDist = dist; }
    });
    if (nearest >= 0 && nearestDist <= hitRadius) photo.pips.splice(nearest, 1);
    else photo.pips.push({ x, y, r });
    drawPhoto();
  });

  $('photo-extra').addEventListener('input', () => photo && updatePhotoTotal());
  $('photo-blank').addEventListener('change', () => photo && updatePhotoTotal());
  $('photo-retake').addEventListener('click', () => { $('file-input').value = ''; $('file-input').click(); });
  $('photo-cancel').addEventListener('click', () => dialog.close());
  $('photo-ok').addEventListener('click', () => {
    if (!photo || !photo.image) return;
    setScore(photo.player.id, Math.max(0, photoTotal()));
    dialog.close();
  });

  dialog.addEventListener('close', () => { photo = null; });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
})();
