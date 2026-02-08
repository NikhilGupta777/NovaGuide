import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ArticleFeedbackProps {
  articleId: string;
}

const ArticleFeedback = ({ articleId }: ArticleFeedbackProps) => {
  const [submitted, setSubmitted] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(null);

  const handleFeedback = async (helpful: boolean) => {
    setChoice(helpful);
    setSubmitted(true);
    await supabase.from("article_feedback").insert({ article_id: articleId, helpful });
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 py-4 px-5 rounded-xl bg-muted/50 border border-border">
        <span className="text-sm text-muted-foreground">
          {choice ? "Glad it helped! 🎉" : "Thanks for letting us know. We'll improve this."}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 py-4 px-5 rounded-xl bg-muted/50 border border-border">
      <span className="text-sm font-medium text-foreground">Was this article helpful?</span>
      <div className="flex gap-2">
        <button
          onClick={() => handleFeedback(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <ThumbsUp className="h-4 w-4" /> Yes
        </button>
        <button
          onClick={() => handleFeedback(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-muted text-muted-foreground hover:bg-border transition-colors"
        >
          <ThumbsDown className="h-4 w-4" /> No
        </button>
      </div>
    </div>
  );
};

export default ArticleFeedback;
