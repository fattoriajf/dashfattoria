// Painel: indicadores de vendas, CMV, insumos, compras e consumo interno num período.
import { supabase } from "./supabase";
import { carregarCusteio, Custeio, todas } from "./dadosFichas";
import * as dadosCmv from "./dadosCmv";
import { listarConsumo } from "./dadosConsumo";

const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const deIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const diasEntre = (a: string, b: string) => Math.round((deIso(b).getTime() - deIso(a).getTime()) / 86400000);
const somaDias = (s: string, n: number) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
const low = (s: any) => String(s ?? "").trim().toLowerCase();

/** Período de comparação: começando no dia 1, os mesmos dias do mês anterior; senão, o mesmo nº de dias logo antes */
export function periodoAnterior(inicio: string, fim: string) {
  const n = diasEntre(inicio, fim);
  const di = deIso(inicio);
  if (di.getDate() === 1) {
    const ini = new Date(di.getFullYear(), di.getMonth() - 1, 1);
    const ultimo = new Date(di.getFullYear(), di.getMonth(), 0).getDate();
    const f = new Date(ini.getFullYear(), ini.getMonth(), Math.min(1 + n, ultimo));
    return { inicio: iso(ini), fim: iso(f) };
  }
  return { inicio: somaDias(inicio, -(n + 1)), fim: somaDias(inicio, -1) };
}

export type ProdutoPainel = {
  chave: string; nome: string; grupo: string; qtd: number; receita: number;
  custo: number | null; cmvPct: number | null; margemUnit: number | null;
};

type Base = { c: Custeio; vinc: Awaited<ReturnType<typeof dadosCmv.carregarVinculos>>; porNome: Record<string, string> };

async function vendasPorDia(inicio: string, fim: string) {
  const r = await supabase.rpc("vendas_por_dia", { p_inicio: inicio, p_fim: fim });
  if (r.error) throw new Error(`vendas por dia: ${r.error.message}`);
  const m: Record<string, number> = {};
  (r.data || []).forEach((x: any) => { m[String(x.dia).slice(0, 10)] = Number(x.total) || 0; });
  return m;
}

async function resumoPeriodo(b: Base, inicio: string, fim: string) {
  const vendas = await dadosCmv.vendasResumo(inicio, fim);
  let faturamento = 0, custo = 0, itens = 0;
  const prods: Record<string, ProdutoPainel> = {};
  const grupos: Record<string, number> = {};
  const semFicha = new Set<string>();
  vendas.forEach((v: any) => {
    faturamento += v.vl_total;
    const g = v.grupo || "Sem grupo";
    grupos[g] = (grupos[g] || 0) + v.vl_total;
    const prod = dadosCmv.produtoDoNome(v.descricao, b.c, b.vinc, b.porNome);
    if (prod.ignorado) return;
    itens += v.qtd;
    const p = prod.id ? b.c.produtos[prod.id] : null;
    const chave = p ? p.id : "nome:" + v.descricao;
    const a = (prods[chave] = prods[chave] || { chave, nome: p ? p.nome : v.descricao, grupo: g, qtd: 0, receita: 0, custo: null, cmvPct: null, margemUnit: null });
    a.qtd += v.qtd;
    a.receita += v.vl_total;
    if (p && p.itens.length) {
      const cu = v.qtd * p.custoTotal;
      a.custo = (a.custo || 0) + cu;
      custo += cu;
    } else if (v.qtd > 0) {
      semFicha.add(a.nome);
    }
  });
  const produtos = Object.values(prods).map((p) => ({
    ...p,
    cmvPct: p.custo !== null && p.receita > 0 ? (p.custo / p.receita) * 100 : null,
    margemUnit: p.custo !== null && p.qtd > 0 ? (p.receita - p.custo) / p.qtd : null,
  }));
  return {
    faturamento, custo, itens, lucroBruto: faturamento - custo,
    cmvPct: faturamento > 0 ? (custo / faturamento) * 100 : 0,
    produtos, grupos, semFicha: Array.from(semFicha).sort((x, y) => x.localeCompare(y, "pt-BR")),
  };
}

/** Insumos que mais pesaram: abre as fichas dos produtos vendidos até o insumo e valoriza pelo custo atual */
function insumosQueMaisPesam(b: Base, produtos: ProdutoPainel[]) {
  const acc: dadosCmv.Acc = {};
  produtos.forEach((p) => { if (b.c.produtos[p.chave]) dadosCmv.abrirProduto(b.c, p.chave, p.qtd, acc); });
  return Object.entries(acc).map(([id, a]) => {
    const ins = b.c.insumos[id];
    return { nome: ins?.nome || id, unidade: ins?.unidade || "", qtd: a.qtd, valor: a.qtd * (Number(ins?.custo_por_unidade) || 0) };
  }).filter((x) => x.valor > 0).sort((x, y) => y.valor - x.valor);
}

/** Insumos cuja última compra no período saiu mais cara (ou mais barata) que a compra anterior */
async function variacaoPrecos(inicio: string, fim: string) {
  const compras = await todas(() => supabase.from("compras")
    .select("id, data, compra_itens(insumo_id, insumo_nome, quantidade, custo_unitario)")
    .gte("data", somaDias(fim, -365)).lte("data", fim).order("data", { ascending: false }).order("id"), "compras");
  const porInsumo: Record<string, { nome: string; data: string; custo: number }[]> = {};
  compras.forEach((c: any) => (c.compra_itens || []).forEach((it: any) => {
    const custo = Number(it.custo_unitario) || 0;
    if (!(custo > 0)) return;
    const k = it.insumo_id || "nome:" + low(it.insumo_nome);
    (porInsumo[k] = porInsumo[k] || []).push({ nome: it.insumo_nome, data: String(c.data).slice(0, 10), custo });
  }));
  const out: { nome: string; dataAtual: string; atual: number; dataAnterior: string; anterior: number; variacaoPct: number }[] = [];
  Object.values(porInsumo).forEach((lista) => {
    lista.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
    const ult = lista[0];
    if (ult.data < inicio) return;
    const ant = lista.find((x) => x.data < ult.data);
    if (!ant) return;
    out.push({ nome: ult.nome, dataAtual: ult.data, atual: ult.custo, dataAnterior: ant.data, anterior: ant.custo, variacaoPct: ((ult.custo - ant.custo) / ant.custo) * 100 });
  });
  return out.sort((a, b) => b.variacaoPct - a.variacaoPct);
}

async function consumoInterno(inicio: string, fim: string) {
  const { linhas } = await listarConsumo({ inicio, fim });
  const socios: Record<string, number> = {};
  let funcionarios = 0, total = 0;
  linhas.forEach((l) => {
    total += l.valor;
    if (l.tipo === "socio") socios[l.pessoa] = (socios[l.pessoa] || 0) + l.valor;
    else funcionarios += l.valor;
  });
  const porPessoa = Object.entries(socios).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  if (funcionarios > 0) porPessoa.push({ nome: "Funcionários", valor: funcionarios });
  return { total, porPessoa, lancamentos: linhas.length };
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export async function carregarPainel(inicio: string, fim: string) {
  const ant = periodoAnterior(inicio, fim);
  const [c, vinc] = await Promise.all([carregarCusteio(), dadosCmv.carregarVinculos()]);
  const b: Base = { c, vinc, porNome: dadosCmv.indicePorNome(c) };
  const [atual, anterior, diasAtual, diasAnt, precos, interno] = await Promise.all([
    resumoPeriodo(b, inicio, fim),
    resumoPeriodo(b, ant.inicio, ant.fim),
    vendasPorDia(inicio, fim),
    vendasPorDia(ant.inicio, ant.fim),
    variacaoPrecos(inicio, fim),
    consumoInterno(inicio, fim),
  ]);

  // faturamento dia a dia, com o período anterior alinhado pelo nº do dia
  const n = diasEntre(inicio, fim);
  const porDia = Array.from({ length: n + 1 }, (_, i) => {
    const d = somaDias(inicio, i), da = somaDias(ant.inicio, i);
    return { dia: d, rotulo: `${d.slice(8, 10)}/${d.slice(5, 7)}`, atual: diasAtual[d] ?? null, anterior: da <= ant.fim ? (diasAnt[da] ?? null) : null };
  });

  // média por dia da semana (só dias com venda)
  const sem = DIAS_SEMANA.map((nome) => ({ nome, total: 0, dias: 0 }));
  Object.entries(diasAtual).forEach(([d, v]) => { if (v > 0) { const w = deIso(d).getDay(); sem[w].total += v; sem[w].dias++; } });
  const diaSemana = sem.map((s) => ({ nome: s.nome, media: s.dias ? s.total / s.dias : 0, dias: s.dias }));

  const categorias = Object.entries(atual.grupos).map(([nome, valor]) => ({ nome, valor })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);

  return {
    periodo: { inicio, fim }, anterior: ant,
    kpis: {
      faturamento: atual.faturamento, faturamentoAnt: anterior.faturamento,
      itens: atual.itens, itensAnt: anterior.itens,
      cmvPct: atual.cmvPct, cmvPctAnt: anterior.cmvPct,
      lucroBruto: atual.lucroBruto, lucroBrutoAnt: anterior.lucroBruto,
      diasComVenda: Object.values(diasAtual).filter((v) => v > 0).length,
    },
    porDia, diaSemana, categorias,
    produtos: atual.produtos,
    semFicha: atual.semFicha,
    insumos: insumosQueMaisPesam(b, atual.produtos),
    precos, interno,
  };
}

export type Painel = Awaited<ReturnType<typeof carregarPainel>>;

/** CMV real (inventários) × teórico (fichas) dos últimos meses até o mês de "fim" */
export async function cmvPorMes(fim: string, meses = 6, soInventariados = true) {
  const lista: string[] = [];
  const f = deIso(fim);
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(f.getFullYear(), f.getMonth() - i, 1);
    lista.push(`${d.getFullYear()}-${p2(d.getMonth() + 1)}`);
  }
  const [c, vinc] = await Promise.all([carregarCusteio(), dadosCmv.carregarVinculos()]);
  const b: Base = { c, vinc, porNome: dadosCmv.indicePorNome(c) };
  const proximo = (m: string) => { const [y, mm] = m.split("-").map(Number); return mm === 12 ? `${y + 1}-01` : `${y}-${p2(mm + 1)}`; };
  const todosMeses = Array.from(new Set(lista.concat(lista.map(proximo))));
  const contagens = await Promise.all(todosMeses.map((m) =>
    supabase.from("inventario_cmv_itens").select("id", { count: "exact", head: true }).eq("mes", m)));
  const temInv: Record<string, boolean> = {};
  todosMeses.forEach((m, i) => { temInv[m] = (contagens[i].count || 0) > 0; });

  return Promise.all(lista.map(async (mes) => {
    const [y, mm] = mes.split("-").map(Number);
    const ini = `${mes}-01`, fimMes = `${mes}-${p2(new Date(y, mm, 0).getDate())}`;
    const r = await resumoPeriodo(b, ini, fimMes);
    let real: number | null = null;
    if (temInv[mes] && temInv[proximo(mes)]) {
      const m: any = await dadosCmv.cmvMensal({ mes, grupos: [], soInventariados });
      if (m?.ok) real = m.cmvVendasPct ?? m.cmvPct ?? null;
    }
    const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return { mes, rotulo: `${nomes[mm - 1]}/${String(y).slice(2)}`, teorico: r.faturamento > 0 ? r.cmvPct : null, real, faturamento: r.faturamento };
  }));
}
