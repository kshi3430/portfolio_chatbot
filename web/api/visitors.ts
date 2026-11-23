import { createHash } from "crypto";

const fallbackCount = Number(process.env.VISITOR_COUNT ?? 0);
const visitors = new Set<string>();
let count = Number.isFinite(fallbackCount) ? fallbackCount : 0;

function getClientIpHash(req: any): string | null {
  const forwarded = req.headers?.["x-forwarded-for"];
  const rawIp =
    typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "";
  if (!rawIp) return null;
  return `ip:${createHash("sha256").update(String(rawIp)).digest("hex").slice(0, 16)}`;
}

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    return res.status(200).json({ count });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
  if (sessionId.length < 8 || sessionId.length > 100) {
    return res.status(400).json({ error: "유효한 방문자 ID가 필요합니다." });
  }

  const visitorKey = `id:${sessionId}`;
  const ipKey = getClientIpHash(req);
  const alreadyCounted = visitors.has(visitorKey) || (ipKey ? visitors.has(ipKey) : false);

  if (!alreadyCounted) {
    visitors.add(visitorKey);
    if (ipKey) visitors.add(ipKey);
    count += 1;
  }

  return res.status(200).json({ count, counted: !alreadyCounted });
}
