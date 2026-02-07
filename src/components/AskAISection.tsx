import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, Loader2, BookOpen, ArrowRight, Bot, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendedArticles?: { title: string; slug: string }[];
  articleGenerationTriggered?: boolean;
}

const AskAISection = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messagesEndRef.current && messages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Auto-reset cooldown
  useEffect(() => {
    if (!cooldownUntil) return;
    const remaining = cooldownUntil - Date.now();
    if (remaining <= 0) {
      setCooldownUntil(null);
      setErrorCount(0);
      return;
    }
    const timer = setTimeout(() => {
      setCooldownUntil(null);
      setErrorCount(0);
    }, remaining);
    return () => clearTimeout(timer);
  }, [cooldownUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isLoading) return;

    // Rate limiting: max 3 consecutive errors before 30s cooldown
    if (errorCount >= 3) {
      if (!cooldownUntil) {
        setCooldownUntil(Date.now() + 30_000);
      }
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: "I'm having trouble right now. Please wait about 30 seconds before trying again.",
      }]);
      return;
    }

    setHasInteracted(true);
    setInput("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-ask", {
        body: { question },
      });

      // supabase.functions.invoke puts non-2xx responses in error
      if (error) {
        // Try to extract structured error from response
        const errorBody = typeof error === "object" && "context" in error
          ? error.context
          : null;

        if (errorBody?.status === 429) {
          throw new Error("Our AI is currently busy. Please wait a moment before trying again.");
        }
        throw new Error(error.message || "Something went wrong.");
      }

      // Check if edge function returned an error in the data
      if (data?.error) {
        throw new Error(data.error);
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer || "I couldn't find an answer right now. Please try again.",
        recommendedArticles: data.recommendedArticles || [],
        articleGenerationTriggered: data.articleGenerationTriggered,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setErrorCount(0);
    } catch (err) {
      console.error("Ask AI error:", err);
      setErrorCount((prev) => prev + 1);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: err instanceof Error
          ? err.message
          : "Sorry, I'm having trouble right now. Please try again in a moment.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const suggestions = [
    "How to take a screenshot?",
    "Reset WiFi password",
    "Clear browser cache",
    "How to update my phone?",
  ];

  const isCoolingDown = cooldownUntil !== null && Date.now() < cooldownUntil;

  return (
    <section className="container py-14 md:py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl mx-auto"
      >
        {/* Section Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-4"
          >
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-semibold text-accent">AI-Powered Help</span>
          </motion.div>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Ask AI Anything
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Got a tech question? Ask our AI — it'll find relevant guides from our library or answer directly.
          </p>
        </div>

        {/* Chat Container */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Messages Area */}
          <div
            className={`transition-all duration-300 ${
              hasInteracted ? "h-[360px]" : "h-auto"
            } overflow-y-auto`}
          >
            {!hasInteracted ? (
              <div className="p-6 pb-3">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Hi! I can help you with any tech question. Try one of these:
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="text-xs px-3.5 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors border border-border"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5"
                            : "space-y-3"
                        }`}
                      >
                        {msg.role === "user" ? (
                          <p className="text-sm">{msg.content}</p>
                        ) : (
                          <>
                            <div className="bg-muted/50 rounded-2xl rounded-tl-md px-4 py-3">
                              <MarkdownLite content={msg.content} />
                            </div>
                            {msg.recommendedArticles && msg.recommendedArticles.length > 0 && (
                              <div className="space-y-2">
                                {msg.recommendedArticles.map((article) => (
                                  <Link
                                    key={article.slug}
                                    to={`/article/${article.slug}`}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors group"
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <BookOpen className="h-4 w-4 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                        {article.title}
                                      </p>
                                      <p className="text-xs text-muted-foreground">Read full guide</p>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                                  </Link>
                                ))}
                              </div>
                            )}
                            {msg.articleGenerationTriggered && (
                              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
                                <Sparkles className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                                <p className="text-xs text-accent">
                                  We're creating a detailed guide on this topic. Check back soon!
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="bg-muted/50 rounded-2xl rounded-tl-md px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Searching & thinking...</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isCoolingDown ? "Please wait before sending another message..." : "Ask any tech question..."}
                disabled={isLoading || isCoolingDown}
                className="flex-1 px-4 py-2.5 text-sm bg-muted/50 rounded-xl outline-none text-foreground placeholder:text-muted-foreground disabled:opacity-60 border border-transparent focus:border-primary/30 transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || isCoolingDown}
                className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

// ── Lightweight markdown renderer for chat ─────────────────────────────
const MarkdownLite = ({ content }: { content: string }) => {
  const lines = content.split("\n");

  return (
    <div className="text-sm text-foreground/90 space-y-1.5 leading-relaxed">
      {lines.map((line, i) => {
        const boldLine = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
        const italicLine = boldLine.replace(/\*(.*?)\*/g, '<em class="text-muted-foreground">$1</em>');
        const linkedLine = italicLine.replace(
          /\[(.*?)\]\((\/article\/[^\)]+)\)/g,
          '<a href="$2" class="text-primary hover:underline font-medium">$1</a>'
        );

        if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
          return (
            <div key={i} className="pl-3 flex gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: linkedLine.replace(/^[-•]\s*/, "") }} />
            </div>
          );
        }

        if (line.trim() === "") return <div key={i} className="h-1" />;

        return <p key={i} dangerouslySetInnerHTML={{ __html: linkedLine }} />;
      })}
    </div>
  );
};

export default AskAISection;
