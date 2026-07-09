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
  problem?: string;
  solution?: string;
  impact?: string;
  content?: string;
  development_process?: Array<Record<string, unknown>>;
  troubleshooting?: Array<Record<string, unknown>>;
  learnings?: string[];
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

const SYSTEM_PROMPT = `당신은 김성현의 AI 포트폴리오를 설명하는 전문 어시스턴트입니다.

주어진 context에 있는 사실만 사용해서 답변하세요. context에 없는 수치, 수상명, 기술, 역할은 절대 추측하지 마세요.
답변은 한국어로 작성하고, 사용자가 영어로 질문한 경우에만 영어로 답변하세요.

답변 원칙:
1. 질문 의도에 바로 답하세요.
2. 프로젝트명, 문제, 해결 방법, 결과가 context에 있으면 함께 연결해서 설명하세요.
3. 여러 항목을 묻는 질문은 2~4개의 짧은 항목으로 정리하세요.
4. 사용자가 "간단히", "한줄"을 요청하면 프로젝트당 한 문장으로 답하세요.
5. 모르는 내용은 "제공된 프로젝트 정보에서는 해당 내용을 찾을 수 없습니다."라고 답하세요.
6. 마크다운 굵게 표시(**텍스트**)는 사용하지 마세요. 필요한 경우 일반 문장 또는 하이픈 목록을 사용하세요.
7. 마지막에 불필요한 홍보 문구나 이메일 안내를 붙이지 마세요.`;

const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

let cachedDocuments: EmbeddedDocument[] | null = null;
let cachedClient: OpenAI | null = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required.");
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
    addDoc(docs, data.profile.id || "profile", "프로필", [data.profile.content, data.profile.metadata]);
  }

  for (const item of data.education_and_skills || []) {
    const topic = compact(item.metadata?.topic || item.metadata?.section || item.id || "역량");
    addDoc(docs, item.id || `profile-${docs.length}`, topic, [item.content, item.metadata]);
  }

  for (const award of data.awards || []) {
    const title = compact(award.metadata?.award_name || award.id || "수상");
    addDoc(docs, award.id || `award-${docs.length}`, title, [award.content, award.metadata]);
  }

  const projectNames = (data.projects || []).map((project) => project.project_name).filter(Boolean).join(", ");
  addDoc(docs, "project-summary", "프로젝트 전체 요약", [
    `김성현이 진행한 주요 프로젝트: ${projectNames}`,
    ...(data.projects || []).map((project) => `${project.project_name}: ${project.summary}`),
  ]);

  for (const project of data.projects || []) {
    const name = project.project_name || project.project_id || `project-${docs.length}`;
    const baseId = project.project_id || name.toLowerCase().replace(/\s+/g, "-");

    addDoc(docs, `${baseId}-overview`, `${name} 프로젝트 개요`, [
      `프로젝트명: ${name}`,
      `요약: ${project.summary}`,
      `기간: ${compact(project.period)}`,
      `역할: ${compact(project.role)}`,
      `기술: ${compact(project.technologies)}`,
      `팀: ${compact(project.team_members)}`,
      project.content,
      project.metadata,
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

    addDoc(docs, `${baseId}-development`, `${name} 개발 과정`, [
      ...(project.development_process || []).map((item, index) => `${item.title || `개발 과정 ${index + 1}`}\n${compact(item)}`),
    ]);

    addDoc(docs, `${baseId}-learnings`, `${name} 배운 점`, [project.learnings]);
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
    model: EMBEDDING_MODEL,
    input: documents.map((doc) => doc.content),
  });

  cachedDocuments = documents.map((doc, index) => ({
    ...doc,
    embedding: embeddings.data[index].embedding,
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
    client.embeddings.create({ model: EMBEDDING_MODEL, input: question }),
  ]);
  const vector = queryEmbedding.data[0].embedding;

  return documents
    .map((doc) => ({ ...doc, score: cosineSimilarity(doc.embedding, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function extractResponseText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.output_text === "string") parts.push(content.output_text);
    }
  }

  return parts.join("\n").trim();
}

function buildPrompt(question: string, docs: Array<EmbeddedDocument & { score: number }>) {
  const context = docs
    .map((doc, index) => `[${index + 1}] ${doc.title}\n${doc.content}`)
    .join("\n\n---\n\n");

  return `아래 context를 근거로 질문에 답변하세요.\n\ncontext:\n${context}\n\n질문: ${question}\n\n답변:`;
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
    const docs = await retrieve(client, message);
    const response = await client.responses.create({
      model: CHAT_MODEL,
      instructions: SYSTEM_PROMPT,
      input: buildPrompt(message, docs),
      max_output_tokens: 1000,
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
