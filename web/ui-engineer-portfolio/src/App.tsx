import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Projects } from "./components/Projects";
import { Experience } from "./components/Experience";
import { Skills } from "./components/Skills";
import { ChatPanel } from "./components/ChatPanel";
import { Bot, Terminal, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);

  useEffect(() => {
    // Automatically fade out the tooltip after 8 seconds if not interacted with
    const timer = setTimeout(() => {
      setShowTooltip(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-void text-on-surface relative pb-20 selection:bg-primary-emerald/30 selection:text-white">
      {/* Absolute graphic elements */}
      <div className="noise-overlay" />
      <div className="atmospheric-glow top-1/4 left-10 w-[500px] h-[500px]" />
      <div className="atmospheric-glow bottom-1/4 right-10 w-[600px] h-[600px]" />

      {/* Navigation Header */}
      <Header />

      <main className="max-w-5xl mx-auto px-6 mt-6 relative z-10">
        {/* Full-width clean single stack layout for the portfolio sections */}
        <div className="space-y-12 md:space-y-20">
          <Hero />
          <Projects />
          <Experience />
          <Skills />
        </div>
      </main>

      {/* Floating Chat Trigger & Panel */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
        {/* Tooltip */}
        <AnimatePresence>
          {showTooltip && !isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pointer-events-auto bg-surface-low border border-primary-emerald/30 text-on-surface px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-xs text-xs font-mono relative"
            >
              <Bot className="w-4 h-4 text-primary-emerald animate-pulse shrink-0" />
              <div className="flex-1">
                김성현의 <b className="text-primary-emerald">Portfolio AI</b>에게 프로젝트를 물어보세요.
              </div>
              <button
                type="button"
                onClick={() => setShowTooltip(false)}
                className="text-on-surface-variant/50 hover:text-on-surface shrink-0 p-0.5 cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Action Button */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setIsChatOpen(!isChatOpen);
            setShowTooltip(false);
          }}
          className="pointer-events-auto w-14 h-14 rounded-full bg-primary-emerald hover:bg-primary-glow text-void flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_40px_rgba(16,185,129,0.6)] border border-primary-glow/30 transition-all duration-300 relative group cursor-pointer"
          title="Toggle AI Twin Assistant"
        >
          <div className="absolute inset-0 rounded-full bg-primary-emerald/20 animate-ping opacity-75 pointer-events-none" />
          <Bot className="w-6 h-6 relative z-10 transition-transform duration-500 group-hover:rotate-12" />
          <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500 border-2 border-void rounded-full animate-pulse" />
        </motion.button>
      </div>

      {/* Floating ChatPanel Drawer Overlay */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-24 right-6 w-[400px] max-w-[calc(100vw-32px)] h-[600px] max-h-[80vh] z-50 flex flex-col shadow-2xl"
          >
            <ChatPanel onClose={() => setIsChatOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer id="contact" className="border-t border-white/5 mt-20 pt-16 pb-12 bg-void/50 backdrop-blur scroll-mt-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="glass-card rounded-3xl p-8 md:p-12 mb-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div>
              <div className="font-mono text-xs text-primary-emerald tracking-widest mb-4">LET'S CONNECT</div>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">함께 해결할 문제가 있나요?</h2>
              <p className="text-on-surface-variant max-w-xl">AI에 대한 이야기라면 언제든 편하게 연락해주세요.</p>
            </div>
            <a href="mailto:kshi3430@gmail.com" className="shrink-0 bg-primary-emerald text-void font-semibold px-6 py-3 rounded-xl hover:bg-primary-glow transition-colors">이메일 보내기</a>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs text-on-surface-variant/50">
          <div>
            © 2026 Kim Seonghyeon. All rights reserved.
          </div>
          <div className="flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-primary-emerald" />
            <span>AI_ENGINEER_PORTFOLIO</span>
          </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
