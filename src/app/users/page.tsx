import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card } from "@/components/Badges";
import { CAN_MANAGE_USERS, RoleName } from "@/lib/roles";
import UsersAdmin from "./UsersAdmin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role as RoleName | undefined;

  if (!session?.user || !role || !CAN_MANAGE_USERS.includes(role)) {
    return (
      <Card title="Không có quyền truy cập">
        <p className="text-sm text-slate-500">Chỉ System Admin được quản lý người dùng (section 13).</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Quản lý người dùng</h1>
        <p className="text-sm text-slate-500">
          Tạo tài khoản cho nhân viên, đổi role, khoá/mở khoá truy cập, cấp lại mật khẩu tạm.
        </p>
      </div>
      <UsersAdmin currentUserId={session.user.id} />
    </div>
  );
}
