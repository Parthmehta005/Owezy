// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced
// literally (not via a dynamic process.env[key] lookup).
//
// Checked by hand rather than with zod: this file is part of the browser
// bundle (via the Supabase client), and zod alone would add ~60 kB there.

export interface PublicEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
}

let cached: PublicEnv | undefined;

function isUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Validated public env vars. Throws a readable error if any are missing. */
export function env(): PublicEnv {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const missing = [!isUrl(url) && "NEXT_PUBLIC_SUPABASE_URL", !key && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter(Boolean);
  if (missing.length > 0 || !isUrl(url) || !key) {
    throw new Error(`Missing or invalid env vars: ${missing.join(", ")}. Copy web/.env.example to web/.env.local and fill it in.`);
  }
  cached = { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key };
  return cached;
}
