// CMV no Supabase: teórico (vendas do Colibri × fichas), inventário do dia 01, CMV real do mês,
// consumo interno e consumo teórico × real por insumo. Respostas no formato do Apps Script antigo.
import { supabase } from "./supabase";
import { carregarCusteio, Custeio, todas } from "./dadosFichas";

const low = (s: any) => String(s ?? "").trim().toLowerCase();
const num = (v: any) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isFinite(n) ? n : 0;
};
const fator = (pct: number) => 1 / (1 - Math.min(Math.max(pct || 0, 0), 95) / 100);
const p2 = (n: number) => String(n).padStart(2, "0");
const mesValido = (m: any) => (/^\d{4}-\d{2}$/.test(String(m || "")) ? String(m) : null);
function mesSeguinte(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${p2(m + 1)}`;
}
function limitesMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return { ini: `${mes}-01`, fim: `${mes}-${p2(ultimo)}`, ultimo };
}
const agoraBR = () => {
  const d = new Date();
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
function falha(e: any, onde: string): never {
  throw new Error(`${onde}: ${e?.message || e}`);
}
async function seguro(f: () => Promise<any>) {
  try { return await f(); } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}

// ---------------------------------------------------------------------------
// Base comum
// ---------------------------------------------------------------------------
type Vinculos = Record<string, { produto_id: string | null; ignorar: boolean }>;

export async function carregarVinculos(): Promise<Vinculos> {
  const r = await supabase.from("produto_vinculos_colibri").select("nome_colibri, produto_id, ignorar");
  if (r.error) falha(r.error, "vínculos");
  const m: Vinculos = {};
  (r.data || []).forEach((v: any) => { m[v.nome_colibri] = { produto_id: v.produto_id, ignorar: !!v.ignorar }; });
  return m;
}

/** produto de um nome (do Colibri ou do consumo antigo): vínculo da aba Vendas ou produto com o mesmo nome */
export function produtoDoNome(nome: string, c: Custeio, vinc: Vinculos, porNome: Record<string, string>): { id: string | null; ignorado: boolean } {
  const chave = String(nome || "").trim().toUpperCase();
  const v = vinc[chave];
  if (v) return { id: v.ignorar ? null : v.produto_id, ignorado: v.ignorar };
  return { id: porNome[low(nome)] || null, ignorado: false };
}
export const indicePorNome = (c: Custeio) => {
  const m: Record<string, string> = {};
  Object.values(c.produtos).forEach((p) => { m[low(p.nome)] = p.id; });
  return m;
};

/** Abre um item de ficha (insumo ou preparo) em quantidades de insumo (chave = id do insumo), somando em acc */
export type Acc = Record<string, { qtd: number; origens: Record<string, number> }>;
function abrirItem(c: Custeio, insumoId: string | null, preparoId: string | null, qtd: number, acc: Acc, origem: string, visitando: Record<string, boolean> = {}) {
  if (!qtd) return;
  if (!preparoId) {
    if (!insumoId) return;
    const a = (acc[insumoId] ||= { qtd: 0, origens: {} });
    a.qtd += qtd;
    if (origem) a.origens[origem] = (a.origens[origem] || 0) + qtd;
    return;
  }
  const rec = c.preparos[preparoId];
  if (!rec || !(rec.rendimento > 0) || visitando[preparoId]) return;
  visitando[preparoId] = true;
  rec.itens.forEach((it) => {
    abrirItem(c, it.insumo_id, it.ref_preparo, (qtd * it.quantidade) / rec.rendimento * fator(it.desperdicio), acc, origem, visitando);
  });
  delete visitando[preparoId];
}
/** abre a ficha de um produto (qtd vendida/consumida) */
export function abrirProduto(c: Custeio, produtoId: string, qtd: number, acc: Acc) {
  const p = c.produtos[produtoId];
  if (!p) return;
  p.itens.forEach((it) => abrirItem(c, it.insumo_id, it.preparo_id, qtd * it.quantidade * fator(it.desperdicio), acc, p.nome));
}
/** insumos usados dentro de um preparo (inclusive sub-preparos) */
function insumosDoPreparo(c: Custeio, preparoId: string, vistos: Record<string, boolean> = {}): string[] {
  if (vistos[preparoId] || !c.preparos[preparoId]) return [];
  vistos[preparoId] = true;
  let out: string[] = [];
  c.preparos[preparoId].itens.forEach((it) => {
    if (it.ref_preparo) out = out.concat(insumosDoPreparo(c, it.ref_preparo, vistos));
    else if (it.insumo_id) out.push(it.insumo_id);
  });
  return out;
}

export async function vendasResumo(ini: string, fim: string) {
  const r = await supabase.rpc("vendas_resumo", { p_inicio: ini, p_fim: fim });
  if (r.error) falha(r.error, "vendas");
  return (r.data || []).map((x: any) => ({ descricao: String(x.descricao || ""), grupo: String(x.grupo || "").trim(), qtd: Number(x.qtd) || 0, vl_total: Number(x.vl_total) || 0 }));
}

// ---------------------------------------------------------------------------
// Grupos (categorias do Colibri) e CMV teórico do período
// ---------------------------------------------------------------------------
export async function gruposVendas(): Promise<string[]> {
  const v = await vendasResumo("2000-01-01", "2100-12-31");
  return Array.from(new Set(v.map((x: any) => x.grupo).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, "pt-BR")) as string[];
}

/** inicio/fim em YYYY-MM-DD; grupos vazio = todos */
export async function cmvTeorico(inicio: string, fim: string, grupos: string[]) {
  const [c, vinc, vendas] = await Promise.all([carregarCusteio(), carregarVinculos(), vendasResumo(inicio, fim)]);
  const porNome = indicePorNome(c);
  const agg: Record<string, { descricao: string; qtdVendida: number; receitaTotal: number }> = {};
  vendas.forEach((r: any) => {
    if (grupos.length && !grupos.includes(r.grupo)) return;
    const k = r.descricao.trim().toUpperCase();
    if (!k) return;
    const a = (agg[k] ||= { descricao: r.descricao.trim(), qtdVendida: 0, receitaTotal: 0 });
    a.qtdVendida += r.qtd;
    a.receitaTotal += r.vl_total;
  });
  let totalCusto = 0, totalReceita = 0;
  const rows = Object.values(agg).map((item) => {
    const prod = produtoDoNome(item.descricao, c, vinc, porNome);
    const p = prod.id ? c.produtos[prod.id] : null;
    const temFicha = !!(p && p.itens.length);
    const custoUnitario = temFicha ? p!.custoTotal : null;
    const custoTotal = custoUnitario !== null ? item.qtdVendida * custoUnitario : null;
    if (custoTotal !== null) totalCusto += custoTotal;
    totalReceita += item.receitaTotal;
    return {
      produto: item.descricao, ficha: temFicha ? p!.nome : "", ignorado: prod.ignorado,
      qtdVendida: item.qtdVendida, custoUnitario, custoTotal, receitaTotal: item.receitaTotal,
      cmvPct: custoTotal !== null && item.receitaTotal > 0 ? (custoTotal / item.receitaTotal) * 100 : null,
      temFicha,
    };
  }).sort((a, b) => (b.receitaTotal || 0) - (a.receitaTotal || 0));
  return { rows, totalCusto, totalReceita, cmvGeral: totalReceita > 0 ? (totalCusto / totalReceita) * 100 : 0 };
}

// ---------------------------------------------------------------------------
// Inventário do dia 01
// ---------------------------------------------------------------------------
type ItemInv = { insumo: string; tipo: "insumo" | "preparo"; unidade: string; quantidade: number; custoUnitario: number; valor: number; insumoId: string | null; preparoId: string | null };

async function lerInventario(meses: string[]) {
  return todas(() => supabase.from("inventario_cmv_itens")
    .select("id, mes, tipo, insumo_id, preparo_id, nome, unidade, quantidade, custo_unitario, atualizado_em")
    .in("mes", meses).order("id"), "inventário");
}

function montarInventario(mes: string, linhas: any[]) {
  let valorTotal = 0, ultimo = "";
  const semCusto: string[] = [];
  const itens: ItemInv[] = linhas.filter((x) => x.mes === mes).map((x) => {
    const quantidade = Number(x.quantidade) || 0, custo = Number(x.custo_unitario) || 0;
    valorTotal += quantidade * custo;
    if (quantidade > 0 && !(custo > 0)) semCusto.push(x.nome);
    if (x.atualizado_em && x.atualizado_em > ultimo) ultimo = x.atualizado_em;
    return {
      insumo: x.nome, tipo: x.tipo === "preparo" ? "preparo" : "insumo", unidade: x.unidade || "",
      quantidade, custoUnitario: custo, valor: quantidade * custo, insumoId: x.insumo_id, preparoId: x.preparo_id,
    } as ItemInv;
  }).sort((a, b) => a.insumo.localeCompare(b.insumo, "pt-BR"));
  let atualizadoEm = "";
  if (ultimo) {
    const d = new Date(ultimo);
    atualizadoEm = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  return {
    existe: itens.length > 0, mes, data: `01/${mes.slice(5, 7)}/${mes.slice(0, 4)}`,
    itens, valorTotal, atualizadoEm, semCusto,
  };
}

/** GET inventario_cmv: inventário salvo do mês + meses que já têm inventário + custo dos preparos */
export function inventarioCmv(mesParam: string) {
  return seguro(async () => {
    const mes = mesValido(mesParam);
    if (!mes) return { ok: false, error: "Mês inválido." };
    const [linhas, meses, c] = await Promise.all([
      lerInventario([mes]),
      todas(() => supabase.from("inventario_cmv_itens").select("mes").order("mes", { ascending: false }).order("id"), "meses do inventário"),
      carregarCusteio(),
    ]);
    const preparos = Object.values(c.preparos)
      .map((p) => ({ preparo: p.nome, unidade: p.unidade, custoPorUnidade: p.custoPorUnidade }))
      .sort((a, b) => a.preparo.localeCompare(b.preparo, "pt-BR"));
    return {
      ok: true,
      inventario: montarInventario(mes, linhas),
      meses: Array.from(new Set(meses.map((x: any) => x.mes))),
      preparos,
    };
  });
}

/**
 * POST save_inventario_cmv: substitui o inventário do mês. O custo de cada item é "fotografado" no primeiro
 * salvamento; depois só muda se atualizarCustos = true (ou se estava zerado). Uso geral fica de fora.
 */
export function salvarInventarioCmv(d: { mes: string; itens: { insumo: string; tipo?: string; quantidade: any }[]; atualizarCustos?: boolean }) {
  return seguro(async () => {
    const mes = mesValido(d.mes);
    if (!mes) return { ok: false, error: "Mês inválido." };
    const [c, antes] = await Promise.all([carregarCusteio(), lerInventario([mes])]);
    const insPorNome: Record<string, any> = {};
    Object.values(c.insumos).forEach((i) => { if (!insPorNome[low(i.nome)] || i.ativo) insPorNome[low(i.nome)] = i; });
    const prepPorNome: Record<string, any> = {};
    Object.values(c.preparos).forEach((p) => { prepPorNome[low(p.nome)] = p; });
    const custoSalvo: Record<string, number> = {};
    antes.forEach((x: any) => { custoSalvo[`${x.tipo}|${low(x.nome)}`] = Number(x.custo_unitario) || 0; });

    const agora = new Date().toISOString();
    const novas: any[] = [];
    const vistos: Record<string, boolean> = {};
    (Array.isArray(d.itens) ? d.itens : []).forEach((it) => {
      const nome = String(it?.insumo || "").trim();
      const tipo = low(it?.tipo) === "preparo" ? "preparo" : "insumo";
      const chave = `${tipo}|${low(nome)}`;
      if (!nome || vistos[chave]) return;
      if (it.quantidade === "" || it.quantidade === null || it.quantidade === undefined) return; // não contado
      vistos[chave] = true;
      const qtd = Math.max(num(it.quantidade), 0);
      if (tipo === "preparo") {
        const p = prepPorNome[low(nome)];
        const atual = p ? p.custoPorUnidade : 0;
        novas.push({ mes, tipo, insumo_id: null, preparo_id: p?.id || null, nome: p ? p.nome : nome, unidade: p ? p.unidade : "", quantidade: qtd,
          custo_unitario: !d.atualizarCustos && custoSalvo[chave] > 0 ? custoSalvo[chave] : atual, atualizado_em: agora });
      } else {
        const i = insPorNome[low(nome)];
        if (i && i.tipo === "uso_geral") return; // filme, luva...: fora do CMV
        const atual = i ? i.custo_por_unidade : 0;
        novas.push({ mes, tipo, insumo_id: i?.id || null, preparo_id: null, nome: i ? i.nome : nome, unidade: i ? i.unidade : "", quantidade: qtd,
          custo_unitario: !d.atualizarCustos && custoSalvo[chave] > 0 ? custoSalvo[chave] : atual, atualizado_em: agora });
      }
    });

    const del = await supabase.from("inventario_cmv_itens").delete().eq("mes", mes);
    if (del.error) falha(del.error, "apagar inventário anterior");
    if (novas.length) {
      const ins = await supabase.from("inventario_cmv_itens").insert(novas);
      if (ins.error) falha(ins.error, "gravar inventário");
    }
    const valorTotal = novas.reduce((s, x) => s + x.quantidade * x.custo_unitario, 0);
    return { ok: true, mes, itens: novas.length, valorTotal, atualizadoEm: agoraBR() };
  });
}

/** POST save_cmv_compras_manual: valor vazio remove o valor manual do mês */
export function salvarComprasManual(d: { mes: string; valor: any }) {
  return seguro(async () => {
    const mes = mesValido(d.mes);
    if (!mes) return { ok: false, error: "Mês inválido." };
    const vazio = d.valor === "" || d.valor === null || d.valor === undefined;
    const r = vazio
      ? await supabase.from("cmv_compras_manual").delete().eq("mes", mes)
      : await supabase.from("cmv_compras_manual").upsert({ mes, valor: num(d.valor), atualizado_em: new Date().toISOString() });
    if (r.error) falha(r.error, "compras manuais");
    return { ok: true, mes, valor: vazio ? null : num(d.valor) };
  });
}

// ---------------------------------------------------------------------------
// CMV real do mês
// ---------------------------------------------------------------------------
type Linha = {
  key: string; insumo: string; tipo: "insumo" | "preparo"; unidade: string; preparoId: string | null;
  qtdInicial: number; valorInicial: number; qtdCompras: number; valorCompras: number; qtdFinal: number; valorFinal: number;
  qtdConsumo?: number; valorConsumo?: number; categoria?: string;
};

export function cmvMensal(p: { mes: string; grupos: string[]; soInventariados: boolean }) {
  return seguro(async () => {
    const mes = mesValido(p.mes);
    if (!mes) return { ok: false, error: "Mês inválido." };
    const prox = mesSeguinte(mes);
    const { ini, fim, ultimo } = limitesMes(mes);
    const startStr = `01/${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
    const endStr = `${p2(ultimo)}/${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

    const [c, vinc, invLinhas, comprasR, manualR, vendas, consumoR] = await Promise.all([
      carregarCusteio(),
      carregarVinculos(),
      lerInventario([mes, prox]),
      todas(() => supabase.from("compras").select("id, data, compra_itens(insumo_id, insumo_nome, quantidade, custo_total)").gte("data", ini).lte("data", fim).order("id"), "compras"),
      supabase.from("cmv_compras_manual").select("valor").eq("mes", mes),
      vendasResumo(ini, fim),
      todas(() => supabase.from("consumo_interno").select("id, tipo_pessoa, produto_id, produto_nome, fracao, quantidade").gte("data", ini).lte("data", fim).order("id"), "consumo interno"),
    ]);
    if (manualR.error) falha(manualR.error, "compras manuais");
    const ei = montarInventario(mes, invLinhas);
    const ef = montarInventario(prox, invLinhas);

    const insPorNome: Record<string, string> = {};
    Object.values(c.insumos).forEach((i) => { if (!insPorNome[low(i.nome)] || i.ativo) insPorNome[low(i.nome)] = i.id; });
    const prepPorNome: Record<string, string> = {};
    Object.values(c.preparos).forEach((x) => { prepPorNome[low(x.nome)] = x.id; });
    // chave de um insumo: o id do cadastro; sem cadastro, o nome
    const chaveInsumo = (id: string | null, nome: string) => id || insPorNome[low(nome)] || `nome:${low(nome)}`;
    const chavePreparo = (id: string | null, nome: string) => id || prepPorNome[low(nome)] || null;

    // compras do mês (uso geral nunca entra no CMV)
    type Compra = { key: string; insumo: string; quantidade: number; custoTotal: number };
    let compras: Compra[] = [];
    const usoGeral = { total: 0, insumos: [] as string[] };
    const usoGeralNomes = new Set<string>();
    comprasR.forEach((cp: any) => (cp.compra_itens || []).forEach((it: any) => {
      const key = chaveInsumo(it.insumo_id, it.insumo_nome);
      const cat = c.insumos[key];
      const linha = { key, insumo: cat ? cat.nome : it.insumo_nome, quantidade: Number(it.quantidade) || 0, custoTotal: Number(it.custo_total) || 0 };
      if (cat && cat.tipo === "uso_geral") { usoGeral.total += linha.custoTotal; usoGeralNomes.add(linha.insumo); return; }
      compras.push(linha);
    }));
    usoGeral.insumos = Array.from(usoGeralNomes).sort();

    // opção "só inventariados": só compras de insumos contados (ou que estão dentro de preparos contados)
    const soInventariados = !!p.soInventariados;
    const excluidas = { total: 0, insumos: [] as string[] };
    let escopo: Record<string, boolean> | null = null;
    if (soInventariados) {
      const inventariados: Record<string, boolean> = {};
      escopo = inventariados;
      [...ei.itens, ...ef.itens].forEach((it) => {
        if (it.tipo === "preparo") {
          const pid = chavePreparo(it.preparoId, it.insumo);
          if (pid) insumosDoPreparo(c, pid).forEach((k) => { inventariados[k] = true; });
        } else inventariados[chaveInsumo(it.insumoId, it.insumo)] = true;
      });
      const fora = new Set<string>();
      compras = compras.filter((r) => {
        if (inventariados[r.key]) return true;
        excluidas.total += r.custoTotal;
        fora.add(r.insumo || "(sem insumo)");
        return false;
      });
      excluidas.insumos = Array.from(fora).sort();
    }
    const totalRegistro = compras.reduce((s, r) => s + r.custoTotal, 0);
    const manual = manualR.data?.length ? Number(manualR.data[0].valor) : null;
    const totalCompras = manual !== null ? manual : totalRegistro;

    // receita do mês (só os grupos escolhidos, se houver)
    const grupos = (p.grupos || []).map((g) => g.trim()).filter(Boolean);
    const receita = vendas.reduce((s: number, r: any) => s + (!grupos.length || grupos.includes(r.grupo) ? r.vl_total : 0), 0);

    const completo = ei.existe && ef.existe;
    const cmvReal = completo ? ei.valorTotal + totalCompras - ef.valorTotal : null;
    const cmvPct = cmvReal !== null && receita ? (cmvReal / receita) * 100 : null;

    // consumo real por item: inicial + compras − final
    const porKey: Record<string, Linha> = {};
    const linha = (key: string, nome: string, unidade: string, tipo: "insumo" | "preparo", preparoId: string | null) => {
      const l = (porKey[key] ||= { key, insumo: nome, tipo, unidade: unidade || "", preparoId, qtdInicial: 0, valorInicial: 0, qtdCompras: 0, valorCompras: 0, qtdFinal: 0, valorFinal: 0 });
      if (unidade && !l.unidade) l.unidade = unidade;
      return l;
    };
    const daInv = (it: ItemInv) => {
      if (it.tipo === "preparo") {
        const pid = chavePreparo(it.preparoId, it.insumo);
        return linha(`prep:${pid || low(it.insumo)}`, it.insumo, it.unidade, "preparo", pid);
      }
      const key = chaveInsumo(it.insumoId, it.insumo);
      return linha(key, c.insumos[key]?.nome || it.insumo, it.unidade || c.insumos[key]?.unidade || "", "insumo", null);
    };
    ei.itens.forEach((it) => { const l = daInv(it); l.qtdInicial += it.quantidade; l.valorInicial += it.valor; });
    compras.forEach((r) => { const l = linha(r.key, r.insumo, c.insumos[r.key]?.unidade || "", "insumo", null); l.qtdCompras += r.quantidade; l.valorCompras += r.custoTotal; });
    ef.itens.forEach((it) => { const l = daInv(it); l.qtdFinal += it.quantidade; l.valorFinal += it.valor; });
    let consumoMateriais = 0;
    const insumos = Object.values(porKey).map((l) => {
      l.qtdConsumo = l.qtdInicial + l.qtdCompras - l.qtdFinal;
      l.valorConsumo = l.valorInicial + l.valorCompras - l.valorFinal;
      l.categoria = l.tipo === "preparo" ? "preparo" : c.insumos[l.key]?.tipo || "insumo";
      if (l.categoria === "material") consumoMateriais += l.valorConsumo;
      return l;
    }).sort((a, b) => (b.valorConsumo || 0) - (a.valorConsumo || 0));

    // consumo interno (sócios e funcionários) ao custo das fichas: não é venda, sai do CMV das vendas
    const porNomeProd = indicePorNome(c);
    const precoInterno: Record<string, number> = {};
    const prodR = await supabase.from("produtos").select("id, preco_venda, preco_consumo_interno");
    (prodR.data || []).forEach((x: any) => { precoInterno[x.id] = x.preco_consumo_interno != null ? Number(x.preco_consumo_interno) : Number(x.preco_venda) || 0; });
    const internoPorInsumo: Record<string, number> = {};
    const semFichaInterno = new Set<string>();
    const resumoInterno = (tipo: "funcionario" | "socio") => {
      const acc: Acc = {};
      const prods: Record<string, { produto: string; quantidade: number; ficha: string }> = {};
      let valorDescontado = 0;
      consumoR.filter((x: any) => x.tipo_pessoa === tipo).forEach((x: any) => {
        const nome = String(x.produto_nome || "").trim();
        const q = Number(x.quantidade) || 0;
        const fr = Number(x.fracao) || 1;
        if (!nome || !(q > 0)) return;
        const pid = x.produto_id || produtoDoNome(nome.replace(/^\d+\s*\/\s*\d+\s+|^½\s*/, ""), c, vinc, porNomeProd).id;
        const prod = pid ? c.produtos[pid] : null;
        const temFicha = !!(prod && prod.itens.length);
        const r = (prods[nome] ||= { produto: nome, quantidade: 0, ficha: temFicha ? prod!.nome : "" });
        r.quantidade += q;
        if (!temFicha) semFichaInterno.add(nome);
        else abrirProduto(c, pid!, q * fr, acc);
        if (pid) valorDescontado += q * fr * (precoInterno[pid] || 0);
      });
      let custo = 0;
      Object.keys(acc).forEach((k) => {
        const cat = c.insumos[k];
        if (cat && cat.tipo === "uso_geral") return;
        if (escopo && !escopo[k]) return;
        custo += acc[k].qtd * (cat ? cat.custo_por_unidade : 0);
        internoPorInsumo[k] = (internoPorInsumo[k] || 0) + acc[k].qtd;
      });
      return { custo, produtos: Object.values(prods).sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR")), valorDescontado };
    };
    const colaboradores = resumoInterno("funcionario");
    const socios = resumoInterno("socio");
    const consumoInterno = {
      colaboradores, socios, custo: colaboradores.custo + socios.custo,
      produtosSemFicha: Array.from(semFichaInterno).sort(),
    };
    const cmvVendas = cmvReal !== null ? cmvReal - consumoInterno.custo : null;
    const cmvVendasPct = cmvVendas !== null && receita ? (cmvVendas / receita) * 100 : null;

    // consumo teórico (vendas × fichas) × real (inventário + compras) por insumo
    let consumoComparativo: any = null;
    if (completo) {
      const teorico: Acc = {};
      const vendidos: Record<string, number> = {}; // por nome do produto (ficha)
      const semFicha = new Set<string>();
      const qtdPorNome: Record<string, number> = {};
      vendas.forEach((r: any) => { const k = r.descricao.trim(); if (k) qtdPorNome[k] = (qtdPorNome[k] || 0) + r.qtd; });
      Object.keys(qtdPorNome).forEach((nome) => {
        const q = qtdPorNome[nome];
        const prod = produtoDoNome(nome, c, vinc, porNomeProd);
        if (prod.ignorado) return;
        const pr = prod.id ? c.produtos[prod.id] : null;
        if (!pr || !pr.itens.length) { if (q > 0) semFicha.add(nome); return; }
        vendidos[pr.nome] = (vendidos[pr.nome] || 0) + q;
        abrirProduto(c, pr.id, q, teorico);
      });
      const real: Record<string, number> = {};
      const inventariado: Record<string, boolean> = {};
      insumos.forEach((l) => {
        if (l.tipo === "preparo") {
          if (!l.preparoId) return;
          const adj: Acc = {};
          abrirItem(c, null, l.preparoId, l.qtdConsumo || 0, adj, "");
          Object.keys(adj).forEach((k) => { real[k] = (real[k] || 0) + adj[k].qtd; });
        } else {
          real[l.key] = (real[l.key] || 0) + (l.qtdConsumo || 0);
          if (l.qtdInicial || l.qtdFinal || l.valorInicial || l.valorFinal) inventariado[l.key] = true;
        }
      });
      const linhas: any[] = [];
      const naoInventariados: string[] = [];
      const chaves = new Set([...Object.keys(teorico), ...Object.keys(real), ...Object.keys(internoPorInsumo)]);
      chaves.forEach((k) => {
        const cat = c.insumos[k];
        const nome = cat ? cat.nome : porKey[k]?.insumo || k.replace(/^nome:/, "");
        if (cat && cat.tipo === "uso_geral") return;
        if (!inventariado[k]) { if (teorico[k] && teorico[k].qtd > 0) naoInventariados.push(nome); return; }
        const t = teorico[k] ? teorico[k].qtd : 0;
        const interno = internoPorInsumo[k] || 0;
        const esperado = t + interno;
        const r = real[k] || 0;
        const custo = cat ? cat.custo_por_unidade : 0;
        const l: any = {
          insumo: nome, unidade: cat ? cat.unidade : "", categoria: cat ? cat.tipo || "insumo" : "insumo",
          teorico: t, interno, real: r, diferenca: r - esperado,
          diferencaPct: esperado > 0 ? ((r - esperado) / esperado) * 100 : null,
          valorDiferenca: (r - esperado) * custo,
          produtos: teorico[k] ? Object.keys(teorico[k].origens).sort() : [],
          porcao: null,
        };
        if (l.produtos.length === 1) {
          const v = vendidos[l.produtos[0]] || 0;
          if (v > 0) l.porcao = { produto: l.produtos[0], vendidos: v, esperada: t / v, real: (r - interno) / v };
        }
        linhas.push(l);
      });
      linhas.sort((a, b) => Math.abs(b.valorDiferenca) - Math.abs(a.valorDiferenca));
      consumoComparativo = {
        linhas,
        produtosSemFicha: Array.from(semFicha).sort(),
        insumosNaoInventariados: naoInventariados.sort(),
        produtosVendidos: Object.keys(qtdPorNome).length,
      };
    }

    return {
      ok: true,
      mes, proximoMes: prox,
      consumoComparativo,
      periodo: { start: startStr, end: endStr },
      estoqueInicial: { existe: ei.existe, data: ei.data, valorTotal: ei.valorTotal, itens: ei.itens.length, atualizadoEm: ei.atualizadoEm, semCusto: ei.semCusto },
      estoqueFinal: { existe: ef.existe, data: ef.data, valorTotal: ef.valorTotal, itens: ef.itens.length, atualizadoEm: ef.atualizadoEm, semCusto: ef.semCusto },
      compras: { total: totalCompras, fonte: manual !== null ? "manual" : "registro", totalRegistro, manual, lancamentos: compras.length, soInventariados, excluidas, usoGeral },
      consumoMateriais: completo ? consumoMateriais : null,
      receita, grupos, completo, cmvReal, cmvPct,
      consumoInterno, cmvVendas, cmvVendasPct,
      insumos: completo ? insumos : [],
    };
  });
}
