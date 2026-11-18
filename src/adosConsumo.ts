// Consumo interno (sócios e funcionários) no Supabase.
import { supabase } from "./supabase";
import { nomeComFracao } from "./dadosVendas";

export type TipoPessoa = "socio" | "funcionario";
export type ProdutoConsumo = { id: string; nome: string; categoria: string; precoInterno: number };
export type LinhaConsumo = {
  id: string;
  data: string; // YYYY-MM-DD
  pessoa: string;
  tipo: TipoPessoa;
  produtoId: string | null; // já resolvido pelo vínculo quando o lançamento antigo não tinha produto
  produto: string; // como foi lançado (ex.: "1/2 Vegana")
  fracao: number;
  quantidade: number;
  observacao: string;
  valor: number; // quantidade × fração × preço interno
};

function falha(e: any, onde: string): never {
  throw new Error(`${onde}: ${e?.message || e}`);
}

export async function carregarProdutos(): Promise<ProdutoConsumo[]> {
  const r = await supabase.from("produtos").select("id, nome, preco_venda, preco_consumo_interno, categorias_produto(nome)").eq("ativo", true).order("nome");
  if (r.error) falha(r.error, "produtos");
  return (r.data || []).map((p: any) => ({
    id: p.id,
    nome: p.nome,
    categoria: p.categorias_produto?.nome || "",
    precoInterno: p.preco_consumo_interno != null ? Number(p.preco_consumo_interno) : Number(p.preco_venda) || 0,
  }));
}

/** Mapa "NOME EM MAIÚSCULAS" -> produto_id, dos vínculos feitos na aba Vendas (para lançamentos antigos sem produto) */
export async function carregarVinculos(): Promise<Record<string, string>> {
  const r = await supabase.from("produto_vinculos_colibri").select("nome_colibri, produto_id").not("produto_id", "is", null);
  if (r.error) falha(r.error, "vínculos");
  const m: Record<string, string> = {};
  (r.data || []).forEach((v: any) => { m[v.nome_colibri] = v.produto_id; });
  return m;
}

/** Produto de um lançamento: o gravado ou, se não tiver, o do vínculo pelo nome (sem o "1/2") */
export function resolverProduto(produtoId: string | null, nome: string, vinculos: Record<string, string>): string | null {
  if (produtoId) return produtoId;
  return vinculos[nomeComFracao(nome).nome.trim().toUpperCase()] || null;
}

export async function listarConsumo(p: { inicio: string; fim: string; tipo?: TipoPessoa | "" }) {
  const [prods, vinc] = await Promise.all([carregarProdutos(), carregarVinculos()]);
  const preco: Record<string, number> = {};
  prods.forEach((x) => { preco[x.id] = x.precoInterno; });
  const linhas: LinhaConsumo[] = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    let q = supabase.from("consumo_interno")
      .select("id, data, pessoa, tipo_pessoa, produto_id, produto_nome, fracao, quantidade, observacao")
      .gte("data", p.inicio).lte("data", p.fim)
      .order("data", { ascending: false }).order("criado_em", { ascending: false })
      .range(de, de + passo - 1);
    if (p.tipo) q = q.eq("tipo_pessoa", p.tipo);
    const r = await q;
    if (r.error) falha(r.error, "consumo");
    (r.data || []).forEach((c: any) => {
      const produtoId = resolverProduto(c.produto_id, c.produto_nome, vinc);
      const fracao = Number(c.fracao) || 1;
      const quantidade = Number(c.quantidade) || 0;
      linhas.push({
        id: c.id, data: c.data, pessoa: c.pessoa, tipo: c.tipo_pessoa, produtoId, produto: c.produto_nome,
        fracao, quantidade, observacao: c.observacao || "",
        valor: produtoId ? quantidade * fracao * (preco[produtoId] || 0) : 0,
      });
    });
    if ((r.data || []).length < passo) break;
  }
  return { linhas, produtos: prods };
}

export async function pessoasConhecidas(): Promise<{ socios: string[]; funcionarios: string[] }> {
  const r = await supabase.from("consumo_interno").select("pessoa, tipo_pessoa").order("criado_em", { ascending: false }).limit(1000);
  if (r.error) falha(r.error, "pessoas");
  const s = new Set<string>(), f = new Set<string>();
  (r.data || []).forEach((x: any) => (x.tipo_pessoa === "funcionario" ? f : s).add(String(x.pessoa || "").trim()));
  s.delete(""); f.delete("");
  return { socios: Array.from(s).sort(), funcionarios: Array.from(f).sort((a, b) => a.localeCompare(b, "pt-BR")) };
}

export async function lancarConsumo(d: {
  data: string; pessoa: string; tipo: TipoPessoa; observacao: string;
  itens: { produto: ProdutoConsumo; fracao: number; quantidade: number }[];
}) {
  const linhas = d.itens.map((it) => ({
    data: d.data,
    pessoa: d.pessoa.trim(),
    tipo_pessoa: d.tipo,
    produto_id: it.produto.id,
    produto_nome: (it.fracao === 0.5 ? "1/2 " : "") + it.produto.nome,
    fracao: it.fracao,
    quantidade: it.quantidade,
    observacao: d.observacao.trim(),
  }));
  const r = await supabase.from("consumo_interno").insert(linhas);
  if (r.error) falha(r.error, "lançar consumo");
}

export async function excluirConsumo(id: string) {
  const r = await supabase.from("consumo_interno").delete().eq("id", id);
  if (r.error) falha(r.error, "excluir consumo");
}
