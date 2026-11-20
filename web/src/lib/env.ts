import { z } from "zod";

// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced
// literally (not via a dynamic process.env[key] lookup).
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

let cached: z.infer<typeof schema> | undefined;

/** Validated public env vars. Throws a readable error if any are missing. */
export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid env vars: ${missing}. Copy web/.env.example to web/.env.local and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}
