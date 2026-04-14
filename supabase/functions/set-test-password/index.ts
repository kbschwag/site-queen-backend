import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const user = users.find((u: any) => u.email === "tbellschwag@gmail.com");
  if (!user) return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password: "SiteQueen2025!" });
  return new Response(JSON.stringify(error ? { error: error.message } : { success: true }));
});
