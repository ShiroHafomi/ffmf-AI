'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { user, logout, authFetch } = useAuth();
  const router = useRouter();
  const [hid, setHid] = useState("1");
  const [pred, setPred] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onPredict() {
    setErr("");
    setPred(null);
    setBusy(true);
    try {
      const r = await authFetch<any>(`/api/predict/${hid}`);
      if (r.ok) setPred(r.data);
      else setErr((r.data as any)?.error ?? "Failed to predict");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {user?.email} · role {user?.role_id}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          Log out
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-medium">Spending prediction</h2>
        <div className="flex gap-2">
          <input
            value={hid}
            onChange={(e) => setHid(e.target.value)}
            inputMode="numeric"
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            placeholder="household id"
          />
          <button
            onClick={onPredict}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {busy ? "..." : "Predict"}
          </button>
        </div>

        {err && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>
        )}

        {pred && (
          <dl className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Predicted" value={fmt(pred.predicted)} />
            <Stat label="Last month" value={fmt(pred.last_month)} />
            <Stat label="Budget" value={pred.budget != null ? fmt(pred.budget) : "—"} />
            <Stat label="Change" value={`${pred.increase_percent ?? 0}%`} />
            <div className="col-span-2 rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium capitalize">{pred.status}</p>
              <p className="text-sm text-slate-600">{pred.message}</p>
              <p className="mt-1 text-sm text-slate-500">{pred.suggestion}</p>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

function fmt(n: number) {
  if (typeof n !== "number") return String(n);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
