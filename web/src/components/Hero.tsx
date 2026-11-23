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
    <section className="py-20 md:py-32 relative overflow-hidden">
      {/* Background radial spotlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary-emerald/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10">
        {/* Top Full-Width Greeting */}
        <div className="mb-8 md:mb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-2 text-xs font-mono text-primary-emerald tracking-widest uppercase mb-5"
          >
            <span className="w-2 h-2 rounded-full bg-primary-emerald animate-pulse" />
            LEARNING, BUILDING, AND IMPROVING AI SYSTEMS
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.05 }}
            className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-normal leading-[1.35] text-on-surface"
          >
            안녕하세요, AI 엔지니어 김성현입니다.
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-12 @3xl:gap-16 items-start">
          {/* Main Copy */}
          <div className="@3xl:col-span-7 flex flex-col justify-center @3xl:pt-2">
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.12 }}
              className="font-display text-2xl sm:text-[26px] lg:text-[28px] font-semibold tracking-normal leading-[1.45] mb-6 text-on-surface/90"
            >
              한 줄로 소개할 수 있는 기능에도, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-emerald to-primary-glow">
                한 줄로 끝나지 않는 결정이 있습니다.
              </span>
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-on-surface-variant text-base md:text-[17px] max-w-2xl leading-[1.9]"
            >
              AI 기능을 만들 때는 모델에 어디까지 판단을 맡기고, 어느 지점에서 코드로 결과를 검증할지부터 고민합니다.
              모델에 주는 정보와 검증 방식에 따라 응답의 정확도·일관성, 속도와 호출 비용이 어떻게 달라지는지 직접 확인하며 프로젝트에 맞는 구조를 찾아갑니다.
            </motion.p>
          </div>

          {/* Interactive Core Graphic/Canvas Placeholder */}
          <div className="@3xl:col-span-5 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative w-full aspect-square max-w-[340px] rounded-3xl bg-gradient-to-br from-surface-low to-surface-dim border border-white/5 flex items-center justify-center p-6 shadow-2xl group overflow-hidden"
            >
              {/* Spinning visual compass */}
              <div className="absolute inset-0 bg-void/50" />

              {/* Rotating outer orbit */}
              <div className="absolute w-[260px] h-[260px] rounded-full border border-dashed border-primary-emerald/15 animate-[spin_40s_linear_infinite]" />
              <div className="absolute w-[195px] h-[195px] rounded-full border border-primary-emerald/20 animate-[spin_20s_linear_infinite_reverse]" />
              <div className="absolute w-[130px] h-[130px] rounded-full border border-dashed border-primary-emerald/30 animate-[spin_10s_linear_infinite]" />

              {/* Central glowing core */}
              <div className="w-20 h-20 rounded-full bg-primary-emerald/10 border border-primary-emerald/40 flex items-center justify-center relative z-10 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
                <div className="w-12 h-12 rounded-full bg-primary-emerald/20 border border-primary-emerald/60 flex items-center justify-center animate-pulse">
                  <div className="w-4 h-4 rounded-full bg-primary-glow shadow-[0_0_15px_#4edea3]" />
                </div>
              </div>

              {/* Monospace overlay lines */}
              <div className="absolute top-5 left-5 font-mono text-[10px] leading-relaxed text-primary-emerald/60">
                PROFILE: AI_ENGINEER<br />
                STATUS: BUILDING
              </div>
              <div className="absolute bottom-5 right-5 font-mono text-[10px] leading-relaxed text-on-surface-variant/85 text-right">
                PYTHON / LANGCHAIN<br />
                LANGGRAPH / LANGSMITH
              </div>
            </motion.div>
          </div>
        </div>

        {/* Quick Stats Grid — full container width for comfortable reading */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6 mt-20 md:mt-28"
        >
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            const content = (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium tracking-wide text-on-surface-variant">
                    {stat.label}
                  </span>
                  <Icon className="w-4 h-4 text-primary-emerald/75 shrink-0" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg font-bold text-on-surface tracking-tight">
                    {stat.value}
                  </div>
                  <p className="text-xs leading-relaxed text-on-surface-variant mt-1">
                    {stat.detail}
                  </p>
                </div>
              </>
            );
            const cardClass = "glass-card p-6 md:p-7 rounded-2xl border border-white/5 bg-surface-low/35 flex flex-col justify-between min-h-[148px] transition-all duration-300";

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
    </section>
  );
}
