/* =========================================================
   Liberados x Montados — comparação de pedidos
   Tudo roda no navegador (nenhum dado sai do computador).
   ========================================================= */

const base = {
  lib: { arquivos: [], linhas: [], colunas: [] },
  mon: { arquivos: [], linhas: [], colunas: [] },
};

let resultado = null;      // { detalhe: [], extras: [], grupos: [], usouCorte: bool }
let ordemDetalhe = { col: null, asc: true };

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmtPct = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

/* ---------- Leitura dos arquivos ---------- */

function lerArquivo(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
        let linhas = [];
        wb.SheetNames.forEach((nome) => {
          const dados = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: "", raw: true });
          linhas = linhas.concat(dados);
        });
        // Normaliza cabeçalhos: sem espaços extras e em maiúsculas
        linhas = linhas.map((l) => {
          const o = {};
          for (const k in l) o[String(k).trim().toUpperCase()] = l[k];
          return o;
        });
        resolve(linhas);
      } catch (err) {
        reject(err);
      }
    };
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

async function carregar(tipo, files) {
  if (!files || !files.length) return;
  const alvo = base[tipo];
  try {
    for (const f of files) {
      const linhas = await lerArquivo(f);
      alvo.arquivos.push({ nome: f.name, qtd: linhas.length });
      alvo.linhas = alvo.linhas.concat(linhas);
    }
    const cols = new Set();
    alvo.linhas.slice(0, 500).forEach((l) => Object.keys(l).forEach((k) => cols.add(k)));
    alvo.colunas = [...cols].filter((c) => !c.startsWith("__EMPTY"));
    atualizarPainel(tipo);
    atualizarOpcoes();
    toast(`${files.length} arquivo(s) carregado(s)`);
  } catch (err) {
    console.error(err);
    toast("Não consegui ler o arquivo. Confira se é .xls, .xlsx ou .csv.", true);
  }
}

/* ---------- Detecção de colunas ---------- */

function sugerirChave(cols) {
  const prefer = ["NUMPED", "PEDIDO", "NUM_PEDIDO", "NR_PEDIDO", "NUMERO PEDIDO", "NÚMERO PEDIDO", "ORDER"];
  for (const p of prefer) if (cols.includes(p)) return p;
  return cols.find((c) => c.includes("PED")) || cols[0] || "";
}

function sugerirGrupo(cols) {
  const prefer = ["CODFILIAL", "FILIAL", "ESTADO", "UF", "PRACA", "PRAÇA", "NOMESUP", "DESTINO"];
  for (const p of prefer) if (cols.includes(p)) return p;
  return "";
}

function preencherSelect(sel, opcoes, valor, vazio) {
  sel.innerHTML = "";
  if (vazio) sel.add(new Option(vazio, ""));
  opcoes.forEach((c) => sel.add(new Option(c, c)));
  sel.value = valor;
  sel.disabled = !opcoes.length;
}

function atualizarPainel(tipo) {
  const alvo = base[tipo];
  const sufixo = tipo === "lib" ? "Lib" : "Mon";
  const drop = $("drop" + sufixo);
  drop.classList.toggle("carregado", alvo.linhas.length > 0);
  $("info" + sufixo).innerHTML = alvo.arquivos.length
    ? alvo.arquivos.map((a) => `📄 ${a.nome} — <b>${fmt(a.qtd)}</b> linhas`).join("<br>") +
      `<br>Total: <b>${fmt(alvo.linhas.length)}</b> linhas`
    : "Nenhum arquivo";
  preencherSelect($("key" + sufixo), alvo.colunas, sugerirChave(alvo.colunas));
}

function atualizarOpcoes() {
  const cols = [...new Set([...base.lib.colunas, ...base.mon.colunas])];
  const atual = $("grupo").value;
  preencherSelect($("grupo"), cols, atual && cols.includes(atual) ? atual : sugerirGrupo(base.lib.colunas), "(sem agrupamento)");
  $("btnComparar").disabled = !(base.lib.linhas.length && base.mon.linhas.length);
}

/* ---------- Utilidades de valores ---------- */

function chave(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim().replace(/\.0+$/, "");
}

// Retorna minutos do dia (0–1439) ou null
function minutosDaLinha(l) {
  const h = l["HORA"], m = l["MINUTO"];
  if (h !== undefined && h !== "") {
    if (h instanceof Date) return h.getHours() * 60 + h.getMinutes();
    if (typeof h === "number" && h < 1 && h > 0) return Math.round(h * 1440); // hora como fração do Excel
    const s = String(h).trim();
    const mm = s.match(/^(\d{1,2})[:h](\d{1,2})/);
    if (mm) return +mm[1] * 60 + +mm[2];
    if (!isNaN(+s)) return +s * 60 + (isNaN(+m) || m === "" ? 0 : +m);
  }
  for (const c of ["DATA", "DTMONTAGEM", "DATAHORA", "DT_MONTAGEM"]) {
    const d = l[c];
    if (d instanceof Date && (d.getHours() || d.getMinutes())) return d.getHours() * 60 + d.getMinutes();
  }
  return null;
}

const fmtHora = (min) => (min === null ? "" : String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"));

function valorTela(v) {
  if (v instanceof Date) {
    const temHora = v.getHours() || v.getMinutes();
    return v.toLocaleDateString("pt-BR") + (temHora ? " " + v.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
  }
  if (typeof v === "number" && !Number.isInteger(v)) return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return v ?? "";
}

/* ---------- Comparação ---------- */

function comparar() {
  const kLib = $("keyLib").value, kMon = $("keyMon").value, grupo = $("grupo").value;
  const corteTxt = $("corte").value;
  const corte = corteTxt ? +corteTxt.slice(0, 2) * 60 + +corteTxt.slice(3, 5) : null;

  // Montados: um registro por pedido (mantém o horário mais cedo)
  const mapaMon = new Map();
  base.mon.linhas.forEach((l) => {
    const k = chave(l[kMon]);
    if (!k) return;
    const t = minutosDaLinha(l);
    const ant = mapaMon.get(k);
    if (!ant || (t !== null && (ant.t === null || t < ant.t))) mapaMon.set(k, { linha: l, t });
  });

  // Liberados: um registro por pedido
  const mapaLib = new Map();
  base.lib.linhas.forEach((l) => {
    const k = chave(l[kLib]);
    if (k && !mapaLib.has(k)) mapaLib.set(k, l);
  });

  const detalhe = [];
  const grupos = new Map();
  const somaGrupo = (g, campo) => {
    if (!grupos.has(g)) grupos.set(g, { grupo: g, lib: 0, mon: 0, apos: 0, nao: 0 });
    grupos.get(g)[campo]++;
  };

  mapaLib.forEach((linha, k) => {
    const m = mapaMon.get(k);
    let status = "Não montado";
    if (m) status = corte !== null && m.t !== null && m.t > corte ? "Montado após corte" : "Montado";
    const g = grupo ? chave(linha[grupo] ?? (m ? m.linha[grupo] : "")) || "(vazio)" : "Total";
    somaGrupo(g, "lib");
    if (status === "Montado") somaGrupo(g, "mon");
    else if (status === "Montado após corte") somaGrupo(g, "apos");
    else somaGrupo(g, "nao");
    detalhe.push({ pedido: k, grupo: g, status, hora: m ? fmtHora(m.t) : "", linha, linhaMon: m ? m.linha : null });
  });

  const extras = [];
  mapaMon.forEach((m, k) => {
    if (!mapaLib.has(k)) {
      const g = grupo ? chave(m.linha[grupo]) || "(vazio)" : "Total";
      extras.push({ pedido: k, grupo: g, status: "Sem liberação", hora: fmtHora(m.t), linha: m.linha, linhaMon: m.linha });
    }
  });

  resultado = {
    detalhe, extras, usouCorte: corte !== null, grupo,
    grupos: [...grupos.values()].sort((a, b) => b.lib - a.lib),
    dupLib: base.lib.linhas.length - mapaLib.size,
  };
  renderizar();
}

/* ---------- Renderização ---------- */

function renderizar() {
  const r = resultado;
  const tot = r.grupos.reduce((s, g) => ({ lib: s.lib + g.lib, mon: s.mon + g.mon, apos: s.apos + g.apos, nao: s.nao + g.nao }), { lib: 0, mon: 0, apos: 0, nao: 0 });

  $("resultado").hidden = false;
  $("kLib").textContent = fmt(tot.lib);
  $("kMon").textContent = fmt(tot.mon);
  $("kMonPct").textContent = fmtPct(pct(tot.mon, tot.lib)) + " dos liberados";
  $("kpiCorte").hidden = !r.usouCorte;
  $("kApos").textContent = fmt(tot.apos);
  $("kAposPct").textContent = fmtPct(pct(tot.apos, tot.lib)) + " dos liberados";
  $("kNao").textContent = fmt(tot.nao);
  $("kNaoPct").textContent = fmtPct(pct(tot.nao, tot.lib)) + " dos liberados";
  $("kExtra").textContent = fmt(r.extras.length);

  // Tabela por grupo
  $("tituloGrupo").textContent = r.grupo || "total";
  $("thGrupo").textContent = r.grupo || "Grupo";
  document.querySelectorAll(".col-corte").forEach((e) => (e.style.display = r.usouCorte ? "" : "none"));
  const linhaGrupo = (g, tag = "td") => {
    const p1 = pct(g.mon, g.lib), p2 = pct(g.apos, g.lib);
    return `<tr>
      <${tag}>${g.grupo}</${tag}>
      <${tag} class="num">${fmt(g.lib)}</${tag}>
      <${tag} class="num">${fmt(g.mon)}</${tag}>
      <${tag} class="num" style="display:${r.usouCorte ? "" : "none"}">${fmt(g.apos)}</${tag}>
      <${tag} class="num">${fmt(g.nao)}</${tag}>
      <${tag}><div class="barra"><div class="trilho"><div class="p1" style="width:${p1}%"></div><div class="p2" style="width:${p2}%"></div></div><em>${fmtPct(p1)}</em></div></${tag}>
    </tr>`;
  };
  const tab = $("tabGrupo");
  tab.querySelector("tbody").innerHTML = r.grupos.map((g) => linhaGrupo(g)).join("");
  tab.querySelector("tfoot")?.remove();
  if (r.grupos.length > 1) {
    const tf = document.createElement("tfoot");
    tf.innerHTML = linhaGrupo({ grupo: "TOTAL", ...tot });
    tab.appendChild(tf);
  }

  renderDetalhe();
  if (r.dupLib > 0) toast(`${fmt(r.dupLib)} linha(s) repetidas na base de liberados foram contadas uma vez só.`);
  $("resultado").scrollIntoView({ behavior: "smooth", block: "start" });
}

function colunasDetalhe() {
  const prefer = ["CODCLI", "NOMECLIENTE", "CLIENTE", "PRACA", "CIDADE", "NOMESUP", "NOMERCA", "DTENTREGA", "VLTOTAL", "PESOBRUTOTOT", "NUMCARREGAMENTO", "PLACA"];
  const cols = [...new Set([...base.lib.colunas, ...base.mon.colunas])];
  const usar = prefer.filter((c) => cols.includes(c) && c !== $("keyLib").value && c !== resultado.grupo);
  return usar.length ? usar : base.lib.colunas.filter((c) => c !== $("keyLib").value).slice(0, 5);
}

function linhasFiltradas() {
  const st = $("filtroStatus").value;
  const busca = $("busca").value.trim().toLowerCase();
  let lista = st === "Sem liberação" ? resultado.extras : resultado.detalhe.filter((d) => !st || d.status === st);
  const extras = colunasDetalhe();
  if (busca) {
    lista = lista.filter((d) => {
      const txt = [d.pedido, d.grupo, ...extras.map((c) => valorCol(d, c))].join(" ").toLowerCase();
      return txt.includes(busca);
    });
  }
  if (ordemDetalhe.col) {
    const c = ordemDetalhe.col, s = ordemDetalhe.asc ? 1 : -1;
    const val = (d) => (c === "pedido" || c === "grupo" || c === "status" || c === "hora" ? d[c] : valorCol(d, c));
    lista = [...lista].sort((a, b) => {
      const x = val(a), y = val(b);
      const nx = +x, ny = +y;
      if (!isNaN(nx) && !isNaN(ny) && x !== "" && y !== "") return (nx - ny) * s;
      return String(x).localeCompare(String(y), "pt-BR") * s;
    });
  }
  return lista;
}

function valorCol(d, c) {
  const v = d.linha[c];
  if (v !== undefined && v !== "") return v;
  return d.linhaMon ? d.linhaMon[c] ?? "" : "";
}

function renderDetalhe() {
  const extras = colunasDetalhe();
  const cab = [
    ["pedido", "Pedido"], ["grupo", resultado.grupo || "Grupo"], ["status", "Status"], ["hora", "Hora montagem"],
    ...extras.map((c) => [c, c]),
  ];
  const tab = $("tabDetalhe");
  tab.querySelector("thead").innerHTML =
    "<tr>" + cab.map(([k, t]) => `<th data-col="${k}">${t}${ordemDetalhe.col === k ? (ordemDetalhe.asc ? " ▲" : " ▼") : ""}</th>`).join("") + "</tr>";

  const lista = linhasFiltradas();
  const LIMITE = 1000;
  const classe = (s) => (s === "Montado após corte" ? "apos" : s.split(" ")[0]);
  tab.querySelector("tbody").innerHTML = lista.slice(0, LIMITE).map((d) => `<tr>
      <td>${d.pedido}</td><td>${d.grupo}</td>
      <td><span class="status ${classe(d.status)}">${d.status}</span></td>
      <td>${d.hora}</td>
      ${extras.map((c) => { const v = valorCol(d, c); return `<td class="${typeof v === "number" ? "num" : ""}">${valorTela(v)}</td>`; }).join("")}
    </tr>`).join("");

  $("contagem").textContent = lista.length > LIMITE
    ? `Mostrando ${fmt(LIMITE)} de ${fmt(lista.length)} pedidos — use "Exportar Excel" para ver todos.`
    : `${fmt(lista.length)} pedido(s)`;

  tab.querySelectorAll("th").forEach((th) => th.onclick = () => {
    const c = th.dataset.col;
    ordemDetalhe = { col: c, asc: ordemDetalhe.col === c ? !ordemDetalhe.asc : true };
    renderDetalhe();
  });
}

/* ---------- Exportação ---------- */

function exportar() {
  if (!resultado) return;
  const extras = colunasDetalhe();
  const nomeGrupo = resultado.grupo || "GRUPO";
  const paraLinha = (d) => {
    const o = { PEDIDO: d.pedido, [nomeGrupo]: d.grupo, STATUS: d.status, "HORA MONTAGEM": d.hora };
    extras.forEach((c) => (o[c] = valorCol(d, c)));
    return o;
  };

  const wb = XLSX.utils.book_new();

  const resumo = resultado.grupos.map((g) => ({
    [nomeGrupo]: g.grupo, LIBERADOS: g.lib, MONTADOS: g.mon,
    ...(resultado.usouCorte ? { "APÓS CORTE": g.apos } : {}),
    "NÃO MONTADOS": g.nao, "% MONTADO": +pct(g.mon, g.lib).toFixed(1),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.detalhe.map(paraLinha)), "Liberados");
  const nao = resultado.detalhe.filter((d) => d.status === "Não montado").map(paraLinha);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nao.length ? nao : [{ PEDIDO: "" }]), "Não montados");
  if (resultado.extras.length)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.extras.map(paraLinha)), "Sem liberação");

  const hoje = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  XLSX.writeFile(wb, `Liberados_x_Montados_${hoje}.xlsx`);
}

/* ---------- Eventos ---------- */

function configurarDrop(tipo) {
  const sufixo = tipo === "lib" ? "Lib" : "Mon";
  const drop = $("drop" + sufixo), input = $("file" + sufixo);
  drop.addEventListener("click", (e) => { if (!e.target.closest("select, label")) input.click(); });
  input.addEventListener("change", () => { carregar(tipo, [...input.files]); input.value = ""; });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    carregar(tipo, [...e.dataTransfer.files]);
  });
}

function limpar() {
  ["lib", "mon"].forEach((t) => { base[t] = { arquivos: [], linhas: [], colunas: [] }; atualizarPainel(t); });
  atualizarOpcoes();
  resultado = null;
  $("resultado").hidden = true;
  $("corte").value = "";
}

let timerToast;
function toast(msg, erro = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (erro ? " erro" : "");
  t.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => (t.hidden = true), 3500);
}

configurarDrop("lib");
configurarDrop("mon");
$("btnComparar").onclick = comparar;
$("btnExportar").onclick = exportar;
$("btnLimpar").onclick = limpar;
$("filtroStatus").onchange = renderDetalhe;
$("busca").oninput = renderDetalhe;
["keyLib", "keyMon", "grupo", "corte"].forEach((id) => $(id).addEventListener("change", () => { if (resultado) comparar(); }));
