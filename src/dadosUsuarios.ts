// Usuários, perfis de acesso e troca de senha (Supabase).
import { supabase } from "./supabase";

function erro(e: any, onde: string): never {
  throw new Error(`${onde}: ${e?.message || e}`);
}

/** Abas que podem ser liberadas num perfil (chave = id da aba em minúsculas, como nas regras do banco) */
export const ABAS_DISPONIVEIS: { id: string; nome: string; grupo: string }[] = [
  { id: "etiquetas", nome: "Etiquetas", grupo: "Inventário" },
  { id: "estoque", nome: "Compras de Estoque", grupo: "Inventário" },
  { id: "insumos", nome: "Insumos", grupo: "Inventário" },
  { id: "compras", nome: "Registro de Compras", grupo: "Inventário" },
  { id: "fichatecnica", nome: "Ficha Técnica", grupo: "Inventário" },
  { id: "caixa", nome: "Caixa", grupo: "Financeiro" },
  { id: "consumosocios", nome: "Consumo Interno", grupo: "Financeiro" },
  { id: "cmv", nome: "CMV", grupo: "Financeiro" },
  { id: "markup", nome: "Markup", grupo: "Financeiro" },
  { id: "vendas", nome: "Vendas (Colibri)", grupo: "Indicadores" },
  { id: "dashboard", nome: "Dashboard", grupo: "Indicadores" },
  { id: "graficos", nome: "Gráficos", grupo: "Indicadores" },
];

export type UsuarioLogin = {
  id: string;
  email: string;
  criado_em: string;
  ultimo_acesso: string | null;
  nome: string | null;   // null = login sem acesso ao sistema
  perfil: string | null;
  ativo: boolean | null;
};

export type Perfil = { id: string; nome: string; abas: string[] };

export async function listarUsuarios(): Promise<UsuarioLogin[]> {
  const { data, error } = await supabase.rpc("admin_usuarios");
  if (error) erro(error, "carregar usuários");
  return (data || []) as UsuarioLogin[];
}

export async function listarPerfis(): Promise<Perfil[]> {
  const [p, a] = await Promise.all([
    supabase.from("perfis").select("id, nome").order("nome"),
    supabase.from("perfil_abas").select("perfil_id, aba"),
  ]);
  if (p.error) erro(p.error, "carregar perfis");
  if (a.error) erro(a.error, "carregar perfis");
  const abas: Record<string, string[]> = {};
  (a.data || []).forEach((r: { perfil_id: string; aba: string }) => { (abas[r.perfil_id] = abas[r.perfil_id] || []).push(r.aba); });
  return (p.data || []).map((r: { id: string; nome: string }) => ({ id: r.id, nome: r.nome, abas: abas[r.id] || [] }));
}

/** Liga um login a um perfil (também serve para "dar acesso" a um login que ainda não tem) */
export async function salvarUsuario(id: string, dados: { nome: string; perfil: string; ativo: boolean }) {
  const nome = dados.nome.trim();
  if (!nome) throw new Error("Preencha o nome.");
  if (!dados.perfil) throw new Error("Escolha o perfil.");
  const { error } = await supabase.from("usuarios").upsert({ id, nome, perfil_id: dados.perfil, ativo: dados.ativo });
  if (error) erro(error, "salvar usuário");
}

async function chamarAdmin(corpo: Record<string, unknown>, onde: string) {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", { body: corpo });
  if (error) erro(error, onde);
  if (!data?.ok) throw new Error(data?.error || `${onde}: erro desconhecido`);
  return data;
}

export async function criarUsuario(p: { nome: string; email: string; senha: string; perfil: string }) {
  return chamarAdmin({ acao: "criar", ...p }, "criar usuário");
}

/** Sócio define uma senha nova para outra pessoa (ex.: quando ela esquece) */
export async function definirSenha(id: string, senha: string) {
  return chamarAdmin({ acao: "senha", id, senha }, "trocar senha");
}

function idDoNome(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export async function criarPerfil(nome: string, existentes: Perfil[]): Promise<string> {
  const n = nome.trim();
  if (!n) throw new Error("Dê um nome ao perfil.");
  if (existentes.some((p) => p.nome.trim().toLowerCase() === n.toLowerCase())) throw new Error("Já existe um perfil com esse nome.");
  const base = idDoNome(n) || "perfil";
  let id = base, i = 2;
  while (existentes.some((p) => p.id === id)) id = `${base}_${i++}`;
  const { error } = await supabase.from("perfis").insert({ id, nome: n });
  if (error) erro(error, "criar perfil");
  return id;
}

export async function salvarAbasPerfil(perfilId: string, abas: string[]) {
  if (perfilId === "socio") throw new Error("O perfil Sócio tem acesso a tudo e não pode ser alterado.");
  const del = await supabase.from("perfil_abas").delete().eq("perfil_id", perfilId);
  if (del.error) erro(del.error, "salvar perfil");
  if (abas.length) {
    const ins = await supabase.from("perfil_abas").insert(abas.map((aba) => ({ perfil_id: perfilId, aba })));
    if (ins.error) erro(ins.error, "salvar perfil");
  }
}

export async function excluirPerfil(perfilId: string, usuarios: UsuarioLogin[]) {
  if (perfilId === "socio") throw new Error("O perfil Sócio não pode ser excluído.");
  const usando = usuarios.filter((u) => u.perfil === perfilId).map((u) => u.nome);
  if (usando.length) throw new Error(`Esse perfil está em uso por: ${usando.join(", ")}. Troque o perfil dessas pessoas antes.`);
  const { error } = await supabase.from("perfis").delete().eq("id", perfilId);
  if (error) erro(error, "excluir perfil");
}

/** Quem está logado troca a própria senha (confere a senha atual antes) */
export async function trocarMinhaSenha(atual: string, nova: string) {
  if (nova.length < 6) throw new Error("A senha nova precisa ter pelo menos 6 caracteres.");
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email;
  if (!email) throw new Error("Sessão expirada. Entre de novo.");
  const conf = await supabase.auth.signInWithPassword({ email, password: atual });
  if (conf.error) throw new Error("A senha atual está incorreta.");
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) erro(error, "trocar senha");
}
