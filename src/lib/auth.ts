import { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { RoleName } from "@/lib/roles";
import { checkRateLimit } from "@/lib/rateLimit";

// 5 attempts / 5 minutes per email — slows down password-guessing without
// needing a CAPTCHA or account-lockout flow for this stage.
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_WINDOW_MS = 5 * 60_000;

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const rate = checkRateLimit(`login:${credentials.email.toLowerCase()}`, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
        if (!rate.allowed) {
          throw new Error("Quá nhiều lần đăng nhập sai — thử lại sau vài phút.");
        }

        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user || user.disabled) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role as RoleName };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: RoleName }).role;
        token.uid = user.id;
      }
      // Re-check on every request (not just at sign-in) so a role change or
      // a disable takes effect immediately instead of waiting for the JWT
      // to expire — this app is small enough that the extra DB read per
      // request is cheap, and requireRole() below refuses disabled users
      // even if this check somehow gets skipped.
      if (token.uid) {
        const current = await prisma.user.findUnique({ where: { id: token.uid as string } });
        token.role = current ? (current.role as RoleName) : token.role;
        token.disabled = !current || current.disabled;
        token.mustChangePassword = Boolean(current?.mustChangePassword);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: RoleName }).role = token.role as RoleName;
        (session.user as { id?: string }).id = token.uid as string;
        (session.user as { disabled?: boolean }).disabled = Boolean(token.disabled);
        (session.user as { mustChangePassword?: boolean }).mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
};
