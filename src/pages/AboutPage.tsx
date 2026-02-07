import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import { BookOpen, Users, Zap, Globe } from "lucide-react";

const AboutPage = () => {
  return (
    <Layout>
      <div className="container py-12 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            About DigitalHelp
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-10">
            We believe everyone deserves clear, simple answers to their digital questions. 
            DigitalHelp is a free knowledge hub that turns complex tech problems into easy-to-follow, step-by-step solutions.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
            {[
              {
                icon: BookOpen,
                title: "Clear Guides",
                desc: "Every article follows a simple Problem → Steps → Recap format. No jargon, no fluff.",
              },
              {
                icon: Users,
                title: "For Everyone",
                desc: "Written for beginners and non-technical users. If you can read, you can follow our guides.",
              },
              {
                icon: Zap,
                title: "AI-Powered",
                desc: "Our AI agent discovers trending topics, researches solutions, and helps create accurate content.",
              },
              {
                icon: Globe,
                title: "Global Reach",
                desc: "Helping users worldwide with phone, computer, app, and social media solutions.",
              },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="p-6 rounded-xl bg-card border border-border"
              >
                <item.icon className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="prose-article">
            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Our Mission</h2>
            <p className="text-foreground leading-relaxed mb-4">
              Technology should make life easier, not harder. But for millions of people, simple tasks like 
              resetting a password, freeing up storage, or setting up a new device can feel overwhelming.
            </p>
            <p className="text-foreground leading-relaxed mb-4">
              DigitalHelp exists to bridge that gap. We create clear, actionable guides that anyone 
              can follow — whether you're a teenager setting up your first phone or a grandparent 
              learning to video call.
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">How We Create Content</h2>
            <p className="text-foreground leading-relaxed mb-4">
              Our AI-powered research system identifies the most common digital problems people search for 
              every day. It researches solutions from trusted sources, verifies accuracy, and drafts 
              beginner-friendly articles. Every piece of content goes through quality checks before publishing.
            </p>

            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Contact Us</h2>
            <p className="text-foreground leading-relaxed mb-4">
              Have a question or suggestion? We'd love to hear from you. Reach out through our contact page 
              or drop us a line — we're always looking to improve and add the guides you need most.
            </p>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default AboutPage;
