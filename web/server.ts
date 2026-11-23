import express from "express";
import path from "path";
import { createHash } from "crypto";
import { createServer as createViteServer } from "vite";
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

  const registerVisitorSession = (sessionId: string, ipHash: string | null) => {
    visitorQueue = visitorQueue.then(async () => {
      const data = await readVisitorData();
      const idKey = `id:${sessionId}`;
      const alreadyCounted =
        data.sessions.includes(sessionId) ||
        data.sessions.includes(idKey) ||
        (ipHash ? data.sessions.includes(ipHash) : false);
      if (alreadyCounted) {
        return { count: data.count, counted: false };
      }

      const keysToStore = ipHash ? [idKey, ipHash] : [idKey];
      const nextData: VisitorData = {
        count: data.count + 1,
        // 파일이 끝없이 커지지 않도록 최근 방문자 식별 키만 보관합니다.
        sessions: [...data.sessions, ...keysToStore].slice(-10000),
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
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.json({ count: (await readVisitorData()).count });
    } catch (error) {
      console.error("Visitor counter read error:", error);
      res.status(500).json({ error: "방문자 수를 불러오지 못했습니다." });
    }
  });

  app.post("/api/visitors", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      const sessionId = req.body?.sessionId;
      if (typeof sessionId !== "string" || sessionId.length < 8 || sessionId.length > 100) {
        return res.status(400).json({ error: "유효한 방문 세션 ID가 필요합니다." });
      }
      const forwarded = req.headers["x-forwarded-for"];
      const rawIp =
        typeof forwarded === "string"
          ? forwarded.split(",")[0].trim()
          : req.headers["x-real-ip"] || req.socket?.remoteAddress || "";
      const ipHash = rawIp
        ? `ip:${createHash("sha256").update(String(rawIp)).digest("hex").slice(0, 16)}`
        : null;
      res.json(await registerVisitorSession(sessionId, ipHash));
    } catch (error) {
      console.error("Visitor counter update error:", error);
      res.status(500).json({ error: "방문자 수를 기록하지 못했습니다." });
    }
  });

  // API routes first
  app.post("/api/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      const history = Array.isArray(req.body?.history)
        ? req.body.history
            .filter((item: any) =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string" &&
              item.content.trim()
            )
            .slice(-10)
            .map((item: any) => ({
              role: item.role,
              content: item.content.trim().slice(0, 2000),
            }))
        : [];

      const wantsStream = req.body?.stream === true;
      const ragApiUrl = process.env.RAG_API_URL || "http://127.0.0.1:8001";
      const targetEndpoint = wantsStream ? "/chat/stream" : "/chat";
      const ragResponse = await fetch(`${ragApiUrl.replace(/\/$/, "")}${targetEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: message.trim(),
          history,
        }),
      });

      if (!ragResponse.ok) {
        const data = await ragResponse.json().catch(() => null);
        const detail = data?.detail || data?.error || "RAG API request failed";
        return res.status(ragResponse.status).json({ error: detail });
      }

      if (wantsStream) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        if (typeof res.flushHeaders === "function") res.flushHeaders();

        const reader = ragResponse.body?.getReader();
        if (!reader) {
          return res.end();
        }
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        return res.end();
      }

      const data = await ragResponse.json().catch(() => null);
      res.json({
        text: data?.answer || "답변을 가져오는 도중 문제가 발생했습니다.",
        sources: data?.sources || [],
      });
    } catch (error: any) {
      console.error("RAG API Proxy Error:", error);
      res.status(500).json({
        error: `RAG API에 연결할 수 없습니다: ${error?.message || "unknown error"}`,
      });
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
