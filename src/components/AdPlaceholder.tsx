interface AdPlaceholderProps {
  type: "banner" | "inline" | "sidebar" | "footer";
  className?: string;
}

const sizeMap = {
  banner: { minHeight: "90px", label: "Banner Ad (728×90)" },
  inline: { minHeight: "250px", label: "In-Article Ad (300×250)" },
  sidebar: { minHeight: "600px", label: "Sidebar Ad (300×600)" },
  footer: { minHeight: "90px", label: "Footer Ad (728×90)" },
};

const AdPlaceholder = ({ type, className = "" }: AdPlaceholderProps) => {
  const config = sizeMap[type];

  return (
    <div
      className={`ad-placeholder ${className}`}
      style={{ minHeight: config.minHeight }}
      aria-hidden="true"
    >
      <span className="text-xs opacity-50">{config.label}</span>
    </div>
  );
};

export default AdPlaceholder;
