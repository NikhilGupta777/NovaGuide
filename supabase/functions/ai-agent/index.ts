import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { topic, categoryId } = await req.json();
    if (!topic) {
      return new Response(JSON.stringify({ error: "Topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("AI Agent: Starting article generation for topic:", topic);

    // Log agent start
    await serviceClient.from("agent_logs").insert({
      action: `Starting: "${topic}"`,
      status: "pending",
      details: { topic, categoryId },
    });

    // Fetch categories for context
    const { data: categories } = await serviceClient
      .from("categories")
      .select("id, name, slug")
      .order("sort_order");

    const categoryList = (categories || []).map((c) => `${c.name} (ID: ${c.id})`).join(", ");

    // Step 1: Research & generate article with AI
    const systemPrompt = `You are an expert tech writer for DigitalHelp, a beginner-friendly tech help website. 
You write clear, step-by-step guides that solve everyday digital problems.

AVAILABLE CATEGORIES: ${categoryList}

Your task: Write a complete, high-quality help article about the given topic.

IMPORTANT RULES:
- Write for complete beginners with zero tech knowledge
- Use simple, clear language — no jargon
- Follow this exact structure: Problem description → Step-by-step solution → Quick recap
- Each step should be numbered and have a clear heading
- Use **bold** for UI elements, buttons, menu items
- Include practical tips users need
- Keep paragraphs short (2-3 sentences max)
- Article should be 500-1000 words

You MUST respond using the generate_article function.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Write a complete help article about: "${topic}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_article",
              description: "Generate a structured help article with all required fields",
              parameters: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "SEO-friendly article title, clear and descriptive, under 70 chars",
                  },
                  slug: {
                    type: "string",
                    description: "URL-friendly slug, lowercase with hyphens, no special chars",
                  },
                  excerpt: {
                    type: "string",
                    description: "Brief 1-2 sentence summary for search results and previews",
                  },
                  content: {
                    type: "string",
                    description: "Full article content in Markdown format following the Problem → Steps → Recap structure",
                  },
                  category_id: {
                    type: "string",
                    description: "The UUID of the best matching category from the provided list",
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-6 relevant tags for the article",
                  },
                  read_time: {
                    type: "number",
                    description: "Estimated reading time in minutes",
                  },
                  seo_title: {
                    type: "string",
                    description: "SEO meta title under 60 characters",
                  },
                  seo_description: {
                    type: "string",
                    description: "SEO meta description under 160 characters",
                  },
                },
                required: ["title", "slug", "excerpt", "content", "category_id", "tags", "read_time"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_article" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        await serviceClient.from("agent_logs").insert({
          action: `Rate limited: "${topic}"`,
          status: "failed",
          details: { error: "Rate limit exceeded" },
        });
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI Agent: Got response from AI gateway");

    // Extract the generated article from tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("AI did not return a structured article");
    }

    const article = JSON.parse(toolCall.function.arguments);
    console.log("AI Agent: Parsed article:", article.title);

    // Use provided categoryId or AI-suggested one
    const finalCategoryId = categoryId || article.category_id;

    // Step 2: Save article as draft
    const { data: savedArticle, error: insertError } = await serviceClient
      .from("articles")
      .insert({
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        content: article.content,
        category_id: finalCategoryId,
        status: "draft",
        featured: false,
        read_time: article.read_time || 3,
        tags: article.tags || [],
        seo_title: article.seo_title || null,
        seo_description: article.seo_description || null,
        ai_generated: true,
        author_id: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to save article:", insertError);
      // If slug conflict, append timestamp
      if (insertError.message?.includes("unique")) {
        const uniqueSlug = `${article.slug}-${Date.now()}`;
        const { data: retryArticle, error: retryError } = await serviceClient
          .from("articles")
          .insert({
            title: article.title,
            slug: uniqueSlug,
            excerpt: article.excerpt,
            content: article.content,
            category_id: finalCategoryId,
            status: "draft",
            featured: false,
            read_time: article.read_time || 3,
            tags: article.tags || [],
            seo_title: article.seo_title || null,
            seo_description: article.seo_description || null,
            ai_generated: true,
            author_id: user.id,
          })
          .select()
          .single();

        if (retryError) throw retryError;

        await serviceClient.from("agent_logs").insert({
          action: `Completed: "${article.title}"`,
          status: "completed",
          article_id: retryArticle.id,
          details: { slug: uniqueSlug, tags: article.tags },
        });

        return new Response(JSON.stringify(retryArticle), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertError;
    }

    // Log success
    await serviceClient.from("agent_logs").insert({
      action: `Completed: "${article.title}"`,
      status: "completed",
      article_id: savedArticle.id,
      details: { slug: article.slug, tags: article.tags },
    });

    console.log("AI Agent: Article saved successfully:", savedArticle.id);

    return new Response(JSON.stringify(savedArticle), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("AI Agent error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
