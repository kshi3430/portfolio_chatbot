import React from "react";
import { PortfolioNavigation, SkillGroup } from "../types";
import { Cpu, Layers, Wrench } from "lucide-react";
import { motion } from "motion/react";

type TechStackGroup = SkillGroup & {
  icon: typeof Layers;
  subtitle: string;
  accent?: boolean;
};

const SKILL_GROUPS: TechStackGroup[] = [
  {
    category: "Primary Stack",
    subtitle: "AI 워크플로 설계와 RAG 시스템 구현에 주력으로 사용하는 기술",
    skills: ["Python", "LangChain", "RAG", "LangGraph", "LangSmith"],
    icon: Layers,
    accent: true,
  },
  {
    category: "Also Used",
    subtitle: "모델 학습, 백엔드 API 및 데이터·배포 인프라 구성에 활용한 기술",
    skills: ["PyTorch", "FastAPI", "Docker", "PostgreSQL"],
    icon: Wrench,
  },
];

const PRIMARY_TAG_LIGHT_ACCENTS: Record<string, string> = {
  Python: "[:is(.light)_&]:bg-indigo-50 [:is(.light)_&]:text-indigo-700 [:is(.light)_&]:border-indigo-200",
  LangChain: "[:is(.light)_&]:bg-emerald-50 [:is(.light)_&]:text-emerald-700 [:is(.light)_&]:border-emerald-200",
  RAG: "[:is(.light)_&]:bg-orange-50 [:is(.light)_&]:text-orange-700 [:is(.light)_&]:border-orange-200",
  LangGraph: "[:is(.light)_&]:bg-violet-50 [:is(.light)_&]:text-violet-700 [:is(.light)_&]:border-violet-200",
  LangSmith: "[:is(.light)_&]:bg-rose-50 [:is(.light)_&]:text-rose-700 [:is(.light)_&]:border-rose-200",
};

export function Skills({
  navigation,
}: {
  navigation?: { nav: PortfolioNavigation; nonce: number } | null;
}) {
  const highlightedStack =
    navigation?.nav.section === "skills" ? navigation.nav.highlightText || null : null;

  return (
    <section id="skills" className="py-24 md:py-36 border-t border-white/5 [:is(.light)_&]:border-[#E5E7EB] scroll-mt-24">
      <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-8 @3xl:gap-14 items-start">
        {/* Sticky Section Header */}
        <div className="@3xl:col-span-4 @3xl:sticky @3xl:top-28">
          <div className="flex items-center gap-1.5 font-mono text-xs text-primary-emerald [:is(.light)_&]:text-indigo-600 tracking-widest uppercase mb-2">
            <Cpu className="w-3.5 h-3.5" />
            TECH STACK
          </div>
          <h3 className="font-display text-3xl font-bold tracking-tight text-on-surface">
            기술 스택
          </h3>
          <p className="text-on-surface-variant [:is(.light)_&]:text-[#374151] text-sm max-w-md leading-relaxed mt-4">
            핵심으로 다루는 AI 엔지니어링 스택과 프로젝트 전반에서 함께 활용한 기술입니다.
          </p>
        </div>

        {/* 1-Column Vertical Stack */}
        <div className="@3xl:col-span-8 grid grid-cols-1 gap-7">
          {SKILL_GROUPS.map((group, groupIdx) => {
            const Icon = group.icon;
            const isHighlighted = highlightedStack === group.category;
            return (
              <motion.div
                key={group.category}
                data-nav-section="skills"
                data-nav-target={group.category}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: groupIdx * 0.08 }}
                className={`scroll-mt-28 glass-card p-8 md:p-10 rounded-3xl border border-white/5 [:is(.light)_&]:border-[#E5E7EB] bg-surface-low/25 [:is(.light)_&]:bg-white flex flex-col justify-start gap-7 hover:border-primary-emerald/25 [:is(.light)_&]:hover:border-[#D1D5DB] transition-all duration-300 ${
                  isHighlighted ? "nav-highlight-glow" : ""
                }`}
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`w-10 h-10 rounded-xl bg-primary-emerald/10 border border-primary-emerald/25 flex items-center justify-center text-primary-emerald shrink-0 ${
                        group.accent
                          ? "[:is(.light)_&]:bg-indigo-50 [:is(.light)_&]:border-indigo-200 [:is(.light)_&]:text-indigo-600"
                          : "[:is(.light)_&]:bg-[#F9FAFB] [:is(.light)_&]:border-[#E5E7EB] [:is(.light)_&]:text-[#111827]"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-display text-lg font-bold tracking-tight text-on-surface">
                        {group.category}
                      </h4>
                      <p className="text-xs text-on-surface-variant [:is(.light)_&]:text-[#71717A] mt-0.5 leading-relaxed">
                        {group.subtitle}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {group.skills.map((skill) => (
                    <span
                      key={skill}
                      className={`font-mono text-sm px-4 py-2 rounded-xl border transition-colors ${
                        group.accent
                          ? `bg-primary-emerald/10 text-primary-glow border-primary-emerald/25 ${PRIMARY_TAG_LIGHT_ACCENTS[skill] || "[:is(.light)_&]:bg-[#F9FAFB] [:is(.light)_&]:text-[#111827] [:is(.light)_&]:border-[#E5E7EB]"}`
                          : "bg-surface-high/60 [:is(.light)_&]:bg-[#F9FAFB] text-on-surface [:is(.light)_&]:text-[#374151] border-white/10 [:is(.light)_&]:border-[#E5E7EB]"
                      }`}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
