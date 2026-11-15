import OpenAI from "openai";
import portfolioData from "../data/projects.json" with { type: "json" };

export const config = {
  maxDuration: 30,
};

type PortfolioData = {
  profile?: PortfolioEntry;
  education_and_skills?: PortfolioEntry[];
  awards?: PortfolioEntry[];
  projects?: ProjectEntry[];
};

type PortfolioEntry = {
  id?: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

type ProjectEntry = {
  project_id?: string;
  project_name?: string;
  summary?: string;
  period?: { start?: string; end?: string; status?: string };
  role?: string[];
  technologies?: string[];
  team_members?: Array<{ name?: string; role?: string }>;
  motivation?: string | { title?: string; content?: string };
  problem?: string;
  solution?: string;
  impact?: string;
  content?: string;
  development?: Array<Record<string, unknown>>;
  development_process?: Array<Record<string, unknown>>;
  troubleshooting?: Array<Record<string, unknown>>;
  lessons?: Array<Record<string, unknown>>;
  learnings?: string[];
  repository_url?: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
};

type RagDocument = {
  id: string;
  title: string;
  content: string;
};

type EmbeddedDocument = RagDocument & {
  embedding: number[];
};

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `당신은 김성현의 AI 포트폴리오를 설명하는 전문 어시스턴트입니다.

주어진 context에 있는 사실만 사용해서 답변하세요. context에 없는 수치, 수상명, 기술, 역할은 추측하지 마세요.
답변은 한국어로 작성하고, 사용자가 영어로 질문한 경우에만 영어로 답변하세요.

답변 원칙:
1. 질문에 필요한 정보만 골라 자연스럽게 답하세요.
2. 이전 대화가 있으면 "그 프로젝트", "그 기술"처럼 생략된 대상을 이전 대화에서 찾아 현재 질문을 해석하세요. 이전 답변의 사실이 context와 충돌하면 context를 우선하세요.
3. context의 항목명이나 필드명(문제, 해결 방법, 결과, 역할 및 기술 등)을 그대로 베껴서 나열하지 마세요.
4. 사용자가 구조화를 요청한 경우에만 목록을 사용하세요.
5. 사용자가 "간단히", "한줄"을 요청하면 전체 답변을 짧게 요약하세요.
6. 여러 프로젝트를 비교하거나 요약할 때도 프로젝트당 1문장 정도로 압축하세요.
7. 모르는 내용은 "제공된 프로젝트 정보에서는 해당 내용을 찾을 수 없습니다."라고 답하세요.
8. 마크다운 굵게 표시(**텍스트**)는 사용하지 마세요.
9. 마지막에 불필요한 홍보 문구나 이메일 안내를 붙이지 마세요.`;

const CHAT_MODEL = process.env.UPSTAGE_MODEL || "solar-pro4";
const EMBEDDING_PASSAGE_MODEL =
  process.env.UPSTAGE_EMBEDDING_PASSAGE_MODEL || "solar-embedding-2-passage";
const EMBEDDING_QUERY_MODEL =
  process.env.UPSTAGE_EMBEDDING_QUERY_MODEL || "solar-embedding-2-query";
const UPSTAGE_BASE_URL = process.env.UPSTAGE_BASE_URL || "https://api.upstage.ai/v1";

let cachedDocuments: EmbeddedDocument[] | null = null;
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
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function addDoc(docs: RagDocument[], id: string, title: string, parts: unknown[]) {
  const content = parts.map(compact).filter((part) => part.trim().length > 0).join("\n");
  if (content.trim()) docs.push({ id, title, content });
}

function buildDocuments(data: PortfolioData): RagDocument[] {
  const docs: RagDocument[] = [];

  if (data.profile) {
    addDoc(docs, data.profile.id || "profile", "프로필", [data.profile.content]);
  }

  for (const item of data.education_and_skills || []) {
    const topic = compact(item.metadata?.topic || item.metadata?.section || item.id || "역량");
    addDoc(docs, item.id || `profile-${docs.length}`, topic, [item.content]);
  }

  for (const award of data.awards || []) {
    const title = compact(award.metadata?.award_name || award.id || "수상");
    addDoc(docs, award.id || `award-${docs.length}`, title, [award.content]);
  }

  const projectNames = (data.projects || []).map((project) => project.project_name).filter(Boolean).join(", ");
  addDoc(docs, "project-summary", "프로젝트 전체 요약", [
    `김성현이 진행한 주요 프로젝트: ${projectNames}`,
    ...(data.projects || []).map((project) => `${project.project_name}: ${project.summary}`),
  ]);

  for (const project of data.projects || []) {
    const name = project.project_name || project.project_id || `project-${docs.length}`;
    const baseId = project.project_id || name.toLowerCase().replace(/\s+/g, "-");

    const motivationText =
      typeof project.motivation === "string"
        ? project.motivation
        : project.motivation?.content || "";

    addDoc(docs, `${baseId}-overview`, `${name} 프로젝트 개요`, [
      `프로젝트명: ${name}`,
      `요약: ${project.summary}`,
      `기간: ${compact(project.period)}`,
      `역할: ${compact(project.role)}`,
      `기술: ${compact(project.technologies)}`,
      `팀원 및 역할: ${compact(project.team_members)}`,
      motivationText ? `개발 동기: ${motivationText}` : "",
      `포트폴리오 원문: ${project.source_url || ""}`,
      project.content,
    ]);

    addDoc(docs, `${baseId}-team`, `${name} 팀원 및 역할`, [
      `프로젝트명: ${name}`,
      `${name} 팀원 구성과 담당 역할`,
      ...(project.team_members || []).map((member) => `- ${member.name || ""}: ${member.role || ""}`),
    ]);

    addDoc(docs, `${baseId}-problem-solution`, `${name} 문제와 해결`, [
      `문제: ${project.problem}`,
      `해결: ${project.solution}`,
      `결과: ${project.impact}`,
      ...(project.troubleshooting || []).map((item, index) => {
        const title = item.title || item.issue || `트러블슈팅 ${index + 1}`;
        return `${title}\n문제: ${compact(item.problem || item.issue)}\n원인: ${compact(item.cause)}\n해결: ${compact(item.solution || item.fix)}\n결과: ${compact(item.result || item.impact)}`;
      }),
    ]);

    const devItems = project.development_process || project.development || [];
    addDoc(docs, `${baseId}-development`, `${name} 개발 과정`, [
      ...devItems.map((item, index) => `${item.title || `개발 과정 ${index + 1}`}\n${compact(item)}`),
    ]);

    const learningItems = project.learnings || project.lessons || [];
    addDoc(docs, `${baseId}-learnings`, `${name} 배운 점`, [
      ...learningItems.map((item) =>
        typeof item === "string" ? item : `${compact(item.title)}: ${compact(item.content)}`
      ),
    ]);
  }

  return docs;
}

function loadPortfolioData(): PortfolioData {
  return portfolioData as PortfolioData;
}

async function getEmbeddedDocuments(client: OpenAI): Promise<EmbeddedDocument[]> {
  if (cachedDocuments) return cachedDocuments;

  const documents = buildDocuments(loadPortfolioData());
  const embeddings = await client.embeddings.create({
    model: EMBEDDING_PASSAGE_MODEL,
    input: documents.map((doc) => doc.content),
  });
  const sortedData = [...embeddings.data].sort((a, b) => a.index - b.index);

  cachedDocuments = documents.map((doc, index) => ({
    ...doc,
    embedding: sortedData[index].embedding,
  }));
  return cachedDocuments;
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

async function retrieve(client: OpenAI, question: string) {
  const [documents, queryEmbedding] = await Promise.all([
    getEmbeddedDocuments(client),
    client.embeddings.create({ model: EMBEDDING_QUERY_MODEL, input: question }),
  ]);
  const vector = queryEmbedding.data[0].embedding;

  return documents
    .map((doc) => ({ ...doc, score: cosineSimilarity(doc.embedding, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function extractResponseText(response: any): string {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function normalizeHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is ChatHistoryItem =>
      item &&
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

function buildRetrievalQuery(question: string, history: ChatHistoryItem[]) {
  if (!history.length) return question;
  return `이전 대화:\n${formatHistory(history.slice(-6))}\n\n현재 질문: ${question}`;
}

function buildPrompt(
  question: string,
  docs: Array<EmbeddedDocument & { score: number }>,
  history: ChatHistoryItem[]
) {
  const context = docs
    .map((doc, index) => `[${index + 1}] ${doc.title}\n${doc.content}`)
    .join("\n\n---\n\n");

  return `아래 context를 근거로 질문에 답변하세요.\n\n이전 대화:\n${formatHistory(history)}\n\ncontext:\n${context}\n\n질문: ${question}\n\n답변:`;
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

  try {
    const client = getClient();
    const history = normalizeHistory(req.body?.history);
    const docs = await retrieve(client, buildRetrievalQuery(message, history));
    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(message, docs, history) },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const text = extractResponseText(response);

    return res.status(200).json({
      text: text || "답변을 가져오는 도중 문제가 발생했습니다.",
      sources: docs.map((doc) => ({
        title: doc.title,
        content_preview: doc.content.slice(0, 160),
        score: Number(doc.score.toFixed(4)),
      })),
    });
  } catch (error: any) {
    console.error("Vercel RAG API Error:", error);
    return res.status(500).json({
      error: error?.message || "RAG 답변 생성 중 오류가 발생했습니다.",
    });
  }
}
