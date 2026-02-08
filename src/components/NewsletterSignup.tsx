import { useState } from "react";
import { Mail, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface NewsletterSignupProps {
  variant?: "inline" | "footer";
}

const NewsletterSignup = ({ variant = "inline" }: NewsletterSignupProps) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    const { error } = await supabase.from("email_subscribers").insert({ email: email.trim() });
    if (error) {
      if (error.code === "23505") {
        setStatus("success"); // already subscribed, treat as success
      } else {
        setErrorMsg("Something went wrong. Please try again.");
        setStatus("error");
      }
    } else {
      setStatus("success");
    }
  };

  if (status === "success") {
    return (
      <div className={`flex items-center gap-2 ${variant === "footer" ? "justify-center" : ""}`}>
        <CheckCircle className="h-5 w-5 text-primary" />
        <span className="text-sm text-foreground font-medium">You're subscribed! 🎉</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 ${variant === "footer" ? "max-w-sm mx-auto" : ""}`}>
      <div className="relative flex-1">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="email"
          required
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
      </button>
      {status === "error" && <p className="text-xs text-destructive mt-1">{errorMsg}</p>}
    </form>
  );
};

export default NewsletterSignup;
