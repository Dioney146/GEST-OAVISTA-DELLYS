"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Grafico from "../components/Grafico";
import Tabela from "../components/Tabela";
import { agoraManaus, dataISO, moeda, kg, num, txt } from "../lib/formato";

const URL_CONTROLE = process.env.NEXT_PUBLIC_URL_CONTROLE || "https://controle-de-entregas-iota.vercel.app";
const URL_TRANSF = process.env.NEXT_PUBLIC_URL_TRANSFERENCIAS || "https://reentregas-dellys.vercel.app";
const NI = ["NÃO IDENTIFICADO", "NÃO IDENTIFICADA"];

// colunas da aba Tabela (na ordem pedida)
const COLS_TABELA = [
  { key: "nota_venda", label: "NF Venda" },
  { key: "nota_devolucao", label: "NF Devolução" },
  { key: "carregamento", label: "Num Car" },
  { key: "placa", label: "Placa" },
  { key: "motorista", label: "Motorista" },
  { key: "entregador", label: "Entregador" },
  { key: "cod_cliente", label: "Cód Cli" },
  { key: "cliente", label: "Cliente" },
  { key: "destino", label: "Destino" },
  { key: "motivo", label: "Motivo" },
  { key: "vendedor", label: "Vendedor" },
  { key: "devolucionista", label: "Devolucionista" },
  { key: "praca", label: "Praça" },
  { key: "valor", label: "Valor", tipo: "moeda" },
];
const ABAS = [{ k: "painel", t: "📊 Painel" }, { k: "tabela", t: "📋 Tabela" }];

async function api(url, opcoes = {}) {
  const r = await fetch(url, { ...opcoes, headers: { "Content-Type": "application/json", ...(opcoes.headers || {}) }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.erro || `Erro ${r.status}`); e.status = r.status; throw e; }
  return j;
}

export default function App() {
  const [usuario, setUsuario] = useState(undefined);
  useEffect(() => { api("/api/eu").then((j) => setUsuario(j.usuario)).catch(() => setUsuario(null)); }, []);
  if (usuario === undefined) return <div className="carregando">Carregando…</div>;
  if (!usuario) return <Login aoEntrar={setUsuario} />;
  return <Painel usuario={usuario} aoSair={() => setUsuario(null)} />;
}

function Login({ aoEntrar }) {
  const [u, setU] = useState("");
  const [erro, setErro] = useState("");
  async function entrar(e) {
    e.preventDefault();
    try { const j = await api("/api/login", { method: "POST", body: JSON.stringify({ usuario: u }) }); aoEntrar(j.usuario); }
    catch (e) { setErro(e.message); }
  }
  return (
    <div className="login">
      <form onSubmit={entrar}>
        <h1>📦 Delly's — Devoluções</h1>
        <p>Sem senha — informe seu nome para entrar</p>
        <label>Seu nome<input className="campo" value={u} onChange={(e) => setU(e.target.value)} autoFocus autoComplete="name" placeholder="Ex.: Dioney" /></label>
        {erro && <div className="aviso erro">❌ {erro}</div>}
        <button className="btn primario grande" disabled={u.trim().length < 2}>Entrar</button>
        <p style={{ margin: 0, fontSize: ".72rem" }}>Nas próximas vezes você entra direto.</p>
      </form>
    </div>
  );
}

// ---------- agrupamento para os gráficos ----------
function agrupar(linhas, chave, rotulo, limite) {
  const m = new Map();
  for (const l of linhas) {
    const k = txt(chave(l));
    if (!k || NI.includes(k)) continue;
    const g = m.get(k) || { [rotulo]: k, qtd: 0, valor: 0 };
    g.qtd += 1;
    g.valor += Number(l.valor) || 0;
    m.set(k, g);
  }
  const todos = [...m.values()].sort((a, b) => b.valor - a.valor);
  return { rows: todos.slice(0, limite), total: todos.length };
}

const iso = (d) => dataISO(d);
function somarDiasIso(isoData, n) {
  const d = new Date(isoData + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Painel({ usuario, aoSair }) {
  const hoje = agoraManaus();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [de, setDe] = useState(hoje.iso.slice(0, 8) + "01");
  const [ate, setAte] = useState(hoje.iso);
  const [motivo, setMotivo] = useState("");
  const [trans, setTrans] = useState("");
  const [sup, setSup] = useState("");
  const [zona, setZona] = useState("");
  const [busca, setBusca] = useState("");
  const [maximizado, setMaximizado] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [aba, setAbaEstado] = useState("painel");
  useEffect(() => { const h = location.hash.slice(1); if (ABAS.some((a) => a.k === h)) setAbaEstado(h); }, []);
  const setAba = (k) => { setAbaEstado(k); history.replaceState(null, "", `#${k}`); };

  const carregar = useCallback(async (fresco = false) => {
    setAtualizando(true);
    try { setDados(await api(`/api/dados${fresco ? "?fresco=1" : ""}`)); setErro(""); }
    catch (e) { if (e.status === 401) aoSair(); else setErro(e.message); }
    finally { setAtualizando(false); }
  }, [aoSair]);
  useEffect(() => {
    carregar();
    const t = setInterval(() => { if (!document.hidden) carregar(); }, 120000);
    return () => clearInterval(t);
  }, [carregar]);

  const todas = dados?.linhas || [];
  const opcoes = useMemo(() => {
    const u = (f) => [...new Set(todas.map(f).filter((x) => x && !NI.includes(x)))].sort();
    return { motivos: u((l) => l.motivo), trans: u((l) => l.transportadora), sups: u((l) => l.supervisor), zonas: u((l) => l.zona) };
  }, [todas]);

  const filtradas = useMemo(() => {
    const b = busca.trim().toUpperCase();
    return todas.filter((l) => {
      const d = iso(l.dt_entrada);
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      if (motivo && l.motivo !== motivo) return false;
      if (trans && l.transportadora !== trans) return false;
      if (sup && l.supervisor !== sup) return false;
      if (zona && l.zona !== zona) return false;
      if (b && ![l.cliente, l.placa, l.nota_devolucao, l.nota_venda, l.carregamento, l.cod_cliente, l.motorista, l.entregador, l.praca, l.vendedor, l.devolucionista].join(" ").toUpperCase().includes(b)) return false;
      return true;
    });
  }, [todas, de, ate, motivo, trans, sup, zona, busca]);

  // aba Tabela: devoluções mais recentes primeiro
  const recentesPrimeiro = useMemo(() => [...filtradas].sort((a, b) => iso(b.dt_entrada).localeCompare(iso(a.dt_entrada)) || b.id - a.id), [filtradas]);
  const totValor = filtradas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const totPeso = filtradas.reduce((s, l) => s + (Number(l.peso) || 0), 0);
  const clientes = new Set(filtradas.map((l) => l.cod_cliente || l.cliente)).size;
  const identificadas = filtradas.filter((l) => l.origem_nomes).length;

  const lim = (k) => (maximizado === k ? 30 : 10);
  const GRAFICOS = [
    { k: "veiculo", t: "🚛 Por Veículo", r: "placa", f: (l) => l.placa },
    { k: "motivo", t: "📋 Por Motivo", r: "motivo", f: (l) => l.motivo },
    { k: "motorista", t: "🧑‍✈️ Por Motorista (Retorno)", r: "motorista", f: (l) => l.motorista },
    { k: "entregador", t: "📦 Por Entregador (Retorno)", r: "entregador", f: (l) => l.entregador },
    { k: "trans", t: "🏢 Por Transportadora", r: "trans", f: (l) => l.transportadora },
    { k: "supervisor", t: "👔 Por Supervisor", r: "supervisor", f: (l) => l.supervisor },
    { k: "zona", t: "📍 Por Zona / Rota", r: "zona", f: (l) => l.zona },
    { k: "cliente", t: "🏪 Por Cliente", r: "cliente", f: (l) => l.cliente },
  ].map((g) => ({ ...g, ...agrupar(filtradas, g.f, g.r, lim(g.k)) }));
  const mostrar = maximizado ? GRAFICOS.filter((g) => g.k === maximizado) : GRAFICOS;

  function periodo(dias) {
    if (dias === "mes") { setDe(hoje.iso.slice(0, 8) + "01"); setAte(hoje.iso); return; }
    if (dias === "ano") { setDe(hoje.iso.slice(0, 4) + "-01-01"); setAte(hoje.iso); return; }
    setDe(somarDiasIso(hoje.iso, -(dias - 1))); setAte(hoje.iso);
  }
  function limpar() { setMotivo(""); setTrans(""); setSup(""); setZona(""); setBusca(""); }

  async function baixarExcel(vis) {
    const XLSX = await import("xlsx");
    const linhasX = vis.map((l) => Object.fromEntries([
      ["Data Devolução", l.dt_entrada || ""],
      ...COLS_TABELA.map((c) => [c.label, c.tipo === "moeda" ? Number(l[c.key]) || 0 : txt(l[c.key])]),
    ]));
    const ws = XLSX.utils.json_to_sheet(linhasX);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Devoluções");
    XLSX.writeFile(wb, `devolucoes_${de || "inicio"}_a_${ate || "hoje"}.xlsx`);
  }

  async function sair() { await fetch("/api/sair", { method: "POST" }).catch(() => {}); aoSair(); }

  return (
    <>
      <Topo usuario={usuario} sair={sair} aba={aba} setAba={setAba} />
      <main className="corpo">
        <div className="barra-filtro devol-filtros">
          <label className="rotulo">Devolução de<input className="campo" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label className="rotulo">até<input className="campo" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
          <div className="atalhos">
            <button className="btn mini" onClick={() => periodo(1)}>Hoje</button>
            <button className="btn mini" onClick={() => periodo(7)}>7 dias</button>
            <button className="btn mini" onClick={() => periodo("mes")}>Mês</button>
            <button className="btn mini" onClick={() => periodo("ano")}>Ano</button>
          </div>
          <Sel rot="Motivo" v={motivo} set={setMotivo} ops={opcoes.motivos} />
          <Sel rot="Transportadora" v={trans} set={setTrans} ops={opcoes.trans} />
          <Sel rot="Supervisor" v={sup} set={setSup} ops={opcoes.sups} />
          <Sel rot="Zona / Rota" v={zona} set={setZona} ops={opcoes.zonas} />
          <label className="rotulo" style={{ flex: 1, minWidth: 200 }}>Buscar
            <input className="campo" placeholder="cliente, placa, nota, motorista…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <button className="btn" style={{ height: 38 }} onClick={limpar}>Limpar</button>
          <button className="btn" style={{ height: 38 }} onClick={() => carregar(true)} disabled={atualizando}>{atualizando ? "…" : "⟳ Atualizar"}</button>
        </div>

        {erro && <div className="aviso erro">⚠️ {erro}</div>}
        {dados && !dados.retornoConectado && (
          <div className="aviso alerta">⚠️ {dados.retornoMotivo === "sem-variaveis"
            ? "Retorno do Controle de Entregas não conectado: faltam as variáveis SUPABASE_URL e SUPABASE_ANON_KEY neste projeto da Vercel (depois de criar, faça Redeploy)."
            : `Não consegui ler o Retorno do Controle de Entregas (${dados.retornoMotivo}). Confira se SUPABASE_URL e SUPABASE_ANON_KEY são os mesmos do Controle de Entregas.`} Por enquanto motorista e entregador vêm só da aba NOMES.</div>
        )}

        {!dados ? (!erro && <div className="carregando">Carregando devoluções da planilha…</div>) : (
          <>
            <div className="kpis kpis-5">
              <Kpi cor="#fb7c8f" ico="🧾" rot="Notas devolvidas" val={num(filtradas.length)} />
              <Kpi cor="#fbc245" ico="💰" rot="Valor devolvido" val={moeda(totValor)} />
              <Kpi cor="#3b82f6" ico="⚖️" rot="Peso devolvido" val={kg(totPeso)} />
              <Kpi cor="#a78bfa" ico="🏪" rot="Clientes" val={num(clientes)} />
              <Kpi cor="#22c55e" ico="🧑‍✈️" rot="Com motorista/entregador" val={`${filtradas.length ? Math.round((identificadas / filtradas.length) * 100) : 0}%`}
                sub={`${num(identificadas)} de ${num(filtradas.length)} pelo Retorno/Nomes`} />
            </div>

            {aba === "tabela" ? (
              <div className="cartao devol-tabela">
                <div className="cartao-cab">
                  <span className="cartao-titulo">📋 Devoluções — nota a nota</span>
                  <span className="cartao-conta">{num(filtradas.length)} notas · {moeda(totValor)}</span>
                </div>
                <div className="cartao-corpo">
                  <Tabela
                    linhas={recentesPrimeiro}
                    colunas={COLS_TABELA}
                    chaveLinha={(l) => l.id}
                    limite={300}
                    classeLinha={(l) => (l.origem_nomes ? "" : "sem-nomes")}
                    vazio="Sem devoluções no filtro."
                    rodape={(vis) => (
                      <>
                        <span>Total: <b>{moeda(vis.reduce((s, l) => s + (Number(l.valor) || 0), 0))}</b></span>
                        <button className="btn mini" onClick={() => baixarExcel(vis)}>⬇️ Baixar Excel</button>
                      </>
                    )}
                  />
                </div>
              </div>
            ) : (
            <div className={`graficos ${maximizado ? "um" : ""}`}>
              {mostrar.map((g) => (
                <Grafico
                  key={g.k}
                  titulo={`${g.t}${g.total > g.rows.length ? ` · top ${g.rows.length} de ${g.total}` : ""}`}
                  linhas={g.rows} rotulo={g.r} vazio="Sem devoluções no filtro."
                  maximizado={maximizado === g.k}
                  aoMaximizar={() => setMaximizado(maximizado === g.k ? null : g.k)}
                />
              ))}
            </div>
            )}
            <p className="rodape-info">
              Base: aba <b>{dados.aba}</b> · {num(todas.length)} devoluções · motorista e entregador pelo <b>Retorno</b> do Controle de Entregas (placa + data de entrega).
              Atualizado {new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit" })}.
            </p>
          </>
        )}
      </main>
    </>
  );
}

function Sel({ rot, v, set, ops }) {
  return (
    <label className="rotulo">{rot}
      <select className="campo" value={v} onChange={(e) => set(e.target.value)} style={{ maxWidth: 220 }}>
        <option value="">Todos</option>
        {ops.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Kpi({ cor, ico, rot, val, sub }) {
  return (
    <div className="kpi" style={{ "--cor": cor }}>
      <span className="ico">{ico}</span>
      <div className="rot">{rot}</div>
      <div className="val">{val}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function Topo({ usuario, sair, aba, setAba }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);
  return (
    <header className="topo">
      <div className="marca">
        <div className="marca-logo">📦</div>
        <div><b>Delly's <span>Devoluções</span></b><small>Painel de devoluções</small></div>
      </div>
      <nav className="abas">
        {ABAS.map((a) => (
          <button key={a.k} className={`aba ${aba === a.k ? "ativa" : ""}`} onClick={() => setAba(a.k)}>{a.t}</button>
        ))}
      </nav>
      <div className="topo-dir" ref={ref}>
        <a className="link-outro" href={URL_CONTROLE} target="_blank" rel="noopener noreferrer">🚚 <span>Controle de Entregas</span> ↗</a>
        <a className="link-outro" href={URL_TRANSF} target="_blank" rel="noopener noreferrer">🔁 <span>Transferências</span> ↗</a>
        <div style={{ position: "relative" }}>
          <div className="avatar" onClick={() => setAberto(!aberto)} title="Minha conta">{usuario.slice(0, 1).toUpperCase()}</div>
          {aberto && (
            <div className="popover">
              <h4 style={{ textTransform: "capitalize" }}>{usuario}</h4>
              <small>Painel de Devoluções · Delly's</small>
              <button className="btn grande" style={{ marginTop: 10 }} onClick={sair}>🚪 Trocar de usuário</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
