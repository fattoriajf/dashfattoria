// Caixa, Markup, Dashboard e Gráficos no Supabase.
// api(acao, dados) responde no mesmo formato do Apps Script antigo ({ ok, ... }), assim as telas não mudam.
import { supabase } from "./supabase";
import { todas } from "./dadosFichas";

const num = (v: any) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isFinite(n) ? n : 0;
};
const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
/** "DD/MM/YYYY" ou "YYYY-MM-DD" -> "YYYY-MM-DD" */
function isoDe(s: any): string | null {
  const t = String(s || "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${p2(+m[2])}-${p2(+m[1])}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}
const dataBR = (iso: string) => String(iso || "").slice(0, 10).split("-").reverse().join("/");
function falha(e: any, onde: string): never {
  throw new Error(`${onde}: ${e?.message || e}`);
}

// ---------------------------------------------------------------------------
// Caixa
// ---------------------------------------------------------------------------
async function caixaCategorias() {
  const r = await supabase.from("caixa_categorias").select("nome").order("ordem").order("nome");
  if (r.error) falha(r.error, "categorias do caixa");
  return { ok: true, categorias: (r.data || []).map((c: any) => c.nome) };
}

async function caixaLista(d: any) {
  const ini = isoDe(d.start), fim = isoDe(d.end);
  const linhas = await todas(() => {
    let q = supabase.from("caixa_lancamentos").select("id, data, tipo, valor, categoria, observacao")
      .order("data", { ascending: false }).order("criado_em", { ascending: false }).order("id");
    if (ini) q = q.gte("data", ini);
    if (fim) q = q.lte("data", fim);
    return q;
  }, "caixa");
  let totalEntradas = 0, totalSaidas = 0;
  const rows = linhas.map((x: any) => {
    const valor = Number(x.valor) || 0;
    if (x.tipo === "entrada") totalEntradas += valor; else totalSaidas += valor;
    // "timestamp" é a chave que a tela usa para editar/excluir
    return { timestamp: x.id, data: dataBR(x.data), tipo: x.tipo, valor, categoria: x.categoria || "", observacao: x.observacao || "" };
  });
  return { ok: true, rows, totalEntradas, totalSaidas, saldo: totalEntradas - totalSaidas };
}

function dadosCaixa(d: any) {
  const data = isoDe(d.date);
  if (!data) throw new Error("Data inválida.");
  const tipo = d.tipo === "saida" ? "saida" : d.tipo === "entrada" ? "entrada" : null;
  if (!tipo) throw new Error("Informe se é entrada ou saída.");
  const valor = num(d.valor);
  if (!(valor > 0)) throw new Error("Valor inválido.");
  return { data, tipo, valor: Math.round(valor * 100) / 100, categoria: String(d.categoria || "").trim(), observacao: String(d.observacao || "").trim() };
}

async function salvarCaixa(d: any) {
  const r = await supabase.from("caixa_lancamentos").insert(dadosCaixa(d));
  if (r.error) falha(r.error, "salvar lançamento");
  return { ok: true };
}
async function atualizarCaixa(d: any) {
  if (!d.timestamp) throw new Error("Lançamento não informado.");
  const r = await supabase.from("caixa_lancamentos").update(dadosCaixa(d)).eq("id", d.timestamp);
  if (r.error) falha(r.error, "atualizar lançamento");
  return { ok: true };
}
async function excluirCaixa(d: any) {
  const r = await supabase.from("caixa_lancamentos").delete().eq("id", d.timestamp);
  if (r.error) falha(r.error, "excluir lançamento");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------
async function markupConfig() {
  const [c, dp] = await Promise.all([
    supabase.from("markup_config").select("faturamento_minimo, impostos_pct, cartao_pct, margem_lucro_pct").eq("id", 1),
    supabase.from("markup_despesas").select("id, tipo, descricao, valor").order("criado_em"),
  ]);
  if (c.error) falha(c.error, "configuração do markup");
  if (dp.error) falha(dp.error, "despesas");
  const cfg: any = c.data?.[0] || {};
  return {
    ok: true,
    faturamento_minimo: Number(cfg.faturamento_minimo) || 0,
    impostos_pct: Number(cfg.impostos_pct) || 0,
    cartao_pct: Number(cfg.cartao_pct) || 0,
    margem_lucro_pct: Number(cfg.margem_lucro_pct) || 0,
    despesas: (dp.data || []).map((x: any) => ({ id: x.id, tipo: x.tipo, descricao: x.descricao, valor: Number(x.valor) || 0 })),
  };
}
async function salvarMarkupConfig(d: any) {
  const r = await supabase.from("markup_config").upsert({
    id: 1,
    faturamento_minimo: num(d.faturamento_minimo), impostos_pct: num(d.impostos_pct),
    cartao_pct: num(d.cartao_pct), margem_lucro_pct: num(d.margem_lucro_pct),
    atualizado_em: new Date().toISOString(),
  });
  if (r.error) falha(r.error, "salvar configuração");
  return { ok: true };
}
async function salvarDespesa(d: any) {
  const tipo = String(d.tipo || "").trim(), descricao = String(d.descricao || "").trim();
  if (!tipo || !descricao) throw new Error("Informe o tipo e a descrição.");
  const r = await supabase.from("markup_despesas").insert({ tipo, descricao, valor: num(d.valor) }).select("id").single();
  if (r.error) falha(r.error, "salvar despesa");
  return { ok: true, id: r.data.id };
}
async function atualizarDespesa(d: any) {
  const r = await supabase.from("markup_despesas").update({ descricao: String(d.descricao || "").trim(), valor: num(d.valor) }).eq("id", d.id);
  if (r.error) falha(r.error, "atualizar despesa");
  return { ok: true };
}
async function excluirDespesa(d: any) {
  const r = await supabase.from("markup_despesas").delete().eq("id", d.id);
  if (r.error) falha(r.error, "excluir despesa");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dashboard (vendas do Colibri)
// ---------------------------------------------------------------------------
const DIAS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, "terça": 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, "sábado": 6 };
function diaSemana(v: any): number | null {
  const s = String(v || "").trim().toLowerCase().replace(/-feira$/, "");
  if (!s || s === "tudo") return null;
  if (/^\d$/.test(s)) return Number(s);
  return s in DIAS ? DIAS[s] : null;
}

async function dashboardMeta() {
  const r = await supabase.rpc("vendas_meta");
  if (r.error) falha(r.error, "vendas");
  const m: any = r.data || {};
  const grupos = new Set<string>(), itens = new Set<string>();
  const porGrupo: Record<string, Set<string>> = {};
  (m.itens || []).forEach((x: any) => {
    const g = String(x.grupo || "").trim(), it = String(x.descricao || "").trim();
    if (g) grupos.add(g);
    if (it) itens.add(it);
    if (g && it) (porGrupo[g] ||= new Set()).add(it);
  });
  const itemsByGroup: Record<string, string[]> = {};
  Object.keys(porGrupo).forEach((g) => { itemsByGroup[g] = Array.from(porGrupo[g]).sort(); });
  return {
    ok: true,
    minDate: m.minDate || "", maxDate: m.maxDate || "",
    groups: Array.from(grupos).sort(), items: Array.from(itens).sort(), itemsByGroup,
  };
}

export const LIMITE_LINHAS_DASHBOARD = 3000;

async function dashboardRows(d: any) {
  const ini = isoDe(d.start), fim = isoDe(d.end);
  if (!ini || !fim) throw new Error("Período inválido.");
  const args = {
    p_inicio: ini, p_fim: fim,
    p_grupo: d.grupo && d.grupo !== "Tudo" ? d.grupo : null,
    p_descricao: d.descricao && d.descricao !== "Tudo" ? d.descricao : null,
    p_dia_semana: diaSemana(d.weekday),
  };
  const tot = await supabase.rpc("vendas_dashboard_totais", args);
  if (tot.error) falha(tot.error, "totais");
  const t: any = (tot.data || [])[0] || {};
  // a tabela mostra as linhas mais recentes (o período inteiro pode ter dezenas de milhares)
  const rows: any[] = [];
  for (let de = 0; de < LIMITE_LINHAS_DASHBOARD; de += 1000) {
    const r = await supabase.rpc("vendas_dashboard_linhas", args).range(de, Math.min(de + 999, LIMITE_LINHAS_DASHBOARD - 1));
    if (r.error) falha(r.error, "linhas");
    rows.push(...(r.data || []).map((x: any) => ({
      dt_contabil: x.dt_contabil, grupo: x.grupo, descricao: x.descricao, qtd: Number(x.qtd) || 0,
      vl_servico_informado: Number(x.vl_servico_informado) || 0, vl_servico_calculado: Number(x.vl_servico_calculado) || 0, vl_total: Number(x.vl_total) || 0,
    })));
    if ((r.data || []).length < 1000) break;
  }
  return {
    ok: true, rows,
    linhasTotal: Number(t.linhas) || 0,
    totalVlTotal: Number(t.total) || 0, totalInformado: Number(t.informado) || 0,
    totalCalculado: Number(t.calculado) || 0, totalQtd: Number(t.qtd) || 0,
  };
}

// ---------------------------------------------------------------------------
// Gráficos: últimos 12 meses e últimas ~4 meses por semana (segunda a domingo)
// ---------------------------------------------------------------------------
const NOMES_DIA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
function segundaDa(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = x.getDay(); // 0 = domingo
  x.setDate(x.getDate() + (wd === 0 ? -6 : 1 - wd));
  return x;
}

async function dashboardGraphs() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const iniMes = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
  const iniSem = new Date(hoje);
  iniSem.setMonth(iniSem.getMonth() - 4);
  const inicio = iniMes < iniSem ? iniMes : iniSem;
  const r = await supabase.rpc("vendas_por_dia", { p_inicio: ymd(inicio), p_fim: ymd(hoje) });
  if (r.error) falha(r.error, "vendas por dia");

  const porMes: Record<string, number> = {}, porSemana: Record<string, number> = {};
  const porSemanaDia: Record<string, Record<string, number>> = {};
  (r.data || []).forEach((x: any) => {
    const [y, m, dd] = String(x.dia).split("-").map(Number);
    const d = new Date(y, m - 1, dd);
    const total = Number(x.total) || 0;
    if (d >= iniMes) porMes[`${y}-${p2(m)}`] = (porMes[`${y}-${p2(m)}`] || 0) + total;
    if (d >= iniSem) {
      const wk = ymd(segundaDa(d));
      porSemana[wk] = (porSemana[wk] || 0) + total;
      const s = (porSemanaDia[wk] ||= {});
      s[NOMES_DIA[d.getDay()]] = (s[NOMES_DIA[d.getDay()]] || 0) + total;
    }
  });
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const md = new Date(iniMes.getFullYear(), iniMes.getMonth() + i, 1);
    const k = `${md.getFullYear()}-${p2(md.getMonth() + 1)}`;
    return { label: k, faturamento: porMes[k] || 0 };
  });
  const weekly: any[] = [], weeklyByWeekday: any[] = [];
  const fimSem = segundaDa(hoje);
  for (const w = segundaDa(iniSem); w <= fimSem; w.setDate(w.getDate() + 7)) {
    const k = ymd(w);
    weekly.push({ label: k, faturamento: porSemana[k] || 0 });
    const by = porSemanaDia[k] || {};
    weeklyByWeekday.push({ label: k, domingo: by.domingo || 0, segunda: by.segunda || 0, terca: by.terca || 0, quarta: by.quarta || 0, quinta: by.quinta || 0, sexta: by.sexta || 0, sabado: by.sabado || 0 });
  }
  return { ok: true, monthly, weekly, weeklyByWeekday };
}

// ---------------------------------------------------------------------------
const ACOES: Record<string, (d: any) => Promise<any>> = {
  caixa_categorias: caixaCategorias,
  caixa_lista: caixaLista,
  save_caixa: salvarCaixa,
  update_caixa: atualizarCaixa,
  delete_caixa: excluirCaixa,
  markup_config: markupConfig,
  save_markup_config: salvarMarkupConfig,
  save_despesa: salvarDespesa,
  update_despesa: atualizarDespesa,
  delete_despesa: excluirDespesa,
  dashboard_base_meta: dashboardMeta,
  dashboard_base_rows: dashboardRows,
  dashboard_graphs: dashboardGraphs,
};

export async function api(acao: string, dados: Record<string, any> = {}): Promise<any> {
  const f = ACOES[acao];
  if (!f) return { ok: false, error: `Ação desconhecida: ${acao}` };
  try {
    return await f(dados);
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
