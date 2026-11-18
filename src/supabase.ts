import { createClient } from "@supabase/supabase-js";

// Projeto Supabase da Fattoria. A chave "publishable" é pública por natureza:
// o que cada usuário pode ver/alterar é decidido pelas regras de segurança (RLS) do banco.
export const SUPABASE_URL = "https://iwqkrxgoggrcnmjratap.supabase.co";
export const SUPABASE_KEY = "sb_publishable_DxvXYNc9tK_pa_cTknVesw_cijr65rW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type MeuPerfil = { id: string; nome: string; perfil: string; abas: string[] };

/** Nome, perfil e abas liberadas de quem está logado (null = sem perfil ativo) */
export async function carregarMeuPerfil(): Promise<MeuPerfil | null> {
  const { data, error } = await supabase.rpc("meu_perfil");
  if (error || !data) return null;
  return data as MeuPerfil;
}
