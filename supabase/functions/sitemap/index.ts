import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/xml",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const siteUrl = "https://digitalhelp.lovable.app";

  const { data: articles } = await supabase
    .from("articles")
    .select("slug, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, updated_at")
    .order("sort_order", { ascending: true });

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${siteUrl}/categories</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${siteUrl}/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
  <url><loc>${siteUrl}/contact</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`;

  for (const cat of categories || []) {
    xml += `\n  <url><loc>${siteUrl}/category/${cat.slug}</loc><lastmod>${cat.updated_at?.split("T")[0] || ""}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
  }

  for (const art of articles || []) {
    xml += `\n  <url><loc>${siteUrl}/article/${art.slug}</loc><lastmod>${art.updated_at?.split("T")[0] || ""}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`;
  }

  xml += "\n</urlset>";

  return new Response(xml, { headers: corsHeaders });
});
