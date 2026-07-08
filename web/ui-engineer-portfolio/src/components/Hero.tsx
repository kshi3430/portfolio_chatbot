import React from "react";
import { motion } from "motion/react";
import { UserRound, Mail, Github, GraduationCap } from "lucide-react";

export function Hero() {
  const stats = [
    { label: "이름", value: "김성현", detail: "AI Engineer", icon: UserRound },
    { label: "이메일", value: "kshi3430", detail: "@gmail.com", icon: Mail, href: "mailto:kshi3430@gmail.com" },
    { label: "GitHub", value: "kshi3430", detail: "github.com/kshi3430", icon: Github, href: "https://github.com/kshi3430" },
    { label: "소속 · 전공", value: "인공지능과", detail: "경북소프트웨어마이스터고", icon: GraduationCap },
  ];

  return (
    <section className="py-12 md:py-20 relative overflow-hidden">
      {/* Background radial spotlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary-emerald/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Main Copy */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-2 text-xs font-mono text-primary-emerald tracking-widest uppercase mb-4"
            >
              <span className="w-2 h-2 rounded-full bg-primary-emerald animate-pulse" />
              LEARNING, BUILDING, AND IMPROVING AI SYSTEMS
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6 text-on-surface"
            >
              문제를 이해하고, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-emerald to-primary-glow">
                작동하는 AI 서비스로 만듭니다.
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-on-surface-variant text-base md:text-lg max-w-2xl leading-relaxed mb-10"
            >
              AI 엔지니어 김성현입니다. 기술의 내부 원리를 이해하고 문제를 해결해,
              사용자에게 실제 가치가 닿는 서비스를 만드는 개발자를 지향합니다.
              RAG, LangChain, Vector DB와 PyTorch 기반 모델 개발을 경험했고,
              현재는 Agent와 LangGraph를 깊이 공부하고 있습니다.
            </motion.p>

            {/* Quick Stats Grid */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.4 }}
              className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4"
            >
              {stats.map((stat, i) => {
                const Icon = stat.icon;
                const content = (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium tracking-wide text-on-surface-variant">
                        {stat.label}
                      </span>
                      <Icon className="w-4 h-4 text-primary-emerald/70" />
                    </div>
                    <div className="mt-4 min-w-0">
                      <div className="font-display text-xl font-bold text-on-surface tracking-tight break-keep whitespace-normal">
                        {stat.value}
                      </div>
                      <p className="text-[11px] leading-5 text-on-surface-variant/65 mt-2 break-keep whitespace-normal">
                        {stat.detail}
                      </p>
                    </div>
                  </>
                );
                const cardClass = "glass-card p-5 min-h-[150px] rounded-xl border border-white/5 bg-surface-low/35 flex flex-col justify-between min-w-0 overflow-hidden transition-all duration-300";

                return stat.href ? (
                  <a key={i} href={stat.href} target={stat.href.startsWith("http") ? "_blank" : undefined} rel={stat.href.startsWith("http") ? "noreferrer" : undefined} className={`${cardClass} hover:border-primary-emerald/35 hover:-translate-y-1`}>
                    {content}
                  </a>
                ) : (
                  <div key={i} className={cardClass}>
                    {content}
                  </div>
                );
              })}
            </motion.div>
          </div>

          {/* Interactive Core Graphic/Canvas Placeholder */}
          <div className="lg:col-span-5 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative w-full aspect-square max-w-[360px] rounded-3xl bg-gradient-to-br from-surface-low to-surface-dim border border-white/5 flex items-center justify-center p-6 shadow-2xl group overflow-hidden"
            >
              {/* Spinning visual compass */}
              <div className="absolute inset-0 bg-void/50" />
              
              {/* Rotating outer orbit */}
              <div className="absolute w-[280px] h-[280px] rounded-full border border-dashed border-primary-emerald/15 animate-[spin_40s_linear_infinite]" />
              <div className="absolute w-[210px] h-[210px] rounded-full border border-primary-emerald/20 animate-[spin_20s_linear_infinite_reverse]" />
              <div className="absolute w-[140px] h-[140px] rounded-full border border-dashed border-primary-emerald/30 animate-[spin_10s_linear_infinite]" />
              
              {/* Central glowing core */}
              <div className="w-20 h-20 rounded-full bg-primary-emerald/10 border border-primary-emerald/40 flex items-center justify-center relative z-10 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
                <div className="w-12 h-12 rounded-full bg-primary-emerald/20 border border-primary-emerald/60 flex items-center justify-center animate-pulse">
                  <div className="w-4 h-4 rounded-full bg-primary-glow shadow-[0_0_15px_#4edea3]" />
                </div>
              </div>

              {/* Monospace overlay lines */}
              <div className="absolute top-4 left-4 font-mono text-[9px] text-primary-emerald/50">
                PROFILE: AI_ENGINEER<br />
                STATUS: BUILDING
              </div>
              <div className="absolute bottom-4 right-4 font-mono text-[9px] text-on-surface-variant/40 text-right">
                RAG / LANGCHAIN<br />
                LANGGRAPH / PYTORCH
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
