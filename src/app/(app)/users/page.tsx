import { requireRole } from "@/lib/session-claims";
import { withRead } from "@/db/client";
import { listActiveUsers } from "@/modules/users/service";
import { PageShell } from "@/components/ui/PageShell";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import type { UserDto } from "@/modules/users/dto";

// Users list page — PM/GM only. Server-rendered for Phase 2 MVP; Phase 3 adds
// client-side filter + TanStack Query live refresh.

const ROLE_LABELS: Record<UserDto["role"], string> = {
  pm: "مدير المشروع",
  gm: "مدير عام",
  manager: "مدير فرعي",
  seller: "بائع",
  driver: "سائق",
  stock_keeper: "أمين مخزن",
};

const COLUMNS: Column<UserDto>[] = [
  {
    key: "username",
    header: "اسم المستخدم",
    render: (u) => <span className="font-mono text-sm" dir="ltr">{u.username}</span>,
  },
  {
    key: "name",
    header: "الاسم",
    render: (u) => u.name,
  },
  {
    key: "role",
    header: "الدور",
    render: (u) => ROLE_LABELS[u.role],
  },
  {
    key: "profit",
    header: "نسبة الأرباح",
    mobileHidden: true,
    align: "end",
    render: (u) => (u.profitSharePct > 0 ? `${u.profitSharePct}%` : "—"),
  },
  {
    key: "status",
    header: "الحالة",
    render: (u) => (u.active ? "نشط" : "معطَّل"),
  },
];

export default async function UsersPage() {
  await requireRole(undefined, ["pm", "gm"]);
  const users = await withRead(undefined, (db) => listActiveUsers(db));

  return (
    <PageShell
      title="المستخدمون"
      subtitle={`${users.length} مستخدم نشط`}
      actions={
        <Button disabled aria-disabled title="إنشاء مستخدم: Phase 2b">
          + مستخدم جديد
        </Button>
      }
    >
      <DataTable
        rows={users}
        columns={COLUMNS}
        rowKey={(u) => u.id}
        cardTitle={(u) => u.name}
        empty={{
          title: "لا مستخدمون نشطون بعد",
          description: "أضف أول مستخدم عبر «+ مستخدم جديد» (متاح في Phase 2b).",
        }}
      />
    </PageShell>
  );
}
