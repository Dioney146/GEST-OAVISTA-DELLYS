/* =========================================================
   Liberados x Montados — Delly's
   Site estático: lê as planilhas no navegador e guarda o
   histórico de importações no próprio navegador (IndexedDB).
   ========================================================= */

/* ---------- Configuração ---------- */

// Como cada arquivo vira um "estado" do painel (pelo nome do arquivo)
//   MONTADOS_BA_SF -> BA
//   SP_WFS         -> SPW
const GRUPO_ESTADO = { SP_WFS: "SPW", BA_SF: "BA", D_F: "DF" };

// Separação MG x ES nos LIBERADOS pela CIDADE (o Whyntor mistura os dois estados):
//   LIBERADOS_ES -> só pedidos de cidades do Espírito Santo
//   LIBERADOS_MG -> tira os pedidos de cidades do Espírito Santo
const FILTRO_CIDADE_LIB = {
  ES: "incluirES",
  MG: "excluirES",
};

// Os 78 municípios do Espírito Santo (sem acento, maiúsculas)
const CIDADES_ES = new Set([
  "AFONSO CLAUDIO", "AGUA DOCE DO NORTE", "AGUIA BRANCA", "ALEGRE", "ALFREDO CHAVES", "ALTO RIO NOVO",
  "ANCHIETA", "APIACA", "ARACRUZ", "ATILIO VIVACQUA", "BAIXO GUANDU", "BARRA DE SAO FRANCISCO",
  "BOA ESPERANCA", "BOM JESUS DO NORTE", "BREJETUBA", "CACHOEIRO DE ITAPEMIRIM", "CARIACICA", "CASTELO",
  "COLATINA", "CONCEICAO DA BARRA", "CONCEICAO DO CASTELO", "DIVINO DE SAO LOURENCO", "DOMINGOS MARTINS",
  "DORES DO RIO PRETO", "ECOPORANGA", "FUNDAO", "GOVERNADOR LINDENBERG", "GUACUI", "GUARAPARI", "IBATIBA",
  "IBIRACU", "IBITIRAMA", "ICONHA", "IRUPI", "ITAGUACU", "ITAPEMIRIM", "ITARANA", "IUNA", "JAGUARE",
  "JERONIMO MONTEIRO", "JOAO NEIVA", "LARANJA DA TERRA", "LINHARES", "MANTENOPOLIS", "MARATAIZES",
  "MARECHAL FLORIANO", "MARILANDIA", "MIMOSO DO SUL", "MONTANHA", "MUCURICI", "MUNIZ FREIRE", "MUQUI",
  "NOVA VENECIA", "PANCAS", "PEDRO CANARIO", "PINHEIROS", "PIUMA", "PONTO BELO", "PRESIDENTE KENNEDY",
  "RIO BANANAL", "RIO NOVO DO SUL", "SANTA LEOPOLDINA", "SANTA MARIA DE JETIBA", "SANTA TERESA",
  "SAO DOMINGOS DO NORTE", "SAO GABRIEL DA PALHA", "SAO JOSE DO CALCADO", "SAO MATEUS", "SAO ROQUE DO CANAA",
  "SERRA", "SOORETAMA", "VARGEM ALTA", "VENDA NOVA DO IMIGRANTE", "VIANA", "VILA PAVAO", "VILA VALERIO",
  "VILA VELHA", "VITORIA",
]);

// Nomes que existem em MG e no ES: decide pela longitude (o ES fica a leste de -42°)
const CIDADES_AMBIGUAS = new Set(["BOA ESPERANCA"]);

// "Estado da Ordem" do RoadNet que NUNCA conta como montado (sem acento, maiúsculas)
const ESTADOS_NAO_MONTADO = new Set(["NAO ATENDIDO"]);

// Em quais estados do mapa cada grupo aparece
const MAPA_UF = { MG: ["mg"], ES: ["es"], SPW: ["sp"], SP: ["sp"], AM: ["am"], BA: ["ba"], DF: ["df"], MT: ["mt"] };

/* ---------- Utilidades ---------- */

const $ = (id) => document.getElementById(id);
const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtR = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKg = (n) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg";
const fmtPct = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dataBR = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");

function chave(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim().replace(/\.0+$/, "");
}

// "1.576,68" -> 1576.68
function numeroBR(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = s.includes(",") ? +s.replace(/\./g, "").replace(",", ".") : +s;
  return isNaN(n) ? 0 : n;
}

// Cidade sem acento e em maiúsculas (o RoadNet às vezes exporta "S�O PAULO")
function normCidade(s) {
  return String(s ?? "").replace(/�/g, "A").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

function dataISO(v) {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

/* ---------- Nome do arquivo -> tipo e estado ---------- */

function tipoDoArquivo(nome) {
  const n = nome.toUpperCase();
  if (/LIBERAD/.test(n)) return "lib";
  if (/MONTAD/.test(n)) return "mon";
  return null;
}

function estadoDoArquivo(nome) {
  let s = nome.toUpperCase().replace(/\.(XLSX?|XLSM|CSV)$/, "");
  s = s.replace(/^.*?(LIBERADOS?|MONTADOS?)[\s_-]*/, "");
  s = s.replace(/[()]/g, " ").replace(/\./g, "_").trim().replace(/[\s_-]+/g, "_");
  if (s === "D_F") s = "DF";
  if (GRUPO_ESTADO[s]) return GRUPO_ESTADO[s];
  s = s.replace(/_SF$/, "");
  return GRUPO_ESTADO[s] || s || "GERAL";
}

// O pedido é de uma cidade do Espírito Santo?
function cidadeES(r) {
  if (!CIDADES_ES.has(r.cid)) return false;
  if (CIDADES_AMBIGUAS.has(r.cid)) return typeof r.lon === "number" && r.lon > -42;
  return true;
}

// O pedido liberado entra na conta deste estado?
function entraNoEstado(r, estado) {
  const regra = FILTRO_CIDADE_LIB[estado];
  if (regra === "incluirES") return cidadeES(r);
  if (regra === "excluirES") return !cidadeES(r);
  return true;
}

/* ---------- Leitura e enxugamento das planilhas ---------- */

function lerPlanilha(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
        let linhas = [];
        wb.SheetNames.forEach((n) => (linhas = linhas.concat(XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "", raw: true }))));
        resolve(linhas.map((l) => {
          const o = {};
          for (const k in l) o[String(k).trim().toUpperCase()] = l[k];
          return o;
        }));
      } catch (err) { reject(err); }
    };
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

// Guarda só o que o painel usa (deixa o histórico leve)
function enxugarLiberado(l) {
  const p = chave(l["NUMPED"] ?? l["PEDIDO"]);
  if (!p || !/\d/.test(p)) return null;
  const d = dataISO(l["DATA"]);
  const h = +l["HORA"], m = +l["MINUTO"];
  const libEm = d && !isNaN(h) ? `${d}T${String(h).padStart(2, "0")}:${String(isNaN(m) ? 0 : m).padStart(2, "0")}` : "";
  return {
    p,
    pos: String(l["POSICAO"] ?? "").trim().toUpperCase(),
    cli: String(l["NOMECLIENTE"] ?? ""),
    cid: normCidade(l["CIDADE"]),
    pr: String(l["PRACA"] ?? ""),
    sup: String(l["NOMESUP"] ?? ""),
    fil: chave(l["CODFILIAL"]),
    v: numeroBR(l["VLTOTAL"]),
    w: numeroBR(l["PESOBRUTOTOT"]),
    ent: dataISO(l["DTENTREGA"]),
    lib: libEm,
    lon: l["LONGITUDE"] === "" || l["LONGITUDE"] === undefined || isNaN(numeroBR(l["LONGITUDE"])) ? null : numeroBR(l["LONGITUDE"]),
  };
}

function enxugarMontado(l) {
  const p = chave(l["NÚMERO DO PEDIDO"] ?? l["NUMERO DO PEDIDO"] ?? l["NUMPED"]);
  if (!p || !/\d/.test(p)) return null;
  return {
    p,
    cli: String(l["CLIENTE"] ?? ""),
    cid: normCidade(l["CIDADE"]),
    fil: chave(l["FILIAL"]),
    v: numeroBR(l["ENTREGA VALOR"]),
    w: numeroBR(l["ENTREGA PESO"]),
    rota: String(l["DESCRIÇÃO DA ROTA"] ?? "").trim(),
    cod: chave(l["CODROTA"]),
    idr: chave(l["ID DA ROTA"]),
    st: String(l["ESTADO DA ORDEM"] ?? "").trim(),
  };
}

/* ---------- Histórico (IndexedDB) ---------- */

const DB = {
  db: null,
  memoria: new Map(),
  async abrir() {
    if (!("indexedDB" in window)) return;
    try {
      this.db = await new Promise((ok, erro) => {
        const req = indexedDB.open("liberados-x-montados", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("importacoes", { keyPath: "data" });
        req.onsuccess = () => ok(req.result);
        req.onerror = () => erro(req.error);
      });
    } catch (e) { console.warn("Sem IndexedDB, histórico só nesta aba.", e); this.db = null; }
  },
  async todos() {
    if (!this.db) return [...this.memoria.values()];
    return new Promise((ok, erro) => {
      const req = this.db.transaction("importacoes").objectStore("importacoes").getAll();
      req.onsuccess = () => ok(req.result || []);
      req.onerror = () => erro(req.error);
    });
  },
  async salvar(snap) {
    if (!this.db) { this.memoria.set(snap.data, snap); return; }
    return new Promise((ok, erro) => {
      const tx = this.db.transaction("importacoes", "readwrite");
      tx.objectStore("importacoes").put(snap);
      tx.oncomplete = ok; tx.onerror = () => erro(tx.error);
    });
  },
  async apagar(data) {
    if (!this.db) { this.memoria.delete(data); return; }
    return new Promise((ok, erro) => {
      const tx = this.db.transaction("importacoes", "readwrite");
      tx.objectStore("importacoes").delete(data);
      tx.oncomplete = ok; tx.onerror = () => erro(tx.error);
    });
  },
};

/* ---------- Estado da aplicação ---------- */

let SNAPS = new Map();   // data -> { data, arquivos: { nome: { tipo, estado, linhas } } }
let LIB = [];            // liberados processados (todas as datas)
let MON = [];            // montados processados (todas as datas)
let abaAtual = "estados";
let ordemDet = { col: null, asc: true };
let dataPreferida = null; // data a selecionar no filtro depois de uma importação

/* ---------- Processamento ---------- */

function naoMontado(m) {
  return ESTADOS_NAO_MONTADO.has(normCidade(m.st));
}

function processar() {
  LIB = []; MON = [];
  SNAPS.forEach((snap) => {
    const lib = new Map(), mon = new Map(), naoAtendidos = new Map();
    Object.entries(snap.arquivos).forEach(([nome, a]) => {
      const estado = estadoDoArquivo(nome); // recalcula: vale também para o histórico já salvo
      const alvo = a.tipo === "lib" ? lib : mon;
      a.linhas.forEach((r) => {
        if (a.tipo === "lib" && !entraNoEstado(r, estado)) return;
        const id = estado + "|" + r.p;
        // "Não atendido" no RoadNet nunca conta como montado
        if (a.tipo === "mon" && naoMontado(r)) { naoAtendidos.set(id, r); return; }
        if (!alvo.has(id)) alvo.set(id, { ...r, uf: estado, data: snap.data });
      });
    });
    lib.forEach((r, id) => {
      const m = mon.get(id);
      r.montado = !!m;
      r.rota = m ? m.rota : naoAtendidos.has(id) ? "Não atendido (RoadNet)" : "";
      r.idr = m ? m.idr : "";
      LIB.push(r);
    });
    mon.forEach((m, id) => {
      const l = lib.get(id);
      m.liberado = !!l;
      if (l) { m.cid = l.cid || m.cid; m.cliL = l.cli; }
      MON.push(m);
    });
  });
}

/* ---------- Filtros ---------- */

function filtros() {
  return { uf: $("fEstado").value, cid: $("fCidade").value, data: $("fData").value, pos: $("fPosicao").value };
}

function filtrar(f, { ignorarData = false } = {}) {
  const ok = (r) => (!f.uf || r.uf === f.uf) && (!f.cid || r.cid === f.cid) && (ignorarData || !f.data || r.data === f.data);
  return {
    lib: LIB.filter((r) => ok(r) && (!f.pos || r.pos === f.pos)),
    mon: MON.filter(ok),
  };
}

function preencherFiltros() {
  const datas = [...SNAPS.keys()].sort().reverse();
  const ufs = [...new Set([...LIB, ...MON].map((r) => r.uf))].sort();

  const selD = $("fData"), atualD = selD.value;
  selD.innerHTML = `<option value="">Todo o histórico</option>` + datas.map((d) => `<option value="${d}">${dataBR(d)}</option>`).join("");
  if (dataPreferida && datas.includes(dataPreferida)) selD.value = dataPreferida;
  else if (datas.includes(atualD)) selD.value = atualD;
  else selD.value = atualD === "" && selD.dataset.tocado ? "" : datas[0] || "";
  dataPreferida = null;

  const selE = $("fEstado"), atualE = selE.value;
  selE.innerHTML = `<option value="">Todos os estados</option>` + ufs.map((u) => `<option>${u}</option>`).join("");
  selE.value = ufs.includes(atualE) ? atualE : "";

  preencherCidades();
}

function preencherCidades() {
  const uf = $("fEstado").value, sel = $("fCidade"), atual = sel.value;
  const cids = [...new Set(LIB.filter((r) => !uf || r.uf === uf).map((r) => r.cid).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">Todas as cidades</option>` + cids.map((c) => `<option>${esc(c)}</option>`).join("");
  sel.value = cids.includes(atual) ? atual : "";
}

/* ---------- Renderização geral ---------- */

function renderizar() {
  const tem = SNAPS.size > 0;
  $("vazio").hidden = tem;
  $("conteudo").hidden = !tem;
  renderImport();
  if (!tem) { $("painelImport").open = true; return; }

  const f = filtros();
  const d = filtrar(f);
  renderKpis(f, d);
  renderEstados(d);
  renderMunicipios(d);
  renderDetalhes();
  renderMontados(d);
}

/* ---------- KPIs + sparklines ---------- */

function renderKpis(f, d) {
  const valor = d.lib.reduce((s, r) => s + r.v, 0);
  const peso = d.lib.reduce((s, r) => s + r.w, 0);
  const dias = new Set(d.lib.map((r) => r.data)).size;
  $("kPedidos").textContent = fmtN(d.lib.length);
  $("kPedidosSub").textContent = `${dias} dia(s) no período filtrado`;
  $("kValor").textContent = fmtR(valor);
  $("kPeso").textContent = fmtKg(peso);

  // Série por dia (respeita estado/cidade/posição, ignora a data)
  const todos = filtrar(f, { ignorarData: true }).lib;
  const porDia = new Map([...SNAPS.keys()].sort().map((k) => [k, { n: 0, v: 0, w: 0 }]));
  todos.forEach((r) => { const x = porDia.get(r.data); if (x) { x.n++; x.v += r.v; x.w += r.w; } });
  const serie = [...porDia.values()];
  sparkline($("sPedidos"), serie.map((x) => x.n));
  sparkline($("sValor"), serie.map((x) => x.v));
  sparkline($("sPeso"), serie.map((x) => x.w));
}

function sparkline(svg, vals) {
  if (!vals.length) { svg.innerHTML = ""; return; }
  if (vals.length === 1) vals = [0, vals[0]];
  const max = Math.max(...vals) || 1, W = 90, H = 24;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - (v / max) * (H - 2) + 1]);
  const dPath = "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L");
  const u = pts[pts.length - 1];
  svg.innerHTML = `<path d="${dPath}"/><circle cx="${u[0]}" cy="${u[1]}" r="2"/>`;
}

/* ---------- Cores (escala marrom -> pêssego) ---------- */

function corEscala(t) {
  const a = [107, 47, 14], b = [255, 200, 150];
  t = Math.max(0, Math.min(1, t));
  t = 0.18 + t * 0.82;
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* ---------- Aba: Por Estados ---------- */

function agrupar(lista, campo) {
  const m = new Map();
  lista.forEach((r) => {
    const k = r[campo] || "(vazio)";
    const id = campo === "uf" ? k : r.uf + "|" + k; // mesma cidade em estados diferentes não se mistura
    if (!m.has(id)) m.set(id, { k, n: 0, v: 0, w: 0, mon: 0, uf: r.uf });
    const g = m.get(id); g.n++; g.v += r.v; g.w += r.w; if (r.montado) g.mon++;
  });
  return [...m.values()];
}

function renderEstados(d) {
  const grupos = agrupar(d.lib, "uf").sort((a, b) => b.v - a.v);
  const maxW = Math.max(...grupos.map((g) => g.w), 1);
  const tot = grupos.reduce((s, g) => ({ n: s.n + g.n, v: s.v + g.v, w: s.w + g.w }), { n: 0, v: 0, w: 0 });

  $("tabEstados").querySelector("tbody").innerHTML = grupos.map((g) => `<tr>
      <td class="forte">${esc(g.k)}</td>
      <td class="num">${fmtN(g.n)}</td>
      <td class="num">${fmtR(g.v)}</td>
      <td><div class="celula-barra"><span class="num">${fmtKg(g.w)}</span><div class="trilho"><div class="enche" style="width:${pct(g.w, maxW)}%"></div></div></div></td>
    </tr>`).join("") || `<tr><td colspan="4" class="nota">Sem dados para os filtros.</td></tr>`;
  $("tabEstados").querySelector("tfoot").innerHTML = grupos.length ? `<tr>
      <td>Total Geral</td><td class="num">${fmtN(tot.n)}</td><td class="num">${fmtR(tot.v)}</td><td class="num" style="text-align:left">${fmtKg(tot.w)}</td>
    </tr>` : "";

  barras($("barrasEstado"), [...grupos].sort((a, b) => a.v - b.v).map((g) => ({ rot: g.k, val: g.v })), fmtR);
  renderMapa(grupos);
}

function barras(el, itens, formato) {
  const max = Math.max(...itens.map((i) => i.val), 1);
  el.innerHTML = itens.map((i) => {
    const t = i.val / max;
    return `<div class="barra-linha" title="${esc(i.rot)}: ${formato(i.val)}">
      <div class="rot">${esc(i.rot)}</div>
      <div class="faixa"><div class="barra" style="width:${Math.max(t * 72, 0.5)}%;background:${corEscala(t)}"></div><span class="val">${formato(i.val)}</span></div>
    </div>`;
  }).join("") || `<p class="nota">Sem dados para os filtros.</p>`;
}

/* ---------- Mapa ---------- */

function renderMapa(grupos) {
  const el = $("mapa");
  if (!window.MAPA_BRASIL) { el.innerHTML = `<p class="nota">Mapa indisponível.</p>`; return; }
  // Valor por UF do mapa (soma dos grupos que caem nela)
  const porUF = {}, gruposUF = {};
  grupos.forEach((g) => (MAPA_UF[g.k] || [String(g.k).toLowerCase()]).forEach((uf) => {
    porUF[uf] = (porUF[uf] || 0) + g.v;
    (gruposUF[uf] = gruposUF[uf] || []).push(g.k);
  }));
  const max = Math.max(...Object.values(porUF), 1);
  const sel = $("fEstado").value;
  const ufsSel = sel ? MAPA_UF[sel] || [sel.toLowerCase()] : [];

  el.innerHTML = `<svg viewBox="${MAPA_BRASIL.viewBox}" xmlns="http://www.w3.org/2000/svg">` +
    MAPA_BRASIL.locations.map((l) => {
      const v = porUF[l.id];
      const cls = (v ? "" : "sem-dado") + (ufsSel.includes(l.id) ? " selecionado" : "");
      const tip = v ? `${l.name} (${gruposUF[l.id].join(", ")}): ${fmtR(v)}` : `${l.name}: sem dados`;
      return `<path d="${l.path}" data-uf="${l.id}" class="${cls}" style="${v ? `fill:${corEscala(v / max)}` : ""}"><title>${esc(tip)}</title></path>`;
    }).join("") + `</svg>`;

  el.querySelectorAll("path").forEach((p) => (p.onclick = () => {
    const opcoes = gruposUF[p.dataset.uf];
    if (!opcoes) return;
    const atual = $("fEstado").value;
    // Clicar de novo no mesmo estado limpa; SP alterna entre SP e SPW
    const i = opcoes.indexOf(atual);
    $("fEstado").value = i === -1 ? opcoes[0] : (opcoes[i + 1] || "");
    preencherCidades();
    renderizar();
  }));
}

/* ---------- Aba: Por Município ---------- */

function renderMunicipios(d) {
  const grupos = agrupar(d.lib, "cid").sort((a, b) => b.v - a.v);
  const busca = normCidade($("buscaMun").value);
  const lista = busca ? grupos.filter((g) => g.k.includes(busca)) : grupos;
  $("tabMun").querySelector("tbody").innerHTML = lista.slice(0, 500).map((g) => {
    const p = pct(g.mon, g.n);
    return `<tr>
      <td class="forte">${esc(g.k)}</td><td>${esc(g.uf)}</td>
      <td class="num">${fmtN(g.n)}</td><td class="num">${fmtR(g.v)}</td><td class="num">${fmtKg(g.w)}</td>
      <td class="num">${pill(p)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="nota">Sem dados para os filtros.</td></tr>`;
  barras($("barrasMun"), grupos.slice(0, 15).reverse().map((g) => ({ rot: `${g.k} · ${g.uf}`, val: g.v })), fmtR);
  $("barrasMun").classList.add("mun");
}

function pill(p) {
  const c = p >= 95 ? "bom" : p >= 80 ? "medio" : "ruim";
  return `<span class="pct-pill ${c}">${fmtPct(p)}</span>`;
}

/* ---------- Aba: Detalhes ---------- */

const COLS_DET = [
  ["data", "DATA IMP."], ["uf", "ESTADO"], ["p", "PEDIDO"], ["sit", "SITUAÇÃO"], ["pos", "POSIÇÃO"],
  ["cli", "CLIENTE"], ["cid", "CIDADE"], ["pr", "PRAÇA"], ["sup", "SUPERVISOR"], ["ent", "DT. ENTREGA"],
  ["lib", "LIBERADO EM"], ["v", "VALOR"], ["w", "PESO"], ["idr", "ID DA ROTA"], ["rota", "ROTA ROADNET"],
];

function linhasDetalhe() {
  const f = filtros(), d = filtrar(f);
  const sit = $("fSituacao").value;
  let lista;
  if (sit === "Sem liberação") {
    lista = d.mon.filter((m) => !m.liberado).map((m) => ({ ...m, sit: "Sem liberação", pos: "", pr: "", sup: "", ent: "", lib: "" }));
  } else {
    lista = d.lib.map((r) => ({ ...r, sit: r.montado ? "Montado" : "Ficou para trás" }));
    if (sit) lista = lista.filter((r) => r.sit === sit);
  }
  const b = $("buscaDet").value.trim().toLowerCase();
  if (b) lista = lista.filter((r) => COLS_DET.some(([k]) => String(r[k] ?? "").toLowerCase().includes(b)));
  if (ordemDet.col) {
    const c = ordemDet.col, s = ordemDet.asc ? 1 : -1;
    lista.sort((x, y) => (typeof x[c] === "number" ? (x[c] - y[c]) : String(x[c] ?? "").localeCompare(String(y[c] ?? ""), "pt-BR", { numeric: true })) * s);
  }
  return lista;
}

function celulaDet(k, v) {
  if (k === "v") return fmtR(v);
  if (k === "w") return fmtKg(v);
  if (k === "data" || k === "ent") return dataBR(v);
  if (k === "lib") return v ? dataBR(v.slice(0, 10)) + " " + v.slice(11) : "";
  if (k === "sit") return `<span class="sit ${v === "Montado" ? "ok" : v === "Sem liberação" ? "sem" : "tras"}">${v}</span>`;
  return esc(v);
}

function renderDetalhes() {
  const tab = $("tabDet");
  tab.querySelector("thead").innerHTML = "<tr>" + COLS_DET.map(([k, t]) =>
    `<th data-col="${k}">${t}${ordemDet.col === k ? (ordemDet.asc ? " ▲" : " ▼") : ""}</th>`).join("") + "</tr>";
  tab.querySelectorAll("th").forEach((th) => (th.onclick = () => {
    const c = th.dataset.col;
    ordemDet = { col: c, asc: ordemDet.col === c ? !ordemDet.asc : true };
    renderDetalhes();
  }));
  const lista = linhasDetalhe(), LIM = 1000;
  tab.querySelector("tbody").innerHTML = lista.slice(0, LIM).map((r) =>
    "<tr>" + COLS_DET.map(([k]) => `<td class="${k === "v" || k === "w" ? "num" : ""}">${celulaDet(k, r[k])}</td>`).join("") + "</tr>").join("");
  $("contagemDet").textContent = lista.length > LIM
    ? `Mostrando ${fmtN(LIM)} de ${fmtN(lista.length)} pedidos — use "Exportar Excel" para ver todos.`
    : `${fmtN(lista.length)} pedido(s)`;
}

/* ---------- Aba: Montados ---------- */

function renderMontados(d) {
  const corte = $("corte").value; // "YYYY-MM-DDTHH:MM" (mesmo formato do campo lib)
  const linhas = new Map();
  const get = (uf) => {
    if (!linhas.has(uf)) linhas.set(uf, { uf, mn: 0, mv: 0, mw: 0, veic: new Set(), semId: 0, ln: 0, lv: 0, lw: 0, tn: 0, tv: 0, tw: 0, lmon: 0, apos: 0 });
    return linhas.get(uf);
  };
  d.mon.forEach((m) => {
    const g = get(m.uf);
    g.mn++; g.mv += m.v; g.mw += m.w;
    // Veículos = IDs de rota distintos (coluna "ID da rota" do RoadNet)
    if (m.idr) g.veic.add(m.data + "|" + m.idr);
    else g.semId++;
  });
  d.lib.forEach((r) => {
    const g = get(r.uf);
    if (corte && r.lib && r.lib > corte) { g.apos++; return; }
    g.ln++; g.lv += r.v; g.lw += r.w;
    if (r.montado) g.lmon++;
    else { g.tn++; g.tv += r.v; g.tw += r.w; }
  });

  const lista = [...linhas.values()].sort((a, b) => b.ln - a.ln);
  const tot = lista.reduce((s, g) => {
    for (const k of ["mn", "mv", "mw", "ln", "lv", "lw", "tn", "tv", "tw", "lmon", "apos"]) s[k] += g[k];
    s.veic += g.veic.size;
    s.semId += g.semId;
    return s;
  }, { mn: 0, mv: 0, mw: 0, veic: 0, semId: 0, ln: 0, lv: 0, lw: 0, tn: 0, tv: 0, tw: 0, lmon: 0, apos: 0 });

  const linha = (g, nome, veic) => `<tr>
      <td class="forte">${esc(nome)}</td>
      <td class="num monv">${fmtN(g.mn)}</td><td class="num monv">${fmtR(g.mv)}</td><td class="num monv">${fmtKg(g.mw)}</td><td class="num monv">${g.mn && !veic ? `<span title="A exportação do RoadNet deste estado não tem a coluna ID da rota">—</span>` : fmtN(veic) + (g.semId ? `<span title="${fmtN(g.semId)} pedido(s) sem ID da rota"> *</span>` : "")}</td>
      <td class="num libv">${fmtN(g.ln)}</td><td class="num libv">${fmtR(g.lv)}</td><td class="num libv">${fmtKg(g.lw)}</td>
      <td class="num tras">${fmtN(g.tn)}</td><td class="num tras">${fmtR(g.tv)}</td><td class="num tras">${fmtKg(g.tw)}</td>
      <td class="num">${pill(pct(g.lmon, g.ln))}</td>
    </tr>`;

  const tab = $("tabMxL");
  tab.querySelector("tbody").innerHTML = lista.map((g) => linha(g, g.uf, g.veic.size)).join("")
    || `<tr><td colspan="12" class="nota">Sem dados para os filtros.</td></tr>`;
  tab.querySelector("tfoot").innerHTML = lista.length ? linha(tot, "Total Geral", tot.veic).replace(/<td class="forte">/, "<td>") : "";

  const notas = [
    "Montados = pedidos do RoadNet · Liberados = pedidos do Whyntor · Ficaram para trás = liberados que não estão nos montados (ou estão como “Não atendido”) · Veículos = IDs de rota distintos (coluna “ID da rota”).",
  ];
  if (corte) notas.push(`Corte em ${dataBR(corte.slice(0, 10))} ${corte.slice(11)}: ${fmtN(tot.apos)} pedido(s) liberados depois desse horário ficaram fora da conta.`);
  const semId = lista.filter((g) => g.mn && !g.veic.size).map((g) => g.uf);
  if (semId.length) notas.push(`Sem coluna "ID da rota" na exportação: ${semId.join(", ")} — veículos aparecem como "—".`);
  const naoAt = d.lib.filter((r) => r.rota === "Não atendido (RoadNet)").length;
  if (naoAt) notas.push(`${fmtN(naoAt)} pedido(s) estão como "Não atendido" no RoadNet e contam como ficaram para trás.`);
  const semLib = d.mon.filter((m) => !m.liberado).length;
  if (semLib) notas.push(`${fmtN(semLib)} pedido(s) montados não aparecem nos liberados (veja em Detalhes → Montados sem liberação).`);
  $("notaMxL").innerHTML = notas.join("<br>");
}

/* ---------- Painel de importação ---------- */

function renderImport() {
  const data = $("dataImport").value;
  const snap = SNAPS.get(data);
  const arqs = snap ? Object.entries(snap.arquivos) : [];
  const lista = (tipo) => {
    const itens = arqs.filter(([, a]) => a.tipo === tipo)
      .map(([nome, a]) => [nome, a, estadoDoArquivo(nome)])
      .sort((a, b) => a[2].localeCompare(b[2]));
    return itens.length ? itens.map(([nome, a, estado]) => {
      const usados = tipo === "lib" ? a.linhas.filter((r) => entraNoEstado(r, estado)).length : a.linhas.length;
      const qtd = usados === a.linhas.length ? fmtN(usados)
        : `<span title="Pedidos considerados após o filtro de cidade">${fmtN(usados)} <small class="de">de ${fmtN(a.linhas.length)}</small></span>`;
      return `<div class="arq"><span class="uf">${esc(estado)}</span><span class="nome">${esc(nome)}</span><b>${qtd}</b>` +
      `<button class="x" data-nome="${encodeURIComponent(nome)}" title="Remover arquivo">×</button></div>`;
    }).join("")
      : `<div class="vazio-lista">Nenhum arquivo nesta data</div>`;
  };
  $("listaLib").innerHTML = lista("lib");
  $("listaMon").innerHTML = lista("mon");
  $("dataArqLib").textContent = $("dataArqMon").textContent = data ? "· " + dataBR(data) : "";

  document.querySelectorAll(".lista-arq .x").forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation();
    const s = SNAPS.get(data);
    delete s.arquivos[decodeURIComponent(b.dataset.nome)];
    if (Object.keys(s.arquivos).length) await DB.salvar(s);
    else { await DB.apagar(data); SNAPS.delete(data); }
    atualizarTudo();
  }));

  const datas = [...SNAPS.keys()].sort().reverse();
  $("listaHist").innerHTML = datas.length ? datas.map((d) => {
    const n = Object.values(SNAPS.get(d).arquivos).length;
    return `<span class="chip ${d === data ? "ativo" : ""}" data-data="${d}">${dataBR(d)} <small>${n} arq.</small>` +
      `<button class="x" data-apagar="${d}" title="Apagar este dia">×</button></span>`;
  }).join("") : `<span class="nota">Nada salvo ainda.</span>`;

  document.querySelectorAll(".chip").forEach((c) => (c.onclick = (e) => {
    if (e.target.dataset.apagar) return;
    $("dataImport").value = c.dataset.data;
    renderImport();
  }));
  document.querySelectorAll("[data-apagar]").forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation();
    const d = b.dataset.apagar;
    if (!confirm(`Apagar a importação de ${dataBR(d)} deste navegador?`)) return;
    await DB.apagar(d);
    SNAPS.delete(d);
    atualizarTudo();
  }));
}

async function importar(files) {
  if (!files.length) return;
  const data = $("dataImport").value || hojeISO();
  const snap = SNAPS.get(data) || { data, arquivos: {} };
  let ok = 0; const erros = [];
  toast(`Lendo ${files.length} arquivo(s)…`);
  for (const f of files) {
    const tipo = tipoDoArquivo(f.name);
    if (!tipo) { erros.push(`${f.name} (o nome precisa ter LIBERADO ou MONTADO)`); continue; }
    try {
      const brutas = await lerPlanilha(f);
      const linhas = brutas.map(tipo === "lib" ? enxugarLiberado : enxugarMontado).filter(Boolean);
      snap.arquivos[f.name] = { tipo, estado: estadoDoArquivo(f.name), linhas };
      ok++;
    } catch (err) {
      console.error(err);
      erros.push(f.name);
    }
  }
  if (ok) {
    SNAPS.set(data, snap);
    try { await DB.salvar(snap); } catch (e) { console.error(e); erros.push("não consegui salvar no histórico do navegador"); }
    dataPreferida = data;
  }
  atualizarTudo(data);
  if (erros.length) toast("Problema em: " + erros.join(", "), true);
  else toast(`${ok} arquivo(s) importado(s) em ${dataBR(data)}`);
}

/* ---------- Exportação ---------- */

function exportar() {
  const lista = linhasDetalhe();
  const linhas = lista.map((r) => {
    const o = {};
    COLS_DET.forEach(([k, t]) => {
      o[t] = k === "data" || k === "ent" ? dataBR(r[k]) : k === "lib" ? (r[k] ? dataBR(r[k].slice(0, 10)) + " " + r[k].slice(11) : "") : r[k];
    });
    return o;
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ PEDIDO: "" }]), "Pedidos");

  // Aba de resumo igual à tabela "Montados"
  const resumo = [...$("tabMxL").querySelectorAll("tbody tr, tfoot tr")].map((tr) => {
    const c = [...tr.children].map((td) => td.textContent.trim());
    if (c.length < 12) return null;
    return {
      ESTADO: c[0], "MONTADOS PEDIDOS": c[1], "MONTADOS VALOR": c[2], "MONTADOS PESO": c[3], VEÍCULOS: c[4],
      "LIBERADOS PEDIDOS": c[5], "LIBERADOS VALOR": c[6], "LIBERADOS PESO": c[7],
      "FICARAM PEDIDOS": c[8], "FICARAM VALOR": c[9], "FICARAM PESO": c[10], "% MONTADO": c[11],
    };
  }).filter(Boolean);
  if (resumo.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Montados x Liberados");

  const f = filtros();
  XLSX.writeFile(wb, `Liberados_x_Montados_${f.data ? dataBR(f.data).replace(/\//g, "-") : "historico"}.xlsx`);
}

/* ---------- Eventos ---------- */

function atualizarTudo(dataImport) {
  if (dataImport) $("dataImport").value = dataImport;
  processar();
  preencherFiltros();
  renderizar();
}

function trocarAba(aba) {
  abaAtual = aba;
  document.querySelectorAll(".aba").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === aba));
  document.querySelectorAll(".painel").forEach((p) => p.classList.toggle("ativo", p.id === "aba-" + aba));
}

let timerToast;
function toast(msg, erro = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (erro ? " erro" : "");
  t.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => (t.hidden = true), erro ? 7000 : 3500);
}

function configurar() {
  $("dataImport").value = hojeISO();

  const drop = $("drop"), input = $("fileInput");
  drop.onclick = () => input.click();
  input.onchange = () => { importar([...input.files]); input.value = ""; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove("over"); importar([...e.dataTransfer.files]); };
  // Soltar em qualquer lugar da página também importa
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => { e.preventDefault(); importar([...e.dataTransfer.files]); });

  $("dataImport").onchange = renderImport;
  $("btnAtualizar").onclick = async () => { await carregarHistorico(); toast("Dados atualizados"); };

  $("fEstado").onchange = () => { preencherCidades(); renderizar(); };
  $("fCidade").onchange = renderizar;
  $("fData").onchange = () => { $("fData").dataset.tocado = "1"; renderizar(); };
  $("fPosicao").onchange = renderizar;

  document.querySelectorAll(".aba").forEach((b) => (b.onclick = () => trocarAba(b.dataset.aba)));
  $("buscaMun").oninput = () => renderMunicipios(filtrar(filtros()));
  $("fSituacao").onchange = renderDetalhes;
  $("buscaDet").oninput = renderDetalhes;
  $("btnExportar").onclick = exportar;

  $("corte").onchange = () => renderMontados(filtrar(filtros()));
  $("btnCorte").onclick = () => {
    const dia = $("fData").value || [...SNAPS.keys()].sort().pop() || hojeISO();
    $("corte").value = dia + "T17:15";
    renderMontados(filtrar(filtros()));
  };
  $("btnSemCorte").onclick = () => { $("corte").value = ""; renderMontados(filtrar(filtros())); };
}

async function carregarHistorico() {
  const todos = await DB.todos();
  SNAPS = new Map(todos.map((s) => [s.data, s]));
  atualizarTudo();
}

(async function iniciar() {
  configurar();
  await DB.abrir();
  await carregarHistorico();
})();
