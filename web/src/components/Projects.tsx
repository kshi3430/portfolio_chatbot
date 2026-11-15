import React, { useState } from "react";
import { Project } from "../types";
import { ExternalLink, Github, Layers, MoveRight, X, Sparkles, BrainCircuit, Users } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const PROJECTS_DATA: Project[] = [
  {
    id: "capteam",
    title: "CapTeam",
    description: "학생 역량을 분석하고 검증 가능한 팀 구성을 만드는 AI 기반 캡스톤 관리 서비스",
    period: "2026.03.15 — 진행 중",
    role: "AI · AI Backend",
    team: ["김성현 — AI, AI Backend", "박진욱 — Backend, 배포", "허재원 — Frontend", "양원우 — Backend", "유채민 — AI"],
    motivation: "캡스톤 팀을 선정하고 진행 상황을 관리하는 과정에서 학생과 선생님 모두가 겪는 불편함을 해결하기 위해, AI 기반 자동 팀 생성과 캡스톤 진행 관리 기능을 한곳에서 제공하는 CapTeam을 기획했습니다.",
    development: [
      { title: "Dataset 설계", details: ["학생의 희망 직군, 기술 스택, 구현 기능과 로직, 선호 팀원, 팀장 선호도, 성격, 개발 성향을 바탕으로 AI가 역량을 분석할 수 있도록 설문 데이터 구조를 설계했습니다.", "학생 역량 분석 결과가 팀 매칭 로직의 입력으로 활용되도록 데이터를 구조화하고, 이를 기반으로 매칭 출력 데이터 구조를 설계했습니다."] },
      { title: "Structured Output", details: ["Pydantic 기반 structured output으로 학생 분석 결과와 팀 매칭 결과의 응답 형식을 고정했습니다.", "학생 경험에서 근거 키워드를 추출해 LLM 판단의 참고 정보로 프롬프트에 전달하고 출력 결과에 반영되도록 설계했습니다."] },
      { title: "LangGraph Workflow", details: ["학생 분석 결과로 1차 팀 매칭을 수행하고, 검증에서 발견된 문제를 LLM이 반복 보정한 뒤 검증을 통과한 결과만 출력하는 Reflection Loop를 구현했습니다.", "팀 생성 → LLM 보정 → 알고리즘 검증 → LLM 검증 → 최종 결과 저장 흐름을 구성해 결과의 안정성을 높였습니다."] },
      { title: "Backend Framework", details: ["FastAPI로 AI 팀 매칭 결과 조회 API를 구현했습니다.", "분석 및 매칭 결과를 JSON으로 저장하고 서비스 화면에 필요한 형태로 가공했으며, 팀원별 강점, 역할, 실력 등급과 기술 스택 점수를 반환하도록 설계했습니다."] },
    ],
    troubleshooting: [
      { title: "학생 분석 결과의 랜덤성과 과대평가", problem: "LLM 기반 역량 분석 결과가 실행마다 달라지고 단순 튜토리얼 수준의 구현 경험도 과대평가되는 문제가 있었습니다.", solution: "temperature를 0으로 설정하고 후처리 보정 로직을 추가했습니다. 경험 텍스트에서 '단순 구현'과 '실제 수행' 키워드 빈도를 추출해 프롬프트에 전달하고, 실제 수행 근거가 충분히 확인될 때만 보통 이상을 부여했으며, 최종 등급이 보통이면 최대 7점, 낮음이면 최대 4점으로 기술 점수 상한을 제한했습니다.", result: "학생 분석 결과의 일관성이 높아지고 역량 과대평가 문제가 완화되었습니다." },
      { title: "LLM 팀 수정의 최대 횟수 반복", problem: "팀원 선호 미반영까지 오류로 간주해 최대 횟수까지 팀을 수정하면서 응답 시간과 비용이 급증하고 정상 팀 구성도 계속 변경됐습니다.", solution: "학생 누락·중복과 인원 제한 위반만 '필수 오류'로 정의하고, 팀원 선호 미반영은 '참고 경고'로 분리했습니다. 반복 횟수와 이전 수정 내역을 기록해 동일 패턴 반복을 막았으며, 최대 횟수 초과 시 규칙 기반(Rule-based) 알고리즘으로 자동 fallback하도록 설계했습니다.", result: "불필요한 반복 수정이 줄어들고 팀 매칭 워크플로 안정성이 개선되었습니다." },
      { title: "컨텍스트 길이 초과와 긴 처리 시간", problem: "모든 팀의 매칭 사유와 강·약점을 단일 LLM 요청에서 생성해 토큰을 초과하고 대규모 병목이 발생했습니다.", solution: "생성 작업을 팀 단위로 분리하고 독립 작업을 병렬 실행하는 구조로 개편했습니다. Rate Limit과 timeout을 고려해 Worker 3개, Batch 6개로 제한했습니다.", result: "전체 소요 시간을 514.67초에서 179.44초로 335.23초 단축해 2.87배 속도를 향상했습니다." },
    ],
    learnings: ["외부 트래픽으로 Vercel 프론트엔드 서버에 문제가 발생한 경험을 통해 인증, 접근 제어, 요청 제한과 서버 안정성을 개발 단계부터 고려해야 한다는 점을 배웠습니다.", "AI가 작성한 코드라도 개발자가 구조와 동작 원리를 이해해야 실제 사용자 환경의 오류를 빠르게 해결할 수 있다는 점을 배웠습니다."],
    tags: ["Python", "LangChain", "LangGraph", "FastAPI", "Pydantic"],
    highlight: "2.87× faster",
    gridSpan: "large",
  },
  {
    id: "jichini",
    title: "JICHINI",
    description: "고민을 구체화하고 유사한 경험을 가진 사람을 연결하는 AI 기반 사회초년생 연결 서비스",
    period: "2025년 겨울방학 프로젝트",
    role: "AI · AI Backend",
    team: ["김성현 — AI, AI Backend", "박진욱 — Backend, 배포", "허재원 — Frontend"],
    motivation: "타지역으로 취업한 사회초년생들은 낯선 환경에서 직장생활, 인간관계와 외로움 등의 고민을 겪지만 이를 편하게 공유할 곳이 부족합니다. AI가 고민을 분석하고 비슷한 경험을 가진 사람을 연결해 공감과 위로를 제공하고자 JICHINI를 개발했습니다.",
    development: [
      { title: "Jev 기반 입력 판단 및 LangGraph 응답 분기", details: ["TypeSafe Jev를 연동해 현재 입력과 이전 고민을 바탕으로 사용자 의도와 매칭 가능성을 한 번의 요청으로 판단하도록 구현했습니다.", "LangGraph에서 판단 결과에 따라 유사 사용자 검색, 고민을 구체화하는 추가 질문, 기존 추천 결과 더보기로 분기하고, 정보가 부족할 때는 상황과 감정을 자연스럽게 물어보는 안내 프롬프트를 설계했습니다."] },
      { title: "Pinecone 기반 유사 사용자 매칭", details: ["사용자 1명당 1문서로 데이터를 청킹해 정보 손실을 줄였습니다.", "실시간 사용자 데이터 수정·삭제·생성이 필요한 서비스 특성을 고려해 Pinecone Vector DB를 사용하고, 입력된 고민과 유사한 사용자를 Retriever가 매칭·도출하도록 구현했습니다."] },
      { title: "Backend Framework (Spring Boot 연동)", details: ["Spring Boot와 AI 채팅을 연결하는 API를 구현해 새 메시지가 인입되면 이전 고민 맥락을 유지한 채 추가 질문 또는 유사 사용자 추천 결과를 반환하도록 구성했습니다.", "회원가입·정보 수정·탈퇴에 맞춰 Pinecone의 사용자 벡터를 등록·갱신·삭제하는 CRUD 동기화 API를 구현했습니다."] },
    ],
    troubleshooting: [
      { title: "모호한 고민 구체화와 판단 호출 줄이기", problem: "‘요즘 그냥 좀 힘들어’처럼 모호한 입력도 LLM이 고민으로 분류했지만 상황 정보가 부족해 매칭하기 어려웠습니다. 1차로 고민 구체성 점수를 도입해 기준 미달 시 구체화 유도 질문을 반환했으나, 분류 후 구체성 평가를 별도로 수행하면서 순차 호출이 발생해 비용과 응답 지연이 증가했습니다.", solution: "TypeSafe Jev와 LangGraph로 구조를 재구성해 현재 입력과 이전 고민을 바탕으로 의도와 매칭 가능성을 1회 요청으로 통합 판단하도록 개선했습니다. 정보가 충분하면 Pinecone 검색으로, 부족하면 추가 질문으로, ‘더 보여줘’ 요청 시 세션 캐시 기반 추가 목록 반환으로 분기했습니다.", result: "두 판단을 Jev 단일 호출로 통합해 전체 응답 시간 p95를 3,212ms → 1,784ms로 44.4% 감소시켰고, 70턴 실측(Solar Pro 4·Upstage 임베딩·Jev 토큰·Pinecone read) 기준 1,000턴 예상 API 비용을 28.9% 절감했습니다." },
    ],
    learnings: ["초기에 기능 요구사항을 구체적으로 정리하지 않아 팀원마다 기능을 다르게 이해했고, 구현 후 재설계와 재구현이 발생했습니다.", "개발 전 기능과 동작 방식을 명확하게 정의하고 팀원 간 공통 이해를 맞추는 과정이 중요하다는 것을 배웠습니다."],
    tags: ["Python", "LangChain", "LangGraph", "TypeSafe Jev", "Pinecone", "FastAPI", "Spring Boot"],
    highlight: "p95 44.4% ↓ · 3rd",
    gridSpan: "medium",
  },
];

const PROJECT_ICONS = { capteam: Users, jichini: BrainCircuit };

export function Projects() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  return (
    <section id="projects" className="py-16 border-t border-white/5 relative scroll-mt-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <div className="flex items-center gap-1.5 font-mono text-xs text-primary-emerald tracking-widest uppercase mb-1"><Layers className="w-3.5 h-3.5" /> FEATURED PROJECTS</div>
            <h3 className="font-display text-3xl font-bold tracking-tight">문제에서 시작한 AI 프로젝트</h3>
          </div>
          <p className="text-on-surface-variant text-sm max-w-md">모델 적용에 그치지 않고 데이터 구조, 워크플로, API와 실패 복구까지 직접 고민했습니다.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {PROJECTS_DATA.map((project, idx) => {
            const Icon = PROJECT_ICONS[project.id as keyof typeof PROJECT_ICONS];
            const grid = project.gridSpan === "large" ? "col-span-12 lg:col-span-8" : "col-span-12 md:col-span-6 lg:col-span-4";
            return (
              <motion.button key={project.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * .08 }} onClick={() => setSelectedProject(project)} className={`${grid} text-left glass-card rounded-2xl p-6 md:p-8 min-h-[280px] flex flex-col justify-between group overflow-hidden relative cursor-pointer`}>
                <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-primary-emerald/10 blur-3xl group-hover:bg-primary-emerald/20 transition-colors" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-4 mb-10">
                    <div className="w-12 h-12 rounded-2xl bg-primary-emerald/10 border border-primary-emerald/25 flex items-center justify-center text-primary-emerald"><Icon className="w-6 h-6" /></div>
                    <span className="font-mono text-xs text-primary-glow border border-primary-emerald/20 rounded-full px-3 py-1">{project.highlight}</span>
                  </div>
                  <h4 className="font-display text-2xl font-bold mb-3 group-hover:text-primary-glow transition-colors">{project.title}</h4>
                  <p className="text-on-surface-variant text-sm leading-relaxed max-w-xl">{project.description}</p>
                </div>
                <div className="relative flex items-center justify-between mt-8 pt-5 border-t border-white/5">
                  <div className="flex flex-wrap gap-2">{project.tags.slice(0, 3).map(tag => <span key={tag} className="font-mono text-[10px] text-on-surface-variant">#{tag}</span>)}</div>
                  <MoveRight className="w-4 h-4 text-primary-emerald group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>{selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setSelectedProject(null)} className="absolute inset-0 bg-void/85 backdrop-blur-md" />
          <motion.div initial={{opacity:0,scale:.96,y:16}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.96,y:16}} className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto glass-card rounded-3xl p-7 md:p-10 z-10">
            <button onClick={() => setSelectedProject(null)} aria-label="닫기" className="absolute top-5 right-5 w-9 h-9 rounded-full bg-surface-high flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
            <div className="flex items-center gap-2 text-xs font-mono text-primary-emerald mb-3"><Sparkles className="w-4 h-4" /> PROJECT DEEP DIVE</div>
            <h3 className="font-display text-3xl font-bold mb-3">{selectedProject.title}</h3>
            <p className="text-primary-glow text-sm mb-5">{selectedProject.description}</p>
            <div className="grid sm:grid-cols-2 gap-3 mb-8 text-xs">
              <div className="bg-surface-dim rounded-xl p-4"><div className="font-mono text-primary-emerald mb-1">PERIOD</div><div className="text-on-surface-variant">{selectedProject.period}</div></div>
              <div className="bg-surface-dim rounded-xl p-4"><div className="font-mono text-primary-emerald mb-1">MY ROLE</div><div className="text-on-surface-variant">{selectedProject.role}</div></div>
            </div>
            <div className="flex flex-wrap gap-2 mb-9">{selectedProject.tags.map(tag => <span key={tag} className="text-xs font-mono bg-primary-emerald/10 text-primary-emerald border border-primary-emerald/20 rounded-lg px-3 py-1.5">{tag}</span>)}</div>

            <div className="space-y-10">
              <section>
                <div className="font-mono text-xs text-primary-emerald tracking-widest mb-3">01 · WHY</div>
                <h4 className="font-display text-xl font-bold mb-3">개발 동기</h4>
                <p className="text-on-surface-variant leading-7 text-sm">{selectedProject.motivation}</p>
              </section>

              <section>
                <div className="font-mono text-xs text-primary-emerald tracking-widest mb-3">02 · BUILD</div>
                <h4 className="font-display text-xl font-bold mb-4">개발 내용</h4>
                <div className="space-y-4">{selectedProject.development.map((item, index) => (
                  <div key={item.title} className="bg-surface-dim/70 border border-white/5 rounded-2xl p-5">
                    <h5 className="font-semibold text-on-surface mb-3">{index + 1}. {item.title}</h5>
                    <ul className="space-y-2">{item.details.map(detail => <li key={detail} className="text-sm text-on-surface-variant leading-6 flex gap-2"><span className="text-primary-emerald">•</span><span>{detail}</span></li>)}</ul>
                  </div>
                ))}</div>
              </section>

              <section>
                <div className="font-mono text-xs text-primary-emerald tracking-widest mb-3">03 · TROUBLESHOOTING</div>
                <h4 className="font-display text-xl font-bold mb-4">문제와 해결</h4>
                <div className="space-y-4">{selectedProject.troubleshooting.map(item => (
                  <div key={item.title} className="border-l-2 border-primary-emerald/60 pl-5 py-1">
                    <h5 className="font-semibold mb-3">{item.title}</h5>
                    <p className="text-sm leading-6 text-on-surface-variant mb-2"><span className="font-mono text-red-300/80 mr-2">PROBLEM</span>{item.problem}</p>
                    <p className="text-sm leading-6 text-on-surface-variant"><span className="font-mono text-primary-emerald mr-2">SOLUTION</span>{item.solution}</p>
                    {item.result && (
                      <p className="text-sm leading-6 text-primary-glow mt-2"><span className="font-mono text-primary-glow mr-2">RESULT</span>{item.result}</p>
                    )}
                  </div>
                ))}</div>
              </section>

              {selectedProject.learnings && (
                <section>
                  <div className="font-mono text-xs text-primary-emerald tracking-widest mb-3">04 · LEARNED</div>
                  <h4 className="font-display text-xl font-bold mb-4">배운 점</h4>
                  <ul className="space-y-2">{selectedProject.learnings.map(item => <li key={item} className="text-sm text-on-surface-variant leading-6 flex gap-2"><span className="text-primary-emerald">✓</span><span>{item}</span></li>)}</ul>
                </section>
              )}

              <section>
                <div className="font-mono text-xs text-primary-emerald tracking-widest mb-3">TEAM</div>
                <div className="grid sm:grid-cols-2 gap-2">{selectedProject.team.map(member => <div key={member} className="text-xs text-on-surface-variant bg-surface-dim rounded-lg px-3 py-2">{member}</div>)}</div>
              </section>
            </div>
            <div className="flex flex-wrap gap-3 pt-5 border-t border-white/5">
              {selectedProject.demoUrl && <a href={selectedProject.demoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-primary-emerald text-void font-semibold text-sm px-4 py-2.5 rounded-xl"><ExternalLink className="w-4 h-4" /> 모델 보기</a>}
              {selectedProject.githubUrl && <a href={selectedProject.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-surface-high text-sm px-4 py-2.5 rounded-xl"><Github className="w-4 h-4" /> GitHub</a>}
            </div>
          </motion.div>
        </div>
      )}</AnimatePresence>
    </section>
  );
}
