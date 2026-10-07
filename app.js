/* =========================================================
   Liberados x Montados — comparação de pedidos por estado
   Tudo roda no navegador (nenhum dado sai do computador).

   Arquivos esperados (o estado vem do nome do arquivo):
     LIBERADOS_AM.xls  ...  MONTADOS_AM.xlsx
     LIBERADO_DF.xls   ...  MONTADOS_D.F.xlsx
     LIBERADOS_BA.xls  ...  MONTADOS_BA.xlsx + MONTADOS_BA_SF.xlsx
     LIBERADOS_SP_WFS  ...  MONTADOS_SP_WFS
   ========================================================= */

/* ---------- Configuração ---------- */

// Coluna do número do pedido em cada base (cabeçalhos em maiúsculas)
const CHAVE_LIB = ["NUMPED", "PEDIDO", "NUM_PEDIDO"];
const CHAVE_MON = ["NÚMERO DO PEDIDO", "NUMERO DO PEDIDO", "NUMPED", "PEDIDO"];

// Liberados que vêm misturados com outro estado: só entram pedidos
// cuja PRACA começa com o prefixo indicado (ex.: o LIBERADOS_ES traz praças de MG).
const FILTRO_PRACA = { ES: ["ES"] };

// Arquivos de montados que pertencem a outro estado
const APELIDOS_ESTADO = { BA_SF: "BA", D_F: "DF", DF: "DF" };

/* ---------- Estado da aplicação ---------- */

const arquivos = { lib: new Map(), mon: new Map() }; // nome -> { estado, linhas }
let resultado = null;
let ordem = { col: null, asc: true };

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const fmtPct = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const fmtMoeda = (v) => (v === "" || v === null || isNaN(v) ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

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
  if (APELIDOS_ESTADO[s]) return APELIDOS_ESTADO[s];
  s = s.replace(/_SF$/, ""); // MONTADOS_BA_SF -> BA
  s = s.replace(/^D_F$/, "DF");
  return s || "GERAL";
}

/* ---------- Leitura dos arquivos ---------- */

function lerArquivo(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
        let linhas = [];
        wb.SheetNames.forEach((nome) => {
          linhas = linhas.concat(XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: "", raw: true }));
        });
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

async function carregar(files, tipoPadrao) {
  if (!files || !files.length) return;
  let ok = 0, erros = [];
  for (const f of files) {
    const tipo = tipoDoArquivo(f.name) || tipoPadrao;
    if (!tipo) { erros.push(`${f.name} (não sei se é liberado ou montado)`); continue; }
    try {
      const linhas = await lerArquivo(f);
      arquivos[tipo].set(f.name, { estado: estadoDoArquivo(f.name), linhas });
      ok++;
    } catch (err) {
      console.error(err);
      erros.push(f.name);
    }
  }
  atualizarPaineis();
  if (erros.length) toast("Não consegui ler: " + erros.join(", "), true);
  else toast(`${ok} arquivo(s) carregado(s)`);
  if (resultado) comparar();
}

/* ---------- Painéis de importação ---------- */

function atualizarPaineis() {
  ["lib", "mon"].forEach((tipo) => {
    const suf = tipo === "lib" ? "Lib" : "Mon";
    const lista = [...arquivos[tipo].entries()].sort((a, b) => a[1].estado.localeCompare(b[1].estado));
    $("drop" + suf).classList.toggle("carregado", lista.length > 0);
    $("info" + suf).innerHTML = lista.length
      ? lista.map(([nome, a]) =>
          `<div class="arq"><span class="uf">${a.estado}</span><span class="nome">${nome}</span>` +
          `<b>${fmt(a.linhas.length)}</b><button class="x" data-tipo="${tipo}" data-nome="${encodeURIComponent(nome)}" title="Remover">×</button></div>`
        ).join("")
      : "Nenhum arquivo";
  });
  document.querySelectorAll(".arq .x").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    arquivos[b.dataset.tipo].delete(decodeURIComponent(b.dataset.nome));
    atualizarPaineis();
    if (resultado) arquivos.lib.size && arquivos.mon.size ? comparar() : esconderResultado();
  }));
  $("btnComparar").disabled = !(arquivos.lib.size && arquivos.mon.size);
}

/* ---------- Utilidades ---------- */

function acharColuna(linha, opcoes) {
  return opcoes.find((c) => c in linha) || null;
}

function chave(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim().replace(/\.0+$/, "");
}

// "1.576,68" -> 1576.68 ; 1576.68 -> 1576.68
function numeroBR(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = s.includes(",") ? +s.replace(/\./g, "").replace(",", ".") : +s;
  return isNaN(n) ? "" : n;
}

function paraData(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  if (typeof v === "number" && v > 30000) return new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000);
  return null;
}

// Data/hora de liberação = DATA + HORA:MINUTO
function dataLiberacao(l) {
  const d = paraData(l["DATA"]);
  if (!d) return null;
  const h = +l["HORA"], m = +l["MINUTO"];
  if (!isNaN(h)) d.setHours(h, isNaN(m) ? 0 : m);
  return d;
}

const fmtDataHora = (d) => (d ? d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const fmtData = (v) => { const d = paraData(v); return d ? d.toLocaleDateString("pt-BR") : ""; };

/* ---------- Comparação ---------- */

function comparar() {
  const corteTxt = $("corte").value;
  const corte = corteTxt ? new Date(corteTxt) : null;

  // Montados por estado (BA + BA_SF já caem juntos em BA)
  const mon = new Map(); // "UF|pedido" -> linha
  arquivos.mon.forEach((a) => {
    a.linhas.forEach((l) => {
      const col = acharColuna(l, CHAVE_MON);
      const k = col ? chave(l[col]) : "";
      if (!k || !/\d/.test(k)) return; // ignora linha de total/rodapé
      const id = a.estado + "|" + k;
      if (!mon.has(id)) mon.set(id, { estado: a.estado, pedido: k, linha: l });
    });
  });

  // Liberados por estado
  const lib = new Map();
  let foraEstado = 0, dup = 0;
  arquivos.lib.forEach((a) => {
    const prefixos = FILTRO_PRACA[a.estado];
    a.linhas.forEach((l) => {
      const col = acharColuna(l, CHAVE_LIB);
      const k = col ? chave(l[col]) : "";
      if (!k || !/\d/.test(k)) return;
      if (prefixos && !prefixos.some((p) => String(l["PRACA"] ?? "").toUpperCase().startsWith(p))) { foraEstado++; return; }
      const id = a.estado + "|" + k;
      if (lib.has(id)) { dup++; return; }
      lib.set(id, { estado: a.estado, pedido: k, linha: l });
    });
  });

  const detalhe = [];
  lib.forEach((li, id) => {
    const m = mon.get(id);
    const liberadoEm = dataLiberacao(li.linha);
    const aposCorte = corte && liberadoEm && liberadoEm > corte;
    let status;
    if (aposCorte) status = m ? "Após corte (montado)" : "Após corte";
    else status = m ? "Montado" : "Não montado";
    detalhe.push(montarRegistro(li.estado, li.pedido, status, li.linha, m ? m.linha : null, liberadoEm));
  });

  const extras = [];
  mon.forEach((m, id) => {
    if (!lib.has(id)) extras.push(montarRegistro(m.estado, m.pedido, "Sem liberação", null, m.linha, null));
  });

  resultado = { detalhe, extras, usouCorte: !!corte, foraEstado, dup };
  ordem = { col: null, asc: true };
  renderizar();
}

function montarRegistro(estado, pedido, status, l, m, liberadoEm) {
  l = l || {}; m = m || {};
  return {
    estado, pedido, status,
    liberadoEm,
    posicao: l["POSICAO"] ?? "",
    filial: chave(l["CODFILIAL"] ?? m["FILIAL"] ?? ""),
    cliente: l["NOMECLIENTE"] || m["CLIENTE"] || "",
    praca: l["PRACA"] ?? "",
    cidade: l["CIDADE"] || m["CIDADE"] || "",
    supervisor: l["NOMESUP"] ?? "",
    rca: l["NOMERCA"] ?? "",
    dtEntrega: fmtData(l["DTENTREGA"]),
    valor: numeroBR(l["VLTOTAL"] !== undefined && l["VLTOTAL"] !== "" ? l["VLTOTAL"] : m["ENTREGA VALOR"]),
    peso: numeroBR(l["PESOBRUTOTOT"] !== undefined && l["PESOBRUTOTOT"] !== "" ? l["PESOBRUTOTOT"] : m["ENTREGA PESO"]),
    rota: m["DESCRIÇÃO DA ROTA"] ?? "",
    estadoOrdem: m["ESTADO DA ORDEM"] ?? "",
    sessao: m["SESSÃO DE ROTEIRIZAÇÃO"] ?? "",
  };
}

/* ---------- Resumo por grupo ---------- */

const GRUPOS = {
  estado: "Estado",
  filial: "Filial",
  praca: "Praça",
  supervisor: "Supervisor",
  dtEntrega: "Data de entrega",
};

function resumir(campo) {
  const mapa = new Map();
  const get = (g) => {
    if (!mapa.has(g)) mapa.set(g, { grupo: g, lib: 0, mon: 0, nao: 0, apos: 0, aposMon: 0, extra: 0, valorNao: 0 });
    return mapa.get(g);
  };
  resultado.detalhe.forEach((d) => {
    const g = get(d[campo] || "(vazio)");
    if (d.status.startsWith("Após corte")) { g.apos++; if (d.status.includes("montado")) g.aposMon++; return; }
    g.lib++;
    if (d.status === "Montado") g.mon++;
    else { g.nao++; g.valorNao += +d.valor || 0; }
  });
  resultado.extras.forEach((d) => get(d[campo] || "(vazio)").extra++);
  return [...mapa.values()].sort((a, b) => (campo === "estado" ? a.grupo.localeCompare(b.grupo) : b.lib - a.lib));
}

/* ---------- Renderização ---------- */

function esconderResultado() {
  resultado = null;
  $("resultado").hidden = true;
}

function renderizar() {
  const r = resultado;
  const grupos = resumir($("grupo").value);
  const tot = grupos.reduce((s, g) => {
    for (const k of ["lib", "mon", "nao", "apos", "aposMon", "extra", "valorNao"]) s[k] += g[k];
    return s;
  }, { lib: 0, mon: 0, nao: 0, apos: 0, aposMon: 0, extra: 0, valorNao: 0 });

  $("resultado").hidden = false;
  $("kLib").textContent = fmt(tot.lib);
  $("kLibSub").textContent = r.usouCorte ? "liberados até o corte" : "pedidos únicos";
  $("kMon").textContent = fmt(tot.mon);
  $("kMonPct").textContent = fmtPct(pct(tot.mon, tot.lib)) + " dos liberados";
  $("kNao").textContent = fmt(tot.nao);
  $("kNaoPct").textContent = fmtPct(pct(tot.nao, tot.lib)) + " · " + fmtMoeda(tot.valorNao);
  $("kpiCorte").hidden = !r.usouCorte;
  $("kApos").textContent = fmt(tot.apos);
  $("kAposSub").textContent = `${fmt(tot.aposMon)} já montados · fora do cálculo`;
  $("kExtra").textContent = fmt(tot.extra);

  // Tabela de resumo
  const campo = $("grupo").value;
  $("thGrupo").textContent = GRUPOS[campo];
  document.querySelectorAll(".col-corte").forEach((e) => (e.style.display = r.usouCorte ? "" : "none"));
  const linha = (g) => {
    const p = pct(g.mon, g.lib);
    const cor = p >= 95 ? "bom" : p >= 80 ? "medio" : "ruim";
    return `<tr>
      <td><b>${g.grupo}</b></td>
      <td class="num">${fmt(g.lib)}</td>
      <td class="num">${fmt(g.mon)}</td>
      <td class="num">${fmt(g.nao)}</td>
      <td class="num col-corte" style="display:${r.usouCorte ? "" : "none"}">${fmt(g.apos)}</td>
      <td class="num">${fmt(g.extra)}</td>
      <td class="num">${fmtMoeda(g.valorNao)}</td>
      <td><div class="barra ${cor}"><div class="trilho"><div class="p1" style="width:${p}%"></div></div><em>${fmtPct(p)}</em></div></td>
    </tr>`;
  };
  const tab = $("tabGrupo");
  tab.querySelector("tbody").innerHTML = grupos.map(linha).join("");
  tab.querySelector("tfoot").innerHTML = grupos.length > 1 ? linha({ grupo: "TOTAL", ...tot }) : "";

  // Avisos
  const avisos = [];
  if (r.foraEstado) avisos.push(`${fmt(r.foraEstado)} pedido(s) de outras praças foram ignorados nos liberados (${Object.keys(FILTRO_PRACA).join(", ")}).`);
  if (r.dup) avisos.push(`${fmt(r.dup)} pedido(s) repetidos nos liberados foram contados uma vez só.`);
  grupos.filter((g) => campo === "estado" && g.lib > 0 && g.mon === 0).forEach((g) =>
    avisos.push(`<b>${g.grupo}</b>: nenhum liberado foi encontrado nos montados — confira se as duas bases são do mesmo dia/extração.`));
  $("avisos").innerHTML = avisos.map((a) => `<div>⚠️ ${a}</div>`).join("");
  $("avisos").hidden = !avisos.length;

  // Filtro de estado no detalhe
  const sel = $("filtroEstado"), atual = sel.value;
  const ufs = [...new Set([...r.detalhe, ...r.extras].map((d) => d.estado))].sort();
  sel.innerHTML = `<option value="">Todos os estados</option>` + ufs.map((u) => `<option>${u}</option>`).join("");
  sel.value = ufs.includes(atual) ? atual : "";

  renderDetalhe();
}

const COLUNAS = [
  ["estado", "Estado"], ["pedido", "Pedido"], ["status", "Status"], ["liberadoEm", "Liberado em"],
  ["filial", "Filial"], ["cliente", "Cliente"], ["praca", "Praça"], ["cidade", "Cidade"],
  ["supervisor", "Supervisor"], ["dtEntrega", "Dt. entrega"], ["valor", "Valor"], ["peso", "Peso (kg)"],
  ["rota", "Rota RoadNet"], ["estadoOrdem", "Estado da ordem"],
];

function linhasFiltradas() {
  const st = $("filtroStatus").value, uf = $("filtroEstado").value;
  const busca = $("busca").value.trim().toLowerCase();
  let lista = st === "Sem liberação" ? resultado.extras
    : st === "Após corte" ? resultado.detalhe.filter((d) => d.status.startsWith("Após corte"))
    : resultado.detalhe.filter((d) => !st || d.status === st);
  if (uf) lista = lista.filter((d) => d.estado === uf);
  if (busca) lista = lista.filter((d) => COLUNAS.some(([k]) => String(d[k] ?? "").toLowerCase().includes(busca)));
  if (ordem.col) {
    const c = ordem.col, s = ordem.asc ? 1 : -1;
    lista = [...lista].sort((a, b) => {
      const x = a[c], y = b[c];
      if (x instanceof Date || y instanceof Date) return ((x ? +x : 0) - (y ? +y : 0)) * s;
      if (typeof x === "number" && typeof y === "number") return (x - y) * s;
      return String(x ?? "").localeCompare(String(y ?? ""), "pt-BR", { numeric: true }) * s;
    });
  }
  return lista;
}

function celula(k, v) {
  if (k === "liberadoEm") return fmtDataHora(v);
  if (k === "valor") return fmtMoeda(v);
  if (k === "peso") return v === "" ? "" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (k === "status") {
    const c = v.startsWith("Após") ? "apos" : v === "Montado" ? "ok" : v === "Não montado" ? "nao" : "sem";
    return `<span class="status ${c}">${v}</span>`;
  }
  return v ?? "";
}

function renderDetalhe() {
  if (!resultado) return;
  const tab = $("tabDetalhe");
  tab.querySelector("thead").innerHTML = "<tr>" + COLUNAS.map(([k, t]) =>
    `<th data-col="${k}">${t}${ordem.col === k ? (ordem.asc ? " ▲" : " ▼") : ""}</th>`).join("") + "</tr>";

  const lista = linhasFiltradas();
  const LIMITE = 1000;
  tab.querySelector("tbody").innerHTML = lista.slice(0, LIMITE).map((d) =>
    "<tr>" + COLUNAS.map(([k]) => `<td class="${k === "valor" || k === "peso" ? "num" : ""}">${celula(k, d[k])}</td>`).join("") + "</tr>"
  ).join("");

  $("contagem").textContent = lista.length > LIMITE
    ? `Mostrando ${fmt(LIMITE)} de ${fmt(lista.length)} pedidos — use "Exportar Excel" para ver todos.`
    : `${fmt(lista.length)} pedido(s)`;

  tab.querySelectorAll("th").forEach((th) => (th.onclick = () => {
    const c = th.dataset.col;
    ordem = { col: c, asc: ordem.col === c ? !ordem.asc : true };
    renderDetalhe();
  }));
}

/* ---------- Exportação ---------- */

function exportar() {
  if (!resultado) return;
  const paraLinha = (d) => {
    const o = {};
    COLUNAS.forEach(([k, t]) => {
      o[t] = k === "liberadoEm" ? fmtDataHora(d[k]) : d[k];
    });
    return o;
  };
  const wb = XLSX.utils.book_new();

  const resumo = resumir("estado").map((g) => ({
    ESTADO: g.grupo, LIBERADOS: g.lib, MONTADOS: g.mon, "NÃO MONTADOS": g.nao,
    ...(resultado.usouCorte ? { "LIBERADOS APÓS CORTE": g.apos } : {}),
    "MONTADOS SEM LIBERAÇÃO": g.extra, "VALOR NÃO MONTADO": +g.valorNao.toFixed(2),
    "% MONTADO": +pct(g.mon, g.lib).toFixed(1),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo por estado");

  const nao = resultado.detalhe.filter((d) => d.status === "Não montado").map(paraLinha);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nao.length ? nao : [{ Pedido: "" }]), "Não montados");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.detalhe.map(paraLinha)), "Todos liberados");
  if (resultado.extras.length)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.extras.map(paraLinha)), "Sem liberação");

  const agora = new Date();
  const carimbo = agora.toLocaleDateString("pt-BR").replace(/\//g, "-") + "_" +
    String(agora.getHours()).padStart(2, "0") + "h" + String(agora.getMinutes()).padStart(2, "0");
  XLSX.writeFile(wb, `Liberados_x_Montados_${carimbo}.xlsx`);
}

/* ---------- Eventos ---------- */

function configurarDrop(el, input, tipoPadrao) {
  el.addEventListener("click", (e) => { if (!e.target.closest("button, select, input")) input.click(); });
  input.addEventListener("change", () => { carregar([...input.files], tipoPadrao); input.value = ""; });
  el.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => {
    e.preventDefault(); e.stopPropagation();
    el.classList.remove("over");
    carregar([...e.dataTransfer.files], tipoPadrao);
  });
}

// Soltar arquivos em qualquer lugar da página: classifica pelo nome
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => { e.preventDefault(); carregar([...e.dataTransfer.files], null); });

function limpar() {
  arquivos.lib.clear();
  arquivos.mon.clear();
  atualizarPaineis();
  esconderResultado();
  $("corte").value = "";
}

let timerToast;
function toast(msg, erro = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (erro ? " erro" : "");
  t.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => (t.hidden = true), 4000);
}

function corteHoje(hhmm) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  $("corte").value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${hhmm}`;
  if (resultado) comparar();
}

configurarDrop($("dropTodos"), $("fileTodos"), null);
configurarDrop($("dropLib"), $("fileLib"), "lib");
configurarDrop($("dropMon"), $("fileMon"), "mon");
$("btnComparar").onclick = comparar;
$("btnExportar").onclick = exportar;
$("btnLimpar").onclick = limpar;
$("btnCorte1715").onclick = () => corteHoje("17:15");
$("btnSemCorte").onclick = () => { $("corte").value = ""; if (resultado) comparar(); };
$("corte").addEventListener("change", () => { if (resultado) comparar(); });
$("grupo").addEventListener("change", () => { if (resultado) renderizar(); });
$("filtroStatus").onchange = renderDetalhe;
$("filtroEstado").onchange = renderDetalhe;
$("busca").oninput = renderDetalhe;
atualizarPaineis();
