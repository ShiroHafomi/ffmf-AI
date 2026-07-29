"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCan } from "@/lib/permissions";
import { useToast } from "@/components/feedback/Toast";
import { PageSkeleton, StatCardSkeleton } from "@/components/feedback/Skeleton";
import { Card, CardHeader, EmptyState, Icon, Badge, StatCard, TrendArrow, Button } from "@/components/ui";
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

const tabs: { key: TabKey; labelKey: string; icon: string }[] = [
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

  function getConfirmEmail(user: AdminUser | BlockedUser): string {
    return "user_email" in user ? user.user_email : user.email;
  }

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
    return (
      <PageSkeleton />
    );
  }

  const th = "py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500";
  const td = "py-2.5 pr-4";
  const row = "border-b border-ink-100 dark:border-ink-800";

  return (
    <div className="mx-auto max-w-6xl space-y-6 fade-in-up">
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
      )}

      <div>
        <h1 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{t("admin.title")}</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{t("admin.subtitle")}</p>
      </div>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-1 -mb-px border-b border-ink-200 dark:border-ink-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 py-2 px-3 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-soft/30"
                : "border-transparent text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200"
            }`}
          >
            <Icon name={tab.icon as any} className="h-4 w-4" />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

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
            <Card className="card-pad card-hover">
              <CardHeader
                title={t("admin.blocklistHeading")}
                icon={<Icon name="alert" />}
                action={
                  <span className="badge-warning">
                    {t("admin.blockCount", { n: blockTotal })}
                  </span>
                }
              />
              {blockTotal === 0 ? (
                <EmptyState icon={<Icon name="check" className="h-6 w-6" />} title={t("admin.noBlocked")} />
              ) : (
                <p className="text-sm text-ink-600 dark:text-ink-300">
                  {t("admin.blockCount", { n: blockTotal })}
                </p>
              )}
            </Card>

            <Card className="card-pad card-hover">
              <CardHeader title={t("admin.health")} icon={<Icon name="chart" />} />
              {health && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-ink-500 dark:text-ink-400">{t("admin.status")}</p>
                    <p className={`font-semibold ${health.status === "ok" ? "text-emerald-600" : "text-amber-600"}`}>
                      {health.status === "ok" ? t("admin.healthy") : t("admin.unhealthy")}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-ink-500 dark:text-ink-400">{t("admin.uptime")}</p>
                    <p className="font-semibold text-ink-800 dark:text-ink-100">
                      {Math.floor(health.uptime_seconds / 3600)}h {Math.floor((health.uptime_seconds % 3600) / 60)}m
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-ink-500 dark:text-ink-400">{t("admin.dbPool")}</p>
                    <p className="font-semibold text-ink-800 dark:text-ink-100">
                      {t("admin.activeShort")}: {health.database.active_connections} / {t("admin.idleShort")}: {health.database.idle_connections}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-ink-500 dark:text-ink-400">{t("admin.rateLimit")}</p>
                    <p className="font-semibold text-ink-800 dark:text-ink-100">
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
        <Card className="card-pad card-hover">
          <CardHeader
            title={t("admin.users")}
            icon={<Icon name="users" />}
            action={
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 dark:text-ink-400">
                  <Icon name="search" className="h-4 w-4" />
                </span>
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={t("admin.search")}
                  className="input w-44 py-1.5 pl-9 text-xs placeholder:text-ink-500 dark:placeholder:text-ink-400"
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
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td className={`${td} text-ink-500 dark:text-ink-400`}>{u.id}</td>
                      <td className={td}>
                        <span className="font-medium text-ink-800 dark:text-ink-100">{u.email}</span>
                        {u.id === user?.id && (
                          <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-soft dark:text-brand-200">
                            {t("members.you")}
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-ink-600 dark:text-ink-300`}>{u.name ?? "—"}</td>
                      <td className={td}>
                        <Badge tone={u.role_id === 1 ? "brand" : "neutral"}>
                          {u.role_id === 1 ? t("role.admin") : t("role.member")}
                        </Badge>
                      </td>
                      <td className={`${td} text-ink-600 dark:text-ink-300`}>{u.household_id ?? "—"}</td>
                      <td className={`${td} text-ink-600 dark:text-ink-300`}>{u.created_at ? fmtDate(u.created_at) : "—"}</td>
                      <td className={`${td} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Role toggle */}
                          <button
                            disabled={busy || u.id === user?.id}
                            onClick={() => handleChangeRole(u.id, u.role_id === 1 ? 3 : 1)}
                            className="btn-ghost btn-sm"
                            title={t("admin.changeRole")}
                          >
                            {u.role_id === 1 ? t("admin.makeMember") : t("admin.makeAdmin")}
                          </button>
                          {/* Block */}
                          <button
                            disabled={busy || u.id === user?.id}
                            onClick={() => openConfirm("block", u)}
                            className="btn-ghost btn-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-soft/30"
                            title={t("admin.block")}
                          >
                            {t("admin.block")}
                          </button>
                          {/* Delete */}
                          <button
                            disabled={busy || u.id === user?.id}
                            onClick={() => openConfirm("delete", u)}
                            className="btn-ghost btn-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-soft/30"
                            title={t("admin.delete")}
                          >
                            {t("admin.delete")}
                          </button>
                        </div>
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
              <span className="text-sm text-ink-500 dark:text-ink-400">
                {t("admin.page", { current: userPage, total: userTotalPages })}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={userPage <= 1 || busy}
                  onClick={() => loadUsers(userPage - 1)}
                  className="btn-ghost btn-sm"
                >
                  {t("admin.prev")}
                </button>
                <button
                  disabled={userPage >= userTotalPages || busy}
                  onClick={() => loadUsers(userPage + 1)}
                  className="btn-ghost btn-sm"
                >
                  {t("admin.next")}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ===================== ADD MEMBER ===================== */}
      {activeTab === "add" && (
        <div className="space-y-6">
          {/* Create user form */}
          <Card className="card-pad card-hover">
            <CardHeader title={t("admin.createUser")} icon={<Icon name="plus" />} />
            <form onSubmit={handleCreateUser} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">
                  {t("admin.email")}
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                  className="input w-full"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">
                  {t("admin.name")}
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="input w-full"
                  placeholder={t("admin.name")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">
                  {t("admin.password")}
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="input w-full"
                  placeholder={t("admin.passwordHint")}
                />
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t("admin.passwordHint")}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">
                  {t("admin.role")}
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(Number(e.target.value))}
                  className="input w-full"
                >
                  <option value={3}>{t("admin.roleMember")}</option>
                  <option value={1}>{t("admin.roleAdmin")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">
                  {t("admin.householdId")}
                </label>
                <input
                  type="number"
                  value={formHouseholdId}
                  onChange={(e) => setFormHouseholdId(e.target.value)}
                  className="input w-full"
                  placeholder={t("admin.householdIdHint")}
                  min="1"
                />
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t("admin.householdIdHint")}</p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={busy || !formEmail.trim()}>
                  {busy ? t("admin.aiRunning") : t("admin.createUser")}
                </Button>
              </div>
            </form>

            {/* Created user result with password */}
            {createdUser && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-soft/30 dark:border-emerald-800">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  {t("admin.userCreated")}
                </p>
                <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
                  <span className="font-mono bg-white dark:bg-ink-900 px-2 py-0.5 rounded">{createdUser.password}</span>
                  <span className="ml-2 text-ink-500 dark:text-ink-400">({t("admin.passwordHint")})</span>
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===================== BLOCKLIST ===================== */}
      {activeTab === "blocklist" && (
        <Card className="card-pad card-hover">
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
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {blocklist.map((b) => (
                    <tr key={b.id}>
                      <td className={td}>
                        <span className="font-medium text-ink-800 dark:text-ink-100">{b.user_email}</span>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{b.user_name ?? "—"}</p>
                      </td>
                      <td className={td}>
                        <p className="text-ink-600 dark:text-ink-300">{b.admin_email}</p>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{b.admin_name ?? "—"}</p>
                      </td>
                      <td className={td}>
                        <span className={b.reason ? "text-ink-600 dark:text-ink-300" : "text-ink-400 dark:text-ink-500"}>
                          {b.reason ?? t("admin.noBlocked")}
                        </span>
                      </td>
                      <td className={`${td} text-ink-600 dark:text-ink-300`}>{fmtDate(b.created_at)}</td>
                      <td className={`${td} text-right`}>
                        <button
                          disabled={busy}
                          onClick={() => handleUnblockUser(b.user_id)}
                          className="btn-ghost btn-sm text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-soft/30"
                        >
                          {t("admin.unblock")}
                        </button>
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
              <span className="text-sm text-ink-500 dark:text-ink-400">
                {t("admin.page", { current: blockPage, total: blockTotalPages })}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={blockPage <= 1 || busy}
                  onClick={() => loadBlocklist(blockPage - 1)}
                  className="btn-ghost btn-sm"
                >
                  {t("admin.prev")}
                </button>
                <button
                  disabled={blockPage >= blockTotalPages || busy}
                  onClick={() => loadBlocklist(blockPage + 1)}
                  className="btn-ghost btn-sm"
                >
                  {t("admin.next")}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ===================== AI DATA ===================== */}
      {activeTab === "ai" && (
        <div className="space-y-6">
          {/* Input card */}
          <Card className="card-pad card-hover">
            <CardHeader title={t("admin.tabAiData")} icon={<Icon name="bulb" />} />
            <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">{t("admin.aiDataHint")}</p>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">
                  {t("admin.aiHouseholdLabel")}
                </label>
                <input
                  type="number"
                  value={aiHouseholdId}
                  onChange={(e) => setAiHouseholdId(e.target.value)}
                  className="input w-full"
                  placeholder="1"
                  min="1"
                />
              </div>
              <Button onClick={runAIOverview} disabled={aiLoading || !aiHouseholdId.trim()}>
                {aiLoading ? t("admin.aiRunning") : t("admin.aiRun")}
              </Button>
            </div>
          </Card>

          {/* Results */}
          {aiData && (
            <div className="space-y-6">
              {/* Forecast card */}
              {aiData.forecast && !("error" in aiData.forecast) && (
                <Card className="card-pad card-hover border-l-4 border-l-brand-500">
                  <CardHeader
                    title={t("admin.forecast")}
                    action={
                      <div className="flex gap-1.5">
                        <Badge tone="neutral">{aiData.forecast.method ?? "—"}</Badge>
                        {aiData.forecast.confidence && (
                          <Badge tone="neutral">
                            {t("admin.forecastConfidence", { value: aiData.forecast.confidence })}
                          </Badge>
                        )}
                      </div>
                    }
                  />
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold gradient-text">{fmtMoney(aiData.forecast.predicted, aiData.forecast.currency)}</p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">{t("admin.forecastPredicted")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ink-800 dark:text-ink-100">{fmtMoney(aiData.forecast.last_month, aiData.forecast.currency)}</p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">{t("ins.lastMonth")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ink-800 dark:text-ink-100">
                        {aiData.forecast.income_predicted != null ? fmtMoney(aiData.forecast.income_predicted, aiData.forecast.currency) : "—"}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">{t("ins.incomeForecast")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ink-800 dark:text-ink-100">
                        {aiData.forecast.interval
                          ? `${fmtMoney(aiData.forecast.interval[0])} – ${fmtMoney(aiData.forecast.interval[1])}`
                          : "—"}
                      </p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">{t("admin.forecastInterval")}</p>
                    </div>
                  </div>
                  {aiData.forecast.explanation && (
                    <p className="mt-3 text-sm text-ink-700 dark:text-ink-300">{aiData.forecast.explanation}</p>
                  )}
                  {aiData.forecast.suggestions && aiData.forecast.suggestions.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {aiData.forecast.suggestions.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300">
                          <span className="mt-0.5 text-brand-500">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}

              {/* Anomalies */}
              {aiData.anomalies && !("error" in aiData.anomalies) && (
                <Card className="card-pad card-hover border-l-4 border-l-amber-500">
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
                          className={`flex items-center justify-between p-3 rounded-lg ${a.direction === "high" ? "bg-red-50 dark:bg-red-soft/30" : "bg-amber-50 dark:bg-amber-soft/30"}`}
                        >
                          <div>
                            <p className="font-medium text-ink-800 dark:text-ink-100">{a.month}</p>
                            <p className="text-sm text-ink-500 dark:text-ink-400">
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
                <Card className="card-pad card-hover border-l-4 border-l-emerald-500">
                  <CardHeader title={t("admin.savings")} icon={<Icon name="target" />} />
                  <div className="space-y-2">
                    {aiData.savings.surplus != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-ink-600 dark:text-ink-300">{t("ins.surplus")}</span>
                        <span className={`text-xl font-bold ${aiData.savings.surplus >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {fmtMoney(aiData.savings.surplus)}
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-ink-700 dark:text-ink-300">{aiData.savings.tip}</p>
                    <Badge tone={aiData.savings.status === "surplus" ? "success" : aiData.savings.status === "over_budget" ? "danger" : "neutral"}>
                      {t(`status.${aiData.savings.status}`)}
                    </Badge>
                  </div>
                </Card>
              )}

              {/* Category breakdown */}
              {aiData.categories && Array.isArray(aiData.categories) && aiData.categories.length > 0 && (
                <Card className="card-pad card-hover">
                  <CardHeader title={t("admin.categoriesBreakdown")} icon={<Icon name="chart" />} />
                  <div className="space-y-2">
                    {aiData.categories.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-ink-50 dark:bg-ink-800/50">
                        <div className="flex items-center gap-3">
                          <span className="text-ink-500 dark:text-ink-400">{i + 1}.</span>
                          <span className="font-medium text-ink-800 dark:text-ink-100">{c.category}</span>
                          <Badge tone="neutral">{c.method}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-ink-600 dark:text-ink-300">
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
                <Card className="card-pad border-l-4 border-l-red-500">
                  <CardHeader title={t("admin.forecast")} />
                  <p className="text-sm text-red-600">{aiData.forecast.error}</p>
                </Card>
              )}
              {aiData.anomalies && "error" in aiData.anomalies && (
                <Card className="card-pad border-l-4 border-l-red-500">
                  <CardHeader title={t("admin.anomalies")} />
                  <p className="text-sm text-red-600">{aiData.anomalies.error}</p>
                </Card>
              )}
              {aiData.savings && "error" in aiData.savings && (
                <Card className="card-pad border-l-4 border-l-red-500">
                  <CardHeader title={t("admin.savings")} />
                  <p className="text-sm text-red-600">{aiData.savings.error}</p>
                </Card>
              )}
              {aiData.categories && "error" in aiData.categories && (
                <Card className="card-pad border-l-4 border-l-red-500">
                  <CardHeader title={t("admin.categoriesBreakdown")} />
                  <p className="text-sm text-red-600">{aiData.categories.error}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-float fade-in-up">
            <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">
              {confirmAction.type === "block" ? t("admin.confirmBlock") : confirmAction.type === "unblock" ? t("admin.confirmUnblock") : t("admin.confirmDeleteUser", { name: getConfirmEmail(confirmAction.user) })}
            </h3>
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
              {confirmAction.type === "block"
                ? t("admin.confirmBlockDesc", { name: getConfirmEmail(confirmAction.user) })
                : confirmAction.type === "unblock"
                ? t("admin.confirmUnblockDesc", { name: getConfirmEmail(confirmAction.user) })
                : t("admin.confirmDeleteUser", { name: getConfirmEmail(confirmAction.user) })}
            </p>
            {confirmAction.type === "block" && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">
                  {t("admin.blockReason")}
                </label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="input w-full"
                  placeholder={t("admin.blockReason")}
                  maxLength={255}
                />
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={closeConfirm} disabled={busy}>
                {t("admin.cancel")}
              </Button>
              <Button variant={confirmAction.type === "delete" ? "danger" : "primary"} onClick={confirmExecute} disabled={busy}>
                {t("admin.yes")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}