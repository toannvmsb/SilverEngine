import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Tài khoản của tôi</h1>
        <p className="text-sm text-slate-500">
          {session?.user?.name} · {session?.user?.email}
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
