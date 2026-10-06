/* Gestão a Vista – Delly's  |  front-end sem dependências (HTML/CSS/SVG puros) */
(() => {
'use strict';

// ======================================================================
// CONFIGURAÇÃO (espelha o dashboard.py antigo)
// ======================================================================
const ESTADOS_LABELS = {
  AM: 'Amazonas (AM)', BA: 'Bahia (BA)', DF: 'Distrito Federal (DF)',
  MG_ES: 'Minas Gerais + Espírito Santo (MG_ES)', SP: 'São Paulo (SP)', SPW: 'São Paulo WFS (SPW)',
};
const SUBF_CARGAS = { SP: ['3P', 'MALHA'], DF: ['MT', 'DF'], BA: ['SF', 'BA'], MG_ES: ['ES', 'NF', 'MG'] };
const SUBF_LIB = { DF: ['MT', 'DF'], MG_ES: ['ES', 'MG'] };
const MAPA_UF = { AM: ['AM'], BA: ['BA'], DF: ['DF'], MG: ['MG_ES'], SP: ['SP', 'SPW'] };
const SUBF_UF_REAL = { 'DF|MT': 'MT', 'MG_ES|ES': 'ES' };
const CORES_SERIE = ['#F59E0B', '#60A5FA', '#34D399', '#F472B6', '#A78BFA'];
const POR_PAGINA = 100;

// ======================================================================
// UTILITÁRIOS
// ======================================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fInt = (v) => nf0.format(Math.round(v || 0));
const fBRL = (v) => 'R$ ' + nf2.format(v || 0);
const fKg = (v) => nf2.format(v || 0) + ' kg';
const num = (v) => (typeof v === 'number' ? v : parseFloat(v) || 0);
const rotuloEstado = (e) => ESTADOS_LABELS[e] || e;

function agrupar(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
const somar = (rows, campo) => rows.reduce((a, r) => a + num(r[campo]), 0);
const distintos = (rows, campo) => new Set(rows.map((r) => r[campo]).filter((x) => x !== '' && x != null)).size;

function resumoPCV(rows, keyFn) {
  const linhas = [];
  for (const [k, rs] of agrupar(rows, keyFn)) {
    linhas.push({ chave: k, pedidos: rs.length, valor: somar(rs, 'VLTOTAL'), peso: somar(rs, 'PESOBRUTOTOT') });
  }
  return linhas.sort((a, b) => b.valor - a.valor);
}

// ======================================================================
// ESTADO GLOBAL
// ======================================================================
const S = {
  token: null, usuario: null, isAdmin: false, meta: null,
  D: {},                       // D[estado] = {liberados, montados, cargas} (arrays de objetos)
  ALL: { lib: [], mont: [], carg: [] },
  geo: null, geoPaths: null,
  filtros: { estados: [], cidades: [] },
  cidadesEstado: {},           // filtro de cidade das páginas por estado
  abas: {},                    // índice da aba ativa por tela
  det: { busca: '', ordem: 'padrao', pagina: 0 },
  pagina: 'dashboard',
};

// ======================================================================
// API / LOGIN
// ======================================================================
async function api(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
  });
  if (r.status === 401 && S.token) { sair(); throw new Error('Sessão expirada.'); }
  return r;
}

function mostrarLogin() {
  $('#app').hidden = true;
  $('#tela-login').hidden = false;
  const sel = $('#login-usuario');
  if (!sel.options.length) {
    sel.innerHTML = '<option value="ADMIN">Administrador (todos os estados)</option>' +
      Object.keys(ESTADOS_LABELS).map((e) => `<option value="${e}">${esc(ESTADOS_LABELS[e])}</option>`).join('');
  }
  $('#login-senha').value = '';
  $('#login-senha').focus();
}

async function entrar(ev) {
  ev.preventDefault();
  const btn = $('#login-btn'); const erro = $('#login-erro');
  erro.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: $('#login-usuario').value, senha: $('#login-senha').value }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Falha no login.');
    sessionStorage.setItem('gv_token', j.token);
    sessionStorage.setItem('gv_user', j.usuario);
    await iniciar();
  } catch (e) {
    erro.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

function sair() {
  sessionStorage.removeItem('gv_token'); sessionStorage.removeItem('gv_user');
  S.token = null; S.usuario = null; S.D = {};
  mostrarLogin();
}

// ======================================================================
// CARREGAMENTO DOS DADOS
// ======================================================================
function inflar(bloco, estado) {
  if (!bloco) return [];
  const { colunas, linhas } = bloco;
  const out = new Array(linhas.length);
  for (let i = 0; i < linhas.length; i++) {
    const o = { ESTADO: estado };
    const l = linhas[i];
    for (let c = 0; c < colunas.length; c++) o[colunas[c]] = l[c];
    out[i] = o;
  }
  return out;
}

async function carregarDados(rm) {
  $('#conteudo').innerHTML = '<div class="carregando"><div class="spin"></div>Carregando dados…</div>';
  S.meta = await rm.json();
  const estados = S.meta.estados || [];
  const [resp, geo] = await Promise.all([
    Promise.all(estados.map((e) => api('/api/dados?estado=' + encodeURIComponent(e)).then((r) => r.json()))),
    S.geo ? Promise.resolve(S.geo) : fetch('/brasil-estados.geojson').then((r) => r.json()).catch(() => null),
  ]);
  S.geo = geo;
  S.D = {};
  resp.forEach((p, i) => {
    const e = estados[i];
    S.D[e] = { liberados: inflar(p.liberados, e), montados: inflar(p.montados, e), cargas: inflar(p.cargas, e) };
  });
  S.ALL = { lib: [], mont: [], carg: [] };
  for (const e of estados) {
    S.ALL.lib.push(...S.D[e].liberados);
    S.ALL.mont.push(...S.D[e].montados);
    S.ALL.carg.push(...S.D[e].cargas);
  }
  if (geo && !S.geoPaths) S.geoPaths = projetarGeo(geo);
}

async function iniciar() {
  S.token = sessionStorage.getItem('gv_token');
  // O servidor decide: com login desligado responde 200 direto (acesso total);
  // com login ligado e sem sessao valida responde 401 e mostramos a tela de entrada.
  let rm;
  try { rm = await api('/api/dados'); } catch (e) { return; }
  if (rm.status === 401) { S.token = null; return mostrarLogin(); }
  if (!rm.ok) { $('#tela-login').hidden = true; $('#app').hidden = false; $('#conteudo').innerHTML = '<div class="painel"><p class="vazio">Não foi possível carregar os dados.</p></div>'; return; }
  const info = await rm.clone().json();
  S.usuario = info.usuario; S.isAdmin = info.usuario === 'ADMIN'; S.loginAtivo = !!info.login;
  $('#tela-login').hidden = true; $('#app').hidden = false;
  $('#sessao-nome').textContent = S.isAdmin ? (S.loginAtivo ? 'Administrador' : 'Acesso livre') : rotuloEstado(S.usuario);
  $('#btn-sair').hidden = !S.loginAtivo;
  try {
    await carregarDados(rm);
  } catch (e) {
    $('#conteudo').innerHTML = `<div class="painel"><p class="vazio">Não foi possível carregar os dados: ${esc(e.message)}</p></div>`;
    return;
  }
  S.filtros = { estados: [], cidades: [] };
  rotear();
}

// ======================================================================
// FILTROS / DERIVAÇÕES
// ======================================================================
function filtrar() {
  const { estados, cidades } = S.filtros;
  const temE = estados.length > 0; const temC = cidades.length > 0;
  const setE = new Set(estados); const setC = new Set(cidades);
  const lib = S.ALL.lib.filter((r) => (!temE || setE.has(r.ESTADO)) && (!temC || setC.has(r.CIDADE)));
  const montBase = S.ALL.mont.filter((r) => !temE || setE.has(r.ESTADO));      // base para comparar (sem filtro de cidade)
  const mont = temC ? montBase.filter((r) => setC.has(r.CIDADE)) : montBase;   // exibido
  const carg = S.ALL.carg.filter((r) => !temE || setE.has(r.ESTADO));
  return { lib, mont, montBase, carg, pend: pendentes(lib, montBase) };
}

// Liberados que ainda NÃO aparecem em Montados (por ESTADO + NUMPED).
// Montados sem liberado correspondente são ignorados de propósito.
function pendentes(lib, montBase) {
  if (!lib.length) return [];
  const chaves = new Set(montBase.map((r) => r.ESTADO + '|' + String(r.NUMPED).trim()));
  return lib.filter((r) => !chaves.has(r.ESTADO + '|' + String(r.NUMPED).trim()));
}

function cidadesDisponiveis(estados) {
  const set = new Set();
  const base = estados && estados.length ? S.ALL.lib.filter((r) => estados.includes(r.ESTADO)) : S.ALL.lib;
  for (const r of base) if (r.CIDADE) set.add(r.CIDADE);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ======================================================================
// COMPONENTES DE UI
// ======================================================================
function kpi(icone, label, valor, desc, serie) {
  return `<div class="kpi"><div class="ic">${icone}</div><div class="lbl">${esc(label)}</div>
    <div class="val">${esc(valor)}</div><div class="desc">${esc(desc)}</div>
    <div class="spark">${sparkline(serie)}</div></div>`;
}

function sparkline(valores, w = 110, h = 32) {
  const v = (valores || []).filter((x) => x != null);
  if (v.length < 2) return '';
  const mn = Math.min(...v); const mx = Math.max(...v); const amp = mx - mn || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((y - mn) / amp) * (h - 6)).toFixed(1)}`);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="#F59E0B" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/></svg>`;
}

function serieDiaria(rows, campo, modo) {
  const m = new Map();
  for (const r of rows) {
    const d = r.DATA; if (!d) continue;
    const [dd, mm, aa] = String(d).split('/');
    const k = `${aa}${mm}${dd}`;
    m.set(k, (m.get(k) || 0) + (modo === 'count' ? 1 : num(r[campo])));
  }
  return Array.from(m.keys()).sort().map((k) => m.get(k));
}

function kpisLiberados(lib, rotulo) {
  const sp = serieDiaria(lib, 'NUMPED', 'count');
  return `<div class="kpi-grid">
    ${kpi('📦', 'Pedidos Liberados', fInt(lib.length), rotulo || (sp.length ? `${sp.length} dia(s) no período` : 'Sem histórico diário'), sp)}
    ${kpi('💰', 'Valor Total', fBRL(somar(lib, 'VLTOTAL')), rotulo || 'Somatório dos pedidos', serieDiaria(lib, 'VLTOTAL', 'sum'))}
    ${kpi('⚖️', 'Peso Total', fKg(somar(lib, 'PESOBRUTOTOT')), rotulo || 'Somatório dos pedidos', serieDiaria(lib, 'PESOBRUTOTOT', 'sum'))}
  </div>`;
}

function painel(titulo, icone, corpo, extra = '') {
  return `<div class="painel ${extra}"><p class="painel-titulo"><span>${icone}</span>${esc(titulo)}</p>${corpo}</div>`;
}

// Tabela Pedidos/Valor/Peso com barra de peso e Total Geral
function tabelaPCV(linhas, rotulo, altura) {
  if (!linhas.length) return '<p class="vazio">Sem dados.</p>';
  const maxPeso = Math.max(...linhas.map((l) => l.peso)) || 1;
  const tot = { p: 0, v: 0, w: 0 };
  const corpo = linhas.map((l) => {
    tot.p += l.pedidos; tot.v += l.valor; tot.w += l.peso;
    return `<tr><td>${esc(l.chave)}</td><td class="num">${fInt(l.pedidos)}</td><td class="num">${fBRL(l.valor)}</td>
      <td class="num">${fKg(l.peso)}<span class="barra"><i style="width:${Math.min(100, (l.peso / maxPeso) * 100).toFixed(1)}%"></i></span></td></tr>`;
  }).join('');
  return `<div class="tabela-wrap" style="max-height:${altura || 440}px"><table class="tab">
    <thead><tr><th>${esc(rotulo)}</th><th class="num">Pedidos</th><th class="num">Valor</th><th class="num">Peso</th></tr></thead>
    <tbody>${corpo}<tr class="total"><td>Total Geral</td><td class="num">${fInt(tot.p)}</td><td class="num">${fBRL(tot.v)}</td><td class="num">${fKg(tot.w)}</td></tr></tbody></table></div>`;
}

// Barras horizontais em HTML puro. itens: [{nome, valor, texto}]
function barras(itens, opts = {}) {
  if (!itens.length) return '<p class="vazio">Sem dados.</p>';
  const max = Math.max(...itens.map((i) => i.valor)) || 1;
  return `<div class="bars">${itens.map((i) => `<div class="bar-linha" title="${esc(i.dica || i.nome)}">
    <div class="bar-nome">${esc(i.nome)}</div>
    <div class="bar-trilho"><div class="bar-fill" style="width:${Math.max(1, (i.valor / max) * 100).toFixed(1)}%"></div>
    <span class="bar-val">${esc(i.texto ?? fInt(i.valor))}</span></div></div>`).join('')}</div>`;
}

// Barras agrupadas (uma barra por série dentro de cada categoria)
function barrasAgrupadas(categorias, series, getValor) {
  const max = Math.max(1, ...categorias.flatMap((c) => series.map((s) => getValor(c, s))));
  const leg = `<div class="legenda">${series.map((s, i) => `<span><i style="background:${CORES_SERIE[i % CORES_SERIE.length]}"></i>${esc(s)}</span>`).join('')}</div>`;
  const corpo = categorias.map((c) => `<div class="bar-linha"><div class="bar-nome">${esc(c)}</div><div class="bar-grupo">
    ${series.map((s, i) => { const v = getValor(c, s); return `<div class="bar-trilho" title="${esc(c)} – ${esc(s)}: ${v}">
      <div class="bar-fill" style="width:${v ? Math.max(1, (v / max) * 100).toFixed(1) : 0}%;background:${CORES_SERIE[i % CORES_SERIE.length]}"></div>
      <span class="bar-val">${fInt(v)}</span></div>`; }).join('')}</div></div>`).join('');
  return leg + `<div class="bars">${corpo}</div>`;
}

function donut(itens) {
  const total = itens.reduce((a, i) => a + i.valor, 0);
  if (!total) return '<p class="vazio">Sem dados.</p>';
  const R = 70; const C = 2 * Math.PI * R; let acc = 0;
  const arcos = itens.map((it, i) => {
    const len = (it.valor / total) * C;
    const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${CORES_SERIE[i % CORES_SERIE.length]}" stroke-width="30"
      stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 90 90)"><title>${esc(it.nome)}: ${esc(it.texto ?? fInt(it.valor))}</title></circle>`;
    acc += len; return s;
  }).join('');
  const leg = itens.map((it, i) => `<div><i style="background:${CORES_SERIE[i % CORES_SERIE.length]}"></i><b>${esc(it.nome)}</b> — ${esc(it.texto ?? fInt(it.valor))} (${nf1.format((it.valor / total) * 100)}%)</div>`).join('');
  return `<div class="donut-wrap"><svg width="180" height="180" viewBox="0 0 180 180">${arcos}</svg><div class="donut-leg">${leg}</div></div>`;
}

// ---------- multiselect (aplica ao fechar) ----------
const MS = {};
function multiselectHTML(id, titulo, opcoes, selecionados, placeholder) {
  MS[id] = { opcoes, sel: new Set(selecionados), original: new Set(selecionados), placeholder };
  const texto = selecionados.length === 0 ? placeholder : (selecionados.length <= 2 ? selecionados.join(', ') : `${selecionados.length} selecionados`);
  return `<div class="ms" data-ms="${id}"><span style="display:block;margin-bottom:6px;color:var(--text-sub);font-size:12.5px">${esc(titulo)}</span>
    <button type="button" class="ms-btn ${selecionados.length ? '' : 'vazio'}">${esc(texto)}</button></div>`;
}
function abrirMS(el) {
  fecharMS();
  if (!el.isConnected) return; // o fechamento acima pode ter re-renderizado a tela
  const id = el.dataset.ms; const st = MS[id]; if (!st) return;
  const pop = document.createElement('div'); pop.className = 'ms-pop';
  pop.innerHTML = `<input class="input" placeholder="Buscar…"><div class="ms-lista"></div>
    <div class="ms-acoes"><button type="button" data-a="limpar">Limpar</button><button type="button" data-a="ok">Aplicar</button></div>`;
  const lista = $('.ms-lista', pop);
  const desenhar = (q = '') => {
    const f = q.trim().toLowerCase();
    lista.innerHTML = st.opcoes.filter((o) => !f || String(o).toLowerCase().includes(f)).slice(0, 400)
      .map((o) => `<label class="ms-item"><input type="checkbox" value="${esc(o)}" ${st.sel.has(o) ? 'checked' : ''}>${esc(o)}</label>`).join('') || '<div class="vazio">Nada encontrado.</div>';
  };
  desenhar();
  pop.addEventListener('input', (e) => { if (e.target.matches('.input')) desenhar(e.target.value); });
  pop.addEventListener('change', (e) => { if (e.target.matches('input[type=checkbox]')) { e.target.checked ? st.sel.add(e.target.value) : st.sel.delete(e.target.value); } });
  pop.addEventListener('click', (e) => {
    const a = e.target.dataset.a;
    if (a === 'limpar') { st.sel.clear(); desenhar($('.input', pop).value); }
    if (a === 'ok') fecharMS(true);
  });
  el.appendChild(pop); pop.dataset.id = id;
  $('.input', pop).focus();
}
function fecharMS(forcar) {
  const pop = $('.ms-pop'); if (!pop) return;
  const id = pop.dataset.id; const st = MS[id]; pop.remove();
  if (!st) return;
  const mudou = st.sel.size !== st.original.size || [...st.sel].some((x) => !st.original.has(x));
  if (mudou) aplicarMS(id, Array.from(st.sel));
}
function aplicarMS(id, valores) {
  if (id === 'f-estados') { S.filtros.estados = valores; S.filtros.cidades = []; }
  else if (id === 'f-cidades') S.filtros.cidades = valores;
  else if (id.startsWith('e-cidades-')) S.cidadesEstado[id.slice(10)] = valores;
  S.det.pagina = 0;
  render();
}

// ---------- abas ----------
function abasHTML(chave, nomes) {
  const ativa = S.abas[chave] || 0;
  return `<div class="abas" data-abas="${chave}">${nomes.map((n, i) => `<button type="button" class="aba ${i === ativa ? 'ativa' : ''}" data-i="${i}">${esc(n)}</button>`).join('')}</div>`;
}

// ======================================================================
// TABELAS DE MONTADOS x LIBERADOS / CARGAS
// ======================================================================
function tabelaComparativo(mont, lib, pend, carg, mostrarVeiculos) {
  const rm = new Map(resumoPCV(mont, (r) => r.ESTADO).map((x) => [x.chave, x]));
  const rl = new Map(resumoPCV(lib, (r) => r.ESTADO).map((x) => [x.chave, x]));
  const rp = new Map(resumoPCV(pend, (r) => r.ESTADO).map((x) => [x.chave, x]));
  const estados = Array.from(new Set([...rm.keys(), ...rl.keys(), ...rp.keys()]));
  if (!estados.length) return null;
  const get = (m, e) => m.get(e) || { pedidos: 0, valor: 0, peso: 0 };
  estados.sort((a, b) => (get(rm, b).valor + get(rl, b).valor) - (get(rm, a).valor + get(rl, a).valor));
  const veic = new Map(); let totVeic = 0;
  if (mostrarVeiculos && carg.length) {
    for (const [e, rs] of agrupar(carg, (r) => r.ESTADO)) veic.set(e, distintos(rs, 'PLACA'));
    totVeic = distintos(carg, 'PLACA');
  }
  const T = { m: [0, 0, 0], l: [0, 0, 0], p: [0, 0, 0] };
  const cel = (x) => `<td class="num">${fInt(x.pedidos)}</td><td class="num">${fBRL(x.valor)}</td><td class="num">${fKg(x.peso)}</td>`;
  const linhas = estados.map((e) => {
    const m = get(rm, e); const l = get(rl, e); const p = get(rp, e);
    T.m[0] += m.pedidos; T.m[1] += m.valor; T.m[2] += m.peso;
    T.l[0] += l.pedidos; T.l[1] += l.valor; T.l[2] += l.peso;
    T.p[0] += p.pedidos; T.p[1] += p.valor; T.p[2] += p.peso;
    const cp = p.pedidos > 0 ? 'pend' : '';
    return `<tr><td>${esc(e)}</td>${cel(m)}${mostrarVeiculos ? `<td class="num">${fInt(veic.get(e) || 0)}</td>` : ''}${cel(l)}
      <td class="num ${cp}">${fInt(p.pedidos)}</td><td class="num ${cp}">${fBRL(p.valor)}</td><td class="num ${cp}">${fKg(p.peso)}</td></tr>`;
  }).join('');
  const t = (a) => `<td class="num">${fInt(a[0])}</td><td class="num">${fBRL(a[1])}</td><td class="num">${fKg(a[2])}</td>`;
  const total = `<tr class="total"><td>Total Geral</td>${t(T.m)}${mostrarVeiculos ? `<td class="num">${fInt(totVeic)}</td>` : ''}${t(T.l)}${t(T.p)}</tr>`;
  const sub = '<th class="num">Pedidos</th><th class="num">Valor</th><th class="num">Peso</th>';
  return `<div class="tabela-wrap" style="max-height:420px"><table class="tab"><thead>
    <tr><th rowspan="2">Estado</th><th colspan="${mostrarVeiculos ? 4 : 3}" class="grp g-mont">MONTADOS</th><th colspan="3" class="grp g-lib">LIBERADOS</th><th colspan="3" class="grp g-pend">FICARAM PARA TRÁS</th></tr>
    <tr>${sub}${mostrarVeiculos ? '<th class="num">Veículos</th>' : ''}${sub}${sub}</tr></thead><tbody>${linhas}${total}</tbody></table></div>`;
}

function resumoCargasPor(carg, campo, rotulo) {
  if (!carg.length) return null;
  const linhas = [];
  for (const [k, rs] of agrupar(carg.filter((r) => campo !== 'SUBFROTA' || String(r.SUBFROTA).trim() !== ''), (r) => r[campo])) {
    const peso = somar(rs, 'PESOBRUTOTOT'); const cap = somar(rs, 'CAPACIDADEPESO');
    linhas.push({ k, rotas: rs.length, veic: distintos(rs, 'PLACA'), peso, cap, ocup: cap ? (peso / cap) * 100 : 0 });
  }
  if (!linhas.length) return null;
  linhas.sort((a, b) => b.rotas - a.rotas);
  const base = campo === 'SUBFROTA' ? carg.filter((r) => String(r.SUBFROTA).trim() !== '') : carg;
  const tp = linhas.reduce((a, l) => a + l.peso, 0); const tc = linhas.reduce((a, l) => a + l.cap, 0);
  const corpo = linhas.map((l) => `<tr><td>${esc(l.k)}</td><td class="num">${fInt(l.rotas)}</td><td class="num">${fInt(l.veic)}</td><td class="num">${fKg(l.peso)}</td><td class="num">${fKg(l.cap)}</td><td class="num">${nf1.format(l.ocup)}%</td></tr>`).join('');
  return `<div class="tabela-wrap" style="max-height:340px"><table class="tab"><thead><tr><th>${rotulo}</th><th class="num">Rotas</th><th class="num">Veículos</th><th class="num">Peso Carregado</th><th class="num">Capacidade Total</th><th class="num">Ocupação</th></tr></thead>
    <tbody>${corpo}<tr class="total"><td>Total Geral</td><td class="num">${fInt(linhas.reduce((a, l) => a + l.rotas, 0))}</td><td class="num">${fInt(distintos(base, 'PLACA'))}</td><td class="num">${fKg(tp)}</td><td class="num">${fKg(tc)}</td><td class="num">${nf1.format(tc ? (tp / tc) * 100 : 0)}%</td></tr></tbody></table></div>`;
}

function tabelaRotasPorTipo(carg, colunaPivot) {
  if (!carg.length) return null;
  const ok = (r) => r.TIPOEQUIPAMENTO != null;
  const base = carg.filter(ok);
  if (!base.length) return null;
  let pivots = [];
  if (colunaPivot) {
    const vals = Array.from(new Set(base.map((r) => String(r[colunaPivot] ?? '').trim()).filter(Boolean)));
    if (vals.length > 1) pivots = vals.sort();
  }
  const dados = colunaPivot === 'SUBFROTA' ? base.filter((r) => String(r.SUBFROTA).trim() !== '') : base;
  const tipos = agrupar(dados, (r) => r.TIPOEQUIPAMENTO);
  const linhas = Array.from(tipos.entries()).map(([t, rs]) => ({ t, rs, total: rs.length })).sort((a, b) => b.total - a.total);
  const cols = pivots.length ? [...pivots, 'Total'] : ['Total'];
  const tot = Object.fromEntries(cols.map((c) => [c, 0]));
  const corpo = linhas.map((l) => {
    const cells = cols.map((c) => {
      const v = c === 'Total' ? l.total : l.rs.filter((r) => String(r[colunaPivot]).trim() === c).length;
      tot[c] += v; return `<td class="num">${fInt(v)}</td>`;
    }).join('');
    return `<tr><td>${esc(l.t)}</td>${cells}</tr>`;
  }).join('');
  return `<div class="tabela-wrap" style="max-height:360px"><table class="tab"><thead><tr><th>Tipo de Equipamento</th>${cols.map((c) => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${corpo}<tr class="total"><td>Total Geral</td>${cols.map((c) => `<td class="num">${fInt(tot[c])}</td>`).join('')}</tr></tbody></table></div>`;
}

// Bloco "Cargas por Estado": ADMIN vê a tabela; demais veem as tipologias
function blocoCargasPorEstado(carg) {
  if (S.isAdmin) return resumoCargasPor(carg, 'ESTADO', 'Estado') || '<p class="vazio">Nenhum arquivo de CARGAS foi carregado.</p>';
  if (!carg.length) return '<p class="vazio">Nenhum arquivo de CARGAS foi carregado.</p>';
  const tipos = resumoTipos(carg);
  const total = tipos.reduce((a, t) => a + t.rotas, 0);
  return barras(tipos.map((t) => ({ nome: t.nome, valor: t.rotas, texto: `${fInt(t.rotas)} (${nf1.format((t.rotas / total) * 100)}%)` })));
}
function resumoTipos(carg) {
  return Array.from(agrupar(carg, (r) => r.TIPOEQUIPAMENTO || 'Não informado').entries())
    .map(([nome, rs]) => ({ nome, rotas: rs.length })).sort((a, b) => b.rotas - a.rotas);
}
function tituloBlocoCargas() { return S.isAdmin ? 'Cargas por Estado' : 'Tipos de Equipamento Utilizados'; }

function linhaSubfrotaTipologias(carg) {
  if (S.isAdmin || !carg.length) return '';
  const comSub = carg.filter((r) => String(r.SUBFROTA).trim() !== '');
  const subs = Array.from(new Set(comSub.map((r) => String(r.SUBFROTA).trim()))).sort();
  if (subs.length < 2) return '';
  const ordem = Array.from(agrupar(comSub, (r) => r.TIPOEQUIPAMENTO || 'Não informado').entries())
    .map(([t, rs]) => ({ t, n: rs.length })).sort((a, b) => b.n - a.n).map((x) => x.t);
  const cont = (t, s) => comSub.filter((r) => (r.TIPOEQUIPAMENTO || 'Não informado') === t && String(r.SUBFROTA).trim() === s).length;
  return `<div class="grid2" style="margin-top:14px">
    ${painel(`Tipos de Equipamento por Subfrota (${subs.join(' x ')})`, '🔀', barrasAgrupadas(ordem, subs, cont))}
    ${painel('Rotas por Tipo de Equipamento e Subfrota', '🚚', tabelaRotasPorTipo(comSub, 'SUBFROTA') || '<p class="vazio">Sem dados.</p>')}
  </div>`;
}

// Conjunto completo "Montados x Liberados" (usado no Dashboard e na página de cada estado)
function blocoMontadosLiberados(ctx) {
  const { mont, lib, pend, carg } = ctx;
  if (!mont.length && !(S.meta.estados || []).length) return '<div class="glass"><p class="vazio">Nenhum arquivo de MONTADOS foi carregado.</p></div>';
  const tab = tabelaComparativo(mont, lib, pend, carg, S.isAdmin);
  let html = painel('Montados x Liberados por Estado', '🌎', tab || '<p class="vazio">Sem dados suficientes para montar a comparação.</p>');
  const estadosCarg = new Set(carg.map((r) => r.ESTADO));
  for (const e of Object.keys(SUBF_CARGAS)) {
    if (!estadosCarg.has(e)) continue;
    const t = resumoCargasPor(carg.filter((r) => r.ESTADO === e), 'SUBFROTA', 'Subfrota');
    html += painel(`Cargas de ${e} por Subfrota (${SUBF_CARGAS[e].join(' x ')})`, '🚚', t || `<p class="vazio">Nenhum arquivo de Cargas por subfrota para ${esc(e)}.</p>`);
  }
  html += `<div class="grid2">
    ${painel(tituloBlocoCargas(), '🚛', blocoCargasPorEstado(carg))}
    ${painel('Rotas por Tipo de Equipamento', '🚚', tabelaRotasPorTipo(carg) || '<p class="vazio">Nenhum arquivo de CARGAS foi carregado.</p>')}
  </div>`;
  html += linhaSubfrotaTipologias(carg);
  return html;
}

// ======================================================================
// MAPA (SVG, sem biblioteca)
// ======================================================================
function projetarGeo(geo) {
  const K = 13, X0 = -74, Y0 = 5.4;
  const proj = (p) => `${((p[0] - X0) * K).toFixed(1)},${((Y0 - p[1]) * K).toFixed(1)}`;
  const anel = (ring) => 'M' + ring.map(proj).join('L') + 'Z';
  return geo.features.map((f) => {
    const polis = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    return { sigla: f.properties.sigla, nome: f.properties.nome, d: polis.map((p) => p.map(anel).join('')).join('') };
  });
}
function corEscala(t) {
  const st = [[58, 36, 16], [138, 74, 0], [245, 158, 11], [253, 186, 116]];
  const x = Math.min(1, Math.max(0, t)) * (st.length - 1); const i = Math.min(st.length - 2, Math.floor(x)); const f = x - i;
  const c = st[i].map((v, k) => Math.round(v + (st[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function mapaHTML(lib) {
  if (!S.geoPaths) return '<p class="vazio">Não foi possível carregar o mapa.</p>';
  const valor = {}; const pedidos = {};
  for (const [e, rs] of agrupar(lib, (r) => r.ESTADO)) { valor[e] = somar(rs, 'VLTOTAL'); pedidos[e] = rs.length; }
  const extra = {};
  for (const [par, uf] of Object.entries(SUBF_UF_REAL)) {
    const [base, sub] = par.split('|');
    const rs = lib.filter((r) => r.ESTADO === base && String(r.SUBFROTA).trim() === sub);
    if (!rs.length) continue;
    const v = somar(rs, 'VLTOTAL');
    valor[base] = (valor[base] || 0) - v; pedidos[base] = (pedidos[base] || 0) - rs.length;
    extra[uf] = extra[uf] || { v: 0, p: 0 }; extra[uf].v += v; extra[uf].p += rs.length;
  }
  const dadosUF = {};
  for (const f of S.geoPaths) {
    const sistemas = MAPA_UF[f.sigla] || [];
    let v = sistemas.reduce((a, s) => a + (valor[s] || 0), 0); let p = sistemas.reduce((a, s) => a + (pedidos[s] || 0), 0);
    let tem = sistemas.some((s) => s in valor);
    if (extra[f.sigla]) { v += extra[f.sigla].v; p += extra[f.sigla].p; tem = true; }
    dadosUF[f.sigla] = { v, p, tem, sistemas };
  }
  const max = Math.max(1, ...Object.values(dadosUF).filter((d) => d.tem).map((d) => d.v));
  const selUF = new Set(Object.entries(MAPA_UF).filter(([, ss]) => ss.some((s) => S.filtros.estados.includes(s))).map(([uf]) => uf));
  const paths = S.geoPaths.map((f) => {
    const d = dadosUF[f.sigla];
    const fill = d.tem ? corEscala(d.v / max) : '#141821';
    return `<path class="${d.tem ? 'dados' : ''} ${selUF.has(f.sigla) ? 'sel' : ''}" data-uf="${f.sigla}" d="${f.d}" fill="${fill}" fill-opacity="${selUF.size && !selUF.has(f.sigla) ? .55 : 1}"/>`;
  }).join('');
  S._mapaDados = dadosUF;
  return `<svg class="mapa-svg" viewBox="0 0 520 512" role="img" aria-label="Mapa do Brasil">${paths}</svg>
    <p class="dica">${S.isAdmin ? 'Clique em um estado do mapa para ver somente os dados dele. ' : ''}Estados sem dados aparecem escurecidos.</p>`;
}

// ======================================================================
// VISÕES
// ======================================================================
function filtrosGlobaisHTML() {
  const estadosDisp = S.meta.estados || [];
  const cidades = cidadesDisponiveis(S.filtros.estados);
  const colE = S.isAdmin
    ? multiselectHTML('f-estados', '🌎 Estado', estadosDisp, S.filtros.estados, 'Todos os estados')
    : `<div><span style="display:block;margin-bottom:6px;color:var(--text-sub);font-size:12.5px">🌎 Estado</span><div class="estado-fixo">${esc(rotuloEstado(S.usuario))}</div></div>`;
  return `<div class="glass"><div class="filtros"><p class="titulo">🔎 Filtros</p>${colE}
    ${multiselectHTML('f-cidades', '🏙️ Cidade', cidades, S.filtros.cidades.filter((c) => cidades.includes(c)), 'Todas as cidades')}</div></div>`;
}

function topo(titulo, sub) {
  return `<div class="topo"><div><h2>${titulo}</h2><div class="sub">${esc(sub)}</div></div>
    <div class="meta"><div>Última atualização dos dados</div><div class="val">${esc(S.meta.atualizado_em || '—')}</div></div></div>`;
}

function viewPorEstados(F) {
  if (!F.lib.length) return '<p class="vazio">Nenhum dado disponível.</p>';
  const resumo = resumoPCV(F.lib, (r) => r.ESTADO);
  const estados = new Set(resumo.map((r) => r.chave));
  const somenteSP = estados.size === 1 && estados.has('SP');
  let tabSub = null;
  if (estados.size === 1) {
    const [e] = estados;
    if (SUBF_LIB[e]) {
      const m = new Map(resumoPCV(F.lib.filter((r) => String(r.SUBFROTA).trim() !== ''), (r) => String(r.SUBFROTA).trim()).map((x) => [x.chave, x]));
      const linhas = SUBF_LIB[e].map((s) => m.get(s) || { chave: s, pedidos: 0, valor: 0, peso: 0 });
      tabSub = { html: tabelaPCV(linhas, 'Subfrota', 340), nomes: SUBF_LIB[e] };
    }
  }
  const mapa = painel('Distribuição por Estado', '🗺️', mapaHTML(F.lib));
  if (tabSub) return `<div class="grid-map">${painel(`Pedidos por Subfrota (${tabSub.nomes.join(' x ')})`, '🔀', tabSub.html)}${mapa}</div>`;
  if (somenteSP) return `<div class="grid-map">${painel('Resumo por Estado', '📄', tabelaPCV(resumo, 'Estado', 340))}${mapa}</div>`;
  const graf = barras(resumo.map((r) => ({ nome: r.chave, valor: r.valor, texto: fBRL(r.valor), dica: `${r.chave}: ${fBRL(r.valor)} • ${fInt(r.pedidos)} pedidos` })));
  return `<div class="grid3">${painel('Resumo por Estado', '📄', tabelaPCV(resumo, 'Estado', 340))}${painel('Valor por Estado', '📈', graf)}${mapa}</div>`;
}

function viewMunicipio(lib) {
  if (!lib.length) return '<p class="vazio">Nenhum dado disponível.</p>';
  const resumo = resumoPCV(lib, (r) => r.CIDADE || '(sem cidade)');
  const top = resumo.slice(0, 10).map((r) => ({ nome: r.chave, valor: r.valor, texto: fBRL(r.valor), dica: `${r.chave}: ${fInt(r.pedidos)} pedidos` }));
  return `<h3 class="sec">Resumo por Município</h3><div class="grid2">${painel('Tabela por Município', '🏙️', tabelaPCV(resumo, 'Cidade'))}${painel('Top 10 Cidades por Valor', '📊', barras(top))}</div>`;
}

function viewPraca(lib) {
  if (!lib.length || !lib.some((r) => r.PRACA)) return '<p class="vazio">Nenhum dado disponível.</p>';
  const resumo = resumoPCV(lib, (r) => r.PRACA || '(sem praça)');
  const graf = barras(resumo.slice(0, 20).map((r) => ({ nome: r.chave, valor: r.valor, texto: fBRL(r.valor), dica: `${r.chave}: ${fInt(r.pedidos)} pedidos` })));
  const tipos = resumoPCV(lib, (r) => r.TIPOVENDA || 'Não informado').map((r) => ({ nome: r.chave, valor: r.valor, texto: fBRL(r.valor) }));
  return `<h3 class="sec">Quantitativo por Praça</h3><div class="grid2">${painel('Valor por Praça (top 20)', '📍', graf)}${painel('Distribuição por Tipo de Venda', '🧾', donut(tipos))}</div>
    <h3 class="sec">Tabela por Praça</h3>${tabelaPCV(resumo, 'Praça')}`;
}

const COLS_DET = ['NUMPED', 'ESTADO', 'DATA', 'NOMECLIENTE', 'CIDADE', 'PRACA', 'NOMESUP', 'NOMERCA', 'POSICAO', 'TIPOVENDA', 'VLTOTAL', 'PESOBRUTOTOT', 'DTENTREGA', 'NUMCARREGAMENTO', 'PLACA', 'DESTINO'];
function detalhesLinhas(lib) {
  let rows = lib;
  const q = S.det.busca.trim().toLowerCase();
  if (q) rows = rows.filter((r) => COLS_DET.some((c) => String(r[c] ?? '').toLowerCase().includes(q)));
  if (S.det.ordem === 'maior') rows = [...rows].sort((a, b) => num(b.VLTOTAL) - num(a.VLTOTAL));
  if (S.det.ordem === 'menor') rows = [...rows].sort((a, b) => num(a.VLTOTAL) - num(b.VLTOTAL));
  return rows;
}
function detalhesTabelaHTML(lib) {
  const cols = COLS_DET.filter((c) => lib.some((r) => r[c] !== undefined && r[c] !== ''));
  const rows = detalhesLinhas(lib);
  const paginas = Math.max(1, Math.ceil(rows.length / POR_PAGINA));
  S.det.pagina = Math.min(S.det.pagina, paginas - 1);
  const fatia = rows.slice(S.det.pagina * POR_PAGINA, (S.det.pagina + 1) * POR_PAGINA);
  const fmt = (c, v) => (c === 'VLTOTAL' ? fBRL(num(v)) : c === 'PESOBRUTOTOT' ? fKg(num(v)) : esc(v));
  const corpo = fatia.map((r) => `<tr>${cols.map((c) => `<td class="${c === 'VLTOTAL' || c === 'PESOBRUTOTOT' ? 'num' : ''}">${fmt(c, r[c])}</td>`).join('')}</tr>`).join('');
  return `<div class="cap">${fInt(rows.length)} pedidos encontrados</div>
    <div class="tabela-wrap alta"><table class="tab"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table></div>
    <div class="pag"><button class="btn ghost" data-pag="-1" ${S.det.pagina === 0 ? 'disabled' : ''}>← Anterior</button>
      <span>Página ${S.det.pagina + 1} de ${paginas}</span>
      <button class="btn ghost" data-pag="1" ${S.det.pagina >= paginas - 1 ? 'disabled' : ''}>Próxima →</button></div>`;
}
function viewDetalhes(lib) {
  return `<h3 class="sec">Todos os Pedidos</h3>
    <div class="busca-linha">
      <label class="campo" style="margin:0"><span>🔍 Busca rápida (qualquer campo)</span><input id="det-busca" class="input" placeholder="Digite para filtrar…" value="${esc(S.det.busca)}"></label>
      <label class="campo" style="margin:0"><span>Ordenar por</span><select id="det-ordem" class="input">
        <option value="padrao" ${S.det.ordem === 'padrao' ? 'selected' : ''}>Padrão</option>
        <option value="maior" ${S.det.ordem === 'maior' ? 'selected' : ''}>Maior Valor</option>
        <option value="menor" ${S.det.ordem === 'menor' ? 'selected' : ''}>Menor Valor</option></select></label>
      <button id="det-export" class="btn" type="button">⬇️ Exportar CSV</button>
    </div><div id="det-tabela">${detalhesTabelaHTML(lib)}</div>`;
}
function exportarCSV(lib) {
  const cols = COLS_DET.filter((c) => lib.some((r) => r[c] !== undefined && r[c] !== ''));
  const rows = detalhesLinhas(lib);
  const cel = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => cel(typeof r[c] === 'number' && (c === 'VLTOTAL' || c === 'PESOBRUTOTOT') ? String(r[c]).replace('.', ',') : r[c])).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'pedidos_filtrados.csv'; a.click(); URL.revokeObjectURL(a.href);
}

function viewCargas(carg, mostrarEstado) {
  if (!carg.length) return '<div class="glass"><p class="vazio">Nenhum arquivo de CARGAS foi carregado.</p></div>';
  const totalParadas = somar(carg, 'NUMPARADAS');
  const media = carg.length ? totalParadas / carg.length : 0;
  const kp = `<div class="kpi-grid">
    ${kpi('🚛', 'Total de Rotas', fInt(carg.length), 'Nos dados atuais', [])}
    ${kpi('🛑', 'Média de Paradas por Rota', nf1.format(media), `${fInt(totalParadas)} paradas no total`, [])}
    ${kpi('📦', 'Total de Ordens nas Rotas', fInt(somar(carg, 'NUMORDENS')), 'Nos dados atuais', [])}</div>`;
  const tipos = resumoTipos(carg);
  const porGeo = mostrarEstado
    ? Array.from(agrupar(carg, (r) => r.ESTADO).entries()).map(([n, rs]) => ({ nome: n, valor: rs.length })).sort((a, b) => b.valor - a.valor)
    : tipos.map((t) => ({ nome: t.nome, valor: t.rotas }));
  const cruz = (() => {
    const ests = Array.from(new Set(carg.map((r) => r.ESTADO))).sort();
    const cats = tipos.map((t) => t.nome);
    return barrasAgrupadas(cats, ests, (c, e) => carg.filter((r) => (r.TIPOEQUIPAMENTO || 'Não informado') === c && r.ESTADO === e).length);
  })();
  const medias = Array.from(agrupar(carg, (r) => r.TIPOEQUIPAMENTO || 'Não informado').entries())
    .map(([n, rs]) => ({ nome: n, valor: somar(rs, 'NUMPARADAS') / rs.length, texto: nf1.format(somar(rs, 'NUMPARADAS') / rs.length), dica: `${n}: ${rs.length} rotas` })).sort((a, b) => b.valor - a.valor);
  return kp + `<div class="grid2">
      ${painel('Tipo de Equipamentos', '🚚', donut(tipos.map((t) => ({ nome: t.nome, valor: t.rotas }))))}
      ${painel(`Quantidade de Rotas ${mostrarEstado ? 'por Estado' : 'por Tipo de Equipamento'}`, '📊', barras(porGeo))}
    </div><div class="grid2">
      ${painel('Rotas por Tipo de Equipamento', '📈', cruz)}
      ${painel('Média de Paradas por Tipo de Equipamento', '🛑', barras(medias))}
    </div>`;
}

function viewMontados(F) {
  if (!S.ALL.mont.length) return '<div class="glass"><p class="vazio">Nenhum arquivo de <b>MONTADOS</b> foi carregado ainda. Suba os arquivos na pasta <b>dados/</b> do GitHub (ex.: MONTADOS_SP.xlsx) junto com os de LIBERADOS.</p></div>';
  return blocoMontadosLiberados({ mont: F.mont, lib: F.lib, pend: F.pend, carg: F.carg });
}

// ---------- páginas ----------
function paginaGlobal(nome) {
  const F = filtrar();
  const titulos = { dashboard: ['📊 Dashboard', 'Visão geral dos pedidos liberados e montados'], pedidos: ['📦 Pedidos', 'Todos os pedidos liberados'], estados: ['🗺️ Estados', 'Distribuição por estado'],
    cargas: ['🚛 Cargas', 'Rotas e equipamentos'], mapas: ['📍 Mapas', 'Valor por estado no mapa do Brasil'], relatorios: ['📈 Relatórios', 'Município e praça'] };
  const [t, s] = titulos[nome];
  let html = topo(t, s) + filtrosGlobaisHTML();
  if (nome !== 'cargas') html += kpisLiberados(F.lib);
  if (!F.lib.length && nome !== 'cargas') return html + '<div class="glass"><p class="vazio">Nenhum pedido de LIBERADOS para os filtros atuais.</p></div>';

  if (nome === 'dashboard') {
    html += abasHTML('dash', ['Por Estados', 'Por Município', 'Detalhes dos Pedidos', 'Montados']);
    const i = S.abas.dash || 0;
    html += i === 0 ? viewPorEstados(F) : i === 1 ? viewMunicipio(F.lib) : i === 2 ? viewDetalhes(F.lib) : viewMontados(F);
  } else if (nome === 'pedidos') html += viewDetalhes(F.lib);
  else if (nome === 'estados') html += viewPorEstados(F);
  else if (nome === 'cargas') html += viewCargas(F.carg, S.isAdmin);
  else if (nome === 'mapas') html += painel('Mapa do Brasil – Valor por Estado', '🗺️', mapaHTML(F.lib));
  else if (nome === 'relatorios') html += viewMunicipio(F.lib) + viewPraca(F.lib);
  return html;
}

function paginaEstado(estado) {
  const d = S.D[estado];
  if (!d || (!S.isAdmin && estado !== S.usuario)) return topo('🟠 ' + esc(rotuloEstado(estado)), '') + '<div class="glass"><p class="vazio">Você não tem permissão para ver os dados desse estado.</p></div>';
  const cidades = cidadesEstadoSel(estado);
  const setC = new Set(cidades);
  const lib = cidades.length ? d.liberados.filter((r) => setC.has(r.CIDADE)) : d.liberados;
  const mont = cidades.length ? d.montados.filter((r) => setC.has(r.CIDADE)) : d.montados;
  const pend = pendentes(lib, d.montados);
  const opcoes = Array.from(new Set(d.liberados.map((r) => r.CIDADE).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let html = topo('🟠 ' + esc(rotuloEstado(estado)), 'Dados individuais deste estado');
  if (!d.liberados.length) return html + `<div class="glass"><p class="vazio">Nenhum pedido de LIBERADOS carregado para ${esc(rotuloEstado(estado))} ainda.</p></div>`;
  html += `<div class="glass"><div class="filtros"><p class="titulo">🔎 Filtros do estado</p>${multiselectHTML('e-cidades-' + estado, '🏙️ Cidade', opcoes, cidades, 'Todas as cidades')}</div></div>`;
  html += kpisLiberados(lib, rotuloEstado(estado));
  if (SUBF_LIB[estado]) {
    const subs = Array.from(new Set(lib.map((r) => String(r.SUBFROTA).trim()).filter(Boolean))).sort();
    if (subs.length >= 2) {
      html += painel(`Pedidos Liberados por Subfrota (${subs.join(' x ')})`, '🔀', tabelaPCV(resumoPCV(lib.filter((r) => String(r.SUBFROTA).trim()), (r) => String(r.SUBFROTA).trim()), 'Subfrota', 260));
    }
  }
  const chave = 'estado-' + estado;
  html += abasHTML(chave, ['Por Município', 'Por Praça', 'Detalhes dos Pedidos', 'Montados x Liberados', 'Cargas']);
  const i = S.abas[chave] || 0;
  html += i === 0 ? viewMunicipio(lib) : i === 1 ? viewPraca(lib) : i === 2 ? viewDetalhes(lib)
    : i === 3 ? blocoMontadosLiberados({ mont, lib, pend, carg: d.cargas }) : viewCargas(d.cargas, false);
  S._detBase = lib;
  return html;
}
function cidadesEstadoSel(estado) { return S.cidadesEstado[estado] || []; }

function paginaDados() {
  if (!S.isAdmin) return topo('⚙️ Dados', '') + '<div class="glass"><p class="vazio">Somente o administrador vê esta página.</p></div>';
  const arqs = S.meta.arquivos || []; const erros = S.meta.erros || []; const avisos = S.meta.avisos || [];
  const linhas = arqs.map((a) => `<tr><td>${esc(a.arquivo)}</td><td>${esc(a.estado)}</td><td>${esc(a.tipo)}</td><td>${esc(a.subfrota || '—')}</td><td class="num">${fInt(a.linhas)}</td></tr>`).join('');
  return topo('⚙️ Dados', 'Arquivos processados na última atualização') +
    painel('Arquivos lidos da pasta dados/', '📂', `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Arquivo</th><th>Estado</th><th>Tipo</th><th>Subfrota</th><th class="num">Linhas</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <p class="cap">Para atualizar: substitua os arquivos na pasta <b>dados/</b> do repositório no GitHub. O site se atualiza sozinho em ~1 minuto.</p>`) +
    (avisos.length ? painel('Atenção: possível duplicidade', '🟡', `<ul>${avisos.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`) : '') +
    (erros.length ? painel('Arquivos com problema', '⚠️', `<ul>${erros.map((e) => `<li class="erro">${esc(e)}</li>`).join('')}</ul>`) : '');
}

// ======================================================================
// ROTEAMENTO / RENDER
// ======================================================================
const NAV = [['dashboard', '📊', 'Dashboard'], ['pedidos', '📦', 'Pedidos'], ['estados', '🗺️', 'Estados'], ['cargas', '🚛', 'Cargas'], ['mapas', '📍', 'Mapas'], ['relatorios', '📈', 'Relatórios']];

function rotear() {
  const h = (location.hash || '#/dashboard').replace(/^#\//, '');
  S.pagina = h || 'dashboard';
  S.det = { busca: '', ordem: 'padrao', pagina: 0 };
  render();
}

function renderNav() {
  let html = NAV.map(([k, ic, n]) => `<a href="#/${k}" class="${S.pagina === k ? 'ativo' : ''}">${ic}&nbsp; ${n}</a>`).join('');
  if (S.isAdmin) html += `<a href="#/dados" class="${S.pagina === 'dados' ? 'ativo' : ''}">⚙️&nbsp; Dados</a>`;
  const ests = S.meta.estados || [];
  if (ests.length) {
    html += '<div class="secao">Páginas por estado</div>' + ests.map((e) => `<a href="#/estado/${e}" class="${S.pagina === 'estado/' + e ? 'ativo' : ''}">🟠&nbsp; ${esc(e)}</a>`).join('');
  }
  $('#nav').innerHTML = html;
}

function render() {
  fecharMS();
  renderNav();
  const y = window.scrollY;
  let html;
  if (S.pagina.startsWith('estado/')) html = paginaEstado(S.pagina.slice(7));
  else if (S.pagina === 'dados') html = paginaDados();
  else if (['dashboard', 'pedidos', 'estados', 'cargas', 'mapas', 'relatorios'].includes(S.pagina)) html = paginaGlobal(S.pagina);
  else html = paginaGlobal('dashboard');
  $('#conteudo').innerHTML = html;
  window.scrollTo(0, y);
  $('#sidebar').classList.remove('aberta');
}

// base atual dos pedidos para a tabela de detalhes (busca/ordem/paginação sem re-render completo)
function baseDetalhes() {
  if (S.pagina.startsWith('estado/')) {
    const e = S.pagina.slice(7); const d = S.D[e]; const c = cidadesEstadoSel(e);
    return c.length ? d.liberados.filter((r) => c.includes(r.CIDADE)) : d.liberados;
  }
  return filtrar().lib;
}

// ======================================================================
// EVENTOS
// ======================================================================
document.addEventListener('click', (e) => {
  const msBtn = e.target.closest('.ms-btn');
  if (msBtn) { const ms = msBtn.closest('.ms'); if ($('.ms-pop', ms)) fecharMS(); else abrirMS(ms); return; }
  if (!e.target.closest('.ms-pop')) fecharMS();

  const aba = e.target.closest('.aba');
  if (aba) { S.abas[aba.parentElement.dataset.abas] = +aba.dataset.i; S.det.pagina = 0; render(); return; }

  const pag = e.target.closest('[data-pag]');
  if (pag) { S.det.pagina += +pag.dataset.pag; $('#det-tabela').innerHTML = detalhesTabelaHTML(baseDetalhes()); return; }

  if (e.target.id === 'det-export') { exportarCSV(baseDetalhes()); return; }

  const uf = e.target.closest('path[data-uf]');
  if (uf && S.isAdmin) {
    const d = S._mapaDados && S._mapaDados[uf.dataset.uf];
    if (d && d.tem && d.sistemas.length) {
      const atual = S.filtros.estados;
      const igual = atual.length === d.sistemas.length && d.sistemas.every((s) => atual.includes(s));
      S.filtros = { estados: igual ? [] : d.sistemas.slice(), cidades: [] };
      render();
    }
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMS(); });
document.addEventListener('input', (e) => {
  if (e.target.id === 'det-busca') { S.det.busca = e.target.value; S.det.pagina = 0; $('#det-tabela').innerHTML = detalhesTabelaHTML(baseDetalhes()); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'det-ordem') { S.det.ordem = e.target.value; S.det.pagina = 0; $('#det-tabela').innerHTML = detalhesTabelaHTML(baseDetalhes()); }
});
document.addEventListener('mousemove', (e) => {
  const tip = $('#tip'); const p = e.target.closest && e.target.closest('path[data-uf]');
  if (!p || !S._mapaDados) { tip.hidden = true; return; }
  const d = S._mapaDados[p.dataset.uf]; const nome = (S.geoPaths.find((f) => f.sigla === p.dataset.uf) || {}).nome || p.dataset.uf;
  tip.innerHTML = d && d.tem ? `<b>${esc(nome)}</b><br>Valor: ${fBRL(d.v)}<br>Pedidos: ${fInt(d.p)}` : `<b>${esc(nome)}</b><br>Sem dados`;
  tip.hidden = false; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
});
window.addEventListener('hashchange', () => { if (S.token && !$('#app').hidden && S.meta) rotear(); });
$('#form-login').addEventListener('submit', entrar);
$('#btn-sair').addEventListener('click', sair);
$('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('aberta'));

iniciar();
})();
