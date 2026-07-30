import { RoleName } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: RoleName;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    role: RoleName;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: RoleName;
    uid?: string;
  }
}
