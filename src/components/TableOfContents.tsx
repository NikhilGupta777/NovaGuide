import { useState, useEffect } from "react";
import { List } from "lucide-react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
}

const TableOfContents = ({ content }: TableOfContentsProps) => {
  const [activeId, setActiveId] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const headings: TocItem[] = content
    .split("\n")
    .filter((line) => /^#{2,3}\s/.test(line))
    .map((line) => {
      const level = line.startsWith("### ") ? 3 : 2;
      const text = line.replace(/^#{2,3}\s+/, "");
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return { id, text, level };
    });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );

    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-5 sticky top-20">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left"
      >
        <List className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">Table of Contents</h3>
      </button>
      {!collapsed && (
        <nav className="mt-3 space-y-0.5">
          {headings.map((h) => (
            <a
              key={h.id}
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`block text-sm py-1 transition-colors ${
                h.level === 3 ? "pl-4" : "pl-0"
              } ${
                activeId === h.id
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {h.text}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
};

export default TableOfContents;
