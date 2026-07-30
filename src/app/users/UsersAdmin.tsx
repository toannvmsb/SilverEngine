"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/Badges";
import { ROLES, ROLE_LABELS, RoleName } from "@/lib/roles";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  branchId: string | null;
  disabled: boolean;
  createdAt: string;
}

export default function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleName>("BRANCH_VIEWER");
  const [branchId, setBranchId] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/users");
    if (!res.ok) {
      setError("Không tải được danh sách người dùng.");
      return;
    }
    const body = await res.json();
    setUsers(body.users);
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role, branchId: branchId || undefined }),
    });
    const body = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(body.error === "EMAIL_ALREADY_EXISTS" ? "Email đã tồn tại." : body.error === "FORBIDDEN" ? "Không có quyền." : "Lỗi tạo tài khoản.");
      return;
    }
    setMessage(`Đã tạo tài khoản ${body.email}. Mật khẩu tạm (chỉ hiện 1 lần, gửi cho nhân viên qua kênh an toàn): ${body.temp_password}`);
    setEmail("");
    setName("");
    setBranchId("");
    load();
  }

  async function toggleDisabled(u: UserRow) {
    setError(null);
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: !u.disabled }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "CANNOT_DISABLE_SELF" ? "Không thể tự khoá tài khoản của chính mình." : "Lỗi.");
      return;
    }
    load();
  }

  async function changeRole(u: UserRow, newRole: RoleName) {
    setError(null);
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      setError("Lỗi đổi role.");
      return;
    }
    load();
  }

  async function resetPassword(u: UserRow) {
    if (!confirm(`Cấp lại mật khẩu tạm cho ${u.email}?`)) return;
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/users/${u.id}/reset-password`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError("Lỗi cấp lại mật khẩu.");
      return;
    }
    setMessage(`Mật khẩu tạm mới cho ${u.email} (chỉ hiện 1 lần): ${body.temp_password}`);
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700 break-all">{message}</p>}

      <Card title="Tạo tài khoản mới">
        <form onSubmit={createUser} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Họ tên</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as RoleName)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Chi nhánh (tuỳ chọn)</label>
            <input value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="vd HN01" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="sm:col-span-4">
            <button type="submit" disabled={creating} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {creating ? "Đang tạo..." : "Tạo tài khoản"}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Danh sách người dùng">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2">Email</th>
              <th className="py-2">Họ tên</th>
              <th className="py-2">Role</th>
              <th className="py-2">Chi nhánh</th>
              <th className="py-2">Trạng thái</th>
              <th className="py-2">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.name}</td>
                <td className="py-2">
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value as RoleName)} className="rounded border border-slate-300 px-1 py-0.5 text-xs">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-xs text-slate-500">{u.branchId ?? "—"}</td>
                <td className="py-2">
                  {u.disabled ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Đã khoá</span>
                  ) : (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Hoạt động</span>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => toggleDisabled(u)}
                      disabled={u.id === currentUserId}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50"
                    >
                      {u.disabled ? "Mở khoá" : "Khoá"}
                    </button>
                    <button onClick={() => resetPassword(u)} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100">
                      Cấp lại MK
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users && users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  Chưa có người dùng.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
