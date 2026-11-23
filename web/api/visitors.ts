import { createHash } from "crypto";

const fallbackCount = Number(process.env.VISITOR_COUNT ?? 0);
const baseCount = Number.isFinite(fallbackCount) && fallbackCount >= 0 ? Math.floor(fallbackCount) : 0;

// Redis 미설정 환경(로컬/임시 폴백)용 메모리 저장소
const memoryVisitors = new Set<string>();
let memoryCount = baseCount;

const REDIS_COUNT_KEY = "portfolio:visitors:count";
const REDIS_IDS_KEY = "portfolio:visitors:ids";

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function redisCommand<T = unknown>(
  config: { url: string; token: string },
  args: (string | number)[],
): Promise<T> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    throw new Error(`Redis REST API error: ${response.status}`);
  }
  const data = (await response.json()) as { result?: T; error?: string };
  if (data.error) {
    throw new Error(`Redis error: ${data.error}`);
  }
  return data.result as T;
}

async function getRedisCount(config: { url: string; token: string }): Promise<number> {
  const raw = await redisCommand<string | number | null>(config, ["GET", REDIS_COUNT_KEY]);
  if (raw === null || raw === undefined) {
    if (baseCount > 0) {
      await redisCommand(config, ["SETNX", REDIS_COUNT_KEY, baseCount]);
      const initialized = await redisCommand<string | number | null>(config, ["GET", REDIS_COUNT_KEY]);
      const parsedInit = Number(initialized);
      return Number.isFinite(parsedInit) ? parsedInit : baseCount;
    }
    return 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : baseCount;
}

async function registerRedisVisit(
  config: { url: string; token: string },
  visitorKey: string,
  ipKey: string | null,
): Promise<{ count: number; counted: boolean }> {
  // 초기 baseCount가 설정되어 있다면 카운터 키가 비어있을 때만 초기화
  if (baseCount > 0) {
    await redisCommand(config, ["SETNX", REDIS_COUNT_KEY, baseCount]);
  }

  const alreadyById = await redisCommand<number>(config, ["SISMEMBER", REDIS_IDS_KEY, visitorKey]);
  const alreadyByIp = ipKey
    ? await redisCommand<number>(config, ["SISMEMBER", REDIS_IDS_KEY, ipKey])
    : 0;

  if (alreadyById === 1 || alreadyByIp === 1) {
    // 같은 IP로 새 세션이 들어온 경우 세션 키도 함께 기록해 일관성 유지
    if (alreadyById !== 1) {
      await redisCommand(config, ["SADD", REDIS_IDS_KEY, visitorKey]);
    }
    const count = await getRedisCount(config);
    return { count, counted: false };
  }

  // 동시 요청 시 SADD 반환값(1이면 최초 등록)으로 중복 증가 방지
  const added = await redisCommand<number>(config, ["SADD", REDIS_IDS_KEY, visitorKey]);
  if (ipKey) {
    await redisCommand(config, ["SADD", REDIS_IDS_KEY, ipKey]);
  }

  if (added === 1) {
    const nextCount = await redisCommand<number>(config, ["INCR", REDIS_COUNT_KEY]);
    return { count: Number(nextCount), counted: true };
  }

  const count = await getRedisCount(config);
  return { count, counted: false };
}

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
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const redis = getRedisConfig();

  if (req.method === "GET") {
    try {
      if (redis) {
        const count = await getRedisCount(redis);
        return res.status(200).json({ count, storage: "redis" });
      }
      return res.status(200).json({ count: memoryCount, storage: "memory" });
    } catch (error) {
      console.error("Visitor counter GET error:", error);
      return res.status(200).json({ count: memoryCount, storage: "memory-fallback" });
    }
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

  if (redis) {
    try {
      const result = await registerRedisVisit(redis, visitorKey, ipKey);
      return res.status(200).json({ ...result, storage: "redis" });
    } catch (error) {
      console.error("Visitor counter Redis POST error:", error);
      // Redis 장애 시 아래 메모리 폴백으로 이어집니다.
    }
  }

  const alreadyCounted = memoryVisitors.has(visitorKey) || (ipKey ? memoryVisitors.has(ipKey) : false);
  if (!alreadyCounted) {
    memoryVisitors.add(visitorKey);
    if (ipKey) memoryVisitors.add(ipKey);
    memoryCount += 1;
  } else if (!memoryVisitors.has(visitorKey)) {
    memoryVisitors.add(visitorKey);
  }

  return res.status(200).json({ count: memoryCount, counted: !alreadyCounted, storage: "memory" });
}
