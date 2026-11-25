import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PortfolioNavigation, Project } from "../types";
import { ExternalLink, Github, Layers, MoveRight, X, Sparkles, BrainCircuit, Users, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const PROJECTS_DATA: Project[] = [
  {
    id: "capteam",
    title: "CapTeam",
    description: "학생 역량을 분석하고 검증 가능한 팀 구성을 만드는 AI 기반 캡스톤 관리 서비스",
    period: "2026.03.15 — 진행 중",
    role: "AI · AI Backend",
    team: ["김성현 — AI, AI Backend", "박진욱 — Backend, 배포", "허재원 — Frontend", "양원우 — Backend", "유채민 — AI"],
    motivation: "캡스톤 프로젝트에서 학생들은 팀원을 찾기 어렵고, 선생님은 팀 구성과 진행 상황 관리에 많은 시간을 들이는 문제를 해결하기 위해, AI 기반 자동 팀 생성과 캡스톤 진행 관리 기능을 한곳에서 제공하는 CapTeam을 기획했습니다.",
    development: [
      { title: "Dataset 설계", details: ["학생의 희망 직군, 기술 스택, 구현 기능과 로직, 선호 팀원, 팀장 선호도, 성격, 개발 성향을 바탕으로 AI가 역량을 분석할 수 있도록 설문 데이터 구조를 설계했습니다.", "학생 역량 분석 결과가 팀 매칭 로직의 입력으로 활용되도록 데이터를 구조화하고, 이를 기반으로 매칭 출력 데이터 구조를 설계했습니다."] },
      { title: "Structured Output", details: ["Pydantic 기반 structured output으로 학생 분석 결과와 팀 매칭 결과의 응답 형식을 고정했습니다.", "학생 경험에서 근거 키워드를 추출해 LLM 판단의 참고 정보로 프롬프트에 전달하고 출력 결과에 반영되도록 설계했습니다."] },
      { title: "LangGraph Workflow", details: ["학생 분석 결과로 1차 팀 매칭을 수행하고, 검증에서 발견된 문제를 LLM이 반복 보정한 뒤 검증을 통과한 결과만 출력하는 Reflection Loop를 구현했습니다.", "팀 생성 → LLM 보정 → 알고리즘 검증 → LLM 검증 → 최종 결과 저장 흐름을 구성해 결과의 안정성을 높였습니다."] },
      { title: "Backend Framework", details: ["FastAPI로 AI 팀 매칭 결과 조회 API를 구현했습니다.", "분석 및 매칭 결과를 JSON으로 저장하고 서비스 화면에 필요한 형태로 가공했으며, 팀원별 강점, 역할, 실력 등급과 기술 스택 점수를 반환하도록 설계했습니다."] },
    ],
    troubleshooting: [
      { title: "학생 분석 결과의 랜덤성과 과대평가", problem: "LLM 기반 역량 분석 결과가 실행마다 달라지고 단순 튜토리얼 수준의 구현 경험도 과대평가되는 문제가 있었습니다.", solution: "temperature를 0으로 설정하고 후처리 보정 로직을 추가했습니다. 경험 텍스트에서 '단순 구현'과 '실제 수행' 키워드 빈도를 추출해 프롬프트에 전달하고, 실제 수행 근거가 충분히 확인될 때만 보통 이상을 부여했으며, 최종 등급이 보통이면 최대 7점, 낮음이면 최대 4점으로 기술 점수 상한을 제한했습니다." },
      { title: "LLM 팀 수정의 최대 횟수 반복", problem: "팀원 선호 미반영까지 오류로 간주해 최대 횟수까지 팀을 수정하면서 응답 시간과 비용이 급증하고 정상 팀 구성도 계속 변경됐습니다.", solution: "학생 누락·중복과 인원 제한 위반만 '필수 오류'로 정의하고, 팀원 선호 미반영은 '참고 경고'로 분리했습니다. 반복 횟수와 이전 수정 내역을 기록해 동일 패턴 반복을 막았으며, 최대 횟수 초과 시 규칙 기반(Rule-based) 알고리즘으로 자동 fallback하도록 설계했습니다." },
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
      {
        title: "Jev 기반 입력 판단 및 LangGraph 응답 분기",
        details: [
          "TypeSafe Jev를 연동해 현재 입력과 이전 맥락을 바탕으로 사용자 의도, 매칭 요청 여부, 정보 충분성, 확인 질문 응답을 한 번의 요청으로 판단했습니다.",
          "LangGraph로 상담 중심 흐름을 구성해 구체적인 고민이 확인되면 공감 답변과 함께 매칭 여부를 먼저 묻고, 사용자 확인(HITL)에 따라 유사 사용자 매칭, 상담 이어가기, 과거 고민 복귀, 결과 더보기로 분기했습니다.",
          "고민 정보가 부족할 때는 바로 매칭하지 않고 상황이나 감정을 자연스럽게 물어볼 수 있도록 안내 답변 프롬프트를 설계했습니다.",
        ],
      },
      {
        title: "pgvector 기반 유사 사용자 매칭",
        details: [
          "고민 원문과 검색 데이터를 분리했습니다. PostgreSQL·pgvector에 실제 사용자 ID와 고민 원문을 내부 데이터로 보관하고, 추천 결과에는 무작위 추천용 ID, 지역, 공개용 주제 요약만 반환했습니다.",
          "개체명 인식(NER)과 정규식으로 식별정보를 가렸습니다. 서버 내부에서 로컬 한국어 NER(KoELECTRA)과 정규식으로 이름·연락처·주소 등을 가린 뒤, 고민의 구체적인 상황을 Upstage Solar Embedding 1 Large로 벡터화했습니다. 비식별에 실패하면 외부 API를 호출하지 않습니다.",
          "캐시된 비식별 검색 문장으로 지역 필터 기반 코사인 유사도 검색을 실행했습니다. 비슷한 고민이 적을 때는 거리 기준에 따라 안내 문구를 함께 표시하고, ‘더 보여줘’ 요청 시 첫 검색 순서를 유지하되 수정·삭제된 후보는 자동으로 제외합니다.",
        ],
      },
      {
        title: "PostgreSQL 영속 대화 메모리",
        details: [
          "대화가 끊기지 않도록 나누던 대화, 현재 고민 요약, 확인 대기 상태를 PostgreSQL에 저장해 서버 재시작이나 재접속 후에도 대화를 이어갈 수 있게 구현했습니다. 같은 사용자가 메시지를 연속으로 빠르게 보내도 DB 잠금(Advisory Lock)으로 요청을 순서대로 처리해 상태 꼬임을 방지했습니다.",
          "최근 대화는 최대 5,000토큰(최소 2턴 보장) 한도 안에서 불러오고, 중간에 추천해 준 다른 사용자의 고민 목록은 AI가 사용자 본인의 고민으로 착각하지 않도록 짧은 시스템 기록(“유사 사용자를 추천함”) 한 줄로 분리해 전달했습니다.",
          "오래된 대화가 잘려도 핵심을 잊지 않도록 관련 인물·사건·감정·상황·원하는 도움을 비식별 상태로 누적 유지하며, 요약이 1,000토큰을 넘을 때만 600토큰 이하로 자동 압축하도록 설계했습니다.",
          "로그인한 사용자는 이전 고민을 최대 30개까지 장기 보관할 수 있습니다. 과거 고민 복귀 요청 시 보관된 고민이 10개 이하일 때는 DB 목록에서 바로 찾고, 10개를 넘으면 pgvector 유사도 검색으로 상위 5개 후보를 추린 뒤 찾아줍니다.",
        ],
      },
      {
        title: "Backend Framework",
        details: [
          "회원가입·정보 수정·탈퇴에 맞춰 PostgreSQL·pgvector의 고민 원문과 검색 벡터를 등록·갱신·삭제하는 API를 구현했습니다.",
          "수정 시 추천용 ID를 새로 교체하고, 탈퇴 시 원문·벡터·대화 메모리를 하나의 트랜잭션에서 함께 파기합니다.",
        ],
      },
    ],
    troubleshooting: [
      {
        title: "모호한 고민 구체화와 판단 호출 줄이기",
        problem: "사용자가 ‘요즘 그냥 좀 힘들어’라고 입력하면 LLM은 이를 고민으로 분류했지만 어떤 상황이 힘든지 알기 어려워 추천하기에는 정보가 부족했습니다. 1차로 고민 구체성 점수를 도입해 기준 미달 시 구체화 유도 질문을 반환했으나, 입력 분류 뒤에 구체성 평가를 별도로 수행하면서 순차 호출이 발생해 비용과 응답 대기 시간이 늘어났습니다.",
        solution: "TypeSafe Jev를 도입해 현재 입력과 이전 고민을 바탕으로 입력 의도와 매칭 가능성을 한 번의 요청에서 함께 판단하도록 바꿨습니다. LangGraph는 정보가 충분하면 PostgreSQL에서 유사 사용자를 검색하고, 부족하면 추가 질문을 생성하며, ‘더 보여줘’로 분류되면 세션에 저장된 추천 결과에서 다음 목록을 반환합니다.",
        result: "두 판단을 Jev 호출 한 번으로 통합해 전체 응답 시간 p95를 3,212ms → 1,784ms로 44.4% 감소시켰고, 도입 전후 각 70턴 실측(Solar Pro 4·Upstage 임베딩·Jev 토큰 사용량) 기준 1,000턴 예상 API 비용을 28.9% 절감했습니다.",
      },
      {
        title: "유사 사용자 검색 방식 개선",
        problem: "벡터 검색에 키워드 검색(BM25·규칙 키워드)을 RRF로 결합하거나 로컬 Cross-Encoder로 재정렬하면 정확도가 높아질 것으로 예상했으나, 일상 고민은 구어체 표현 차이(‘토요일 일요일’ vs ‘주말’, ‘남 욕’ vs ‘험담’)가 커 100명 후보·32건 평가셋에서 키워드 점수가 정답을 밀어내 정확도가 84.6%(22/26)까지 떨어졌습니다. 로컬 Cross-Encoder도 벡터 단독(47/57)보다 낮은 39/57을 기록하며 CPU 지연(p50 950ms)만 늘렸고, 단순 하이브리드 검색은 인사·잡담에도 헛매칭을 발생시켰습니다.",
        solution: "키워드 RRF와 리랭커를 기본 검색에서 제외하고, 개인정보만 가린 고민 상황 문장의 벡터 단독 검색에 TypeSafe Jev 의도·정보 충분성 판단을 결합하는 구조로 확정했습니다. 인사·잡담·정보 부족 입력은 검색 전에 차단하고 구체적인 고민일 때만 벡터 검색을 실행합니다.",
        result: "격리된 PostgreSQL 17·pgvector 환경(합성 후보 100명·평가셋 32건, 실제 Jev·Upstage·로컬 NER·로컬 BGE 모델 연결)에서 측정한 결과, 불필요한 지연과 헛매칭을 제거하면서 검색 정확도(Top-1)를 84.6% → 96.2%로 11.6%p 향상했습니다.",
      },
    ],
    learnings: ["초기에 기능 요구사항을 구체적으로 정리하지 않아 팀원마다 기능을 다르게 이해했고, 구현 후 재설계와 재구현이 발생했습니다.", "개발 전 기능과 동작 방식을 명확하게 정의하고 팀원 간 공통 이해를 맞추는 과정이 중요하다는 것을 배웠습니다."],
    tags: ["Python", "LangChain", "LangGraph", "TypeSafe Jev", "PostgreSQL", "pgvector", "FastAPI"],
    highlight: "Top-1 96.2% · p95 44.4% ↓",
    gridSpan: "medium",
  },
];

const PROJECT_ICONS = { capteam: Users, jichini: BrainCircuit };

export function Projects({
  navigation,
  isChatOpen = false,
}: {
  navigation?: { nav: PortfolioNavigation; nonce: number } | null;
  isChatOpen?: boolean;
}) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const highlightedCard =
    navigation?.nav.section === "projects" ? navigation.nav.highlightText || null : null;
  const highlightedSection =
    navigation?.nav.section === "projects" && !highlightedCard
      ? navigation.nav.modalSection || null
      : null;

  useEffect(() => {
    if (!navigation) return;
    if (navigation.nav.section !== "projects") {
      setSelectedProject(null);
      return;
    }
    const { projectId, modalSection, highlightText } = navigation.nav;
    if (!projectId) return;

    const matched = PROJECTS_DATA.find((p) => p.id === projectId);
    if (!matched) return;
    setSelectedProject(matched);

    const timer = window.setTimeout(() => {
      const container = modalBodyRef.current;
      if (!container) return;
      let target: HTMLElement | null = null;
      if (highlightText) {
        target = container.querySelector<HTMLElement>(`[data-nav-card="${CSS.escape(highlightText)}"]`);
      }
      if (!target && modalSection) {
        target = container.querySelector<HTMLElement>(`#${modalSection}`);
      }
      if (target) {
        const top =
          container.scrollTop +
          target.getBoundingClientRect().top -
          container.getBoundingClientRect().top -
          28;
        container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [navigation]);

  useEffect(() => {
    if (!selectedProject) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedProject(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedProject]);

  const scrollToSection = (sectionId: string) => {
    const container = modalBodyRef.current;
    const target = container?.querySelector<HTMLElement>(`#${sectionId}`);
    if (!container || !target) return;
    const top =
      container.scrollTop +
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      28;
    container.scrollTo({
      top: Math.max(0, top),
      behavior: "smooth",
    });
  };

  return (
    <section id="projects" className="py-24 md:py-36 border-t border-white/5 relative scroll-mt-24">
      <div>
        <div className="mb-14 md:mb-16">
          <div className="flex items-center gap-1.5 font-mono text-xs text-primary-emerald [:is(.light)_&]:text-violet-600 tracking-widest uppercase mb-2"><Layers className="w-3.5 h-3.5" /> FEATURED PROJECTS</div>
          <h3 className="font-display text-3xl font-bold tracking-tight text-on-surface">Project</h3>
        </div>

        <div className="grid grid-cols-1 gap-9 md:gap-12">
          {PROJECTS_DATA.map((project, idx) => {
            const Icon = PROJECT_ICONS[project.id as keyof typeof PROJECT_ICONS];
            const isCapTeam = project.id === "capteam";
            const lightAccent = isCapTeam
              ? {
                  glowBg: "[:is(.light)_&]:from-indigo-500/0 [:is(.light)_&]:via-indigo-500/0 [:is(.light)_&]:to-indigo-500/[0.04]",
                  orb: "[:is(.light)_&]:hidden",
                  iconBox: "[:is(.light)_&]:bg-indigo-50 [:is(.light)_&]:border-indigo-200 [:is(.light)_&]:text-indigo-600 [:is(.light)_&]:group-hover:bg-indigo-100 [:is(.light)_&]:group-hover:border-indigo-300 [:is(.light)_&]:group-hover:shadow-none",
                  badge: "[:is(.light)_&]:text-indigo-700 [:is(.light)_&]:bg-indigo-50 [:is(.light)_&]:border-indigo-200 [:is(.light)_&]:group-hover:border-indigo-300 [:is(.light)_&]:group-hover:bg-indigo-100/70",
                  titleHover: "[:is(.light)_&]:group-hover:text-indigo-700",
                  arrow: "[:is(.light)_&]:border-[#E5E7EB] [:is(.light)_&]:bg-[#F9FAFB] [:is(.light)_&]:text-[#111827] [:is(.light)_&]:group-hover:bg-[#111827] [:is(.light)_&]:group-hover:text-white [:is(.light)_&]:group-hover:border-[#111827] [:is(.light)_&]:group-hover:shadow-none",
                }
              : {
                  glowBg: "[:is(.light)_&]:from-orange-500/0 [:is(.light)_&]:via-orange-500/0 [:is(.light)_&]:to-orange-500/[0.04]",
                  orb: "[:is(.light)_&]:hidden",
                  iconBox: "[:is(.light)_&]:bg-orange-50 [:is(.light)_&]:border-orange-200 [:is(.light)_&]:text-orange-600 [:is(.light)_&]:group-hover:bg-orange-100 [:is(.light)_&]:group-hover:border-orange-300 [:is(.light)_&]:group-hover:shadow-none",
                  badge: "[:is(.light)_&]:text-orange-700 [:is(.light)_&]:bg-orange-50 [:is(.light)_&]:border-orange-200 [:is(.light)_&]:group-hover:border-orange-300 [:is(.light)_&]:group-hover:bg-orange-100/70",
                  titleHover: "[:is(.light)_&]:group-hover:text-orange-700",
                  arrow: "[:is(.light)_&]:border-[#E5E7EB] [:is(.light)_&]:bg-[#F9FAFB] [:is(.light)_&]:text-[#111827] [:is(.light)_&]:group-hover:bg-[#111827] [:is(.light)_&]:group-hover:text-white [:is(.light)_&]:group-hover:border-[#111827] [:is(.light)_&]:group-hover:shadow-none",
                };
            return (
              <motion.button
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -8, scale: 1.018, transition: { type: 'spring', stiffness: 320, damping: 22, delay: 0 } }}
                whileTap={{ scale: 0.99, transition: { duration: 0.1 } }}
                viewport={{ once: true, amount: "some" }}
                transition={{ delay: idx * 0.08, duration: 0.4 }}
                onClick={() => setSelectedProject(project)}
                aria-label={`${project.title} 프로젝트 상세 보기`}
                className="text-left glass-card project-card-interactive rounded-3xl p-8 sm:p-10 md:p-12 min-h-[340px] flex flex-col justify-between group overflow-hidden relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-emerald/70 [:is(.light)_&]:focus-visible:ring-[#111827]/40"
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-emerald/0 via-primary-emerald/0 to-primary-emerald/10 ${lightAccent.glowBg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className={`pointer-events-none absolute -right-14 -top-14 w-56 h-56 rounded-full bg-primary-emerald/10 ${lightAccent.orb} blur-3xl group-hover:scale-125 group-hover:bg-primary-emerald/25 transition-all duration-500`} />
                <div className="relative">
                  <div className="flex items-start justify-between gap-4 mb-10">
                    <div className={`w-12 h-12 rounded-2xl bg-primary-emerald/10 border border-primary-emerald/25 flex items-center justify-center text-primary-emerald shrink-0 group-hover:scale-110 group-hover:bg-primary-emerald/20 group-hover:border-primary-emerald/60 group-hover:shadow-[0_0_24px_rgba(16,185,129,0.35)] ${lightAccent.iconBox} transition-all duration-300`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className={`font-mono text-xs text-primary-glow bg-primary-emerald/10 border border-primary-emerald/20 rounded-full px-3 py-1 group-hover:border-primary-emerald/45 group-hover:bg-primary-emerald/15 ${lightAccent.badge} transition-colors duration-300`}>
                      {project.highlight}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-on-surface-variant [:is(.light)_&]:text-[#71717A] mb-2">{project.period}</div>
                  <h4 className={`font-display text-2xl md:text-3xl font-bold mb-4 text-on-surface group-hover:text-primary-glow ${lightAccent.titleHover} transition-colors duration-300`}>{project.title}</h4>
                  <p className="text-on-surface/85 [:is(.light)_&]:text-[#374151] text-base leading-8 max-w-3xl">{project.description}</p>
                </div>
                <div className="relative flex items-center justify-between gap-4 mt-10 pt-6 border-t border-white/5 [:is(.light)_&]:border-[#E5E7EB] group-hover:border-primary-emerald/20 [:is(.light)_&]:group-hover:border-[#D1D5DB] transition-colors duration-300">
                  <div className="flex flex-wrap gap-2">
                    {project.tags.map(tag => (
                      <span key={tag} className="font-mono text-[11px] text-on-surface-variant [:is(.light)_&]:text-[#374151] bg-surface-high/60 [:is(.light)_&]:bg-[#F9FAFB] [:is(.light)_&]:border [:is(.light)_&]:border-[#E5E7EB] px-2.5 py-1 rounded-md group-hover:bg-surface-high [:is(.light)_&]:group-hover:bg-[#F3F4F6] transition-colors duration-300">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <span className={`w-9 h-9 rounded-full border border-primary-emerald/25 bg-primary-emerald/10 text-primary-emerald flex items-center justify-center shrink-0 group-hover:bg-primary-emerald group-hover:text-void group-hover:border-primary-emerald group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.45)] ${lightAccent.arrow} transition-all duration-300`}>
                    <MoveRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-300" />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {selectedProject && (
              <div
                className={`fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6 md:p-8 ${
                  isChatOpen ? "lg:z-[110] lg:justify-start lg:pr-[480px]" : ""
                }`}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSelectedProject(null)}
                  className="absolute inset-0 modal-backdrop"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 16 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="project-modal-title"
                  className="relative z-10 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden modal-shell rounded-3xl"
                >
                  {/* Sticky Modal Header */}
                  <div className="shrink-0 px-6 md:px-9 py-5 border-b border-on-surface/10 flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5 mb-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-primary-emerald [:is(.light)_&]:text-indigo-600 tracking-widest uppercase">
                            <Sparkles className="w-3.5 h-3.5" /> PROJECT DEEP DIVE
                          </span>
                          <span className="font-mono text-[11px] text-primary-emerald [:is(.light)_&]:text-orange-700 bg-primary-emerald/10 [:is(.light)_&]:bg-orange-50 border border-primary-emerald/25 [:is(.light)_&]:border-orange-200 rounded-full px-2.5 py-0.5">
                            {selectedProject.highlight}
                          </span>
                        </div>
                        <h3 id="project-modal-title" className="font-display text-2xl md:text-3xl font-bold tracking-tight text-on-surface">
                          {selectedProject.title}
                        </h3>
                      </div>

                      <button
                        onClick={() => setSelectedProject(null)}
                        aria-label="닫기"
                        className="w-9 h-9 rounded-full bg-surface-high/80 [:is(.light)_&]:bg-[#F9FAFB] hover:bg-surface-high [:is(.light)_&]:hover:bg-[#F3F4F6] border border-on-surface/10 [:is(.light)_&]:border-[#E5E7EB] flex items-center justify-center text-on-surface cursor-pointer shrink-0 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick Section Navigation */}
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: "modal-overview", label: "01 개요 & 동기" },
                        { id: "modal-build", label: "02 개발 내용" },
                        { id: "modal-troubleshooting", label: "03 문제와 해결" },
                        ...(selectedProject.learnings ? [{ id: "modal-learned", label: "04 배운 점" }] : []),
                      ].map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => scrollToSection(tab.id)}
                          className="font-mono text-xs px-3 py-1.5 rounded-lg bg-surface-high/60 [:is(.light)_&]:bg-[#F9FAFB] hover:bg-primary-emerald/15 [:is(.light)_&]:hover:bg-[#111827] hover:text-primary-emerald [:is(.light)_&]:hover:text-white text-on-surface-variant [:is(.light)_&]:text-[#374151] border border-on-surface/10 [:is(.light)_&]:border-[#E5E7EB] hover:border-primary-emerald/30 [:is(.light)_&]:hover:border-[#111827] transition-colors cursor-pointer"
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scrollable Modal Body */}
                  <div ref={modalBodyRef} className="relative flex-1 overflow-y-auto px-6 md:px-9 py-8 space-y-12">
                    {/* 01 Overview & Metadata Grid */}
                    <section id="modal-overview" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      <div className="lg:col-span-7 space-y-5">
                        <p className="text-base md:text-lg font-medium text-primary-emerald [:is(.light)_&]:text-[#0A0A0A] leading-relaxed">
                          {selectedProject.description}
                        </p>
                        <div className="modal-card rounded-2xl p-6">
                          <div className="font-mono text-xs text-primary-emerald [:is(.light)_&]:text-indigo-600 tracking-widest mb-2">01 · WHY</div>
                          <h4 className="font-display text-lg font-bold mb-3 text-on-surface">개발 동기</h4>
                          <p className="text-on-surface/90 [:is(.light)_&]:text-[#374151] leading-7 text-sm md:text-[15px]">
                            {selectedProject.motivation}
                          </p>
                        </div>
                      </div>

                      <div className="lg:col-span-5 modal-card rounded-2xl p-6 space-y-5">
                        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-on-surface/10 [:is(.light)_&]:border-[#E5E7EB]">
                          <div>
                            <div className="font-mono text-[11px] text-primary-emerald [:is(.light)_&]:text-[#71717A] tracking-wider mb-1">PERIOD</div>
                            <div className="text-sm font-medium text-on-surface">{selectedProject.period}</div>
                          </div>
                          <div>
                            <div className="font-mono text-[11px] text-primary-emerald [:is(.light)_&]:text-[#71717A] tracking-wider mb-1">MY ROLE</div>
                            <div className="text-sm font-medium text-on-surface">{selectedProject.role}</div>
                          </div>
                        </div>

                        <div>
                          <div className="font-mono text-[11px] text-primary-emerald [:is(.light)_&]:text-[#71717A] tracking-wider mb-2.5">TECH STACK</div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedProject.tags.map(tag => (
                              <span
                                key={tag}
                                className="text-xs font-mono bg-primary-emerald/10 [:is(.light)_&]:bg-white text-primary-emerald [:is(.light)_&]:text-[#374151] border border-primary-emerald/20 [:is(.light)_&]:border-[#E5E7EB] rounded-md px-2.5 py-1"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="font-mono text-[11px] text-primary-emerald [:is(.light)_&]:text-[#71717A] tracking-wider mb-2.5">TEAM</div>
                          <div className="flex flex-wrap gap-2">
                            {selectedProject.team.map(member => (
                              <span
                                key={member}
                                className="text-xs text-on-surface/90 [:is(.light)_&]:text-[#374151] bg-surface-high/80 [:is(.light)_&]:bg-white border border-on-surface/15 [:is(.light)_&]:border-[#E5E7EB] rounded-lg px-2.5 py-1.5"
                              >
                                {member}
                              </span>
                            ))}
                          </div>
                        </div>

                        {(selectedProject.demoUrl || selectedProject.githubUrl) && (
                          <div className="flex flex-wrap gap-2.5 pt-2 border-t border-on-surface/10 [:is(.light)_&]:border-[#E5E7EB]">
                            {selectedProject.demoUrl && (
                              <a
                                href={selectedProject.demoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 bg-primary-emerald [:is(.light)_&]:bg-[#111827] text-void [:is(.light)_&]:text-white font-semibold text-xs px-3.5 py-2 rounded-xl"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> 모델 보기
                              </a>
                            )}
                            {selectedProject.githubUrl && (
                              <a
                                href={selectedProject.githubUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 bg-surface-high [:is(.light)_&]:bg-white [:is(.light)_&]:border [:is(.light)_&]:border-[#E5E7EB] [:is(.light)_&]:text-[#111827] text-xs font-medium px-3.5 py-2 rounded-xl"
                              >
                                <Github className="w-3.5 h-3.5" /> GitHub
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </section>

                    {/* 02 Build Grid */}
                    <section id="modal-build">
                      <div className="flex items-end justify-between gap-4 mb-6">
                        <div>
                          <div className="font-mono text-xs text-primary-emerald [:is(.light)_&]:text-violet-600 tracking-widest mb-1.5">02 · BUILD</div>
                          <h4 className="font-display text-2xl font-bold text-on-surface">개발 내용</h4>
                        </div>
                        <span className="font-mono text-xs text-on-surface-variant [:is(.light)_&]:text-[#71717A]">
                          {selectedProject.development.length} Modules
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {selectedProject.development.map((item, index) => {
                          const spanFull =
                            selectedProject.development.length % 2 === 1 &&
                            index === selectedProject.development.length - 1;
                          return (
                            <div
                              key={item.title}
                              data-nav-card={item.title}
                              className={`modal-card rounded-2xl p-6 flex flex-col gap-4 transition-all duration-300 ${
                                spanFull ? "md:col-span-2" : ""
                              } ${
                                highlightedCard === item.title || highlightedSection === "modal-build"
                                  ? "nav-highlight-glow"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center gap-3 pb-3 border-b border-on-surface/10 [:is(.light)_&]:border-[#E5E7EB]">
                                <span className="font-mono text-xs font-semibold text-primary-emerald [:is(.light)_&]:text-indigo-700 bg-primary-emerald/10 [:is(.light)_&]:bg-indigo-50 border border-primary-emerald/25 [:is(.light)_&]:border-indigo-200 rounded-lg px-2.5 py-1">
                                  0{index + 1}
                                </span>
                                <h5 className="font-display text-base font-bold text-on-surface">{item.title}</h5>
                              </div>
                              <ul className="space-y-3">
                                {item.details.map(detail => (
                                  <li
                                    key={detail}
                                    className="text-[14.5px] text-on-surface/90 [:is(.light)_&]:text-[#374151] leading-7 flex items-start gap-2.5"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-emerald [:is(.light)_&]:bg-[#111827] shrink-0 mt-2.5" />
                                    <span>{detail}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* 03 Troubleshooting Structured Cards */}
                    <section id="modal-troubleshooting">
                      <div className="flex items-end justify-between gap-4 mb-6">
                        <div>
                          <div className="font-mono text-xs text-primary-emerald [:is(.light)_&]:text-orange-600 tracking-widest mb-1.5">
                            03 · TROUBLESHOOTING
                          </div>
                          <h4 className="font-display text-2xl font-bold text-on-surface">문제와 해결</h4>
                        </div>
                        <span className="font-mono text-xs text-on-surface-variant [:is(.light)_&]:text-[#71717A]">
                          {selectedProject.troubleshooting.length} Cases
                        </span>
                      </div>

                      <div className="space-y-6">
                        {selectedProject.troubleshooting.map((item, idx) => (
                          <div
                            key={item.title}
                            data-nav-card={item.title}
                            className={`modal-card rounded-2xl p-6 md:p-7 space-y-5 transition-all duration-300 ${
                              highlightedCard === item.title || highlightedSection === "modal-troubleshooting"
                                ? "nav-highlight-glow"
                                : ""
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-mono text-[11px] font-semibold text-primary-emerald [:is(.light)_&]:text-orange-700 bg-primary-emerald/10 [:is(.light)_&]:bg-orange-50 border border-primary-emerald/25 [:is(.light)_&]:border-orange-200 rounded-full px-3 py-1">
                                CASE 0{idx + 1}
                              </span>
                              <h5 className="font-display text-lg font-bold text-on-surface">{item.title}</h5>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="modal-problem-box rounded-xl p-4 md:p-5 space-y-2.5">
                                <span className="inline-block font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-md modal-problem-badge">
                                  PROBLEM
                                </span>
                                <p className="text-[14.5px] leading-7 text-on-surface/90 [:is(.light)_&]:text-[#374151]">{item.problem}</p>
                              </div>

                              <div className="modal-solution-box rounded-xl p-4 md:p-5 space-y-2.5">
                                <span className="inline-block font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-primary-emerald/15 [:is(.light)_&]:bg-emerald-50 text-primary-emerald [:is(.light)_&]:text-emerald-700 [:is(.light)_&]:border [:is(.light)_&]:border-emerald-200">
                                  SOLUTION
                                </span>
                                <p className="text-[14.5px] leading-7 text-on-surface/90 [:is(.light)_&]:text-[#374151]">{item.solution}</p>
                              </div>
                            </div>

                            {item.result && (
                              <div className="modal-result-box rounded-xl px-4 md:px-5 py-3.5 flex flex-col sm:flex-row sm:items-start gap-2.5 sm:gap-4">
                                <span className="inline-flex self-start font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-primary-emerald [:is(.light)_&]:bg-[#111827] text-on-primary-dark [:is(.light)_&]:text-white shrink-0 mt-0.5">
                                  RESULT
                                </span>
                                <p className="text-[14.5px] leading-7 font-medium text-on-surface [:is(.light)_&]:text-[#0A0A0A]">{item.result}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* 04 Learned Grid */}
                    {selectedProject.learnings && (
                      <section id="modal-learned">
                        <div className="mb-6">
                          <div className="font-mono text-xs text-primary-emerald [:is(.light)_&]:text-emerald-600 tracking-widest mb-1.5">
                            04 · LEARNED
                          </div>
                          <h4 className="font-display text-2xl font-bold text-on-surface">배운 점</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {selectedProject.learnings.map(item => (
                            <div key={item} className="modal-card rounded-2xl p-5 flex items-start gap-3.5">
                              <CheckCircle2 className="w-5 h-5 text-primary-emerald [:is(.light)_&]:text-emerald-600 shrink-0 mt-0.5" />
                              <p className="text-[14.5px] text-on-surface/90 [:is(.light)_&]:text-[#374151] leading-7">{item}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </section>
  );
}
