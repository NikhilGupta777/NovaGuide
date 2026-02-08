import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MessageSquare, Send, CheckCircle, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import SEOHead from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";

const ContactPage = () => {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("contact_submissions").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      subject: form.subject.trim(),
      message: form.message.trim(),
    });
    setSubmitting(false);
    if (!error) setSubmitted(true);
  };

  return (
    <Layout>
      <SEOHead
        title="Contact Us"
        description="Have a question, suggestion, or need help? Reach out to the DigitalHelp team."
      />
      <div className="container py-12 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Contact Us</h1>
          </div>
          <p className="text-muted-foreground mb-8 ml-[52px]">
            Have a question, suggestion, or found an issue? We'd love to hear from you.
          </p>

          {submitted ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-16 bg-card rounded-xl border border-border">
              <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Message Sent!</h2>
              <p className="text-muted-foreground max-w-sm mx-auto">Thank you for reaching out. We'll get back to you as soon as possible.</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 bg-card rounded-xl border border-border p-6 md:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">Name</label>
                  <input id="name" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Your name" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                  <input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="you@example.com" />
                </div>
              </div>
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-foreground mb-1.5">Subject</label>
                <input id="subject" type="text" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="What's this about?" />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-foreground mb-1.5">Message</label>
                <textarea id="message" required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Describe your question, suggestion, or issue..." />
              </div>
              <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? "Sending..." : "Send Message"}
              </button>
            </form>
          )}

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-card border border-border">
              <MessageSquare className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold text-foreground text-sm mb-1">Suggest a Topic</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">Can't find what you need? Let us know and our AI will research and create a guide for it.</p>
            </div>
            <div className="p-5 rounded-xl bg-card border border-border">
              <Mail className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-semibold text-foreground text-sm mb-1">Report an Issue</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">Found incorrect information in an article? Let us know so we can fix it right away.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default ContactPage;
