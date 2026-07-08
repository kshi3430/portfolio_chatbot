import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { mkdir, readFile, rename, writeFile } from "fs/promises";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  const visitorDataDir = path.join(process.cwd(), "data");
  const visitorDataFile = path.join(visitorDataDir, "visitor-count.json");
  type VisitorData = { count: number; sessions: string[] };
  let visitorQueue = Promise.resolve({ count: 0, counted: false });

  const readVisitorData = async (): Promise<VisitorData> => {
    try {
      const data = JSON.parse(await readFile(visitorDataFile, "utf8"));
      return {
        count: Number.isFinite(data.count) ? data.count : 0,
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
      };
    } catch (error: any) {
      if (error.code === "ENOENT") return { count: 0, sessions: [] };
      throw error;
    }
  };

  const registerVisitorSession = (sessionId: string) => {
    visitorQueue = visitorQueue.then(async () => {
      const data = await readVisitorData();
      if (data.sessions.includes(sessionId)) {
        return { count: data.count, counted: false };
      }

      const nextData: VisitorData = {
        count: data.count + 1,
        // 파일이 끝없이 커지지 않도록 최근 세션 ID만 보관합니다.
        sessions: [...data.sessions, sessionId].slice(-10000),
      };
      await mkdir(visitorDataDir, { recursive: true });
      const temporaryFile = `${visitorDataFile}.tmp`;
      await writeFile(temporaryFile, JSON.stringify(nextData), "utf8");
      await rename(temporaryFile, visitorDataFile);
      return { count: nextData.count, counted: true };
    });
    return visitorQueue;
  };

  app.use(express.json());

  app.get("/api/visitors", async (_req, res) => {
    try {
      res.json({ count: (await readVisitorData()).count });
    } catch (error) {
      console.error("Visitor counter read error:", error);
      res.status(500).json({ error: "방문자 수를 불러오지 못했습니다." });
    }
  });

  app.post("/api/visitors", async (req, res) => {
    try {
      const sessionId = req.body?.sessionId;
      if (typeof sessionId !== "string" || sessionId.length < 8 || sessionId.length > 100) {
        return res.status(400).json({ error: "유효한 방문 세션 ID가 필요합니다." });
      }
      res.json(await registerVisitorSession(sessionId));
    } catch (error) {
      console.error("Visitor counter update error:", error);
      res.status(500).json({ error: "방문자 수를 기록하지 못했습니다." });
    }
  });

  // API routes first
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Lazy initialization of GoogleGenAI
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemInstruction = `
You are the portfolio AI assistant for Kim Seonghyeon, a student AI engineer in South Korea.
Answer only from the verified portfolio facts below. Never invent employment, experience, metrics, awards, links, or skills.

Profile:
- Name: 김성현 (Kim Seonghyeon), AI Engineer.
- Education: 경북소프트웨어마이스터고등학교 인공지능과, 2025.03–2028.03.
- Direction: Understands the principles behind technology, solves real problems, and builds valuable AI services.
- Focus: RAG, LangChain, Vector DB, PyTorch, Agent and LangGraph.
- Contact: kshi3430@gmail.com, GitHub kshi3430.

Projects:
1. JICHINI: AI-based service connecting early-career workers with people who have similar concerns. Built prompt chains, Pinecone RAG retrieval, FastAPI endpoints, vector-data synchronization CRUD, and concern-score filtering. Winter project, 3rd place.
2. CapTeam: AI-based automatic capstone team formation and management. Designed survey/output schemas, Pydantic structured output, and a LangGraph Reflection Loop with LLM correction, algorithm/LLM validation, iteration history and rule-based fallback. Parallel team-level generation reduced processing time from 514.67s to 179.44s (2.87x faster).
3. Def API: Service that converts security vulnerability scan results into developer-friendly reports. Built a DeepSeek-Coder-1.3B-Instruct fine-tuning pipeline with Hugging Face PEFT, LoRA, and 8-bit quantization. Solved kernel crashes and memory issues by moving from Unsloth SFTTrainer to Transformers Trainer.

Awards:
- JICHINI winter project 3rd place; school project 4th place; Data Create Camp encouragement award; KOAI special award; international exchange portfolio silver award; first-year AI subject excellence award (1st in grade). CapTeam also received a project award, but the exact award name is not specified.

Tech stack: Python, LangChain, RAG, LangGraph, FastAPI, PyTorch, Hugging Face, PEFT/LoRA, Pydantic, Pinecone/Vector DB, Git, Notion.

Instructions:
1. Always maintain a professional, calm, extremely polite, and technical tone (matching a highly skilled software architect).
2. Answer in Korean (or English if the user asks in English). Keep replies concise and engaging, typically 2-3 sentences.
3. Be helpful, and invite them to view the projects or email 김성현 directly.
4. If information is not in the profile, say that it is not documented rather than guessing.
5. Keep the conversation focused on 김성현's portfolio.
`;

      const formattedContents = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          formattedContents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          });
        }
      }
      formattedContents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formattedContents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Something went wrong" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
