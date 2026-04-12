import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { changeRequestId } = await req.json();
    if (!changeRequestId) {
      return new Response(JSON.stringify({ error: "changeRequestId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: cr, error } = await supabase
      .from("change_requests")
      .select("*")
      .eq("id", changeRequestId)
      .single();

    if (error || !cr) {
      return new Response(JSON.stringify({ error: "Change request not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a website change request classifier. Analyze the request and determine:
1. complexity: "simple" (text/image swap, color change, minor tweak) or "complex" (layout change, new section, functionality)
2. category: one of "text_change", "image_change", "color_change", "layout_change", "new_feature", "bug_fix", "other"
3. summary: A brief admin-friendly summary of what needs to be done
4. auto_completable: true if the change is trivially simple (e.g., update phone number, fix typo)`,
          },
          { role: "user", content: `Change request: "${cr.request_text}"` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_request",
            description: "Classify a website change request",
            parameters: {
              type: "object",
              properties: {
                complexity: { type: "string", enum: ["simple", "complex"] },
                category: { type: "string", enum: ["text_change", "image_change", "color_change", "layout_change", "new_feature", "bug_fix", "other"] },
                summary: { type: "string" },
                auto_completable: { type: "boolean" },
              },
              required: ["complexity", "category", "summary", "auto_completable"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_request" } },
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI error:", aiResponse.status, await aiResponse.text());
      await supabase.from("change_requests").update({
        ai_processed: true,
        admin_notes: "AI classification failed - needs manual review",
      }).eq("id", changeRequestId);
      return new Response(JSON.stringify({ classified: false, fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let classification = { complexity: "complex", category: "other", summary: "Needs review", auto_completable: false };

    if (toolCall?.function?.arguments) {
      classification = JSON.parse(toolCall.function.arguments);
    }

    const updateData: Record<string, unknown> = {
      ai_processed: true,
      admin_notes: `[AI] ${classification.complexity.toUpperCase()} | ${classification.category} | ${classification.summary}`,
    };

    if (classification.auto_completable) {
      updateData.status = "completed";
      updateData.completed_at = new Date().toISOString();
    } else if (classification.complexity === "simple") {
      updateData.status = "in_progress";
    }

    await supabase.from("change_requests").update(updateData).eq("id", changeRequestId);

    // Update client's usage count
    const { data: client } = await supabase
      .from("clients")
      .select("updates_used_this_month")
      .eq("id", cr.client_id)
      .single();

    if (client) {
      await supabase.from("clients").update({
        updates_used_this_month: (client.updates_used_this_month || 0) + 1,
      }).eq("id", cr.client_id);
    }

    return new Response(JSON.stringify({ classification }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-change-request error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
