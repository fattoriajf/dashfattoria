// Aba "Consumo Interno": o que sócios e funcionários consomem (não é venda; entra no CMV separado).
import React, { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import * as dadosConsumo from "./dadosConsumo";

const SOCIOS_PADRAO = ["Eduardo", "Arycarlos", "Beatriz"];
const LS_PESSOA = "fattoria_consumo_pessoa";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dataBR = (s: string) => s.split("-").reverse().join("/");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtdTxt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

type Item = { produtoId: string; fracao: string; quantidade: string };
const itemVazio = (): Item => ({ produtoId: "", fracao: "1", quantidade: "1" });

export default function ConsumoInternoTab() {
  const hoje = new Date();
  const [produtos, setProdutos] = useState<dadosConsumo.ProdutoConsumo[]>([]);
  const [conhecidos, setConhecidos] = useState<{ socios: string[]; funcionarios: string[] }>({ socios: [], funcionarios: [] });

  // lançamento
  const [tipo, setTipo] = useState<dadosConsumo.TipoPessoa>(() => {
    try { return (JSON.parse(localStorage.getItem(LS_PESSOA) || "{}").tipo as dadosConsumo.TipoPessoa) || "socio"; } catch { return "socio"; }
  });
  const [pessoa, setPessoa] = useState<string>(() => {
    try { return JSON.parse(localStorage.getItem(LS_PESSOA) || "{}").pessoa || ""; } catch { return ""; }
  });
  const [data, setData] = useState(iso(hoje));
  const [itens, setItens] = useState<Item[]>([itemVazio()]);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  // histórico
  const [inicio, setInicio] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [fim, setFim] = useState(iso(hoje));
  const [filtroTipo, setFiltroTipo] = useState<"" | dadosConsumo.TipoPessoa>("");
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [linhas, setLinhas] = useState<dadosConsumo.LinhaConsumo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      const [r, p] = await Promise.all([
        dadosConsumo.listarConsumo({ inicio, fim, tipo: filtroTipo }),
        dadosConsumo.pessoasConhecidas(),
      ]);
      setLinhas(r.linhas);
      setProdutos(r.produtos);
      setConhecidos(p);
    } catch (e: any) {
      alert(`Erro ao carregar. ${String(e?.message || e)}`);
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const porCategoria = useMemo(() => {
    const m: Record<string, dadosConsumo.ProdutoConsumo[]> = {};
    produtos.forEach((p) => { (m[p.categoria || "Outros"] ||= []).push(p); });
    return Object.keys(m).sort((a, b) => a.localeCompare(b, "pt-BR")).map((c) => ({ categoria: c, produtos: m[c] }));
  }, [produtos]);
  const produtoPorId = useMemo(() => {
    const m: Record<string, dadosConsumo.ProdutoConsumo> = {};
    produtos.forEach((p) => { m[p.id] = p; });
    return m;
  }, [produtos]);

  const listaPessoas = tipo === "socio"
    ? Array.from(new Set([...SOCIOS_PADRAO, ...conhecidos.socios]))
    : conhecidos.funcionarios;

  const setItem = (i: number, patch: Partial<Item>) => setItens((prev) => prev.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const num = (s: string) => parseFloat(String(s).replace(",", "."));

  const valorLancamento = itens.reduce((s, it) => {
    const p = produtoPorId[it.produtoId];
    return s + (p ? p.precoInterno * num(it.fracao) * (num(it.quantidade) || 0) : 0);
  }, 0);

  const salvar = async () => {
    if (salvando) return;
    if (!pessoa.trim()) { alert(tipo === "socio" ? "Selecione o sócio." : "Informe o nome do funcionário."); return; }
    if (!data) { alert("Selecione a data."); return; }
    const validos = itens.filter((it) => it.produtoId && num(it.quantidade) > 0);
    if (!validos.length) { alert("Adicione pelo menos um produto."); return; }
    if (itens.some((it) => it.produtoId && !(num(it.quantidade) > 0))) { alert("Informe a quantidade de todos os produtos."); return; }
    setSalvando(true);
    try {
      await dadosConsumo.lancarConsumo({
        data, pessoa, tipo, observacao: obs,
        itens: validos.map((it) => ({ produto: produtoPorId[it.produtoId], fracao: num(it.fracao), quantidade: num(it.quantidade) })),
      });
      try { localStorage.setItem(LS_PESSOA, JSON.stringify({ tipo, pessoa: pessoa.trim() })); } catch {}
      setItens([itemVazio()]);
      setObs("");
      await carregar();
    } catch (e: any) {
      alert(`Não foi possível lançar. ${String(e?.message || e)}`);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (l: dadosConsumo.LinhaConsumo) => {
    if (!confirm(`Excluir ${qtdTxt(l.quantidade)}x ${l.produto} de ${l.pessoa} em ${dataBR(l.data)}?`)) return;
    setExcluindo(l.id);
    try {
      await dadosConsumo.excluirConsumo(l.id);
      setLinhas((prev) => prev.filter((x) => x.id !== l.id));
    } catch (e: any) {
      alert(`Não foi possível excluir. ${String(e?.message || e)}`);
    } finally {
      setExcluindo(null);
    }
  };

  const visiveis = filtroPessoa ? linhas.filter((l) => l.pessoa === filtroPessoa) : linhas;
  const pessoasNoPeriodo = Array.from(new Set(linhas.map((l) => l.pessoa))).sort((a, b) => a.localeCompare(b, "pt-BR"));

  // resumo por pessoa: produtos (meia pizza conta 0,5) e valor pelo preço interno
  const resumo = useMemo(() => {
    const m: Record<string, { pessoa: string; tipo: string; valor: number; itens: Record<string, number>; semProduto: number }> = {};
    visiveis.forEach((l) => {
      const r = (m[l.pessoa] ||= { pessoa: l.pessoa, tipo: l.tipo, valor: 0, itens: {}, semProduto: 0 });
      const nome = l.produtoId && produtoPorId[l.produtoId] ? produtoPorId[l.produtoId].nome : l.produto;
      r.itens[nome] = (r.itens[nome] || 0) + l.quantidade * l.fracao;
      r.valor += l.valor;
      if (!l.produtoId) r.semProduto++;
    });
    return Object.values(m).sort((a, b) => a.pessoa.localeCompare(b.pessoa, "pt-BR"));
  }, [visiveis, produtoPorId]);
  const totalValor = visiveis.reduce((s, l) => s + l.valor, 0);
  const semVinculo = visiveis.filter((l) => !l.produtoId).length;

  return (
    <div className="space-y-6">
      {/* Lançamento */}
      <div className="border rounded-xl p-4 bg-white space-y-3">
        <h3 className="font-semibold text-base">Lançar consumo</h3>
        <div className="flex gap-2">
          {(["socio", "funcionario"] as const).map((t) => (
            <button key={t} className={`btn text-sm ${tipo === t ? "btn-primary" : "btn-ghost"}`}
              onClick={() => { setTipo(t); setPessoa(""); }}>
              {t === "socio" ? "Sócio" : "Funcionário"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">{tipo === "socio" ? "Sócio" : "Funcionário"}</label>
            {tipo === "socio" ? (
              <select className="input w-full" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
                <option value="">Selecione</option>
                {listaPessoas.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <>
                <input className="input w-full" list="consumo-funcionarios" value={pessoa} onChange={(e) => setPessoa(e.target.value)} placeholder="Nome do funcionário" />
                <datalist id="consumo-funcionarios">
                  {listaPessoas.map((s) => <option key={s} value={s} />)}
                </datalist>
              </>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data</label>
            <input type="date" className="input w-full" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">Produtos</div>
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setItens((p) => [...p, itemVazio()])}>+ Adicionar produto</button>
          </div>
          {itens.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-6">
                <label className="text-xs text-gray-600 block mb-1">Produto</label>
                <select className="input w-full" value={it.produtoId} onChange={(e) => setItem(i, { produtoId: e.target.value })}>
                  <option value="">Selecione</option>
                  {porCategoria.map((g) => (
                    <optgroup key={g.categoria} label={g.categoria}>
                      {g.produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="col-span-5 sm:col-span-3">
                <label className="text-xs text-gray-600 block mb-1">Porção</label>
                <select className="input w-full" value={it.fracao} onChange={(e) => setItem(i, { fracao: e.target.value })}>
                  <option value="1">Inteira</option>
                  <option value="0.5">Meia (1/2)</option>
                </select>
              </div>
              <div className="col-span-5 sm:col-span-2">
                <label className="text-xs text-gray-600 block mb-1">Qtd.</label>
                <input type="number" min={1} step={1} inputMode="numeric" className="input w-full" value={it.quantidade} onChange={(e) => setItem(i, { quantidade: e.target.value })} />
              </div>
              <div className="col-span-2 sm:col-span-1 pb-2 text-center">
                {itens.length > 1 && (
                  <button type="button" className="text-red-500" title="Remover" onClick={() => setItens((p) => p.filter((_, k) => k !== i))}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {valorLancamento > 0 && <div className="text-xs text-gray-500">Valor pelo preço interno: {brl(valorLancamento)}</div>}
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Observação (opcional)</label>
          <input className="input w-full" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: jantar com a família" />
        </div>
        <button className="btn btn-primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Lançar consumo"}</button>
      </div>

      {/* Histórico */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h3 className="font-semibold text-base">Consumo no período</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-600 block">De</label>
            <input type="date" className="input" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600 block">Até</label>
            <input type="date" className="input" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600 block">Quem</label>
            <select className="input" value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value as any); setFiltroPessoa(""); }}>
              <option value="">Sócios e funcionários</option>
              <option value="socio">Só sócios</option>
              <option value="funcionario">Só funcionários</option>
            </select>
          </div>
          <button className="btn btn-primary text-sm" onClick={carregar} disabled={carregando}>{carregando ? "Carregando..." : "Filtrar"}</button>
          {pessoasNoPeriodo.length > 1 && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600 block">Pessoa</label>
              <select className="input" value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)}>
                <option value="">Todas</option>
                {pessoasNoPeriodo.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
        </div>

        {!carregando && visiveis.length === 0 && <div className="text-sm text-gray-500">Nenhum consumo lançado nesse período.</div>}

        {resumo.length > 0 && (
          <>
            <div className="text-sm text-gray-700">Total no período pelo preço interno: <b>{brl(totalValor)}</b></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {resumo.map((r) => (
                <div key={r.pessoa} className="border rounded-xl p-3 bg-gray-50">
                  <div className="flex justify-between gap-2 mb-1">
                    <span className="font-semibold text-sm">{r.pessoa}</span>
                    <span className="text-xs text-gray-500">{r.tipo === "socio" ? "sócio" : "funcionário"}</span>
                  </div>
                  <ul className="text-sm space-y-0.5">
                    {Object.keys(r.itens).sort((a, b) => a.localeCompare(b, "pt-BR")).map((n) => (
                      <li key={n} className="flex justify-between gap-2"><span>{n}</span><span className="font-medium">{qtdTxt(r.itens[n])}</span></li>
                    ))}
                  </ul>
                  <div className="text-xs text-gray-600 mt-2">Valor: <b>{brl(r.valor)}</b></div>
                </div>
              ))}
            </div>
            {semVinculo > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ {semVinculo} lançamento(s) antigo(s) com produto que não está ligado a nenhuma ficha (ficam fora do CMV e do valor).
                Ligue esses nomes na aba Vendas (Colibri) → Vincular produtos.
              </div>
            )}
          </>
        )}

        {visiveis.length > 0 && (
          <div className="overflow-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left">Data</th>
                  <th className="border px-3 py-2 text-left">Pessoa</th>
                  <th className="border px-3 py-2 text-left">Produto</th>
                  <th className="border px-3 py-2 text-right">Qtd.</th>
                  <th className="border px-3 py-2 text-right">Valor</th>
                  <th className="border px-3 py-2 text-left">Observação</th>
                  <th className="border px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.id} className={l.produtoId ? "" : "bg-amber-50"}>
                    <td className="border px-3 py-2 whitespace-nowrap">{dataBR(l.data)}</td>
                    <td className="border px-3 py-2">{l.pessoa}</td>
                    <td className="border px-3 py-2">{l.produto}</td>
                    <td className="border px-3 py-2 text-right">{qtdTxt(l.quantidade)}</td>
                    <td className="border px-3 py-2 text-right">{l.produtoId ? brl(l.valor) : "—"}</td>
                    <td className="border px-3 py-2 text-gray-600">{l.observacao}</td>
                    <td className="border px-3 py-2 text-center">
                      <button className="text-xs text-red-500 hover:underline" onClick={() => excluir(l)} disabled={excluindo === l.id}>
                        {excluindo === l.id ? "..." : "Excluir"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
