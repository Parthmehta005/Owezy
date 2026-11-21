/**
 * Where to send someone after sign-in. Comes from the URL (?next=...), so it
 * must only ever be a path on this site; anything else (another domain,
 * protocol-relative "//evil.com", backslash tricks) falls back to "/".
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  // Reject control characters, which some browsers strip, turning "/\t/evil.com" into "//evil.com".
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  try {
    const url = new URL(next, "http://placeholder.invalid");
    if (url.origin !== "http://placeholder.invalid") return "/";
    // Normalising "/..//evil.com" yields "//evil.com", so check again afterwards.
    if (url.pathname.startsWith("//")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

/** Routes that work without signing in. Everything else sends you to /login. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth/");
}
