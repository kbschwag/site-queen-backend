// Returns the banner JS that runs on the demo site. Embedded as <script src=...></script>.
// The script calls track-prospect-view and injects the banner DOM if the prospect is still active.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=60",
};

serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const cid = url.searchParams.get("cid") || "";
  const projectRef = Deno.env.get("SUPABASE_URL")!.replace("https://", "").split(".")[0];
  const trackUrl = `https://${projectRef}.functions.supabase.co/track-prospect-view?cid=${encodeURIComponent(cid)}`;

  const js = `
(function(){
  if (!${JSON.stringify(cid)}) return;
  fetch(${JSON.stringify(trackUrl)}, { method: "POST" })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if (!data || !data.active) return;
      var wrap = document.createElement("div");
      wrap.id = "sq-prospect-banner";
      wrap.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#534AB7;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:14px 20px;display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap;box-shadow:0 2px 12px rgba(0,0,0,.18);font-size:14px;";
      var label = document.createElement("span");
      label.innerHTML = "Sample preview built for <b>" + escapeHtml(data.business_name || "your business") + "</b> by SiteQueen";
      var claim = document.createElement("a");
      claim.href = data.claim_url;
      claim.textContent = "Claim this site — $39/month →";
      claim.style.cssText = "background:#fff;color:#534AB7;padding:9px 18px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;";
      var call = document.createElement("a");
      call.href = data.call_url;
      call.textContent = "Have questions? Schedule a 10-minute call →";
      call.style.cssText = "color:#fff;text-decoration:underline;font-size:13px;opacity:.92;";
      wrap.appendChild(label);
      wrap.appendChild(claim);
      wrap.appendChild(call);
      document.body.appendChild(wrap);
      // push page down so banner doesn't cover hero
      document.body.style.paddingTop = (wrap.offsetHeight + 4) + "px";
    })
    .catch(function(){});
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
})();
`;
  return new Response(js, { headers: corsHeaders });
});
