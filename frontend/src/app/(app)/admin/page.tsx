"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCan } from "@/lib/permissions";
import { useToast } from "@/components/feedback/Toast";
import { PageSkeleton, StatCardSkeleton } from "@/components/feedback/Skeleton";
import { Card, CardHeader, CardContent, EmptyState, Icon, type IconName, Badge, StatCard, Button, Input, Select, Dropdown } from "@/components/ui";
import { fmtMoney, fmtNumber, fmtDate } from "@/lib/format";

type AdminHousehold = {
  id: number;
  name: string | null;
  owner_id: number | null;
  member_count: number;
};

type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  role_id: number;
  household_id: number | null;
  status: number;
  created_at?: string;
};

type BlockedUser = {
  id: number;
  user_id: number;
  blocked_by: number;
  reason: string | null;
  created_at: string;
  user_email: string;
  user_name: string | null;
  admin_email: string;
  admin_name: string | null;
};

type SystemSummary = {
  total_users: number;
  total_households: number;
  total_expenses: number;
  total_incomes: number;
  total_budgets: number;
  total_categories: number;
};

type SystemHealth = {
  status: "ok" | "degraded";
  uptime_seconds: number;
  database: {
    pool_size: string;
    active_connections: number;
    idle_connections: number;
  };
  cache: {
    total_entries: number;
    active_entries: number;
    expired_entries: number;
    ttl_seconds: number;
  };
  rate_limit_per_minute: number;
};

type UserListPage = {
  users: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type BlocklistPage = {
  blocklist: BlockedUser[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// AI Overview types
type AIOverview = {
  household_id: number;
  has_data: boolean;
  forecast: {
    predicted: number;
    last_month: number;
    interval: [number, number] | null;
    confidence: string | null;
    method: string | null;
    explanation: string | null;
    suggestions: string[];
    currency: string;
    income_predicted: number | null;
    income_interval: [number, number] | null;
    income_method: string | null;
  } | { error: string };
  anomalies: {
    found: number;
    items: Array<{
      month: string;
      amount: number;
      median: number;
      deviation_percent: number;
      direction: "high" | "low";
    }>;
  } | { error: string };
  savings: {
    surplus: number | null;
    status: string;
    tip: string;
  } | { error: string } | null;
  categories: Array<{
    category: string;
    predicted: number;
    interval: [number, number];
    last: number;
    months: number;
    method: string;
    confidence: string;
    trend: string;
  }> | { error: string } | { breakdown: string };
};

type TabKey = "overview" | "users" | "add" | "blocklist" | "ai";

const tabs: { key: TabKey; labelKey: string; icon: IconName }[] = [
  { key: "overview", labelKey: "admin.tabOverview", icon: "chart" },
  { key: "users", labelKey: "admin.tabUsers", icon: "users" },
  { key: "add", labelKey: "admin.tabAddMember", icon: "plus" },
  { key: "blocklist", labelKey: "admin.tabBlocklist", icon: "alert" },
  { key: "ai", labelKey: "admin.tabAiData", icon: "bulb" },
];

export default function AdminPage() {
  const { user, authFetch } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const canFn = useCan();
  const canAdmin = canFn("system.admin");

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Overview data
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);

  // Users data
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [userTotal, setUserTotal] = useState(0);

  // Blocklist data
  const [blocklist, setBlocklist] = useState<BlockedUser[]>([]);
  const [blockPage, setBlockPage] = useState(1);
  const [blockTotalPages, setBlockTotalPages] = useState(1);
  const [blockTotal, setBlockTotal] = useState(0);

  // Add member form
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState(3); // 3 = member default
  const [formHouseholdId, setFormHouseholdId] = useState("");
  const [createdUser, setCreatedUser] = useState<{ password: string } | null>(null);

  // Block/unblock confirmation
  const [confirmAction, setConfirmAction] = useState<{ type: "block" | "unblock" | "delete"; user: AdminUser | BlockedUser } | null>(null);
  const [blockReason, setBlockReason] = useState("");

  // AI data
  const [aiHouseholdId, setAiHouseholdId] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState<AIOverview | null>(null);

  // Common load for overview tab
  async function loadOverview() {
    try {
      const [sum, hlth] = await Promise.all([
        authFetch<SystemSummary>("/api/admin/summary"),
        authFetch<SystemHealth>("/api/admin/health"),
      ]);
      if (sum.ok) setSummary(sum.data);
      if (hlth.ok) setHealth(hlth.data);
    } catch (e) {
      console.error("Failed to load overview:", e);
      setError(t("admin.createError"));
    } finally {
      setLoading(false);
    }
  }

  // Load users
  async function loadUsers(page = 1) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), search: userSearch });
      const res = await authFetch<UserListPage>(`/api/admin/users?${qs}`);
      if (res.ok) {
        setUsers(res.data.users);
        setUserPage(res.data.page);
        setUserTotalPages(res.data.totalPages);
        setUserTotal(res.data.total);
      } else {
        setError((res.data as { error?: string })?.error ?? t("admin.createError"));
      }
    } catch (e) {
      console.error("Failed to load users:", e);
      setError(t("admin.createError"));
    } finally {
      setLoading(false);
    }
  }

  // Load blocklist
  async function loadBlocklist(page = 1) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), page_size: "50" });
      const res = await authFetch<BlocklistPage>(`/api/admin/blocklist?${qs}`);
      if (res.ok) {
        setBlocklist(res.data.blocklist);
        setBlockPage(res.data.page);
        setBlockTotalPages(res.data.totalPages);
        setBlockTotal(res.data.total);
      } else {
        setError((res.data as { error?: string })?.error ?? t("admin.createError"));
      }
    } catch (e) {
      console.error("Failed to load blocklist:", e);
      setError(t("admin.createError"));
    } finally {
      setLoading(false);
    }
  }

  // Create user
  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        email: formEmail.trim(),
        name: formName.trim() || null,
        password: formPassword.trim() || null,
        role_id: formRole,
        household_id: formHouseholdId ? Number(formHouseholdId) : null,
      };
      const res = await authFetch<{ user: AdminUser & { password: string }; created: boolean }>("/api/admin/users", {
        method: "POST",
        body,
      });
      if (res.ok) {
        toast.success(t("admin.userCreated"));
        setCreatedUser({ password: res.data.user.password });
        setFormEmail("");
        setFormName("");
        setFormPassword("");
        setFormRole(3);
        setFormHouseholdId("");
        // Refresh users if on that tab
        if (activeTab === "users") loadUsers();
      } else {
        setError((res.data as { error?: string })?.error ?? t("admin.createError"));
      }
    } catch (e) {
      console.error("Create user failed:", e);
      setError(t("admin.createError"));
    } finally {
      setBusy(false);
    }
  }

  // Change role
  async function handleChangeRole(userId: number, roleId: number) {
    if (userId === user?.id) return;
    setBusy(true);
    setError("");
    try {
      const res = await authFetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: { roleId },
      });
      if (res.ok) {
        toast.success(t("toast.roleUpdated"));
        loadUsers(userPage);
      } else {
        setError((res.data as { error?: string })?.error ?? "Failed to update role");
      }
    } catch (e) {
      console.error("Change role failed:", e);
      setError("Failed to update role");
    } finally {
      setBusy(false);
    }
  }

  // Delete user
  async function handleDeleteUser(userId: number) {
    if (userId === user?.id) return;
    setBusy(true);
    setError("");
    try {
      const res = await authFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("admin.delete"));
        loadUsers(userPage);
      } else {
        setError((res.data as { error?: string })?.error ?? "Failed to delete user");
      }
    } catch (e) {
      console.error("Delete user failed:", e);
      setError("Failed to delete user");
    } finally {
      setBusy(false);
    }
  }

  // Block user
  async function handleBlockUser(userId: number) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch(`/api/admin/blocklist/${userId}`, {
        method: "POST",
        body: { acting_user_id: user?.id, reason: blockReason.trim() || null },
      });
      if (res.ok) {
        toast.success(t("admin.blockSuccess"));
        setConfirmAction(null);
        setBlockReason("");
        loadBlocklist();
      } else {
        setError((res.data as { error?: string })?.error ?? "Failed to block user");
      }
    } catch (e) {
      console.error("Block user failed:", e);
      setError("Failed to block user");
    } finally {
      setBusy(false);
    }
  }

  // Unblock user
  async function handleUnblockUser(userId: number) {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch(`/api/admin/blocklist/${userId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("admin.unblockSuccess"));
        setConfirmAction(null);
        loadBlocklist();
      } else {
        setError((res.data as { error?: string })?.error ?? "Failed to unblock user");
      }
    } catch (e) {
      console.error("Unblock user failed:", e);
      setError("Failed to unblock user");
    } finally {
      setBusy(false);
    }
  }

  // Run AI overview
  async function runAIOverview() {
    const hid = Number(aiHouseholdId.trim());
    if (!Number.isInteger(hid) || hid <= 0) {
      toast.error(t("admin.aiError"));
      return;
    }
    setAiLoading(true);
    setError("");
    try {
      const res = await authFetch<AIOverview>(`/api/admin/ai-overview/${hid}`);
      if (res.ok) {
        setAiData(res.data);
      } else {
        setError((res.data as { error?: string })?.error ?? t("admin.aiError"));
        setAiData(null);
      }
    } catch (e) {
      console.error("AI overview failed:", e);
      setError(t("admin.aiError"));
      setAiData(null);
    } finally {
      setAiLoading(false);
    }
  }

  // Confirm action helpers
  const openConfirm = (type: "block" | "unblock" | "delete", u: AdminUser | BlockedUser) => {
    setConfirmAction({ type, user: u });
    if (type === "block") setBlockReason("");
  };

  const closeConfirm = () => {
    setConfirmAction(null);
    setBlockReason("");
  };

  const confirmExecute = () => {
    if (!confirmAction) return;
    const { type, user: u } = confirmAction;
    if (type === "block") handleBlockUser(u.id);
    else if (type === "unblock") handleUnblockUser(u.id);
    else if (type === "delete") handleDeleteUser(u.id);
  };

  // Tab change loads appropriate data
  useEffect(() => {
    setLoading(true);
    setError("");
    setCreatedUser(null);
    setAiData(null);
    switch (activeTab) {
      case "overview":
        loadOverview();
        break;
      case "users":
        loadUsers(1);
        break;
      case "blocklist":
        loadBlocklist(1);
        break;
      case "add":
        setLoading(false);
        break;
      case "ai":
        setLoading(false);
        break;
    }
  }, [activeTab]);

  // Confirm dialog escape + click-outside
  useEffect(() => {
    if (!confirmAction) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeConfirm();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmAction, closeConfirm]);

  // Filter users on search
  const debouncedSearch = useMemo(() => userSearch.trim().toLowerCase(), [userSearch]);

  const filteredUsers = useMemo(() => {
    if (!debouncedSearch) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(debouncedSearch) ||
        (u.name ?? "").toLowerCase().includes(debouncedSearch),
    );
  }, [users, debouncedSearch]);

  if (!canAdmin) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState title={t("admin.notAuthorized")} icon={<Icon name="alert" className="h-8 w-8" />} />
      </div>
    );
  }

  if (loading) {
    return <PageSkeleton />;
  }

  const th = "py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-text-muted";
  const td = "py-2.5 pr-4";
  const row = "border-b border-border";

  return (
    <div className="mx-auto max-w-6xl space-y-6 fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-display font-bold gradient-text">{t("admin.title")}</h1>
        <p className="text-muted mt-1">{t("admin.subtitle")}</p>
      </div>

      {error && (
        <Card variant="glass" className="border-l-4 border-l-danger">
          <CardContent className="flex items-center gap-3 py-3">
            <Icon name="alert" className="h-5 w-5 text-danger shrink-0" />
            <p className="text-sm text-text">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Tab Bar — glass pill */}
      <Card variant="glass">
        <CardContent className="!p-1.5">
          <nav className="flex flex-wrap gap-1 justify-start" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`panel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-brand-500/10 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
                    : "text-muted hover:bg-surface-hover hover:text-text"
                }`}
              >
                <Icon name={tab.icon} className="h-4 w-4" />
                {t(tab.labelKey)}
              </button>
            ))}
          </nav>
        </CardContent>
      </Card>

      {/* ===================== OVERVIEW ===================== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stat cards grid */}
          <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-6">
            <StatCard
              label={t("admin.statUsers")}
              value={summary?.total_users ?? 0}
              icon={<Icon name="users" className="h-5 w-5" />}
              accent="brand"
            />
            <StatCard
              label={t("admin.statHouseholds")}
              value={summary?.total_households ?? 0}
              icon={<Icon name="home" className="h-5 w-5" />}
              accent="emerald"
            />
            <StatCard
              label={t("admin.statExpenses")}
              value={summary?.total_expenses ?? 0}
              icon={<Icon name="receipt" className="h-5 w-5" />}
              accent="amber"
            />
            <StatCard
              label={t("admin.statIncomes")}
              value={summary?.total_incomes ?? 0}
              icon={<Icon name="trendUp" className="h-5 w-5" />}
              accent="emerald"
            />
            <StatCard
              label={t("admin.statBudgets")}
              value={summary?.total_budgets ?? 0}
              icon={<Icon name="target" className="h-5 w-5" />}
              accent="amber"
            />
            <StatCard
              label={t("admin.statCategories")}
              value={summary?.total_categories ?? 0}
              icon={<Icon name="receipt" className="h-5 w-5" />}
              accent="red"
            />
          </div>

          {/* Block count + System health */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card variant="glass">
              <CardHeader
                title={t("admin.blocklistHeading")}
                icon={<Icon name="alert" />}
                action={
                  <Badge tone="warning" size="sm">{t("admin.blockCount", { n: blockTotal })}</Badge>
                }
              />
              {blockTotal === 0 ? (
                <EmptyState icon={<Icon name="check" className="h-6 w-6" />} title={t("admin.noBlocked")} />
              ) : (
                <p className="text-sm text-text-secondary">
                  {t("admin.blockCount", { n: blockTotal })}
                </p>
              )}
            </Card>

            <Card variant="glass">
              <CardHeader title={t("admin.health")} icon={<Icon name="chart" />} />
              {health && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-text-muted">{t("admin.status")}</p>
                    <p className={`font-semibold ${health.status === "ok" ? "text-success-text" : "text-warning-text"}`}>
                      {health.status === "ok" ? t("admin.healthy") : t("admin.unhealthy")}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-text-muted">{t("admin.uptime")}</p>
                    <p className="font-semibold text-text">
                      {Math.floor(health.uptime_seconds / 3600)}h {Math.floor((health.uptime_seconds % 3600) / 60)}m
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-text-muted">{t("admin.dbPool")}</p>
                    <p className="font-semibold text-text">
                      {t("admin.activeShort")}: {health.database.active_connections} / {t("admin.idleShort")}: {health.database.idle_connections}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-text-muted">{t("admin.rateLimit")}</p>
                    <p className="font-semibold text-text">
                      {health.rate_limit_per_minute} {t("admin.perMinute")}
                    </p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ===================== USERS ===================== */}
      {activeTab === "users" && (
        <Card className="card-hover card-padded">
          <CardHeader
            title={t("admin.users")}
            icon={<Icon name="users" />}
            action={
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <Icon name="search" className="h-4 w-4" />
                </span>
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={t("admin.search")}
                  className="input w-44 py-1.5 pl-9 text-xs placeholder:text-text-muted"
                />
              </div>
            }
          />
          {filteredUsers.length === 0 ? (
            <EmptyState icon={<Icon name="users" className="h-6 w-6" />} title={t("admin.noUsers")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={row}>
                    <th className={th}>ID</th>
                    <th className={th}>{t("admin.email")}</th>
                    <th className={th}>{t("admin.name")}</th>
                    <th className={th}>{t("admin.role")}</th>
                    <th className={th}>{t("admin.household")}</th>
                    <th className={th}>{t("admin.created")}</th>
                    <th className={`${th} text-right`}>{t("admin.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td className={`${td} text-text-muted`}>{u.id}</td>
                      <td className={td}>
                        <span className="font-medium text-text">{u.email}</span>
                        {u.id === user?.id && (
                          <Badge tone="brand" size="sm" className="ml-2">{t("members.you")}</Badge>
                        )}
                      </td>
                      <td className={`${td} text-text-secondary`}>{u.name ?? "—"}</td>
                      <td className={td}>
                        <Badge tone={u.role_id === 1 ? "brand" : "neutral"}>
                          {u.role_id === 1 ? t("role.admin") : t("role.member")}
                        </Badge>
                      </td>
                      <td className={`${td} text-text-secondary`}>{u.household_id ?? "—"}</td>
                      <td className={`${td} text-text-secondary`}>{u.created_at ? fmtDate(u.created_at) : "—"}</td>
                      <td className={`${td} text-right`}>
                        <Dropdown
                          items={[
                            {
                              label: u.role_id === 1 ? t("admin.makeMember") : t("admin.makeAdmin"),
                              onClick: () => handleChangeRole(u.id, u.role_id === 1 ? 3 : 1),
                              icon: "cog",
                              disabled: busy || u.id === user?.id,
                            },
                            {
                              label: t("admin.block"),
                              onClick: () => openConfirm("block", u),
                              icon: "alert",
                              disabled: busy || u.id === user?.id,
                            },
                            {
                              label: t("admin.delete"),
                              onClick: () => openConfirm("delete", u),
                              icon: "trash2",
                              variant: "danger",
                              disabled: busy || u.id === user?.id,
                            },
                          ]}
                          trigger={({ open, onClick }) => (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={onClick}
                              aria-expanded={open}
                              aria-haspopup="menu"
                              className="min-h-[44px] min-w-[44px]"
                              disabled={busy || u.id === user?.id}
                              title={t("admin.actions")}
                              aria-label={t("admin.actions")}
                            >
                              <Icon name="menu" className="h-5 w-5" />
                            </Button>
                          )}
                          align="right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {userTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-text-muted">
                {t("admin.page", { current: userPage, total: userTotalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={userPage <= 1 || busy}
                  onClick={() => loadUsers(userPage - 1)}
                >
                  {t("admin.prev")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={userPage >= userTotalPages || busy}
                  onClick={() => loadUsers(userPage + 1)}
                >
                  {t("admin.next")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ===================== ADD MEMBER ===================== */}
      {activeTab === "add" && (
        <div className="space-y-6">
          {/* Create user form */}
          <Card variant="glass">
            <CardHeader title={t("admin.createUser")} icon={<Icon name="plus" />} />
            <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4 max-w-md">
              <Input
                type="email"
                label={t("admin.email")}
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                required
                placeholder="user@example.com"
              />
              <Input
                label={t("admin.name")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("admin.name")}
              />
              <Input
                type="password"
                label={t("admin.password")}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={t("admin.passwordHint")}
                hint={t("admin.passwordHint")}
              />
              <Select
                label={t("admin.role")}
                value={String(formRole)}
                onChange={(e) => setFormRole(Number(e.target.value))}
                options={[
                  { value: "3", label: t("admin.roleMember") },
                  { value: "1", label: t("admin.roleAdmin") },
                ]}
              />
              <Input
                type="number"
                label={t("admin.householdId")}
                value={formHouseholdId}
                onChange={(e) => setFormHouseholdId(e.target.value)}
                placeholder={t("admin.householdIdHint")}
                hint={t("admin.householdIdHint")}
                min="1"
              />
              <div className="pt-2">
                <Button type="submit" isLoading={busy} disabled={!formEmail.trim()}>
                  {t("admin.createUser")}
                </Button>
              </div>
            </form>

            {/* Created user result with password */}
            {createdUser && (
              <div className="mt-4 rounded-xl bg-success-soft p-4 border border-success/30 dark:bg-success-soft/30 dark:border-success/30">
                <p className="text-sm font-medium text-success-text">
                  {t("admin.userCreated")}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  <span className="font-mono bg-surface px-2 py-0.5 rounded">{createdUser.password}</span>
                  <span className="ml-2 text-text-muted">({t("admin.passwordHint")})</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* ===================== BLOCKLIST ===================== */}
      {activeTab === "blocklist" && (
        <Card variant="glass">
          <CardHeader title={t("admin.blocklistHeading")} icon={<Icon name="alert" />} />
          {blocklist.length === 0 ? (
            <EmptyState icon={<Icon name="check" className="h-6 w-6" />} title={t("admin.noBlocked")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={row}>
                    <th className={th}>{t("admin.user")}</th>
                    <th className={th}>{t("admin.blockedBy")}</th>
                    <th className={th}>{t("admin.reason")}</th>
                    <th className={th}>{t("admin.blockedAt")}</th>
                    <th className={`${th} text-right`}>{t("admin.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {blocklist.map((b) => (
                    <tr key={b.id}>
                      <td className={td}>
                        <span className="font-medium text-text">{b.user_email}</span>
                        <p className="text-xs text-text-muted">{b.user_name ?? "—"}</p>
                      </td>
                      <td className={td}>
                        <p className="text-text-secondary">{b.admin_email}</p>
                        <p className="text-xs text-text-muted">{b.admin_name ?? "—"}</p>
                      </td>
                      <td className={td}>
                        <span className={b.reason ? "text-text-secondary" : "text-text-muted"}>
                          {b.reason ?? t("admin.noBlocked")}
                        </span>
                      </td>
                      <td className={`${td} text-text-secondary`}>{fmtDate(b.created_at)}</td>
                      <td className={`${td} text-right`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleUnblockUser(b.user_id)}
                          className="text-success"
                        >
                          {t("admin.unblock")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {blockTotalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-text-muted">
                {t("admin.page", { current: blockPage, total: blockTotalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={blockPage <= 1 || busy}
                  onClick={() => loadBlocklist(blockPage - 1)}
                >
                  {t("admin.prev")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={blockPage >= blockTotalPages || busy}
                  onClick={() => loadBlocklist(blockPage + 1)}
                >
                  {t("admin.next")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ===================== AI DATA ===================== */}
      {activeTab === "ai" && (
        <div className="space-y-6">
          {/* Input card */}
          <Card variant="glass">
            <CardHeader title={t("admin.tabAiData")} icon={<Icon name="bulb" />} />
            <CardContent>
            <p className="text-sm text-muted mb-4">{t("admin.aiDataHint")}</p>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <Input
                  type="number"
                  label={t("admin.aiHouseholdLabel")}
                  value={aiHouseholdId}
                  onChange={(e) => setAiHouseholdId(e.target.value)}
                  placeholder="1"
                  min="1"
                />
              </div>
              <Button onClick={runAIOverview} isLoading={aiLoading} disabled={!aiHouseholdId.trim()}>
                {t("admin.aiRun")}
              </Button>
            </div>
          </CardContent>
          </Card>

          {/* Results */}
          {aiData && (
            <div className="space-y-6">
              {/* Forecast card */}
              {aiData.forecast && !("error" in aiData.forecast) && (
                <Card className="card-hover card-padded border-l-4 border-l-brand">
                  <CardHeader
                    title={t("admin.forecast")}
                    action={
                      <div className="flex gap-1.5">
                        <Badge tone="neutral">{aiData.forecast.method ?? "—"}</Badge>
                        {aiData.forecast.confidence && (
                          <Badge tone="neutral">
                            Conf: {aiData.forecast.confidence}
                          </Badge>
                        )}
                      </div>
                    }
                  />
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold gradient-text">{fmtMoney(aiData.forecast.predicted, aiData.forecast.currency)}</p>
                      <p className="text-xs text-text-muted">{t("admin.forecastPredicted")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-text">{fmtMoney(aiData.forecast.last_month, aiData.forecast.currency)}</p>
                      <p className="text-xs text-text-muted">{t("ins.lastMonth")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-text">
                        {aiData.forecast.income_predicted != null ? fmtMoney(aiData.forecast.income_predicted, aiData.forecast.currency) : "—"}
                      </p>
                      <p className="text-xs text-text-muted">{t("ins.incomeForecast")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-text">
                        {aiData.forecast.interval
                          ? `${fmtMoney(aiData.forecast.interval[0])} – ${fmtMoney(aiData.forecast.interval[1])}`
                          : "—"}
                      </p>
                      <p className="text-xs text-text-muted">{t("admin.forecastInterval")}</p>
                    </div>
                  </div>
                  {aiData.forecast.explanation && (
                    <p className="mt-3 text-sm text-text-secondary">{aiData.forecast.explanation}</p>
                  )}
                  {aiData.forecast.suggestions && aiData.forecast.suggestions.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {aiData.forecast.suggestions.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-text-secondary">
                          <span className="mt-0.5 text-brand">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}

              {/* Anomalies */}
              {aiData.anomalies && !("error" in aiData.anomalies) && (
                <Card variant="glass" className="border-l-4 border-l-warning">
                  <CardHeader
                    title={t("admin.anomalies")}
                    subtitle={t("admin.anomaliesFound", { n: aiData.anomalies.found })}
                  />
                  {aiData.anomalies.found === 0 ? (
                    <EmptyState icon={<Icon name="check" className="h-6 w-6" />} title={t("admin.noData")} />
                  ) : (
                    <div className="space-y-2">
                      {aiData.anomalies.items.map((a, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            a.direction === "high"
                              ? "bg-danger-soft dark:bg-danger-soft/30"
                              : "bg-warning-soft dark:bg-warning-soft/30"
                          }`}
                        >
                          <div>
                            <p className="font-medium text-text">{a.month}</p>
                            <p className="text-sm text-text-muted">
                              {t("admin.forecastPredicted")}: {fmtMoney(a.amount)} | {t("admin.forecastMethod")}: {fmtMoney(a.median)} | {a.deviation_percent > 0 ? "+" : ""}{a.deviation_percent}%
                            </p>
                          </div>
                          <Badge tone={a.direction === "high" ? "danger" : "warning"}>
                            {a.direction === "high" ? t("admin.forecastTrend") : t("admin.forecastTrend")}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Savings */}
              {aiData.savings && !("error" in aiData.savings) && aiData.savings !== null && (
                <Card variant="glass" className="border-l-4 border-l-success">
                  <CardHeader title={t("admin.savings")} icon={<Icon name="target" />} />
                  <div className="space-y-2">
                    {aiData.savings.surplus != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">{t("ins.surplus")}</span>
                        <span className={`text-xl font-bold ${aiData.savings.surplus >= 0 ? "text-success-text" : "text-danger-text"}`}>
                          {fmtMoney(aiData.savings.surplus)}
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-text-secondary">{aiData.savings.tip}</p>
                    <Badge tone={aiData.savings.status === "surplus" ? "success" : aiData.savings.status === "over_budget" ? "danger" : "neutral"}>
                      {t(`status.${aiData.savings.status}`)}
                    </Badge>
                  </div>
                </Card>
              )}

              {/* Category breakdown */}
              {aiData.categories && Array.isArray(aiData.categories) && aiData.categories.length > 0 && (
                <Card variant="glass">
                  <CardHeader title={t("admin.categoriesBreakdown")} icon={<Icon name="chart" />} />
                  <div className="space-y-2">
                    {aiData.categories.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface-hover">
                        <div className="flex items-center gap-3">
                          <span className="text-text-muted">{i + 1}.</span>
                          <span className="font-medium text-text">{c.category}</span>
                          <Badge tone="neutral">{c.method}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-text-secondary">
                          <span>{t("admin.forecastPredicted")}: {fmtMoney(c.predicted)}</span>
                          <span>{t("admin.forecastTrend")}: {c.trend}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Error states */}
              {aiData.forecast && "error" in aiData.forecast && (
                <Card className="card-padded border-l-4 border-l-danger">
                  <CardHeader title={t("admin.forecast")} />
                  <p className="text-sm text-danger-text">{aiData.forecast.error}</p>
                </Card>
              )}
              {aiData.anomalies && "error" in aiData.anomalies && (
                <Card className="card-padded border-l-4 border-l-danger">
                  <CardHeader title={t("admin.anomalies")} />
                  <p className="text-sm text-danger-text">{aiData.anomalies.error}</p>
                </Card>
              )}
              {aiData.savings && "error" in aiData.savings && (
                <Card className="card-padded border-l-4 border-l-danger">
                  <CardHeader title={t("admin.savings")} />
                  <p className="text-sm text-danger-text">{aiData.savings.error}</p>
                </Card>
              )}
              {aiData.categories && "error" in aiData.categories && (
                <Card className="card-padded border-l-4 border-l-danger">
                  <CardHeader title={t("admin.categoriesBreakdown")} />
                  <p className="text-sm text-danger-text">{aiData.categories.error}</p>
                </Card>
              )}

              {!aiData.has_data && (
                <EmptyState
                  icon={<Icon name="chart" className="h-8 w-8" />}
                  title={t("admin.aiNoData")}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation dialog (inline) */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-text/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={closeConfirm}
        >
          <div
            id="confirm-dialog"
            className="w-full max-w-md glass-panel rounded-2xl shadow-float fade-in-up p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title" className="text-lg font-semibold text-text">
              {confirmAction.type === "block"
                ? t("admin.confirmBlock")
                : confirmAction.type === "unblock"
                ? t("admin.confirmUnblock")
                : t("admin.confirmDeleteUser", { name: getConfirmEmail(confirmAction.user) })}
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              {confirmAction.type === "block"
                ? t("admin.confirmBlockDesc", { name: getConfirmEmail(confirmAction.user) })
                : confirmAction.type === "unblock"
                ? t("admin.confirmUnblockDesc", { name: getConfirmEmail(confirmAction.user) })
                : t("admin.confirmDeleteUser", { name: getConfirmEmail(confirmAction.user) })}
            </p>
            {confirmAction.type === "block" && (
              <div className="mt-4">
                <Input
                  label={t("admin.blockReason")}
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder={t("admin.blockReason")}
                  maxLength={255}
                />
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={closeConfirm} disabled={busy} isLoading={busy}>
                {t("admin.cancel")}
              </Button>
              <Button variant={confirmAction.type === "delete" ? "danger" : "primary"} onClick={confirmExecute} disabled={busy} isLoading={busy}>
                {t("admin.yes")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getConfirmEmail(user: AdminUser | BlockedUser): string {
  return "user_email" in user ? user.user_email : user.email;
}