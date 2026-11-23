import React from "react";
import { Award, Calendar, CheckCircle2, Compass, GraduationCap } from "lucide-react";
import { motion } from "motion/react";
import { PortfolioNavigation } from "../types";

// 1위 → 은상(2위급) → 3위 → 4위 → 특별상·부문상·장려상·교과우수상·입선 순으로 정렬
const AWARDS: [string, string][] = [
  ["2026 1학기 캡스톤 프로젝트 CapTeam", "1위"],
  ["2026 국제교류 포트폴리오 대회", "은상"],
  ["2025 동계 겨울방학 프로젝트 JICHINI", "3위"],
  ["2025 경북소마고 교내 프로젝트 실직자", "4위"],
  ["2026 한국인공지능올림피아드 (KOAI)", "특별상"],
  ["2026 경북 SWgo 해커톤 프로그램", "UX 맛집상"],
  ["2025 DCC (Data Create Camp)", "장려상"],
  ["인공지능 1학년 교과우수상", "교과우수상"],
  ["2026 직업계고 K-TECH 아이디어 챌린지", "입선"],
];

const ACTIVITIES: [string, string][] = [
  ["포스코DX 2026 AI Youth Challenge", "경진대회"],
  ["2026 한국코드페어 해커톤", "해커톤"],
  ["여수 SW연합 해커톤", "해커톤"],
  ["의성군 서비스 개선 공모제안 경진대회", "공모전"],
  ["일본 치바상업고등학교 국제교류", "국제교류"],
  ["싱가포르 연수", "해외 견학"],
];

function AchievementGrid({
  icon: Icon,
  title,
  targetKey,
  items,
  highlighted = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  targetKey: string;
  items: [string, string][];
  highlighted?: boolean;
}) {
  return (
    <div
      data-nav-section="about"
      data-nav-target={targetKey}
      className={`scroll-mt-28 grid grid-cols-1 @3xl:grid-cols-12 gap-6 @3xl:gap-14 items-start rounded-3xl transition-all duration-300 ${
        highlighted ? "p-4 -m-4 nav-highlight-glow border" : ""
      }`}
    >
      <div className="@3xl:col-span-4 @3xl:sticky @3xl:top-28 flex items-center gap-2 font-mono text-xs text-primary-emerald tracking-widest">
        <Icon className="w-4 h-4" /> {title}
      </div>
      <div className="@3xl:col-span-8 grid grid-cols-1 gap-4">
        {items.map(([name, badge], i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 12 }}
            animate={highlighted ? { opacity: 1, y: 0 } : undefined}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: "some" }}
            transition={{ delay: i * 0.03 }}
            className="glass-card rounded-2xl px-6 py-5 flex items-center justify-between gap-4"
          >
            <span className="text-sm leading-relaxed text-on-surface/90">{name}</span>
            <span className="shrink-0 text-xs font-mono text-primary-emerald bg-primary-emerald/10 border border-primary-emerald/20 rounded-full px-3 py-1">
              {badge}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function Experience({
  navigation,
}: {
  navigation?: { nav: PortfolioNavigation; nonce: number } | null;
}) {
  const highlightedGroup =
    navigation?.nav.section === "about" ? navigation.nav.highlightText || null : null;

  return (
    <section id="about" className="py-24 md:py-36 border-t border-white/5 scroll-mt-24">
      <div className="space-y-24 md:space-y-32">
        {/* Education & Activity */}
        <div
          data-nav-section="about"
          data-nav-target="EDUCATION"
          className="scroll-mt-28 grid grid-cols-1 @3xl:grid-cols-12 gap-6 @3xl:gap-14 items-start"
        >
          <div className="@3xl:col-span-4 @3xl:sticky @3xl:top-28 flex items-center gap-2 font-mono text-xs text-primary-emerald tracking-widest">
            <GraduationCap className="w-4 h-4" /> EDUCATION & ACTIVITY
          </div>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={highlightedGroup === "EDUCATION" ? { opacity: 1, y: 0 } : undefined}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: "some" }}
            className={`@3xl:col-span-8 glass-card rounded-2xl p-8 md:p-10 flex flex-col gap-8 ${
              highlightedGroup === "EDUCATION" ? "nav-highlight-glow" : ""
            }`}
          >
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-primary-emerald mb-2.5">
                <Calendar className="w-4 h-4" /> 2025.03 — 2028.03
              </div>
              <h3 className="font-display text-2xl font-bold mb-1.5">경북소프트웨어마이스터고등학교</h3>
              <p className="text-primary-glow text-sm font-medium">인공지능과</p>
            </div>

            <div className="grid grid-cols-1 gap-3.5 text-sm text-on-surface-variant">
              <div className="flex items-center gap-2.5 bg-surface-dim/60 border border-white/5 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-primary-emerald shrink-0" />
                <span>인공지능 동아리 AI고라</span>
              </div>
              <div className="flex items-center gap-2.5 bg-surface-dim/60 border border-white/5 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-primary-emerald shrink-0" />
                <span>교내 환경 학생부 활동</span>
              </div>
              <div className="flex items-center gap-2.5 bg-surface-dim/60 border border-white/5 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-primary-emerald shrink-0" />
                <span>AI 서비스 프로젝트 개발</span>
              </div>
            </div>
          </motion.div>
        </div>

        <AchievementGrid
          icon={Award}
          title="AWARDS & ACHIEVEMENTS"
          targetKey="AWARDS"
          items={AWARDS}
          highlighted={highlightedGroup === "AWARDS"}
        />
        <AchievementGrid
          icon={Compass}
          title="ACTIVITIES"
          targetKey="ACTIVITIES"
          items={ACTIVITIES}
          highlighted={highlightedGroup === "ACTIVITIES"}
        />
      </div>
    </section>
  );
}
