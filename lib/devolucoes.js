// Base de devoluções (colada do ERP na planilha) + motorista/entregador do RETORNO (Controle de Entregas).
import { lerAbas, listarAbas } from "./planilha";
import { dataBR, dataISO, lerNumero, txt } from "./formato";

const normPlaca = (p) => String(p || "").trim().toUpperCase().replace(/[\s-]/g, "");
const limpaNome = (s) => txt(String(s ?? "").replace(/▾/g, "")).toUpperCase();
const semAM = (s) => txt(s).replace(/^AM\s*-\s*/i, "").trim().toUpperCase();

// transportadora pelo fornecedor do frete (quando a placa não estiver no Retorno)
function transDoFornecedor(f) {
  const s = txt(f).toUpperCase();
  if (!s) return "";
  if (s.includes("HOK")) return "HOK";
  if (s.includes("MAMBA")) return "MAMBA";
  if (s.includes("RALPH")) return "RALPH";
  if (s.includes("AMORIM")) return "AMORIM";
  if (s.includes("CMG")) return "CMG";
  if (s.includes("JB")) return "JB TRANSP";
  return s.split(/\s+/).slice(0, 2).join(" ");
}

// ---------- abas ----------
async function nomesDasAbas() {
  const abas = Object.keys(await listarAbas());
  const devol = process.env.ABA_DEVOLUCAO || abas.find((a) => /DEVOLU/i.test(a)) || abas[0];
  const nomes = abas.find((a) => /^NOMES$/i.test(a.trim())) || null;
  return { devol, nomes };
}

// ---------- Retorno (Supabase) ----------
function configSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const chave = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return url && chave ? { url, chave } : null;
}

async function lerRetorno(de, ate) {
  const c = configSupabase();
  if (!c) return { linhas: [], ok: false, motivo: "sem-variaveis" };
  if (!de) return { linhas: [], ok: true };
  const pegar = async (soRetorno) => {
    let todas = [];
    for (let off = 0; off < 50000; off += 1000) {
      const qs = new URLSearchParams({
        select: "data,placa,transportadora,motorista,entregador",
        and: `(data.gte.${de},data.lte.${ate})`,
        order: "data.asc,id.asc", limit: "1000", offset: String(off),
      });
      if (soRetorno) qs.set("liberado_retorno", "eq.true");
      let r;
      try {
        r = await fetch(`${c.url}/rest/v1/saidas?${qs}`, {
          headers: { apikey: c.chave, Authorization: `Bearer ${c.chave}` }, cache: "no-store",
        });
      } catch (e) { return { erro: "rede", detalhe: String(e?.cause?.code || e?.message || e) }; }
      if (!r.ok) return { erro: r.status, detalhe: (await r.text().catch(() => "")).slice(0, 200) };
      const d = await r.json();
      todas = todas.concat(d);
      if (d.length < 1000) break;
    }
    return { linhas: todas };
  };
  let r = await pegar(true);
  if (r.erro === 400) r = await pegar(false); // banco sem a coluna liberado_retorno
  if (r.erro) return { linhas: [], ok: false, motivo: `erro ${r.erro}${r.detalhe ? ": " + r.detalhe : ""}` };
  return { linhas: r.linhas, ok: true };
}

// ---------- montagem ----------
let cache = null;
let cacheEm = 0;

export async function carregarDevolucoes({ fresco = false } = {}) {
  if (!fresco && cache && Date.now() - cacheEm < 60000) return cache;
  const { devol, nomes } = await nomesDasAbas();
  const v = await lerAbas(nomes ? [devol, nomes] : [devol]);
  const valores = v[devol] || [];
  const cab = (valores[0] || []).map((c) => String(c).trim().toUpperCase());
  const ix = (nome) => cab.indexOf(nome);
  const col = (row, nome) => { const i = ix(nome); return i >= 0 ? row[i] ?? "" : ""; };

  // O ERP às vezes exporta colunas a mais no meio (ex.: gerente), deslocando o final da linha.
  // Por isso Praça e Rota são achadas a partir da coluna FINALIZADO (Sim/Não), e o Supervisor
  // é o 1º valor "AM - ..." a partir da coluna SUPERVISOR.
  const iFin = ix("FINALIZADO"), iSup = ix("SUPERVISOR"), iFunc = ix("NOMEFUNC"), iRca = ix("NOMERCA");
  function finalDaLinha(r) {
    for (let k = r.length - 1; k >= Math.max(0, iFin - 2); k--) {
      if (/^(sim|n[aã]o)$/i.test(String(r[k] ?? "").trim())) return k;
    }
    return -1;
  }
  // posição real do supervisor na linha (pode estar deslocada para a direita)
  function posSupervisor(r) {
    if (iSup < 0) return -1;
    for (let k = iSup; k < Math.min(r.length, iSup + 4); k++) {
      if (/^AM\s*-/i.test(String(r[k] ?? "").trim())) return k;
    }
    return iSup;
  }
  // Vendedor (NOMERCA) fica sempre 2 colunas antes do supervisor
  function vendedorDaLinha(r, ks) {
    if (iRca < 0) return "";
    const v = txt(ks >= 0 && iSup >= 0 ? r[ks - (iSup - iRca)] : col(r, "NOMERCA"));
    return /^\d+$/.test(v) ? txt(col(r, "NOMERCA")) : v;
  }
  // Devolucionista (NOMEFUNC = quem lançou a devolução): achado a partir do FINALIZADO
  function devolucionistaDaLinha(r, f) {
    if (iFunc < 0) return "";
    const v = txt(f >= 0 && iFin >= 0 ? r[f - (iFin - iFunc)] : col(r, "NOMEFUNC"));
    return /^\d+$/.test(v) ? txt(col(r, "NOMEFUNC")) : v;
  }

  const base = [];
  for (let i = 1; i < valores.length; i++) {
    const r = valores[i] || [];
    const f = finalDaLinha(r);
    const ks = posSupervisor(r);
    const nota = txt(col(r, "NOTA_DEVOLUCAO"));
    const placa = normPlaca(col(r, "PLACA"));
    if (!nota && !placa) continue;
    if (/^NOTA_DEVOLU/i.test(nota)) continue; // cabeçalho repetido no meio da colagem
    base.push({
      id: i + 1,
      dt_entrada: dataBR(col(r, "DTENT")),
      dt_saida: dataBR(col(r, "DTSAIDA")),
      dt_entrega: dataBR(col(r, "DTENTREGA")),
      nota_devolucao: nota,
      nota_venda: txt(col(r, "NOTA_VENDA")),
      carregamento: txt(col(r, "NUMCAR")),
      placa,
      destino: txt(col(r, "DESTINO")),
      valor: lerNumero(col(r, "VLTOTAL")),
      peso: lerNumero(col(r, "TOTPESO")),
      motivo: txt(col(r, "MOTIVO")).toUpperCase(),
      obs: txt(col(r, "OBS")),
      fornecedor: txt(col(r, "FORNECEDOR FRETE SAIDA")),
      cliente: txt(col(r, "CLIENTE")).toUpperCase(),
      cod_cliente: txt(col(r, "CODCLI")),
      cidade: txt(col(r, "NOME_CIDADE")).toUpperCase(),
      supervisor: semAM(ks >= 0 ? r[ks] : ""),
      vendedor: semAM(vendedorDaLinha(r, ks)),
      devolucionista: semAM(devolucionistaDaLinha(r, f)),
      praca: txt(f > 1 ? r[f - 2] : col(r, "PRACA")).toUpperCase(),
      zona: txt(f > 0 ? r[f - 1] : col(r, "ROTA")).toUpperCase(),
      finalizado: txt(f >= 0 ? r[f] : col(r, "FINALIZADO")),
      motorista_erp: txt(col(r, "MOTORISTA")).toUpperCase(),
    });
  }

  // período coberto pela base -> busca o Retorno desse período de uma vez só
  const isos = base.map((b) => dataISO(b.dt_entrega || b.dt_saida)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const de = isos[0] ? isoMenosDias(isos[0], 7) : "";
  const ate = isos[isos.length - 1] || "";
  const ret = await lerRetorno(de, ate);
  const porPlaca = new Map();
  for (const s of ret.linhas) {
    if (!txt(s.motorista) && !txt(s.entregador)) continue;
    const p = normPlaca(s.placa);
    if (!porPlaca.has(p)) porPlaca.set(p, []);
    porPlaca.get(p).push(s); // já vem em ordem de data
  }

  // aba NOMES (reserva)
  const tabNomes = new Map();
  if (nomes && v[nomes]?.length) {
    const cn = v[nomes][0].map((c) => String(c).trim().toUpperCase());
    const ip = cn.findIndex((c) => c.includes("PLACA")), im = cn.findIndex((c) => c.includes("MOTORISTA")), ie = cn.findIndex((c) => c.includes("ENTREGADOR"));
    for (const r of v[nomes].slice(1)) {
      const p = normPlaca(r[ip]);
      if (p) tabNomes.set(p, { motorista: im >= 0 ? limpaNome(r[im]) : "", entregador: ie >= 0 ? limpaNome(r[ie]) : "" });
    }
  }

  let doRetorno = 0;
  const linhas = base.map((b) => {
    const dia = dataISO(b.dt_entrega || b.dt_saida);
    const lista = porPlaca.get(b.placa) || [];
    let achou = lista.find((s) => s.data === dia);
    let origem = achou ? "retorno" : "";
    if (!achou && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
      const antes = lista.filter((s) => s.data <= dia);
      if (antes.length && diasEntre(antes[antes.length - 1].data, dia) <= 7) { achou = antes[antes.length - 1]; origem = "retorno-aprox"; }
    }
    let motorista = "", entregador = "", trans = "";
    if (achou) {
      motorista = limpaNome(achou.motorista);
      entregador = limpaNome(achou.entregador);
      trans = txt(achou.transportadora).toUpperCase();
      doRetorno++;
    } else if (tabNomes.has(b.placa)) {
      ({ motorista, entregador } = tabNomes.get(b.placa));
      origem = "nomes";
    }
    return {
      ...b,
      motorista: motorista || "NÃO IDENTIFICADO",
      entregador: entregador || "NÃO IDENTIFICADO",
      transportadora: trans || transDoFornecedor(b.fornecedor) || "NÃO IDENTIFICADA",
      origem_nomes: origem,
    };
  });

  cache = { linhas, aba: devol, retornoConectado: ret.ok, retornoMotivo: ret.motivo || "", doRetorno, atualizadoEm: new Date().toISOString() };
  cacheEm = Date.now();
  return cache;
}

function isoMenosDias(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function diasEntre(a, b) {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
}
