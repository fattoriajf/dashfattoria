// Aba "Usuários e acessos" (só sócios) + janela "Trocar minha senha" (todos).
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import * as dadosUsuarios from "./dadosUsuarios";
import type { Perfil, UsuarioLogin } from "./dadosUsuarios";

const dataHoraBR = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca");

/** Janela para quem está logado trocar a própria senha */
export function TrocarSenhaModal({ aoFechar }: { aoFechar: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetir, setRepetir] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (nova !== repetir) { setMsg("A senha nova e a repetição não são iguais."); return; }
    setSalvando(true);
    try {
      await dadosUsuarios.trocarMinhaSenha(atual, nova);
      setOk(true);
    } catch (err: any) {
      setMsg(err?.message || String(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={aoFechar}>
      <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold text-base">Trocar minha senha</div>
        {ok ? (
          <>
            <div className="text-sm">✅ Senha trocada. Use a nova senha no próximo login.</div>
            <button className="btn btn-primary text-sm w-full" onClick={aoFechar}>Fechar</button>
          </>
        ) : (
          <form onSubmit={salvar} className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Senha atual</label>
              <input className="input w-full" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600">Senha nova (mínimo 6 caracteres)</label>
              <input className="input w-full" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600">Repita a senha nova</label>
              <input className="input w-full" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
            </div>
            {msg && <div className="text-sm text-red-600">{msg}</div>}
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary text-sm flex-1" disabled={salvando || !atual || !nova}>{salvando ? "Salvando..." : "Trocar senha"}</button>
              <button type="button" className="btn btn-ghost text-sm" onClick={aoFechar} disabled={salvando}>Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

type Edicao = { nome: string; perfil: string; ativo: boolean };

function ListaUsuarios({ usuarios, perfis, meuId, recarregar }: { usuarios: UsuarioLogin[]; perfis: Perfil[]; meuId: string; recarregar: () => void }) {
  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>({});
  const [salvando, setSalvando] = useState("");

  const valor = (u: UsuarioLogin): Edicao => edicoes[u.id] || { nome: u.nome || "", perfil: u.perfil || "", ativo: u.ativo ?? true };
  const mudou = (u: UsuarioLogin) => {
    const e = edicoes[u.id];
    return !!e && (e.nome !== (u.nome || "") || e.perfil !== (u.perfil || "") || e.ativo !== (u.ativo ?? true) || u.nome === null);
  };
  const editar = (u: UsuarioLogin, patch: Partial<Edicao>) => setEdicoes((s) => ({ ...s, [u.id]: { ...valor(u), ...patch } }));

  const salvar = async (u: UsuarioLogin) => {
    setSalvando(u.id);
    try {
      await dadosUsuarios.salvarUsuario(u.id, valor(u));
      setEdicoes((s) => { const n = { ...s }; delete n[u.id]; return n; });
      recarregar();
    } catch (e: any) {
      alert(e?.message || e);
    } finally {
      setSalvando("");
    }
  };

  const novaSenha = async (u: UsuarioLogin) => {
    const senha = prompt(`Nova senha para ${u.nome || u.email} (mínimo 6 caracteres).\nDepois passe a senha para a pessoa pessoalmente ou por WhatsApp.`);
    if (senha === null) return;
    setSalvando(u.id);
    try {
      await dadosUsuarios.definirSenha(u.id, senha);
      alert("✅ Senha definida.");
    } catch (e: any) {
      alert(e?.message || e);
    } finally {
      setSalvando("");
    }
  };

  return (
    <div className="overflow-auto">
      <table className="min-w-full border text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-3 py-2 text-left">Nome</th>
            <th className="border px-3 py-2 text-left">E-mail (login)</th>
            <th className="border px-3 py-2 text-left">Perfil</th>
            <th className="border px-3 py-2 text-center">Ativo</th>
            <th className="border px-3 py-2 text-left">Último acesso</th>
            <th className="border px-3 py-2 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const v = valor(u);
            const eu = u.id === meuId;
            const semAcesso = u.nome === null;
            return (
              <tr key={u.id} className={semAcesso ? "bg-amber-50" : !v.ativo ? "text-gray-400" : ""}>
                <td className="border px-3 py-2">
                  <input className="input w-full" value={v.nome} placeholder={semAcesso ? "Nome" : ""} onChange={(e) => editar(u, { nome: e.target.value })} />
                </td>
                <td className="border px-3 py-2">{u.email}{eu && <span className="text-xs text-gray-500"> (você)</span>}</td>
                <td className="border px-3 py-2">
                  <select className="input w-full" value={v.perfil} disabled={eu} onChange={(e) => editar(u, { perfil: e.target.value })}>
                    <option value="">{semAcesso ? "— sem acesso —" : "Escolha"}</option>
                    {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </td>
                <td className="border px-3 py-2 text-center">
                  <input type="checkbox" checked={v.ativo} disabled={eu || semAcesso} onChange={(e) => editar(u, { ativo: e.target.checked })} />
                </td>
                <td className="border px-3 py-2 whitespace-nowrap">{dataHoraBR(u.ultimo_acesso)}</td>
                <td className="border px-3 py-2 text-center whitespace-nowrap space-x-1">
                  {mudou(u) && (
                    <button className="btn btn-primary text-xs" disabled={salvando === u.id} onClick={() => salvar(u)}>
                      {semAcesso ? "Dar acesso" : "Salvar"}
                    </button>
                  )}
                  {!eu && (
                    <button className="btn btn-ghost text-xs" disabled={salvando === u.id} onClick={() => novaSenha(u)}>Definir senha</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-xs text-gray-500 mt-1">
        Desmarcar <b>Ativo</b> bloqueia a entrada da pessoa no sistema (o histórico dela continua). Linhas amarelas são logins que ainda não têm acesso.
      </div>
    </div>
  );
}

function NovoUsuario({ perfis, recarregar }: { perfis: Perfil[]; recarregar: () => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true); setMsg("");
    try {
      await dadosUsuarios.criarUsuario({ nome: nome.trim(), email: email.trim(), senha, perfil });
      setMsg(`✅ ${nome.trim()} criado. Passe o e-mail e a senha para a pessoa pessoalmente ou por WhatsApp; ela pode trocar a senha depois em "Trocar senha".`);
      setNome(""); setEmail(""); setSenha(""); setPerfil("");
      recarregar();
    } catch (err: any) {
      setMsg("❌ " + (err?.message || err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={criar} className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input className="input" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input className="input" placeholder="E-mail" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" placeholder="Senha provisória (mín. 6)" type="text" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} />
        <select className="input" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
          <option value="">Perfil de acesso</option>
          {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <button type="submit" className="btn btn-primary text-sm" disabled={salvando || !nome.trim() || !email.trim() || !senha || !perfil}>
        {salvando ? "Criando..." : "Criar usuário"}
      </button>
      {msg && <div className="text-sm">{msg}</div>}
    </form>
  );
}

function Perfis({ perfis, usuarios, recarregar }: { perfis: Perfil[]; usuarios: UsuarioLogin[]; recarregar: () => void }) {
  const [marcadas, setMarcadas] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState("");
  const [novoNome, setNovoNome] = useState("");

  const grupos = useMemo(() => {
    const g: Record<string, typeof dadosUsuarios.ABAS_DISPONIVEIS> = {};
    dadosUsuarios.ABAS_DISPONIVEIS.forEach((a) => { (g[a.grupo] = g[a.grupo] || []).push(a); });
    return Object.entries(g);
  }, []);

  const abasDe = (p: Perfil) => marcadas[p.id] || p.abas;
  const mudou = (p: Perfil) => !!marcadas[p.id] && [...marcadas[p.id]].sort().join() !== [...p.abas].sort().join();
  const alternar = (p: Perfil, aba: string) => {
    const atual = abasDe(p);
    setMarcadas((s) => ({ ...s, [p.id]: atual.includes(aba) ? atual.filter((a) => a !== aba) : [...atual, aba] }));
  };

  const salvar = async (p: Perfil) => {
    setSalvando(p.id);
    try {
      await dadosUsuarios.salvarAbasPerfil(p.id, abasDe(p));
      setMarcadas((s) => { const n = { ...s }; delete n[p.id]; return n; });
      recarregar();
    } catch (e: any) {
      alert(e?.message || e);
    } finally {
      setSalvando("");
    }
  };

  const excluir = async (p: Perfil) => {
    if (!confirm(`Excluir o perfil "${p.nome}"?`)) return;
    try { await dadosUsuarios.excluirPerfil(p.id, usuarios); recarregar(); } catch (e: any) { alert(e?.message || e); }
  };

  const criar = async () => {
    try {
      await dadosUsuarios.criarPerfil(novoNome, perfis);
      setNovoNome("");
      recarregar();
    } catch (e: any) {
      alert(e?.message || e);
    }
  };

  const qtdUsuarios = (id: string) => usuarios.filter((u) => u.perfil === id && u.ativo).length;

  return (
    <div className="space-y-3">
      {perfis.map((p) => (
        <div key={p.id} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="font-semibold">{p.nome} <span className="text-xs text-gray-500 font-normal">· {qtdUsuarios(p.id)} usuário(s) ativo(s)</span></div>
            {p.id !== "socio" && (
              <div className="space-x-1">
                {mudou(p) && <button className="btn btn-primary text-xs" disabled={salvando === p.id} onClick={() => salvar(p)}>{salvando === p.id ? "Salvando..." : "Salvar"}</button>}
                <button className="btn btn-ghost text-xs" onClick={() => excluir(p)}>Excluir</button>
              </div>
            )}
          </div>
          {p.abas.includes("*") ? (
            <div className="text-sm text-gray-600">Acesso total: todas as abas, inclusive esta tela de usuários.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {grupos.map(([grupo, abas]) => (
                <div key={grupo}>
                  <div className="text-xs text-gray-500 mb-1">{grupo}</div>
                  {abas.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={abasDe(p).includes(a.id)} onChange={() => alternar(p, a.id)} />
                      {a.nome}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2 items-center flex-wrap">
        <input className="input" placeholder="Nome do novo perfil (ex.: Gerente)" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
        <button className="btn btn-ghost text-sm" onClick={criar} disabled={!novoNome.trim()}>Criar perfil</button>
      </div>
    </div>
  );
}

export default function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<UsuarioLogin[] | null>(null);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [meuId, setMeuId] = useState("");
  const [erro, setErro] = useState("");

  const carregar = () => {
    setErro("");
    Promise.all([dadosUsuarios.listarUsuarios(), dadosUsuarios.listarPerfis()])
      .then(([u, p]) => { setUsuarios(u); setPerfis(p); })
      .catch((e) => setErro(String(e?.message || e)));
  };
  useEffect(() => {
    carregar();
    supabase.auth.getUser().then(({ data }: any) => setMeuId(data?.user?.id || ""));
  }, []);

  if (erro) return <div className="text-sm text-red-600">{erro}</div>;
  if (!usuarios) return <div className="text-sm text-gray-500">Carregando usuários...</div>;

  return (
    <div className="space-y-4">
      <div className="border rounded-xl p-4 bg-white space-y-3">
        <div className="font-semibold text-base">Usuários</div>
        <ListaUsuarios usuarios={usuarios} perfis={perfis} meuId={meuId} recarregar={carregar} />
      </div>
      <div className="border rounded-xl p-4 bg-white space-y-3">
        <div>
          <div className="font-semibold text-base">Novo usuário</div>
          <div className="text-sm text-gray-600">Cada pessoa entra com o próprio e-mail. A senha provisória você passa pessoalmente; depois ela troca em "Trocar senha", no topo da tela.</div>
        </div>
        <NovoUsuario perfis={perfis} recarregar={carregar} />
      </div>
      <div className="border rounded-xl p-4 bg-white space-y-3">
        <div>
          <div className="font-semibold text-base">Perfis de acesso</div>
          <div className="text-sm text-gray-600">Marque as abas que cada perfil pode abrir. A mudança vale para todos os usuários do perfil no próximo login (ou ao recarregar a página).</div>
        </div>
        <Perfis perfis={perfis} usuarios={usuarios} recarregar={carregar} />
      </div>
    </div>
  );
}
