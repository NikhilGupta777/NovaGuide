import { Smartphone, Tablet, Monitor, AppWindow, Youtube, Share2, KeyRound, FileText, Lightbulb, type LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Smartphone,
  Tablet,
  Monitor,
  AppWindow,
  Youtube,
  Share2,
  KeyRound,
  FileText,
  Lightbulb,
};

const colorMap: Record<string, { color: string; bg: string }> = {
  Smartphone: { color: "text-cat-phone", bg: "bg-cat-phone/10" },
  Tablet: { color: "text-cat-tablet", bg: "bg-cat-tablet/10" },
  Monitor: { color: "text-cat-desktop", bg: "bg-cat-desktop/10" },
  AppWindow: { color: "text-cat-apps", bg: "bg-cat-apps/10" },
  Youtube: { color: "text-cat-youtube", bg: "bg-cat-youtube/10" },
  Share2: { color: "text-cat-social", bg: "bg-cat-social/10" },
  KeyRound: { color: "text-cat-account", bg: "bg-cat-account/10" },
  FileText: { color: "text-cat-files", bg: "bg-cat-files/10" },
  Lightbulb: { color: "text-cat-howto", bg: "bg-cat-howto/10" },
};

export function getIconComponent(iconName: string): LucideIcon {
  return iconMap[iconName] || Lightbulb;
}

export function getCategoryColors(iconName: string) {
  return colorMap[iconName] || { color: "text-cat-howto", bg: "bg-cat-howto/10" };
}
