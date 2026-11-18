// Aba "Painel": capa do sistema com os indicadores principais em gráficos.
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
} from "recharts";
import * as dadosPainel from "./dadosPainel";
import type { Painel, ProdutoPainel } from "./dadosPainel";

const AZUL = "#2a78d6", CINZA = "#b4b2a9", VERDE = "#1baf7a", VERMELHO = "#e34948", LARANJA = "#eb6834", GRADE = "#e5e7eb";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const kR = (n: number) => (Math.abs(n) >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : `R$ ${Math.round(n)}`);
const pct = (n: number | null | undefined, casas = 1) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const qtdBR = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dataBR = (s: string) => s.split("-").reverse().join("/");
const curto = (s: string, n = 22) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

type Atalho = "mes" | "mesPassado" | "30d" | "personalizado";
function periodoDoAtalho(a: Atalho): { inicio: string; fim: string } {
  const hoje = new Date();
  if (a === "mesPassado") {
    return { inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), fim: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) };
  }
  if (a === "30d") {
    const ini = new Date(hoje); ini.setDate(ini.getDate() - 29);
    return { inicio: iso(ini), fim: iso(hoje) };
  }
  return { inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: iso(hoje) };
}

function Bloco({ titulo, sub, children, acao }: { titulo: string; sub?: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-4 bg-white min-w-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold text-sm">{titulo}</div>
          {sub && <div className="text-xs text-gray-500">{sub}</div>}
        </div>
        {acao}
      </div>
      {children}
    </div>
  );
}

function Alternar<T extends string>({ valor, opcoes, mudar }: { valor: T; opcoes: [T, string][]; mudar: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {opcoes.map(([v, r]) => (
        <button key={v} onClick={() => mudar(v)}
          className={`text-xs px-2 py-1 rounded-md border ${valor === v ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600"}`}>{r}</button>
      ))}
    </div>
  );
}

function Kpi({ rotulo, valor, atual, anterior, menorMelhor, pontos }: { rotulo: string; valor: string; atual: number; anterior: number; menorMelhor?: boolean; pontos?: boolean }) {
  let delta: React.ReactNode = <span className="text-gray-400">sem comparação</span>;
  if (anterior) {
    const d = pontos ? atual - anterior : ((atual - anterior) / Math.abs(anterior)) * 100;
    const bom = menorMelhor ? d < 0 : d > 0;
    const txt = pontos ? `${Math.abs(d).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.` : `${Math.abs(d).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
    delta = Math.abs(d) < 0.05
      ? <span className="text-gray-500">igual ao anterior</span>
      : <span className={bom ? "text-green-700" : "text-red-600"}>{d > 0 ? "▲" : "▼"} {txt} vs anterior</span>;
  }
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{rotulo}</div>
      <div className="text-xl sm:text-2xl font-semibold tabular-nums">{valor}</div>
      <div className="text-xs">{delta}</div>
    </div>
  );
}

const DicaValor = ({ active, payload, label, formato }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-md px-2 py-1 text-xs shadow-sm">
      <div className="font-semibold">{label}</div>
      {payload.map((p: any, i: number) => p.value != null && <div key={i}>{p.name}: {formato(p.value)}</div>)}
    </div>
  );
};

function Matriz({ produtos }: { produtos: ProdutoPainel[] }) {
  const pontos = produtos.filter((p) => p.margemUnit !== null && p.qtd >= 1).map((p) => ({ x: p.qtd, y: p.margemUnit as number, nome: p.nome, receita: p.receita }));
  if (pontos.length < 3) return <div className="text-sm text-gray-500">Poucos produtos com ficha técnica vendidos no período.</div>;
  const med = (l: number[]) => { const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mx = med(pontos.map((p) => p.x)), my = med(pontos.map((p) => p.y));
  const cor = (p: { x: number; y: number }) => (p.x >= mx && p.y >= my ? VERDE : p.x < mx && p.y < my ? VERMELHO : p.x >= mx ? LARANJA : AZUL);
  return (
    <>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 10, right: 16, bottom: 18, left: 4 }}>
            <CartesianGrid stroke={GRADE} />
            <XAxis type="number" dataKey="x" name="Qtd vendida" tick={{ fontSize: 11 }} label={{ value: "Qtd vendida", position: "insideBottom", offset: -8, fontSize: 11 }} />
            <YAxis type="number" dataKey="y" name="Margem" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$ ${Math.round(v)}`} width={56} />
            <ZAxis range={[50, 50]} />
            <ReferenceLine x={mx} stroke={CINZA} strokeDasharray="4 4" />
            <ReferenceLine y={my} stroke={CINZA} strokeDasharray="4 4" />
            <Tooltip content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return <div className="bg-white border rounded-md px-2 py-1 text-xs shadow-sm"><div className="font-semibold">{p.nome}</div><div>{qtdBR(p.x)} vendidos · margem {brl(p.y)} por unidade</div></div>;
            }} />
            <Scatter data={pontos}>
              {pontos.map((p, i) => <Cell key={i} fill={cor(p)} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mt-1">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: VERDE }} />Estrelas: vende muito e margem alta</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: LARANJA }} />Vende muito, margem baixa: rever preço/ficha</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: AZUL }} />Margem alta, vende pouco: divulgar</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: VERMELHO }} />Vende pouco e margem baixa: repensar</span>
      </div>
      <div className="text-xs text-gray-400 mt-1">Margem = preço médio vendido − custo da ficha, por unidade. As linhas tracejadas são as medianas.</div>
    </>
  );
}

function CmvMensal({ fim }: { fim: string }) {
  const [dados, setDados] = useState<Awaited<ReturnType<typeof dadosPainel.cmvPorMes>> | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    setDados(null); setErro("");
    let so = true;
    try { so = localStorage.getItem("fattoria_cmv_so_inventariados") !== "0"; } catch {}
    dadosPainel.cmvPorMes(fim, 6, so).then((d) => vivo && setDados(d)).catch((e) => vivo && setErro(String(e?.message || e)));
    return () => { vivo = false; };
  }, [fim]);
  if (erro) return <div className="text-sm text-red-600">{erro}</div>;
  if (!dados) return <div className="text-sm text-gray-500">Calculando CMV dos últimos meses...</div>;
  const comVenda = dados.filter((d) => d.faturamento > 0);
  if (!comVenda.length) return <div className="text-sm text-gray-500">Sem vendas nos últimos meses.</div>;
  return (
    <>
      <div className="flex gap-4 text-xs text-gray-600 mb-1">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: LARANJA }} />Real (inventário)</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: AZUL }} />Teórico (fichas)</span>
      </div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={comVenda} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRADE} vertical={false} />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} width={40} />
            <Tooltip content={<DicaValor formato={(v: number) => pct(v)} />} />
            <Bar dataKey="real" name="Real" fill={LARANJA} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="teorico" name="Teórico" fill={AZUL} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-gray-400">O real aparece nos meses com inventário no dia 01 do mês e do mês seguinte (sem o consumo interno).</div>
    </>
  );
}

export default function PainelTab() {
  const [atalho, setAtalho] = useState<Atalho>("mes");
  const [periodo, setPeriodo] = useState(() => periodoDoAtalho("mes"));
  const [dados, setDados] = useState<Painel | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [rankPor, setRankPor] = useState<"qtd" | "receita">("qtd");
  const [cmvVer, setCmvVer] = useState<"melhores" | "piores">("melhores");

  const escolher = (a: Atalho) => { setAtalho(a); if (a !== "personalizado") setPeriodo(periodoDoAtalho(a)); };

  useEffect(() => {
    if (!periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim) return;
    let vivo = true;
    setCarregando(true); setErro("");
    dadosPainel.carregarPainel(periodo.inicio, periodo.fim)
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(String(e?.message || e)))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [periodo.inicio, periodo.fim]);

  const ranking = useMemo(() => (dados ? [...dados.produtos].sort((a, b) => (rankPor === "qtd" ? b.qtd - a.qtd : b.receita - a.receita)).slice(0, 10) : []), [dados, rankPor]);
  const cmvProdutos = useMemo(() => {
    if (!dados) return [];
    // só produtos com ficha e alguma relevância (ao menos 5 unidades ou 1% do faturamento)
    const lim = dados.kpis.faturamento * 0.01;
    const l = dados.produtos.filter((p) => p.cmvPct !== null && (p.qtd >= 5 || p.receita >= lim));
    l.sort((a, b) => (cmvVer === "melhores" ? (a.cmvPct as number) - (b.cmvPct as number) : (b.cmvPct as number) - (a.cmvPct as number)));
    return l.slice(0, 10);
  }, [dados, cmvVer]);

  const k = dados?.kpis;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Alternar valor={atalho} mudar={escolher} opcoes={[["mes", "Este mês"], ["mesPassado", "Mês passado"], ["30d", "Últimos 30 dias"], ["personalizado", "Personalizado"]]} />
        {atalho === "personalizado" && (
          <div className="flex gap-2 items-center text-sm">
            <input type="date" className="input" value={periodo.inicio} onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))} />
            <span>a</span>
            <input type="date" className="input" value={periodo.fim} onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))} />
          </div>
        )}
        {carregando && <span className="text-xs text-gray-500">Atualizando...</span>}
      </div>
      {dados && (
        <div className="text-xs text-gray-500 -mt-2">
          {dataBR(dados.periodo.inicio)} a {dataBR(dados.periodo.fim)} · comparando com {dataBR(dados.anterior.inicio)} a {dataBR(dados.anterior.fim)}
        </div>
      )}
      {erro && <div className="text-sm text-red-600">{erro}</div>}
      {!dados && !erro && <div className="text-sm text-gray-500">Carregando indicadores...</div>}

      {dados && k && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi rotulo="Faturamento" valor={brl0(k.faturamento)} atual={k.faturamento} anterior={k.faturamentoAnt} />
            <Kpi rotulo="Itens vendidos" valor={qtdBR(k.itens)} atual={k.itens} anterior={k.itensAnt} />
            <Kpi rotulo="CMV teórico" valor={pct(k.cmvPct)} atual={k.cmvPct} anterior={k.cmvPctAnt} menorMelhor pontos />
            <Kpi rotulo="Lucro bruto estimado" valor={brl0(k.lucroBruto)} atual={k.lucroBruto} anterior={k.lucroBrutoAnt} />
          </div>
          {dados.semFicha.length > 0 && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {dados.semFicha.length} produto(s) vendido(s) sem ficha técnica entram com custo zero no CMV e no lucro: {dados.semFicha.slice(0, 8).join(", ")}{dados.semFicha.length > 8 ? "..." : ""}. Ligue na aba Vendas ou cadastre a ficha.
            </div>
          )}

          <Bloco titulo="Faturamento por dia" sub="Linha tracejada: período anterior">
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={dados.porDia} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRADE} vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={kR} width={56} />
                  <Tooltip content={<DicaValor formato={brl} />} />
                  <Line type="monotone" dataKey="anterior" name="Anterior" stroke={CINZA} strokeDasharray="5 4" strokeWidth={1.5} dot={false} connectNulls />
                  <Line type="monotone" dataKey="atual" name="Período" stroke={AZUL} strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Bloco>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Bloco titulo="Média por dia da semana" sub={`Faturamento médio nos dias com venda (${k.diasComVenda} dias)`}>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={dados.diaSemana} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRADE} vertical={false} />
                    <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={kR} width={56} />
                    <Tooltip content={<DicaValor formato={brl} />} />
                    <Bar dataKey="media" name="Média" fill={AZUL} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Bloco>
            <Bloco titulo="Faturamento por categoria" sub="Grupos do Colibri">
              <div style={{ width: "100%", height: Math.max(200, dados.categorias.slice(0, 10).length * 30 + 30) }}>
                <ResponsiveContainer>
                  <BarChart data={dados.categorias.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRADE} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={kR} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={120} tickFormatter={(s: string) => curto(s, 18)} />
                    <Tooltip content={<DicaValor formato={(v: number) => `${brl(v)} (${pct((v / k.faturamento) * 100)})`} />} />
                    <Bar dataKey="valor" name="Faturamento" fill={AZUL} radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Bloco>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Bloco titulo="Produtos mais vendidos" sub="Top 10 do período"
              acao={<Alternar valor={rankPor} mudar={setRankPor} opcoes={[["qtd", "Qtd"], ["receita", "R$"]]} />}>
              <div style={{ width: "100%", height: 330 }}>
                <ResponsiveContainer>
                  <BarChart data={ranking} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRADE} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={rankPor === "qtd" ? qtdBR : kR} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={130} tickFormatter={(s: string) => curto(s)} />
                    <Tooltip content={<DicaValor formato={rankPor === "qtd" ? qtdBR : brl} />} />
                    <Bar dataKey={rankPor} name={rankPor === "qtd" ? "Qtd" : "Faturamento"} fill={AZUL} radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Bloco>
            <Bloco titulo="CMV por produto" sub="Custo da ficha ÷ preço vendido"
              acao={<Alternar valor={cmvVer} mudar={setCmvVer} opcoes={[["melhores", "Melhores"], ["piores", "Piores"]]} />}>
              {cmvProdutos.length === 0 ? <div className="text-sm text-gray-500">Nenhum produto com ficha vendido no período.</div> : (
                <div style={{ width: "100%", height: 330 }}>
                  <ResponsiveContainer>
                    <BarChart data={cmvProdutos} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRADE} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={130} tickFormatter={(s: string) => curto(s)} />
                      <Tooltip content={<DicaValor formato={(v: number) => pct(v)} />} />
                      <ReferenceLine x={k.cmvPct} stroke={CINZA} strokeDasharray="4 4" />
                      <Bar dataKey="cmvPct" name="CMV" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {cmvProdutos.map((p, i) => <Cell key={i} fill={(p.cmvPct as number) <= k.cmvPct ? VERDE : VERMELHO} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="text-xs text-gray-400">Linha tracejada: CMV teórico geral ({pct(k.cmvPct)}). Verde abaixo dele, vermelho acima.</div>
            </Bloco>
          </div>

          <Bloco titulo="Matriz do cardápio" sub="Cada ponto é um produto: quanto vende × quanto sobra por unidade">
            <Matriz produtos={dados.produtos} />
          </Bloco>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Bloco titulo="Insumos que mais pesam no custo" sub="Consumo teórico das vendas pelas fichas × custo atual">
              {dados.insumos.length === 0 ? <div className="text-sm text-gray-500">Sem dados.</div> : (
                <div style={{ width: "100%", height: 330 }}>
                  <ResponsiveContainer>
                    <BarChart data={dados.insumos.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRADE} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={kR} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={130} tickFormatter={(s: string) => curto(s)} />
                      <Tooltip content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload;
                        return <div className="bg-white border rounded-md px-2 py-1 text-xs shadow-sm"><div className="font-semibold">{p.nome}</div><div>{brl(p.valor)} · {qtdBR(p.qtd)} {p.unidade}</div></div>;
                      }} />
                      <Bar dataKey="valor" name="Custo" fill={LARANJA} radius={[0, 4, 4, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Bloco>
            <Bloco titulo="Preço dos insumos" sub="Última compra do período × compra anterior">
              {dados.precos.length === 0 ? <div className="text-sm text-gray-500">Nenhuma compra no período com compra anterior para comparar.</div> : (
                <div className="overflow-auto max-h-80">
                  <table className="min-w-full text-sm">
                    <thead className="text-xs text-gray-500">
                      <tr><th className="text-left py-1">Insumo</th><th className="text-right py-1">Antes</th><th className="text-right py-1">Agora</th><th className="text-right py-1">Variação</th></tr>
                    </thead>
                    <tbody>
                      {dados.precos.filter((p) => Math.abs(p.variacaoPct) >= 0.5).slice(0, 15).map((p, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-1">{p.nome}</td>
                          <td className="py-1 text-right tabular-nums" title={dataBR(p.dataAnterior)}>{brl(p.anterior)}</td>
                          <td className="py-1 text-right tabular-nums" title={dataBR(p.dataAtual)}>{brl(p.atual)}</td>
                          <td className={`py-1 text-right tabular-nums font-semibold ${p.variacaoPct > 0 ? "text-red-600" : "text-green-700"}`}>
                            {p.variacaoPct > 0 ? "▲" : "▼"} {pct(Math.abs(p.variacaoPct), 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {dados.precos.every((p) => Math.abs(p.variacaoPct) < 0.5) && <div className="text-sm text-gray-500">Nenhum preço mudou.</div>}
                </div>
              )}
            </Bloco>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Bloco titulo="Consumo interno" sub={`${brl(dados.interno.total)} no período (preço interno) · ${dados.interno.lancamentos} lançamentos`}>
              {dados.interno.porPessoa.length === 0 ? <div className="text-sm text-gray-500">Nenhum consumo lançado no período.</div> : (
                <div style={{ width: "100%", height: Math.max(160, dados.interno.porPessoa.length * 34 + 30) }}>
                  <ResponsiveContainer>
                    <BarChart data={dados.interno.porPessoa} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRADE} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={kR} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip content={<DicaValor formato={brl} />} />
                      <Bar dataKey="valor" name="Consumo" fill={AZUL} radius={[0, 4, 4, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Bloco>
            <Bloco titulo="CMV por mês" sub="Últimos 6 meses até o fim do período">
              <CmvMensal fim={dados.periodo.fim} />
            </Bloco>
          </div>
        </>
      )}
    </div>
  );
}
