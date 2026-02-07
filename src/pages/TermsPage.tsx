import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import SEOHead from "@/components/SEOHead";

const TermsPage = () => {
  return (
    <Layout>
      <SEOHead
        title="Terms of Use"
        description="Read DigitalHelp's Terms of Use. Understand the rules and guidelines for using our website and content."
      />
      <div className="container py-12 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Terms of Use</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

          <div className="prose-article space-y-6">
            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">1. Acceptance of Terms</h2>
              <p className="text-foreground leading-relaxed mb-4">
                By accessing and using DigitalHelp ("the Website"), you accept and agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use our website.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">2. Use of Content</h2>
              <p className="text-foreground leading-relaxed mb-4">
                All content on DigitalHelp, including articles, guides, images, and other materials, is provided for informational and educational purposes only. You may:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-foreground">
                <li>Access and read content for personal, non-commercial use</li>
                <li>Share links to our articles on social media or other websites</li>
                <li>Print articles for personal reference</li>
              </ul>
              <p className="text-foreground leading-relaxed mt-4 mb-4">You may not:</p>
              <ul className="list-disc pl-6 space-y-2 text-foreground">
                <li>Reproduce, distribute, or republish our content without permission</li>
                <li>Use our content for commercial purposes without authorization</li>
                <li>Remove copyright notices or attributions from any content</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">3. Disclaimer</h2>
              <p className="text-foreground leading-relaxed mb-4">
                The information provided on DigitalHelp is for general guidance only. While we strive for accuracy, we make no warranties or guarantees about the completeness, reliability, or accuracy of any content. Following our guides is at your own risk. We are not responsible for any damage to your devices, data loss, or other issues that may arise from following our instructions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">4. AI-Generated Content</h2>
              <p className="text-foreground leading-relaxed mb-4">
                Some content on our website is created with the assistance of artificial intelligence. While AI-generated articles undergo quality review, they may occasionally contain inaccuracies. We encourage users to verify critical steps, especially those involving system settings, data deletion, or security-related actions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">5. Third-Party Links</h2>
              <p className="text-foreground leading-relaxed mb-4">
                Our website may contain links to third-party websites or services. We are not responsible for the content, privacy policies, or practices of any third-party sites. Accessing these links is at your own discretion and risk.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">6. Advertising</h2>
              <p className="text-foreground leading-relaxed mb-4">
                DigitalHelp displays advertisements through Google AdSense. These ads are served by third parties and are subject to their own terms and privacy policies. The presence of an advertisement does not imply our endorsement of the advertised product or service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">7. Intellectual Property</h2>
              <p className="text-foreground leading-relaxed mb-4">
                All trademarks, logos, and brand names mentioned in our articles belong to their respective owners. DigitalHelp is not affiliated with or endorsed by any of the brands, companies, or products mentioned in our content unless explicitly stated.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">8. Limitation of Liability</h2>
              <p className="text-foreground leading-relaxed mb-4">
                To the fullest extent permitted by law, DigitalHelp shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the website or reliance on any content provided.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">9. Modifications</h2>
              <p className="text-foreground leading-relaxed mb-4">
                We reserve the right to modify these Terms of Use at any time. Continued use of the website after changes constitutes acceptance of the updated terms. We encourage you to review this page periodically.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">10. Contact</h2>
              <p className="text-foreground leading-relaxed mb-4">
                If you have questions about these Terms of Use, please reach out through our{" "}
                <a href="/contact" className="text-primary hover:underline">Contact page</a>.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default TermsPage;
