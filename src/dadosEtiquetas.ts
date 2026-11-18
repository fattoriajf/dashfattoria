// Dados do módulo de Etiquetas e da Lista de compras no Supabase.
// Devolve os dados no mesmo formato que as telas usavam com o Apps Script,
// para as telas mudarem o mínimo possível.
import { supabase } from "./supabase";

function erro(e: any, onde: string): never {
  throw new Error(`${onde}: ${e?.message || e}`);
}

/** "2026-11-05" + "14:30" (horário local) -> ISO */
export function manipParaISO(data: string, hora: string): string | null {
  if (!data) return null;
  const [y, m, d] = data.split("-").map(Number);
  const [h, mi] = (hora || "00:00").split(":").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, h || 0, mi || 0);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// ---------------------------------------------------------------------------
// Cadastros usados pelas etiquetas
// ---------------------------------------------------------------------------
export type InsumoEtiqueta = {
  id: string;
  nome: string;
  categoria_validade: string; // nome da categoria (como antes)
  categoria_validade_id: string | null;
  marca_fornecedor: string;
  fornecedores: string[];
  sif: string;
  setor: string;
};

export async function carregarCadastrosEtiqueta() {
  const [ins, cats, emp, resp] = await Promise.all([
    supabase
      .from("insumos")
      .select("id, nome, sif, setor, categoria_validade_id, categorias_validade(nome), insumo_fornecedores(fornecedores(nome))")
      .eq("ativo", true)
      .neq("tipo", "uso_geral")
      .order("nome"),
    supabase.from("categorias_validade").select("id, nome, prazo_resfriado_dias, prazo_congelado_dias, referencia").order("nome"),
    supabase.from("empresa_config").select("nome, cnpj, endereco").eq("id", 1).maybeSingle(),
    supabase.from("responsaveis_etiqueta").select("nome").eq("ativo", true).order("nome"),
  ]);
  if (ins.error) erro(ins.error, "insumos");
  if (cats.error) erro(cats.error, "categorias");
  if (emp.error) erro(emp.error, "empresa");
  if (resp.error) erro(resp.error, "responsáveis");

  const insumos: InsumoEtiqueta[] = (ins.data || []).map((r: any) => {
    const fornecedores: string[] = (r.insumo_fornecedores || [])
      .map((x: any) => x?.fornecedores?.nome)
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b, "pt-BR"));
    return {
      id: r.id,
      nome: r.nome,
      categoria_validade: r.categorias_validade?.nome || "",
      categoria_validade_id: r.categoria_validade_id,
      marca_fornecedor: fornecedores.length === 1 ? fornecedores[0] : "",
      fornecedores,
      sif: r.sif || "",
      setor: r.setor || "",
    };
  });
  return {
    insumos,
    categorias: cats.data || [],
    empresa: { nome: emp.data?.nome || "", cnpj: emp.data?.cnpj || "", endereco: emp.data?.endereco || "" },
    responsaveis: (resp.data || []).map((r: any) => r.nome as string),
  };
}

export async function salvarResponsavel(nome: string) {
  const n = nome.trim();
  // se já existir (mesmo desativado), só reativa
  const { data: ex } = await supabase.from("responsaveis_etiqueta").select("id").ilike("nome", n).maybeSingle();
  const r = ex
    ? await supabase.from("responsaveis_etiqueta").update({ ativo: true, nome: n }).eq("id", ex.id)
    : await supabase.from("responsaveis_etiqueta").insert({ nome: n });
  if (r.error) erro(r.error, "salvar responsável");
}

export async function excluirResponsavel(nome: string) {
  const r = await supabase.from("responsaveis_etiqueta").delete().ilike("nome", nome.trim());
  if (r.error) erro(r.error, "excluir responsável");
}

export async function salvarEmpresa(nome: string, cnpj: string, endereco: string) {
  const r = await supabase.from("empresa_config").update({ nome, cnpj, endereco }).eq("id", 1);
  if (r.error) erro(r.error, "salvar empresa");
}

export async function salvarCategoria(c: { nome: string; prazo_resfriado_dias: number; prazo_congelado_dias: number; referencia: string }) {
  const r = await supabase.from("categorias_validade").insert({
    nome: c.nome.trim(),
    prazo_resfriado_dias: Math.round(Number(c.prazo_resfriado_dias) || 0),
    prazo_congelado_dias: Math.round(Number(c.prazo_congelado_dias) || 0),
    referencia: c.referencia || "",
  });
  if (r.error) erro(r.error, "salvar categoria");
}

export async function atualizarCategoria(id: string, c: { nome: string; prazo_resfriado_dias: number; prazo_congelado_dias: number; referencia: string }) {
  const r = await supabase.from("categorias_validade").update({
    nome: c.nome.trim(),
    prazo_resfriado_dias: Math.round(Number(c.prazo_resfriado_dias) || 0),
    prazo_congelado_dias: Math.round(Number(c.prazo_congelado_dias) || 0),
    referencia: c.referencia || "",
  }).eq("id", id);
  if (r.error) erro(r.error, "atualizar categoria");
}

export async function excluirCategoria(id: string) {
  const r = await supabase.from("categorias_validade").delete().eq("id", id);
  if (r.error) erro(r.error, "excluir categoria");
}

/** Dados de etiqueta do insumo (categoria de validade, SIF, fornecedores, setor) */
export async function atualizarInsumoEtiqueta(p: {
  insumoId: string; categoriaValidadeId: string | null; sif: string; setor: string; fornecedores: string[];
}) {
  const r = await supabase.rpc("atualizar_insumo_etiqueta", {
    p_insumo_id: p.insumoId,
    p_categoria_validade_id: p.categoriaValidadeId,
    p_sif: p.sif || "",
    p_setor: p.setor || "",
    p_fornecedores: p.fornecedores,
  });
  if (r.error) erro(r.error, "salvar insumo");
}

// ---------------------------------------------------------------------------
// Lotes de etiqueta (estoque ativo e histórico)
// ---------------------------------------------------------------------------
/** Linha no formato antigo usado pelas telas (validade_dt, manip_dt, baixa_dt...) */
function lotePraTela(r: any) {
  return {
    id: r.id,
    insumo: r.insumo_nome,
    conservacao: r.conservacao,
    validade_dt: r.validade || "",
    manip_dt: r.manipulacao || "",
    responsavel: r.responsavel || "",
    porcoes: r.porcoes || "",
    peso: r.peso || "",
    qtd: r.qtd,
    status: r.status,
    baixa_dt: r.baixa_em || "",
    emissao_dt: r.emitido_em || "",
    fornecedor: r.fornecedor || "",
    reimpressoes: r.reimpressoes || 0,
    ultima_reimpressao: r.ultima_reimpressao || "",
    editado_dt: r.editado_em || "",
  };
}

const CAMPOS_LOTE = "id, insumo_nome, conservacao, validade, manipulacao, responsavel, porcoes, peso, qtd, status, baixa_em, emitido_em, fornecedor, reimpressoes, ultima_reimpressao, editado_em";

/** Ativos: vencidos primeiro, depois por validade */
export async function listarEstoqueAtivo() {
  const out: any[] = [];
  for (let ini = 0; ; ini += 1000) {
    const r = await supabase.from("lotes_etiqueta").select(CAMPOS_LOTE).eq("status", "ativo")
      .order("validade", { ascending: true, nullsFirst: false }).range(ini, ini + 999);
    if (r.error) erro(r.error, "estoque ativo");
    out.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  return out.map(lotePraTela);
}

/** Histórico: baixas mais recentes primeiro */
export async function listarHistorico() {
  const out: any[] = [];
  for (let ini = 0; ; ini += 1000) {
    const r = await supabase.from("lotes_etiqueta").select(CAMPOS_LOTE).eq("status", "baixa")
      .order("baixa_em", { ascending: false, nullsFirst: false }).range(ini, ini + 999);
    if (r.error) erro(r.error, "histórico");
    out.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  return out.map(lotePraTela);
}

export async function darBaixaLote(id: string) {
  const r = await supabase.from("lotes_etiqueta").update({ status: "baixa", baixa_em: new Date().toISOString() }).eq("id", id);
  if (r.error) erro(r.error, "dar baixa");
}

export async function restaurarLote(id: string) {
  const r = await supabase.from("lotes_etiqueta").update({ status: "ativo", baixa_em: null }).eq("id", id);
  if (r.error) erro(r.error, "restaurar");
}

export async function proximosCodigos(qtd: number): Promise<string[]> {
  const r = await supabase.rpc("proximos_codigos_lote", { p_qtd: qtd });
  if (r.error) erro(r.error, "códigos de etiqueta");
  return (r.data || []) as string[];
}

export type DadosLote = {
  insumoNome: string; conservacao: string; validade: string | null; manipulacao: string | null;
  responsavel: string; porcoes: string; peso: string; fornecedor: string;
};

/** Grava os lotes impressos. Cada código vira um lote (qtd = cópias com o mesmo código). */
export async function registrarLotes(codigos: string[], d: DadosLote, qtdPorCodigo: number) {
  const { data: ins } = await supabase.from("insumos").select("id").ilike("nome", d.insumoNome).maybeSingle();
  const linhas = codigos.map((id) => ({
    id,
    insumo_id: ins?.id ?? null,
    insumo_nome: d.insumoNome,
    conservacao: d.conservacao,
    validade: d.validade,
    manipulacao: d.manipulacao,
    responsavel: d.responsavel,
    porcoes: d.porcoes,
    peso: d.peso,
    qtd: qtdPorCodigo,
    fornecedor: d.fornecedor,
  }));
  const r = await supabase.from("lotes_etiqueta").insert(linhas);
  if (r.error) erro(r.error, "registrar etiqueta");
}

export async function registrarReimpressao(id: string, qtd: number) {
  const { data, error } = await supabase.from("lotes_etiqueta").select("reimpressoes").eq("id", id).maybeSingle();
  if (error) erro(error, "reimpressão");
  const r = await supabase.from("lotes_etiqueta")
    .update({ reimpressoes: (data?.reimpressoes || 0) + qtd, ultima_reimpressao: new Date().toISOString() }).eq("id", id);
  if (r.error) erro(r.error, "reimpressão");
}

export async function atualizarLote(id: string, c: { peso: string; porcoes: string; responsavel: string; fornecedor: string }) {
  const r = await supabase.from("lotes_etiqueta")
    .update({ ...c, editado_em: new Date().toISOString() }).eq("id", id);
  if (r.error) erro(r.error, "editar etiqueta");
}

// ---------------------------------------------------------------------------
// Lista de compras (contagem semanal)
// ---------------------------------------------------------------------------
export type ItemEstoque = {
  id: string;
  item: string;
  categoria: string;
  armazenamento: string;
  estoqueMin: number | null;
  estoqueMax: number | null;
  ondeComprar: string;
  observacao: string;
  setor: string;
};

/** Insumos que entram na lista de compras (controla_estoque) */
export async function carregarItensEstoque(): Promise<ItemEstoque[]> {
  const r = await supabase
    .from("insumos")
    .select("id, nome, categoria_estoque, armazenamento, estoque_min, estoque_max, onde_comprar, observacao, setor_compras")
    .eq("ativo", true)
    .eq("controla_estoque", true)
    .order("nome");
  if (r.error) erro(r.error, "itens da lista de compras");
  return (r.data || []).map((x: any) => ({
    id: x.id,
    item: x.nome,
    categoria: x.categoria_estoque || "",
    armazenamento: x.armazenamento || "",
    estoqueMin: x.estoque_min === null ? null : Number(x.estoque_min),
    estoqueMax: x.estoque_max === null ? null : Number(x.estoque_max),
    ondeComprar: x.onde_comprar || "",
    observacao: x.observacao || "",
    setor: x.setor_compras || "",
  }));
}

export async function carregarConfigEstoque() {
  const r = await supabase.from("estoque_config").select("pct_amarelo, pct_verde, emails_lista").eq("id", 1).maybeSingle();
  if (r.error) erro(r.error, "configuração da lista");
  return {
    pctAmarelo: Number(r.data?.pct_amarelo ?? 30),
    pctVerde: Number(r.data?.pct_verde ?? 50),
    emails: String(r.data?.emails_lista || ""),
  };
}

export async function salvarConfigEstoque(pctAmarelo: number, pctVerde: number) {
  const r = await supabase.from("estoque_config").update({ pct_amarelo: pctAmarelo, pct_verde: pctVerde }).eq("id", 1);
  if (r.error) erro(r.error, "salvar configuração");
}

/** Guarda a contagem (histórico) e devolve o id */
export async function salvarContagem(p: {
  data: string; // YYYY-MM-DD
  setor: string;
  pctAmarelo: number;
  pctVerde: number;
  extras: string[];
  itens: { id: string; nome: string; atual: number; min: number | null; max: number | null }[];
}): Promise<string> {
  const c = await supabase.from("contagens_estoque")
    .insert({ data: p.data, setor: p.setor, pct_amarelo: p.pctAmarelo, pct_verde: p.pctVerde, extras: p.extras })
    .select("id").single();
  if (c.error) erro(c.error, "salvar contagem");
  const linhas = p.itens.map((i) => ({
    contagem_id: c.data.id,
    insumo_id: i.id,
    insumo_nome: i.nome,
    estoque_atual: i.atual,
    estoque_min: i.min,
    estoque_max: i.max,
  }));
  if (linhas.length) {
    const r = await supabase.from("contagem_itens").insert(linhas);
    if (r.error) erro(r.error, "salvar itens da contagem");
  }
  return c.data.id as string;
}
