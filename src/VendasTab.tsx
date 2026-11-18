// Aba "Vendas": importar o Excel do Colibri e ligar os nomes do Colibri aos produtos (fichas técnicas).
import React, { useEffect, useMemo, useState } from "react";
import * as dadosVendas from "./dadosVendas";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function ImportarVendas({ aoImportar }: { aoImportar: () => void }) {
  const [lido, setLido] = useState<{ arquivo: File; linhas: dadosVendas.LinhaVenda[]; inicio: string; fim: string; ignoradas: number } | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [msg, setMsg] = useState("");
  const [historico, setHistorico] = useState<any[]>([]);

  const carregarHistorico = () => dadosVendas.ultimasImportacoes().then(setHistorico).catch(() => {});
  useEffect(() => { carregarHistorico(); }, []);

  const escolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMsg(""); setLido(null); setLendo(true);
    try {
      const r = await dadosVendas.lerExcelColibri(f);
      setLido({ arquivo: f, ...r });
    } catch (err: any) {
      setMsg("❌ " + (err?.message || err));
    } finally {
      setLendo(false);
    }
  };

  const resumo = useMemo(() => {
    if (!lido) return null;
    let fat = 0, itens = 0;
    lido.linhas.forEach((l) => { fat += l.vl_total; itens += l.qtd; });
    return { fat, itens };
  }, [lido]);

  const gravar = async () => {
    if (!lido) return;
    if (!confirm(`As vendas de ${dataBR(lido.inicio)} a ${dataBR(lido.fim)} que já estão no sistema serão substituídas pelas deste arquivo. Continuar?`)) return;
    setGravando(true); setMsg("");
    try {
      const r = await dadosVendas.importarVendas(lido.arquivo.name, lido, (feitas, total) =>
        setProgresso(`Gravando ${feitas.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} linhas...`));
      setMsg(`✅ ${lido.linhas.length.toLocaleString("pt-BR")} vendas importadas (${dataBR(lido.inicio)} a ${dataBR(lido.fim)}).` +
        (r.apagadas ? ` ${r.apagadas.toLocaleString("pt-BR")} linhas antigas do mesmo período foram substituídas.` : ""));
      setLido(null);
      carregarHistorico();
      aoImportar();
    } catch (err: any) {
      setMsg("❌ " + (err?.message || err) + " — importe o arquivo de novo (o período é substituído, não duplica).");
    } finally {
      setGravando(false); setProgresso("");
    }
  };

  return (
    <div className="border rounded-xl p-4 bg-white space-y-4">
      <div>
        <div className="font-semibold text-base">Importar vendas do Colibri</div>
        <div className="text-sm text-gray-600">
          Exporte o relatório "Vendas em Grid" em Excel e escolha o arquivo aqui. Pode ser só a última semana ou o histórico inteiro:
          os dias que estiverem no arquivo substituem o que já existe, então nada fica duplicado.
        </div>
      </div>
      <label className="btn btn-primary text-sm inline-block cursor-pointer">
        {lendo ? "Lendo arquivo..." : "Escolher arquivo .xlsx"}
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={escolher} disabled={lendo || gravando} />
      </label>

      {lido && resumo && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Arquivo:</span> {lido.arquivo.name}</div>
            <div><span className="text-gray-500">Período:</span> {dataBR(lido.inicio)} a {dataBR(lido.fim)}</div>
            <div><span className="text-gray-500">Linhas:</span> {lido.linhas.length.toLocaleString("pt-BR")}{lido.ignoradas ? ` (${lido.ignoradas} sem data ou produto ignoradas)` : ""}</div>
            <div><span className="text-gray-500">Faturamento:</span> {brl(resumo.fat)}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary text-sm" onClick={gravar} disabled={gravando}>{gravando ? "Gravando..." : "Gravar no sistema"}</button>
            <button className="btn btn-ghost text-sm" onClick={() => setLido(null)} disabled={gravando}>Cancelar</button>
          </div>
        </div>
      )}
      {progresso && <div className="text-sm text-gray-600">{progresso}</div>}
      {msg && <div className="text-sm">{msg}</div>}

      {historico.length > 0 && (
        <div className="overflow-auto">
          <div className="text-xs text-gray-500 mb-1">Últimas importações</div>
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr><th className="border px-3 py-1 text-left">Quando</th><th className="border px-3 py-1 text-left">Arquivo</th><th className="border px-3 py-1 text-left">Período</th><th className="border px-3 py-1 text-right">Linhas</th></tr>
            </thead>
            <tbody>
              {historico.map((h, i) => (
                <tr key={i}>
                  <td className="border px-3 py-1">{new Date(h.importado_em).toLocaleString("pt-BR")}</td>
                  <td className="border px-3 py-1">{h.arquivo}</td>
                  <td className="border px-3 py-1">{dataBR(h.data_inicio)} a {dataBR(h.data_fim)}</td>
                  <td className="border px-3 py-1 text-right">{Number(h.linhas).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Dados = Awaited<ReturnType<typeof dadosVendas.carregarVinculos>>;

function VincularProdutos({ recarregar }: { recarregar: number }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState("");
  const [busca, setBusca] = useState("");
  const [verResolvidos, setVerResolvidos] = useState(false);

  const carregar = () => {
    setErro("");
    dadosVendas.carregarVinculos().then(setDados).catch((e) => setErro(String(e?.message || e)));
  };
  useEffect(carregar, [recarregar]);

  const nomeProduto = useMemo(() => {
    const m: Record<string, string> = {};
    (dados?.produtos || []).forEach((p) => { m[p.id] = p.nome; });
    return m;
  }, [dados]);

  const filtra = <T extends { nome: string; grupo: string }>(l: T[]) => {
    const b = busca.trim().toUpperCase();
    return b ? l.filter((x) => x.nome.includes(b) || x.grupo.toUpperCase().includes(b)) : l;
  };

  const salvar = async (nome: string, ignorar: boolean) => {
    const produtoId = escolha[nome] || null;
    if (!ignorar && !produtoId) { alert("Escolha o produto primeiro."); return; }
    setSalvando(nome);
    try {
      await dadosVendas.salvarVinculo(nome, produtoId, ignorar);
      carregar();
    } catch (e: any) {
      alert(e?.message || e);
    } finally {
      setSalvando("");
    }
  };

  const desfazer = async (nome: string) => {
    if (!confirm(`Desfazer o vínculo de "${nome}"? Ele volta para a lista de pendentes.`)) return;
    try { await dadosVendas.removerVinculo(nome); carregar(); } catch (e: any) { alert(e?.message || e); }
  };

  if (erro) return <div className="text-sm text-red-600">{erro}</div>;
  if (!dados) return <div className="text-sm text-gray-500">Carregando vínculos...</div>;

  const pendentes = filtra(dados.pendentes);
  const resolvidos = filtra(dados.resolvidos);

  return (
    <div className="border rounded-xl p-4 bg-white space-y-4">
      <div>
        <div className="font-semibold text-base">Vincular produtos do Colibri</div>
        <div className="text-sm text-gray-600">
          Cada nome que aparece nas vendas (ou no consumo interno antigo) precisa estar ligado a um produto com ficha técnica, para entrar no CMV.
          Itens que não usam insumos (serviço, embalagem, couvert...) marque como <b>Ignorar</b>. Nomes iguais ao do produto já são ligados sozinhos.
          Meia pizza ("1/2") não precisa de vínculo próprio: o Colibri já manda 0,5 do produto.
        </div>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <input className="input" placeholder="Buscar nome ou grupo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="text-sm text-gray-600">{dados.pendentes.length} pendentes · {dados.resolvidos.length} resolvidos</span>
      </div>

      {pendentes.length === 0 ? (
        <div className="text-sm text-gray-600">Nenhum nome pendente. ✅</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Nome no Colibri</th>
                <th className="border px-3 py-2 text-left">Grupo</th>
                <th className="border px-3 py-2 text-right">Qtd</th>
                <th className="border px-3 py-2 text-right">Faturamento</th>
                <th className="border px-3 py-2 text-left">Produto</th>
                <th className="border px-3 py-2 text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map((p) => (
                <tr key={p.nome}>
                  <td className="border px-3 py-2">{p.nome}</td>
                  <td className="border px-3 py-2">{p.grupo}</td>
                  <td className="border px-3 py-2 text-right">{p.qtd.toLocaleString("pt-BR")}</td>
                  <td className="border px-3 py-2 text-right">{p.origem === "vendas" ? brl(p.faturamento) : "—"}</td>
                  <td className="border px-3 py-2">
                    <select className="input w-full" value={escolha[p.nome] || ""} onChange={(e) => setEscolha({ ...escolha, [p.nome]: e.target.value })}>
                      <option value="">Escolher produto...</option>
                      {dados.produtos.map((pr) => (
                        <option key={pr.id} value={pr.id}>{pr.nome}{pr.categoria ? ` (${pr.categoria})` : ""}</option>
                      ))}
                    </select>
                  </td>
                  <td className="border px-3 py-2 text-center">
                    <div className="flex gap-2 justify-center">
                      <button className="btn btn-primary text-xs" disabled={salvando === p.nome} onClick={() => salvar(p.nome, false)}>Ligar</button>
                      <button className="btn btn-ghost text-xs" disabled={salvando === p.nome} onClick={() => salvar(p.nome, true)}>Ignorar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button className="btn btn-ghost text-sm" onClick={() => setVerResolvidos(!verResolvidos)}>
        {verResolvidos ? "Esconder" : "Ver"} nomes já resolvidos ({dados.resolvidos.length})
      </button>
      {verResolvidos && (
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Nome no Colibri</th>
                <th className="border px-3 py-2 text-left">Ligado a</th>
                <th className="border px-3 py-2 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {resolvidos.map((r) => (
                <tr key={r.nome}>
                  <td className="border px-3 py-2">{r.nome}</td>
                  <td className="border px-3 py-2">
                    {r.vinculo.ignorar ? <span className="text-gray-500">Ignorado</span> : (nomeProduto[r.vinculo.produto_id || ""] || "?")}
                    {r.automatico && <span className="text-xs text-gray-400"> (mesmo nome)</span>}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    {!r.automatico && <button className="text-xs text-red-500 hover:underline" onClick={() => desfazer(r.nome)}>Desfazer</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function VendasTab() {
  const [recarregar, setRecarregar] = useState(0);
  return (
    <div className="space-y-6">
      <ImportarVendas aoImportar={() => setRecarregar((n) => n + 1)} />
      <VincularProdutos recarregar={recarregar} />
    </div>
  );
}
