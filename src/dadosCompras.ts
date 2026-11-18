// Registro de compras no Supabase (compra com vários itens, frete e ICMS rateados).
// Respostas no mesmo formato do Apps Script antigo, assim a tela não muda.
import { supabase } from "./supabase";

const k = (s: any) => String(s ?? "").trim().toLowerCase();
const num = (v: any) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const dataBR = (iso: string) => String(iso || "").slice(0, 10).split("-").reverse().join("/");
/** "DD/MM/YYYY" -> "YYYY-MM-DD" */
function isoDe(s: string): string | null {
  const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim()) ? String(s).trim() : null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
const fmtR = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");

type Item = { insumo: string; quantidade: number; custoTotal: number };

/** Divide um valor entre os itens (pelo peso, se todos em kg; senão pelo valor). Centavos fecham no último item. */
export function ratear(itens: Item[], valor: number, rateio: "peso" | "valor", unidadeDe: (nome: string) => string) {
  const n = itens.length;
  const partes = new Array(n).fill(0);
  if (!(valor > 0) || !n) return { partes, rateio };
  const usaPeso = rateio === "peso" && itens.every((it) => k(unidadeDe(it.insumo)) === "kg" && it.quantidade > 0);
  let base = itens.map((it) => (usaPeso ? it.quantidade : it.custoTotal));
  let soma = base.reduce((a, b) => a + b, 0);
  if (!(soma > 0)) { base = itens.map(() => 1); soma = n; }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) partes[i] = r2(valor - acc);
    else { partes[i] = r2((valor * base[i]) / soma); acc += partes[i]; }
  }
  return { partes, rateio: (usaPeso ? "peso" : "valor") as "peso" | "valor" };
}

/** Lista os itens comprados no período (start/end em DD/MM/YYYY) */
export async function listarCompras(p: { start?: string; end?: string }) {
  try {
    let q = supabase.from("compras")
      .select("id, data, observacao, rateio, criado_em, compra_itens(id, insumo_nome, quantidade, valor_pago, frete, icms, custo_total, custo_unitario)")
      .order("data", { ascending: false }).order("criado_em", { ascending: false });
    const ini = p.start ? isoDe(p.start) : null;
    const fim = p.end ? isoDe(p.end) : null;
    if (ini) q = q.gte("data", ini);
    if (fim) q = q.lte("data", fim);
    const r = await q;
    if (r.error) throw r.error;
    const rows: any[] = [];
    let totalCompras = 0;
    (r.data || []).forEach((c: any) => {
      (c.compra_itens || []).forEach((it: any) => {
        const frete = Number(it.frete) || 0, icms = Number(it.icms) || 0;
        const extras: string[] = [];
        if (frete > 0) extras.push(`${fmtR(frete)} de frete (${c.rateio})`);
        if (icms > 0) extras.push(`${fmtR(icms)} de ICMS`);
        let obs = String(c.observacao || "").trim();
        if (extras.length && !/inclui /.test(obs)) obs = (obs ? obs + " · " : "") + "inclui " + extras.join(" e ");
        const custoTotal = Number(it.custo_total) || 0;
        totalCompras += custoTotal;
        rows.push({
          timestamp: it.id, // a tela usa como chave para excluir
          data: dataBR(c.data),
          insumo: it.insumo_nome,
          quantidade: Number(it.quantidade) || 0,
          custoUnitario: Number(it.custo_unitario) || 0,
          custoTotal,
          observacao: obs,
        });
      });
    });
    return { ok: true, rows, totalCompras };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e), rows: [] };
  }
}

/** Salva uma compra com vários itens; opcionalmente atualiza o custo no cadastro de insumos */
export async function salvarCompraLote(d: any) {
  try {
    const data = isoDe(d.date);
    if (!data) return { ok: false, error: "Data inválida." };
    const frete = Math.max(num(d.frete), 0);
    const icms = Math.max(num(d.icms), 0);
    const rateioPedido: "peso" | "valor" = d.rateio === "valor" ? "valor" : "peso";
    const itens: Item[] = (Array.isArray(d.itens) ? d.itens : [])
      .map((it: any) => ({ insumo: String(it?.insumo || "").trim(), quantidade: num(it?.quantidade), custoTotal: num(it?.custoTotal) }))
      .filter((it: Item) => it.insumo);
    if (!itens.length) return { ok: false, error: "Adicione pelo menos um item." };
    for (const it of itens) {
      if (!(it.quantidade > 0)) return { ok: false, error: `Informe a quantidade de "${it.insumo}".` };
      if (!(it.custoTotal > 0)) return { ok: false, error: `Informe o valor pago de "${it.insumo}".` };
    }

    const ins = await supabase.from("insumos").select("id, nome, unidade, custo_por_unidade, ativo");
    if (ins.error) throw ins.error;
    const porNome: Record<string, any> = {};
    (ins.data || []).forEach((i: any) => { if (!porNome[k(i.nome)] || i.ativo !== false) porNome[k(i.nome)] = i; });
    const unidadeDe = (nome: string) => porNome[k(nome)]?.unidade || "";

    const rf = ratear(itens, frete, rateioPedido, unidadeDe);
    const ri = ratear(itens, icms, "valor", unidadeDe); // ICMS é % sobre o preço: sempre pelo valor

    const c = await supabase.from("compras")
      .insert({ data, observacao: String(d.observacao || "").trim(), frete, icms, rateio: rf.rateio })
      .select("id").single();
    if (c.error) throw c.error;

    const gravados = itens.map((it, i) => {
      const total = r2(it.custoTotal + rf.partes[i] + ri.partes[i]);
      return {
        compra_id: c.data.id,
        insumo_id: porNome[k(it.insumo)]?.id || null,
        insumo_nome: porNome[k(it.insumo)]?.nome || it.insumo,
        quantidade: it.quantidade,
        valor_pago: r2(it.custoTotal),
        frete: rf.partes[i],
        icms: ri.partes[i],
        custo_total: total,
        custo_unitario: Math.round((total / it.quantidade) * 10000) / 10000,
      };
    });
    const ci = await supabase.from("compra_itens").insert(gravados);
    if (ci.error) {
      await supabase.from("compras").delete().eq("id", c.data.id); // não deixa compra sem itens
      throw ci.error;
    }

    // atualiza o custo no cadastro (fichas e preparos passam a usar o preço atual)
    const atualizar = new Set((Array.isArray(d.atualizarCadastro) ? d.atualizarCadastro : []).map(k));
    const atualizados: { insumo: string; de: number; para: number }[] = [];
    for (const g of gravados) {
      const cad = porNome[k(g.insumo_nome)];
      if (!cad || !atualizar.has(k(g.insumo_nome))) continue;
      const u = await supabase.from("insumos").update({ custo_por_unidade: g.custo_unitario }).eq("id", cad.id);
      if (u.error) throw u.error;
      atualizados.push({ insumo: cad.nome, de: Number(cad.custo_por_unidade) || 0, para: g.custo_unitario });
    }
    return {
      ok: true,
      rateio: rf.rateio,
      itens: gravados.map((g) => ({ insumo: g.insumo_nome, quantidade: g.quantidade, frete: g.frete, icms: g.icms, custoTotal: g.custo_total, custoUnitario: g.custo_unitario })),
      atualizados,
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Exclui um item da compra (e a compra, se era o último item). Não mexe no custo do cadastro. */
export async function excluirItemCompra(id: string) {
  try {
    const it = await supabase.from("compra_itens").select("compra_id").eq("id", id);
    if (it.error) throw it.error;
    if (!it.data?.length) return { ok: true };
    const compraId = it.data[0].compra_id;
    const d = await supabase.from("compra_itens").delete().eq("id", id);
    if (d.error) throw d.error;
    const resto = await supabase.from("compra_itens").select("id", { count: "exact", head: true }).eq("compra_id", compraId);
    if (!resto.error && !resto.count) await supabase.from("compras").delete().eq("id", compraId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
