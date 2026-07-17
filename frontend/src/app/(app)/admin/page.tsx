"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCan } from "@/lib/permissions";
import { useToast } from "@/components/feedback/Toast";
import { PageSkeleton } from "@/components/feedback/Skeleton";
import { Card, CardHeader, EmptyState, Icon } from "@/components/ui";

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
};

export default function AdminPage() {
  const { user, authFetch } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const canFn = useCan();
  const canAdmin = canFn("system.admin");

  const [households, setHouseholds] = useState<AdminHousehold[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    const [hh, us] = await Promise.all([
      authFetch<{ households: AdminHousehold[] }>("/api/admin/households"),
      authFetch<{ users: AdminUser[] }>("/api/admin/users"),
    ]);
    if (hh.ok) setHouseholds(hh.data.households ?? []);
    if (us.ok) setUsers(us.data.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (canAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdmin]);

  async function changeRole(id: number, roleId: number) {
    setBusy(true);
    setError("");
    try {
      const r = await authFetch(`/api/admin/users/${id}/role`, {
        method: "PATCH",
        body: { roleId },
      });
      if (!r.ok) {
        setError((r.data as { error?: string })?.error ?? "Failed to update role");
        return;
      }
      toast.success(t("toast.roleUpdated"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  if (!canAdmin) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState title={t("admin.notAuthorized")} />
      </div>
    );
  }

  if (loading) return <PageSkeleton />;

  const th =
    "py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500";
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

      <Card className="card-pad card-hover">
        <CardHeader title={t("admin.households")} icon={<Icon name="home" />} />
        {households.length === 0 ? (
          <EmptyState icon={<Icon name="home" className="h-6 w-6" />} title={t("household.noneYet")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={row}>
                  <th className={th}>ID</th>
                  <th className={th}>{t("admin.name")}</th>
                  <th className={th}>{t("members.title")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {households.map((h) => (
                  <tr key={h.id}>
                    <td className={`${td} text-ink-500 dark:text-ink-400`}>{h.id}</td>
                    <td className={`${td} font-medium text-ink-800 dark:text-ink-100`}>{h.name ?? "—"}</td>
                    <td className={`${td} text-ink-600 dark:text-ink-300`}>{h.member_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="card-pad card-hover">
        <CardHeader
          title={t("admin.users")}
          icon={<Icon name="users" />}
          action={
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.searchPlaceholder")}
                className="input w-44 py-1.5 pl-9 text-xs"
              />
            </div>
          }
        />
        {users.length === 0 ? (
          <EmptyState icon={<Icon name="users" className="h-6 w-6" />} title={t("household.noneYet")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={row}>
                  <th className={th}>{t("admin.email")}</th>
                  <th className={th}>{t("admin.name")}</th>
                  <th className={th}>{t("admin.role")}</th>
                  <th className={`${th} text-right`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
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
                      <span className={u.role_id === 1 ? "badge-brand" : "badge-neutral"}>
                        {u.role_id === 1 ? t("role.admin") : t("role.member")}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      {u.role_id === 1 ? (
                        <button
                          disabled={busy}
                          onClick={() => changeRole(u.id, 3)}
                          className="btn-ghost btn-sm"
                        >
                          {t("admin.makeMember")}
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => changeRole(u.id, 1)}
                          className="btn-ghost btn-sm text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-soft"
                        >
                          {t("admin.makeAdmin")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
