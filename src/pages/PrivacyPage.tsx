import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import SEOHead from "@/components/SEOHead";

const PrivacyPage = () => {
  return (
    <Layout>
      <SEOHead
        title="Privacy Policy"
        description="Read DigitalHelp's Privacy Policy. Learn how we collect, use, and protect your data when you use our website."
      />
      <div className="container py-12 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

          <div className="prose-article space-y-6">
            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">1. Introduction</h2>
              <p className="text-foreground leading-relaxed mb-4">
                Welcome to DigitalHelp ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your data when you visit our website.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">2. Information We Collect</h2>
              <p className="text-foreground leading-relaxed mb-4">We may collect the following types of information:</p>
              <ul className="list-disc pl-6 space-y-2 text-foreground">
                <li><strong className="font-semibold">Usage Data:</strong> Information about how you use our website, including pages visited, time spent on pages, and search queries.</li>
                <li><strong className="font-semibold">Device Information:</strong> Browser type, operating system, device type, and screen resolution.</li>
                <li><strong className="font-semibold">Cookies:</strong> Small data files stored on your device to improve your browsing experience.</li>
                <li><strong className="font-semibold">Contact Information:</strong> If you contact us through our contact form, we collect the information you provide (name, email, message).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">3. How We Use Your Information</h2>
              <p className="text-foreground leading-relaxed mb-4">We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-2 text-foreground">
                <li>Provide and maintain our website and services</li>
                <li>Improve and personalize your experience</li>
                <li>Analyze usage patterns to enhance our content</li>
                <li>Display relevant advertisements through Google AdSense</li>
                <li>Respond to your inquiries and communications</li>
                <li>Detect and prevent technical issues or abuse</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">4. Advertising</h2>
              <p className="text-foreground leading-relaxed mb-4">
                We use Google AdSense to display advertisements on our website. Google AdSense may use cookies and web beacons to serve ads based on your prior visits to our website and other websites. You can opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Ads Settings</a>.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">5. Cookies</h2>
              <p className="text-foreground leading-relaxed mb-4">
                Our website uses cookies to enhance your experience. These include essential cookies for site functionality, analytics cookies to understand usage patterns, and advertising cookies used by our ad partners. You can control cookie preferences through your browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">6. Data Sharing</h2>
              <p className="text-foreground leading-relaxed mb-4">
                We do not sell your personal information. We may share anonymized, aggregated data with advertising partners (Google AdSense) to serve relevant ads. We may also disclose information if required by law or to protect our rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">7. Data Security</h2>
              <p className="text-foreground leading-relaxed mb-4">
                We implement appropriate technical and organizational security measures to protect your data. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">8. Your Rights</h2>
              <p className="text-foreground leading-relaxed mb-4">Depending on your location, you may have the right to:</p>
              <ul className="list-disc pl-6 space-y-2 text-foreground">
                <li>Access, correct, or delete your personal data</li>
                <li>Opt out of personalized advertising</li>
                <li>Withdraw consent at any time</li>
                <li>Lodge a complaint with a data protection authority</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">9. Children's Privacy</h2>
              <p className="text-foreground leading-relaxed mb-4">
                Our website is not directed to children under 13. We do not knowingly collect personal information from children. If we discover that a child has provided us with personal data, we will delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">10. Changes to This Policy</h2>
              <p className="text-foreground leading-relaxed mb-4">
                We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date. We encourage you to review this page periodically.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">11. Contact Us</h2>
              <p className="text-foreground leading-relaxed mb-4">
                If you have any questions about this Privacy Policy, please contact us through our{" "}
                <a href="/contact" className="text-primary hover:underline">Contact page</a>.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default PrivacyPage;
