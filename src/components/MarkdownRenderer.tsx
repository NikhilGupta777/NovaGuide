import React from "react";

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = "";
  let inOrderedList = false;
  let orderedListItems: React.ReactNode[] = [];
  let inUnorderedList = false;
  let unorderedListItems: React.ReactNode[] = [];

  const flushOrderedList = () => {
    if (orderedListItems.length > 0) {
      elements.push(
        <ol key={`ol-${elements.length}`} className="list-decimal pl-6 mb-4 space-y-2 text-foreground">
          {orderedListItems}
        </ol>
      );
      orderedListItems = [];
      inOrderedList = false;
    }
  };

  const flushUnorderedList = () => {
    if (unorderedListItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc pl-6 mb-4 space-y-2 text-foreground">
          {unorderedListItems}
        </ul>
      );
      unorderedListItems = [];
      inUnorderedList = false;
    }
  };

  const renderInline = (text: string): React.ReactNode[] => {
    // Process bold, inline code, italic, and links
    const parts: React.ReactNode[] = [];
    // Regex to match **bold**, `code`, *italic*, [text](url)
    const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(<strong key={`b-${match.index}`} className="font-semibold">{token.slice(2, -2)}</strong>);
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(
          <code key={`c-${match.index}`} className="px-1.5 py-0.5 bg-muted rounded text-sm font-mono">
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(<em key={`i-${match.index}`}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith("[")) {
        const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          parts.push(
            <a
              key={`a-${match.index}`}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {linkMatch[1]}
            </a>
          );
        }
      }
      lastIndex = match.index + token.length;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts.length ? parts : [text];
  };

  lines.forEach((line, index) => {
    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        flushOrderedList();
        flushUnorderedList();
        elements.push(
          <pre key={`code-${index}`} className="bg-muted rounded-lg p-4 overflow-x-auto mb-4 text-sm font-mono">
            <code>{codeContent.trim()}</code>
          </pre>
        );
        codeContent = "";
        inCodeBlock = false;
      } else {
        flushOrderedList();
        flushUnorderedList();
        inCodeBlock = true;
      }
      return;
    }
    if (inCodeBlock) {
      codeContent += line + "\n";
      return;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      flushOrderedList();
      flushUnorderedList();
      const quoteText = line.replace(/^>\s*/, "");
      elements.push(
        <blockquote
          key={`bq-${index}`}
          className="border-l-4 border-primary/30 pl-4 py-2 mb-4 text-muted-foreground italic bg-muted/30 rounded-r-lg"
        >
          {renderInline(quoteText)}
        </blockquote>
      );
      return;
    }

    // Callouts (💡, ⚠️, ✅)
    if (line.match(/^(💡|⚠️|✅|🔒|📌)/)) {
      flushOrderedList();
      flushUnorderedList();
      const isWarning = line.startsWith("⚠️");
      elements.push(
        <div
          key={`callout-${index}`}
          className={`flex gap-3 p-4 rounded-lg mb-4 ${
            isWarning
              ? "bg-destructive/10 border border-destructive/20"
              : "bg-primary/5 border border-primary/10"
          }`}
        >
          <span className="text-lg flex-shrink-0 leading-relaxed">{line.slice(0, 2)}</span>
          <p className="text-foreground text-sm leading-relaxed">{renderInline(line.slice(2).trim())}</p>
        </div>
      );
      return;
    }

    // Images
    if (line.match(/^!\[.*\]\(.*\)$/)) {
      flushOrderedList();
      flushUnorderedList();
      const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        elements.push(
          <figure key={`img-${index}`} className="mb-6">
            <img
              src={imgMatch[2]}
              alt={imgMatch[1]}
              className="rounded-lg w-full"
              loading="lazy"
            />
            {imgMatch[1] && (
              <figcaption className="text-xs text-muted-foreground text-center mt-2">{imgMatch[1]}</figcaption>
            )}
          </figure>
        );
      }
      return;
    }

    // Headings
    const makeId = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (line.startsWith("# ") && !line.startsWith("## ")) {
      flushOrderedList();
      flushUnorderedList();
      const text = line.replace("# ", "");
      elements.push(
        <h1 key={index} id={makeId(text)} className="text-3xl font-bold mt-10 mb-5 text-foreground scroll-mt-20">
          {renderInline(text)}
        </h1>
      );
      return;
    }
    if (line.startsWith("## ")) {
      flushOrderedList();
      flushUnorderedList();
      const text = line.replace("## ", "");
      elements.push(
        <h2 key={index} id={makeId(text)} className="text-2xl font-bold mt-8 mb-4 text-foreground scroll-mt-20">
          {renderInline(text)}
        </h2>
      );
      return;
    }
    if (line.startsWith("### ")) {
      flushOrderedList();
      flushUnorderedList();
      const text = line.replace("### ", "");
      elements.push(
        <h3 key={index} id={makeId(text)} className="text-xl font-semibold mt-6 mb-3 text-foreground scroll-mt-20">
          {renderInline(text)}
        </h3>
      );
      return;
    }
    if (line.startsWith("#### ")) {
      flushOrderedList();
      flushUnorderedList();
      const text = line.replace("#### ", "");
      elements.push(
        <h4 key={index} id={makeId(text)} className="text-lg font-semibold mt-5 mb-2 text-foreground scroll-mt-20">
          {renderInline(text)}
        </h4>
      );
      return;
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      flushOrderedList();
      flushUnorderedList();
      elements.push(<hr key={index} className="border-border my-8" />);
      return;
    }

    // Ordered list items (1. 2. etc.)
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      flushUnorderedList();
      inOrderedList = true;
      orderedListItems.push(
        <li key={`oli-${index}`} className="text-foreground leading-relaxed">
          {renderInline(olMatch[1])}
        </li>
      );
      return;
    }

    // Unordered list items
    if (line.match(/^[-*]\s+/)) {
      flushOrderedList();
      inUnorderedList = true;
      unorderedListItems.push(
        <li key={`uli-${index}`} className="text-foreground leading-relaxed">
          {renderInline(line.replace(/^[-*]\s+/, ""))}
        </li>
      );
      return;
    }

    // Empty line — flush lists
    if (line.trim() === "") {
      flushOrderedList();
      flushUnorderedList();
      return;
    }

    // Regular paragraph
    flushOrderedList();
    flushUnorderedList();
    elements.push(
      <p key={index} className="mb-4 text-foreground leading-relaxed">
        {renderInline(line)}
      </p>
    );
  });

  // Flush remaining lists
  flushOrderedList();
  flushUnorderedList();

  return <div className="prose-article">{elements}</div>;
};

export default MarkdownRenderer;
