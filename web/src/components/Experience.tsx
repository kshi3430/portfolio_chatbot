import React from "react";
import { Award, Calendar, CheckCircle2, GraduationCap } from "lucide-react";
import { motion } from "motion/react";

const AWARDS = [
  ["2025 경북소마고 교내 프로젝트 실직자", "4위"],
  ["2025 동계 겨울방학 프로젝트 JICHINI", "3위"],
  ["2026 1학기 캡스톤 프로젝트 CapTeam", "1위"],
  ["2026 경북 SWgo 해커톤 프로그램", "UX 맛집상"],
  ["2025 DCC (Data Create Camp)", "장려상"],
  ["2026 한국인공지능올림피아드 (KOAI)", "특별상"],
  ["2026 국제교류 포트폴리오 대회", "은상"],
  ["인공지능 1학년 교과우수상", "교과우수상"],
  ["2026 직업계고 K-TECH 아이디어 챌린지", "입선"],
  ["포스코DX 2026 AI Youth Challenge", "참가"],
  ["2026 한국코드페어 해커톤", "참가"],
  ["여수 SW연합 해커톤", "참가"],
  ["의성군 서비스 개선 공모제안 경진대회", "참가"],
];

export function Experience() {
  return (
    <section id="about" className="py-16 border-t border-white/5 scroll-mt-24">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <div className="flex items-center gap-2 font-mono text-xs text-primary-emerald tracking-widest mb-6"><GraduationCap className="w-4 h-4" /> EDUCATION & ACTIVITY</div>
          <motion.div initial={{opacity:0,y:18}} whileInView={{opacity:1,y:0}} viewport={{once:true}} className="glass-card rounded-2xl p-7">
            <div className="flex items-center gap-2 text-xs font-mono text-primary-emerald mb-3"><Calendar className="w-4 h-4" /> 2025.03 — 2028.03</div>
            <h3 className="font-display text-xl font-bold mb-2">경북소프트웨어마이스터고등학교</h3>
            <p className="text-primary-glow mb-5">인공지능과</p>
            <div className="space-y-3 text-sm text-on-surface-variant">
              <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary-emerald mt-0.5" /> 인공지능 동아리 AI고라</div>
              <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary-emerald mt-0.5" /> 교내 환경 학생부 활동</div>
              <div className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary-emerald mt-0.5" /> 프로젝트를 통한 AI 서비스 개발 경험</div>
            </div>
          </motion.div>
        </div>

        <div className="lg:col-span-7">
          <div className="flex items-center gap-2 font-mono text-xs text-primary-emerald tracking-widest mb-6"><Award className="w-4 h-4" /> AWARDS & ACHIEVEMENTS</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {AWARDS.map(([name, result], i) => (
              <motion.div key={name} initial={{opacity:0,y:12}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*.04}} className="glass-card rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                <span className="text-sm text-on-surface-variant">{name}</span>
                <span className="shrink-0 text-xs font-mono text-primary-emerald bg-primary-emerald/10 border border-primary-emerald/20 rounded-full px-2.5 py-1">{result}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
