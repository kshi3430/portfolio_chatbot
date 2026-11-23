import OpenAI from "openai";
import portfolioData from "../data/projects.json" with { type: "json" };
import personalData from "../data/personal.json" with { type: "json" };

export const config = {
  maxDuration: 30,
};

type IntentType =
  | "chitchat"
  | "personal_tmi"
  | "career_profile"
  | "project_overview"
  | "project_deep_dive"
  | "out_of_scope";

type TargetProjectType = "project-jichini" | "project-capteam" | "both" | "none";
type UITargetType =
  | "none"
  | "skills"
  | "awards"
  | "activities"
  | "education"
  | "projects_list"
  | "project_detail";

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type RagDocument = {
  id: string;
  title: string;
  content: string;
  docCategory: "profile" | "project" | "personal";
  documentType: string;
  section: string;
  topic?: string;
  projectId?: string;
};

type EmbeddedDocument = RagDocument & {
  embedding: number[];
};

const CHAT_MODEL = process.env.UPSTAGE_MODEL || "solar-pro4";
const EMBEDDING_PASSAGE_MODEL =
  process.env.UPSTAGE_EMBEDDING_PASSAGE_MODEL || "solar-embedding-2-passage";
const EMBEDDING_QUERY_MODEL =
  process.env.UPSTAGE_EMBEDDING_QUERY_MODEL || "solar-embedding-2-query";
const UPSTAGE_BASE_URL = process.env.UPSTAGE_BASE_URL || "https://api.upstage.ai/v1";

const OUT_OF_SCOPE_RESPONSE =
  "죄송합니다. 저는 AI Engineer 김성현의 포트폴리오 어시스턴트여서 김성현의 프로젝트, 기술 스택, 이력 및 개인 소개와 관련된 질문에만 답변드릴 수 있습니다.";

const CHITCHAT_SYSTEM_PROMPT = `당신은 AI Engineer 김성현의 포트폴리오 어시스턴트입니다.
사용자의 인사, 감사, 안부나 어시스턴트 소개 요청에 친절하고 자연스럽게 1~2문장으로 답하세요.
김성현의 AI 프로젝트(JICHINI, CapTeam), 기술 스택, 수상 경력, 또는 가벼운 개인정보에 대해 편하게 물어볼 수 있다고 짧게 안내하세요.
마크다운 굵게 표시(**텍스트**)는 절대 사용하지 마세요.`;

const COMMON_GUARDRAILS = `공통 필수 규칙:
1. 반드시 주어진 참고 문서에 있는 사실만 사용해서 답변하세요. 참고 문서에 없는 수치, 수상명, 기술, 역할, 개인정보는 절대 추측하거나 지어내지 마세요.
2. 답변은 한국어로 작성하고, 사용자가 영어로 질문한 경우에만 영어로 답변하세요.
3. 이전 대화가 있으면 "그 프로젝트", "그 기술"처럼 생략된 대상을 이전 대화에서 찾아 현재 질문을 해석하되, 이전 답변이 참고 문서와 충돌하면 반드시 참고 문서를 우선하세요.
4. 참고 문서들은 검색 후보일 뿐입니다. 모든 문서를 요약하려 하지 말고 현재 질문에 직접 답이 되는 사실만 선별하되, 동일한 질문 주제에 대한 정보가 여러 문서에 나뉘어 있으면 빠짐없이 통합해 답하세요.
5. 질문에서 직접 묻지 않은 부가 정보(팀원 구성, 개발 기간, 다른 프로젝트 내용 등)는 참고 문서에 있더라도 덧붙이지 마세요.
6. 참고 문서의 문장을 그대로 길게 옮기지 말고, 핵심만 간결하고 정돈된 문장으로 요약해 답하세요.
7. 마크다운 굵게 표시(**텍스트**)는 절대 사용하지 마세요.
8. 프로젝트 설명이나 구현 내용·트러블슈팅처럼 여러 내용을 설명할 때는 줄글로 길게 늘어놓지 말고, 짧은 1문장 도입 뒤에 아래 예시처럼 섹션 헤더 1개(💡 주요 기능 및 구현 내용)와 번호 매긴 소제목(1. 2. 3., 총 3~4개 이내) + 하위 불릿(- )으로 핵심만 압축해 정리하세요.
💡 주요 기능 및 구현 내용
1. 소제목
- 핵심 요약 1문장
- 핵심 요약 1문장
2. 소제목
- 핵심 요약 1문장
3. 소제목 (트러블슈팅)
- 문제와 해결·성과를 합친 핵심 요약 1~2문장
중요: 참고 문서의 모든 문장을 그대로 베껴 적지 마세요. 각 번호 항목 아래의 하위 불릿(- )은 반드시 1~2개(각 1문장)로만 압축해 전체 답변이 한눈에 읽히도록 짧게 요약하세요. 질문에서 묻지 않은 섹션이나 '해당 내용을 찾을 수 없습니다' 문구를 끝에 덧붙이지 마세요. 반면 이름·학력·팀원·단일 사실처럼 간단한 질문에는 번호 목록 없이 1~2문장으로 바로 답하세요.
9. 마지막에 불필요한 홍보 문구나 이메일 안내를 붙이지 마세요.`;

const INTENT_SYSTEM_PROMPTS: Record<string, string> = {
  personal_tmi: `당신은 김성현의 가벼운 일상과 취향을 소개하는 친근한 어시스턴트입니다.
- 제공된 개인정보(personal) 참고 문서만 근거로 친근하고 부드러운 존댓말(~해요, ~입니다)로 1~2문장으로 간결하게 답하세요.
- 질문에서 물어본 특정 항목만 골라 답하고 다른 개인정보 문서는 무시하세요.
- 참고 문서에서 답을 찾을 수 없으면 "제공된 개인 소개 정보에서는 해당 내용을 찾을 수 없습니다."라고 답하세요.
${COMMON_GUARDRAILS}`,
  career_profile: `당신은 AI Engineer 김성현의 역량과 이력을 소개하는 전문 포트폴리오 어시스턴트입니다.
- 자기소개, 개발 철학, 학력(경북소프트웨어마이스터고), 주요/서브 기술 스택, 수상 경력, 대외활동·해외 견학/연수·국제교류, 연락처/GitHub/Notion 학습 기록 등 질문에서 물어본 항목만 간결하게 답하세요.
- 기술 스택처럼 분류가 나뉘는 항목은 '1. 주요 기술 스택 (Primary Stack)', '2. 서브 기술 스택 (Also Used)'처럼 번호 소제목과 하위 불릿(- )으로 깔끔하게 정리하세요.
- 사적인 취미나 일상 TMI 정보는 절대 언급하지 마세요.
- 참고 문서에서 확인할 수 없는 이력이나 기술은 "제공된 프로젝트 정보에서는 해당 내용을 찾을 수 없습니다."라고 답하세요.
${COMMON_GUARDRAILS}`,
  project_overview: `당신은 AI Engineer 김성현의 프로젝트를 보기 좋게 요약·소개하는 전문 어시스턴트입니다.
- "어떤 프로젝트야?", "설명해줘"처럼 특정 프로젝트 전반을 묻는 질문에는 원문을 길게 나열하지 말고 다음 구조로 짧고 깔끔하게 요약하세요:
  1) 첫 1문장: 프로젝트가 어떤 문제를 해결하는 서비스인지 한 문장으로 소개 (개발 연도나 부가 사족 생략)
  2) 이어서 '💡 주요 기능 및 구현 내용' 헤더 하나만 두고, 그 아래에 핵심 구현과 대표 트러블슈팅을 합쳐 총 3~4개 번호('1. 소제목', '2. 소제목', '3. 소제목 (트러블슈팅)')로 정리
  3) 각 번호 아래의 하위 불릿('- ')은 반드시 1~2문장으로만 핵심을 압축해 작성
- 반대로 역할, 팀원, 기간, 개발 동기 중 특정 항목 하나만 콕 집어 물어본 경우에는 번호 목록 없이 그 항목만 1~2문장으로 직접 답하세요.
- 여러 프로젝트를 함께 묻거나 비교를 요청한 경우에도 '💡 주요 프로젝트 요약' 아래에 '1. CapTeam', '2. JICHINI' 번호 소제목과 하위 불릿(- ) 1~2개로 핵심만 압축해 설명하세요.
- 특정 프로젝트명이 질문에 있으면 그 프로젝트 문서만 사용하고 다른 프로젝트 정보는 무시하세요.
${COMMON_GUARDRAILS}`,
  project_deep_dive: `당신은 AI Engineer 김성현의 프로젝트 아키텍처, 기술 구현, 트러블슈팅을 보기 좋게 요약·설명하는 전문 어시스턴트입니다.
- 여러 참고 문서가 주어져도 사용자가 질문한 특정 기술(예: DB, 대화 메모리, LangGraph, TypeSafe Jev, RAG, 병렬 처리 등) 또는 트러블슈팅 질문에 직접 해당하는 내용만 선별해 줄글 없이 깔끔하게 정리하세요.
- 구현 내용 질문이면 짧은 1문장 도입 뒤 '💡 주요 기능 및 구현 내용' 헤더를, 트러블슈팅 질문이면 '🛠️ 주요 문제 해결 및 트러블슈팅' 헤더를 사용하고, 그 아래에 '1. 소제목', '2. 소제목', '3. 소제목'과 하위 불릿(- )으로 각 핵심을 1~2문장씩 요약하세요.
- 단일 트러블슈팅 케이스를 깊게 물어본 경우에도 '🛠️ 문제 해결 및 트러블슈팅' 아래에 '1. 문제 상황과 한계', '2. 해결 및 아키텍처 개선', '3. 개선 결과' 번호 소제목과 하위 불릿(- )으로 정리해 한눈에 읽히도록 답하세요.
- 특정 프로젝트명이 질문이나 이전 대화 맥락에 있으면 해당 프로젝트 정보만 사용하고 다른 프로젝트의 수치나 기술과 절대 섞지 마세요.
${COMMON_GUARDRAILS}`,
};

const DOC_ID_TO_CARD_TITLE: Record<string, string> = {
  "capteam-development-dataset": "Dataset 설계",
  "capteam-development-structured-output": "Structured Output",
  "capteam-development-langgraph-workflow": "LangGraph Workflow",
  "capteam-development-backend": "Backend Framework",
  "capteam-troubleshooting-randomness": "학생 분석 결과의 랜덤성과 과대평가",
  "capteam-troubleshooting-loop": "LLM 팀 수정의 최대 횟수 반복",
  "capteam-troubleshooting-context-performance": "컨텍스트 길이 초과와 긴 처리 시간",
  "jichini-development-jev-langgraph": "Jev 기반 입력 판단 및 LangGraph 응답 분기",
  "jichini-development-rag-vector-db": "pgvector 기반 유사 사용자 매칭",
  "jichini-development-persistent-memory": "PostgreSQL 영속 대화 메모리",
  "jichini-development-backend-api": "Backend Framework",
  "jichini-troubleshooting-optimization": "모호한 고민 구체화와 판단 호출 줄이기",
  "jichini-troubleshooting-search-method": "유사 사용자 검색 방식 개선",
};

const CARD_SPECIFIC_CUES: Record<string, string[]> = {
  "capteam-development-dataset": ["설문", "데이터셋", "dataset", "데이터 구조"],
  "capteam-development-structured-output": ["pydantic", "structured", "구조화", "형식 고정"],
  "capteam-development-langgraph-workflow": ["워크플로", "workflow", "langgraph", "reflection", "보정"],
  "capteam-development-backend": ["fastapi", "백엔드", "backend", "api", "json", "관리자"],
  "capteam-troubleshooting-randomness": ["랜덤", "과대평가", "temperature", "일관성", "점수 상한"],
  "capteam-troubleshooting-loop": ["루프", "반복", "최대 횟수", "필수 오류", "참고 경고", "fallback", "규칙 기반"],
  "capteam-troubleshooting-context-performance": ["컨텍스트", "병렬", "worker", "batch", "514", "179", "2.87", "속도", "처리 시간"],
  "jichini-development-jev-langgraph": ["jev", "분기", "의도", "hitl", "확인 질문"],
  "jichini-development-rag-vector-db": ["매칭", "유사 사용자", "pgvector", "비식별", "ner", "koelectra", "코사인", "임베딩"],
  "jichini-development-persistent-memory": ["메모리", "영속", "advisory", "lock", "락", "5,000", "5000", "압축", "장기 보관", "30개", "복귀"],
  "jichini-development-backend-api": ["백엔드", "backend", "api", "fastapi", "회원가입", "탈퇴", "트랜잭션", "파기"],
  "jichini-troubleshooting-optimization": ["모호", "구체성", "구체화", "호출 줄이기", "p95", "3,212", "1,784", "44.4", "28.9", "비용"],
  "jichini-troubleshooting-search-method": ["검색 방식", "정확도", "rrf", "bm25", "리랭커", "reranker", "cross-encoder", "헛매칭", "84.6", "96.2", "11.6"],
};

const SECTION_TO_MODAL: Record<string, [string, string]> = {
  overview: ["modal-overview", "개요 & 동기"],
  team: ["modal-overview", "팀 & 역할"],
  development: ["modal-build", "개발 내용"],
  troubleshooting: ["modal-troubleshooting", "문제와 해결"],
  troubleshooting_summary: ["modal-troubleshooting", "문제와 해결"],
  lessons: ["modal-learned", "배운 점"],
};

let cachedPortfolioDocs: EmbeddedDocument[] | null = null;
let cachedPersonalDocs: EmbeddedDocument[] | null = null;
let cachedClient: OpenAI | null = null;

function getClient() {
  if (!process.env.UPSTAGE_API_KEY) {
    throw new Error("UPSTAGE_API_KEY environment variable is required.");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: process.env.UPSTAGE_API_KEY,
      baseURL: UPSTAGE_BASE_URL,
      timeout: 25_000,
    });
  }
  return cachedClient;
}

function compact(value: unknown): string {
  if (Array.isArray(value)) return value.map(compact).filter(Boolean).join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("name" in obj && "role" in obj) return `${obj.name} (${obj.role})`;
    return JSON.stringify(value);
  }
  return String(value);
}

function buildAllDocuments(): { portfolio: RagDocument[]; personal: RagDocument[] } {
  const portfolio: RagDocument[] = [];
  const personal: RagDocument[] = [];
  const data = portfolioData as Record<string, any>;
  const pData = personalData as Record<string, any>;

  if (data.profile) {
    portfolio.push({
      id: data.profile.id || "profile",
      title: "프로필 소개",
      content: String(data.profile.content || ""),
      docCategory: "profile",
      documentType: "profile",
      section: "profile",
      topic: "introduction",
    });
  }

  for (const item of data.education_and_skills || []) {
    const meta = item.metadata || {};
    portfolio.push({
      id: item.id || `profile-${portfolio.length}`,
      title: String(meta.topic || meta.document_type || item.id || "역량"),
      content: String(item.content || ""),
      docCategory: "profile",
      documentType: String(meta.document_type || "profile"),
      section: "profile",
      topic: String(meta.topic || ""),
    });
  }

  const awards = Array.isArray(data.awards) ? data.awards : [];
  for (const award of awards) {
    const meta = award.metadata || {};
    portfolio.push({
      id: award.id || `award-${portfolio.length}`,
      title: String(meta.award_name || award.id || "수상"),
      content: String(award.content || ""),
      docCategory: "profile",
      documentType: "award",
      section: "profile",
      topic: "award",
    });
  }
  if (awards.length > 0) {
    const lines = [
      "김성현의 수상 경력 전체 요약 목록",
      "교내외 프로젝트 및 대회 수상 내역을 한 번에 정리한 문서입니다.",
      ...awards.map(
        (a: any) => `- ${a.metadata?.award_name || a.id}: ${String(a.content || "").trim()}`
      ),
    ];
    portfolio.push({
      id: "award-summary-all",
      title: "수상 경력 전체 요약",
      content: lines.join("\n"),
      docCategory: "profile",
      documentType: "award_summary",
      section: "profile",
      topic: "award_summary",
    });
  }

  const activities = Array.isArray(data.activities) ? data.activities : [];
  for (const act of activities) {
    const meta = act.metadata || {};
    portfolio.push({
      id: act.id || `activity-${portfolio.length}`,
      title: String(meta.activity_name || act.id || "활동"),
      content: String(act.content || ""),
      docCategory: "profile",
      documentType: "activity",
      section: "profile",
      topic: String(meta.topic || "activity"),
    });
  }
  if (activities.length > 0) {
    const lines = [
      "김성현의 대외활동, 해커톤·공모전 참가, 국제교류 및 해외 견학(싱가포르 연수) 전체 요약 목록",
      ...activities.map(
        (a: any) =>
          `- [${a.metadata?.category || "활동"}] ${a.metadata?.activity_name || a.id}: ${String(a.content || "").trim()}`
      ),
    ];
    portfolio.push({
      id: "activity-summary-all",
      title: "대외활동 및 연수 전체 요약",
      content: lines.join("\n"),
      docCategory: "profile",
      documentType: "activity_summary",
      section: "profile",
      topic: "activity_summary",
    });
  }

  const projects = Array.isArray(data.projects) ? data.projects : [];
  if (projects.length > 0) {
    const summaryLines = [
      "프로젝트 포트폴리오 전체 요약",
      "김성현의 대표 프로젝트들을 한눈에 볼 수 있도록 프로젝트명, 핵심 목적, 사용 기술을 정리한 문서입니다.",
      ...projects.map(
        (p: any) =>
          `- ${p.project_name}: ${p.summary} (사용 기술: ${compact(p.technologies)})`
      ),
    ];
    portfolio.push({
      id: "project-summary-all",
      title: "프로젝트 전체 요약",
      content: summaryLines.join("\n"),
      docCategory: "project",
      documentType: "project_summary",
      section: "summary",
      projectId: "all",
    });
  }

  for (const project of projects) {
    const pid = String(project.project_id || "");
    const pname = String(project.project_name || pid);
    const period = project.period
      ? `${project.period.start || ""} ~ ${project.period.end || "진행 중"}`
      : "";
    const devItems = Array.isArray(project.development) ? project.development : [];
    const tsItems = Array.isArray(project.troubleshooting) ? project.troubleshooting : [];

    const overviewLines = [
      `프로젝트명: ${pname}`,
      `요약: ${project.summary || ""}`,
      `기간: ${period}`,
      `역할: ${compact(project.role)}`,
      `기술: ${compact(project.technologies)}`,
      `팀원 및 역할: ${compact(project.team_members)}`,
      `개발 동기: ${project.motivation?.content || ""}`,
    ];
    if (devItems.length > 0) {
      overviewLines.push("주요 구현 요약:");
      for (const item of devItems) {
        let firstSentence = String(item.content || "").split(". ")[0].trim();
        if (firstSentence && !firstSentence.endsWith(".")) firstSentence += ".";
        overviewLines.push(`- ${item.title}: ${firstSentence}`);
      }
    }
    if (tsItems.length > 0) {
      overviewLines.push("주요 트러블슈팅 성과:");
      for (const item of tsItems) {
        overviewLines.push(`- ${item.title}: ${item.result || ""}`);
      }
    }

    portfolio.push({
      id: `${pid}-overview`,
      title: `${pname} 개요`,
      content: overviewLines.join("\n"),
      docCategory: "project",
      documentType: "project",
      section: "overview",
      projectId: pid,
    });

    if (Array.isArray(project.team_members) && project.team_members.length > 0) {
      portfolio.push({
        id: `${pid}-team`,
        title: `${pname} 팀원 및 역할`,
        content: [
          `프로젝트명: ${pname}`,
          `${pname} 팀원 구성과 담당 역할`,
          ...project.team_members.map((m: any) => `- ${m.name}: ${m.role}`),
        ].join("\n"),
        docCategory: "project",
        documentType: "project",
        section: "team",
        projectId: pid,
      });
    }

    for (const dev of devItems) {
      portfolio.push({
        id: String(dev.id || `${pid}-dev-${portfolio.length}`),
        title: `${pname} - ${dev.title}`,
        content: [
          `프로젝트명: ${pname}`,
          `개발 내용: ${dev.title}`,
          `설명: ${dev.content}`,
          `사용 기술: ${compact(dev.technologies)}`,
        ].join("\n"),
        docCategory: "project",
        documentType: "project",
        section: "development",
        projectId: pid,
      });
    }

    if (tsItems.length > 0) {
      const tsSummaryLines = [
        `프로젝트명: ${pname}`,
        "이 문서는 프로젝트에서 겪은 문제, 해결 방법, 결과를 한 번에 정리합니다.",
      ];
      for (const ts of tsItems) {
        tsSummaryLines.push(
          `문제: ${ts.title}`,
          `상황: ${ts.problem}`,
          `해결 방법: ${ts.solution}`,
          `결과: ${ts.result}`
        );
        portfolio.push({
          id: String(ts.id || `${pid}-ts-${portfolio.length}`),
          title: `${pname} - ${ts.title}`,
          content: [
            `프로젝트명: ${pname}`,
            `트러블슈팅: ${ts.title}`,
            `문제: ${ts.problem}`,
            `해결 방법: ${ts.solution}`,
            `결과: ${ts.result}`,
            `관련 기술: ${compact(ts.technologies)}`,
          ].join("\n"),
          docCategory: "project",
          documentType: "project",
          section: "troubleshooting",
          projectId: pid,
        });
      }
      portfolio.push({
        id: `${pid}-troubleshooting-summary`,
        title: `${pname} 문제 해결 요약`,
        content: tsSummaryLines.join("\n"),
        docCategory: "project",
        documentType: "project",
        section: "troubleshooting_summary",
        projectId: pid,
      });
    }

    for (const lesson of project.lessons || []) {
      portfolio.push({
        id: String(lesson.id || `${pid}-lesson-${portfolio.length}`),
        title: `${pname} - ${lesson.title}`,
        content: [
          `프로젝트명: ${pname}`,
          `배운 점: ${lesson.title}`,
          `내용: ${lesson.content}`,
        ].join("\n"),
        docCategory: "project",
        documentType: "project",
        section: "lessons",
        projectId: pid,
      });
    }
  }

  for (const item of pData.personal || []) {
    const meta = item.metadata || {};
    personal.push({
      id: String(item.id || `personal-${personal.length}`),
      title: String(meta.topic || item.id || "개인 소개"),
      content: String(item.content || ""),
      docCategory: "personal",
      documentType: "personal",
      section: "personal",
      topic: String(meta.topic || ""),
    });
  }

  return { portfolio, personal };
}

async function embedDocs(client: OpenAI, docs: RagDocument[]): Promise<EmbeddedDocument[]> {
  if (docs.length === 0) return [];
  const embeddings = await client.embeddings.create({
    model: EMBEDDING_PASSAGE_MODEL,
    input: docs.map((d) => d.content),
    encoding_format: "float",
  });
  const sorted = [...embeddings.data].sort((a, b) => a.index - b.index);
  return docs.map((doc, idx) => ({
    ...doc,
    embedding: sorted[idx].embedding,
  }));
}

async function getEmbeddedCollections(client: OpenAI) {
  if (cachedPortfolioDocs && cachedPersonalDocs) {
    return { portfolio: cachedPortfolioDocs, personal: cachedPersonalDocs };
  }
  const { portfolio, personal } = buildAllDocuments();
  const [embPortfolio, embPersonal] = await Promise.all([
    embedDocs(client, portfolio),
    embedDocs(client, personal),
  ]);
  cachedPortfolioDocs = embPortfolio;
  cachedPersonalDocs = embPersonal;
  return { portfolio: embPortfolio, personal: embPersonal };
}

function classifyQuery(
  question: string,
  history: ChatHistoryItem[]
): {
  intent: IntentType;
  targetProject: TargetProjectType;
  uiTarget: UITargetType;
} {
  const q = question.toLowerCase().trim();

  if (
    /^(안녕|안녕하세요|반가워|반갑습니다|고마워|감사합니다|수고해|하이|헬로|넌 누구|누구야|뭐 할 수 있어)[!?.~ ]*$/.test(
      q
    )
  ) {
    return { intent: "chitchat", targetProject: "none", uiTarget: "none" };
  }

  const portfolioNouns = [
    "jichini",
    "지치니",
    "capteam",
    "캡팀",
    "프로젝트",
    "포트폴리오",
    "캡스톤",
    "기술",
    "스택",
    "수상",
    "상장",
    "해커톤",
    "올림피아드",
    "koai",
    "학력",
    "학교",
    "소마고",
    "마이스터고",
    "전공",
    "동아리",
    "이메일",
    "연락처",
    "전화번호",
    "깃허브",
    "github",
    "노션",
    "notion",
    "langgraph",
    "langchain",
    "rag",
    "fastapi",
    "pytorch",
    "pgvector",
    "postgresql",
    "docker",
    "pydantic",
    "jev",
    "koelectra",
    "트러블슈팅",
    "대외활동",
    "국제교류",
    "치바상업",
    "싱가포르",
    "해외 견학",
    "해외 연수",
  ];
  const personalCues = [
    "취미",
    "운동",
    "축구",
    "헬스",
    "벤치프레스",
    "벤치",
    "피파",
    "fifa",
    "pc방",
    "피시방",
    "게임",
    "음악",
    "노래",
    "발라드",
    "나윤권",
    "나였으면",
    "영화",
    "인생영화",
    "건축학개론",
    "mbti",
    "infj",
    "음료",
    "사이다",
    "키가",
    "키 몇",
    "신장",
    "좋아하는 나라",
    "가보고 싶은 나라",
    "아이슬란드",
    "버킷리스트",
    "계절",
    "좋아하는 색",
    "색깔",
    "만화",
    "애니",
    "웹툰",
    "원피스",
    "간식",
    "과자",
    "눈을감자",
    "해외축구",
    "프리미어리그",
    "라리가",
    "이강인",
    "아틀레티코",
    "고향",
    "출신",
    "경산",
    "혈액형",
    "과일",
    "포도",
    "블루베리",
    "형제",
    "가족",
    "삼남매",
    "동물",
    "반려동물",
    "강아지",
    "고양이",
    "쉬는 날",
    "여가",
  ];

  const hasPortfolioNoun = portfolioNouns.some((k) => q.includes(k));
  const hasPersonalCue = personalCues.some((k) => q.includes(k));
  if (hasPersonalCue && !hasPortfolioNoun) {
    return { intent: "personal_tmi", targetProject: "none", uiTarget: "none" };
  }

  let hasJichini = q.includes("jichini") || q.includes("지치니");
  let hasCapteam = q.includes("capteam") || q.includes("캡팀") || q.includes("캡스톤");

  let targetProject: TargetProjectType = "none";
  if (hasJichini && hasCapteam) {
    targetProject = "both";
  } else if (hasJichini) {
    targetProject = "project-jichini";
  } else if (hasCapteam) {
    targetProject = "project-capteam";
  }

  // 프로필 단독 질문 판별
  const asksSkills =
    !hasJichini &&
    !hasCapteam &&
    ["기술 스택", "기술스택", "스택", "주력 기술", "사용하는 기술", "툴", "도구"].some((k) =>
      q.includes(k)
    );
  const asksAwards = ["수상", "상장", "입상", "상 탄", " 몇 위", "등수"].some((k) => q.includes(k));
  const asksActivities = [
    "대외활동",
    "해외 견학",
    "해외 연수",
    "싱가포르",
    "국제교류",
    "치바상업",
    "코드페어",
    "여수",
    "의성군",
    "포스코",
  ].some((k) => q.includes(k));
  const asksEducation = ["학교", "학력", "고등학", "소마고", "마이스터고", "전공", "동아리", "ai고라"].some(
    (k) => q.includes(k)
  );
  const asksContactOrIntro = [
    "이름",
    "연락처",
    "이메일",
    "전화번호",
    "생년월일",
    "생일",
    "나이",
    "깃허브",
    "github",
    "자기소개",
    "어떤 개발자",
    "철학",
  ].some((k) => q.includes(k));

  if (asksSkills) {
    return { intent: "career_profile", targetProject: "none", uiTarget: "skills" };
  }
  if (asksAwards && !hasJichini && !hasCapteam) {
    return { intent: "career_profile", targetProject: "none", uiTarget: "awards" };
  }
  if (asksActivities) {
    return { intent: "career_profile", targetProject: "none", uiTarget: "activities" };
  }
  if (asksEducation) {
    return { intent: "career_profile", targetProject: "none", uiTarget: "education" };
  }
  if (asksContactOrIntro && !hasJichini && !hasCapteam) {
    return { intent: "career_profile", targetProject: "none", uiTarget: "none" };
  }

  // 프로젝트가 명시되지 않았을 때 직전 대화에서 프로젝트 맥락 추론
  if (targetProject === "none" && history.length > 0) {
    const recentText = history
      .slice(-2)
      .map((h) => h.content.toLowerCase())
      .join(" ");
    const prevJichini = recentText.includes("jichini") || recentText.includes("지치니");
    const prevCapteam = recentText.includes("capteam") || recentText.includes("캡팀");
    if (prevJichini && !prevCapteam) targetProject = "project-jichini";
    else if (prevCapteam && !prevJichini) targetProject = "project-capteam";
  }

  const deepDiveCues = [
    "구현",
    "트러블슈팅",
    "문제",
    "해결",
    "최적화",
    "성능",
    "속도",
    "비용",
    "지연",
    "p95",
    "정확도",
    "메모리",
    "영속",
    "advisory lock",
    "토큰",
    "압축",
    "복귀",
    "hitl",
    "koelectra",
    "비식별",
    "ner",
    "리랭커",
    "cross-encoder",
    "rrf",
    "bm25",
    "헛매칭",
    "루프",
    "랜덤성",
    "과대평가",
    "병렬",
    "worker",
    "batch",
    "워크플로",
    "배운 점",
    "느낀 점",
    "db",
    "데이터베이스",
    "pgvector",
    "백엔드",
    "api",
  ];
  const isDeepDive = deepDiveCues.some((k) => q.includes(k));

  if (targetProject === "project-jichini" || targetProject === "project-capteam") {
    return {
      intent: isDeepDive ? "project_deep_dive" : "project_overview",
      targetProject,
      uiTarget: "project_detail",
    };
  }

  if (targetProject === "both" || q.includes("프로젝트")) {
    return {
      intent: isDeepDive ? "project_deep_dive" : "project_overview",
      targetProject: targetProject === "both" ? "both" : "none",
      uiTarget: "projects_list",
    };
  }

  if (isDeepDive) {
    return { intent: "project_deep_dive", targetProject, uiTarget: "project_detail" };
  }

  return { intent: "career_profile", targetProject: "none", uiTarget: "none" };
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function metadataBoost(
  doc: RagDocument,
  intent: IntentType,
  targetProject: TargetProjectType,
  uiTarget: UITargetType,
  question: string
): number {
  let boost = 0;
  const q = question.toLowerCase();

  if (intent !== "personal_tmi") {
    if (uiTarget === "skills" && doc.documentType === "skill") {
      boost += doc.topic === "ai_stack" ? 0.25 : 0.2;
    } else if (
      uiTarget === "awards" &&
      (doc.documentType === "award" || doc.documentType === "award_summary")
    ) {
      boost += doc.documentType === "award_summary" ? 0.25 : 0.18;
    } else if (
      uiTarget === "activities" &&
      (doc.documentType === "activity" || doc.documentType === "activity_summary")
    ) {
      boost += doc.documentType === "activity_summary" ? 0.25 : 0.18;
    } else if (
      uiTarget === "education" &&
      (doc.documentType === "education" || doc.documentType === "profile")
    ) {
      boost += 0.2;
    }
  }

  if (targetProject === "project-jichini" || targetProject === "project-capteam") {
    if (doc.projectId === targetProject) boost += 0.15;
    else if (doc.projectId && doc.projectId !== "all") boost -= 0.15;
  }

  if (intent === "project_overview" && doc.section === "overview") {
    boost += 0.14;
  } else if (
    intent === "project_deep_dive" &&
    ["development", "troubleshooting", "troubleshooting_summary", "lessons"].includes(doc.section)
  ) {
    boost += 0.1;
  }

  // 키워드 직접 매칭 보너스
  const tokens = q
    .split(/[\s,?.!]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const blob = `${doc.title} ${doc.content}`.toLowerCase();
  for (const tok of tokens) {
    if (blob.includes(tok)) boost += 0.04;
  }

  return boost;
}

async function retrieve(
  client: OpenAI,
  question: string,
  intent: IntentType,
  targetProject: TargetProjectType,
  uiTarget: UITargetType
) {
  const [collections, queryEmbedding] = await Promise.all([
    getEmbeddedCollections(client),
    client.embeddings.create({
      model: EMBEDDING_QUERY_MODEL,
      input: question,
      encoding_format: "float",
    }),
  ]);
  const vector = queryEmbedding.data[0].embedding;
  const pool = intent === "personal_tmi" ? collections.personal : collections.portfolio;

  return pool
    .map((doc) => ({
      ...doc,
      score:
        cosineSimilarity(doc.embedding, vector) +
        metadataBoost(doc, intent, targetProject, uiTarget, question),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function resolveNavigation(
  intent: IntentType,
  targetProject: TargetProjectType,
  uiTarget: UITargetType,
  docs: RagDocument[],
  question: string
) {
  if (
    intent === "chitchat" ||
    intent === "out_of_scope" ||
    intent === "personal_tmi" ||
    docs.length === 0 ||
    uiTarget === "none"
  ) {
    return null;
  }

  if (uiTarget === "skills") {
    const skillDoc = docs.find((d) => d.documentType === "skill");
    const stackTarget =
      skillDoc?.topic === "language_backend_tools" ? "Also Used" : "Primary Stack";
    return {
      section: "skills",
      projectId: null,
      modalSection: null,
      highlightText: stackTarget,
      label: `기술 스택 · ${stackTarget}`,
    };
  }

  if (uiTarget === "awards") {
    return {
      section: "about",
      projectId: null,
      modalSection: null,
      highlightText: "AWARDS",
      label: "수상 경력",
    };
  }

  if (uiTarget === "activities") {
    return {
      section: "about",
      projectId: null,
      modalSection: null,
      highlightText: "ACTIVITIES",
      label: "대외활동 · 연수",
    };
  }

  if (uiTarget === "education") {
    return {
      section: "about",
      projectId: null,
      modalSection: null,
      highlightText: "EDUCATION",
      label: "학력 및 활동",
    };
  }

  if (uiTarget === "projects_list") {
    return {
      section: "projects",
      projectId: null,
      modalSection: null,
      highlightText: null,
      label: "프로젝트 섹션",
    };
  }

  const pidMap: Record<string, "jichini" | "capteam"> = {
    "project-jichini": "jichini",
    "project-capteam": "capteam",
  };
  const uiProjectId = pidMap[targetProject] || pidMap[docs[0]?.projectId || ""];
  if (!uiProjectId) {
    return {
      section: "projects",
      projectId: null,
      modalSection: null,
      highlightText: null,
      label: "프로젝트 섹션",
    };
  }

  const targetBackendPid = `project-${uiProjectId}`;
  const candidates = docs.filter((d) => d.projectId === targetBackendPid);
  const pool = candidates.length > 0 ? candidates : docs;
  const q = question.toLowerCase();

  let bestDoc = pool[0];
  let bestScore = -1;
  pool.forEach((doc, idx) => {
    let s = (pool.length - idx) * 0.5;
    if (
      [
        "문제",
        "오류",
        "버그",
        "트러블",
        "루프",
        "해결",
        "최적화",
        "속도",
        "비용",
        "지연",
        "정확도",
        "리랭커",
        "cross-encoder",
        "헛매칭",
        "검색 방식",
        "bm25",
        "rrf",
      ].some((k) => q.includes(k))
    ) {
      if (doc.section === "troubleshooting" || doc.section === "troubleshooting_summary") s += 3;
    } else if (["배운", "느낀", "회고"].some((k) => q.includes(k))) {
      if (doc.section === "lessons") s += 3;
    } else if (
      [
        "구현",
        "개발",
        "db",
        "데이터베이스",
        "백엔드",
        "api",
        "워크플로",
        "아키텍처",
        "메모리",
        "영속",
        "저장",
        "기억",
        "락",
        "토큰",
        "요약",
        "압축",
        "복귀",
        "비식별",
        "ner",
        "koelectra",
        "hitl",
      ].some((k) => q.includes(k))
    ) {
      if (doc.section === "development") s += 2.5;
    }
    if (s > bestScore) {
      bestScore = s;
      bestDoc = doc;
    }
  });

  const [modalSection, modalLabel] = SECTION_TO_MODAL[bestDoc.section] || [
    "modal-overview",
    "개요 & 동기",
  ];

  let highlightText: string | null = null;
  if (
    bestDoc.section === "development" ||
    bestDoc.section === "troubleshooting" ||
    bestDoc.section === "troubleshooting_summary"
  ) {
    let bestCardId: string | null = null;
    let bestHits = 0;
    for (const [cid, cues] of Object.entries(CARD_SPECIFIC_CUES)) {
      if (!cid.startsWith(`${uiProjectId}-`)) continue;
      if (bestDoc.section === "development" && !cid.includes("-development-")) continue;
      if (
        (bestDoc.section === "troubleshooting" ||
          bestDoc.section === "troubleshooting_summary") &&
        !cid.includes("-troubleshooting-")
      ) {
        continue;
      }
      const hits = cues.filter((cue) => q.includes(cue)).length;
      if (hits > bestHits) {
        bestHits = hits;
        bestCardId = cid;
      }
    }
    if (bestCardId && bestHits > 0) {
      highlightText = DOC_ID_TO_CARD_TITLE[bestCardId] || null;
    }
  }

  const projectLabel = uiProjectId === "capteam" ? "CapTeam" : "JICHINI";

  return {
    section: "projects",
    projectId: uiProjectId,
    modalSection,
    highlightText,
    label: `${projectLabel} · ${modalLabel}`,
  };
}

function normalizeHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is ChatHistoryItem =>
        Boolean(item) &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim().length > 0
    )
    .slice(-10)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, 2000),
    }));
}

function formatHistory(history: ChatHistoryItem[]) {
  if (!history.length) return "(이전 대화 없음)";
  return history
    .map((item) => `${item.role === "user" ? "사용자" : "어시스턴트"}: ${item.content}`)
    .join("\n");
}

function writeSseEvent(res: any, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const wantsStream = req.body?.stream === true;
  const history = normalizeHistory(req.body?.history);

  // 외부 RAG_API_URL이 명시된 경우 해당 서버로 프록시
  if (process.env.RAG_API_URL) {
    const ragApiUrl = process.env.RAG_API_URL.replace(/\/$/, "");
    const targetEndpoint = wantsStream ? "/chat/stream" : "/chat";
    try {
      const ragResponse = await fetch(`${ragApiUrl}${targetEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: message, history }),
      });

      if (!ragResponse.ok) {
        const data = await ragResponse.json().catch(() => null);
        return res
          .status(ragResponse.status)
          .json({ error: data?.detail || data?.error || "RAG API request failed" });
      }

      if (wantsStream) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        if (typeof res.flushHeaders === "function") res.flushHeaders();

        const reader = ragResponse.body?.getReader();
        if (!reader) return res.end();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        return res.end();
      }

      const data = await ragResponse.json().catch(() => null);
      return res.status(200).json({
        text: data?.answer || "답변을 가져오는 도중 문제가 발생했습니다.",
        sources: data?.sources || [],
      });
    } catch (error: any) {
      console.error("Vercel RAG API Proxy Error:", error);
    }
  }

  // Vercel Serverless 내장 RAG + 스트리밍 실행
  try {
    const client = getClient();
    const { intent, targetProject, uiTarget } = classifyQuery(message, history);

    if (intent === "out_of_scope") {
      if (wantsStream) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        if (typeof res.flushHeaders === "function") res.flushHeaders();
        writeSseEvent(res, { type: "token", text: OUT_OF_SCOPE_RESPONSE });
        writeSseEvent(res, {
          type: "done",
          answer: OUT_OF_SCOPE_RESPONSE,
          sources: [],
          intent,
          target_project: targetProject,
          navigation: null,
        });
        return res.end();
      }
      return res.status(200).json({ text: OUT_OF_SCOPE_RESPONSE, sources: [] });
    }

    let messages: Array<{ role: "system" | "user"; content: string }>;
    let sources: Array<{ title: string; content_preview: string; category: string }> = [];
    let navigation: Record<string, unknown> | null = null;
    let temperature = 0.35;
    let maxTokens = 1000;

    if (intent === "chitchat") {
      temperature = 0.3;
      maxTokens = 300;
      messages = [
        { role: "system", content: CHITCHAT_SYSTEM_PROMPT },
        {
          role: "user",
          content: `이전 대화:\n${formatHistory(history)}\n\n사용자 메시지: ${message}\n\n답변:`,
        },
      ];
    } else {
      const docs = await retrieve(client, message, intent, targetProject, uiTarget);
      navigation = resolveNavigation(intent, targetProject, uiTarget, docs, message);
      sources = docs.map((d) => ({
        title: d.title,
        content_preview: d.content.slice(0, 100) + (d.content.length > 100 ? "..." : ""),
        category: d.docCategory,
      }));
      const context = docs
        .map((d, idx) => `[참고 문서 ${idx + 1} | ${d.title}]\n${d.content}`)
        .join("\n\n---\n\n");
      const systemPrompt =
        INTENT_SYSTEM_PROMPTS[intent] || INTENT_SYSTEM_PROMPTS.career_profile;
      const userPrompt = `아래 [참고 문서] 후보 중 현재 질문에 직접 관련된 내용만 선별해 답변하세요.

[분류된 질문 의도: ${intent} | 대상 프로젝트: ${targetProject}]
출력 형식 지침: 줄글로 길게 늘어놓지 말고 핵심만 요약해 답하세요. 프로젝트나 기술 구현·트러블슈팅 설명은 1문장 도입 뒤 섹션 헤더(💡 주요 기능 및 구현 내용)와 '1. 소제목' + '- 핵심 요약' 구조로 보기 좋게 정리하세요.

이전 대화:
${formatHistory(history)}

참고 문서:
${context}

질문: ${message}

위 질문에서 직접 물어본 내용만 선별해 길게 늘어놓지 말고 간결하게 요약해 답하세요. 마크다운 굵게(**텍스트**)는 절대 사용하지 마세요. 묻지 않은 섹션이나 '해당 내용을 찾을 수 없습니다' 문구를 끝에 덧붙이지 마세요.
답변:`;
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
    }

    if (wantsStream) {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") res.flushHeaders();

      if (navigation) {
        writeSseEvent(res, { type: "navigate", navigation });
      }

      const stream = await client.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });

      const collected: string[] = [];
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          collected.push(delta);
          writeSseEvent(res, { type: "token", text: delta });
        }
      }

      const finalAnswer = collected.join("").trim();
      writeSseEvent(res, {
        type: "done",
        answer: finalAnswer,
        sources,
        intent,
        target_project: targetProject,
        navigation,
      });
      return res.end();
    }

    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    });
    const answer = response.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({
      text: answer || "답변을 가져오는 도중 문제가 발생했습니다.",
      sources,
      navigation,
    });
  } catch (error: any) {
    console.error("Vercel RAG API Error:", error);
    return res.status(500).json({
      error: error?.message || "RAG 답변 생성 중 오류가 발생했습니다.",
    });
  }
}
