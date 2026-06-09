import jwt from "jsonwebtoken";

/**
 * Sign in with Apple requires the OAuth "client secret" to be a short-lived
 * ES256 JWT signed with your Sign-in-with-Apple key (.p8). We regenerate it
 * on each cold start (Apple caps the lifetime at 180 days), so there is no
 * manual rotation ritual.
 *
 * Returns `undefined` when Apple isn't configured, so the provider is simply
 * omitted — mirroring how the rest of Sona degrades gracefully without keys.
 */
export function generateAppleClientSecret(): string | undefined {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const serviceId = process.env.APPLE_SERVICE_ID;
  const privateKeyRaw = process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !keyId || !serviceId || !privateKeyRaw) return undefined;

  // .p8 newlines are usually \n-escaped when stored in an env var.
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    keyid: keyId,
    issuer: teamId,
    audience: "https://appleid.apple.com",
    subject: serviceId,
    expiresIn: "180d"
  });
}
