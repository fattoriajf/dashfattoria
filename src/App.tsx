
import { LineChart as LineChartIcon } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";


import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, Share2, Copy, BarChart3, Users, Banknote, Wallet, Menu, X, Package, TrendingUp, Tag, BarChart2 } from "lucide-react";
import {
Calendar as Cal,
  RefreshCw,
  ClipboardList,
  ShoppingCart,
} from "lucide-react";

type Staff = { id: string; name: string };
type Day = { id: string; label: string; code: string };
type Rule = { id: string; a: string; b: string; kind: "must" | "never" };
type Availability = Record<string, string[]>;
type State = { staff: Staff[]; days: Day[]; rules: Rule[]; availability: Availability };

type ColaboradoresMeta = {
  years: number[];
  names: string[];
  sectors: string[];
  diariaOptions: number[];
};

type ColaboradoresRow = {
  data: string;
  weekday: string;
  turno: string;
  nome: string;
  setor: string;
  diariaFixa: number;
  consumo: number;
  comissao: number;
  adiantamentos: number;
  total: number;
};

type ColaboradoresTotals = {
  diarias: number;
  consumo: number;
  comissao: number;
  adiantamentos: number;
  total: number;
};


interface StockItem {
  item: string;
  categoria: string;
  armazenamento: string;
  estoqueMin: number | null;
  estoqueMax: number | null;
  ondeComprar: string;
  observacao: string;
  setor?: string; // 👈 novo campo, opcional
}


interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}
interface CardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}
interface SolverUIProps {
  state: State;
  availability: Availability;
  onRefresh: () => void;
  weekId: string;
}
interface AvailabilityFormProps {
  state: State;
  update: (p: Partial<State>) => void;
  selectedStaffId: string;
  setSelectedStaffId: (id: string) => void;
  weekId: string;
  syncEnabled: boolean;
  onSaved?: () => void;
}
interface PunchTabProps {
  staff: Staff[];
}

const LS_KEY = "escala_fattoria_state_v5";
// Limpa versões antigas do localStorage automaticamente
try { localStorage.removeItem("escala_fattoria_state_v4"); } catch {}
try { localStorage.removeItem("escala_fattoria_state_v3"); } catch {}
const SYNC_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbzFnPd7qVe6Rdhpc5BCqFY2zF-9070KQAOfpeXyDwYBxRNeAOtUHBw35Q3vSZK-QefZAg/exec";

function id() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDDMMYYYY_slash(dt: Date) {
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function formatDDMMYYYY_dash(dt: Date) {
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
function mondayOfWeek(d: Date) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay();
  const diff = (day + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  return dt;
}
function weekIdFromDate_slash(d: Date) {
  return formatDDMMYYYY_slash(mondayOfWeek(d));
}
function weekIdFromDate_dash(d: Date) {
  return formatDDMMYYYY_dash(mondayOfWeek(d));
}

const defaultState: State = {
  staff: [],
  days: [
    { id: id(), label: "Quarta", code: "qua" },
    { id: id(), label: "Quinta", code: "qui" },
    { id: id(), label: "Sexta", code: "sex" },
    { id: id(), label: "Sábado", code: "sab" },
    { id: id(), label: "Domingo (Noite)", code: "dom_noite" },
  ],
  rules: [],
  availability: {},
};

function encodeConfig(state: State) {
  const payload = { staff: state.staff, days: state.days, rules: state.rules };
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)));
}
function decodeConfig(b64: string) {
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    const obj = JSON.parse(json);
    if (obj && Array.isArray(obj.staff) && Array.isArray(obj.days) && Array.isArray(obj.rules)) {
      return obj as Pick<State, "staff" | "days" | "rules">;
    }
  } catch {}
  return null;
}

export default function App() {
  type Mode = "admin" | "colab";

  const [state, setState] = useState<State>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as State) : defaultState;
    } catch {
      return defaultState;
    }
  });

  const [mode, setMode] = useState<Mode>("admin");

  const [activeTab, setActiveTab] = useState<
  "disponibilidade" | "escalar" | "presenca" | "estoque" | "comissao" | "adiantamentos" | "caixa" | "dashboard" | "colaboradores" | "graficos" | "fichaTecnica" | "cmv" | "insumos" | "compras" | "markup" | "etiquetas" | "dre"
  >("disponibilidade");

  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [weekIdSlash, setWeekIdSlash] = useState<string>("");
  const [weekIdDash, setWeekIdDash] = useState<string>("");

  const [serverAvail, setServerAvail] = useState<Availability>({});

  const syncEnabled = !!SYNC_ENDPOINT;

  // lê parâmetros da URL (config, staff, semana, modo)
  useEffect(() => {
    const url = new URL(window.location.href);
    const s = url.searchParams.get("s");
    if (s) {
      const conf = decodeConfig(s);
      if (conf) {
        setState((prev) => ({ ...prev, ...conf }));
      }
    }
    const wanted = url.searchParams.get("staff");
    const w = url.searchParams.get("w");
    const m = url.searchParams.get("mode"); // "colab" ou "admin"

    if (m === "colab") {
      setMode("colab");
      setActiveTab("disponibilidade");
    } else if (m === "admin") {
      setMode("admin");
    }

    const initialDash = w || weekIdFromDate_dash(new Date());
    setWeekIdDash(initialDash);
    const [d, mNum, y] = initialDash.split("-").map(Number);
    setWeekIdSlash(`${String(d).padStart(2, "0")}/${String(mNum).padStart(2, "0")}/${y}`);

    if (wanted) {
      setTimeout(() => {
        setState((curr) => {
          const found = curr.staff.find(
            (p) => p.name.toLowerCase() === wanted.toLowerCase()
          );
          if (found) setSelectedStaffId(found.id);
          return curr;
        });
      }, 0);
    }
  }, []);

  // persiste estado local
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // carrega colaboradores da planilha "Cadastro_colaboradores"
  useEffect(() => {
    async function loadStaff() {
      try {
        const url = `${SYNC_ENDPOINT}?action=staff`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data?.ok || !Array.isArray(data.names)) {
          console.error("Resposta inválida em /staff", data);
          return;
        }
        setState((prev) => {
          const oldByName = new Map(prev.staff.map((s) => [s.name, s.id]));
          const newStaff: Staff[] = data.names.map((name: string) => ({
            id: oldByName.get(name) || id(),
            name,
          }));
          return { ...prev, staff: newStaff };
        });
      } catch (err) {
        console.error("Falha ao carregar colaboradores:", err);
      }
    }
    loadStaff();
  }, []);

  const update = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));

  function rowsToAvailability(rows: Array<{ staff: string; days: string[] }>): Availability {
    const nameToId = Object.fromEntries(state.staff.map((s) => [s.name, s.id] as const));
    const codeToId = Object.fromEntries(state.days.map((d) => [d.code, d.id] as const));
    const out: Availability = {};
    for (const r of rows) {
      const sid = nameToId[r.staff];
      if (!sid) continue;
      const ids = (r.days || [])
        .map((c) => codeToId[c])
        .filter(Boolean) as string[];
      out[sid] = ids;
    }
    return out;
  }

  async function refreshServer() {
    if (!SYNC_ENDPOINT || !weekIdDash) return;
    try {
      const url = `${SYNC_ENDPOINT}?action=list&weekId=${encodeURIComponent(weekIdDash)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.rows)) {
        setServerAvail(rowsToAvailability(data.rows));
      }
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    refreshServer();
  }, [weekIdDash, state.staff, state.days]);

  const availabilityForSolver: Availability =
    Object.keys(serverAvail).length ? serverAvail : state.availability;

  const isColab = mode === "colab";

  // ===== LOGIN ADMIN =====
  const [adminLogado, setAdminLogado] = useState<boolean>(() => {
    try { return sessionStorage.getItem("fattoria_admin_auth") === "1"; } catch { return false; }
  });
  const [abasPermitidas, setAbasPermitidas] = useState<string[] | "tudo">(() => {
    try {
      const raw = sessionStorage.getItem("fattoria_admin_abas");
      if (!raw) return "tudo";
      return raw === "tudo" ? "tudo" : JSON.parse(raw) as string[];
    } catch { return "tudo"; }
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const podeVer = (aba: string): boolean => {
    if (isColab) return true;
    if (abasPermitidas === "tudo") return true;
    return (abasPermitidas as string[]).includes(aba.toLowerCase());
  };

  // Aba efetiva: se a aba ativa não tem permissão, usa a primeira permitida
  const todasAbas: (typeof activeTab)[] = ["disponibilidade","escalar","presenca","estoque","comissao","adiantamentos","caixa","dashboard","colaboradores","graficos","fichaTecnica","cmv","insumos","compras","markup","etiquetas","dre"];
  const abaEfetiva: typeof activeTab = podeVer(activeTab) ? activeTab : (todasAbas.find(t => podeVer(t)) ?? "disponibilidade");

  if (mode === "admin" && !adminLogado) {
    return (
      <LoginAdmin
        onLogin={(abas) => {
          try {
            sessionStorage.setItem("fattoria_admin_auth", "1");
            sessionStorage.setItem("fattoria_admin_abas", abas === "tudo" ? "tudo" : JSON.stringify(abas));
          } catch {}
          setAbasPermitidas(abas);
          setAdminLogado(true);
        }}
      />
    );
  }

  const navItem = (tab: typeof activeTab, label: string, icon: React.ReactNode, adminOnly = false) => {
    if (adminOnly && isColab) return null;
    if (!podeVer(tab)) return null;
    return (
      <button
        className={`sidebar-item ${abaEfetiva === tab ? "active" : ""}`}
        onClick={() => { setActiveTab(tab); setMobileMenuOpen(false); }}
      >
        {icon}
        {label}
      </button>
    );
  };

  const sidebarJSX = (
    <>
      <div className="sidebar-category">
        <div className="sidebar-category-label">Pessoal</div>
        {navItem("disponibilidade", "Disponibilidade", <ClipboardList className="w-4 h-4" />)}
        {navItem("escalar", "Escalar", <Cal className="w-4 h-4" />, true)}
        {navItem("presenca", "Registrar Presença", <Cal className="w-4 h-4" />)}
      </div>
      <div className="sidebar-category">
        <div className="sidebar-category-label">Inventário</div>
        {navItem("estoque", "Compras de Estoque", <ShoppingCart className="w-4 h-4" />)}
        {navItem("insumos", "Insumos", <Package className="w-4 h-4" />, true)}
        {navItem("compras", "Registro de Compras", <ShoppingCart className="w-4 h-4" />, true)}
        {navItem("etiquetas", "Etiquetas", <Tag className="w-4 h-4" />, true)}
        {navItem("fichaTecnica", "Ficha Técnica", <Package className="w-4 h-4" />, true)}
      </div>
      {!isColab && (
        <div className="sidebar-category">
          <div className="sidebar-category-label">Financeiro</div>
          {navItem("comissao", "Comissão e Pagamento", <Cal className="w-4 h-4" />, true)}
          {navItem("adiantamentos", "Adiantamentos", <Banknote className="w-4 h-4" />, true)}
          {navItem("caixa", "Caixa", <Wallet className="w-4 h-4" />, true)}
          {navItem("cmv", "CMV", <BarChart3 className="w-4 h-4" />, true)}
          {navItem("markup", "Markup", <TrendingUp className="w-4 h-4" />, true)}
          {navItem("dre", "DRE", <BarChart2 className="w-4 h-4" />, true)}
        </div>
      )}
      {!isColab && (
        <div className="sidebar-category">
          <div className="sidebar-category-label">Indicadores</div>
          {navItem("dashboard", "Dashboard", <BarChart3 className="w-4 h-4" />, true)}
          {navItem("colaboradores", "Colaboradores", <Users className="w-4 h-4" />, true)}
          {navItem("graficos", "Gráficos", <LineChartIcon className="w-4 h-4" />, true)}
        </div>
      )}
    </>
  );

  return (
    <div className="app-layout">
      {/* Top bar */}
      <header className="app-topbar">
        <div className="flex items-center gap-3">
          <button
            className="hamburger-btn p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src="/logo.png" alt="Fattoria" className="h-14 sm:h-9 w-auto" />
        </div>
        <span className="text-xs text-gray-400 hidden sm:block">Gestão Interna</span>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-sidebar">
            <div className="flex items-center justify-between mb-2">
              <img src="/logo.png" alt="Fattoria" className="h-8 w-auto" />
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {sidebarJSX}
          </div>
        </>
      )}

      <div className="app-body">
        {/* Desktop sidebar */}
        <aside className="sidebar">
          {sidebarJSX}
        </aside>

        {/* Main content */}
        <main className="main-content">
          {abaEfetiva === "disponibilidade" && (
            <Card title={`Disponibilidade – Semana ${weekIdSlash || "(definir)"}`} icon={<ClipboardList className="w-5 h-5" />}>
              <AvailabilityForm state={state} update={update} selectedStaffId={selectedStaffId} setSelectedStaffId={setSelectedStaffId} weekId={weekIdDash} syncEnabled={syncEnabled} onSaved={refreshServer} />
            </Card>
          )}
          {!isColab && abaEfetiva === "escalar" && (
            <Card title="Escalar" icon={<Cal className="w-5 h-5" />}>
              <SolverUI state={state} availability={availabilityForSolver} onRefresh={refreshServer} weekId={weekIdDash} />
            </Card>
          )}
          {abaEfetiva === "presenca" && (
            <Card title="Registrar Presença" icon={<Cal className="w-5 h-5" />}>
              <PunchTab staff={state.staff} />
            </Card>
          )}
          {abaEfetiva === "estoque" && (
            <Card title="Compras de Estoque" icon={<ShoppingCart className="w-5 h-5" />}>
              <StockTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "comissao" && (
            <Card title="Comissão e Pagamento" icon={<Cal className="w-5 h-5" />}>
              <CommissionTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "adiantamentos" && (
            <Card title="Adiantamentos" icon={<Banknote className="w-5 h-5" />}>
              <AdiantamentosTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "caixa" && (
            <Card title="Caixa" icon={<Wallet className="w-5 h-5" />}>
              <CaixaTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "cmv" && (
            <Card title="CMV" icon={<BarChart3 className="w-5 h-5" />}>
              <CMVTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "insumos" && (
            <Card title="Insumos" icon={<Package className="w-5 h-5" />}>
              <InsumosTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "compras" && (
            <Card title="Registro de Compras" icon={<ShoppingCart className="w-5 h-5" />}>
              <ComprasTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "markup" && (
            <Card title="Markup" icon={<TrendingUp className="w-5 h-5" />}>
              <MarkupTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "dre" && (
            <Card title="DRE — Fluxo de Caixa Avançado" icon={<BarChart2 className="w-5 h-5" />}>
              <DRETab />
            </Card>
          )}
          {abaEfetiva === "etiquetas" && (
            <Card title="Etiquetas" icon={<Tag className="w-5 h-5" />}>
              <EtiquetasTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "fichaTecnica" && (
            <Card title="Ficha Técnica" icon={<Package className="w-5 h-5" />}>
              <FichaTecnicaTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "dashboard" && (
            <Card title="Dashboard" icon={<BarChart3 className="w-5 h-5" />}>
              <DashboardTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "colaboradores" && (
            <Card title="Colaboradores" icon={<Users className="w-5 h-5" />}>
              <ColaboradoresTab />
            </Card>
          )}
          {!isColab && abaEfetiva === "graficos" && <GraphsTab />}
        </main>
      </div>
    </div>
  );
}

// ======== TELA DE LOGIN ADMIN ========
function LoginAdmin({ onLogin }: { onLogin: (abas: string[] | "tudo") => void }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario || !senha) { setErro("Preencha usuário e senha."); return; }
    if (!SYNC_ENDPOINT) { setErro("Endpoint não configurado."); return; }

    setLoading(true);
    setErro("");
    try {
      const url = `${SYNC_ENDPOINT}?action=login&usuario=${encodeURIComponent(usuario)}&senha=${encodeURIComponent(senha)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.ok && data?.autorizado) {
        const abas = data.abas === "tudo" ? "tudo" : (Array.isArray(data.abas) ? data.abas : "tudo");
        onLogin(abas);
      } else {
        setErro("Usuário ou senha incorretos.");
      }
    } catch {
      setErro("Erro ao conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-header">
        <img src="/logo.png" alt="Fattoria" className="h-16 w-auto" />
      </div>
      <div className="login-card">
        <div className="text-center space-y-1 mb-6">
          <h2 className="text-lg font-semibold text-gray-800">Acesso administrativo</h2>
          <p className="text-sm text-gray-500">Entre com suas credenciais</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Usuário</label>
            <input
              type="text"
              className="input w-full"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Senha</label>
            <input
              type="password"
              className="input w-full"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {erro && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`btn btn-primary w-full ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick, icon }: TabButtonProps) {
  return (
    <button onClick={onClick} className={`tab ${active ? "tab-active" : "tab-inactive"}`}>
      {icon}
      {label}
    </button>
  );
}

function Card({ title, icon, children }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}

function AvailabilityForm({
  state,
  update,
  selectedStaffId,
  setSelectedStaffId,
  weekId,
  syncEnabled,
  onSaved,
}: AvailabilityFormProps) {
  const selected = state.staff.find((s) => s.id === selectedStaffId);
  const chosen = state.availability[selectedStaffId] || [];
  const [saving, setSaving] = useState(false);
  const hasEntry =
    !!selectedStaffId &&
    Object.prototype.hasOwnProperty.call(state.availability, selectedStaffId);
  const noAvailability = !!selectedStaffId && hasEntry && chosen.length === 0;

  const setNoAvailability = (val: boolean) => {
    if (!selectedStaffId) return;
    if (val) {
      update({ availability: { ...state.availability, [selectedStaffId]: [] } });
    } else {
      const next = { ...state.availability };
      delete next[selectedStaffId];
      update({ availability: next });
    }
  };

  const toggle = (dayId: string) => {
    const curr = new Set(chosen);
    if (curr.has(dayId)) curr.delete(dayId);
    else curr.add(dayId);
    update({
      availability: { ...state.availability, [selectedStaffId]: Array.from(curr) },
    });
  };

  const save = async () => {
  if (saving) return;

  if (!selected) {
    alert("Nenhum nome foi selecionado");
    return;
  }

  const chosenCodes = (state.availability[selectedStaffId] || [])
    .map((did) => state.days.find((d) => d.id === did)?.code)
    .filter(Boolean) as string[];

  setSaving(true);
  try {
    if (syncEnabled && weekId) {
      try {
        const resp = await fetch(SYNC_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "upsert",
            weekId,
            staff: selected.name,
            days: chosenCodes,
          }),
        });

        // no-cors -> resposta 'opaque'
        // @ts-ignore
        if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
          alert("Suas escolhas foram salvas.");
          onSaved?.();
          return;
        }

        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          alert(`Falha ao salvar (HTTP ${resp.status}). Resposta: ${txt.slice(0, 180)}`);
          return;
        }

        const txt = await resp.text();
        try {
          const data = JSON.parse(txt);
          if (data.ok) {
            alert("Suas escolhas foram salvas.");
            onSaved?.();
          } else {
            alert(`Falha ao salvar no servidor: ${data.error || "erro desconhecido"}`);
          }
        } catch {
          alert("Suas escolhas foram salvas.");
          onSaved?.();
        }
      } catch (err: any) {
        alert(`Não foi possível enviar. Verifique sua conexão. Erro: ${String(err)}`);
      }
    } else {
      alert("Salvo localmente (modo offline).");
      onSaved?.();
    }
  } finally {
    setSaving(false);
  }
};


  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
        <label className="text-sm text-gray-600">Seu nome</label>
        <select
          className="input sm:col-span-2"
          value={selectedStaffId}
          onChange={(e) => setSelectedStaffId(e.target.value)}
        >
          <option value="">Selecionar seu nome</option>
          {state.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 border rounded-xl px-3 py-2 bg-white">
        <input
          type="checkbox"
          checked={noAvailability}
          disabled={!selectedStaffId}
          onChange={(e) => setNoAvailability(e.target.checked)}
        />
        <span className="font-medium">Sem disponibilidade essa semana</span>
      </label>

      <div className="grid sm:grid-cols-2 gap-2">
        {state.days.map((d) => (
          <label
            key={d.id}
            className={`flex items-center gap-2 border rounded-xl px-3 py-2 ${
              noAvailability ? "bg-gray-50 opacity-70" : "bg-white"
            }`}
          >
            <input
              type="checkbox"
              checked={chosen.includes(d.id)}
              disabled={!selectedStaffId || noAvailability}
              onChange={() => toggle(d.id)}
            />
            <span>{d.label}</span>
          </label>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving || !selectedStaffId}
        className={`btn ${syncEnabled ? "btn-primary" : "btn-ghost"} ${
          saving || !selectedStaffId ? "opacity-70 cursor-not-allowed" : ""
        }`}
      >
        {saving ? "Processando..." : "Salvar minhas escolhas"}
      </button>
      {!syncEnabled && (
        <div className="text-xs text-amber-700">Sem endpoint configurado (modo offline).</div>
      )}
    </div>
  );
}

// ======== ABA REGISTRAR PRESENÇA ========
function PunchTab({ staff }: PunchTabProps) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [punching, setPunching] = useState(false);
  const allPeople = useMemo(() => {
    const baseNames = staff.map((s) => s.name);
    const extras = ["Eduardo", "Aryelton", "Wellington"];
    const names = [...baseNames, ...extras];
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const st = staff.find((s) => s.name === name);
      const id = st ? st.id : `extra-${name}`;
      out.push({ id, label: name });
    }
    return out;
  }, [staff]);

  // Data, turno, setor
  const [dateRaw, setDateRaw] = useState<string>("");
  const [turno, setTurno] = useState<string>("Noite");
  const isSunday = useMemo(() => {
    if (!dateRaw) return false;
    const parts = dateRaw.split("-");
    if (parts.length !== 3) return false;
    const yy = Number(parts[0]);
    const mm = Number(parts[1]);
    const dd = Number(parts[2]);
    if (!yy || !mm || !dd) return false;
    const dt = new Date(yy, mm - 1, dd);
    return dt.getDay() === 0;
  }, [dateRaw]);

  // Transporte ida
  const [idaModo, setIdaModo] = useState<string>("");
  const [idaCarona, setIdaCarona] = useState<string>("");
  const [idaOnibusQtd, setIdaOnibusQtd] = useState<string>("1");
  const [idaUberValor, setIdaUberValor] = useState<string>("");

  // Transporte volta
  const [voltaModo, setVoltaModo] = useState<string>("");
  const [voltaCarona, setVoltaCarona] = useState<string>("");
  const [voltaOnibusQtd, setVoltaOnibusQtd] = useState<string>("1");
  const [voltaUberValor, setVoltaUberValor] = useState<string>("");

  // Em domingos, ocultamos transporte e limpamos quaisquer valores anteriores
  useEffect(() => {
    if (!isSunday) return;
    setIdaModo("");
    setIdaCarona("");
    setIdaOnibusQtd("1");
    setIdaUberValor("");
    setVoltaModo("");
    setVoltaCarona("");
    setVoltaOnibusQtd("1");
    setVoltaUberValor("");
  }, [isSunday]);

  // Consumo
  type ConsumoItem = { product: string; quantity: string };
  const [consumoItems, setConsumoItems] = useState<ConsumoItem[]>([
    { product: "", quantity: "1" },
  ]);
  const [produtos, setProdutos] = useState<string[]>([]);

  // Carrega lista de produtos da planilha "Cadastro_produtos"
  useEffect(() => {
    async function loadProducts() {
      if (!SYNC_ENDPOINT) return;
      try {
        const url = `${SYNC_ENDPOINT}?action=products`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data?.ok && Array.isArray(data.products)) {
          setProdutos(data.products as string[]);
        }
      } catch (err) {
        console.error("Falha ao carregar produtos:", err);
      }
    }
    loadProducts();
  }, []);

  const formatDateForPayload = (raw: string) => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  };

  const handleAddConsumoRow = () => {
    setConsumoItems((prev) => [...prev, { product: "", quantity: "1" }]);
  };

  const handleConsumoChange = (idx: number, field: "product" | "quantity", value: string) => {
    setConsumoItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };


  // ===== Registrar presença em eventos (turno = "evento") =====
  const [eventSelectedId, setEventSelectedId] = useState<string>("");
  const [eventDateRaw, setEventDateRaw] = useState<string>("");
  const [eventPunching, setEventPunching] = useState(false);
  const [eventConsumoItems, setEventConsumoItems] = useState<ConsumoItem[]>([
    { product: "", quantity: "1" },
  ]);

  const handleAddEventConsumoRow = () => {
    setEventConsumoItems((prev) => [...prev, { product: "", quantity: "1" }]);
  };

  const handleEventConsumoChange = (idx: number, field: "product" | "quantity", value: string) => {
    setEventConsumoItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handlePunchEvent = async () => {
    if (eventPunching) return;
    if (!eventSelectedId) {
      alert("Nenhum nome foi selecionado");
      return;
    }
    if (!eventDateRaw) {
      alert("Selecione a data.");
      return;
    }

    const entry = allPeople.find((p) => p.id === eventSelectedId);
    const name = entry?.label || "";
    if (!name) {
      alert("Seleção inválida.");
      return;
    }

    if (!SYNC_ENDPOINT) {
      alert(
        `Presença de evento registrada localmente para ${name}, mas nenhum endpoint está configurado.`
      );
      return;
    }

    const dateStr = formatDateForPayload(eventDateRaw);
    if (!dateStr) {
      alert("Data inválida.");
      return;
    }

    const consumoLimpo = eventConsumoItems
      .filter((c) => c.product && c.quantity)
      .map((c) => ({
        product: c.product,
        quantity: c.quantity,
      }));

    const payload = {
      action: "ponto",
      date: dateStr,
      staff: name,
      timestamp: new Date().toISOString(),
      turno: "evento",
      transporte: {}, // eventos: sem transporte
      consumo: consumoLimpo,
    };

    setEventPunching(true);
    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert(`Presença (evento) registrada para ${name} em ${dateStr}.`);
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao registrar presença (evento) (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
        return;
      }
      alert(`Presença (evento) registrada para ${name} em ${dateStr}.`);
    } catch (err: any) {
      alert(`Não foi possível enviar o registro de presença (evento). Erro: ${String(err)}`);
    } finally {
      setEventPunching(false);
    }
  };

  const handlePunch = async () => {
    if (punching) return;
    if (!selectedId) {
      alert("Nenhum nome foi selecionado");
      return;
    }
    if (!dateRaw) {
      alert("Selecione a data.");
      return;
    }

    const entry = allPeople.find((p) => p.id === selectedId);
    const name = entry?.label || "";
    if (!name) {
      alert("Seleção inválida.");
      return;
    }

    if (!SYNC_ENDPOINT) {
      alert(
        `Presença registrada localmente para ${name}, mas nenhum endpoint está configurado.`
      );
      return;
    }

    const dateStr = formatDateForPayload(dateRaw);
    if (!dateStr) {
      alert("Data inválida.");
      return;
    }

    const consumoLimpo = consumoItems
      .filter((c) => c.product && c.quantity)
      .map((c) => ({
        product: c.product,
        quantity: c.quantity,
      }));

    const transportePayload = isSunday
          ? {}
          : {
            ida: {
              modo: idaModo,
              caronaCom: idaModo === "carona" ? idaCarona : "",
              onibusQtd: idaModo === "onibus" ? idaOnibusQtd : "",
              uberValor: idaModo === "uber" ? idaUberValor : "",
            },
            volta: {
              modo: voltaModo,
              caronaCom: voltaModo === "carona" ? voltaCarona : "",
              onibusQtd: voltaModo === "onibus" ? voltaOnibusQtd : "",
              uberValor: voltaModo === "uber" ? voltaUberValor : "",
            },
          };

        const payload = {
          action: "ponto",
          date: dateStr,
          staff: name,
          timestamp: new Date().toISOString(),
          turno,
          transporte: transportePayload,
          consumo: consumoLimpo,
        };

    setPunching(true);
    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert(`Presença registrada para ${name} em ${dateStr}.`);
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao registrar presença (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
        return;
      }
      alert(`Presença registrada para ${name} em ${dateStr}.`);
    } catch (err: any) {
      alert(`Não foi possível enviar o registro de presença. Erro: ${String(err)}`);
    } finally {
      setPunching(false);
    }
  };

   

  const colaboradoresParaCarona = allPeople.filter((p) => p.id !== selectedId);

  return (
    <div className="space-y-4">
      {/* Nome + Data + Turno + Setor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Nome</label>
          <select
            className="input w-full"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Selecionar seu nome</option>
            {allPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Data</label>
          <input
            type="date"
            className="input w-full"
            value={dateRaw}
            onChange={(e) => setDateRaw(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Turno</label>
          <select
            className="input w-full"
            value={turno}
            onChange={(e) => setTurno(e.target.value)}
          >
            <option value="Noite">Noite</option>
          </select>
        </div>
</div>

      {isSunday ? (
        <div className="text-xs text-gray-500">
          Domingo: transporte não precisa ser preenchido.
        </div>
      ) : (
        <>
      {/* Transporte ida/volta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Ida */}
        <div className="border rounded-xl p-3 bg-white space-y-2">
          <div className="font-semibold text-sm">Transporte – Ida</div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Tipo</label>
            <select
              className="input w-full"
              value={idaModo}
              onChange={(e) => setIdaModo(e.target.value)}
            >
              <option value="">Nenhum</option>
              <option value="carona">Carona</option>
              <option value="onibus">Ônibus</option>
              <option value="uber">Uber</option>
            </select>
          </div>

          {idaModo === "carona" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Carona com</label>
              <select
                className="input w-full"
                value={idaCarona}
                onChange={(e) => setIdaCarona(e.target.value)}
              >
                <option value="">Selecione</option>
                {colaboradoresParaCarona.map((p) => (
                  <option key={p.id} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {idaModo === "onibus" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Nº de passagens (1–3)</label>
              <select
                className="input w-full"
                value={idaOnibusQtd}
                onChange={(e) => setIdaOnibusQtd(e.target.value)}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          )}

          {idaModo === "uber" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                className="input w-full"
                value={idaUberValor}
                onChange={(e) => setIdaUberValor(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Volta */}
        <div className="border rounded-xl p-3 bg-white space-y-2">
          <div className="font-semibold text-sm">Transporte – Volta</div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Tipo</label>
            <select
              className="input w-full"
              value={voltaModo}
              onChange={(e) => setVoltaModo(e.target.value)}
            >
              <option value="">Nenhum</option>
              <option value="carona">Carona</option>
              <option value="onibus">Ônibus</option>
              <option value="uber">Uber</option>
            </select>
          </div>

          {voltaModo === "carona" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Carona com</label>
              <select
                className="input w-full"
                value={voltaCarona}
                onChange={(e) => setVoltaCarona(e.target.value)}
              >
                <option value="">Selecione</option>
                {colaboradoresParaCarona.map((p) => (
                  <option key={p.id} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {voltaModo === "onibus" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Nº de passagens (1–3)</label>
              <select
                className="input w-full"
                value={voltaOnibusQtd}
                onChange={(e) => setVoltaOnibusQtd(e.target.value)}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          )}

          {voltaModo === "uber" && (
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                className="input w-full"
                value={voltaUberValor}
                onChange={(e) => setVoltaUberValor(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

        </>
      )}
      {/* Consumo */}
      <div className="border rounded-xl p-3 bg-white space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">Consumo</div>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={handleAddConsumoRow}
          >
            + Adicionar item
          </button>
        </div>
        <div className="space-y-2">
          {consumoItems.map((item, idx) => (
            <div
              key={idx}
              className="grid grid-cols-3 sm:grid-cols-4 gap-2 items-center"
            >
              <div className="col-span-2 sm:col-span-3">
                <label className="text-xs text-gray-600 block mb-1">Produto</label>
                <select
                  className="input w-full"
                  value={item.product}
                  onChange={(e) =>
                    handleConsumoChange(idx, "product", e.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  {produtos.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1">Qtd.</label>
                <input
                  type="number"
                  min={1}
                  className="input w-full"
                  value={item.quantity}
                  onChange={(e) =>
                    handleConsumoChange(idx, "quantity", e.target.value)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Botão registrar */}
      <div className="pt-2">
        <button onClick={handlePunch} disabled={punching}  className={`btn btn-primary ${punching ? "opacity-70 cursor-not-allowed" : ""}`} >
          {punching ? "Processando..." : "Registrar presença"}
        </button>
      </div>

      {/* Registrar presença em eventos */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">Registrar presença em eventos</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Nome</label>
            <select
              className="input w-full"
              value={eventSelectedId}
              onChange={(e) => setEventSelectedId(e.target.value)}
            >
              <option value="">Selecionar nome</option>
              {allPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data</label>
            <input
              type="date"
              className="input w-full"
              value={eventDateRaw}
              onChange={(e) => setEventDateRaw(e.target.value)}
            />
          </div>
</div>

        <div className="border rounded-xl p-3 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">Consumo (evento)</div>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={handleAddEventConsumoRow}
            >
              + Adicionar item
            </button>
          </div>

          <div className="space-y-2">
            {eventConsumoItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-3 sm:grid-cols-4 gap-2 items-center">
                <div className="col-span-2 sm:col-span-3">
                  <label className="text-xs text-gray-600 block mb-1">Produto</label>
                  <select
                    className="input w-full"
                    value={item.product}
                    onChange={(e) => handleEventConsumoChange(idx, "product", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {produtos.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600 block mb-1">Qtd.</label>
                  <input
                    type="number"
                    min={1}
                    className="input w-full"
                    value={item.quantity}
                    onChange={(e) => handleEventConsumoChange(idx, "quantity", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={handlePunchEvent}
            disabled={eventPunching}
            className={`btn btn-primary ${eventPunching ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {eventPunching ? "Processando..." : "Registrar presença (evento)"}
          </button>
        </div>
      </div>

    </div>
  );
}

// ======== SOLVER (15 boxes, sem prioridade) + envio por e-mail ========
const SLOTS_PER_DAY = 15;

function SolverUI({ state, availability, onRefresh, weekId }: SolverUIProps) {
  const respondedIds = Object.keys(availability || {});
  const respondedSet = new Set(respondedIds);
  const missing = state.staff.filter((s) => !respondedSet.has(s.id)).map((s) => s.name);
  const total = state.staff.length;

  const [refreshing, setRefreshing] = useState(false);

  // Mantemos o comportamento original do envio
  const [sendingEmails, setSendingEmails] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);

  const labelOf = (sid: string) => state.staff.find((s) => s.id === sid)?.name || "";

  const handleRefreshClick = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.resolve(onRefresh());
      alert("Respostas atualizadas.");
    } finally {
      setRefreshing(false);
    }
  };

  const availNamesByDay: Record<string, string[]> = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const day of state.days) {
      const names: string[] = [];
      for (const s of state.staff) {
        const daysOfS = availability[s.id] || [];
        if (daysOfS.includes(day.id)) names.push(s.name);
      }
      names.sort((a, b) => a.localeCompare(b, "pt-BR"));
      out[day.id] = names;
    }
    return out;
  }, [state.days, state.staff, availability]);

  const selectOptionsByDay: Record<string, string[]> = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const day of state.days) {
      const ids: string[] = [];
      for (const s of state.staff) {
        const daysOfS = availability[s.id] || [];
        if (daysOfS.includes(day.id)) ids.push(s.id);
      }
      out[day.id] = ids;
    }
    return out;
  }, [state.days, state.staff, availability]);

  const [selects, setSelects] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const d of state.days) init[d.id] = Array(SLOTS_PER_DAY).fill("");
    return init;
  });

  useEffect(() => {
    setSelects((prev) => {
      const next: Record<string, string[]> = {};
      for (const d of state.days) {
        const old = prev[d.id] || [];
        const arr = Array.from({ length: SLOTS_PER_DAY }, (_, i) => old[i] || "");
        next[d.id] = arr;
      }
      return next;
    });
  }, [state.days]);

  const setSelectCell = (dayId: string, idx: number, val: string) => {
    setSelects((prev) => {
      const arr = [...(prev[dayId] || [])];
      arr[idx] = val;
      return { ...prev, [dayId]: arr };
    });
  };

  // ======= Escala final (editável) persistida até a virada de domingo->segunda (00:00) =======
  type FinalSchedulePack = {
    weekId: string;
    createdAt: number;
    expiresAt: number;
    baselineByDayId: Record<string, string[]>;
    currentByDayId: Record<string, string[]>;
  };

  const LS_KEY = useMemo(() => `fattoria_final_schedule_${weekId || "semana"}`, [weekId]);

  const computeNextMonday00 = () => {
    const now = new Date();
    const dow = now.getDay(); // 0=domingo ... 6=sábado
    const daysUntilNextMonday = ((8 - dow) % 7) || 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntilNextMonday);
    next.setHours(0, 0, 0, 0);
    return next.getTime();
  };

  const buildUniqueIdsByDay = () => {
    const out: Record<string, string[]> = {};
    for (const day of state.days) {
      const vals = Array.isArray(selects[day.id]) ? selects[day.id] : [];
      const ids = vals.filter(Boolean);
      const unique = Array.from(new Set(ids));
      out[day.id] = unique;
    }
    return out;
  };

  const [finalPack, setFinalPack] = useState<FinalSchedulePack | null>(null);
  const [updatingEmails, setUpdatingEmails] = useState(false);

  // 3 selects de "Adicionar..." por dia
  const ADD_SLOTS = 3;
  const [addPick, setAddPick] = useState<Record<string, string[]>>({});

  const persistPack = (p: FinalSchedulePack | null) => {
    try {
      if (!p) {
        localStorage.removeItem(LS_KEY);
      } else {
        localStorage.setItem(LS_KEY, JSON.stringify(p));
      }
    } catch {}
  };

  useEffect(() => {
    // carrega do localStorage ao entrar na aba
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as FinalSchedulePack;
      if (!parsed || !parsed.expiresAt || Date.now() >= Number(parsed.expiresAt)) {
        localStorage.removeItem(LS_KEY);
        return;
      }
      setFinalPack(parsed);

      // init addPick
      const init: Record<string, string[]> = {};
      for (const d of state.days) init[d.id] = Array(ADD_SLOTS).fill("");
      setAddPick(init);
    } catch {
      // ignora
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LS_KEY]);

  useEffect(() => {
    if (!finalPack) return;
    const ms = finalPack.expiresAt - Date.now();
    if (ms <= 0) {
      setFinalPack(null);
      persistPack(null);
      return;
    }
    const t = window.setTimeout(() => {
      setFinalPack(null);
      persistPack(null);
    }, ms + 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalPack?.expiresAt]);

  const removeFromFinal = (dayId: string, sid: string) => {
    setFinalPack((prev) => {
      if (!prev) return prev;
      const cur = prev.currentByDayId[dayId] || [];
      const nextDay = cur.filter((x) => x !== sid);
      const next: FinalSchedulePack = {
        ...prev,
        currentByDayId: { ...prev.currentByDayId, [dayId]: nextDay },
      };
      persistPack(next);
      return next;
    });
  };

  const addToFinal = (dayId: string, sid: string) => {
    setFinalPack((prev) => {
      if (!prev) return prev;
      const cur = prev.currentByDayId[dayId] || [];
      if (cur.includes(sid)) return prev;
      const nextDay = [...cur, sid];
      const next: FinalSchedulePack = {
        ...prev,
        currentByDayId: { ...prev.currentByDayId, [dayId]: nextDay },
      };
      persistPack(next);
      return next;
    });
  };

  const computeDiffs = () => {
    const removed: Record<string, string[]> = {};
    const added: Record<string, string[]> = {};
    if (!finalPack) return { removed, added };

    for (const day of state.days) {
      const base = finalPack.baselineByDayId[day.id] || [];
      const cur = finalPack.currentByDayId[day.id] || [];

      const removedIds = base.filter((sid) => !cur.includes(sid));
      const addedIds = cur.filter((sid) => !base.includes(sid));

      removedIds.forEach((sid) => {
        const nm = labelOf(sid);
        if (!nm) return;
        if (!removed[nm]) removed[nm] = [];
        removed[nm].push(day.label);
      });

      addedIds.forEach((sid) => {
        const nm = labelOf(sid);
        if (!nm) return;
        if (!added[nm]) added[nm] = [];
        added[nm].push(day.label);
      });
    }

    return { removed, added };
  };

  // Enviar escala por e-mail (EXATAMENTE como estava)
  const handleSendEmails = async () => {
    if (!SYNC_ENDPOINT) {
      alert("Nenhum endpoint de sincronização configurado.");
      return;
    }
    if (sendingEmails) return;

    setSendingEmails(true);
    try {
      // monta objeto { [dayCode]: [nomesÚnicos] }
      const schedule: Record<string, string[]> = {};
      for (const day of state.days) {
        const arr = selects[day.id] || {};
        const values = Array.isArray(arr) ? arr : [];
        const names = values
          .filter(Boolean)
          .map((sid: string) => labelOf(sid))
          .filter(Boolean);
        const uniqueNames = Array.from(new Set(names));
        schedule[day.code] = uniqueNames;
      }

      const payload = {
        action: "send_schedule",
        weekId,
        schedule,
      };
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // Em no-cors a resposta é 'opaque'; tratamos como sucesso
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert("Escalas enviadas por e-mail (solicitação enviada ao servidor).");
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao enviar escalas por e-mail (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
        return;
      }
      alert("Escalas enviadas por e-mail.");
    } catch (err: any) {
      alert(`Não foi possível enviar as escalas por e-mail. Erro: ${String(err)}`);
    } finally {
      setSendingEmails(false);
    }
  };

  const handleSendEmailsClick = async () => {
    if (isSendingEmails) return;
    setIsSendingEmails(true);

    // cria tabela editável e persiste até a virada de domingo->segunda (00:00)
    // Fazemos isso ANTES do envio para garantir que a tabela apareça mesmo se o fetch demorar.
    const baselineByDayId = buildUniqueIdsByDay();
    const pack: FinalSchedulePack = {
      weekId: String(weekId || ""),
      createdAt: Date.now(),
      expiresAt: computeNextMonday00(),
      baselineByDayId,
      currentByDayId: baselineByDayId,
    };
    setFinalPack(pack);
    persistPack(pack);

    const init: Record<string, string[]> = {};
    for (const d of state.days) init[d.id] = Array(ADD_SLOTS).fill("");
    setAddPick(init);

    try {
      await handleSendEmails(); // chama EXATAMENTE o que você já tinha
    } finally {
      setIsSendingEmails(false);
    }
  };

  const handleSendUpdatedEmails = async () => {
    if (!SYNC_ENDPOINT) {
      alert("Nenhum endpoint de sincronização configurado.");
      return;
    }
    if (!finalPack) return;
    if (updatingEmails) return;

    const { removed, added } = computeDiffs();
    const hasAny =
      Object.keys(removed).some((k) => (removed[k] || []).length > 0) ||
      Object.keys(added).some((k) => (added[k] || []).length > 0);

    if (!hasAny) {
      alert("Nenhuma modificação detectada na escala.");
      return;
    }

    setUpdatingEmails(true);
    try {
      const payload = {
        action: "send_schedule_updates",
        weekId,
        removed,
        added,
      };

      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert("E-mails atualizados enviados (solicitação enviada ao servidor).");
      } else if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao enviar e-mails atualizados (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
      } else {
        alert("E-mails atualizados enviados.");
      }

      // depois de enviar, atualiza o baseline para evitar reenviar de novo
      setFinalPack((prev) => {
        if (!prev) return prev;
        const next: FinalSchedulePack = {
          ...prev,
          baselineByDayId: prev.currentByDayId,
        };
        persistPack(next);
        return next;
      });
    } catch (err: any) {
      alert(`Não foi possível enviar e-mails atualizados. Erro: ${String(err)}`);
    } finally {
      setUpdatingEmails(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-sm">
        {missing.length === 0 ? (
          <div className="rounded-xl border px-3 py-2 bg-green-50 text-green-800">
            Todas as {total} pessoas já responderam.
          </div>
        ) : (
          <div className="rounded-xl border px-3 py-2 bg-amber-50 text-amber-800">
            {total - missing.length} de {total} já responderam.
            <span className="block text-xs mt-1">Sem resposta: {missing.join(", ")}</span>
            <div className="mt-2">
              <button
                onClick={handleRefreshClick}
                disabled={refreshing}
                className={`btn btn-ghost text-sm ${refreshing ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                {refreshing ? "Processando..." : "Atualizar respostas"}
              </button>
            </div>
          </div>
        )}

        {missing.length === 0 && (
          <div className="mt-2">
            <button
              onClick={handleRefreshClick}
              disabled={refreshing}
              className={`btn btn-ghost text-sm ${refreshing ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              {refreshing ? "Processando..." : "Atualizar respostas"}
            </button>
          </div>
        )}
      </div>

      {/* TABELA DE DISPONIBILIDADE */}
      <div>
        <h3 className="font-semibold text-base mb-2">Tabela de Disponibilidade</h3>
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Dia/Turno</th>
                <th className="border px-3 py-2 text-left">Disponíveis (ordem alfabética)</th>
              </tr>
            </thead>
            <tbody>
              {state.days.map((day) => {
                const names = availNamesByDay[day.id] || [];
                return (
                  <tr key={day.id}>
                    <td className="border px-3 py-2">{day.label}</td>
                    <td className="border px-3 py-2">
                      {names.length ? names.join(", ") : <span className="text-red-600">— ninguém disponível</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABELA DE SELEÇÃO */}
      <div>
        <h3 className="font-semibold text-base mb-2">Tabela de Seleção</h3>
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Dia/Turno</th>
                <th className="border px-3 py-2 text-left">Escalação (até 15 nomes)</th>
              </tr>
            </thead>
            <tbody>
              {state.days.map((day) => {
                const slotValues = selects[day.id] || Array(SLOTS_PER_DAY).fill("");
                const optionIds = selectOptionsByDay[day.id] || [];
                return (
                  <tr key={day.id}>
                    <td className="border px-3 py-2 align-top">{day.label}</td>
                    <td className="border px-3 py-2">
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                        {slotValues.map((val, idx) => (
                          <select
                            key={idx}
                            className="input text-xs py-1 px-2"
                            value={val}
                            onChange={(e) => setSelectCell(day.id, idx, e.target.value)}
                          >
                            <option value="">- Selecionar -</option>
                            {optionIds.map((sid) => (
                              <option key={sid} value={sid}>
                                {labelOf(sid)}
                              </option>
                            ))}
                          </select>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTÃO ENVIAR ESCALA POR E-MAIL */}
      <div className="space-y-3">
        <button onClick={handleSendEmailsClick} className="btn btn-primary text-sm">
          {isSendingEmails ? "Processando..." : "Enviar e-mails"}
        </button>

        {/* TABELA FINAL EDITÁVEL (só aparece depois de enviar) */}
        {finalPack && (
          <div className="border rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">Escala enviada (editável)</h3>
              <div className="text-xs text-gray-500">
                Visível até {new Date(finalPack.expiresAt).toLocaleString("pt-BR")}
              </div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border px-3 py-2 text-left">Dia/Turno</th>
                    <th className="border px-3 py-2 text-left">Escalados</th>
                  </tr>
                </thead>
                <tbody>
                  {state.days.map((day) => {
                    const currentIds = finalPack.currentByDayId[day.id] || [];
                    const availableIds = (selectOptionsByDay[day.id] || []).filter((sid) => !currentIds.includes(sid));

                    const picks = addPick[day.id] || Array(ADD_SLOTS).fill("");

                    return (
                      <tr key={day.id}>
                        <td className="border px-3 py-2 align-top">{day.label}</td>
                        <td className="border px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {currentIds.map((sid) => (
                              <select
                                key={`cur-${sid}`}
                                className="input text-xs py-1 px-2"
                                value={sid}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "__REMOVE__") removeFromFinal(day.id, sid);
                                }}
                              >
                                <option value={sid}>{labelOf(sid)}</option>
                                <option value="__REMOVE__">Remover</option>
                              </select>
                            ))}

                            {Array.from({ length: ADD_SLOTS }).map((_, i) => (
                              <select
                                key={`add-${day.id}-${i}`}
                                className="input text-xs py-1 px-2"
                                value={picks[i] || ""}
                                onChange={(e) => {
                                  const sid = e.target.value;
                                  setAddPick((prev) => ({
                                    ...prev,
                                    [day.id]: (prev[day.id] || []).map((v, idx) => (idx === i ? sid : v)),
                                  }));
                                  if (sid) {
                                    addToFinal(day.id, sid);
                                    // reseta este select para "Adicionar..."
                                    setAddPick((prev) => ({
                                      ...prev,
                                      [day.id]: (prev[day.id] || []).map((v, idx) => (idx === i ? "" : v)),
                                    }));
                                  }
                                }}
                              >
                                <option value="">Adicionar...</option>
                                {availableIds.map((sid) => (
                                  <option key={`opt-${day.id}-${sid}`} value={sid}>
                                    {labelOf(sid)}
                                  </option>
                                ))}
                              </select>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleSendUpdatedEmails}
              className={`btn btn-primary text-sm ${updatingEmails ? "opacity-70 cursor-not-allowed" : ""}`}
              disabled={updatingEmails}
            >
              {updatingEmails ? "Processando..." : "Mandar e-mails atualizados"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ======== DASHBOARD ===========

type DashboardMeta = {
  minDate: string;
  maxDate: string;
  groups: string[];
  items: string[];
  itemsByGroup: Record<string, string[]>;
};

type DashboardRow = {
  dt_contabil: string;
  grupo: string;
  descricao: string;
  qtd: number;
  vl_servico_informado: number;
  vl_servico_calculado: number;
  vl_total: number;
};

type GraphPoint = { label: string; faturamento: number };
type GraphWeekdayPoint = {
  label: string;
  domingo: number; segunda: number; terca: number; quarta: number; quinta: number; sexta: number; sabado: number;
};

function GraphsTab() {
  const [monthly, setMonthly] = useState<GraphPoint[]>([]);
  const [weekly, setWeekly] = useState<GraphPoint[]>([]);
  const [weeklyByWeekday, setWeeklyByWeekday] = useState<GraphWeekdayPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

  const fmtMonthLabel = (s: string) => {
    // s = "YYYY-MM"
    const [y, m] = s.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  };

  const fmtWeekLabel = (s: string) => {
    // s = "YYYY-MM-DD" (segunda)
    const [y, m, d] = s.split("-");
    return `${d}/${m}`;
  };

  const load = async () => {
    if (!SYNC_ENDPOINT) return;
    setLoading(true);
    try {
      const url = `${SYNC_ENDPOINT}?action=dashboard_graphs`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || "Resposta inválida (graphs).");

      setMonthly(Array.isArray(data.monthly) ? data.monthly : []);
      setWeekly(Array.isArray(data.weekly) ? data.weekly : []);
      setWeeklyByWeekday(Array.isArray(data.weeklyByWeekday) ? data.weeklyByWeekday : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SYNC_ENDPOINT) {
    return <div className="text-sm text-red-600">Nenhum endpoint de sincronização configurado.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-4 bg-white space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Gráfico 1 — Faturamento mensal (últimos 12 meses)</h3>
          <button className="btn btn-ghost text-sm" onClick={load} disabled={loading}>
            {loading ? "Processando..." : "Recarregar"}
          </button>
        </div>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tickFormatter={fmtMonthLabel} />
              <YAxis tickFormatter={(v: string | number) => fmtMoney(Number(v)).replace("R$", "").trim()} />
              <Tooltip
                formatter={(v: string | number) => fmtMoney(Number(v))}
                labelFormatter={(l: string | number) => fmtMonthLabel(String(l))}
              />
              <Line type="monotone" dataKey="faturamento" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white space-y-2">
        <h3 className="font-semibold text-base">Gráfico 2 — Faturamento semanal (últimos 4 meses)</h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tickFormatter={fmtWeekLabel} />
              <YAxis tickFormatter={(v: string | number) => fmtMoney(Number(v)).replace("R$", "").trim()} />
              <Tooltip
                formatter={(v: string | number) => fmtMoney(Number(v))}
                labelFormatter={(l: string | number) => fmtWeekLabel(String(l))}
              />
              <Line type="monotone" dataKey="faturamento" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white space-y-2">
        <h3 className="font-semibold text-base">Gráfico 3 — Faturamento por dia da semana (últimos 4 meses)</h3>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={weeklyByWeekday}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tickFormatter={fmtWeekLabel} />
              <YAxis tickFormatter={(v: string | number) => fmtMoney(Number(v)).replace("R$", "").trim()} />
              <Tooltip
                formatter={(v: string | number) => fmtMoney(Number(v))}
                labelFormatter={(l: string | number) => `Semana de ${fmtWeekLabel(String(l))}`}
              />
              <Legend />
              <Line type="monotone" dataKey="domingo" dot={false} />
              <Line type="monotone" dataKey="segunda" dot={false} />
              <Line type="monotone" dataKey="terca" dot={false} />
              <Line type="monotone" dataKey="quarta" dot={false} />
              <Line type="monotone" dataKey="quinta" dot={false} />
              <Line type="monotone" dataKey="sexta" dot={false} />
              <Line type="monotone" dataKey="sabado" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}



function DashboardTab() {
  const [meta, setMeta] = useState<DashboardMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loading, setLoading] = useState(false);
  const [weekday, setWeekday] = useState<string>("Tudo");

  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");

  const [grupo, setGrupo] = useState<string>("Tudo");
  const [descricao, setDescricao] = useState<string>("Tudo");
  const itemOptions = useMemo(() => {
  if (!meta) return [];
  if (grupo === "Tudo") return meta.items || [];
  return meta.itemsByGroup?.[grupo] || [];
  }, [meta, grupo]);

  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [totalVlTotal, setTotalVlTotal] = useState<number>(0);
  const [totalInformado, setTotalInformado] = useState<number>(0);
  const [totalCalculado, setTotalCalculado] = useState<number>(0);
  const [totalQtd, setTotalQtd] = useState<number>(0);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

  const loadMeta = async () => {
    if (!SYNC_ENDPOINT) return;
    setLoadingMeta(true);
    try {
      const url = `${SYNC_ENDPOINT}?action=dashboard_base_meta`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || "Resposta inválida (meta).");

      const m: DashboardMeta = {
        minDate: String(data.minDate || ""),
        maxDate: String(data.maxDate || ""),
        groups: Array.isArray(data.groups) ? data.groups : [],
        items: Array.isArray(data.items) ? data.items : [],
        itemsByGroup:
          data.itemsByGroup && typeof data.itemsByGroup === "object"
            ? data.itemsByGroup
            : {},
      };

      setMeta(m);
      // defaults iniciais
      if (!start && m.minDate) setStart(m.minDate);
      if (!end && m.maxDate) setEnd(m.maxDate);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMeta(false);
    }
  };

  const loadRows = async () => {
    if (!SYNC_ENDPOINT) return;
    if (!start || !end) return;

    // evita range invertido (não altera o input, só a consulta)
    const [s, e] = start > end ? [end, start] : [start, end];

    setLoading(true);
    try {
      const url =
        `${SYNC_ENDPOINT}?action=dashboard_base_rows` +
        `&start=${encodeURIComponent(s)}` +
        `&end=${encodeURIComponent(e)}` +
        `&grupo=${encodeURIComponent(grupo)}` +
        `&descricao=${encodeURIComponent(descricao)}` +
        `&weekday=${encodeURIComponent(weekday)}` +
        `&__ts=${Date.now()}`; // cache-buster

      const resp = await fetch(url, { cache: "no-store" });
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || "Resposta inválida (rows).");

      setRows(Array.isArray(data.rows) ? (data.rows as DashboardRow[]) : []);
      setTotalVlTotal(Number(data.totalVlTotal || 0));
      setTotalInformado(Number(data.totalInformado || 0));
      setTotalCalculado(Number(data.totalCalculado || 0));
      setTotalQtd(Number(data.totalQtd || 0));
    } catch (err) {
      console.error(err);
      alert(`Erro ao filtrar dados do Dashboard. ${String(err)}`);
      // se der erro, limpa a tabela para não parecer que o filtro foi ignorado
      setRows([]);
      setTotalVlTotal(0);
      setTotalInformado(0);
      setTotalCalculado(0);
      setTotalQtd(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega tabela automaticamente quando filtros mudam (mantém simples e direto)
  useEffect(() => {
    if (!meta) return;
    if (!start || !end) return;
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, start, end, grupo, descricao, weekday]);

  if (!SYNC_ENDPOINT) {
    return <div className="text-sm text-red-600">Nenhum endpoint de sincronização configurado.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Análise 1</h3>
          <button
            onClick={loadRows}
            disabled={loading || !start || !end}
            className={`btn btn-ghost text-sm ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {loading ? "Processando..." : "Atualizar"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data inicial (dt_contabil)</label>
            <input
              type="date"
              className="input w-full"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={loadingMeta}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data final (dt_contabil)</label>
            <input
              type="date"
              className="input w-full"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={loadingMeta}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Categorias (grupo)</label>
            <select
              className="input w-full"
              value={grupo}
              onChange={(e) => {
                const g = e.target.value;
                setGrupo(g);
                setDescricao((curr) => {
                  if (curr === "Tudo") return "Tudo";
                  const opts = g === "Tudo" ? (meta?.items || []) : (meta?.itemsByGroup?.[g] || []);
                  return opts.includes(curr) ? curr : "Tudo";
                });
              }}
            >
              <option value="Tudo">Tudo</option>
              {(meta?.groups || []).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Item (descricao)</label>
            <select
              className="input w-full"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={loadingMeta}
            >
              <option value="Tudo">Tudo</option>
              {itemOptions.map((it) => (
                <option key={it} value={it}>{it}</option>
              ))}
            </select>
          </div>
        </div>

          <div className="space-y-1">
              <label className="text-sm text-gray-600">Dia da semana</label>
              <select className="input w-full" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                <option value="Tudo">Tudo</option>
                <option value="domingo">Domingo</option>
                <option value="segunda">Segunda</option>
                <option value="terca">Terça</option>
                <option value="quarta">Quarta</option>
                <option value="quinta">Quinta</option>
                <option value="sexta">Sexta</option>
                <option value="sabado">Sábado</option>
            </select>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">dt_contabil</th>
                <th className="border px-3 py-2 text-left">grupo</th>
                <th className="border px-3 py-2 text-left">descricao</th>
                <th className="border px-3 py-2 text-right">qtd</th>
                <th className="border px-3 py-2 text-right">vl_servico_informado</th>
                <th className="border px-3 py-2 text-right">vl_servico_calculado</th>
                <th className="border px-3 py-2 text-right">vl_total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx}>
                  <td className="border px-3 py-2">{r.dt_contabil}</td>
                  <td className="border px-3 py-2">{r.grupo}</td>
                  <td className="border px-3 py-2">{r.descricao}</td>
                  <td className="border px-3 py-2 text-right">{r.qtd}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(r.vl_servico_informado)}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(r.vl_servico_calculado)}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(r.vl_total)}</td>
                </tr>
              ))}

              <tr className="bg-gray-50 font-semibold">
                <td className="border px-3 py-2" colSpan={3}>Total</td>
                <td className="border px-3 py-2 text-right">{totalQtd}</td>
                <td className="border px-3 py-2 text-right">{fmtMoney(totalInformado)}</td>
                <td className="border px-3 py-2 text-right">{fmtMoney(totalCalculado)}</td>
                <td className="border px-3 py-2 text-right">{fmtMoney(totalVlTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {rows.length === 0 && !loading && (
          <div className="text-sm text-gray-500">Nenhum registro para os filtros selecionados.</div>
        )}
      </div>
    </div>
  );
}


// ======== DRE — FLUXO DE CAIXA AVANÇADO ========

const DRE_CONTAS = [
  // 3 — RECEITA/FATURAMENTO
  { c:'3.1.1',  n:'Receita em dinheiro',               g:'3', sg:'3.1' },
  { c:'3.1.2',  n:'Receitas cartões de débito',        g:'3', sg:'3.1' },
  { c:'3.1.3',  n:'Receitas cartões de crédito',       g:'3', sg:'3.1' },
  { c:'3.1.6',  n:'Receitas Pix',                      g:'3', sg:'3.1' },
  { c:'3.2.99', n:'Taxa de serviço de 10%',            g:'3', sg:'3.2' },
  // 4 — CUSTOS VARIÁVEIS
  { c:'4.1.1',  n:'Simples nacional',                  g:'4', sg:'4.1' },
  { c:'4.1.2',  n:'Taxas de cartões',                  g:'4', sg:'4.1' },
  { c:'4.1.99', n:'Outros custos financeiros',         g:'4', sg:'4.1' },
  { c:'4.2.2',  n:'Insumos',                           g:'4', sg:'4.2' },
  { c:'4.2.3',  n:'Bebidas',                           g:'4', sg:'4.2' },
  { c:'4.2.5',  n:'Vinhos',                            g:'4', sg:'4.2' },
  { c:'4.2.99', n:'Outros custos com produtos',        g:'4', sg:'4.2' },
  { c:'4.3.1',  n:'Custos com embalagens',             g:'4', sg:'4.3' },
  { c:'4.4.1',  n:'Transportadoras',                   g:'4', sg:'4.4' },
  { c:'4.4.99', n:'Outros custos mão de obra var.',    g:'4', sg:'4.4' },
  { c:'4.5.1',  n:'Gás',                               g:'4', sg:'4.5' },
  { c:'4.5.2',  n:'Lenha',                             g:'4', sg:'4.5' },
  { c:'4.5.99', n:'Outros custos com vendas',          g:'4', sg:'4.5' },
  // 5 — DESPESAS FIXAS
  { c:'5.1.1',  n:'Tarifas bancárias',                 g:'5', sg:'5.1' },
  { c:'5.1.99', n:'Outros custos financeiros',         g:'5', sg:'5.1' },
  { c:'5.2.1',  n:'Telefone e internet',               g:'5', sg:'5.2' },
  { c:'5.2.3',  n:'Energia elétrica',                  g:'5', sg:'5.2' },
  { c:'5.2.4',  n:'Aluguel e condomínio',              g:'5', sg:'5.2' },
  { c:'5.2.6',  n:'IPTU e taxas públicas',             g:'5', sg:'5.2' },
  { c:'5.2.7',  n:'Táxi / Uber',                       g:'5', sg:'5.2' },
  { c:'5.2.11', n:'Contador',                          g:'5', sg:'5.2' },
  { c:'5.2.12', n:'Mensalidade de softwares',          g:'5', sg:'5.2' },
  { c:'5.2.13', n:'Alarme monitorado / Segurança',     g:'5', sg:'5.2' },
  { c:'5.2.99', n:'Outras despesas administrativas',   g:'5', sg:'5.2' },
  { c:'5.3.1',  n:'Salário de funcionários',           g:'5', sg:'5.3' },
  { c:'5.3.3',  n:'VT e VR',                           g:'5', sg:'5.3' },
  { c:'5.3.6',  n:'INSS / Federação / Sindicato / IR', g:'5', sg:'5.3' },
  { c:'5.3.8',  n:'Exames ocupacionais',               g:'5', sg:'5.3' },
  { c:'5.3.9',  n:'Pro-Labore',                        g:'5', sg:'5.3' },
  { c:'5.3.11', n:'Confraternizações / Festas',        g:'5', sg:'5.3' },
  { c:'5.3.12', n:'Diarista',                          g:'5', sg:'5.3' },
  { c:'5.3.99', n:'Outras despesas com pessoal',       g:'5', sg:'5.3' },
  { c:'5.4.1',  n:'Manutenção de máq. e equip.',       g:'5', sg:'5.4' },
  { c:'5.4.2',  n:'Serviços técnicos em geral',        g:'5', sg:'5.4' },
  { c:'5.4.3',  n:'Materiais de expediente',           g:'5', sg:'5.4' },
  { c:'5.4.4',  n:'Mat. de limpeza e manutenção',      g:'5', sg:'5.4' },
  { c:'5.4.99', n:'Outras desp. com materiais',        g:'5', sg:'5.4' },
  { c:'5.5.1',  n:'Gasolina / Combustível',            g:'5', sg:'5.5' },
  { c:'5.5.2',  n:'Manutenção de veículos',            g:'5', sg:'5.5' },
  { c:'5.5.4',  n:'Estacionamento / Pedágios',         g:'5', sg:'5.5' },
  { c:'5.5.99', n:'Outras desp. com veículos',         g:'5', sg:'5.5' },
  // 6 — INVESTIMENTOS
  { c:'6.1.1',  n:'Papelaria (folder, cartão...)',     g:'6', sg:'6.1' },
  { c:'6.1.3',  n:'Mídias / Propaganda',               g:'6', sg:'6.1' },
  { c:'6.1.4',  n:'Realização de eventos',             g:'6', sg:'6.1' },
  { c:'6.1.5',  n:'Prestadores de serv. marketing',    g:'6', sg:'6.1' },
  { c:'6.1.99', n:'Outros invest. em marketing',       g:'6', sg:'6.1' },
  { c:'6.2.1',  n:'Compra de equip. de informática',   g:'6', sg:'6.2' },
  { c:'6.2.2',  n:'Reformas / Estrutura',              g:'6', sg:'6.2' },
  { c:'6.2.3',  n:'Mobiliário',                        g:'6', sg:'6.2' },
  { c:'6.2.4',  n:'Compra de veículos',                g:'6', sg:'6.2' },
  { c:'6.2.99', n:'Outros invest. bens materiais',     g:'6', sg:'6.2' },
  { c:'6.3.1',  n:'Consultoria',                       g:'6', sg:'6.3' },
  { c:'6.3.2',  n:'Treinamentos',                      g:'6', sg:'6.3' },
  { c:'6.3.99', n:'Outros invest. desenv. empresarial',g:'6', sg:'6.3' },
  { c:'6.4.99', n:'Outros investimentos',              g:'6', sg:'6.4' },
  // 7.1 — ENTRADAS NÃO OPERACIONAIS
  { c:'7.1.1',  n:'Empréstimos obtidos',               g:'7', sg:'7.1' },
  { c:'7.1.2',  n:'Capitalização dos sócios',          g:'7', sg:'7.1' },
  { c:'7.1.3',  n:'Venda de equipamentos usados',      g:'7', sg:'7.1' },
  { c:'7.1.99', n:'Outras entradas não operacionais',  g:'7', sg:'7.1' },
  // 7.2 — SAÍDAS NÃO OPERACIONAIS
  { c:'7.2.1',  n:'Pagamento de empréstimos',          g:'7', sg:'7.2' },
  { c:'7.2.2',  n:'Juros bancários e por atraso',      g:'7', sg:'7.2' },
  { c:'7.2.3',  n:'Pagamento de dívidas passadas',     g:'7', sg:'7.2' },
  { c:'7.2.4',  n:'Distribuição de lucros',            g:'7', sg:'7.2' },
  { c:'7.2.5',  n:'Juros de antecipação recebíveis',   g:'7', sg:'7.2' },
  { c:'7.2.99', n:'Outras saídas não operacionais',    g:'7', sg:'7.2' },
] as const;

const DRE_G: Record<string,string> = {
  '3':'Receita/Faturamento', '4':'Custos Variáveis', '5':'Despesas Fixas',
  '6':'Investimentos', '7':'Movimentações Não Operacionais',
};
const DRE_SG: Record<string,string> = {
  '3.1':'Receita de vendas', '3.2':'Outras receitas de vendas',
  '4.1':'Custos tributários/financeiros', '4.2':'Custos com produtos',
  '4.3':'Embalagens', '4.4':'Custo com frete', '4.5':'Outros custos',
  '5.1':'Despesas financeiras', '5.2':'Despesas administrativas',
  '5.3':'Despesas com pessoal', '5.4':'Materiais e equipamentos',
  '5.5':'Despesas com veículos',
  '6.1':'Invest. em marketing', '6.2':'Invest. em bens materiais',
  '6.3':'Invest. em desenv. empresarial', '6.4':'Outros investimentos',
  '7.1':'Entradas não operacionais', '7.2':'Saídas não operacionais',
};
const DRE_G_NEG = new Set(['4','5','6']);
const DRE_MESES_NM = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DRE_AZUL = '#233253';
const DRE_VERM = '#cf2a39';

type DreMonthData = Record<string,{esp:number;real:number}>;
type DreData = Record<number, DreMonthData>;
type DreTransacao = {
  id:string; tipo:'entrada'|'saida'; valor:number;
  data:string; plano_contas:string; realizado:boolean; historico:string;
  conta_bancaria:string; projeto_id:string;
};
type ContaBancaria = {id:string; nome:string; banco:string; tipo:string; saldo_inicial:number};
type DreTransferencia = {id:string; data:string; conta_origem:string; conta_destino:string; valor:number; historico:string};
type DrejProjeto = {id:string; nome:string; descricao:string; data:string; status:string};

function useContasBancarias(){
  const [contas,setContas]=useState<ContaBancaria[]>([]);
  const reload=async()=>{
    if(!SYNC_ENDPOINT) return;
    try{ const r=await fetch(`${SYNC_ENDPOINT}?action=contas_bancarias&_ts=${Date.now()}`);
      const j=await r.json(); if(j.ok) setContas(j.contas||[]); }catch{}
  };
  useEffect(()=>{reload();},[]);
  return{contas,reload};
}

function useProjetos(){
  const [projetos,setProjetos]=useState<DrejProjeto[]>([]);
  const reload=async()=>{
    if(!SYNC_ENDPOINT) return;
    try{ const r=await fetch(`${SYNC_ENDPOINT}?action=projetos&_ts=${Date.now()}`);
      const j=await r.json(); if(j.ok) setProjetos(j.projetos||[]); }catch{}
  };
  useEffect(()=>{reload();},[]);
  return{projetos,reload};
}

function useTransferencias(ano:number){
  const [transferencias,setTransferencias]=useState<DreTransferencia[]>([]);
  const reload=async()=>{
    if(!SYNC_ENDPOINT) return;
    try{ const r=await fetch(`${SYNC_ENDPOINT}?action=transferencias&ano=${ano}&_ts=${Date.now()}`);
      const j=await r.json(); if(j.ok) setTransferencias(j.transferencias||[]); }catch{}
  };
  useEffect(()=>{reload();},[ano]);
  return{transferencias,reload};
}

function aggregarTransacoes(ts:DreTransacao[], ano:number): DreData {
  const r:DreData={};
  for(let m=1;m<=12;m++) r[m]={};
  const as=String(ano);
  ts.forEach(t=>{
    const p=t.data.split('/');
    if(p.length!==3||p[2]!==as) return;
    const m=parseInt(p[1]);
    if(m<1||m>12) return;
    if(!r[m][t.plano_contas]) r[m][t.plano_contas]={esp:0,real:0};
    if(t.realizado) r[m][t.plano_contas].real+=t.valor;
    else            r[m][t.plano_contas].esp +=t.valor;
  });
  return r;
}

function useDreTransacoes(ano:number){
  const [ts,setTs]=useState<DreTransacao[]>([]);
  const [loading,setLoading]=useState(false);
  const reload=async()=>{
    if(!SYNC_ENDPOINT) return;
    setLoading(true);
    try{
      const r=await fetch(`${SYNC_ENDPOINT}?action=dre_transacoes&ano=${ano}&_ts=${Date.now()}`);
      const j=await r.json();
      if(j.ok) setTs(j.transacoes||[]);
    }catch{}
    finally{setLoading(false);}
  };
  useEffect(()=>{reload();},[ano]);
  return{transacoes:ts,loading,reload};
}

function dreCalcMes(md: DreMonthData) {
  const sumSg = (sg: string) =>
    DRE_CONTAS.filter(x => x.sg === sg).reduce(
      (a,x) => { const v=md[x.c]||{esp:0,real:0}; return {esp:a.esp+v.esp, real:a.real+v.real}; },
      {esp:0,real:0}
    );
  const sumG = (g: string) =>
    DRE_CONTAS.filter(x => x.g === g).reduce(
      (a,x) => { const v=md[x.c]||{esp:0,real:0}; return {esp:a.esp+v.esp, real:a.real+v.real}; },
      {esp:0,real:0}
    );
  const g3=sumG('3'), g4=sumG('4'), g5=sumG('5'), g6=sumG('6');
  const g71=sumSg('7.1'), g72=sumSg('7.2');
  const margem    = {esp:g3.esp-g4.esp,        real:g3.real-g4.real};
  const loai      = {esp:margem.esp-g5.esp,    real:margem.real-g5.real};
  const lo        = {esp:loai.esp-g6.esp,      real:loai.real-g6.real};
  const mov       = {esp:g71.esp-g72.esp,      real:g71.real-g72.real};
  const resultado = {esp:lo.esp+mov.esp,       real:lo.real+mov.real};
  return {g3,g4,g5,g6,g71,g72,margem,loai,lo,mov,resultado};
}

function DRETab() {
  const fmtR = (n:number) =>
    new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
  const fmtAV = (v:number, rec:number) =>
    rec ? (v/rec*100).toFixed(1)+'%' : '—';
  const todayStr = () => {
    const d=new Date();
    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  };
  const valColor = (v:number) => v<0 ? DRE_VERM : v===0 ? '#aaa' : '#1a1a1a';
  const VERDE = '#009249';

  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth()+1);
  const [sub, setSub] = useState<'lancar'|'lista'|'contas'|'projetos'|'mensal'|'anual'>('lancar');
  const {transacoes, loading, reload} = useDreTransacoes(ano);
  const {contas: contasBancarias, reload: reloadContas} = useContasBancarias();
  const {projetos, reload: reloadProjetos} = useProjetos();
  const {transferencias, reload: reloadTransferencias} = useTransferencias(ano);
  const lanc = useMemo(()=>aggregarTransacoes(transacoes,ano),[transacoes,ano]);
  // Fullscreen
  const dreRef = useRef<HTMLDivElement>(null);
  const [isFS, setIsFS] = useState(false);
  const toggleFS = async () => {
    try {
      if (!document.fullscreenElement) await dreRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  };
  useEffect(() => {
    const h = () => setIsFS(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // Form (Lançamentos)
  const [formTipo, setFormTipo] = useState<'entrada'|'saida'>('entrada');
  const [formValor, setFormValor] = useState('');
  const [formData, setFormData] = useState(todayStr());
  const [formRealizado, setFormRealizado] = useState(true);
  const [formPlano, setFormPlano] = useState('');
  const [planoSearch, setPlanoSearch] = useState('');
  const [showPlano, setShowPlano] = useState(false);
  const [formHistorico, setFormHistorico] = useState('');
  const [formConta, setFormConta] = useState('');
  const [formProjeto, setFormProjeto] = useState('');
  const [saving, setSaving] = useState(false);

  // Form — nova conta bancária
  const [showNovaConta, setShowNovaConta] = useState(false);
  const [novaContaNome, setNovaContaNome] = useState('');
  const [novaContaBanco, setNovaContaBanco] = useState('');
  const [novaContaTipo, setNovaContaTipo] = useState('corrente');
  const [novaContaSaldo, setNovaContaSaldo] = useState('');
  const [savingConta, setSavingConta] = useState(false);

  // Form — transferência entre contas
  const [trfOrigem, setTrfOrigem] = useState('');
  const [trfDestino, setTrfDestino] = useState('');
  const [trfValor, setTrfValor] = useState('');
  const [trfData, setTrfData] = useState(todayStr());
  const [trfHistorico, setTrfHistorico] = useState('');
  const [savingTrf, setSavingTrf] = useState(false);

  // Form — novo projeto
  const [showNovoProjeto, setShowNovoProjeto] = useState(false);
  const [projNome, setProjNome] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projData, setProjData] = useState(todayStr());
  const [savingProj, setSavingProj] = useState(false);
  const [selectedProjeto, setSelectedProjeto] = useState<string|null>(null);

  // Lista
  const [listaMes, setListaMes] = useState(0);

  // Collapsible
  const [expGroups, setExpGroups] = useState(new Set(['3','4','5','6','7']));
  const [expSgs, setExpSgs] = useState(new Set<string>());
  const toggleGroup = (id:string) => setExpGroups(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleSg = (id:string) => setExpSgs(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const expandAll = () => { setExpGroups(new Set(['3','4','5','6','7'])); setExpSgs(new Set(DRE_CONTAS.map(ct=>ct.sg))); };
  const collapseAll = () => { setExpGroups(new Set(['3','4','5','6','7'])); setExpSgs(new Set()); };

  // Plano de contas filtrado por tipo
  const contasPorTipo = formTipo==='entrada'
    ? DRE_CONTAS.filter(ct=>ct.g==='3'||ct.sg==='7.1')
    : DRE_CONTAS.filter(ct=>DRE_G_NEG.has(ct.g)||ct.sg==='7.2');
  const filteredContas = planoSearch
    ? contasPorTipo.filter(ct=>ct.c.includes(planoSearch)||ct.n.toLowerCase().includes(planoSearch.toLowerCase()))
    : contasPorTipo;

  const handleSave = async () => {
    if (!formValor||!formData||!formPlano) { alert('Preencha Valor, Data e Conta DRE.'); return; }
    setSaving(true);
    try {
      await fetch(SYNC_ENDPOINT!, {
        method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'save_dre_transacao', tipo:formTipo,
          valor: parseFloat(formValor.replace(',','.')) || 0,
          data: formData, plano_contas: formPlano,
          realizado: String(formRealizado), historico: formHistorico,
          conta_bancaria: formConta, projeto_id: formProjeto,
        }),
      });
      setFormValor(''); setFormData(todayStr()); setFormRealizado(true);
      setFormPlano(''); setPlanoSearch(''); setFormHistorico('');
      setTimeout(reload, 2500);
      alert('Lançamento salvo!');
    } catch { alert('Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id:string) => {
    if (!confirm('Excluir este lançamento?')) return;
    await fetch(SYNC_ENDPOINT!, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action:'delete_dre_transacao', id}),
    });
    setTimeout(reload, 2000);
  };

  const handleToggleRealizado = async (t:DreTransacao) => {
    await fetch(SYNC_ENDPOINT!, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action:'update_dre_transacao', id:t.id, realizado:String(!t.realizado)}),
    });
    setTimeout(reload, 2000);
  };

  // Handlers — Contas Bancárias
  const handleSaveConta = async () => {
    if (!novaContaNome) { alert('Informe o nome da conta.'); return; }
    setSavingConta(true);
    try {
      await fetch(SYNC_ENDPOINT!, { method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'save_conta_bancaria', nome:novaContaNome,
          banco:novaContaBanco, tipo:novaContaTipo,
          saldo_inicial: parseFloat(novaContaSaldo.replace(',','.')) || 0 }),
      });
      setNovaContaNome(''); setNovaContaBanco(''); setNovaContaSaldo(''); setNovaContaTipo('corrente');
      setShowNovaConta(false);
      setTimeout(reloadContas, 2000);
    } catch { alert('Erro ao salvar.'); }
    finally { setSavingConta(false); }
  };

  const handleDeleteConta = async (id:string) => {
    if (!confirm('Excluir esta conta? Os lançamentos associados não serão apagados.')) return;
    await fetch(SYNC_ENDPOINT!, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'delete_conta_bancaria', id }),
    });
    setTimeout(reloadContas, 2000);
  };

  // Handlers — Transferências
  const handleSaveTransferencia = async () => {
    if (!trfOrigem||!trfDestino||!trfValor||!trfData) { alert('Preencha todos os campos.'); return; }
    if (trfOrigem === trfDestino) { alert('Origem e destino devem ser contas diferentes.'); return; }
    setSavingTrf(true);
    try {
      await fetch(SYNC_ENDPOINT!, { method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'save_transferencia',
          data:trfData, conta_origem:trfOrigem, conta_destino:trfDestino,
          valor: parseFloat(trfValor.replace(',','.')) || 0, historico:trfHistorico }),
      });
      setTrfOrigem(''); setTrfDestino(''); setTrfValor(''); setTrfData(todayStr()); setTrfHistorico('');
      setTimeout(reloadTransferencias, 2000);
    } catch { alert('Erro ao salvar.'); }
    finally { setSavingTrf(false); }
  };

  const handleDeleteTransferencia = async (id:string) => {
    if (!confirm('Excluir esta transferência?')) return;
    await fetch(SYNC_ENDPOINT!, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'delete_transferencia', id }),
    });
    setTimeout(reloadTransferencias, 2000);
  };

  // Handlers — Projetos
  const handleSaveProjeto = async () => {
    if (!projNome) { alert('Informe o nome do projeto.'); return; }
    setSavingProj(true);
    try {
      await fetch(SYNC_ENDPOINT!, { method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'save_projeto', nome:projNome,
          descricao:projDesc, data:projData, status:'ativo' }),
      });
      setProjNome(''); setProjDesc(''); setProjData(todayStr());
      setShowNovoProjeto(false);
      setTimeout(reloadProjetos, 2000);
    } catch { alert('Erro ao salvar.'); }
    finally { setSavingProj(false); }
  };

  const handleDeleteProjeto = async (id:string) => {
    if (!confirm('Excluir este projeto?')) return;
    await fetch(SYNC_ENDPOINT!, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'delete_projeto', id }),
    });
    setTimeout(reloadProjetos, 2000);
  };

  const handleToggleProjetoStatus = async (p:DrejProjeto) => {
    await fetch(SYNC_ENDPOINT!, { method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'update_projeto', id:p.id, status:p.status==='ativo'?'encerrado':'ativo' }),
    });
    setTimeout(reloadProjetos, 2000);
  };

  // Saldo por conta = saldo_inicial + entradas(realizado) - saidas(realizado) +/- transferencias
  const saldoConta = (contaId:string) => {
    const c = contasBancarias.find(x=>x.id===contaId);
    const si = c?.saldo_inicial || 0;
    const txBal = transacoes.reduce((s,t) => {
      if (t.conta_bancaria !== contaId || !t.realizado) return s;
      return t.tipo === 'entrada' ? s + t.valor : s - t.valor;
    }, 0);
    const trfBal = transferencias.reduce((s,tr) => {
      if (tr.conta_origem === contaId) return s - tr.valor;
      if (tr.conta_destino === contaId) return s + tr.valor;
      return s;
    }, 0);
    return si + txBal + trfBal;
  };

  // Totais de projeto
  const projetoStats = (projetoId:string) => {
    const ts = transacoes.filter(t=>t.projeto_id===projetoId);
    const entradas = ts.filter(t=>t.tipo==='entrada').reduce((s,t)=>s+t.valor,0);
    const saidas   = ts.filter(t=>t.tipo==='saida').reduce((s,t)=>s+t.valor,0);
    return { entradas, saidas, saldo: entradas - saidas, count: ts.length };
  };

  // Lista filtrada e ordenada
  const listaFiltrada = [...transacoes]
    .filter(t => { if (!listaMes) return true; const p=t.data.split('/'); return p.length===3&&parseInt(p[1])===listaMes; })
    .sort((a,b) => { const pa=a.data.split('/'),pb=b.data.split('/'); return new Date(+pb[2],+pb[1]-1,+pb[0]).getTime()-new Date(+pa[2],+pa[1]-1,+pa[0]).getTime(); });

  // Subgrupos únicos de um grupo em ordem
  const sgsOf = (g:string) => {
    const seen = new Set<string>(); const res: string[] = [];
    DRE_CONTAS.filter(ct=>ct.g===g).forEach(ct=>{ if(!seen.has(ct.sg)){seen.add(ct.sg);res.push(ct.sg);} });
    return res;
  };

  // Totais anuais somando todos os meses
  const anualCalcKey = (key: keyof ReturnType<typeof dreCalcMes>) =>
    Array.from({length:12},(_,i)=>i+1).reduce((a,m) => {
      const c = dreCalcMes(lanc[m]||{});
      const v = c[key] as {esp:number;real:number};
      return {esp:a.esp+v.esp, real:a.real+v.real};
    }, {esp:0,real:0});

  const anualContaTotal = (cod:string) =>
    Array.from({length:12},(_,i)=>i+1).reduce((a,m) => {
      const v = (lanc[m]||{})[cod] || {esp:0,real:0};
      return {esp:a.esp+v.esp, real:a.real+v.real};
    }, {esp:0,real:0});

  const recByMes: Record<number,number> = {};
  for (let m=1;m<=12;m++) {
    recByMes[m] = DRE_CONTAS.filter(ct=>ct.g==='3')
      .reduce((s,ct) => s+((lanc[m]||{})[ct.c]?.real||0), 0);
  }

  // ── Styles tabela anual ──
  const thBase: React.CSSProperties = {background:DRE_AZUL,color:'#fff',padding:'4px 6px',textAlign:'right',fontSize:11,whiteSpace:'nowrap'};
  const thLeft: React.CSSProperties = {...thBase,textAlign:'left',position:'sticky',left:0,minWidth:220,zIndex:3};
  const tdNum = (v:number): React.CSSProperties =>
    ({textAlign:'right',padding:'2px 6px',fontSize:11,color:v===0?'#ccc':valColor(v)});
  const tdTotR: React.CSSProperties = {background:'#f0f4ff',fontWeight:600,textAlign:'right',padding:'3px 6px',fontSize:11};
  const tdTotL: React.CSSProperties = {...tdTotR,textAlign:'left',position:'sticky',left:0,paddingLeft:8};
  const tdRes = (v:number): React.CSSProperties =>
    ({background:v>=0?DRE_AZUL:DRE_VERM,color:'#fff',fontWeight:700,textAlign:'right',padding:'4px 6px',fontSize:11});
  const tdResL = (v:number): React.CSSProperties => ({...tdRes(v),textAlign:'left',position:'sticky',left:0,padding:'4px 8px'});

  // Mensal: cálculo do mês selecionado
  const mdMes = lanc[mes] || {};
  const calcM = dreCalcMes(mdMes);
  const recM  = calcM.g3.real;

  const fsBig = isFS ? 1.35 : 1;

  const renderResRow = (label:string, esp:number, real:number, rec:number) => {
    const bg = real>=0 ? DRE_AZUL : DRE_VERM;
    return (
      <tr style={{background:bg,color:'#fff',fontWeight:700,fontSize:14*fsBig}}>
        <td style={{padding:`${6*fsBig}px 8px`,whiteSpace:'nowrap'}}>{label}</td>
        <td style={{textAlign:'right',padding:`${6*fsBig}px 8px`,opacity:.7}}>{esp?fmtR(esp):'—'}</td>
        <td style={{textAlign:'right',padding:`${6*fsBig}px 8px`}}>{fmtR(real)}</td>
        <td style={{textAlign:'right',padding:`${6*fsBig}px 8px`,opacity:.8,fontSize:12*fsBig}}>{rec?fmtAV(real,rec):'—'}</td>
      </tr>
    );
  };

  // Plano de contas dropdown position ref
  const planoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showPlano) return;
    const h = (e:MouseEvent) => { if (planoRef.current && !planoRef.current.contains(e.target as Node)) setShowPlano(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showPlano]);

  return (
    <div ref={dreRef} style={{display:'flex',flexDirection:'column',gap:0,
      background: isFS ? '#fff' : undefined,
      padding: isFS ? '24px' : undefined,
      minHeight: isFS ? '100vh' : undefined}}>

      {/* ── Toolbar ── */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        {/* Sub-abas */}
        <div style={{display:'flex',gap:0,borderBottom:`2px solid #e5e7eb`,flex:1,flexWrap:'wrap'}}>
          {([
            ['lancar','Lançar'],['lista','Lista'],
            ['contas','🏦 Contas'],['projetos','📁 Projetos'],
            ['mensal','Visão Mensal'],['anual','Visão Anual'],
          ] as const).map(([s,label]) => (
            <button key={s} onClick={()=>setSub(s as any)}
              style={{padding:`8px ${isFS?22:14}px`,border:'none',cursor:'pointer',
                fontWeight:sub===s?700:400,
                color:sub===s?DRE_AZUL:'#6b7280',
                borderBottom:sub===s?`3px solid ${DRE_AZUL}`:'3px solid transparent',
                background:'transparent',fontSize:13*fsBig,marginBottom:-2,transition:'all .15s',
                whiteSpace:'nowrap'}}>
              {label}
            </button>
          ))}
          {loading && <span style={{marginLeft:'auto',fontSize:12,color:'#9ca3af',alignSelf:'center',padding:'0 8px'}}>Carregando…</span>}
        </div>

        {/* Botão fullscreen */}
        <button onClick={toggleFS}
          title={isFS?'Sair da tela cheia':'Tela cheia'}
          style={{flexShrink:0,padding:'7px 12px',border:`1px solid ${DRE_AZUL}`,borderRadius:7,
            background:isFS?DRE_AZUL:'transparent',color:isFS?'#fff':DRE_AZUL,
            cursor:'pointer',fontWeight:600,fontSize:13,whiteSpace:'nowrap'}}>
          {isFS ? '⛶ Sair' : '⛶ Tela Cheia'}
        </button>
      </div>

      {/* ── Seletor compartilhado ── */}
      <div style={{display:'flex',gap:12,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <label style={{fontWeight:600,fontSize:14*fsBig,color:'#374151'}}>Ano</label>
        <select value={ano} onChange={e=>setAno(Number(e.target.value))}
          style={{border:'1px solid #d1d5db',borderRadius:6,padding:'5px 10px',fontSize:14*fsBig}}>
          {[2024,2025,2026,2027,2028].map(y=><option key={y}>{y}</option>)}
        </select>
        {(sub==='mensal') && <>
          <label style={{fontWeight:600,fontSize:14*fsBig,color:'#374151'}}>Mês</label>
          <select value={mes} onChange={e=>setMes(Number(e.target.value))}
            style={{border:'1px solid #d1d5db',borderRadius:6,padding:'5px 10px',fontSize:14*fsBig}}>
            {DRE_MESES_NM.map((nm,i)=><option key={i+1} value={i+1}>{nm}</option>)}
          </select>
        </>}
        {(sub==='mensal'||sub==='anual') && <>
          <button onClick={expandAll}
            style={{marginLeft:'auto',padding:'5px 12px',fontSize:12*fsBig,border:'1px solid #d1d5db',
              borderRadius:6,cursor:'pointer',background:'#f9fafb',color:'#374151'}}>
            Expandir tudo
          </button>
          <button onClick={collapseAll}
            style={{padding:'5px 12px',fontSize:12*fsBig,border:'1px solid #d1d5db',
              borderRadius:6,cursor:'pointer',background:'#f9fafb',color:'#374151'}}>
            Colapsar tudo
          </button>
        </>}
      </div>

      {/* ══════════════════════════════════════
          LANÇAR (Yampa-style form)
      ══════════════════════════════════════ */}
      {sub==='lancar' && (
        <div style={{maxWidth:520,display:'flex',flexDirection:'column',gap:0,
          border:'1px solid #e5e7eb',borderRadius:12,overflow:'hidden',
          boxShadow:'0 2px 12px rgba(0,0,0,.07)'}}>

          {/* Tabs Entrada / Saída */}
          <div style={{display:'flex'}}>
            <button onClick={()=>{setFormTipo('entrada');setFormPlano('');setPlanoSearch('');}}
              style={{flex:1,padding:'14px',border:'none',cursor:'pointer',fontWeight:700,
                fontSize:15,background:formTipo==='entrada'?VERDE:'#f3f4f6',
                color:formTipo==='entrada'?'#fff':'#6b7280',transition:'all .15s'}}>
              ↑ Entrada
            </button>
            <button onClick={()=>{setFormTipo('saida');setFormPlano('');setPlanoSearch('');}}
              style={{flex:1,padding:'14px',border:'none',cursor:'pointer',fontWeight:700,
                fontSize:15,background:formTipo==='saida'?DRE_VERM:'#f3f4f6',
                color:formTipo==='saida'?'#fff':'#6b7280',transition:'all .15s'}}>
              ↓ Saída
            </button>
          </div>

          <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:14}}>
            {/* Valor */}
            <div>
              <label style={{display:'block',fontWeight:600,fontSize:13,color:'#374151',marginBottom:4}}>Valor (R$)</label>
              <input type="number" min="0" step="0.01" placeholder="0,00"
                value={formValor} onChange={e=>setFormValor(e.target.value)}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:8,
                  padding:'10px 12px',fontSize:20,fontWeight:700,color:formTipo==='entrada'?VERDE:DRE_VERM}} />
            </div>

            {/* Data */}
            <div>
              <label style={{display:'block',fontWeight:600,fontSize:13,color:'#374151',marginBottom:4}}>Data</label>
              <input type="text" placeholder="DD/MM/AAAA"
                value={formData} onChange={e=>setFormData(e.target.value)}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:8,
                  padding:'9px 12px',fontSize:14}} />
            </div>

            {/* Já recebi/paguei toggle */}
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontWeight:600,fontSize:13,color:'#374151'}}>
                {formTipo==='entrada'?'Já recebi':'Já paguei'}
              </span>
              <button onClick={()=>setFormRealizado(v=>!v)}
                style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:20,
                  border:'none',cursor:'pointer',fontWeight:600,fontSize:13,transition:'all .15s',
                  background:formRealizado?VERDE:'#e5e7eb',color:formRealizado?'#fff':'#6b7280'}}>
                <span style={{width:18,height:18,borderRadius:'50%',background:'#fff',
                  boxShadow:'0 1px 3px rgba(0,0,0,.2)',display:'inline-block',
                  transform:formRealizado?'translateX(2px)':'none'}}/>
                {formRealizado?'Sim':'Não'}
              </button>
              <span style={{fontSize:12,color:'#9ca3af'}}>
                {formRealizado?'Realizado':'Esperado (agendado)'}
              </span>
            </div>

            {/* Plano de contas */}
            <div style={{position:'relative'}} ref={planoRef}>
              <label style={{display:'block',fontWeight:600,fontSize:13,color:'#374151',marginBottom:4}}>Plano de Contas</label>
              <input type="text" placeholder="Buscar conta..."
                value={planoSearch || formPlano}
                onFocus={()=>{setShowPlano(true);if(formPlano&&!planoSearch)setPlanoSearch('');}}
                onChange={e=>{setPlanoSearch(e.target.value);setFormPlano('');setShowPlano(true);}}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:8,
                  padding:'9px 12px',fontSize:14}} />
              {formPlano && !showPlano && (
                <div style={{fontSize:12,color:formTipo==='entrada'?VERDE:DRE_VERM,marginTop:3,paddingLeft:2,fontWeight:600}}>
                  {DRE_CONTAS.find(c=>c.c===formPlano)?.n || formPlano}
                </div>
              )}
              {showPlano && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:999,
                  background:'#fff',border:'1px solid #d1d5db',borderRadius:8,
                  boxShadow:'0 4px 20px rgba(0,0,0,.12)',maxHeight:220,overflowY:'auto',marginTop:2}}>
                  {filteredContas.length===0 && (
                    <div style={{padding:'10px 12px',fontSize:13,color:'#9ca3af'}}>Nenhuma conta encontrada</div>
                  )}
                  {filteredContas.map(ct=>(
                    <div key={ct.c} onClick={()=>{setFormPlano(ct.c);setPlanoSearch(ct.c+' — '+ct.n);setShowPlano(false);}}
                      style={{padding:'8px 12px',cursor:'pointer',fontSize:13,
                        borderBottom:'1px solid #f3f4f6',color:'#1f2937'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='#f3f4f6')}
                      onMouseLeave={e=>(e.currentTarget.style.background='')}>
                      <span style={{color:'#9ca3af',marginRight:6,fontSize:11}}>{ct.c}</span>
                      {ct.n}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Histórico */}
            <div>
              <label style={{display:'block',fontWeight:600,fontSize:13,color:'#374151',marginBottom:4}}>Histórico</label>
              <input type="text" placeholder="Descrição ou observação..."
                value={formHistorico} onChange={e=>setFormHistorico(e.target.value)}
                style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:8,
                  padding:'9px 12px',fontSize:14}} />
            </div>

            {/* Conta Bancária */}
            {contasBancarias.length > 0 && (
              <div>
                <label style={{display:'block',fontWeight:600,fontSize:13,color:'#374151',marginBottom:4}}>
                  Conta Bancária <span style={{color:'#9ca3af',fontWeight:400}}>(opcional)</span>
                </label>
                <select value={formConta} onChange={e=>setFormConta(e.target.value)}
                  style={{width:'100%',border:'1px solid #d1d5db',borderRadius:8,padding:'9px 12px',fontSize:14}}>
                  <option value=''>Sem conta específica</option>
                  {contasBancarias.map(c=>(
                    <option key={c.id} value={c.id}>{c.nome}{c.banco?` — ${c.banco}`:''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Projeto */}
            {projetos.filter(p=>p.status==='ativo').length > 0 && (
              <div>
                <label style={{display:'block',fontWeight:600,fontSize:13,color:'#374151',marginBottom:4}}>
                  Projeto <span style={{color:'#9ca3af',fontWeight:400}}>(opcional)</span>
                </label>
                <select value={formProjeto} onChange={e=>setFormProjeto(e.target.value)}
                  style={{width:'100%',border:'1px solid #d1d5db',borderRadius:8,padding:'9px 12px',fontSize:14}}>
                  <option value=''>Sem projeto</option>
                  {projetos.filter(p=>p.status==='ativo').map(p=>(
                    <option key={p.id} value={p.id}>{p.nome}{p.data?` (${p.data})`:''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Salvar */}
            <button onClick={handleSave} disabled={saving}
              style={{padding:'13px',border:'none',borderRadius:8,fontWeight:700,fontSize:16,
                cursor:'pointer',transition:'all .15s',opacity:saving?.6:1,
                background:formTipo==='entrada'?VERDE:DRE_VERM,color:'#fff'}}>
              {saving?'Salvando…':'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          LISTA
      ══════════════════════════════════════ */}
      {sub==='lista' && (
        <div>
          {/* Filtros */}
          <div style={{display:'flex',gap:12,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
            <label style={{fontWeight:600,fontSize:13,color:'#374151'}}>Mês</label>
            <select value={listaMes} onChange={e=>setListaMes(Number(e.target.value))}
              style={{border:'1px solid #d1d5db',borderRadius:6,padding:'5px 10px',fontSize:13}}>
              <option value={0}>Todos</option>
              {DRE_MESES_NM.map((nm,i)=><option key={i+1} value={i+1}>{nm}</option>)}
            </select>
            <span style={{fontSize:12,color:'#9ca3af'}}>{listaFiltrada.length} lançamentos</span>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:13*fsBig}}>
              <thead>
                <tr style={{background:DRE_AZUL,color:'#fff'}}>
                  <th style={{padding:'8px 10px',textAlign:'left',whiteSpace:'nowrap'}}>Data</th>
                  <th style={{padding:'8px 10px',textAlign:'left'}}>Conta DRE</th>
                  <th style={{padding:'8px 10px',textAlign:'center'}}>Tipo</th>
                  <th style={{padding:'8px 10px',textAlign:'right'}}>Valor</th>
                  <th style={{padding:'8px 10px',textAlign:'center'}}>Status</th>
                  <th style={{padding:'8px 10px',textAlign:'left'}}>Banco</th>
                  <th style={{padding:'8px 10px',textAlign:'left'}}>Projeto</th>
                  <th style={{padding:'8px 10px',textAlign:'left'}}>Histórico</th>
                  <th style={{padding:'8px 10px',textAlign:'center'}}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length===0 && (
                  <tr><td colSpan={9} style={{textAlign:'center',padding:24,color:'#9ca3af',fontSize:14}}>
                    Nenhum lançamento encontrado
                  </td></tr>
                )}
                {listaFiltrada.map((t,idx)=>{
                  const ct = DRE_CONTAS.find(c=>c.c===t.plano_contas);
                  const banco = t.conta_bancaria ? contasBancarias.find(c=>c.id===t.conta_bancaria) : null;
                  const proj  = t.projeto_id ? projetos.find(p=>p.id===t.projeto_id) : null;
                  return (
                    <tr key={t.id} style={{borderBottom:'1px solid #f3f4f6',background:idx%2?'#fafafa':'#fff'}}>
                      <td style={{padding:'7px 10px',whiteSpace:'nowrap',color:'#374151'}}>{t.data}</td>
                      <td style={{padding:'7px 10px',color:'#374151'}}>
                        <span style={{fontSize:11,color:'#9ca3af'}}>{t.plano_contas} </span>
                        {ct?.n||t.plano_contas}
                      </td>
                      <td style={{padding:'7px 10px',textAlign:'center'}}>
                        <span style={{padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:600,
                          background:t.tipo==='entrada'?'#dcfce7':'#fee2e2',
                          color:t.tipo==='entrada'?VERDE:DRE_VERM}}>
                          {t.tipo==='entrada'?'↑ Entrada':'↓ Saída'}
                        </span>
                      </td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600,
                        color:t.tipo==='entrada'?VERDE:DRE_VERM}}>
                        {fmtR(t.valor)}
                      </td>
                      <td style={{padding:'7px 10px',textAlign:'center'}}>
                        <button onClick={()=>handleToggleRealizado(t)}
                          title="Clique para alternar"
                          style={{padding:'3px 10px',borderRadius:10,fontSize:11,fontWeight:600,
                            border:'none',cursor:'pointer',transition:'all .15s',
                            background:t.realizado?VERDE:'#f3f4f6',
                            color:t.realizado?'#fff':'#6b7280'}}>
                          {t.realizado?'Realizado':'Esperado'}
                        </button>
                      </td>
                      <td style={{padding:'7px 10px',color:'#6b7280',fontSize:12}}>
                        {banco ? banco.nome : <span style={{color:'#d1d5db'}}>—</span>}
                      </td>
                      <td style={{padding:'7px 10px',fontSize:12}}>
                        {proj ? (
                          <button onClick={()=>{setSub('projetos');setSelectedProjeto(proj.id);}}
                            style={{padding:'2px 8px',borderRadius:8,border:'none',cursor:'pointer',
                              background:'#eff6ff',color:DRE_AZUL,fontSize:11,fontWeight:600}}>
                            {proj.nome}
                          </button>
                        ) : <span style={{color:'#d1d5db'}}>—</span>}
                      </td>
                      <td style={{padding:'7px 10px',color:'#6b7280',fontSize:12}}>{t.historico||'—'}</td>
                      <td style={{padding:'7px 10px',textAlign:'center'}}>
                        <button onClick={()=>handleDelete(t.id)}
                          style={{padding:'3px 8px',borderRadius:6,border:`1px solid ${DRE_VERM}`,
                            background:'transparent',color:DRE_VERM,cursor:'pointer',fontSize:11,fontWeight:600}}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          CONTAS BANCÁRIAS
      ══════════════════════════════════════ */}
      {sub==='contas' && (
        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* Cards de saldo */}
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:700,color:DRE_AZUL}}>Contas Bancárias</h3>
              <button onClick={()=>setShowNovaConta(v=>!v)}
                style={{padding:'7px 16px',background:DRE_AZUL,color:'#fff',border:'none',
                  borderRadius:7,cursor:'pointer',fontWeight:600,fontSize:13}}>
                {showNovaConta?'Cancelar':'+ Nova Conta'}
              </button>
            </div>

            {/* Form nova conta */}
            {showNovaConta && (
              <div style={{border:'1px solid #e5e7eb',borderRadius:10,padding:16,marginBottom:16,background:'#f9fafb'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div>
                    <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Nome da conta *</label>
                    <input value={novaContaNome} onChange={e=>setNovaContaNome(e.target.value)} placeholder="Ex: Bradesco Corrente"
                      style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}} />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Banco</label>
                    <input value={novaContaBanco} onChange={e=>setNovaContaBanco(e.target.value)} placeholder="Ex: Bradesco"
                      style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}} />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Tipo</label>
                    <select value={novaContaTipo} onChange={e=>setNovaContaTipo(e.target.value)}
                      style={{width:'100%',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}}>
                      <option value='corrente'>Conta Corrente</option>
                      <option value='poupanca'>Poupança</option>
                      <option value='caixa'>Caixa (dinheiro físico)</option>
                      <option value='investimento'>Investimento</option>
                    </select>
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Saldo inicial (R$)</label>
                    <input type="number" value={novaContaSaldo} onChange={e=>setNovaContaSaldo(e.target.value)} placeholder="0,00"
                      style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}} />
                  </div>
                </div>
                <button onClick={handleSaveConta} disabled={savingConta}
                  style={{padding:'8px 20px',background:VERDE,color:'#fff',border:'none',borderRadius:7,
                    cursor:'pointer',fontWeight:600,fontSize:14,opacity:savingConta?.6:1}}>
                  {savingConta?'Salvando…':'Salvar Conta'}
                </button>
              </div>
            )}

            {/* Cards */}
            {contasBancarias.length === 0 && !showNovaConta && (
              <div style={{textAlign:'center',padding:'32px 16px',color:'#9ca3af',border:'2px dashed #e5e7eb',borderRadius:10}}>
                Nenhuma conta cadastrada. Clique em <strong>+ Nova Conta</strong> para começar.
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:14}}>
              {contasBancarias.map(c => {
                const saldo = saldoConta(c.id);
                const txCount = transacoes.filter(t=>t.conta_bancaria===c.id).length;
                return (
                  <div key={c.id} style={{border:'1px solid #e5e7eb',borderRadius:10,padding:16,
                    background:'#fff',boxShadow:'0 1px 6px rgba(0,0,0,.05)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:15,color:'#1f2937'}}>{c.nome}</div>
                        <div style={{fontSize:12,color:'#9ca3af'}}>{c.banco||'—'} · {c.tipo}</div>
                      </div>
                      <button onClick={()=>handleDeleteConta(c.id)}
                        style={{padding:'2px 7px',border:`1px solid ${DRE_VERM}`,borderRadius:5,
                          background:'transparent',color:DRE_VERM,cursor:'pointer',fontSize:11}}>✕</button>
                    </div>
                    <div style={{fontSize:24,fontWeight:700,color:saldo>=0?VERDE:DRE_VERM,margin:'8px 0 4px'}}>
                      {fmtR(saldo)}
                    </div>
                    <div style={{fontSize:11,color:'#9ca3af'}}>
                      Saldo inicial: {fmtR(c.saldo_inicial)} · {txCount} lançamento{txCount!==1?'s':''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transferências */}
          <div style={{borderTop:'1px solid #e5e7eb',paddingTop:20}}>
            <h3 style={{margin:'0 0 12px',fontSize:16,fontWeight:700,color:DRE_AZUL}}>Transferência entre Contas</h3>
            {contasBancarias.length < 2 ? (
              <p style={{color:'#9ca3af',fontSize:13}}>Cadastre ao menos 2 contas para realizar transferências.</p>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,maxWidth:560}}>
                <div>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>De (origem) *</label>
                  <select value={trfOrigem} onChange={e=>setTrfOrigem(e.target.value)}
                    style={{width:'100%',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}}>
                    <option value=''>Selecione…</option>
                    {contasBancarias.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Para (destino) *</label>
                  <select value={trfDestino} onChange={e=>setTrfDestino(e.target.value)}
                    style={{width:'100%',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}}>
                    <option value=''>Selecione…</option>
                    {contasBancarias.filter(c=>c.id!==trfOrigem).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Valor (R$) *</label>
                  <input type="number" value={trfValor} onChange={e=>setTrfValor(e.target.value)} placeholder="0,00"
                    style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}} />
                </div>
                <div>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Data *</label>
                  <input type="text" value={trfData} onChange={e=>setTrfData(e.target.value)} placeholder="DD/MM/AAAA"
                    style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}} />
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Histórico</label>
                  <input value={trfHistorico} onChange={e=>setTrfHistorico(e.target.value)} placeholder="Descrição opcional"
                    style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}} />
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <button onClick={handleSaveTransferencia} disabled={savingTrf}
                    style={{padding:'9px 24px',background:DRE_AZUL,color:'#fff',border:'none',borderRadius:7,
                      cursor:'pointer',fontWeight:600,fontSize:14,opacity:savingTrf?.6:1}}>
                    {savingTrf?'Transferindo…':'Transferir'}
                  </button>
                </div>
              </div>
            )}

            {/* Histórico de transferências */}
            {transferencias.length > 0 && (
              <div style={{marginTop:16,overflowX:'auto'}}>
                <table style={{borderCollapse:'collapse',width:'100%',fontSize:12}}>
                  <thead>
                    <tr style={{background:'#f1f5f9',color:'#374151'}}>
                      <th style={{padding:'6px 10px',textAlign:'left'}}>Data</th>
                      <th style={{padding:'6px 10px',textAlign:'left'}}>De</th>
                      <th style={{padding:'6px 10px',textAlign:'left'}}>Para</th>
                      <th style={{padding:'6px 10px',textAlign:'right'}}>Valor</th>
                      <th style={{padding:'6px 10px',textAlign:'left'}}>Histórico</th>
                      <th style={{padding:'6px 10px',textAlign:'center'}}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...transferencias].sort((a,b)=>b.data.localeCompare(a.data)).map((tr,i)=>{
                      const orig = contasBancarias.find(c=>c.id===tr.conta_origem);
                      const dest = contasBancarias.find(c=>c.id===tr.conta_destino);
                      return (
                        <tr key={tr.id} style={{borderBottom:'1px solid #f3f4f6',background:i%2?'#fafafa':'#fff'}}>
                          <td style={{padding:'6px 10px'}}>{tr.data}</td>
                          <td style={{padding:'6px 10px'}}>{orig?.nome||tr.conta_origem}</td>
                          <td style={{padding:'6px 10px'}}>{dest?.nome||tr.conta_destino}</td>
                          <td style={{padding:'6px 10px',textAlign:'right',fontWeight:600,color:DRE_AZUL}}>{fmtR(tr.valor)}</td>
                          <td style={{padding:'6px 10px',color:'#6b7280'}}>{tr.historico||'—'}</td>
                          <td style={{padding:'6px 10px',textAlign:'center'}}>
                            <button onClick={()=>handleDeleteTransferencia(tr.id)}
                              style={{padding:'2px 7px',border:`1px solid ${DRE_VERM}`,borderRadius:5,
                                background:'transparent',color:DRE_VERM,cursor:'pointer',fontSize:11}}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          PROJETOS
      ══════════════════════════════════════ */}
      {sub==='projetos' && (
        <div>
          {selectedProjeto ? (
            /* Detalhe do projeto */
            (() => {
              const proj = projetos.find(p=>p.id===selectedProjeto);
              if (!proj) return null;
              const ts = [...transacoes.filter(t=>t.projeto_id===selectedProjeto)]
                .sort((a,b)=>{ const pa=a.data.split('/'),pb=b.data.split('/');
                  return new Date(+pb[2],+pb[1]-1,+pb[0]).getTime()-new Date(+pa[2],+pa[1]-1,+pa[0]).getTime(); });
              const stats = projetoStats(proj.id);
              return (
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                    <button onClick={()=>setSelectedProjeto(null)}
                      style={{padding:'6px 14px',border:'1px solid #d1d5db',borderRadius:6,
                        background:'#f9fafb',cursor:'pointer',fontSize:13}}>← Voltar</button>
                    <h3 style={{margin:0,fontSize:18,fontWeight:700,color:DRE_AZUL}}>{proj.nome}</h3>
                    <span style={{padding:'3px 10px',borderRadius:10,fontSize:12,fontWeight:600,
                      background:proj.status==='ativo'?'#dcfce7':'#f3f4f6',
                      color:proj.status==='ativo'?VERDE:'#6b7280'}}>
                      {proj.status==='ativo'?'Ativo':'Encerrado'}
                    </span>
                  </div>
                  {proj.descricao && <p style={{margin:'0 0 12px',color:'#6b7280',fontSize:13}}>{proj.descricao}</p>}

                  {/* Resumo */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>
                    {[
                      {label:'Total Entradas',valor:stats.entradas,cor:VERDE},
                      {label:'Total Saídas',valor:stats.saidas,cor:DRE_VERM},
                      {label:'Saldo',valor:stats.saldo,cor:stats.saldo>=0?VERDE:DRE_VERM},
                    ].map(({label,valor,cor})=>(
                      <div key={label} style={{border:'1px solid #e5e7eb',borderRadius:8,padding:14,background:'#fff'}}>
                        <div style={{fontSize:11,color:'#9ca3af',marginBottom:4}}>{label}</div>
                        <div style={{fontSize:20,fontWeight:700,color:cor}}>{fmtR(valor)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Lista de lançamentos */}
                  {ts.length===0 ? (
                    <div style={{textAlign:'center',padding:24,color:'#9ca3af'}}>Nenhum lançamento vinculado.</div>
                  ) : (
                    <table style={{borderCollapse:'collapse',width:'100%',fontSize:13}}>
                      <thead>
                        <tr style={{background:DRE_AZUL,color:'#fff'}}>
                          <th style={{padding:'7px 10px',textAlign:'left'}}>Data</th>
                          <th style={{padding:'7px 10px',textAlign:'left'}}>Conta DRE</th>
                          <th style={{padding:'7px 10px',textAlign:'center'}}>Tipo</th>
                          <th style={{padding:'7px 10px',textAlign:'right'}}>Valor</th>
                          <th style={{padding:'7px 10px',textAlign:'center'}}>Status</th>
                          <th style={{padding:'7px 10px',textAlign:'left'}}>Histórico</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ts.map((t,i)=>{
                          const ct = DRE_CONTAS.find(c=>c.c===t.plano_contas);
                          return (
                            <tr key={t.id} style={{borderBottom:'1px solid #f3f4f6',background:i%2?'#fafafa':'#fff'}}>
                              <td style={{padding:'6px 10px'}}>{t.data}</td>
                              <td style={{padding:'6px 10px',fontSize:12}}>
                                <span style={{color:'#9ca3af'}}>{t.plano_contas} </span>{ct?.n||t.plano_contas}
                              </td>
                              <td style={{padding:'6px 10px',textAlign:'center'}}>
                                <span style={{padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:600,
                                  background:t.tipo==='entrada'?'#dcfce7':'#fee2e2',
                                  color:t.tipo==='entrada'?VERDE:DRE_VERM}}>
                                  {t.tipo==='entrada'?'↑ Entrada':'↓ Saída'}
                                </span>
                              </td>
                              <td style={{padding:'6px 10px',textAlign:'right',fontWeight:600,
                                color:t.tipo==='entrada'?VERDE:DRE_VERM}}>{fmtR(t.valor)}</td>
                              <td style={{padding:'6px 10px',textAlign:'center'}}>
                                <span style={{padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:600,
                                  background:t.realizado?VERDE:'#f3f4f6',
                                  color:t.realizado?'#fff':'#6b7280'}}>
                                  {t.realizado?'Realizado':'Esperado'}
                                </span>
                              </td>
                              <td style={{padding:'6px 10px',color:'#6b7280',fontSize:12}}>{t.historico||'—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()
          ) : (
            /* Lista de projetos */
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <h3 style={{margin:0,fontSize:16,fontWeight:700,color:DRE_AZUL}}>Projetos</h3>
                <button onClick={()=>setShowNovoProjeto(v=>!v)}
                  style={{padding:'7px 16px',background:DRE_AZUL,color:'#fff',border:'none',
                    borderRadius:7,cursor:'pointer',fontWeight:600,fontSize:13}}>
                  {showNovoProjeto?'Cancelar':'+ Novo Projeto'}
                </button>
              </div>

              {/* Form novo projeto */}
              {showNovoProjeto && (
                <div style={{border:'1px solid #e5e7eb',borderRadius:10,padding:16,marginBottom:16,background:'#f9fafb'}}>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:10,marginBottom:10}}>
                    <div>
                      <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Nome *</label>
                      <input value={projNome} onChange={e=>setProjNome(e.target.value)} placeholder="Ex: Evento 30/04"
                        style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}} />
                    </div>
                    <div>
                      <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Data</label>
                      <input value={projData} onChange={e=>setProjData(e.target.value)} placeholder="DD/MM/AAAA"
                        style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}} />
                    </div>
                    <div style={{gridColumn:'1/-1'}}>
                      <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:3}}>Descrição</label>
                      <input value={projDesc} onChange={e=>setProjDesc(e.target.value)} placeholder="Detalhes opcionais"
                        style={{width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'7px 10px',fontSize:13}} />
                    </div>
                  </div>
                  <button onClick={handleSaveProjeto} disabled={savingProj}
                    style={{padding:'8px 20px',background:VERDE,color:'#fff',border:'none',borderRadius:7,
                      cursor:'pointer',fontWeight:600,fontSize:14,opacity:savingProj?.6:1}}>
                    {savingProj?'Salvando…':'Criar Projeto'}
                  </button>
                </div>
              )}

              {projetos.length === 0 && !showNovoProjeto && (
                <div style={{textAlign:'center',padding:'32px 16px',color:'#9ca3af',border:'2px dashed #e5e7eb',borderRadius:10}}>
                  Nenhum projeto cadastrado. Clique em <strong>+ Novo Projeto</strong> para começar.
                </div>
              )}

              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {projetos.map(p => {
                  const stats = projetoStats(p.id);
                  return (
                    <div key={p.id} style={{border:'1px solid #e5e7eb',borderRadius:10,padding:16,
                      background:'#fff',cursor:'pointer',transition:'box-shadow .15s'}}
                      onClick={()=>setSelectedProjeto(p.id)}
                      onMouseEnter={e=>(e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,.1)')}
                      onMouseLeave={e=>(e.currentTarget.style.boxShadow='')}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{flex:1}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                            <span style={{fontWeight:700,fontSize:15,color:'#1f2937'}}>{p.nome}</span>
                            <span style={{padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:600,
                              background:p.status==='ativo'?'#dcfce7':'#f3f4f6',
                              color:p.status==='ativo'?VERDE:'#6b7280'}}>
                              {p.status==='ativo'?'Ativo':'Encerrado'}
                            </span>
                            {p.data && <span style={{fontSize:12,color:'#9ca3af'}}>{p.data}</span>}
                          </div>
                          {p.descricao && <div style={{fontSize:12,color:'#6b7280'}}>{p.descricao}</div>}
                        </div>
                        <div style={{display:'flex',gap:16,alignItems:'center',flexShrink:0,marginLeft:16}}>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:11,color:'#9ca3af'}}>Saldo</div>
                            <div style={{fontWeight:700,fontSize:16,color:stats.saldo>=0?VERDE:DRE_VERM}}>{fmtR(stats.saldo)}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:11,color:VERDE}}>↑ {fmtR(stats.entradas)}</div>
                            <div style={{fontSize:11,color:DRE_VERM}}>↓ {fmtR(stats.saidas)}</div>
                          </div>
                          <div style={{display:'flex',flexDirection:'column',gap:4}}>
                            <button onClick={e=>{e.stopPropagation();handleToggleProjetoStatus(p);}}
                              style={{padding:'3px 8px',border:'1px solid #d1d5db',borderRadius:5,
                                background:'#f9fafb',color:'#374151',cursor:'pointer',fontSize:11,whiteSpace:'nowrap'}}>
                              {p.status==='ativo'?'Encerrar':'Reabrir'}
                            </button>
                            <button onClick={e=>{e.stopPropagation();handleDeleteProjeto(p.id);}}
                              style={{padding:'3px 8px',border:`1px solid ${DRE_VERM}`,borderRadius:5,
                                background:'transparent',color:DRE_VERM,cursor:'pointer',fontSize:11}}>
                              Excluir
                            </button>
                          </div>
                        </div>
                      </div>
                      {stats.count > 0 && (
                        <div style={{marginTop:8,fontSize:11,color:'#9ca3af'}}>
                          {stats.count} lançamento{stats.count!==1?'s':''} vinculado{stats.count!==1?'s':''} — clique para ver detalhes
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════
          VISÃO MENSAL (collapsible)
      ══════════════════════════════════════ */}
      {sub==='mensal' && (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse',width:'100%',minWidth:520}}>
            <thead>
              <tr style={{background:DRE_AZUL,color:'#fff',fontSize:13*fsBig}}>
                <th style={{padding:`${7*fsBig}px 10px`,textAlign:'left',minWidth:220*fsBig}}>Conta</th>
                <th style={{padding:`${7*fsBig}px 8px`,textAlign:'right',width:130*fsBig}}>Esperado</th>
                <th style={{padding:`${7*fsBig}px 8px`,textAlign:'right',width:130*fsBig}}>Realizado</th>
                <th style={{padding:`${7*fsBig}px 8px`,textAlign:'right',width:60*fsBig}}>AV%</th>
              </tr>
            </thead>
            <tbody>
              {(['3','4','5','6','7'] as const).map(g => {
                const isNeg = DRE_G_NEG.has(g);
                const gOpen = expGroups.has(g);
                const gTot = g==='3'?calcM.g3:g==='4'?calcM.g4:g==='5'?calcM.g5:g==='6'?calcM.g6
                  :{esp:calcM.g71.esp+calcM.g72.esp,real:calcM.g71.real+calcM.g72.real};
                const gDispReal = isNeg ? -gTot.real : gTot.real;
                return (
                  <React.Fragment key={g}>
                    {/* Header grupo — clickable */}
                    <tr style={{background:'#f1f5f9',cursor:'pointer'}} onClick={()=>toggleGroup(g)}>
                      <td colSpan={4} style={{padding:`${8*fsBig}px 10px ${4*fsBig}px`,fontWeight:700,
                        fontSize:14*fsBig,color:DRE_AZUL,borderTop:'2px solid #e2e8f0',userSelect:'none'}}>
                        <span style={{marginRight:8,fontSize:11,opacity:.6}}>{gOpen?'▼':'▶'}</span>
                        {g} — {DRE_G[g]}
                        {!gOpen && gTot.real!==0 && (
                          <span style={{marginLeft:16,fontSize:12*fsBig,fontWeight:600,
                            color:gDispReal>=0?VERDE:DRE_VERM}}>
                            {fmtR(gDispReal)}
                          </span>
                        )}
                      </td>
                    </tr>
                    {gOpen && sgsOf(g).map(sg => {
                      const sgOpen = expSgs.has(sg);
                      const sgContas = DRE_CONTAS.filter(ct=>ct.sg===sg);
                      const sgT = sgContas.reduce((a,ct)=>{
                        const v=mdMes[ct.c]||{esp:0,real:0};
                        return {esp:a.esp+v.esp,real:a.real+v.real};
                      },{esp:0,real:0});
                      const sgNeg = isNeg||(g==='7'&&sg==='7.2');
                      const sgDisp = sgNeg ? -sgT.real : sgT.real;
                      return (
                        <React.Fragment key={sg}>
                          <tr style={{background:'#eef2fb',cursor:'pointer'}} onClick={()=>toggleSg(sg)}>
                            <td style={{padding:`${4*fsBig}px 10px ${3*fsBig}px ${20*fsBig}px`,fontWeight:600,
                              fontSize:12*fsBig,color:'#4b5563',userSelect:'none'}}>
                              <span style={{marginRight:6,fontSize:10,opacity:.5}}>{sgOpen?'▼':'▶'}</span>
                              {sg} — {DRE_SG[sg]}
                            </td>
                            <td style={{textAlign:'right',padding:`${4*fsBig}px 8px`,fontSize:12*fsBig,color:'#9ca3af'}}>
                              {sgT.esp ? fmtR(sgNeg?-sgT.esp:sgT.esp) : '—'}
                            </td>
                            <td style={{textAlign:'right',padding:`${4*fsBig}px 8px`,fontSize:12*fsBig,color:valColor(sgDisp)}}>
                              {sgT.real ? fmtR(sgDisp) : '—'}
                            </td>
                            <td style={{textAlign:'right',padding:`${4*fsBig}px 8px`,fontSize:11*fsBig,color:'#9ca3af'}}>
                              {recM&&sgT.real ? fmtAV(Math.abs(sgT.real),recM) : '—'}
                            </td>
                          </tr>
                          {sgOpen && sgContas.map(ct => {
                            const v = mdMes[ct.c]||{esp:0,real:0};
                            const disp = sgNeg ? -v.real : v.real;
                            return (
                              <tr key={ct.c} style={{borderTop:'1px solid #f9fafb'}}>
                                <td style={{padding:`${2*fsBig}px 10px ${2*fsBig}px ${32*fsBig}px`,fontSize:12*fsBig,color:'#6b7280'}}>
                                  {ct.c} — {ct.n}
                                </td>
                                <td style={{textAlign:'right',padding:`${2*fsBig}px 8px`,fontSize:12*fsBig,color:'#d1d5db'}}>
                                  {v.esp ? fmtR(sgNeg?-v.esp:v.esp) : '—'}
                                </td>
                                <td style={{textAlign:'right',padding:`${2*fsBig}px 8px`,fontSize:12*fsBig,
                                  color:v.real?valColor(disp):'#d1d5db'}}>
                                  {v.real ? fmtR(disp) : '—'}
                                </td>
                                <td style={{textAlign:'right',padding:`${2*fsBig}px 8px`,fontSize:11*fsBig,color:'#d1d5db'}}>
                                  {recM&&v.real ? fmtAV(Math.abs(v.real),recM) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                    {/* Total do grupo */}
                    {gOpen && (
                      <tr style={{background:'#e2e8f0',fontWeight:600,borderTop:'1px solid #cbd5e1'}}>
                        <td style={{padding:`${5*fsBig}px 10px`,fontSize:13*fsBig,color:'#1e3a5f'}}>
                          Total {DRE_G[g]}
                        </td>
                        <td style={{textAlign:'right',padding:`${5*fsBig}px 8px`,fontSize:13*fsBig,color:'#6b7280'}}>
                          {gTot.esp ? fmtR(isNeg?-gTot.esp:gTot.esp) : '—'}
                        </td>
                        <td style={{textAlign:'right',padding:`${5*fsBig}px 8px`,fontSize:13*fsBig,color:valColor(gDispReal)}}>
                          {gTot.real ? fmtR(gDispReal) : '—'}
                        </td>
                        <td style={{textAlign:'right',padding:`${5*fsBig}px 8px`,fontSize:12*fsBig,color:'#6b7280'}}>
                          {recM&&gTot.real ? fmtAV(Math.abs(gTot.real),recM) : '—'}
                        </td>
                      </tr>
                    )}
                    {g==='4' && renderResRow('= Margem de Contribuição',   calcM.margem.esp,    calcM.margem.real,    recM)}
                    {g==='5' && renderResRow('= Luc. Operacional antes Invest.',calcM.loai.esp, calcM.loai.real,      recM)}
                    {g==='6' && renderResRow('= Lucro Operacional',         calcM.lo.esp,        calcM.lo.real,        recM)}
                    {g==='7' && renderResRow('= Resultado Líquido',         calcM.resultado.esp, calcM.resultado.real, recM)}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════
          VISÃO ANUAL (collapsible)
      ══════════════════════════════════════ */}
      {sub==='anual' && (
        <div style={{overflowX:'auto',maxHeight:isFS?'80vh':'72vh',overflowY:'auto'}}>
          <table style={{borderCollapse:'collapse',fontSize:isFS?13:11}}>
            <thead style={{position:'sticky',top:0,zIndex:4}}>
              <tr>
                <th style={thLeft}>Conta</th>
                {DRE_MESES_NM.map((nm,i) => <th key={i} style={thBase}>{nm}</th>)}
                <th style={{...thBase,background:'#1a2a40'}}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(['3','4','5','6','7'] as const).map(g => {
                const isNeg = DRE_G_NEG.has(g);
                const gOpen = expGroups.has(g);
                const gKeys: Record<string, keyof ReturnType<typeof dreCalcMes>> = {
                  '3':'g3','4':'g4','5':'g5','6':'g6'
                };
                const calcKey = gKeys[g];
                return (
                  <React.Fragment key={g}>
                    {/* Grupo header — clickable */}
                    <tr style={{background:'#1a2a40',cursor:'pointer'}} onClick={()=>toggleGroup(g)}>
                      <td style={{...thLeft,background:'#1a2a40',color:'#94a3b8',fontWeight:700,userSelect:'none'}}>
                        <span style={{marginRight:6,fontSize:10,opacity:.6}}>{gOpen?'▼':'▶'}</span>
                        {g} — {DRE_G[g]}
                      </td>
                      {DRE_MESES_NM.map((_,i) => <td key={i} style={{background:'#1a2a40',padding:4}}/>)}
                      <td style={{background:'#1a2a40',padding:4}}/>
                    </tr>
                    {/* Subgrupos */}
                    {gOpen && sgsOf(g).map(sg => {
                      const sgContas = DRE_CONTAS.filter(ct=>ct.sg===sg);
                      const sgNeg = isNeg||(g==='7'&&sg==='7.2');
                      const sgOpen = expSgs.has(sg);
                      const sgAnn = sgContas.reduce((ta,ct) => {
                        const tot = anualContaTotal(ct.c);
                        return {esp:ta.esp+tot.esp,real:ta.real+tot.real};
                      },{esp:0,real:0});
                      const sgAnnDisp = sgNeg ? -sgAnn.real : sgAnn.real;
                      return (
                        <React.Fragment key={sg}>
                          {/* Subgrupo row — clickable */}
                          <tr style={{background:'#eef2fb',cursor:'pointer'}} onClick={()=>toggleSg(sg)}>
                            <td style={{...tdTotL,paddingLeft:16,fontSize:11,color:'#4b5563',fontWeight:600,userSelect:'none'}}>
                              <span style={{marginRight:5,fontSize:9,opacity:.5}}>{sgOpen?'▼':'▶'}</span>
                              {sg} — {DRE_SG[sg]}
                            </td>
                            {DRE_MESES_NM.map((_,i) => {
                              const m=i+1;
                              const v = sgContas.reduce((a,ct)=>a+((lanc[m]||{})[ct.c]?.real||0),0);
                              const disp = sgNeg ? -v : v;
                              return <td key={m} style={tdNum(disp)}>{v ? fmtR(disp) : '—'}</td>;
                            })}
                            <td style={{...tdTotR,background:'#dde5f5',color:valColor(sgAnnDisp)}}>
                              {sgAnn.real ? fmtR(sgAnnDisp) : '—'}
                            </td>
                          </tr>
                          {/* Contas folha */}
                          {sgOpen && sgContas.map(ct => {
                            const totAnn = anualContaTotal(ct.c);
                            const totDisp = sgNeg ? -totAnn.real : totAnn.real;
                            return (
                              <tr key={ct.c} style={{borderTop:'1px solid #f9fafb'}}>
                                <td style={{padding:'2px 8px 2px 28px',position:'sticky',left:0,
                                  background:'#fff',color:'#6b7280',whiteSpace:'nowrap',fontSize:11}}>
                                  {ct.c} — {ct.n}
                                </td>
                                {DRE_MESES_NM.map((_,i) => {
                                  const m=i+1;
                                  const v=(lanc[m]||{})[ct.c]?.real||0;
                                  const disp = sgNeg ? -v : v;
                                  return <td key={m} style={tdNum(disp)}>{v ? fmtR(disp) : '—'}</td>;
                                })}
                                <td style={{...tdTotR,background:'#f8faff',color:valColor(totDisp)}}>
                                  {totAnn.real ? fmtR(totDisp) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                    {/* Total do grupo (apenas 3,4,5,6) */}
                    {gOpen && calcKey && (() => {
                      const ta = anualCalcKey(calcKey);
                      const dispAnn = isNeg ? -ta.real : ta.real;
                      return (
                        <tr style={{borderTop:'2px solid #c7d2fe'}}>
                          <td style={tdTotL}>Total {DRE_G[g]}</td>
                          {DRE_MESES_NM.map((_,i) => {
                            const m=i+1;
                            const c = dreCalcMes(lanc[m]||{});
                            const mv = (c as any)[calcKey] as {esp:number;real:number};
                            const d = isNeg ? -mv.real : mv.real;
                            return <td key={m} style={tdTotR}>{mv.real ? fmtR(d) : '—'}</td>;
                          })}
                          <td style={{...tdTotR,background:'#d0d8ef'}}>{ta.real ? fmtR(dispAnn) : '—'}</td>
                        </tr>
                      );
                    })()}
                    {/* Linhas resultado calculadas */}
                    {g==='4' && (() => {
                      const ta = anualCalcKey('margem');
                      return (
                        <tr style={{borderTop:'3px solid #233253'}}>
                          <td style={tdResL(ta.real)}>= Margem de Contribuição</td>
                          {DRE_MESES_NM.map((_,i)=>{const m=i+1;const v=dreCalcMes(lanc[m]||{}).margem;return <td key={m} style={tdRes(v.real)}>{v.real?fmtR(v.real):'—'}</td>;})}
                          <td style={tdRes(ta.real)}>{fmtR(ta.real)}</td>
                        </tr>
                      );
                    })()}
                    {g==='5' && (() => {
                      const ta = anualCalcKey('loai');
                      return (
                        <tr style={{borderTop:'3px solid #233253'}}>
                          <td style={tdResL(ta.real)}>= LOAI</td>
                          {DRE_MESES_NM.map((_,i)=>{const m=i+1;const v=dreCalcMes(lanc[m]||{}).loai;return <td key={m} style={tdRes(v.real)}>{v.real?fmtR(v.real):'—'}</td>;})}
                          <td style={tdRes(ta.real)}>{fmtR(ta.real)}</td>
                        </tr>
                      );
                    })()}
                    {g==='6' && (() => {
                      const ta = anualCalcKey('lo');
                      return (
                        <tr style={{borderTop:'3px solid #233253'}}>
                          <td style={tdResL(ta.real)}>= Lucro Operacional</td>
                          {DRE_MESES_NM.map((_,i)=>{const m=i+1;const v=dreCalcMes(lanc[m]||{}).lo;return <td key={m} style={tdRes(v.real)}>{v.real?fmtR(v.real):'—'}</td>;})}
                          <td style={tdRes(ta.real)}>{fmtR(ta.real)}</td>
                        </tr>
                      );
                    })()}
                    {g==='7' && (() => {
                      const ta = anualCalcKey('resultado');
                      return (
                        <tr style={{borderTop:'4px solid #233253'}}>
                          <td style={{...tdResL(ta.real),fontSize:isFS?14:13,padding:'6px 8px'}}>= Resultado Líquido</td>
                          {DRE_MESES_NM.map((_,i)=>{const m=i+1;const v=dreCalcMes(lanc[m]||{}).resultado;return <td key={m} style={{...tdRes(v.real),fontSize:isFS?13:12}}>{v.real?fmtR(v.real):'—'}</td>;})}
                          <td style={{...tdRes(ta.real),fontSize:isFS?14:13,padding:'6px 6px'}}>{fmtR(ta.real)}</td>
                        </tr>
                      );
                    })()}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ======== ETIQUETAS ========

function EtiquetasTab() {
  const BRAND = { primary: '#233253', green: '#009249', red: '#cf2a39' };

  const [subAba, setSubAba] = useState<'gerar'|'categorias'|'empresa'>('gerar');

  // ── dados carregados ──
  const [insumos, setInsumos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [empresa, setEmpresa] = useState({ nome: '', cnpj: '', endereco: '' });
  const [loading, setLoading] = useState(true);

  // ── form gerar etiqueta ──
  const [insumoSel, setInsumoSel] = useState('');
  const [conservacao, setConservacao] = useState<'resfriado'|'congelado'>('resfriado');
  const [responsavel, setResponsavel] = useState('');
  const [peso, setPeso] = useState('');
  const [manipData, setManipData] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  });
  const [manipHora, setManipHora] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  });
  const [qtdEtiquetas, setQtdEtiquetas] = useState(1);

  // ── form categorias ──
  const [catNome, setCatNome] = useState('');
  const [catRef, setCatRef] = useState(3);
  const [catCong, setCatCong] = useState(30);
  const [catAnvisa, setCatAnvisa] = useState('');
  const [savingCat, setSavingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string|null>(null);
  const [editCatNome, setEditCatNome] = useState('');
  const [editCatRef, setEditCatRef] = useState(0);
  const [editCatCong, setEditCatCong] = useState(0);
  const [editCatAnvisa, setEditCatAnvisa] = useState('');

  // ── form empresa ──
  const [empNome, setEmpNome] = useState('');
  const [empCnpj, setEmpCnpj] = useState('');
  const [empEnd, setEmpEnd] = useState('');
  const [savingEmp, setSavingEmp] = useState(false);

  // ── edição de insumo (categoria/marca/sif) ──
  const [editingInsumo, setEditingInsumo] = useState<string|null>(null);
  const [editInsCat, setEditInsCat] = useState('');
  const [editInsMarca, setEditInsMarca] = useState('');
  const [editInsSif, setEditInsSif] = useState('');
  const [savingIns, setSavingIns] = useState(false);

  const loadAll = async () => {
    if (!SYNC_ENDPOINT) return;
    setLoading(true);
    try {
      const [ri, rc, re] = await Promise.all([
        fetch(`${SYNC_ENDPOINT}?action=insumos_etiqueta&_ts=${Date.now()}`).then(r=>r.json()),
        fetch(`${SYNC_ENDPOINT}?action=categorias_validade&_ts=${Date.now()}`).then(r=>r.json()),
        fetch(`${SYNC_ENDPOINT}?action=empresa_config&_ts=${Date.now()}`).then(r=>r.json()),
      ]);
      if (ri.ok) setInsumos(ri.insumos || []);
      if (rc.ok) setCategorias(rc.categorias || []);
      if (re.ok) {
        setEmpresa(re);
        setEmpNome(re.nome || '');
        setEmpCnpj(re.cnpj || '');
        setEmpEnd(re.endereco || '');
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  // ── derivados ──
  const insumoAtual = insumos.find(i => i.nome === insumoSel);
  const categoriaAtual = categorias.find(c => c.nome === insumoAtual?.categoria_validade);

  const calcValidade = () => {
    if (!manipData || !manipHora) return null;
    const [y,m,d] = manipData.split('-').map(Number);
    const [h,min] = manipHora.split(':').map(Number);
    const dt = new Date(y, m-1, d, h, min);
    const dias = conservacao === 'resfriado'
      ? (categoriaAtual?.prazo_resfriado_dias ?? 3)
      : (categoriaAtual?.prazo_congelado_dias ?? 30);
    dt.setDate(dt.getDate() + dias);
    return dt;
  };

  const fmtDT = (dt: Date | null) => {
    if (!dt) return '—';
    const d = String(dt.getDate()).padStart(2,'0');
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const y = dt.getFullYear();
    const h = String(dt.getHours()).padStart(2,'0');
    const min = String(dt.getMinutes()).padStart(2,'0');
    return `${d}/${m}/${y} · ${h}:${min}`;
  };

  const fmtManip = () => {
    if (!manipData || !manipHora) return '—';
    const [y,m,d] = manipData.split('-');
    return `${d}/${m}/${y} · ${manipHora}`;
  };

  const validadeDT = calcValidade();

  // ── Impressão ──
  const handlePrint = () => {
    if (!insumoSel) { alert('Selecione um insumo.'); return; }
    if (!responsavel.trim()) { alert('Informe o responsável.'); return; }

    const etiquetaHTML = (idx: number) => `
      <div style="
        width:226px; height:226px;
        background:#fff;
        border:1.5px solid #233253;
        border-radius:6px;
        display:flex; flex-direction:column;
        font-family:Arial,sans-serif;
        overflow:hidden;
        page-break-inside:avoid;
        margin: ${idx > 0 ? '8px' : '0'} auto 0;
      ">
        <div style="background:#233253;color:#fff;text-align:center;padding:5px 6px 4px;font-size:13px;font-weight:bold;letter-spacing:0.3px;line-height:1.2;">
          ${insumoSel.toUpperCase()}
        </div>
        <div style="flex:1;padding:6px 8px 4px;display:flex;flex-direction:column;gap:3px;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:0.5px solid #e0e4ed;padding-bottom:3px;">
            <span style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.4px;">Marca/Fornecedor</span>
            <span style="font-size:10px;font-weight:bold;color:#233253;">
              ${insumoAtual?.marca_fornecedor || '—'}${insumoAtual?.sif ? ' · SIF ' + insumoAtual.sif : ''}
            </span>
          </div>
          <div style="display:flex;justify-content:center;padding:2px 0 3px;border-bottom:0.5px solid #e0e4ed;">
            <span style="font-size:9px;font-weight:bold;
              background:${conservacao==='resfriado'?'#e6f5ef':'#e8f0fb'};
              color:${conservacao==='resfriado'?'#005f30':'#1a3a7a'};
              border-radius:3px;padding:2px 8px;letter-spacing:0.5px;text-transform:uppercase;
              border:0.5px solid ${conservacao==='resfriado'?'#009249':'#233253'};">
              ❄ ${conservacao === 'resfriado' ? 'Resfriado' : 'Congelado'}
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:2px 0;">
            <span style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.4px;">Manipulação</span>
            <span style="font-size:10px;font-weight:bold;color:#233253;">${fmtManip()}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;background:#fdf0f1;border-radius:3px;padding:3px 5px;border:0.5px solid #cf2a39;">
            <span style="font-size:9px;color:#8a1b24;text-transform:uppercase;letter-spacing:0.4px;font-weight:bold;">Validade</span>
            <span style="font-size:11px;font-weight:bold;color:#cf2a39;">${fmtDT(validadeDT)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:2px 0;border-top:0.5px solid #e0e4ed;margin-top:2px;">
            <div style="display:flex;flex-direction:column;">
              <span style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:0.4px;">Responsável</span>
              <span style="font-size:10px;font-weight:bold;color:#233253;">${responsavel}</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;">
              <span style="font-size:8px;color:#666;text-transform:uppercase;letter-spacing:0.4px;">Peso</span>
              <span style="font-size:10px;font-weight:bold;color:#233253;">${peso || '—'}</span>
            </div>
          </div>
        </div>
        <div style="background:#233253;padding:0;">
          <div style="display:flex;height:3px;">
            <div style="flex:1;background:#009249;"></div>
            <div style="flex:1;background:#fff;"></div>
            <div style="flex:1;background:#cf2a39;"></div>
          </div>
          <div style="padding:4px 6px 5px;text-align:center;">
            <div style="color:#fff;font-size:10px;font-weight:bold;letter-spacing:1.5px;">${empresa.nome || 'FATTORIA'}</div>
            <div style="color:#7a8aa0;font-size:6.5px;margin-top:1px;">${empresa.cnpj ? 'CNPJ ' + empresa.cnpj + ' · ' : ''}${empresa.endereco || ''}</div>
          </div>
        </div>
      </div>`;

    const etiquetas = Array.from({length: qtdEtiquetas}, (_,i) => etiquetaHTML(i)).join('');

    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) { alert('Permita pop-ups para imprimir.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Etiqueta</title>
      <style>
        @page { size: 60mm 60mm; margin: 0; }
        body { margin: 0; padding: 0; background: #fff; }
        @media print { body { margin: 0; padding: 0; } }
      </style>
    </head><body>${etiquetas}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

  // ── salvar empresa ──
  const handleSaveEmpresa = async () => {
    setSavingEmp(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'save_empresa_config', nome:empNome, cnpj:empCnpj, endereco:empEnd }),
      });
      setEmpresa({ nome:empNome, cnpj:empCnpj, endereco:empEnd });
      alert('Configuração salva!');
    } catch { alert('Erro ao salvar.'); }
    finally { setSavingEmp(false); }
  };

  // ── salvar categoria ──
  const handleSaveCat = async () => {
    if (!catNome.trim()) { alert('Informe o nome da categoria.'); return; }
    setSavingCat(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'save_categoria', nome:catNome, prazo_resfriado_dias:catRef, prazo_congelado_dias:catCong, referencia:catAnvisa }),
      });
      setCatNome(''); setCatRef(3); setCatCong(30); setCatAnvisa('');
      setTimeout(() => loadAll(), 2000);
    } catch { alert('Erro ao salvar.'); }
    finally { setSavingCat(false); }
  };

  const handleDeleteCat = async (id: string) => {
    if (!confirm('Excluir esta categoria?')) return;
    await fetch(SYNC_ENDPOINT, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'delete_categoria', id }) });
    setTimeout(() => loadAll(), 2000);
  };

  const handleSaveEditCat = async () => {
    if (!editingCatId) return;
    await fetch(SYNC_ENDPOINT, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'update_categoria', id:editingCatId, nome:editCatNome, prazo_resfriado_dias:editCatRef, prazo_congelado_dias:editCatCong, referencia:editCatAnvisa }),
    });
    setEditingCatId(null);
    setTimeout(() => loadAll(), 2000);
  };

  // ── salvar insumo etiqueta ──
  const handleSaveInsEtiqueta = async () => {
    if (!editingInsumo) return;
    setSavingIns(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update_insumo_etiqueta', nome:editingInsumo, categoria_validade:editInsCat, marca_fornecedor:editInsMarca, sif:editInsSif }),
      });
      setEditingInsumo(null);
      setTimeout(() => loadAll(), 2000);
    } catch { alert('Erro ao salvar.'); }
    finally { setSavingIns(false); }
  };

  if (loading) return <div className="text-sm text-gray-500 p-4">Carregando...</div>;

  return (
    <div className="space-y-4">
      {/* sub-abas */}
      <div className="flex gap-2 border-b pb-2">
        {(['gerar','categorias','empresa'] as const).map(a => (
          <button key={a} onClick={() => setSubAba(a)}
            className={`text-sm px-3 py-1 rounded-md ${subAba===a ? 'bg-[#233253] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {a === 'gerar' ? 'Gerar Etiqueta' : a === 'categorias' ? 'Categorias de Validade' : 'Config. Empresa'}
          </button>
        ))}
      </div>

      {/* ── GERAR ETIQUETA ── */}
      {subAba === 'gerar' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* formulário */}
          <div className="space-y-4">
            <div className="border rounded-xl p-4 bg-white space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Dados do produto</h3>

              <div className="space-y-1">
                <label className="text-xs text-gray-600">Insumo</label>
                <select className="input w-full" value={insumoSel} onChange={e => setInsumoSel(e.target.value)}>
                  <option value="">Selecione...</option>
                  {insumos.map(i => <option key={i.nome} value={i.nome}>{i.nome}</option>)}
                </select>
              </div>

              {insumoAtual && (
                <div className="bg-gray-50 rounded-lg p-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Marca/Fornecedor:</span>
                    <span className="font-medium">{insumoAtual.marca_fornecedor || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">SIF:</span>
                    <span className="font-medium">{insumoAtual.sif || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Categoria:</span>
                    <span className="font-medium">{insumoAtual.categoria_validade || '—'}</span>
                  </div>
                  {!insumoAtual.categoria_validade && (
                    <button className="text-xs text-blue-500 hover:underline mt-1" onClick={() => { setEditingInsumo(insumoAtual.nome); setEditInsCat(''); setEditInsMarca(insumoAtual.marca_fornecedor||''); setEditInsSif(insumoAtual.sif||''); }}>
                      + Configurar categoria/marca/SIF
                    </button>
                  )}
                </div>
              )}

              {editingInsumo && (
                <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
                  <p className="text-xs font-medium text-blue-700">Configurar: {editingInsumo}</p>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600">Categoria de validade</label>
                    <select className="input w-full text-sm" value={editInsCat} onChange={e => setEditInsCat(e.target.value)}>
                      <option value="">Selecione...</option>
                      {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600">Marca/Fornecedor</label>
                    <input className="input w-full text-sm" value={editInsMarca} onChange={e => setEditInsMarca(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600">SIF (se aplicável)</label>
                    <input className="input w-full text-sm" placeholder="Ex: 0042" value={editInsSif} onChange={e => setEditInsSif(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-primary text-xs" onClick={handleSaveInsEtiqueta} disabled={savingIns}>{savingIns ? '...' : 'Salvar'}</button>
                    <button className="btn btn-ghost text-xs" onClick={() => setEditingInsumo(null)}>Cancelar</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Conservação</label>
                  <select className="input w-full" value={conservacao} onChange={e => setConservacao(e.target.value as any)}>
                    <option value="resfriado">Resfriado</option>
                    <option value="congelado">Congelado</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Peso/Qtd</label>
                  <input className="input w-full" placeholder="Ex: 500g" value={peso} onChange={e => setPeso(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Data de manipulação</label>
                  <input type="date" className="input w-full" value={manipData} onChange={e => setManipData(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Hora</label>
                  <input type="time" className="input w-full" value={manipHora} onChange={e => setManipHora(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-600">Responsável</label>
                <input className="input w-full" placeholder="Nome do colaborador" value={responsavel} onChange={e => setResponsavel(e.target.value)} />
              </div>

              {categoriaAtual && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                  Prazo ANVISA ({categoriaAtual.nome}): <strong>{conservacao === 'resfriado' ? categoriaAtual.prazo_resfriado_dias : categoriaAtual.prazo_congelado_dias} dias</strong> {conservacao} · {categoriaAtual.referencia}
                </div>
              )}

              <div className="flex gap-3 items-center pt-1">
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Qtd de etiquetas</label>
                  <input type="number" min={1} max={20} className="input w-20" value={qtdEtiquetas} onChange={e => setQtdEtiquetas(Math.max(1, parseInt(e.target.value)||1))} />
                </div>
                <button className="btn btn-primary flex-1 mt-4" onClick={handlePrint} style={{background: BRAND.primary}}>
                  🖨 Imprimir {qtdEtiquetas > 1 ? `${qtdEtiquetas} etiquetas` : 'etiqueta'}
                </button>
              </div>
            </div>
          </div>

          {/* preview */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-gray-500">Prévia da etiqueta</p>
            <div style={{
              width: 227, height: 227,
              background: '#fff',
              border: `1.5px solid ${BRAND.primary}`,
              borderRadius: 6,
              display: 'flex', flexDirection: 'column',
              fontFamily: 'Arial, sans-serif',
              overflow: 'hidden',
              boxShadow: '0 2px 12px rgba(35,50,83,0.18)',
            }}>
              <div style={{ background: BRAND.primary, color: '#fff', textAlign: 'center', padding: '5px 6px 4px', fontSize: 13, fontWeight: 500, letterSpacing: 0.3, lineHeight: 1.2 }}>
                {insumoSel ? insumoSel.toUpperCase() : 'NOME DO INSUMO'}
              </div>
              <div style={{ flex: 1, padding: '6px 8px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid #e0e4ed', paddingBottom: 3 }}>
                  <span style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4 }}>Marca/Fornecedor</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: BRAND.primary }}>
                    {insumoAtual?.marca_fornecedor || '—'}{insumoAtual?.sif ? ` · SIF ${insumoAtual.sif}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 3px', borderBottom: '0.5px solid #e0e4ed' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 500,
                    background: conservacao === 'resfriado' ? '#e6f5ef' : '#e8f0fb',
                    color: conservacao === 'resfriado' ? '#005f30' : '#1a3a7a',
                    borderRadius: 3, padding: '2px 8px', letterSpacing: 0.5, textTransform: 'uppercase',
                    border: `0.5px solid ${conservacao === 'resfriado' ? BRAND.green : BRAND.primary}`,
                  }}>
                    ❄ {conservacao === 'resfriado' ? 'Resfriado' : 'Congelado'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0' }}>
                  <span style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4 }}>Manipulação</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: BRAND.primary }}>{fmtManip()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', background: '#fdf0f1', borderRadius: 3, padding: '3px 5px', border: `0.5px solid ${BRAND.red}` }}>
                  <span style={{ fontSize: 9, color: '#8a1b24', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 500 }}>Validade</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: BRAND.red }}>{fmtDT(validadeDT)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0', borderTop: '0.5px solid #e0e4ed', marginTop: 2 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 8, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4 }}>Responsável</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: BRAND.primary }}>{responsavel || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 8, color: '#666', textTransform: 'uppercase', letterSpacing: 0.4 }}>Peso</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: BRAND.primary }}>{peso || '—'}</span>
                  </div>
                </div>
              </div>
              <div style={{ background: BRAND.primary, padding: 0 }}>
                <div style={{ display: 'flex', height: 3 }}>
                  <div style={{ flex: 1, background: BRAND.green }}></div>
                  <div style={{ flex: 1, background: '#fff' }}></div>
                  <div style={{ flex: 1, background: BRAND.red }}></div>
                </div>
                <div style={{ padding: '4px 6px 5px', textAlign: 'center' }}>
                  <div style={{ color: '#fff', fontSize: 10, fontWeight: 500, letterSpacing: 1.5 }}>{empresa.nome || 'FATTORIA'}</div>
                  <div style={{ color: '#7a8aa0', fontSize: 6.5, marginTop: 1 }}>
                    {empresa.cnpj ? `CNPJ ${empresa.cnpj} · ` : ''}{empresa.endereco || ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CATEGORIAS DE VALIDADE ── */}
      {subAba === 'categorias' && (
        <div className="space-y-4">
          <div className="border rounded-xl p-4 bg-white space-y-3">
            <h3 className="font-semibold text-sm text-gray-700">Nova categoria</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-gray-600">Nome da categoria</label>
                <input className="input w-full" placeholder="Ex: Laticínios manipulados" value={catNome} onChange={e => setCatNome(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-600">Prazo resfriado (dias)</label>
                <input type="number" className="input w-full" value={catRef} onChange={e => setCatRef(parseInt(e.target.value)||0)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-600">Prazo congelado (dias)</label>
                <input type="number" className="input w-full" value={catCong} onChange={e => setCatCong(parseInt(e.target.value)||0)} />
              </div>
            </div>
            <div className="flex gap-3 items-end">
              <div className="space-y-1 flex-1">
                <label className="text-xs text-gray-600">Referência ANVISA</label>
                <input className="input w-full" placeholder="Ex: CVS 5/2013" value={catAnvisa} onChange={e => setCatAnvisa(e.target.value)} />
              </div>
              <button className="btn btn-primary text-sm" onClick={handleSaveCat} disabled={savingCat}>{savingCat ? '...' : '+ Adicionar'}</button>
            </div>
          </div>

          <div className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">Categorias cadastradas</h3>
            <div className="overflow-auto">
              <table className="min-w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border px-3 py-2 text-left">Categoria</th>
                    <th className="border px-3 py-2 text-center">Resfriado (dias)</th>
                    <th className="border px-3 py-2 text-center">Congelado (dias)</th>
                    <th className="border px-3 py-2 text-left">Referência</th>
                    <th className="border px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((c, i) => (
                    editingCatId === c.id ? (
                      <tr key={c.id} className="bg-blue-50">
                        <td className="border px-2 py-1"><input className="input w-full text-sm" value={editCatNome} onChange={e => setEditCatNome(e.target.value)} /></td>
                        <td className="border px-2 py-1"><input type="number" className="input w-20 text-sm" value={editCatRef} onChange={e => setEditCatRef(parseInt(e.target.value)||0)} /></td>
                        <td className="border px-2 py-1"><input type="number" className="input w-20 text-sm" value={editCatCong} onChange={e => setEditCatCong(parseInt(e.target.value)||0)} /></td>
                        <td className="border px-2 py-1"><input className="input w-full text-sm" value={editCatAnvisa} onChange={e => setEditCatAnvisa(e.target.value)} /></td>
                        <td className="border px-2 py-1 text-center">
                          <div className="flex gap-1 justify-center">
                            <button className="text-xs text-green-600 hover:underline" onClick={handleSaveEditCat}>Salvar</button>
                            <button className="text-xs text-gray-500 hover:underline" onClick={() => setEditingCatId(null)}>Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border px-3 py-2">{c.nome}</td>
                        <td className="border px-3 py-2 text-center">{c.prazo_resfriado_dias}</td>
                        <td className="border px-3 py-2 text-center">{c.prazo_congelado_dias > 0 ? c.prazo_congelado_dias : '—'}</td>
                        <td className="border px-3 py-2 text-xs text-gray-500">{c.referencia}</td>
                        <td className="border px-3 py-2 text-center">
                          <div className="flex gap-2 justify-center">
                            <button className="text-xs text-blue-500 hover:underline" onClick={() => { setEditingCatId(c.id); setEditCatNome(c.nome); setEditCatRef(c.prazo_resfriado_dias); setEditCatCong(c.prazo_congelado_dias); setEditCatAnvisa(c.referencia); }}>Editar</button>
                            <button className="text-xs text-red-500 hover:underline" onClick={() => handleDeleteCat(c.id)}>Excluir</button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIG EMPRESA ── */}
      {subAba === 'empresa' && (
        <div className="border rounded-xl p-4 bg-white space-y-4 max-w-lg">
          <h3 className="font-semibold text-sm text-gray-700">Dados da empresa (rodapé da etiqueta)</h3>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Nome da empresa</label>
            <input className="input w-full" placeholder="Ex: Fattoria Pizza Napoletana" value={empNome} onChange={e => setEmpNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">CNPJ</label>
            <input className="input w-full" placeholder="Ex: 12.345.678/0001-99" value={empCnpj} onChange={e => setEmpCnpj(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Endereço</label>
            <input className="input w-full" placeholder="Ex: Rua das Flores, 123 — Centro, SP" value={empEnd} onChange={e => setEmpEnd(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={handleSaveEmpresa} disabled={savingEmp} style={{background: BRAND.primary}}>
            {savingEmp ? 'Salvando...' : 'Salvar configuração'}
          </button>
        </div>
      )}
    </div>
  );
}

// ======== MARKUP ========

function MarkupTab() {
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));
  const fmtPct = (n: number) => `${Number(n || 0).toFixed(2)}%`;

  // ── config geral ──
  const [fatMin, setFatMin] = useState("0");
  const [impostoPct, setImpostoPct] = useState("0");
  const [cartaoPct, setCartaoPct] = useState("0");
  const [margemPct, setMargemPct] = useState("0");
  const [savingConfig, setSavingConfig] = useState(false);

  // ── despesas ──
  const [despesas, setDespesas] = useState<{ id: string; tipo: string; descricao: string; valor: number }[]>([]);
  const [loadingDespesas, setLoadingDespesas] = useState(true);

  // nova despesa
  const [novaTipo, setNovaTipo] = useState<"fixa" | "variavel">("fixa");
  const [novaDesc, setNovaDesc] = useState("");
  const [novaValor, setNovaValor] = useState("");
  const [addingDespesa, setAddingDespesa] = useState(false);

  // edição inline de despesa
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editValor, setEditValor] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // produtos da ficha técnica
  const [produtos, setProdutos] = useState<{ nome: string; custo: number }[]>([]);

  const loadConfig = async () => {
    if (!SYNC_ENDPOINT) return;
    setLoadingDespesas(true);
    try {
      const res = await fetch(`${SYNC_ENDPOINT}?action=markup_config&_ts=${Date.now()}`);
      const json = await res.json();
      if (json.ok) {
        setFatMin(String(json.faturamento_minimo ?? 0));
        setImpostoPct(String(json.impostos_pct ?? 0));
        setCartaoPct(String(json.cartao_pct ?? 0));
        setMargemPct(String(json.margem_lucro_pct ?? 0));
        setDespesas(json.despesas || []);
      }
    } catch {}
    finally { setLoadingDespesas(false); }
  };

  const loadProdutos = async () => {
    if (!SYNC_ENDPOINT) return;
    try {
      const res = await fetch(`${SYNC_ENDPOINT}?action=fichas_lista&_ts=${Date.now()}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.produtos)) {
        setProdutos(json.produtos.map((f: any) => ({ nome: f.nome, custo: f.custoTotal ?? 0 })));
      }
    } catch {}
  };

  useEffect(() => { loadConfig(); loadProdutos(); }, []);

  // ── cálculo do índice ──
  const fat = parseFloat(fatMin) || 0;
  const fixas    = despesas.filter(d => d.tipo === "fixa").reduce((s, d) => s + d.valor, 0);
  const variaveis = despesas.filter(d => d.tipo === "variavel").reduce((s, d) => s + d.valor, 0);
  const pctFixas    = fat > 0 ? (fixas / fat) * 100 : 0;
  const pctVariaveis = fat > 0 ? (variaveis / fat) * 100 : 0;
  const impostoN = parseFloat(impostoPct) || 0;
  const cartaoN  = parseFloat(cartaoPct) || 0;
  const margemN  = parseFloat(margemPct) || 0;
  const somaPct  = impostoN + cartaoN + pctFixas + pctVariaveis + margemN;
  const indice   = somaPct < 100 ? 100 / (100 - somaPct) : 0;

  const handleSaveConfig = async () => {
    if (!SYNC_ENDPOINT) return;
    setSavingConfig(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_markup_config",
          faturamento_minimo: parseFloat(fatMin) || 0,
          impostos_pct: parseFloat(impostoPct) || 0,
          cartao_pct: parseFloat(cartaoPct) || 0,
          margem_lucro_pct: parseFloat(margemPct) || 0,
        }),
      });
      alert("Configuração salva!");
    } catch { alert("Erro ao salvar."); }
    finally { setSavingConfig(false); }
  };

  const handleAddDespesa = async () => {
    if (!novaDesc.trim()) { alert("Informe a descrição."); return; }
    if (!SYNC_ENDPOINT) return;
    setAddingDespesa(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_despesa", tipo: novaTipo, descricao: novaDesc.trim(), valor: parseFloat(novaValor) || 0 }),
      });
      setNovaDesc(""); setNovaValor("");
      setTimeout(() => loadConfig(), 2000);
    } catch { alert("Erro ao adicionar."); }
    finally { setAddingDespesa(false); }
  };

  const handleDeleteDespesa = async (id: string) => {
    if (!confirm("Excluir esta despesa?")) return;
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_despesa", id }),
      });
      setTimeout(() => loadConfig(), 2000);
    } catch { alert("Erro ao excluir."); }
  };

  const openEdit = (d: any) => { setEditingId(d.id); setEditDesc(d.descricao); setEditValor(String(d.valor)); };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSavingEdit(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_despesa", id: editingId, descricao: editDesc, valor: parseFloat(editValor) || 0 }),
      });
      setEditingId(null);
      setTimeout(() => loadConfig(), 2000);
    } catch { alert("Erro ao salvar."); }
    finally { setSavingEdit(false); }
  };

  const fixasList    = despesas.filter(d => d.tipo === "fixa");
  const variaveisList = despesas.filter(d => d.tipo === "variavel");

  const DespesaTable = ({ lista, titulo }: { lista: typeof despesas; titulo: string }) => (
    <div className="space-y-2">
      <h4 className="font-medium text-sm text-gray-700">{titulo}</h4>
      {lista.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhuma despesa cadastrada.</p>
      ) : (
        <table className="min-w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-1 text-left">Descrição</th>
              <th className="border px-3 py-1 text-right">Valor (R$)</th>
              <th className="border px-3 py-1 text-right">% s/ fat.</th>
              <th className="border px-3 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((d, i) => (
              editingId === d.id ? (
                <tr key={d.id} className="bg-blue-50">
                  <td className="border px-3 py-1">
                    <input className="input w-full text-sm" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                  </td>
                  <td className="border px-3 py-1">
                    <input type="number" step="0.01" className="input w-28 text-sm" value={editValor} onChange={e => setEditValor(e.target.value)} />
                  </td>
                  <td className="border px-3 py-1 text-right text-gray-400">—</td>
                  <td className="border px-3 py-1 text-center">
                    <div className="flex gap-2 justify-center">
                      <button className="text-xs text-green-600 hover:underline" onClick={handleSaveEdit} disabled={savingEdit}>{savingEdit ? "..." : "Salvar"}</button>
                      <button className="text-xs text-gray-500 hover:underline" onClick={() => setEditingId(null)}>Cancelar</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border px-3 py-1">{d.descricao}</td>
                  <td className="border px-3 py-1 text-right">{fmtMoney(d.valor)}</td>
                  <td className="border px-3 py-1 text-right">{fat > 0 ? fmtPct((d.valor / fat) * 100) : "—"}</td>
                  <td className="border px-3 py-1 text-center">
                    <div className="flex gap-2 justify-center">
                      <button className="text-xs text-blue-500 hover:underline" onClick={() => openEdit(d)}>Editar</button>
                      <button className="text-xs text-red-500 hover:underline" onClick={() => handleDeleteDespesa(d.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              )
            ))}
            <tr className="bg-gray-100 font-semibold text-sm">
              <td className="border px-3 py-1">Total</td>
              <td className="border px-3 py-1 text-right">{fmtMoney(lista.reduce((s, d) => s + d.valor, 0))}</td>
              <td className="border px-3 py-1 text-right">{fat > 0 ? fmtPct((lista.reduce((s,d) => s+d.valor,0)/fat)*100) : "—"}</td>
              <td className="border px-3 py-1"></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Configuração base ── */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h3 className="font-semibold text-base">Configuração base</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Faturamento mínimo desejado (R$)</label>
            <input type="number" step="0.01" className="input w-full" value={fatMin} onChange={e => setFatMin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Impostos (%)</label>
            <input type="number" step="0.01" className="input w-full" value={impostoPct} onChange={e => setImpostoPct(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Taxa de cartão (%)</label>
            <input type="number" step="0.01" className="input w-full" value={cartaoPct} onChange={e => setCartaoPct(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Margem de lucro (%)</label>
            <input type="number" step="0.01" className="input w-full" value={margemPct} onChange={e => setMargemPct(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleSaveConfig} disabled={savingConfig}>
          {savingConfig ? "Salvando..." : "Salvar configuração"}
        </button>
      </div>

      {/* ── Índice de markup ── */}
      <div className="border rounded-xl p-4 bg-white">
        <h3 className="font-semibold text-base mb-3">Índice de markup</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          {[
            { label: "Impostos", value: fmtPct(impostoN) },
            { label: "Taxa cartão", value: fmtPct(cartaoN) },
            { label: "Desp. Fixas", value: fmtPct(pctFixas) },
            { label: "Desp. Variáveis", value: fmtPct(pctVariaveis) },
            { label: "Margem", value: fmtPct(margemN) },
            { label: "Total deduções", value: fmtPct(somaPct) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="font-semibold text-gray-800">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-6 py-4 text-center">
            <div className="text-xs text-orange-600 mb-1">Índice de Markup</div>
            <div className="text-3xl font-bold text-orange-700">{indice > 0 ? indice.toFixed(4) : "—"}</div>
          </div>
          {somaPct >= 100 && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              ⚠ A soma das deduções ({fmtPct(somaPct)}) é ≥ 100%. Revise os percentuais.
            </div>
          )}
        </div>
      </div>

      {/* ── Despesas ── */}
      <div className="border rounded-xl p-4 bg-white space-y-5">
        <h3 className="font-semibold text-base">Despesas</h3>

        {/* form nova despesa */}
        <div className="flex flex-wrap gap-3 items-end bg-gray-50 rounded-lg p-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Tipo</label>
            <select className="input text-sm" value={novaTipo} onChange={e => setNovaTipo(e.target.value as any)}>
              <option value="fixa">Fixa</option>
              <option value="variavel">Variável</option>
            </select>
          </div>
          <div className="space-y-1 flex-1 min-w-40">
            <label className="text-xs text-gray-600">Descrição</label>
            <input className="input w-full text-sm" placeholder="Ex: Aluguel, Software..." value={novaDesc} onChange={e => setNovaDesc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Valor (R$)</label>
            <input type="number" step="0.01" className="input text-sm w-32" value={novaValor} onChange={e => setNovaValor(e.target.value)} />
          </div>
          <button className="btn btn-primary text-sm" onClick={handleAddDespesa} disabled={addingDespesa}>
            {addingDespesa ? "..." : "+ Adicionar"}
          </button>
        </div>

        {loadingDespesas ? (
          <div className="text-sm text-gray-500">Carregando...</div>
        ) : (
          <div className="space-y-5">
            <DespesaTable lista={fixasList} titulo="Despesas Fixas" />
            <DespesaTable lista={variaveisList} titulo="Despesas Variáveis" />
          </div>
        )}
      </div>

      {/* ── Preços sugeridos ── */}
      <div className="border rounded-xl p-4 bg-white space-y-3">
        <h3 className="font-semibold text-base">Preços sugeridos por produto</h3>
        {produtos.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum produto com ficha técnica cadastrado.</p>
        ) : (
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Produto</th>
                <th className="border px-3 py-2 text-right">Custo</th>
                <th className="border px-3 py-2 text-right">Índice</th>
                <th className="border px-3 py-2 text-right">Preço sugerido</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border px-3 py-2">{p.nome}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(p.custo)}</td>
                  <td className="border px-3 py-2 text-right">{indice > 0 ? indice.toFixed(4) : "—"}</td>
                  <td className="border px-3 py-2 text-right font-semibold">
                    {indice > 0 ? fmtMoney(p.custo * indice) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

// ======== COMISSÃO E PAGAMENTO ========

function CommissionTab() {
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

  const toDDMMYYYY = (raw: string) => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  };

  // ── form novo registro ──
  const [dateRaw, setDateRaw] = useState("");
  const [turno, setTurno] = useState("Noite");
  const [valor, setValor] = useState("");
  const [faturamento, setFaturamento] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState("");

  // ── histórico ──
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-01`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const [filterStart, setFilterStart] = useState(firstOfMonth);
  const [filterEnd, setFilterEnd] = useState(todayStr);
  const [comissoes, setComissoes] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // ── edição inline ──
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editValor, setEditValor] = useState("");
  const [editFat, setEditFat] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // ── relatório de pagamentos ──
  const [startRaw, setStartRaw] = useState("");
  const [endRaw, setEndRaw] = useState("");
  const [generatingReports, setGeneratingReports] = useState(false);

  const loadComissoes = async () => {
    if (!SYNC_ENDPOINT) return;
    setLoadingList(true);
    try {
      const res = await fetch(
        `${SYNC_ENDPOINT}?action=comissoes_lista&start=${encodeURIComponent(toDDMMYYYY(filterStart))}&end=${encodeURIComponent(toDDMMYYYY(filterEnd))}&_ts=${Date.now()}`
      );
      const json = await res.json();
      if (json.ok) setComissoes(json.rows || []);
    } catch {}
    finally { setLoadingList(false); }
  };

  useEffect(() => { loadComissoes(); }, [filterStart, filterEnd]);

  // Verifica duplicata ao mudar a data
  const handleDateChange = (v: string) => {
    setDateRaw(v);
    const dd = toDDMMYYYY(v);
    if (dd && comissoes.some(c => c.data === dd)) {
      setDuplicateWarning(`Já existe um registro para ${dd}. Edite o registro existente na lista abaixo.`);
    } else {
      setDuplicateWarning("");
    }
  };

  const handleSave = async () => {
    if (!dateRaw) { alert("Selecione a data."); return; }
    if (!valor)   { alert("Informe o valor da comissão."); return; }
    if (!faturamento) { alert("Informe o faturamento."); return; }
    const dateStr = toDDMMYYYY(dateRaw);
    if (duplicateWarning) { alert(duplicateWarning); return; }
    if (!SYNC_ENDPOINT) return;
    setSaving(true);
    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comissao", date: dateStr, turno, valor, faturamento }),
      });
      // com no-cors não lemos a resposta — assumimos sucesso e recarregamos
      setDateRaw(""); setValor(""); setFaturamento(""); setDuplicateWarning("");
      setTimeout(() => loadComissoes(), 2000);
    } catch (err: any) {
      alert(`Erro: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (date: string) => {
    if (!confirm(`Excluir comissão de ${date}?`)) return;
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_comissao", date }),
      });
      setTimeout(() => loadComissoes(), 2000);
    } catch { alert("Erro ao excluir."); }
  };

  const openEdit = (c: any) => {
    setEditingDate(c.data);
    setEditValor(String(c.valor));
    setEditFat(String(c.faturamento));
  };

  const handleSaveEdit = async () => {
    if (!editingDate) return;
    setSavingEdit(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_comissao",
          date: editingDate,
          valor: parseFloat(editValor),
          faturamento: parseFloat(editFat),
        }),
      });
      setEditingDate(null);
      setTimeout(() => loadComissoes(), 2000);
    } catch { alert("Erro ao salvar."); }
    finally { setSavingEdit(false); }
  };

  const handlePaymentsReport = async () => {
    if (generatingReports) return;
    if (!startRaw || !endRaw) { alert("Selecione data inicial e final."); return; }
    if (!SYNC_ENDPOINT) return;
    setGeneratingReports(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "payments_report", startDate: toDDMMYYYY(startRaw), endDate: toDDMMYYYY(endRaw) }),
      });
      alert("Relatórios de pagamentos gerados (solicitação enviada ao servidor).");
    } catch (err: any) {
      alert(`Erro: ${String(err)}`);
    } finally {
      setGeneratingReports(false);
    }
  };

  const totalValor = comissoes.reduce((s, c) => s + c.valor, 0);
  const totalFat   = comissoes.reduce((s, c) => s + c.faturamento, 0);

  return (
    <div className="space-y-6">

      {/* ── Registrar comissão ── */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h3 className="font-semibold text-base">Registrar comissão do dia</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data</label>
            <input type="date" className="input w-full" value={dateRaw} onChange={e => handleDateChange(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Turno</label>
            <select className="input w-full" value={turno} onChange={e => setTurno(e.target.value)}>
              <option value="Noite">Noite</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Valor da comissão (R$)</label>
            <input type="number" step="0.01" className="input w-full" value={valor} onChange={e => setValor(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Faturamento (R$)</label>
            <input type="number" step="0.01" className="input w-full" value={faturamento} onChange={e => setFaturamento(e.target.value)} />
          </div>
        </div>
        {duplicateWarning && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            ⚠ {duplicateWarning}
          </div>
        )}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !!duplicateWarning}>
          {saving ? "Registrando..." : "Registrar comissão"}
        </button>
      </div>

      {/* ── Histórico de comissões ── */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h3 className="font-semibold text-base">Histórico de comissões</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">De</label>
            <input type="date" className="input" value={filterStart} onChange={e => setFilterStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Até</label>
            <input type="date" className="input" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} />
          </div>
          <button className="btn btn-ghost text-sm" onClick={loadComissoes}>Filtrar</button>
        </div>

        {loadingList ? (
          <div className="text-sm text-gray-500">Carregando...</div>
        ) : comissoes.length === 0 ? (
          <div className="text-sm text-gray-500">Nenhum registro no período.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left">Data</th>
                  <th className="border px-3 py-2 text-left">Turno</th>
                  <th className="border px-3 py-2 text-right">Comissão</th>
                  <th className="border px-3 py-2 text-right">Faturamento</th>
                  <th className="border px-3 py-2 text-right">% Com.</th>
                  <th className="border px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {comissoes.map((c, i) => (
                  editingDate === c.data ? (
                    <tr key={i} className="bg-blue-50">
                      <td className="border px-3 py-2">{c.data}</td>
                      <td className="border px-3 py-2">{c.turno}</td>
                      <td className="border px-3 py-2">
                        <input type="number" step="0.01" className="input w-28" value={editValor} onChange={e => setEditValor(e.target.value)} />
                      </td>
                      <td className="border px-3 py-2">
                        <input type="number" step="0.01" className="input w-28" value={editFat} onChange={e => setEditFat(e.target.value)} />
                      </td>
                      <td className="border px-3 py-2 text-right text-gray-400">—</td>
                      <td className="border px-3 py-2 text-center">
                        <div className="flex gap-2 justify-center">
                          <button className="text-xs text-green-600 hover:underline" onClick={handleSaveEdit} disabled={savingEdit}>
                            {savingEdit ? "..." : "Salvar"}
                          </button>
                          <button className="text-xs text-gray-500 hover:underline" onClick={() => setEditingDate(null)}>Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border px-3 py-2">{c.data}</td>
                      <td className="border px-3 py-2">{c.turno}</td>
                      <td className="border px-3 py-2 text-right">{fmtMoney(c.valor)}</td>
                      <td className="border px-3 py-2 text-right">{fmtMoney(c.faturamento)}</td>
                      <td className="border px-3 py-2 text-right">
                        {c.faturamento > 0 ? `${((c.valor / c.faturamento) * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="border px-3 py-2 text-center">
                        <div className="flex gap-2 justify-center">
                          <button className="text-xs text-blue-500 hover:underline" onClick={() => openEdit(c)}>Editar</button>
                          <button className="text-xs text-red-500 hover:underline" onClick={() => handleDelete(c.data)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
                <tr className="bg-gray-100 font-semibold">
                  <td className="border px-3 py-2" colSpan={2}>Total</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(totalValor)}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(totalFat)}</td>
                  <td className="border px-3 py-2 text-right">
                    {totalFat > 0 ? `${((totalValor / totalFat) * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="border px-3 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagamentos ── */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h3 className="font-semibold text-base">Pagamentos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data inicial</label>
            <input type="date" className="input w-full" value={startRaw} onChange={e => setStartRaw(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data final</label>
            <input type="date" className="input w-full" value={endRaw} onChange={e => setEndRaw(e.target.value)} />
          </div>
        </div>
        <button onClick={handlePaymentsReport} disabled={generatingReports} className="btn btn-primary">
          {generatingReports ? "Processando..." : "Gerar relatórios de Pagamentos"}
        </button>
      </div>
    </div>
  );
}

// ======== ABA CAIXA ========
interface CaixaRow {
  timestamp: string;
  data: string;
  tipo: "entrada" | "saida";
  valor: number;
  categoria: string;
  observacao: string;
}

function CaixaTab() {
  const [categorias, setCategorias] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [rows, setRows] = useState<CaixaRow[]>([]);
  const [totalEntradas, setTotalEntradas] = useState(0);
  const [totalSaidas, setTotalSaidas] = useState(0);
  const [saldo, setSaldo] = useState(0);

  // form novo lançamento
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [valor, setValor] = useState("");
  const [dateRaw, setDateRaw] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState("");
  const [observacao, setObservacao] = useState("");

  // filtro histórico
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");

  // edição inline
  const [editingTs, setEditingTs] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTipo, setEditTipo] = useState<"entrada" | "saida">("entrada");
  const [editValor, setEditValor] = useState("");
  const [editCategoria, setEditCategoria] = useState("");
  const [editObservacao, setEditObservacao] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

  const formatDateForPayload = (raw: string) => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  };

  useEffect(() => {
    loadCategorias();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCategorias() {
    if (!SYNC_ENDPOINT) return;
    try {
      const resp = await fetch(`${SYNC_ENDPOINT}?action=caixa_categorias&_ts=${Date.now()}`);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.categorias)) {
        setCategorias(data.categorias as string[]);
        if (data.categorias.length > 0) setCategoria(data.categorias[0]);
      }
    } catch (err) {
      console.error("Falha ao carregar categorias:", err);
    }
  }

  async function loadData() {
    if (!SYNC_ENDPOINT) return;
    setLoadingData(true);
    try {
      const startParam = filterStart ? encodeURIComponent(formatDateForPayload(filterStart)) : "";
      const endParam   = filterEnd   ? encodeURIComponent(formatDateForPayload(filterEnd))   : "";
      const url = `${SYNC_ENDPOINT}?action=caixa_lista&start=${startParam}&end=${endParam}&_ts=${Date.now()}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.ok) {
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotalEntradas(Number(data.totalEntradas || 0));
        setTotalSaidas(Number(data.totalSaidas || 0));
        setSaldo(Number(data.saldo || 0));
      }
    } catch (err) {
      console.error("Falha ao carregar caixa:", err);
    } finally {
      setLoadingData(false);
    }
  }

  // converte YYYY-MM-DD → DD/MM/YYYY para o backend
  const toPayloadDate = (raw: string) => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    return d && m && y ? `${d}/${m}/${y}` : "";
  };
  // converte DD/MM/YYYY → YYYY-MM-DD para input[type=date]
  const toInputDate = (dmy: string) => {
    if (!dmy) return "";
    const [d, m, y] = dmy.split("/");
    return d && m && y ? `${y}-${m}-${d}` : "";
  };

  const startEdit = (r: CaixaRow) => {
    setEditingTs(r.timestamp);
    setEditDate(toInputDate(r.data));
    setEditTipo(r.tipo);
    setEditValor(String(r.valor));
    setEditCategoria(r.categoria);
    setEditObservacao(r.observacao);
  };

  const cancelEdit = () => setEditingTs(null);

  const handleSaveEdit = async () => {
    if (editSaving || !editingTs) return;
    if (!editDate)  { alert("Selecione a data."); return; }
    if (!editValor) { alert("Informe o valor."); return; }
    const num = parseFloat(editValor.replace(",", "."));
    if (isNaN(num) || num <= 0) { alert("Valor inválido."); return; }

    setEditSaving(true);
    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "update_caixa",
          timestamp: editingTs,
          date: toPayloadDate(editDate),
          tipo: editTipo,
          valor: num,
          categoria: editCategoria,
          observacao: editObservacao,
        }),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        setEditingTs(null);
        loadData();
        return;
      }
      setEditingTs(null);
      loadData();
    } catch (err: any) {
      alert(`Erro ao salvar edição: ${String(err)}`);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteRow = async (timestamp: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "delete_caixa", timestamp }),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        loadData();
        return;
      }
      loadData();
    } catch (err: any) {
      alert(`Erro ao excluir: ${String(err)}`);
    }
  };

  async function handleSave() {
    if (saving) return;
    if (!dateRaw)  { alert("Selecione a data."); return; }
    if (!valor)    { alert("Informe o valor."); return; }
    const num = parseFloat(valor.replace(",", "."));
    if (isNaN(num) || num <= 0) { alert("Valor inválido."); return; }
    if (!categoria) { alert("Selecione a categoria."); return; }
    if (!SYNC_ENDPOINT) { alert("Nenhum endpoint configurado."); return; }

    const payload = {
      action: "save_caixa",
      date: formatDateForPayload(dateRaw),
      tipo,
      valor: num,
      categoria,
      observacao,
    };

    setSaving(true);
    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert("Lançamento registrado.");
        setValor("");
        setObservacao("");
        setTimeout(() => loadData(), 2000);
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao registrar (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
        return;
      }
      alert("Lançamento registrado.");
      setValor("");
      setObservacao("");
      setTimeout(() => loadData(), 2000);
    } catch (err: any) {
      alert(`Erro: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!SYNC_ENDPOINT) {
    return <div className="text-sm text-red-600">Nenhum endpoint de sincronização configurado.</div>;
  }

  return (
    <div className="space-y-6">

      {/* Saldo em destaque */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={`border-2 rounded-xl p-4 text-center ${saldo >= 0 ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"}`}>
          <div className="text-xs text-gray-500 mb-1">Saldo em caixa</div>
          <div className={`text-2xl font-bold ${saldo >= 0 ? "text-green-700" : "text-red-700"}`}>
            {fmtMoney(saldo)}
          </div>
        </div>
        <div className="border rounded-xl p-4 text-center bg-white">
          <div className="text-xs text-gray-500 mb-1">Total entradas</div>
          <div className="text-xl font-semibold text-green-600">{fmtMoney(totalEntradas)}</div>
        </div>
        <div className="border rounded-xl p-4 text-center bg-white">
          <div className="text-xs text-gray-500 mb-1">Total saídas</div>
          <div className="text-xl font-semibold text-red-600">{fmtMoney(totalSaidas)}</div>
        </div>
      </div>

      {/* Formulário */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h3 className="font-semibold text-base">Novo lançamento</h3>

        {/* Entrada / Saída toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTipo("entrada")}
            className={`flex-1 py-2 rounded-lg font-medium text-sm border transition-colors ${
              tipo === "entrada"
                ? "bg-green-500 text-white border-green-500"
                : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            ↑ Entrada
          </button>
          <button
            type="button"
            onClick={() => setTipo("saida")}
            className={`flex-1 py-2 rounded-lg font-medium text-sm border transition-colors ${
              tipo === "saida"
                ? "bg-red-500 text-white border-red-500"
                : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            ↓ Saída
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input w-full"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data</label>
            <input
              type="date"
              className="input w-full"
              value={dateRaw}
              onChange={(e) => setDateRaw(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Categoria</label>
            <select
              className="input w-full"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {categorias.length === 0 && (
                <option value="">Nenhuma categoria cadastrada</option>
              )}
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {categorias.length === 0 && (
              <div className="text-xs text-amber-600">
                Crie a planilha "Categorias_Caixa" na pasta do app para listar as categorias.
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Observação (opcional)</label>
            <input
              type="text"
              className="input w-full"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: Troco para abertura"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={`btn ${tipo === "entrada" ? "btn-primary" : "bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium"} ${saving ? "opacity-70 cursor-not-allowed" : ""}`}
        >
          {saving ? "Registrando..." : `Registrar ${tipo === "entrada" ? "entrada" : "saída"}`}
        </button>
      </div>

      {/* Histórico */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Histórico</h3>
          <button
            onClick={loadData}
            disabled={loadingData}
            className={`btn btn-ghost text-xs ${loadingData ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {loadingData ? "Carregando..." : "Atualizar"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data inicial</label>
            <input
              type="date"
              className="input w-full"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data final</label>
            <input
              type="date"
              className="input w-full"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
            />
          </div>
          <button onClick={loadData} disabled={loadingData} className="btn btn-secondary">
            Filtrar
          </button>
        </div>

        {loadingData && <div className="text-sm text-gray-500">Carregando...</div>}

        {!loadingData && rows.length === 0 && (
          <div className="text-sm text-gray-500">Nenhum lançamento encontrado.</div>
        )}

        {!loadingData && rows.length > 0 && (
          <div className="overflow-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left">Data</th>
                  <th className="border px-3 py-2 text-left">Tipo</th>
                  <th className="border px-3 py-2 text-right">Valor</th>
                  <th className="border px-3 py-2 text-left">Categoria</th>
                  <th className="border px-3 py-2 text-left">Observação</th>
                  <th className="border px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isEditing = editingTs === r.timestamp;
                  return isEditing ? (
                    <tr key={i} className="bg-blue-50">
                      <td className="border px-2 py-1">
                        <input type="date" className="input w-full text-xs" value={editDate} onChange={e => setEditDate(e.target.value)} />
                      </td>
                      <td className="border px-2 py-1">
                        <select className="input w-full text-xs" value={editTipo} onChange={e => setEditTipo(e.target.value as "entrada" | "saida")}>
                          <option value="entrada">↑ Entrada</option>
                          <option value="saida">↓ Saída</option>
                        </select>
                      </td>
                      <td className="border px-2 py-1">
                        <input type="number" step="0.01" className="input w-full text-xs" value={editValor} onChange={e => setEditValor(e.target.value)} />
                      </td>
                      <td className="border px-2 py-1">
                        <select className="input w-full text-xs" value={editCategoria} onChange={e => setEditCategoria(e.target.value)}>
                          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="border px-2 py-1">
                        <input type="text" className="input w-full text-xs" value={editObservacao} onChange={e => setEditObservacao(e.target.value)} />
                      </td>
                      <td className="border px-2 py-1 whitespace-nowrap">
                        <button onClick={handleSaveEdit} disabled={editSaving} className="btn btn-primary text-xs py-1 px-2 mr-1">
                          {editSaving ? "..." : "Salvar"}
                        </button>
                        <button onClick={cancelEdit} className="btn btn-ghost text-xs py-1 px-2">
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border px-3 py-2">{r.data}</td>
                      <td className="border px-3 py-2">
                        <span className={`font-medium ${r.tipo === "entrada" ? "text-green-600" : "text-red-600"}`}>
                          {r.tipo === "entrada" ? "↑ Entrada" : "↓ Saída"}
                        </span>
                      </td>
                      <td className={`border px-3 py-2 text-right font-medium ${r.tipo === "entrada" ? "text-green-600" : "text-red-600"}`}>
                        {r.tipo === "saida" ? "- " : ""}{fmtMoney(r.valor)}
                      </td>
                      <td className="border px-3 py-2">{r.categoria || "—"}</td>
                      <td className="border px-3 py-2 text-gray-600">{r.observacao || "—"}</td>
                      <td className="border px-3 py-2 whitespace-nowrap">
                        <button onClick={() => startEdit(r)} className="text-xs text-blue-600 hover:underline mr-2">Editar</button>
                        <button onClick={() => handleDeleteRow(r.timestamp)} className="text-xs text-red-500 hover:underline">Excluir</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ======== ABA ADIANTAMENTOS ========
interface AdiantamentoRow {
  timestamp: string;
  data: string;
  colaborador: string;
  valor: number;
  metodo: string;
  observacao: string;
}

function AdiantamentosTab() {
  const [staff, setStaff] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [history, setHistory] = useState<AdiantamentoRow[]>([]);

  // form
  const [colaborador, setColaborador] = useState<string>("");
  const [dateRaw, setDateRaw] = useState<string>(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState<string>("");
  const [metodo, setMetodo] = useState<string>("pix");
  const [observacao, setObservacao] = useState<string>("");

  // filtro histórico
  const [filterStart, setFilterStart] = useState<string>("");
  const [filterEnd, setFilterEnd] = useState<string>("");

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

  const formatDateForPayload = (raw: string) => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  };

  useEffect(() => {
    loadStaff();
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStaff() {
    if (!SYNC_ENDPOINT) return;
    try {
      const resp = await fetch(`${SYNC_ENDPOINT}?action=staff`);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.names)) {
        setStaff(data.names as string[]);
      }
    } catch (err) {
      console.error("Falha ao carregar colaboradores:", err);
    }
  }

  async function loadHistory() {
    if (!SYNC_ENDPOINT) return;
    setLoadingHistory(true);
    try {
      const startParam = filterStart ? encodeURIComponent(formatDateForPayload(filterStart)) : "";
      const endParam   = filterEnd   ? encodeURIComponent(formatDateForPayload(filterEnd))   : "";
      const url = `${SYNC_ENDPOINT}?action=adiantamentos_lista&start=${startParam}&end=${endParam}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.rows)) {
        setHistory(data.rows as AdiantamentoRow[]);
      }
    } catch (err) {
      console.error("Falha ao carregar histórico:", err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSave() {
    if (saving) return;
    if (!colaborador) { alert("Selecione o colaborador."); return; }
    if (!dateRaw)     { alert("Selecione a data."); return; }
    if (!valor)       { alert("Informe o valor."); return; }
    const num = parseFloat(valor.replace(",", "."));
    if (isNaN(num) || num <= 0) { alert("Valor inválido."); return; }

    if (!SYNC_ENDPOINT) { alert("Nenhum endpoint configurado."); return; }

    const payload = {
      action: "save_adiantamento",
      date: formatDateForPayload(dateRaw),
      colaborador,
      valor: num,
      metodo,
      observacao,
    };

    setSaving(true);
    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert("Adiantamento registrado.");
        setValor("");
        setObservacao("");
        loadHistory();
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(`Falha ao registrar (HTTP ${resp.status}). ${txt.slice(0, 180)}`);
        return;
      }
      alert("Adiantamento registrado.");
      setValor("");
      setObservacao("");
      loadHistory();
    } catch (err: any) {
      alert(`Erro: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const totalHistorico = history.reduce((acc, r) => acc + Number(r.valor || 0), 0);

  if (!SYNC_ENDPOINT) {
    return <div className="text-sm text-red-600">Nenhum endpoint de sincronização configurado.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Formulário de registro */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <h3 className="font-semibold text-base">Registrar adiantamento</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Colaborador</label>
            <select
              className="input w-full"
              value={colaborador}
              onChange={(e) => setColaborador(e.target.value)}
            >
              <option value="">Selecione...</option>
              {staff.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data</label>
            <input
              type="date"
              className="input w-full"
              value={dateRaw}
              onChange={(e) => setDateRaw(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input w-full"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Método</label>
            <select
              className="input w-full"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
            >
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Observação (opcional)</label>
          <input
            type="text"
            className="input w-full"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: Adiantamento de quinzena"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={`btn btn-primary ${saving ? "opacity-70 cursor-not-allowed" : ""}`}
        >
          {saving ? "Registrando..." : "Registrar adiantamento"}
        </button>
      </div>

      {/* Histórico */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Histórico de adiantamentos</h3>
          <button
            onClick={loadHistory}
            disabled={loadingHistory}
            className={`btn btn-ghost text-xs ${loadingHistory ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {loadingHistory ? "Carregando..." : "Atualizar"}
          </button>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data inicial</label>
            <input
              type="date"
              className="input w-full"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data final</label>
            <input
              type="date"
              className="input w-full"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
            />
          </div>
          <button
            onClick={loadHistory}
            disabled={loadingHistory}
            className="btn btn-secondary"
          >
            Filtrar
          </button>
        </div>

        {loadingHistory && (
          <div className="text-sm text-gray-500">Carregando histórico...</div>
        )}

        {!loadingHistory && history.length === 0 && (
          <div className="text-sm text-gray-500">Nenhum adiantamento encontrado para o período.</div>
        )}

        {!loadingHistory && history.length > 0 && (
          <>
            <div className="overflow-auto">
              <table className="min-w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border px-3 py-2 text-left">Data</th>
                    <th className="border px-3 py-2 text-left">Colaborador</th>
                    <th className="border px-3 py-2 text-right">Valor</th>
                    <th className="border px-3 py-2 text-left">Método</th>
                    <th className="border px-3 py-2 text-left">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border px-3 py-2">{r.data}</td>
                      <td className="border px-3 py-2">{r.colaborador}</td>
                      <td className="border px-3 py-2 text-right font-medium text-red-600">
                        {fmtMoney(r.valor)}
                      </td>
                      <td className="border px-3 py-2 capitalize">{r.metodo}</td>
                      <td className="border px-3 py-2 text-gray-600">{r.observacao || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td colSpan={2} className="border px-3 py-2">Total</td>
                    <td className="border px-3 py-2 text-right text-red-600">{fmtMoney(totalHistorico)}</td>
                    <td colSpan={2} className="border px-3 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="text-xs text-gray-500">
              {history.length} registro(s) · Os adiantamentos serão descontados automaticamente no relatório de pagamentos do período correspondente.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ======== ABA COMPRAS DE ESTOQUE ========
function StockTab() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [dateRaw, setDateRaw] = useState<string>("");
  const [selectedSector, setSelectedSector] = useState<string>("");
  const [creatingList, setCreatingList] = useState(false);
  const [extraItems, setExtraItems] = useState<string[]>([]);

  useEffect(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    setDateRaw(todayIso);
    loadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStock() {
    if (!SYNC_ENDPOINT) return;
    setLoading(true);
    try {
      const url = `${SYNC_ENDPOINT}?action=stock`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data?.ok && Array.isArray(data.items)) {
        // Aqui eu assumo que o Apps Script já está devolvendo "setor"
        // Se ainda não estiver, você vai precisar ajustar o Apps Script (ver seção 3)
        setItems(data.items as StockItem[]);
      } else {
        console.error("Resposta inválida em /stock", data);
      }
    } catch (err) {
      console.error("Falha ao carregar estoque:", err);
    } finally {
      setLoading(false);
    }
  }

  const sectors = useMemo(() => {
    const s = new Set<string>();
    items.forEach((it) => {
      if (it.setor && String(it.setor).trim() !== "") {
        s.add(String(it.setor).trim());
      }
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!selectedSector) return [];
    return items.filter(
      (it) => String(it.setor || "").trim() === selectedSector
    );
  }, [items, selectedSector]);

  const handleQtyChange = (itemName: string, value: string) => {
    setQuantities((prev) => ({ ...prev, [itemName]: value }));
  };

  const addExtraItem = () => setExtraItems((prev) => [...prev, ""]);
  const updateExtraItem = (idx: number, value: string) => {
    setExtraItems((prev) => prev.map((v, i) => (i === idx ? value : v)));
  };
  const removeExtraItem = (idx: number) => {
    setExtraItems((prev) => prev.filter((_, i) => i !== idx));
  };


  const formatDateForPayload = (raw: string | Date) => {
    if (raw instanceof Date) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, "0");
      const d = String(raw.getDate()).padStart(2, "0");
      return `${d}/${m}/${y}`;
    }
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return "";
    return `${d}/${m}/${y}`;
  };

  const handleCreateList = async () => {
    if (creatingList) return;

    if (!SYNC_ENDPOINT) {
      alert("Nenhum endpoint de sincronização configurado.");
      return;
    }

    if (!selectedSector) {
      alert("Selecione o setor antes de criar a lista de compras.");
      return;
    }

    if (!filteredItems.length) {
      alert("Não há itens de estoque para o setor selecionado.");
      return;
    }

    const dateStr =
      formatDateForPayload(dateRaw) || formatDateForPayload(new Date());

    const entries = filteredItems.map((it) => ({
      item: it.item,
      estoqueAtual: quantities[it.item] ?? "",
    }));

    const payload = {
      action: "estoque_lista",
      date: dateStr,
      setor: selectedSector,
      entries,
      extras: extraItems.map((s) => String(s || "").trim()).filter(Boolean),
    };

    setCreatingList(true);
    try {
      const resp = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // @ts-ignore
      if ((resp as any)?.type === "opaque" || (resp as any)?.status === 0) {
        alert("Lista de compras gerada e enviada por e-mail.");
        return;
      }
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        alert(
          `Falha ao gerar lista de compras (HTTP ${resp.status}). ${txt.slice(
            0,
            180
          )}`
        );
        return;
      }
      alert("Lista de compras gerada e enviada por e-mail.");
    } catch (err: any) {
      alert(`Não foi possível gerar a lista de compras. Erro: ${String(err)}`);
    } finally {
      setCreatingList(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Data do registro + explicação */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2 text-sm text-gray-600">
          Preencha o estoque atual dos itens do setor selecionado. Ao clicar em{" "}
          <b>"Criar lista de compras"</b>, o sistema irá calcular quanto comprar para
          atingir os estoques mínimo e máximo, salvar uma planilha em{" "}
          <b>"Registros de Estoque"</b> e enviar um PDF por e-mail apenas com os itens
          abaixo do mínimo.
        </div>
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Data do registro</label>
          <input
            type="date"
            className="input w-full"
            value={dateRaw}
            onChange={(e) => setDateRaw(e.target.value)}
          />
        </div>
      </div>

      {/* Seleção de setor */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">Setor do inventário</label>
        <select
          className="input w-full sm:w-80"
          value={selectedSector}
          onChange={(e) => setSelectedSector(e.target.value)}
        >
          <option value="">
            {sectors.length
              ? "Selecione um setor"
              : "Nenhum setor encontrado na planilha"}
          </option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {selectedSector && (
          <div className="text-xs text-gray-500">
            Itens exibidos abaixo: setor <b>{selectedSector}</b>.
          </div>
        )}
      </div>

      {/* Tabela de itens */}
      <div className="border rounded-xl p-3 bg-white space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Itens de estoque</h3>
          <button
            type="button"
            onClick={loadStock}
            disabled={loading}
            className={`btn btn-ghost text-xs ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {loading ? "Processando..." : "Recarregar itens"}
          </button>
        </div>
        {loading && (
          <div className="text-xs text-gray-500">
            Carregando itens de estoque…
          </div>
        )}
        {!loading && !items.length && (
          <div className="text-xs text-red-600">
            Nenhum item encontrado em &quot;Cadastro_Estoque&quot;.
          </div>
        )}
        {!loading && items.length > 0 && !selectedSector && (
          <div className="text-xs text-amber-700">
            Selecione um setor para visualizar os itens do inventário.
          </div>
        )}
        {!loading && selectedSector && filteredItems.length === 0 && (
          <div className="text-xs text-red-600">
            Não há itens cadastrados para o setor <b>{selectedSector}</b>.
          </div>
        )}
        {!loading && selectedSector && filteredItems.length > 0 && (
          <div className="overflow-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left">Item</th>
                  <th className="border px-3 py-2 text-left">Armazenamento</th>
                  <th className="border px-3 py-2 text-left">Estoque atual</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it) => (
                  <tr key={it.item}>
                    <td className="border px-3 py-2">
                      <div className="font-medium">{it.item}</div>
                      {it.categoria && (
                        <div className="text-xs text-gray-500">
                          Categoria: {it.categoria}
                        </div>
                      )}
                    </td>
                    <td className="border px-3 py-2">
                      {it.armazenamento || (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="border px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        className="input w-24"
                        value={quantities[it.item] ?? ""}
                        onChange={(e) =>
                          handleQtyChange(it.item, e.target.value)
                        }
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Itens extras (observações) */}
      <div className="border rounded-xl p-3 bg-white space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Itens extras (observações)</h3>
          <button
            type="button"
            onClick={addExtraItem}
            className="btn btn-ghost text-xs"
          >
            Adicionar item extra
          </button>
        </div>

        {extraItems.length === 0 && (
          <div className="text-xs text-gray-500">
            Use para adicionar observações/itens que não estão no cadastro de estoque. Eles serão incluídos no e-mail da lista de compras.
          </div>
        )}

        {extraItems.length > 0 && (
          <div className="space-y-2">
            {extraItems.map((txt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={txt}
                  onChange={(e) => updateExtraItem(idx, e.target.value)}
                  placeholder="Ex.: Guardanapos / Gelo / Sacolas / ..."
                />
                <button
                  type="button"
                  onClick={() => removeExtraItem(idx)}
                  className="btn btn-ghost text-xs"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botão principal */}
      <div className="pt-2">
        <button
          onClick={handleCreateList}
          disabled={creatingList}
          className={`btn btn-primary ${creatingList ? "opacity-70 cursor-not-allowed" : ""}`}
        >
          {creatingList ? "Processando..." : "Criar lista de compras"}
        </button>
      </div>
    </div>
  );
}

function ColaboradoresTab() {
  const [meta, setMeta] = useState<ColaboradoresMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loading, setLoading] = useState(false);

  const defaultYear = (() => {
    const y = new Date().getFullYear();
    if (y < 2024) return "2024";
    if (y > 2028) return "2028";
    return String(y);
  })();

  const [year, setYear] = useState<string>(defaultYear);
  const [start, setStart] = useState<string>(""); // opcional (YYYY-MM-DD)
  const [end, setEnd] = useState<string>("");     // opcional (YYYY-MM-DD)
  const [weekday, setWeekday] = useState<string>("Tudo");
  const [name, setName] = useState<string>("Tudo");
  const [setor, setSetor] = useState<string>("Tudo");

  const [rows, setRows] = useState<ColaboradoresRow[]>([]);
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const [totals, setTotals] = useState<ColaboradoresTotals>({
    diarias: 0,
    consumo: 0,
    comissao: 0,
    adiantamentos: 0,
    total: 0,
  });

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

  const intervalOk = (start && end) || (!start && !end);

  const loadMeta = async () => {
    if (!SYNC_ENDPOINT) return;
    setLoadingMeta(true);
    try {
      const url = `${SYNC_ENDPOINT}?action=colaboradores_meta`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || "Resposta inválida (meta).");

      const m: ColaboradoresMeta = {
        years: Array.isArray(data.years) ? data.years.map((x: any) => Number(x)) : [2024, 2025, 2026, 2027, 2028],
        names: Array.isArray(data.names) ? data.names.map((x: any) => String(x)) : [],
        sectors: Array.isArray(data.sectors) ? data.sectors.map((x: any) => String(x)) : [],
        diariaOptions: Array.isArray(data.diariaOptions) ? data.diariaOptions.map((x: any) => Number(x)) : [],
      };

      setMeta(m);

      // Se o year atual não estiver na lista, força para o primeiro disponível
      if (m.years.length) {
        const y0 = String(m.years[0]);
        const y = String(year);
        const exists = m.years.some((yy) => String(yy) === y);
        if (!exists) setYear(y0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMeta(false);
    }
  };

  const loadRows = async () => {
    if (!SYNC_ENDPOINT) return;
    if (!year) return;
    if (!intervalOk) return;

    setLoading(true);
    try {
      const qStart = start && end ? start : "";
      const qEnd = start && end ? end : "";

      const url =
        `${SYNC_ENDPOINT}?action=colaboradores_rows` +
        `&year=${encodeURIComponent(year)}` +
        `&start=${encodeURIComponent(qStart)}` +
        `&end=${encodeURIComponent(qEnd)}` +
        `&weekday=${encodeURIComponent(weekday)}` +
        `&name=${encodeURIComponent(name)}` +
        `&setor=${encodeURIComponent(setor)}`;

      const resp = await fetch(url);
      const data = await resp.json();
      if (!data?.ok) throw new Error(data?.error || "Resposta inválida (rows).");

      setRows(Array.isArray(data.rows) ? (data.rows as ColaboradoresRow[]) : []);
      setPeriod(data.period && typeof data.period === "object" ? { start: String(data.period.start || ""), end: String(data.period.end || "") } : null);

      const t = data.totals && typeof data.totals === "object" ? data.totals : {};
      setTotals({
        diarias: Number(t.diarias || 0),
        consumo: Number(t.consumo || 0),
        comissao: Number(t.comissao || 0),
        adiantamentos: Number(t.adiantamentos || 0),
        total: Number(t.total || 0),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // carrega automaticamente quando filtros mudam
  useEffect(() => {
    if (!meta) return;
    if (!year) return;
    if (!intervalOk) return;
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, year, start, end, weekday, name, setor]);

  if (!SYNC_ENDPOINT) {
    return <div className="text-sm text-red-600">Nenhum endpoint de sincronização configurado.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="font-semibold text-base">Colaboradores</h3>
            {period?.start && period?.end && (
              <div className="text-xs text-gray-500">
                Período carregado: {period.start} → {period.end}
              </div>
            )}
          </div>

          <button
            onClick={loadRows}
            disabled={loading || loadingMeta || !year || !intervalOk}
            className={`btn btn-ghost text-sm ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
            title={!intervalOk ? "Preencha data inicial e final (ou deixe ambas vazias)" : ""}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Ano</label>
            <select
              className="input w-full"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              disabled={loadingMeta}
            >
              {(meta?.years?.length ? meta.years : [2024, 2025, 2026, 2027, 2028]).map((y) => (
                <option key={String(y)} value={String(y)}>
                  {String(y)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data inicial (opcional)</label>
            <input
              type="date"
              className="input w-full"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={loadingMeta}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Data final (opcional)</label>
            <input
              type="date"
              className="input w-full"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={loadingMeta}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Dia da semana (opcional)</label>
            <select
              className="input w-full"
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
              disabled={loadingMeta}
            >
              <option value="Tudo">Tudo</option>
              <option value="domingo">Domingo</option>
              <option value="segunda">Segunda</option>
              <option value="terca">Terça</option>
              <option value="quarta">Quarta</option>
              <option value="quinta">Quinta</option>
              <option value="sexta">Sexta</option>
              <option value="sabado">Sábado</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-600">Nome (opcional)</label>
            <select
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loadingMeta}
            >
              <option value="Tudo">Tudo</option>
              {(meta?.names || []).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Setor (opcional)</label>
            <select
              className="input w-full"
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
              disabled={loadingMeta}
            >
              <option value="Tudo">Tudo</option>
              {(meta?.sectors || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {!intervalOk && (
            <div className="text-xs text-red-600 flex items-end">
              Preencha data inicial e final, ou deixe ambas vazias (para usar o ano inteiro).
            </div>
          )}
        </div>

        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Data</th>
                <th className="border px-3 py-2 text-left">Dia</th>
                <th className="border px-3 py-2 text-left">Turno</th>
                <th className="border px-3 py-2 text-left">Nome</th>
                <th className="border px-3 py-2 text-left">Setor</th>
                <th className="border px-3 py-2 text-right">Diária fixa</th>
                <th className="border px-3 py-2 text-right">Consumo</th>
                <th className="border px-3 py-2 text-right">Comissão</th>
                <th className="border px-3 py-2 text-right">Adiantamentos</th>
                <th className="border px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx}>
                  <td className="border px-3 py-2">{r.data}</td>
                  <td className="border px-3 py-2">{r.weekday}</td>
                  <td className="border px-3 py-2">{r.turno}</td>
                  <td className="border px-3 py-2">{r.nome}</td>
                  <td className="border px-3 py-2">{r.setor}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(r.diariaFixa)}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(r.consumo)}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(r.comissao)}</td>
                  <td className="border px-3 py-2 text-right text-red-600">{fmtMoney(r.adiantamentos || 0)}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(r.total)}</td>
                </tr>
              ))}

              <tr className="bg-gray-50 font-semibold">
                <td className="border px-3 py-2" colSpan={5}>
                  Totais
                </td>
                <td className="border px-3 py-2 text-right">{fmtMoney(totals.diarias)}</td>
                <td className="border px-3 py-2 text-right">{fmtMoney(totals.consumo)}</td>
                <td className="border px-3 py-2 text-right">{fmtMoney(totals.comissao)}</td>
                <td className="border px-3 py-2 text-right text-red-600">{fmtMoney(totals.adiantamentos || 0)}</td>
                <td className="border px-3 py-2 text-right">{fmtMoney(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {rows.length === 0 && !loading && (
          <div className="text-sm text-gray-500">Nenhum registro para os filtros selecionados.</div>
        )}
      </div>
    </div>
  );
}

// ======== TIPOS COMPARTILHADOS ========
type Insumo = {
  insumo: string;
  unidade: string;
  custoPorUnidade: number;
};

type FichaIngrediente = {
  ingrediente: string;
  quantidade: number;
  unidade: string;
  custoPorUnidade: number;
  custoTotal: number;
};

type FichaProduto = {
  nome: string;
  precoVenda: number;
  custoTotal: number;
  margem: number;
  margemPct: number;
  cmvPct: number;
  ingredientes: FichaIngrediente[];
};

function FichaTecnicaTab() {
  const [produtos, setProdutos] = useState<FichaProduto[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduto, setSelectedProduto] = useState<string | null>(null);

  // form novo produto
  const [showNewProduto, setShowNewProduto] = useState(false);
  const [novoProduto, setNovoProduto] = useState("");
  const [novoPrecoVenda, setNovoPrecoVenda] = useState("");

  // form novo ingrediente
  const [showNewIngrediente, setShowNewIngrediente] = useState(false);
  const [novoInsumoSel, setNovoInsumoSel] = useState("");
  const [novoQtd, setNovoQtd] = useState("");
  const [saving, setSaving] = useState(false);

  // edição de preço de venda
  const [editingPreco, setEditingPreco] = useState(false);
  const [editPrecoVal, setEditPrecoVal] = useState("");

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));
  const fmtPct = (n: number) => `${Number(n || 0).toFixed(1)}%`;

  const loadTudo = async () => {
    if (!SYNC_ENDPOINT) return;
    setLoading(true);
    try {
      const [fichasResp, insumosResp] = await Promise.all([
        fetch(`${SYNC_ENDPOINT}?action=fichas_lista&_ts=${Date.now()}`),
        fetch(`${SYNC_ENDPOINT}?action=insumos_lista&_ts=${Date.now()}`),
      ]);
      const fichasData = await fichasResp.json();
      const insumosData = await insumosResp.json();
      if (fichasData?.ok && Array.isArray(fichasData.produtos)) setProdutos(fichasData.produtos as FichaProduto[]);
      if (insumosData?.ok && Array.isArray(insumosData.insumos)) setInsumos(insumosData.insumos as Insumo[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProdutos = async () => {
    if (!SYNC_ENDPOINT) return;
    try {
      const resp = await fetch(`${SYNC_ENDPOINT}?action=fichas_lista&_ts=${Date.now()}`);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.produtos)) setProdutos(data.produtos as FichaProduto[]);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadTudo(); }, []);

  const produto = selectedProduto ? produtos.find(p => p.nome === selectedProduto) : null;
  const insumoSelecionado = insumos.find(i => i.insumo === novoInsumoSel);

  const resetIngredienteForm = () => {
    setNovoInsumoSel(""); setNovoQtd("");
    setShowNewIngrediente(false);
  };

  const handleSaveIngrediente = async () => {
    if (saving || !selectedProduto) return;
    if (!novoInsumoSel) { alert("Selecione um insumo do catálogo."); return; }
    if (!novoQtd) { alert("Informe a quantidade."); return; }

    const precoAtual = novoPrecoVenda || String(produto?.precoVenda || 0);
    const payload = {
      action: "save_ficha_item",
      produto: selectedProduto,
      precoVenda: precoAtual,
      insumo: novoInsumoSel,
      quantidade: novoQtd,
    };

    setSaving(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      resetIngredienteForm();
      await loadProdutos();
    } catch (err: any) {
      alert(`Erro: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreco = async () => {
    if (!selectedProduto || !produto) return;
    if (produto.ingredientes.length === 0) {
      alert("Adicione ao menos um insumo antes de atualizar o preço de venda.");
      setEditingPreco(false); return;
    }
    const ing = produto.ingredientes[0];
    const payload = {
      action: "save_ficha_item",
      produto: selectedProduto,
      precoVenda: editPrecoVal,
      insumo: ing.ingrediente,
      quantidade: ing.quantidade,
    };
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      setEditingPreco(false);
      await loadProdutos();
    } catch (err: any) { alert(`Erro: ${String(err)}`); }
  };

  const handleDeleteIngrediente = async (prodNome: string, ingNome: string) => {
    if (!confirm(`Excluir "${ingNome}" da ficha de "${prodNome}"?`)) return;
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "delete_ficha_item", produto: prodNome, insumo: ingNome }),
      });
      await loadProdutos();
    } catch (err: any) { alert(`Erro: ${String(err)}`); }
  };

  const handleDeleteProduto = async (nome: string) => {
    if (!confirm(`Excluir toda a ficha técnica de "${nome}"?`)) return;
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "delete_produto_ficha", produto: nome }),
      });
      setSelectedProduto(null);
      await loadProdutos();
    } catch (err: any) { alert(`Erro: ${String(err)}`); }
  };

  const handleCreateProduto = () => {
    if (!novoProduto.trim()) { alert("Informe o nome do produto."); return; }
    if (!novoPrecoVenda) { alert("Informe o preço de venda."); return; }
    const nome = novoProduto.trim();
    setSelectedProduto(nome);
    if (!produtos.find(p => p.nome === nome)) {
      setProdutos(prev => [...prev, {
        nome, precoVenda: parseFloat(novoPrecoVenda), custoTotal: 0,
        margem: parseFloat(novoPrecoVenda), margemPct: 100, cmvPct: 0, ingredientes: []
      }]);
    }
    setShowNewProduto(false);
    setNovoProduto("");
    setShowNewIngrediente(true);
  };

  if (!SYNC_ENDPOINT) return <div className="text-sm text-red-600">Endpoint não configurado.</div>;

  return (
    <div className="space-y-4">
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">Fichas Técnicas</h3>
          <div className="flex gap-2">
            <button className="btn btn-ghost text-sm" onClick={loadProdutos} disabled={loading}>
              {loading ? "Carregando..." : "Atualizar"}
            </button>
            <button className="btn btn-primary text-sm" onClick={() => { setShowNewProduto(true); setSelectedProduto(null); resetIngredienteForm(); }}>
              + Novo produto
            </button>
          </div>
        </div>

        {showNewProduto && (
          <div className="border rounded-xl p-3 bg-gray-50 space-y-3">
            <div className="font-medium text-sm">Novo produto</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-600">Nome do produto</label>
                <input type="text" className="input w-full" value={novoProduto}
                  onChange={e => setNovoProduto(e.target.value)} placeholder="Ex.: Pizza Margherita" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-600">Preço de venda (R$)</label>
                <input type="number" step="0.01" className="input w-full" value={novoPrecoVenda}
                  onChange={e => setNovoPrecoVenda(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary text-sm" onClick={handleCreateProduto}>Avançar →</button>
              <button className="btn btn-ghost text-sm" onClick={() => setShowNewProduto(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {!loading && produtos.length === 0 && (
          <div className="text-sm text-gray-500">
            Nenhuma ficha técnica cadastrada. A planilha "Fichas_Tecnicas" será criada automaticamente ao salvar o primeiro produto.
          </div>
        )}

        <div className="space-y-2">
          {produtos.map(p => (
            <div key={p.nome} className={`border rounded-xl overflow-hidden ${selectedProduto === p.nome ? "border-blue-400" : "border-gray-200"}`}>
              <div
                className={`flex items-center justify-between px-4 py-3 cursor-pointer ${selectedProduto === p.nome ? "bg-blue-50" : "bg-white hover:bg-gray-50"}`}
                onClick={() => { setSelectedProduto(selectedProduto === p.nome ? null : p.nome); resetIngredienteForm(); setEditingPreco(false); }}
              >
                <div>
                  <div className="font-medium">{p.nome}</div>
                  <div className="text-xs text-gray-500 space-x-3">
                    <span>Custo: {fmtMoney(p.custoTotal)}</span>
                    <span>Venda: {fmtMoney(p.precoVenda)}</span>
                    <span className={p.margemPct >= 50 ? "text-green-600 font-medium" : p.margemPct >= 30 ? "text-yellow-600 font-medium" : "text-red-600 font-medium"}>
                      Margem: {fmtPct(p.margemPct)}
                    </span>
                    <span className={p.cmvPct <= 35 ? "text-green-600" : p.cmvPct <= 45 ? "text-yellow-600" : "text-red-600"}>
                      CMV: {fmtPct(p.cmvPct)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-xs text-red-500 hover:underline"
                    onClick={e => { e.stopPropagation(); handleDeleteProduto(p.nome); }}>
                    Excluir
                  </button>
                  <span className="text-gray-400 text-xs">{selectedProduto === p.nome ? "▲" : "▼"}</span>
                </div>
              </div>

              {selectedProduto === p.nome && (
                <div className="px-4 py-3 bg-white border-t space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-600">Preço de venda:</span>
                    {editingPreco ? (
                      <>
                        <input type="number" step="0.01" className="input w-28 text-sm" value={editPrecoVal} onChange={e => setEditPrecoVal(e.target.value)} />
                        <button className="btn btn-primary text-xs" onClick={handleSavePreco}>Salvar</button>
                        <button className="btn btn-ghost text-xs" onClick={() => setEditingPreco(false)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">{fmtMoney(p.precoVenda)}</span>
                        <button className="text-xs text-blue-600 hover:underline"
                          onClick={() => { setEditingPreco(true); setEditPrecoVal(String(p.precoVenda)); }}>
                          Editar preço
                        </button>
                      </>
                    )}
                  </div>

                  {p.ingredientes.length > 0 ? (
                    <div className="overflow-auto">
                      <table className="min-w-full border text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="border px-3 py-2 text-left">Insumo</th>
                            <th className="border px-3 py-2 text-right">Qtd</th>
                            <th className="border px-3 py-2 text-left">Unidade</th>
                            <th className="border px-3 py-2 text-right">Custo/un</th>
                            <th className="border px-3 py-2 text-right">Custo total</th>
                            <th className="border px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.ingredientes.map((ing, idx) => (
                            <tr key={idx}>
                              <td className="border px-3 py-2">{ing.ingrediente}</td>
                              <td className="border px-3 py-2 text-right">{ing.quantidade}</td>
                              <td className="border px-3 py-2">{ing.unidade || "—"}</td>
                              <td className="border px-3 py-2 text-right">{fmtMoney(ing.custoPorUnidade)}</td>
                              <td className="border px-3 py-2 text-right">{fmtMoney(ing.custoTotal)}</td>
                              <td className="border px-3 py-2 text-center">
                                <button className="text-xs text-red-500 hover:underline"
                                  onClick={() => handleDeleteIngrediente(p.nome, ing.ingrediente)}>
                                  Excluir
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-semibold">
                            <td colSpan={4} className="border px-3 py-2">Custo total do produto</td>
                            <td className="border px-3 py-2 text-right">{fmtMoney(p.custoTotal)}</td>
                            <td className="border px-3 py-2"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Nenhum insumo cadastrado ainda.</div>
                  )}

                  {showNewIngrediente ? (
                    <div className="border rounded-xl p-3 bg-gray-50 space-y-3">
                      <div className="font-medium text-sm">Adicionar insumo</div>
                      {insumos.length === 0 ? (
                        <div className="text-sm text-amber-600">Cadastre insumos na aba "Insumos" antes de montar a ficha.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs text-gray-600">Insumo</label>
                            <select className="input w-full" value={novoInsumoSel} onChange={e => setNovoInsumoSel(e.target.value)}>
                              <option value="">Selecione...</option>
                              {insumos.map(ins => (
                                <option key={ins.insumo} value={ins.insumo}>{ins.insumo}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-gray-600">Quantidade</label>
                            <input type="number" step="0.001" className="input w-full" value={novoQtd}
                              onChange={e => setNovoQtd(e.target.value)} placeholder="0" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-gray-600">Custo estimado</label>
                            <div className="input w-full bg-gray-100 text-gray-600 flex items-center text-sm">
                              {insumoSelecionado && novoQtd
                                ? fmtMoney(parseFloat(novoQtd) * insumoSelecionado.custoPorUnidade)
                                : "—"}
                            </div>
                          </div>
                        </div>
                      )}
                      {insumoSelecionado && (
                        <div className="text-xs text-gray-500">
                          {insumoSelecionado.unidade} · {fmtMoney(insumoSelecionado.custoPorUnidade)}/un (do catálogo)
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button className="btn btn-primary text-sm" onClick={handleSaveIngrediente} disabled={saving || insumos.length === 0}>
                          {saving ? "Salvando..." : "Salvar"}
                        </button>
                        <button className="btn btn-ghost text-sm" onClick={resetIngredienteForm}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-ghost text-sm" onClick={() => setShowNewIngrediente(true)}>
                      + Adicionar insumo
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ======== INSUMOS ========
function InsumosTab() {
  type Insumo = { insumo: string; unidade: string; custoPorUnidade: number };

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // form novo insumo
  const [showForm, setShowForm] = useState(false);
  const [editNome, setEditNome] = useState<string | null>(null); // null = novo
  const [formNome, setFormNome] = useState("");
  const [formUnidade, setFormUnidade] = useState("");
  const [formCusto, setFormCusto] = useState("");

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

  const loadInsumos = async () => {
    if (!SYNC_ENDPOINT) return;
    setLoading(true);
    try {
      const res = await fetch(`${SYNC_ENDPOINT}?action=insumos_lista&_ts=${Date.now()}`);
      const json = await res.json();
      if (json.ok) setInsumos(json.insumos || []);
      else setError(json.error || "Erro ao carregar insumos.");
    } catch (e) {
      setError("Falha na conexão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadInsumos(); }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditNome(null);
    setFormNome("");
    setFormUnidade("");
    setFormCusto("");
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (ins: Insumo) => {
    setEditNome(ins.insumo);
    setFormNome(ins.insumo);
    setFormUnidade(ins.unidade);
    setFormCusto(String(ins.custoPorUnidade));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formNome.trim()) { alert("Nome do insumo obrigatório."); return; }
    const custo = parseFloat(formCusto.replace(",", "."));
    setSaving(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_insumo",
          insumo: formNome.trim(),
          unidade: formUnidade.trim(),
          custoPorUnidade: isNaN(custo) ? 0 : custo,
        }),
      });
      resetForm();
      setTimeout(() => loadInsumos(), 2000);
    } catch {
      alert("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (nome: string) => {
    if (!confirm(`Excluir insumo "${nome}"?`)) return;
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_insumo", insumo: nome }),
      });
      setTimeout(() => loadInsumos(), 2000);
    } catch {
      alert("Erro ao excluir.");
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Catálogo de Insumos</h2>
        <button className="btn btn-primary" onClick={openNew}>+ Novo insumo</button>
      </div>

      {error && <div className="text-red-500 text-sm">{error}</div>}

      {showForm && (
        <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
          <div className="font-medium text-sm">{editNome ? `Editar: ${editNome}` : "Novo insumo"}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Nome</label>
              <input className="input w-full" value={formNome} onChange={e => setFormNome(e.target.value)}
                placeholder="Ex.: Farinha de trigo" disabled={!!editNome} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Unidade</label>
              <input className="input w-full" value={formUnidade} onChange={e => setFormUnidade(e.target.value)}
                placeholder="kg, g, ml, un..." />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Custo por unidade (R$)</label>
              <input type="number" step="0.001" className="input w-full" value={formCusto}
                onChange={e => setFormCusto(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary text-sm" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button className="btn btn-ghost text-sm" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Carregando...</div>
      ) : insumos.length === 0 ? (
        <div className="text-sm text-gray-500">Nenhum insumo cadastrado ainda. Clique em "Novo insumo" para começar.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Nome</th>
                <th className="border px-3 py-2 text-left">Unidade</th>
                <th className="border px-3 py-2 text-right">Custo/un</th>
                <th className="border px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {insumos.map(ins => (
                <tr key={ins.insumo}>
                  <td className="border px-3 py-2">{ins.insumo}</td>
                  <td className="border px-3 py-2">{ins.unidade || "—"}</td>
                  <td className="border px-3 py-2 text-right">{fmtMoney(ins.custoPorUnidade)}</td>
                  <td className="border px-3 py-2 text-center">
                    <div className="flex gap-2 justify-center">
                      <button className="text-xs text-blue-500 hover:underline" onClick={() => openEdit(ins)}>
                        Editar preço
                      </button>
                      <button className="text-xs text-red-500 hover:underline" onClick={() => handleDelete(ins.insumo)}>
                        Excluir
                      </button>
                    </div>
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

// ======== CMV ========
function CMVTab() {
  // ── shared date state ──
  const [startRaw, setStartRaw] = useState("");
  const [endRaw, setEndRaw] = useState("");

  // ── CMV Teórico ──
  const [loadingTeo, setLoadingTeo] = useState(false);
  const [rowsTeo, setRowsTeo] = useState<any[]>([]);
  const [totalCusto, setTotalCusto] = useState(0);
  const [totalReceita, setTotalReceita] = useState(0);
  const [cmvGeral, setCmvGeral] = useState(0);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [grupoSel, setGrupoSel] = useState("Tudo");

  // ── CMV Real ──
  const [loadingReal, setLoadingReal] = useState(false);
  const [cmvRealData, setCmvRealData] = useState<any>(null);
  const [datasInventario, setDatasInventario] = useState<string[]>([]);
  const [dataEiSel, setDataEiSel] = useState("");
  const [dataEfSel, setDataEfSel] = useState("");

  const fmtMoney = (n: number | null) =>
    n === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));
  const fmtPct = (n: number | null) =>
    n === null ? "—" : `${Number(n || 0).toFixed(1)}%`;
  const cmvColor = (v: number | null) => {
    if (v === null) return "";
    if (v <= 35) return "text-green-600";
    if (v <= 45) return "text-yellow-600";
    return "text-red-600";
  };

  // Converte YYYY-MM-DD (input date) para DD/MM/YYYY
  const toDDMMYYYY = (raw: string) => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  };

  // Carrega datas de inventário e grupos disponíveis ao montar
  useEffect(() => {
    if (!SYNC_ENDPOINT) return;
    fetch(`${SYNC_ENDPOINT}?action=inventario_datas&_ts=${Date.now()}`)
      .then(r => r.json())
      .then(j => { if (j.ok) setDatasInventario(j.datas || []); })
      .catch(() => {});
    fetch(`${SYNC_ENDPOINT}?action=dashboard_base_meta&_ts=${Date.now()}`)
      .then(r => r.json())
      .then(j => { if (j.ok && j.groups) setGrupos(j.groups); })
      .catch(() => {});
  }, []);

  // ── Calcular CMV Teórico ──
  const loadTeorico = async () => {
    if (!startRaw || !endRaw) { alert("Selecione data inicial e final."); return; }
    if (!SYNC_ENDPOINT) return;
    setLoadingTeo(true);
    try {
      const fichasResp = await fetch(`${SYNC_ENDPOINT}?action=fichas_lista&_ts=${Date.now()}`);
      const fichasData = await fichasResp.json();
      if (!fichasData?.ok) throw new Error(fichasData?.error || "Erro nas fichas técnicas.");
      const fichasByCusto: Record<string, number> = {};
      (fichasData.produtos || []).forEach((p: any) => {
        fichasByCusto[String(p.nome || "").toLowerCase().trim()] = Number(p.custoTotal || 0);
      });

      const dashUrl = `${SYNC_ENDPOINT}?action=dashboard_base_rows` +
        `&start=${encodeURIComponent(toDDMMYYYY(startRaw))}` +
        `&end=${encodeURIComponent(toDDMMYYYY(endRaw))}` +
        `&grupo=${encodeURIComponent(grupoSel)}&descricao=Tudo&weekday=Tudo&_ts=${Date.now()}`;
      const dashData = await (await fetch(dashUrl)).json();
      if (!dashData?.ok) throw new Error(dashData?.error || "Erro no Dashboard.");

      const agg: Record<string, any> = {};
      (dashData.rows || []).forEach((r: any) => {
        const key = String(r.descricao || "").toLowerCase().trim();
        if (!key) return;
        if (!agg[key]) agg[key] = { descricao: String(r.descricao || ""), qtdVendida: 0, receitaTotal: 0 };
        agg[key].qtdVendida += Number(r.qtd || 0);
        agg[key].receitaTotal += Number(r.vl_total || 0);
      });

      let totCusto = 0, totReceita = 0;
      const rowsCalc = Object.values(agg).map((item: any) => {
        const ficha = fichasByCusto[item.descricao.toLowerCase().trim()];
        const custoUnitario = ficha !== undefined ? ficha : null;
        const custoTotal = custoUnitario !== null ? item.qtdVendida * custoUnitario : null;
        const cmvPct = custoTotal !== null && item.receitaTotal > 0 ? (custoTotal / item.receitaTotal) * 100 : null;
        if (custoTotal !== null) totCusto += custoTotal;
        totReceita += item.receitaTotal;
        return { produto: item.descricao, qtdVendida: item.qtdVendida, custoUnitario, custoTotal, receitaTotal: item.receitaTotal, cmvPct, temFicha: ficha !== undefined };
      }).sort((a: any, b: any) => (b.receitaTotal || 0) - (a.receitaTotal || 0));

      setRowsTeo(rowsCalc);
      setTotalCusto(totCusto);
      setTotalReceita(totReceita);
      setCmvGeral(totReceita > 0 ? (totCusto / totReceita) * 100 : 0);
    } catch (err: any) {
      alert(`Erro: ${String(err)}`);
    } finally {
      setLoadingTeo(false);
    }
  };

  // ── Calcular CMV Real ──
  const loadReal = async () => {
    if (!startRaw || !endRaw) { alert("Selecione data inicial e final."); return; }
    if (!SYNC_ENDPOINT) return;
    setLoadingReal(true);
    setCmvRealData(null);
    try {
      const params = new URLSearchParams({
        action: "cmv_real_data",
        start: toDDMMYYYY(startRaw),
        end: toDDMMYYYY(endRaw),
        _ts: String(Date.now()),
      });
      if (dataEiSel) params.set("data_ei", dataEiSel);
      if (dataEfSel) params.set("data_ef", dataEfSel);
      if (totalReceita > 0) params.set("vendas_total", String(totalReceita));
      const res = await fetch(`${SYNC_ENDPOINT}?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Erro ao calcular CMV Real.");
      setCmvRealData(json);
      if (json.datasDisponiveisInventario?.length) setDatasInventario(json.datasDisponiveisInventario);
    } catch (err: any) {
      alert(`Erro: ${String(err)}`);
    } finally {
      setLoadingReal(false);
    }
  };

  if (!SYNC_ENDPOINT) return <div className="text-sm text-red-600">Endpoint não configurado.</div>;

  const dateInputs = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-sm text-gray-600">Data inicial</label>
        <input type="date" className="input w-full" value={startRaw} onChange={e => setStartRaw(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-gray-600">Data final</label>
        <input type="date" className="input w-full" value={endRaw} onChange={e => setEndRaw(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── CMV TEÓRICO ── */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div>
          <h3 className="font-semibold text-base">CMV Teórico</h3>
          <p className="text-xs text-gray-500 mt-1">
            Calculado a partir das vendas × fichas técnicas. Mostra o custo esperado com base na receita do período.
          </p>
        </div>
        {dateInputs}
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Categoria</label>
          <select className="input w-full sm:w-64" value={grupoSel} onChange={e => setGrupoSel(e.target.value)}>
            <option value="Tudo">Todos os produtos</option>
            {grupos.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <button className="btn btn-primary w-full sm:w-auto" onClick={loadTeorico} disabled={loadingTeo}>
          {loadingTeo ? "Calculando..." : "Calcular CMV Teórico"}
        </button>

        {rowsTeo.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border rounded-xl p-4 text-center bg-white">
                <div className="text-xs text-gray-500 mb-1">Receita total</div>
                <div className="text-xl font-semibold text-green-600">{fmtMoney(totalReceita)}</div>
              </div>
              <div className="border rounded-xl p-4 text-center bg-white">
                <div className="text-xs text-gray-500 mb-1">Custo teórico</div>
                <div className="text-xl font-semibold text-red-600">{fmtMoney(totalCusto)}</div>
              </div>
              <div className={`border-2 rounded-xl p-4 text-center ${cmvGeral <= 35 ? "border-green-400 bg-green-50" : cmvGeral <= 45 ? "border-yellow-400 bg-yellow-50" : "border-red-400 bg-red-50"}`}>
                <div className="text-xs text-gray-500 mb-1">CMV Teórico %</div>
                <div className={`text-2xl font-bold ${cmvGeral <= 35 ? "text-green-700" : cmvGeral <= 45 ? "text-yellow-700" : "text-red-700"}`}>
                  {fmtPct(cmvGeral)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {cmvGeral <= 35 ? "✓ Excelente (≤35%)" : cmvGeral <= 45 ? "⚠ Atenção (35–45%)" : "✗ Alto (>45%)"}
                </div>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full border text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border px-3 py-2 text-left">Produto</th>
                    <th className="border px-3 py-2 text-right">Qtd vendida</th>
                    <th className="border px-3 py-2 text-right">Custo unit.</th>
                    <th className="border px-3 py-2 text-right">Custo total</th>
                    <th className="border px-3 py-2 text-right">Receita</th>
                    <th className="border px-3 py-2 text-right">CMV %</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsTeo.map((r: any, idx: number) => (
                    <tr key={idx} className={!r.temFicha ? "text-gray-400" : idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border px-3 py-2">
                        {r.produto}
                        {!r.temFicha && <span className="text-xs text-amber-500 ml-1">(sem ficha)</span>}
                      </td>
                      <td className="border px-3 py-2 text-right">{r.qtdVendida}</td>
                      <td className="border px-3 py-2 text-right">{fmtMoney(r.custoUnitario)}</td>
                      <td className="border px-3 py-2 text-right">{fmtMoney(r.custoTotal)}</td>
                      <td className="border px-3 py-2 text-right">{fmtMoney(r.receitaTotal)}</td>
                      <td className={`border px-3 py-2 text-right font-medium ${cmvColor(r.cmvPct)}`}>{fmtPct(r.cmvPct)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-semibold">
                    <td className="border px-3 py-2" colSpan={3}>Total</td>
                    <td className="border px-3 py-2 text-right">{fmtMoney(totalCusto)}</td>
                    <td className="border px-3 py-2 text-right">{fmtMoney(totalReceita)}</td>
                    <td className={`border px-3 py-2 text-right ${cmvColor(cmvGeral)}`}>{fmtPct(cmvGeral)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {rowsTeo.some((r: any) => !r.temFicha) && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ Produtos em cinza não têm ficha técnica. Cadastre na aba "Ficha Técnica" para incluí-los.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── CMV REAL ── */}
      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div>
          <h3 className="font-semibold text-base">CMV Real</h3>
          <p className="text-xs text-gray-500 mt-1">
            Fórmula: <span className="font-mono">Estoque Inicial + Compras do período − Estoque Final</span>.
            Usa os inventários da pasta "Registros de Estoque" e os lançamentos de Compras.
          </p>
        </div>

        {/* seleção de datas de inventário */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Inventário para Estoque Inicial</label>
            <select className="input w-full" value={dataEiSel} onChange={e => setDataEiSel(e.target.value)}>
              <option value="">Automático (mais próximo do início)</option>
              {datasInventario.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Inventário para Estoque Final</label>
            <select className="input w-full" value={dataEfSel} onChange={e => setDataEfSel(e.target.value)}>
              <option value="">Automático (mais próximo do fim)</option>
              {datasInventario.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          💡 Selecione primeiro o período acima e clique "Calcular CMV Teórico" para ter a receita disponível para o cálculo de %.
          Depois clique "Calcular CMV Real".
        </div>

        <button className="btn btn-primary w-full sm:w-auto" onClick={loadReal} disabled={loadingReal || !startRaw || !endRaw}>
          {loadingReal ? "Calculando..." : "Calcular CMV Real"}
        </button>

        {cmvRealData && (() => {
          const d = cmvRealData;
          const ei = d.estoqueInicial;
          const ef = d.estoqueFinal;
          const cmvPct = totalReceita > 0 ? (d.cmvReal / totalReceita) * 100 : null;
          return (
            <div className="space-y-4">
              {/* Cards resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border rounded-xl p-3 text-center bg-gray-50">
                  <div className="text-xs text-gray-500 mb-1">Estoque Inicial</div>
                  <div className="text-xs text-gray-400">{ei.data || "—"}</div>
                  <div className="text-lg font-semibold">{fmtMoney(ei.valorTotal)}</div>
                </div>
                <div className="border rounded-xl p-3 text-center bg-gray-50">
                  <div className="text-xs text-gray-500 mb-1">+ Compras</div>
                  <div className="text-xs text-gray-400">{d.periodo.start} → {d.periodo.end}</div>
                  <div className="text-lg font-semibold text-blue-600">{fmtMoney(d.compras.total)}</div>
                </div>
                <div className="border rounded-xl p-3 text-center bg-gray-50">
                  <div className="text-xs text-gray-500 mb-1">− Estoque Final</div>
                  <div className="text-xs text-gray-400">{ef.data || "—"}</div>
                  <div className="text-lg font-semibold">{fmtMoney(ef.valorTotal)}</div>
                </div>
                <div className={`border-2 rounded-xl p-3 text-center ${cmvPct !== null && cmvPct <= 35 ? "border-green-400 bg-green-50" : cmvPct !== null && cmvPct <= 45 ? "border-yellow-400 bg-yellow-50" : "border-red-400 bg-red-50"}`}>
                  <div className="text-xs text-gray-500 mb-1">CMV Real</div>
                  <div className="text-lg font-bold">{fmtMoney(d.cmvReal)}</div>
                  {cmvPct !== null && (
                    <div className={`text-sm font-semibold ${cmvColor(cmvPct)}`}>{fmtPct(cmvPct)}</div>
                  )}
                </div>
              </div>

              {/* Comparativo Teórico vs Real */}
              {rowsTeo.length > 0 && (
                <div className="border rounded-xl p-3 bg-white">
                  <div className="text-sm font-medium mb-2">Comparativo</div>
                  <div className="grid grid-cols-2 gap-3 text-center text-sm">
                    <div>
                      <div className="text-xs text-gray-500">CMV Teórico</div>
                      <div className="font-semibold">{fmtMoney(totalCusto)}</div>
                      <div className={`text-sm font-bold ${cmvColor(cmvGeral)}`}>{fmtPct(cmvGeral)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">CMV Real</div>
                      <div className="font-semibold">{fmtMoney(d.cmvReal)}</div>
                      {cmvPct !== null && <div className={`text-sm font-bold ${cmvColor(cmvPct)}`}>{fmtPct(cmvPct)}</div>}
                    </div>
                  </div>
                  {cmvPct !== null && Math.abs(cmvPct - cmvGeral) > 5 && (
                    <div className="mt-2 text-xs text-amber-600">
                      ⚠ Diferença de {Math.abs(cmvPct - cmvGeral).toFixed(1)}pp entre teórico e real — pode indicar desperdício, perdas ou compras não lançadas.
                    </div>
                  )}
                </div>
              )}

              {/* Compras do período */}
              {d.compras.rows.length > 0 && (
                <details className="border rounded-xl">
                  <summary className="px-4 py-3 cursor-pointer text-sm font-medium">
                    Compras do período ({d.compras.rows.length} lançamentos — {fmtMoney(d.compras.total)})
                  </summary>
                  <div className="overflow-auto px-2 pb-3">
                    <table className="min-w-full border text-sm mt-2">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border px-3 py-1 text-left">Data</th>
                          <th className="border px-3 py-1 text-left">Insumo</th>
                          <th className="border px-3 py-1 text-right">Qtd</th>
                          <th className="border px-3 py-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.compras.rows.map((r: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="border px-3 py-1">{r.data}</td>
                            <td className="border px-3 py-1">{r.insumo}</td>
                            <td className="border px-3 py-1 text-right">{r.quantidade}</td>
                            <td className="border px-3 py-1 text-right">{fmtMoney(r.custoTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* Alertas de itens sem custo no catálogo */}
              {(ei.semCusto?.length > 0 || ef.semCusto?.length > 0) && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                  <div className="font-medium">⚠ Itens do inventário sem custo no Cadastro de Insumos (contabilizados como R$ 0):</div>
                  <div>{[...new Set([...(ei.semCusto || []), ...(ef.semCusto || [])])].join(", ")}</div>
                  <div>Cadastre esses itens na aba "Insumos" com o custo por unidade para um cálculo preciso.</div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ======== COMPRAS ========
function ComprasTab() {
  type Insumo = { insumo: string; unidade: string; custoPorUnidade: number };

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // filtros
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-01`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const [filterStart, setFilterStart] = useState(firstOfMonth);
  const [filterEnd, setFilterEnd] = useState(todayStr);

  // form
  const [formData, setFormData] = useState(todayStr);
  const [formInsumo, setFormInsumo] = useState("");
  const [formQtd, setFormQtd] = useState("");
  const [formCustoUn, setFormCustoUn] = useState("");
  const [formCustoTotal, setFormCustoTotal] = useState("");
  const [formObs, setFormObs] = useState("");

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

  const toDDMMYYYY = (raw: string) => {
    if (!raw) return "";
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  };

  const loadData = async () => {
    if (!SYNC_ENDPOINT) return;
    setLoading(true);
    try {
      const [insRes, compRes] = await Promise.all([
        fetch(`${SYNC_ENDPOINT}?action=insumos_lista&_ts=${Date.now()}`).then(r => r.json()),
        fetch(`${SYNC_ENDPOINT}?action=compras_lista&start=${encodeURIComponent(toDDMMYYYY(filterStart))}&end=${encodeURIComponent(toDDMMYYYY(filterEnd))}&_ts=${Date.now()}`).then(r => r.json()),
      ]);
      if (insRes.ok)  setInsumos(insRes.insumos || []);
      if (compRes.ok) setRows(compRes.rows || []);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [filterStart, filterEnd]);

  // Quando usuário muda insumo, pré-preenche custo unitário do catálogo
  const handleInsumoChange = (nome: string) => {
    setFormInsumo(nome);
    const ins = insumos.find(i => i.insumo === nome);
    if (ins && ins.custoPorUnidade > 0) {
      setFormCustoUn(String(ins.custoPorUnidade));
      const qtd = parseFloat(formQtd);
      if (!isNaN(qtd) && qtd > 0) setFormCustoTotal(String((qtd * ins.custoPorUnidade).toFixed(2)));
    }
  };

  const handleQtdChange = (v: string) => {
    setFormQtd(v);
    const qtd = parseFloat(v);
    const un = parseFloat(formCustoUn);
    if (!isNaN(qtd) && !isNaN(un)) setFormCustoTotal(String((qtd * un).toFixed(2)));
  };

  const handleCustoUnChange = (v: string) => {
    setFormCustoUn(v);
    const qtd = parseFloat(formQtd);
    const un = parseFloat(v);
    if (!isNaN(qtd) && !isNaN(un)) setFormCustoTotal(String((qtd * un).toFixed(2)));
  };

  const resetForm = () => {
    setFormData(todayStr); setFormInsumo(""); setFormQtd("");
    setFormCustoUn(""); setFormCustoTotal(""); setFormObs("");
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!formInsumo) { alert("Selecione um insumo."); return; }
    if (!formQtd)    { alert("Informe a quantidade."); return; }
    setSaving(true);
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_compra",
          date: toDDMMYYYY(formData),
          insumo: formInsumo,
          quantidade: parseFloat(formQtd),
          custoUnitario: parseFloat(formCustoUn) || 0,
          custoTotal: parseFloat(formCustoTotal) || 0,
          observacao: formObs,
        }),
      });
      resetForm();
      setTimeout(() => loadData(), 2000);
    } catch { alert("Erro ao salvar."); }
    finally { setSaving(false); }
  };

  const handleDelete = async (ts: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      await fetch(SYNC_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_compra", timestamp: ts }),
      });
      setTimeout(() => loadData(), 2000);
    } catch { alert("Erro ao excluir."); }
  };

  const totalPeriodo = rows.reduce((s: number, r: any) => s + (r.custoTotal || 0), 0);

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Registro de Compras</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nova compra</button>
      </div>

      {/* Filtro de período */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <label className="text-xs text-gray-600">De</label>
          <input type="date" className="input" value={filterStart} onChange={e => setFilterStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Até</label>
          <input type="date" className="input" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} />
        </div>
        <button className="btn btn-ghost text-sm" onClick={loadData}>Filtrar</button>
        {rows.length > 0 && (
          <div className="text-sm text-gray-600 ml-auto">
            Total: <span className="font-semibold text-blue-600">{fmtMoney(totalPeriodo)}</span>
          </div>
        )}
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
          <div className="font-medium text-sm">Nova compra</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Data</label>
              <input type="date" className="input w-full" value={formData} onChange={e => setFormData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Insumo</label>
              {insumos.length > 0 ? (
                <select className="input w-full" value={formInsumo} onChange={e => handleInsumoChange(e.target.value)}>
                  <option value="">Selecione...</option>
                  {insumos.map(ins => <option key={ins.insumo} value={ins.insumo}>{ins.insumo}</option>)}
                </select>
              ) : (
                <input className="input w-full" value={formInsumo} onChange={e => setFormInsumo(e.target.value)} placeholder="Nome do insumo" />
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">
                Quantidade {insumos.find(i => i.insumo === formInsumo)?.unidade ? `(${insumos.find(i => i.insumo === formInsumo)?.unidade})` : ""}
              </label>
              <input type="number" step="0.001" className="input w-full" value={formQtd} onChange={e => handleQtdChange(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Custo unitário (R$)</label>
              <input type="number" step="0.001" className="input w-full" value={formCustoUn} onChange={e => handleCustoUnChange(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Custo total (R$)</label>
              <input type="number" step="0.01" className="input w-full" value={formCustoTotal} onChange={e => setFormCustoTotal(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-600">Observação</label>
              <input className="input w-full" value={formObs} onChange={e => setFormObs(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary text-sm" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button className="btn btn-ghost text-sm" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="text-sm text-gray-500">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500">Nenhuma compra no período selecionado.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2 text-left">Data</th>
                <th className="border px-3 py-2 text-left">Insumo</th>
                <th className="border px-3 py-2 text-right">Qtd</th>
                <th className="border px-3 py-2 text-right">Custo unit.</th>
                <th className="border px-3 py-2 text-right">Total</th>
                <th className="border px-3 py-2 text-left">Obs.</th>
                <th className="border px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border px-3 py-2">{r.data}</td>
                  <td className="border px-3 py-2">{r.insumo}</td>
                  <td className="border px-3 py-2 text-right">{r.quantidade}</td>
                  <td className="border px-3 py-2 text-right">{r.custoUnitario > 0 ? fmtMoney(r.custoUnitario) : "—"}</td>
                  <td className="border px-3 py-2 text-right font-medium">{fmtMoney(r.custoTotal)}</td>
                  <td className="border px-3 py-2 text-gray-500">{r.observacao || "—"}</td>
                  <td className="border px-3 py-2 text-center">
                    <button className="text-xs text-red-500 hover:underline" onClick={() => handleDelete(r.timestamp)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-semibold">
                <td className="border px-3 py-2" colSpan={4}>Total do período</td>
                <td className="border px-3 py-2 text-right">{fmtMoney(totalPeriodo)}</td>
                <td className="border px-3 py-2" colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
