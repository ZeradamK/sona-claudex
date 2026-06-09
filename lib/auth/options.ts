import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/db/prisma";
import { generateAppleClientSecret } from "@/lib/auth/apple-secret";

const providers: NextAuthOptions["providers"] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    // Auto-link to an existing account with the same verified email (e.g. a
    // user who first signed in with Apple). Safe: Google returns email_verified.
    allowDangerousEmailAccountLinking: true,
    authorization: {
      params: {
        prompt: "consent",
        access_type: "offline",
        response_type: "code",
        scope:
          "openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar"
      }
    }
  })
];

// Sign in with Apple — co-equal identity for the Apple-acquisition posture.
// Added only when configured, so dev without an Apple Developer account still
// works. Promote Apple to the primary button at pitch time.
const appleClientSecret = generateAppleClientSecret();
if (appleClientSecret && process.env.APPLE_SERVICE_ID) {
  providers.push(
    AppleProvider({
      clientId: process.env.APPLE_SERVICE_ID,
      clientSecret: appleClientSecret,
      // Apple always returns email_verified: true; auto-link to a matching
      // Google account so the user has one Sona identity.
      allowDangerousEmailAccountLinking: true
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: "database" },
  pages: { signIn: "/sign-in" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string }).id = user.id;
      }
      return session;
    }
  }
};
