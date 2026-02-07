import { Smartphone, Tablet, Monitor, AppWindow, Youtube, Share2, KeyRound, FileText, Lightbulb } from "lucide-react";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  bgClass: string;
  articleCount: number;
}

export const categories: Category[] = [
  {
    id: "phone",
    name: "Phone & Mobile",
    slug: "phone-mobile",
    description: "Fix common phone issues, settings, and mobile tips for Android & iPhone",
    icon: Smartphone,
    colorClass: "text-cat-phone",
    bgClass: "bg-cat-phone/10",
    articleCount: 45,
  },
  {
    id: "tablet",
    name: "Tablets",
    slug: "tablets",
    description: "iPad, Android tablets, setup guides and troubleshooting",
    icon: Tablet,
    colorClass: "text-cat-tablet",
    bgClass: "bg-cat-tablet/10",
    articleCount: 28,
  },
  {
    id: "desktop",
    name: "Desktop & Computer",
    slug: "desktop-computer",
    description: "Windows, Mac, and Linux guides for all your computer needs",
    icon: Monitor,
    colorClass: "text-cat-desktop",
    bgClass: "bg-cat-desktop/10",
    articleCount: 62,
  },
  {
    id: "apps",
    name: "Apps & Software",
    slug: "apps-software",
    description: "How to use popular apps, install software, and fix app issues",
    icon: AppWindow,
    colorClass: "text-cat-apps",
    bgClass: "bg-cat-apps/10",
    articleCount: 53,
  },
  {
    id: "youtube",
    name: "YouTube",
    slug: "youtube",
    description: "YouTube tips, channel management, and video solutions",
    icon: Youtube,
    colorClass: "text-cat-youtube",
    bgClass: "bg-cat-youtube/10",
    articleCount: 34,
  },
  {
    id: "social",
    name: "Social Media",
    slug: "social-media",
    description: "Facebook, Instagram, TikTok, X, and more social media help",
    icon: Share2,
    colorClass: "text-cat-social",
    bgClass: "bg-cat-social/10",
    articleCount: 41,
  },
  {
    id: "account",
    name: "Accounts & Login",
    slug: "accounts-login",
    description: "Password recovery, account security, and login troubleshooting",
    icon: KeyRound,
    colorClass: "text-cat-account",
    bgClass: "bg-cat-account/10",
    articleCount: 22,
  },
  {
    id: "files",
    name: "Files & Documents",
    slug: "files-documents",
    description: "PDF, file conversion, storage, and document management",
    icon: FileText,
    colorClass: "text-cat-files",
    bgClass: "bg-cat-files/10",
    articleCount: 19,
  },
  {
    id: "howto",
    name: "General How-To",
    slug: "general-how-to",
    description: "Everyday tech tips, quick fixes, and helpful digital guides",
    icon: Lightbulb,
    colorClass: "text-cat-howto",
    bgClass: "bg-cat-howto/10",
    articleCount: 37,
  },
];

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}
