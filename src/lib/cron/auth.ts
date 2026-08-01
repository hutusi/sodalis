import { timingSafeEqual } from "node:crypto";

/**
 * Authorizes an external scheduler hitting a cron route. True only when a
 * non-empty secret is configured AND the header is exactly `Bearer <secret>`
 * — an unset secret disables the route rather than opening it.
 */
export function isAuthorizedCron(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(token, expected);
}
