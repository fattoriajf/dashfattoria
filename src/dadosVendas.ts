// Vendas do Colibri (importação do Excel) e vínculos "nome do Colibri → produto/ficha".
import { supabase } from "./supabase";

function erro(e: any, onde: string): never {
  throw new Error(`${onde}: ${e?.message || e}`);
}

// ---------------------------------------------------------------------------
// Leitura do Excel (SheetJS carregado da CDN só quando for usar)
// ---------------------------------------------------------------------------
let xlsxPromise: Promise<any> | null = null;
function carregarXlsx(): Promise<any> {
  if ((window as any).XLSX) return Promise.resolve((window as any).XLSX);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    el.onload = () => resolve((window as any).XLSX);
    el.onerror = () => { xlsxPromise = null; reject(new Error("Não foi possível carregar o leitor de Excel.")); };
    document.head.appendChild(el);
  });
  return xlsxPromise;
}

/** "8,90" / "1.234,56" / 8.9 -> número */
export function numBR(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Data do Excel (número serial, Date ou "DD/MM/YYYY [HH:MM]") -> partes da data/hora "de parede" */
function partesData(v: any): { y: number; m: number; d: number; h: number; mi: number; s: number } | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && isFinite(v)) {
    const u = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
    return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate(), h: u.getUTCHours(), mi: u.getUTCMinutes(), s: u.getUTCSeconds() };
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), h: v.getHours(), mi: v.getMinutes(), s: v.getSeconds() };
  }
  const t = String(v).trim();
  let r = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (r) return { y: +r[3], m: +r[2], d: +r[1], h: +(r[4] || 0), mi: +(r[5] || 0), s: +(r[6] || 0) };
  r = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (r) return { y: +r[1], m: +r[2], d: +r[3], h: +(r[4] || 0), mi: +(r[5] || 0), s: +(r[6] || 0) };
  if (/^\d+(\.\d+)?$/.test(t)) return partesData(parseFloat(t));
  return null;
}
const p2 = (n: number) => String(n).padStart(2, "0");
export function dataISO(v: any): string | null {
  const p = partesData(v);
  return p ? `${p.y}-${p2(p.m)}-${p2(p.d)}` : null;
}
function dataHoraISO(v: any): string | null {
  const p = partesData(v);
  if (!p) return null;
  const dt = new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s); // horário do Brasil (o do computador)
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

export type LinhaVenda = {
  dt_contabil: string;
  dt_hr_lancamento: string | null;
  descricao: string;
  grupo: string;
  qtd: number;
  vl_preco: number;
  vl_preco_original: number;
  vl_desconto: number;
  vl_total: number;
  vl_servico_informado: number;
  vl_servico_calculado: number;
  nome_funcionario: string;
  modo_venda: string;
};

/** Lê o Excel exportado do Colibri (relatório "Vendas em Grid") */
export async function lerExcelColibri(arquivo: File): Promise<{ linhas: LinhaVenda[]; inicio: string; fim: string; ignoradas: number }> {
  const XLSX = await carregarXlsx();
  const buf = await arquivo.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const brutas: any[] = XLSX.utils.sheet_to_json(ws, { raw: true, defval: "" });
  if (!brutas.length) throw new Error("A planilha está vazia.");
  // nomes das colunas sem espaço/maiúsculas, para aceitar pequenas variações do relatório
  const norm = (o: any) => {
    const out: any = {};
    Object.keys(o).forEach((k) => { out[k.trim().toLowerCase()] = o[k]; });
    return out;
  };
  const primeira = norm(brutas[0]);
  for (const c of ["dt_contabil", "descricao", "qtd", "vl_total"]) {
    if (!(c in primeira)) throw new Error(`O arquivo não tem a coluna "${c}". Confira se é o relatório "Vendas em Grid" do Colibri.`);
  }
  let ignoradas = 0;
  const linhas: LinhaVenda[] = [];
  let inicio = "9999-12-31", fim = "0000-01-01";
  for (const b of brutas) {
    const r = norm(b);
    const dt = dataISO(r.dt_contabil);
    const desc = String(r.descricao || "").trim().replace(/\s+/g, " ");
    if (!dt || !desc) { ignoradas++; continue; }
    if (dt < inicio) inicio = dt;
    if (dt > fim) fim = dt;
    linhas.push({
      dt_contabil: dt,
      dt_hr_lancamento: dataHoraISO(r.dt_hr_lancamento),
      descricao: desc,
      grupo: String(r.grupo || "").trim(),
      qtd: numBR(r.qtd),
      vl_preco: numBR(r.vl_preco),
      vl_preco_original: numBR(r.vl_preco_original),
      vl_desconto: numBR(r.vl_desconto),
      vl_total: numBR(r.vl_total),
      vl_servico_informado: numBR(r.vl_servico_informado),
      vl_servico_calculado: numBR(r.vl_servico_calculado),
      nome_funcionario: String(r.nome_funcionario || "").trim(),
      modo_venda: String(r.nome_modo_venda || r.modo_venda || "").trim(),
    });
  }
  if (!linhas.length) throw new Error("Nenhuma venda válida encontrada no arquivo.");
  return { linhas, inicio, fim, ignoradas };
}

/** Grava as vendas: apaga os dias do período do arquivo e grava de novo (não duplica) */
export async function importarVendas(
  arquivoNome: string,
  dados: { linhas: LinhaVenda[]; inicio: string; fim: string },
  progresso?: (feitas: number, total: number) => void,
) {
  const del = await supabase.rpc("apagar_vendas_periodo", { p_inicio: dados.inicio, p_fim: dados.fim });
  if (del.error) erro(del.error, "apagar vendas do período");
  const imp = await supabase.from("importacoes_vendas")
    .insert({ arquivo: arquivoNome, data_inicio: dados.inicio, data_fim: dados.fim, linhas: dados.linhas.length })
    .select("id").single();
  if (imp.error) erro(imp.error, "registrar importação");
  const passo = 1000;
  for (let i = 0; i < dados.linhas.length; i += passo) {
    const lote = dados.linhas.slice(i, i + passo).map((l) => ({ ...l, importacao_id: imp.data.id }));
    const r = await supabase.from("vendas").insert(lote);
    if (r.error) erro(r.error, `gravar vendas (linhas ${i + 1} a ${i + lote.length})`);
    progresso?.(Math.min(i + passo, dados.linhas.length), dados.linhas.length);
  }
  return { apagadas: Number(del.data || 0) };
}

export async function ultimasImportacoes() {
  const r = await supabase.from("importacoes_vendas").select("arquivo, data_inicio, data_fim, linhas, importado_em")
    .order("importado_em", { ascending: false }).limit(10);
  if (r.error) erro(r.error, "importações");
  return r.data || [];
}

// ---------------------------------------------------------------------------
// Vínculos: nome do Colibri (ou nome antigo do consumo interno) → produto
// ---------------------------------------------------------------------------
/** "1/2 Vegana" -> { nome: "Vegana", fator: 0.5 } */
export function nomeComFracao(nome: string): { nome: string; fator: number } {
  const s = String(nome || "").trim();
  let m = s.match(/^(\d+)\s*\/\s*(\d+)\s+(.+)$/);
  if (m && Number(m[2]) > 0) return { nome: m[3].trim(), fator: Number(m[1]) / Number(m[2]) };
  m = s.match(/^½\s*(.+)$/);
  if (m) return { nome: m[1].trim(), fator: 0.5 };
  return { nome: s, fator: 1 };
}

export type NomePendente = {
  nome: string;           // em MAIÚSCULAS (chave do vínculo)
  origem: "vendas" | "consumo";
  grupo: string;
  qtd: number;            // quantidade vendida (ou consumida) no total
  faturamento: number;    // só vendas
};

export async function carregarVinculos() {
  const [vinc, prods, resumo, cons] = await Promise.all([
    supabase.from("produto_vinculos_colibri").select("nome_colibri, produto_id, ignorar"),
    supabase.from("produtos").select("id, nome, categorias_produto(nome)").eq("ativo", true).order("nome"),
    supabase.rpc("vendas_resumo", { p_inicio: "2000-01-01", p_fim: "2100-12-31" }),
    supabase.from("consumo_interno").select("produto_nome, quantidade").is("produto_id", null),
  ]);
  if (vinc.error) erro(vinc.error, "vínculos");
  if (prods.error) erro(prods.error, "produtos");
  if (resumo.error) erro(resumo.error, "vendas");
  if (cons.error) erro(cons.error, "consumo interno");

  const vinculos: Record<string, { produto_id: string | null; ignorar: boolean }> = {};
  (vinc.data || []).forEach((v: any) => { vinculos[v.nome_colibri] = { produto_id: v.produto_id, ignorar: v.ignorar }; });
  const produtos: { id: string; nome: string; categoria: string }[] = (prods.data || []).map((p: any) => ({ id: p.id as string, nome: p.nome as string, categoria: p.categorias_produto?.nome || "" }));
  const porNome: Record<string, string> = {};
  produtos.forEach((p) => { porNome[p.nome.trim().toUpperCase()] = p.id; });

  // nomes vendidos no Colibri (agrupados), sem vínculo e sem produto de mesmo nome
  const agg: Record<string, NomePendente> = {};
  (resumo.data || []).forEach((r: any) => {
    const n = String(r.descricao || "").trim().toUpperCase();
    if (!n) return;
    const a = agg[n] || (agg[n] = { nome: n, origem: "vendas", grupo: r.grupo || "", qtd: 0, faturamento: 0 });
    a.qtd += Number(r.qtd) || 0;
    a.faturamento += Number(r.vl_total) || 0;
  });
  // nomes antigos do consumo interno sem produto (sem o "1/2", que já é a fração)
  (cons.data || []).forEach((c: any) => {
    const n = nomeComFracao(c.produto_nome).nome.toUpperCase();
    if (!n) return;
    const a = agg[n] || (agg[n] = { nome: n, origem: "consumo", grupo: "Consumo interno", qtd: 0, faturamento: 0 });
    if (a.origem === "consumo") a.qtd += Number(c.quantidade) || 0;
  });
  const todos = Object.values(agg);
  const pendentes = todos
    .filter((p) => !vinculos[p.nome] && !porNome[p.nome])
    .sort((a, b) => b.faturamento - a.faturamento || b.qtd - a.qtd);
  const resolvidos = todos
    .filter((p) => vinculos[p.nome] || porNome[p.nome])
    .map((p) => ({ ...p, vinculo: vinculos[p.nome] || { produto_id: porNome[p.nome], ignorar: false }, automatico: !vinculos[p.nome] }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { produtos, pendentes, resolvidos };
}

/** Liga um nome a um produto (ou marca para ignorar). Também corrige o consumo interno antigo com esse nome. */
export async function salvarVinculo(nome: string, produtoId: string | null, ignorar: boolean) {
  const chave = nome.trim().toUpperCase();
  const r = await supabase.from("produto_vinculos_colibri")
    .upsert({ nome_colibri: chave, produto_id: ignorar ? null : produtoId, ignorar, atualizado_em: new Date().toISOString() });
  if (r.error) erro(r.error, "salvar vínculo");
  if (!ignorar && produtoId) {
    // consumo antigo sem produto com esse nome (com ou sem "1/2 ")
    const c = await supabase.from("consumo_interno").select("id, produto_nome").is("produto_id", null);
    if (!c.error) {
      const ids = (c.data || []).filter((x: any) => nomeComFracao(x.produto_nome).nome.toUpperCase() === chave).map((x: any) => x.id);
      if (ids.length) {
        const u = await supabase.from("consumo_interno").update({ produto_id: produtoId }).in("id", ids);
        if (u.error) erro(u.error, "atualizar consumo interno");
      }
    }
  }
}

export async function removerVinculo(nome: string) {
  const r = await supabase.from("produto_vinculos_colibri").delete().eq("nome_colibri", nome.trim().toUpperCase());
  if (r.error) erro(r.error, "remover vínculo");
}
