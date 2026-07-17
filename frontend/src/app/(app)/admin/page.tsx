"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCan } from "@/lib/permissions";
import { Card, CardHeader, EmptyState } from "@/components/ui";

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
  const canFn = useCan();
  const canAdmin = canFn("system.admin");

  const [households, setHouseholds] = useState<AdminHousehold[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!canAdmin) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState title={t("admin.notAuthorized")} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-ink-400">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
      )}

      <div>
        <h1 className="text-lg font-semibold text-ink-900">{t("admin.title")}</h1>
        <p className="text-sm text-ink-500">{t("admin.subtitle")}</p>
      </div>

      <Card className="card-pad">
        <CardHeader title={t("admin.households")} />
        {households.length === 0 ? (
          <p className="text-sm text-ink-400">{t("household.noneYet")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="py-2 pr-4 font-medium">ID</th>
                <th className="py-2 pr-4 font-medium">{t("admin.name")}</th>
                <th className="py-2 pr-4 font-medium">{t("members.title")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {households.map((h) => (
                <tr key={h.id}>
                  <td className="py-2.5 pr-4 text-ink-500">{h.id}</td>
                  <td className="py-2.5 pr-4 font-medium text-ink-800">{h.name ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-ink-600">{h.member_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="card-pad">
        <CardHeader title={t("admin.users")} />
        {users.length === 0 ? (
          <p className="text-sm text-ink-400">{t("household.noneYet")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="py-2 pr-4 font-medium">{t("admin.email")}</th>
                <th className="py-2 pr-4 font-medium">{t("admin.name")}</th>
                <th className="py-2 pr-4 font-medium">{t("admin.role")}</th>
                <th className="py-2 pr-4 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-ink-800">{u.email}</span>
                    {u.id === user?.id && (
                      <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                        {t("members.you")}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-ink-600">{u.name ?? "—"}</td>
                  <td className="py-2.5 pr-4">
                    <span className={u.role_id === 1 ? "badge-brand" : "badge-neutral"}>
                      {u.role_id === 1 ? t("role.admin") : t("role.member")}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right">
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
                        className="btn-ghost btn-sm text-brand-700 hover:bg-brand-50"
                      >
                        {t("admin.makeAdmin")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
