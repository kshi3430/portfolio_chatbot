const fallbackCount = Number(process.env.VISITOR_COUNT || 717);
const sessions = new Set<string>();
let count = Number.isFinite(fallbackCount) ? fallbackCount : 717;

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    return res.status(200).json({ count });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
  if (sessionId.length < 8 || sessionId.length > 100) {
    return res.status(400).json({ error: "유효한 방문 세션 ID가 필요합니다." });
  }

  const counted = !sessions.has(sessionId);
  if (counted) {
    sessions.add(sessionId);
    count += 1;
  }

  return res.status(200).json({ count, counted });
}
