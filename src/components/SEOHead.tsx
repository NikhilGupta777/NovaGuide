import { Helmet } from "react-helmet-async";

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonical?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  tags?: string[];
  noIndex?: boolean;
}

const SITE_NAME = "DigitalHelp";
const DEFAULT_DESCRIPTION = "Free step-by-step guides for phones, computers, apps, social media, and more. Clear digital help for everyone.";

const SEOHead = ({
  title,
  description = DEFAULT_DESCRIPTION,
  canonical,
  type = "website",
  publishedTime,
  modifiedTime,
  tags,
  noIndex = false,
}: SEOHeadProps) => {
  const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Tech Guides & How-To Solutions`;
  const safeDescription = description.length > 160 ? description.slice(0, 157) + "..." : description;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={safeDescription} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {canonical && <link rel="canonical" href={canonical} />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={safeDescription} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
      {tags?.map((tag) => (
        <meta property="article:tag" content={tag} key={tag} />
      ))}

      {/* Twitter */}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={safeDescription} />
    </Helmet>
  );
};

export default SEOHead;
