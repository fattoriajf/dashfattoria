// Insumos, fichas técnicas e preparos no Supabase.
// api(acao, dados) responde no mesmo formato do Apps Script antigo ({ ok, ... }), assim as telas não mudam.
import { supabase } from "./supabase";

type Tipo = "insumo" | "material" | "uso_geral";
const k = (s: any) => String(s ?? "").trim().toLowerCase();
const num = (v: any) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace("%", "").replace(",", "."));
  return isFinite(n) ? n : 0;
};
const desp = (v: any) => Math.min(Math.max(num(v), 0), 95);
const fator = (pct: number) => 1 / (1 - (pct || 0) / 100);
const tipoItem = (v: any): "insumo" | "preparo" => (k(v) === "preparo" ? "preparo" : "insumo");
const tipoInsumo = (v: any): Tipo => (v === "material" || v === "uso_geral" ? v : "insumo");

function falha(e: any, onde: string): never {
  throw new Error(`${onde}: ${e?.message || e}`);
}

/** Busca todas as linhas de uma consulta, de 1000 em 1000 (o Supabase devolve no máximo 1000 por vez) */
export async function todas(consulta: () => any, onde: string): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const r = await consulta().range(de, de + 999);
    if (r.error) falha(r.error, onde);
    out.push(...(r.data || []));
    if ((r.data || []).length < 1000) return out;
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
export type InsumoDb = { id: string; nome: string; unidade: string; custo_por_unidade: number; tipo: Tipo };
type PreparoDb = { id: string; nome: string; rendimento: number; unidade: string };
export type ItemDb = { id: string; insumo_id: string | null; ref_preparo: string | null; quantidade: number; desperdicio: number; ordem: number };

async function lerInsumos(): Promise<InsumoDb[]> {
  const r = await todas(() => supabase.from("insumos").select("id, nome, unidade, custo_por_unidade, tipo").eq("ativo", true).order("nome").order("id"), "insumos");
  return r.map((x: any) => ({ ...x, custo_por_unidade: Number(x.custo_por_unidade) || 0 }));
}

async function lerPreparos() {
  const [p, it] = await Promise.all([
    supabase.from("preparos").select("id, nome, rendimento, unidade").eq("ativo", true),
    todas(() => supabase.from("preparo_itens").select("id, preparo_id, insumo_id, sub_preparo_id, quantidade, desperdicio, ordem").order("ordem").order("id"), "itens dos preparos"),
  ]);
  if (p.error) falha(p.error, "preparos");
  const preparos: PreparoDb[] = (p.data || []).map((x: any) => ({ ...x, rendimento: Number(x.rendimento) || 0 }));
  const itens: Record<string, ItemDb[]> = {};
  it.forEach((x: any) => {
    (itens[x.preparo_id] ||= []).push({ id: x.id, insumo_id: x.insumo_id, ref_preparo: x.sub_preparo_id, quantidade: Number(x.quantidade) || 0, desperdicio: Number(x.desperdicio) || 0, ordem: x.ordem });
  });
  return { preparos, itens };
}

/** Custo dos preparos (preparo dentro de preparo, com proteção contra receita circular) — igual ao _calcPreparos_ antigo */
function calcularPreparos(insumos: InsumoDb[], preparos: PreparoDb[], itens: Record<string, ItemDb[]>) {
  const insPorId: Record<string, InsumoDb> = {};
  insumos.forEach((i) => { insPorId[i.id] = i; });
  const prepPorId: Record<string, PreparoDb> = {};
  preparos.forEach((p) => { prepPorId[p.id] = p; });
  const calc: Record<string, any> = {};
  const visitando: Record<string, boolean> = {};

  const calcular = (id: string): any => {
    if (calc[id]) return calc[id];
    const rec = prepPorId[id];
    if (!rec) return null;
    if (visitando[id]) return { nome: rec.nome, unidade: rec.unidade, custoPorUnidade: 0, erro: "receita circular" };
    visitando[id] = true;
    let custoTotal = 0;
    let erro = "";
    const ingredientes = (itens[id] || []).map((it) => {
      let custoUn = 0, unidade = "", nome = "?", faltando = false, categoria = "insumo";
      if (it.ref_preparo) {
        const sub = calcular(it.ref_preparo);
        if (sub) { custoUn = sub.custoPorUnidade; unidade = sub.unidade; nome = sub.nome; if (sub.erro) erro = sub.erro; } else faltando = true;
        categoria = "preparo";
      } else {
        const ins = insPorId[it.insumo_id || ""];
        if (ins) { custoUn = ins.custo_por_unidade; unidade = ins.unidade; nome = ins.nome; categoria = ins.tipo || "insumo"; } else faltando = true;
      }
      const semDesp = it.quantidade * custoUn;
      const total = semDesp * fator(it.desperdicio);
      custoTotal += total;
      return { ingrediente: nome, tipo: it.ref_preparo ? "preparo" : "insumo", categoria, quantidade: it.quantidade, unidade, custoPorUnidade: custoUn, desperdicio: it.desperdicio, custoSemDesperdicio: semDesp, custoTotal: total, naoEncontrado: faltando };
    });
    delete visitando[id];
    const res = {
      id, nome: rec.nome, rendimento: rec.rendimento, unidade: rec.unidade, custoTotal,
      custoPorUnidade: rec.rendimento > 0 ? custoTotal / rec.rendimento : 0,
      ingredientes,
      erro: erro || (rec.rendimento > 0 ? "" : "sem rendimento"),
    };
    calc[id] = res;
    return res;
  };
  preparos.forEach((p) => calcular(p.id));
  return {
    porId: calc,
    lista: preparos.map((p) => calc[p.id]).sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

export type Custeio = {
  insumos: Record<string, InsumoDb & { ativo: boolean }>;
  preparos: Record<string, { id: string; nome: string; unidade: string; rendimento: number; custoPorUnidade: number; itens: ItemDb[] }>;
  produtos: Record<string, {
    id: string; nome: string; precoVenda: number; custoTotal: number;
    itens: { insumo_id: string | null; preparo_id: string | null; quantidade: number; desperdicio: number }[];
  }>;
};

/** Tudo o que o CMV precisa para custear: insumos (inclusive desativados), preparos e fichas por produto (pelo id) */
export async function carregarCusteio(): Promise<Custeio> {
  const [ir, pr, prods, fi] = await Promise.all([
    todas(() => supabase.from("insumos").select("id, nome, unidade, custo_por_unidade, tipo, ativo").order("id"), "insumos"),
    lerPreparos(),
    supabase.from("produtos").select("id, nome, preco_venda"),
    todas(() => supabase.from("ficha_itens").select("produto_id, insumo_id, preparo_id, quantidade, desperdicio").order("ordem").order("id"), "fichas"),
  ]);
  if (prods.error) falha(prods.error, "produtos");
  const lista = ir.map((x: any) => ({ ...x, custo_por_unidade: Number(x.custo_por_unidade) || 0 }));
  const insumos: Custeio["insumos"] = {};
  lista.forEach((i: any) => { insumos[i.id] = i; });
  const calc = calcularPreparos(lista, pr.preparos, pr.itens).porId;
  const preparos: Custeio["preparos"] = {};
  pr.preparos.forEach((p) => {
    preparos[p.id] = { id: p.id, nome: p.nome, unidade: p.unidade, rendimento: p.rendimento, custoPorUnidade: calc[p.id]?.custoPorUnidade || 0, itens: pr.itens[p.id] || [] };
  });
  const produtos: Custeio["produtos"] = {};
  (prods.data || []).forEach((p: any) => {
    produtos[p.id] = { id: p.id, nome: p.nome, precoVenda: Number(p.preco_venda) || 0, custoTotal: 0, itens: [] };
  });
  fi.forEach((x: any) => {
    const p = produtos[x.produto_id];
    if (!p) return;
    const it = { insumo_id: x.insumo_id, preparo_id: x.preparo_id, quantidade: Number(x.quantidade) || 0, desperdicio: Number(x.desperdicio) || 0 };
    p.itens.push(it);
    const custoUn = it.preparo_id ? preparos[it.preparo_id]?.custoPorUnidade || 0 : insumos[it.insumo_id || ""]?.custo_por_unidade || 0;
    p.custoTotal += it.quantidade * custoUn * fator(it.desperdicio);
  });
  return { insumos, preparos, produtos };
}

async function listaInsumos() {
  const ins = await lerInsumos();
  return { ok: true, insumos: ins.map((i) => ({ insumo: i.nome, unidade: i.unidade, custoPorUnidade: i.custo_por_unidade, tipo: i.tipo })) };
}

async function listaPreparos() {
  const [ins, pr] = await Promise.all([lerInsumos(), lerPreparos()]);
  return { ok: true, preparos: calcularPreparos(ins, pr.preparos, pr.itens).lista };
}

async function listaFichas() {
  const [ins, pr, prods, fi] = await Promise.all([
    lerInsumos(),
    lerPreparos(),
    supabase.from("produtos").select("id, nome, preco_venda, categorias_produto(nome)").eq("ativo", true),
    todas(() => supabase.from("ficha_itens").select("produto_id, insumo_id, preparo_id, quantidade, desperdicio, ordem").order("ordem").order("id"), "fichas"),
  ]);
  if (prods.error) falha(prods.error, "produtos");
  const insPorId: Record<string, InsumoDb> = {};
  ins.forEach((i) => { insPorId[i.id] = i; });
  // insumos desativados ainda aparecem na ficha que os usa
  const faltam = Array.from(new Set(fi.map((x: any) => x.insumo_id).filter((id: any) => id && !insPorId[id])));
  if (faltam.length) {
    const r = await supabase.from("insumos").select("id, nome, unidade, custo_por_unidade, tipo").in("id", faltam);
    (r.data || []).forEach((x: any) => { insPorId[x.id] = { ...x, custo_por_unidade: Number(x.custo_por_unidade) || 0 }; });
  }
  const preps = calcularPreparos(ins, pr.preparos, pr.itens).porId;

  const itensPorProduto: Record<string, any[]> = {};
  fi.forEach((x: any) => {
    const qtd = Number(x.quantidade) || 0;
    const d = Number(x.desperdicio) || 0;
    let nome = "?", unidade = "", custoUn = 0, categoria = "insumo";
    if (x.preparo_id) {
      const p = preps[x.preparo_id];
      if (p) { nome = p.nome; unidade = p.unidade; custoUn = p.custoPorUnidade; }
      categoria = "preparo";
    } else {
      const i = insPorId[x.insumo_id];
      if (i) { nome = i.nome; unidade = i.unidade; custoUn = i.custo_por_unidade; categoria = i.tipo || "insumo"; }
    }
    const semDesp = qtd * custoUn;
    (itensPorProduto[x.produto_id] ||= []).push({
      ingrediente: nome, tipo: x.preparo_id ? "preparo" : "insumo", categoria, quantidade: qtd, unidade,
      custoPorUnidade: custoUn, desperdicio: d, custoSemDesperdicio: semDesp, custoTotal: semDesp * fator(d),
    });
  });

  // só aparecem na Ficha Técnica os produtos que têm ficha (bebidas do cadastro sem ficha ficam de fora, como antes)
  const produtos = (prods.data || [])
    .filter((p: any) => itensPorProduto[p.id]?.length)
    .map((p: any) => {
      const ingredientes = itensPorProduto[p.id];
      const precoVenda = Number(p.preco_venda) || 0;
      const custoTotal = ingredientes.reduce((a: number, it: any) => a + it.custoTotal, 0);
      const custoMateriais = ingredientes.reduce((a: number, it: any) => a + (it.categoria === "material" ? it.custoTotal : 0), 0);
      const margem = precoVenda - custoTotal;
      return {
        nome: p.nome as string,
        categoria: (p.categorias_produto?.nome as string) || "",
        precoVenda, custoTotal, custoMateriais, custoIngredientes: custoTotal - custoMateriais, margem,
        margemPct: precoVenda > 0 ? (margem / precoVenda) * 100 : 0,
        cmvPct: precoVenda > 0 ? (custoTotal / precoVenda) * 100 : 0,
        ingredientes,
      };
    })
    .sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { ok: true, produtos };
}

// ---------------------------------------------------------------------------
// Buscas por nome (o nome é a chave nas telas)
// ---------------------------------------------------------------------------
async function acharInsumo(nome: string, incluirInativos = false) {
  let q = supabase.from("insumos").select("id, nome, ativo").ilike("nome", nome.trim().replace(/[\\%_]/g, "\\$&"));
  if (!incluirInativos) q = q.eq("ativo", true);
  const r = await q;
  if (r.error) falha(r.error, "buscar insumo");
  return (r.data || []).find((x: any) => k(x.nome) === k(nome)) || null;
}
async function acharPreparo(nome: string) {
  const r = await supabase.from("preparos").select("id, nome, rendimento, unidade").ilike("nome", nome.trim().replace(/[\\%_]/g, "\\$&"));
  if (r.error) falha(r.error, "buscar preparo");
  return (r.data || []).find((x: any) => k(x.nome) === k(nome)) || null;
}
async function acharProduto(nome: string) {
  const r = await supabase.from("produtos").select("id, nome, preco_venda, categoria_id").ilike("nome", nome.trim().replace(/[\\%_]/g, "\\$&"));
  if (r.error) falha(r.error, "buscar produto");
  return (r.data || []).find((x: any) => k(x.nome) === k(nome)) || null;
}
async function idCategoria(nome: string): Promise<string | null> {
  const n = nome.trim();
  if (!n) return null;
  const r = await supabase.from("categorias_produto").select("id, nome");
  if (r.error) falha(r.error, "categorias");
  const achou = (r.data || []).find((c: any) => k(c.nome) === k(n));
  if (achou) return achou.id;
  const novo = await supabase.from("categorias_produto").insert({ nome: n, ordem: (r.data || []).length }).select("id").single();
  if (novo.error) falha(novo.error, "criar categoria");
  return novo.data.id;
}
/** ingrediente da ficha/preparo pelo nome: { insumo_id } ou { preparo_id } */
async function idIngrediente(nome: string, tipo: "insumo" | "preparo") {
  if (tipo === "preparo") {
    const p = await acharPreparo(nome);
    if (!p) throw new Error(`Preparo "${nome}" não encontrado.`);
    return { insumo_id: null as string | null, preparo_id: p.id as string | null };
  }
  const i = await acharInsumo(nome, true);
  if (!i) throw new Error(`Insumo "${nome}" não encontrado no cadastro.`);
  return { insumo_id: i.id as string | null, preparo_id: null as string | null };
}

// ---------------------------------------------------------------------------
// Insumos
// ---------------------------------------------------------------------------
async function salvarInsumo(d: any) {
  const nome = String(d.insumo || "").trim();
  if (!nome) return { ok: false, error: "Informe o nome do insumo." };
  const dados: any = { unidade: String(d.unidade || "").trim() || "kg", custo_por_unidade: num(d.custoPorUnidade), ativo: true };
  if (d.tipo) dados.tipo = tipoInsumo(d.tipo);
  const existe = await acharInsumo(nome, true);
  // editando com nome novo: renomeia o mesmo insumo (fichas, etiquetas e compras continuam ligadas a ele)
  const antigo = d.nomeAntigo && k(d.nomeAntigo) !== k(nome) ? await acharInsumo(String(d.nomeAntigo), true) : null;
  if (antigo && existe) return { ok: false, error: `Já existe um insumo chamado "${existe.nome}".` };
  if (antigo) {
    const r = await supabase.from("insumos").update({ ...dados, nome }).eq("id", antigo.id);
    if (r.error) falha(r.error, "renomear insumo");
    return { ok: true };
  }
  const r = existe
    ? await supabase.from("insumos").update({ ...dados, nome }).eq("id", existe.id)
    : await supabase.from("insumos").insert({ ...dados, nome, tipo: dados.tipo || "insumo" });
  if (r.error) falha(r.error, "salvar insumo");
  return { ok: true };
}

async function excluirInsumo(d: any) {
  const i = await acharInsumo(String(d.insumo || ""));
  if (!i) return { ok: true };
  const [f, p] = await Promise.all([
    supabase.from("ficha_itens").select("produtos(nome)").eq("insumo_id", i.id),
    supabase.from("preparo_itens").select("preparos!preparo_itens_preparo_id_fkey(nome)").eq("insumo_id", i.id),
  ]);
  const usos = [
    ...(f.data || []).map((x: any) => x.produtos?.nome),
    ...(p.data || []).map((x: any) => (x.preparos?.nome ? `${x.preparos.nome} (preparo)` : null)),
  ].filter(Boolean);
  if (usos.length) return { ok: false, error: `"${i.nome}" está sendo usado em: ${Array.from(new Set(usos)).join(", ")}. Remova de lá antes de excluir.` };
  // desativa em vez de apagar: o histórico de etiquetas, compras e inventário continua apontando para ele
  const r = await supabase.from("insumos").update({ ativo: false }).eq("id", i.id);
  if (r.error) falha(r.error, "excluir insumo");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fichas técnicas
// ---------------------------------------------------------------------------
async function salvarFichaItem(d: any) {
  const nomeProd = String(d.produto || "").trim();
  const nomeIng = String(d.insumo || "").trim();
  if (!nomeProd || !nomeIng) return { ok: false, error: "Informe o produto e o ingrediente." };
  const tipo = tipoItem(d.tipoItem);
  const ing = await idIngrediente(nomeIng, tipo);
  const preco = num(d.precoVenda);

  let prod = await acharProduto(nomeProd);
  if (!prod) {
    const categoria_id = d.categoria !== undefined && d.categoria !== null ? await idCategoria(String(d.categoria)) : null;
    const novo = await supabase.from("produtos").insert({ nome: nomeProd, preco_venda: preco, categoria_id, ativo: true }).select("id, nome, preco_venda, categoria_id").single();
    if (novo.error) falha(novo.error, "criar produto");
    prod = novo.data;
  } else {
    const upd: any = { ativo: true };
    if (preco > 0) upd.preco_venda = preco;
    if (d.categoria !== undefined && d.categoria !== null) upd.categoria_id = await idCategoria(String(d.categoria));
    const u = await supabase.from("produtos").update(upd).eq("id", prod.id);
    if (u.error) falha(u.error, "atualizar produto");
  }

  let q = supabase.from("ficha_itens").select("id").eq("produto_id", prod.id);
  q = ing.preparo_id ? q.eq("preparo_id", ing.preparo_id) : q.eq("insumo_id", ing.insumo_id);
  const ex = await q;
  if (ex.error) falha(ex.error, "ficha");
  const temDesp = d.desperdicio !== undefined && d.desperdicio !== null;
  if (ex.data?.length) {
    const upd: any = { quantidade: num(d.quantidade) };
    if (temDesp) upd.desperdicio = desp(d.desperdicio);
    const r = await supabase.from("ficha_itens").update(upd).eq("id", ex.data[0].id);
    if (r.error) falha(r.error, "salvar item da ficha");
  } else {
    const ordem = await supabase.from("ficha_itens").select("id", { count: "exact", head: true }).eq("produto_id", prod.id);
    const r = await supabase.from("ficha_itens").insert({
      produto_id: prod.id, ...ing, quantidade: num(d.quantidade), desperdicio: temDesp ? desp(d.desperdicio) : 0, ordem: ordem.count || 0,
    });
    if (r.error) falha(r.error, "salvar item da ficha");
  }
  return { ok: true };
}

async function excluirFichaItem(d: any) {
  const prod = await acharProduto(String(d.produto || ""));
  if (!prod) return { ok: true };
  const ing = await idIngrediente(String(d.insumo || d.ingrediente || ""), tipoItem(d.tipoItem)).catch(() => null);
  if (!ing) return { ok: true };
  let q = supabase.from("ficha_itens").delete().eq("produto_id", prod.id);
  q = ing.preparo_id ? q.eq("preparo_id", ing.preparo_id) : q.eq("insumo_id", ing.insumo_id);
  const r = await q;
  if (r.error) falha(r.error, "excluir item da ficha");
  return { ok: true };
}

/** Exclui a ficha (os ingredientes). O produto continua existindo, por causa das vendas, vínculos e consumo. */
async function excluirProdutoFicha(d: any) {
  const prod = await acharProduto(String(d.produto || ""));
  if (!prod) return { ok: true };
  const r = await supabase.from("ficha_itens").delete().eq("produto_id", prod.id);
  if (r.error) falha(r.error, "excluir ficha");
  return { ok: true };
}

async function atualizarCategoriaProduto(d: any) {
  const prod = await acharProduto(String(d.produto || ""));
  if (!prod) return { ok: false, error: "Produto não encontrado." };
  const r = await supabase.from("produtos").update({ categoria_id: await idCategoria(String(d.categoria || "")) }).eq("id", prod.id);
  if (r.error) falha(r.error, "categoria");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Preparos
// ---------------------------------------------------------------------------
/** true se o preparo "alvoId" usa (direta ou indiretamente) o preparo "procuradoId" */
function preparoUsa(itens: Record<string, ItemDb[]>, alvoId: string, procuradoId: string, vistos: Record<string, boolean> = {}): boolean {
  if (alvoId === procuradoId) return true;
  if (vistos[alvoId]) return false;
  vistos[alvoId] = true;
  return (itens[alvoId] || []).some((it) => !!it.ref_preparo && preparoUsa(itens, it.ref_preparo, procuradoId, vistos));
}

async function salvarPreparoItem(d: any) {
  const nomePrep = String(d.preparo || "").trim();
  const nomeIng = String(d.insumo || "").trim();
  if (!nomePrep || !nomeIng) return { ok: false, error: "Informe o preparo e o ingrediente." };
  const tipo = tipoItem(d.tipoItem);
  const rend = num(d.rendimento);
  const unid = String(d.unidade || "").trim();

  let prep = await acharPreparo(nomePrep);
  if (!prep) {
    const novo = await supabase.from("preparos").insert({ nome: nomePrep, rendimento: rend > 0 ? rend : 1, unidade: unid || "kg" }).select("id, nome, rendimento, unidade").single();
    if (novo.error) falha(novo.error, "criar preparo");
    prep = novo.data;
  } else {
    const upd: any = { ativo: true };
    if (rend > 0) upd.rendimento = rend;
    if (unid) upd.unidade = unid;
    const u = await supabase.from("preparos").update(upd).eq("id", prep.id);
    if (u.error) falha(u.error, "atualizar preparo");
  }

  let insumo_id: string | null = null, sub_preparo_id: string | null = null;
  if (tipo === "preparo") {
    const sub = await acharPreparo(nomeIng);
    if (!sub) return { ok: false, error: `Preparo "${nomeIng}" não encontrado.` };
    const { itens } = await lerPreparos();
    if (preparoUsa(itens, sub.id, prep.id)) {
      return { ok: false, error: `"${nomeIng}" já usa "${nomePrep}" na receita (ou é o próprio preparo). Isso criaria uma receita circular.` };
    }
    sub_preparo_id = sub.id;
  } else {
    const i = await acharInsumo(nomeIng, true);
    if (!i) return { ok: false, error: `Insumo "${nomeIng}" não encontrado no cadastro.` };
    insumo_id = i.id;
  }

  let q = supabase.from("preparo_itens").select("id").eq("preparo_id", prep.id);
  q = sub_preparo_id ? q.eq("sub_preparo_id", sub_preparo_id) : q.eq("insumo_id", insumo_id);
  const ex = await q;
  if (ex.error) falha(ex.error, "preparo");
  const temDesp = d.desperdicio !== undefined && d.desperdicio !== null;
  if (ex.data?.length) {
    const upd: any = { quantidade: num(d.quantidade) };
    if (temDesp) upd.desperdicio = desp(d.desperdicio);
    const r = await supabase.from("preparo_itens").update(upd).eq("id", ex.data[0].id);
    if (r.error) falha(r.error, "salvar item do preparo");
  } else {
    const ordem = await supabase.from("preparo_itens").select("id", { count: "exact", head: true }).eq("preparo_id", prep.id);
    const r = await supabase.from("preparo_itens").insert({
      preparo_id: prep.id, insumo_id, sub_preparo_id, quantidade: num(d.quantidade), desperdicio: temDesp ? desp(d.desperdicio) : 0, ordem: ordem.count || 0,
    });
    if (r.error) falha(r.error, "salvar item do preparo");
  }
  return { ok: true };
}

async function atualizarPreparo(d: any) {
  const prep = await acharPreparo(String(d.preparo || ""));
  if (!prep) return { ok: false, error: "Preparo não encontrado." };
  const rend = num(d.rendimento);
  if (!(rend > 0)) return { ok: false, error: "O rendimento precisa ser maior que zero." };
  const upd: any = { rendimento: rend };
  if (String(d.unidade || "").trim()) upd.unidade = String(d.unidade).trim();
  const r = await supabase.from("preparos").update(upd).eq("id", prep.id);
  if (r.error) falha(r.error, "atualizar preparo");
  return { ok: true };
}

async function excluirPreparoItem(d: any) {
  const prep = await acharPreparo(String(d.preparo || ""));
  if (!prep) return { ok: true };
  const tipo = tipoItem(d.tipoItem);
  const nomeIng = String(d.insumo || "");
  const ref = tipo === "preparo" ? await acharPreparo(nomeIng) : await acharInsumo(nomeIng, true);
  if (!ref) return { ok: true };
  const r = await supabase.from("preparo_itens").delete().eq("preparo_id", prep.id).eq(tipo === "preparo" ? "sub_preparo_id" : "insumo_id", ref.id);
  if (r.error) falha(r.error, "excluir item do preparo");
  return { ok: true };
}

async function excluirPreparo(d: any) {
  const prep = await acharPreparo(String(d.preparo || ""));
  if (!prep) return { ok: true };
  const [f, p] = await Promise.all([
    supabase.from("ficha_itens").select("produtos(nome)").eq("preparo_id", prep.id),
    supabase.from("preparo_itens").select("preparos!preparo_itens_preparo_id_fkey(nome)").eq("sub_preparo_id", prep.id),
  ]);
  if (f.error) falha(f.error, "usos do preparo");
  if (p.error) falha(p.error, "usos do preparo");
  const usos = [
    ...(f.data || []).map((x: any) => x.produtos?.nome),
    ...(p.data || []).map((x: any) => (x.preparos?.nome ? `${x.preparos.nome} (preparo)` : null)),
  ].filter(Boolean);
  if (usos.length) return { ok: false, error: `"${prep.nome}" está sendo usado em: ${Array.from(new Set(usos)).join(", ")}. Remova de lá antes de excluir.` };
  const r = await supabase.from("preparos").delete().eq("id", prep.id);
  if (r.error) falha(r.error, "excluir preparo");
  return { ok: true };
}

// ---------------------------------------------------------------------------
const ACOES: Record<string, (d: any) => Promise<any>> = {
  insumos_lista: listaInsumos,
  preparos_lista: listaPreparos,
  fichas_lista: listaFichas,
  save_insumo: salvarInsumo,
  delete_insumo: excluirInsumo,
  save_ficha_item: salvarFichaItem,
  delete_ficha_item: excluirFichaItem,
  delete_produto_ficha: excluirProdutoFicha,
  update_categoria_produto: atualizarCategoriaProduto,
  save_preparo_item: salvarPreparoItem,
  update_preparo: atualizarPreparo,
  delete_preparo_item: excluirPreparoItem,
  delete_preparo: excluirPreparo,
};

/** Mesmo formato de resposta do Apps Script: { ok: true, ... } ou { ok: false, error } */
export async function api(acao: string, dados: Record<string, any> = {}): Promise<any> {
  const f = ACOES[acao];
  if (!f) return { ok: false, error: `Ação desconhecida: ${acao}` };
  try {
    return await f(dados);
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
