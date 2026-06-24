
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


import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, Share2, Copy, BarChart3, Users, Banknote, Wallet, Menu, X, Package, TrendingUp } from "lucide-react";
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
  "disponibilidade" | "escalar" | "presenca" | "estoque" | "comissao" | "adiantamentos" | "caixa" | "dashboard" | "colaboradores" | "graficos" | "fichaTecnica" | "cmv" | "insumos" | "compras" | "markup"
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
  const todasAbas: (typeof activeTab)[] = ["disponibilidade","escalar","presenca","estoque","comissao","adiantamentos","caixa","dashboard","colaboradores","graficos","fichaTecnica","cmv","insumos","compras","markup"];
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
