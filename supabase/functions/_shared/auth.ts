// Shared auth helper for edge functions.
// Standard pattern: verify_jwt = false in config.toml, then call requireUser()
// from each handler. Uses getClaims() with the anon key (ES256-compatible).
//
// Usage:
//   const authed = await requireUser(req, corsHeaders);
//   if (authed instanceof Response) return authed;
//   const { user, supabase } = authed;  // supabase = service-role client
//
//   // Optionally enforce operator:
//   const op = await requireOperator(authed, corsHeaders);
//   if (op instanceof Response) return op;

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export type AuthedContext = {
  user: { id: string; email?: string };
  token: string;
  supabase: SupabaseClient; // service-role client for DB work
};

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

export async function requireUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthedContext | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401, corsHeaders);
  }
  const token = auth.replace("Bearer ", "");

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data, error } = await supabaseAuth.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    console.error("getClaims failed:", error);
    return json({ error: "Invalid token", detail: error?.message }, 401, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  return {
    user: { id: data.claims.sub as string, email: data.claims.email as string | undefined },
    token,
    supabase,
  };
}

export async function requireOperator(
  ctx: AuthedContext,
  corsHeaders: Record<string, string>,
): Promise<AuthedContext | Response> {
  const { data: isOp, error } = await ctx.supabase.rpc("is_operator", { _user_id: ctx.user.id });
  if (error) return json({ error: "Role check failed", detail: error.message }, 500, corsHeaders);
  if (!isOp) return json({ error: "Operator only" }, 403, corsHeaders);
  return ctx;
}
