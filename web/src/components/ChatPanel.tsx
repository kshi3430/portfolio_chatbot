import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, ChatSource, PortfolioNavigation } from "../types";
import { Send, Bot, User, Sparkles, AlertCircle, RefreshCw, X, MapPin, ChevronRight, FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const CHAT_HISTORY_STORAGE_KEY = "portfolio-chat-history";

const createWelcomeMessage = (): ChatMessage => ({
  id: "welcome",
  role: "model",
  text: "안녕하세요! AI Engineer 김성현의 포트폴리오 어시스턴트입니다. 궁금한 게 있다면 편하게 물어보세요.",
  timestamp: new Date(),
});

type MessageBlock =
  | { type: "text"; body: string }
  | { type: "toggle"; title: string; body: string; isStreaming?: boolean };

function stripBoldMarkers(text: string): string {
  return text.replace(/\*\*([^*]+?)\*\*/g, "$1").replace(/\*\*/g, "");
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const normalized = stripBoldMarkers(text);
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /(`[^`]+?`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(normalized.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      const inner = token.slice(1, -1);
      nodes.push(
        <code
          key={`c-${keyIdx++}`}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-primary-emerald/12 text-primary-emerald text-[0.88em] font-mono"
        >
          {inner}
        </code>
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < normalized.length) {
    nodes.push(normalized.slice(lastIndex));
  }
  return nodes;
}

function parseMessageBlocks(raw: string): MessageBlock[] {
  // <details><summary>제목</summary>내용</details> 형태도 [토글: 제목]...[/토글]로 정규화합니다.
  const normalized = raw.replace(
    /<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
    (_m, title, body) => `\n[토글: ${String(title).trim()}]\n${String(body).trim()}\n[/토글]\n`
  );

  const blocks: MessageBlock[] = [];
  const toggleRegex = /\[토글:\s*([^\]]+)\]\s*([\s\S]*?)(?:\[\/토글\]|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = toggleRegex.exec(normalized)) !== null) {
    const before = normalized.slice(lastIndex, match.index).trim();
    if (before) {
      blocks.push({ type: "text", body: before });
    }
    const isClosed = match[0].includes("[/토글]");
    const title = match[1].trim() || "자세히 보기";
    const body = match[2].trim();
    blocks.push({ type: "toggle", title, body, isStreaming: !isClosed });
    lastIndex = toggleRegex.lastIndex;
  }

  const remaining = normalized.slice(lastIndex).trim();
  if (remaining) {
    // 스트리밍 직후 "[토글"이 아직 닫히지 않은 꼬리 문자열은 숨깁니다.
    const cleaned = remaining.replace(/\[토글[^\]]*$/, "").trim();
    if (cleaned) {
      blocks.push({ type: "text", body: cleaned });
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "text", body: raw }];
}

function NumberedToggleCard({
  num,
  title,
  details,
}: {
  num: string;
  title: string;
  details: string[];
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="rounded-xl border border-on-surface/10 bg-surface-low/55 overflow-hidden transition-colors">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-left hover:bg-primary-emerald/8 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-5 h-5 rounded-md bg-primary-emerald/15 border border-primary-emerald/25 text-primary-emerald text-xs font-medium flex items-center justify-center shrink-0">
            {num}
          </span>
          <span className="text-[14px] sm:text-[14.5px] font-medium text-on-surface leading-snug">
            {renderInlineFormatting(title)}
          </span>
        </span>
        <ChevronRight
          className={`w-4 h-4 text-primary-emerald/80 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-90" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && details.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 pt-1">
              <ul className="border-l-2 border-primary-emerald/25 ml-2.5 pl-3.5 space-y-1.5 text-[13.5px] sm:text-[14px] text-on-surface/85 leading-[1.7]">
                {details.map((detail, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-emerald/70 shrink-0 mt-[9px]" />
                    <span className="flex-1 min-w-0">{renderInlineFormatting(detail)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FormattedTextBlock({ body }: { body: string }) {
  const lines = body
    .split("\n")
    .map((l) => stripBoldMarkers(l).trim())
    .filter((l) => l.length > 0);

  const elements: React.ReactNode[] = [];
  let bulletItems: string[] = [];
  let keyIdx = 0;

  const flushBullets = () => {
    if (bulletItems.length === 0) return;
    elements.push(
      <ul key={`ul-${keyIdx++}`} className="space-y-1.5 pl-0.5">
        {bulletItems.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-emerald/80 shrink-0 mt-[10px]" />
            <span className="flex-1 min-w-0">{renderInlineFormatting(item)}</span>
          </li>
        ))}
      </ul>
    );
    bulletItems = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 1) 섹션 헤더 (예: "💡 주요 기능 및 구현 내용", "🛠️ 문제 해결 및 트러블슈팅", "### 제목")
    const sectionMatch = line.match(/^(?:(💡|🛠️|🛠|📌|🔍|✨|🚀|🎯)\s*(.+)|#{2,4}\s*(.+))$/u);
    if (sectionMatch) {
      flushBullets();
      const emoji = sectionMatch[1] || "💡";
      const headerTitle = (sectionMatch[2] || sectionMatch[3] || "").trim();
      elements.push(
        <div
          key={`sec-${keyIdx++}`}
          className="mt-2.5 mb-1 px-3 py-1.5 rounded-lg bg-primary-emerald/10 border-l-2 border-primary-emerald flex items-center gap-2 text-[13.5px] sm:text-[14px] font-medium text-on-surface"
        >
          <span>{emoji}</span>
          <span>{headerTitle}</span>
        </div>
      );
      i++;
      continue;
    }

    // 2) 번호형 소제목 + 하위 설명 블록 (예: "1. 제목" + 아래 "- 설명" 또는 일반 문장)
    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      flushBullets();
      const num = orderedMatch[1];
      const title = orderedMatch[2].trim();
      const details: string[] = [];
      i++;

      while (i < lines.length) {
        const nextLine = lines[i];
        if (
          /^\d+\.\s+/.test(nextLine) ||
          /^(?:(?:💡|🛠️|🛠|📌|🔍|✨|🚀|🎯)\s*.+|#{2,4}\s*.+)$/u.test(nextLine)
        ) {
          break;
        }
        const subBullet = nextLine.match(/^[-•*]\s+(.+)$/);
        details.push(subBullet ? subBullet[1].trim() : nextLine);
        i++;
      }

      if (details.length > 0) {
        elements.push(
          <React.Fragment key={`nt-${keyIdx++}`}>
            <NumberedToggleCard num={num} title={title} details={details} />
          </React.Fragment>
        );
      } else {
        elements.push(
          <div
            key={`ni-${keyIdx++}`}
            className="flex items-start gap-2.5 px-3 py-2 rounded-xl border border-on-surface/10 bg-surface-low/45"
          >
            <span className="w-5 h-5 rounded-md bg-primary-emerald/15 text-primary-emerald text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">
              {num}
            </span>
            <span className="flex-1 min-w-0 leading-[1.7]">{renderInlineFormatting(title)}</span>
          </div>
        );
      }
      continue;
    }

    // 3) 일반 불릿 목록
    const bulletMatch = line.match(/^[-•*]\s+(.+)$/);
    if (bulletMatch) {
      bulletItems.push(bulletMatch[1].trim());
      i++;
      continue;
    }

    // 4) 일반 문단
    flushBullets();
    elements.push(
      <p key={`p-${keyIdx++}`} className="leading-[1.75]">
        {renderInlineFormatting(line)}
      </p>
    );
    i++;
  }

  flushBullets();
  return <div className="space-y-2.5">{elements}</div>;
}

function CollapsibleBlock({
  title,
  body,
  isStreaming = false,
}: {
  title: string;
  body: string;
  isStreaming?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-2.5 rounded-xl border border-on-surface/12 bg-surface-low/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left text-[13.5px] font-medium text-on-surface hover:bg-primary-emerald/8 transition-colors cursor-pointer"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 min-w-0">
          <ChevronRight
            className={`w-4 h-4 text-primary-emerald shrink-0 transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            }`}
          />
          <span className="truncate">{stripBoldMarkers(title)}</span>
        </span>
        <span className="text-[11px] font-medium text-on-surface-variant/70 shrink-0">
          {isStreaming ? "작성 중..." : isOpen ? "접기" : "펼치기"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 pt-2 border-t border-on-surface/8 text-[13.5px] sm:text-[14px] text-on-surface/90">
              {body ? <FormattedTextBlock body={body} /> : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RichMessageContent({ text }: { text: string }) {
  const blocks = parseMessageBlocks(text);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, idx) => (
        <React.Fragment key={block.type === "toggle" ? `t-${idx}-${block.title}` : `b-${idx}`}>
          {block.type === "toggle" ? (
            <CollapsibleBlock
              title={block.title}
              body={block.body}
              isStreaming={block.isStreaming}
            />
          ) : (
            <FormattedTextBlock body={block.body} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function SourcesToggle({ sources }: { sources: ChatSource[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-high/70 hover:bg-surface-highest border border-on-surface/10 text-[11.5px] font-medium text-on-surface-variant transition-colors cursor-pointer"
        aria-expanded={isOpen}
      >
        <FileText className="w-3 h-3 text-primary-emerald shrink-0" />
        <span>참고 문서 {sources.length}건</span>
        <ChevronRight
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5 rounded-xl border border-on-surface/10 bg-surface-low/65 p-3">
              {sources.map((src, idx) => (
                <div
                  key={`${src.title}-${idx}`}
                  className="text-xs leading-relaxed pb-1.5 last:pb-0 border-b last:border-b-0 border-on-surface/8"
                >
                  <div className="font-semibold text-on-surface">{src.title}</div>
                  {src.content_preview && (
                    <p className="text-[11.5px] text-on-surface-variant/80 line-clamp-2 mt-0.5">
                      {src.content_preview}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ChatPanel({
  onClose,
  onNavigate,
}: {
  onClose?: () => void;
  onNavigate?: (nav: PortfolioNavigation) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage()]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    window.sessionStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    setErrorMessage(null);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      // 최근 대화만 전달해 후속 질문의 대상을 해석하면서 요청 크기를 제한합니다.
      const historyPayload = messages
        .filter((msg) => msg.id !== "welcome")
        .slice(-10)
        .map((msg) => ({
          role: msg.role === "model" ? "assistant" : "user",
          content: msg.text,
        }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: textToSend,
          history: historyPayload,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "서버와의 통신에 실패했습니다. 다시 시도해 주세요.");
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        const modelMsgId = `model-${Date.now()}`;
        let buffer = "";
        let accumulatedText = "";
        let hasAppendedModelMsg = false;
        let activeNavLabel: string | undefined;
        let activeNavigation: PortfolioNavigation | undefined;
        let activeSources: ChatSource[] | undefined;

        const upsertModelMessage = (nextText: string) => {
          if (!hasAppendedModelMsg) {
            hasAppendedModelMsg = true;
            const initialMsg: ChatMessage = {
              id: modelMsgId,
              role: "model",
              text: nextText,
              timestamp: new Date(),
              navLabel: activeNavLabel,
              navigation: activeNavigation,
              sources: activeSources,
            };
            setMessages((prev) => [...prev, initialMsg]);
          } else {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === modelMsgId
                  ? {
                      ...msg,
                      text: nextText,
                      ...(activeNavLabel ? { navLabel: activeNavLabel } : {}),
                      ...(activeNavigation ? { navigation: activeNavigation } : {}),
                      ...(activeSources ? { sources: activeSources } : {}),
                    }
                  : msg
              )
            );
          }
        };

        const processEventBlock = (block: string) => {
          const dataLines = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());
          if (dataLines.length === 0) return;

          const payload = JSON.parse(dataLines.join("\n"));
          if (payload.type === "navigate" && payload.navigation) {
            activeNavLabel = payload.navigation.label || undefined;
            activeNavigation = payload.navigation;
            onNavigate?.(payload.navigation);
          } else if (payload.type === "token" && typeof payload.text === "string") {
            accumulatedText += payload.text;
            upsertModelMessage(accumulatedText);
          } else if (payload.type === "done") {
            if (Array.isArray(payload.sources) && payload.sources.length > 0) {
              activeSources = payload.sources;
            }
            if (payload.navigation) {
              activeNavigation = payload.navigation;
              activeNavLabel = payload.navigation.label || activeNavLabel;
            }
            const finalText =
              accumulatedText || (typeof payload.answer === "string" ? payload.answer : "");
            if (finalText) {
              upsertModelMessage(finalText);
            }
          } else if (payload.type === "error") {
            throw new Error(payload.error || "답변 생성 중 오류가 발생했습니다.");
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";
          for (const block of blocks) {
            if (block.trim()) processEventBlock(block);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
          processEventBlock(buffer);
        }

        if (!hasAppendedModelMsg) {
          upsertModelMessage("답변을 가져오는 도중 문제가 발생했습니다.");
        }
      } else {
        const data = await res.json().catch(() => null);
        if (data?.error) {
          throw new Error(data.error);
        }
        const modelMsg: ChatMessage = {
          id: `model-${Date.now()}`,
          role: "model",
          text: data?.text || "답변을 가져오는 도중 문제가 발생했습니다.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, modelMsg]);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputValue);
  };

  return (
    <div className="font-chat glass-card rounded-2xl border border-white/10 bg-surface-low/50 flex flex-col h-[650px] relative overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/5 bg-surface-dim/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-emerald/15 border border-primary-emerald/30 flex items-center justify-center text-primary-emerald shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-display text-sm font-bold text-on-surface whitespace-nowrap">
              Portfolio AI Assistant
            </h4>
            <p className="text-[10px] font-mono text-on-surface-variant whitespace-nowrap">
              AI ENGINEER
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 font-mono text-[9.5px] text-primary-emerald bg-primary-emerald/10 border border-primary-emerald/20 px-2 py-1 rounded whitespace-nowrap">
            <Sparkles className="w-3 h-3" />
            <span>TWIN_BOT_ACTIVE</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-surface-high hover:bg-surface-highest border border-white/5 flex items-center justify-center text-on-surface hover:text-primary-emerald transition-colors cursor-pointer"
              title="Close Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
        {messages.map((msg) => {
          const isModel = msg.role === "model";
          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[88%] ${isModel ? "self-start" : "self-end ml-auto flex-row-reverse"}`}
            >
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${isModel ? "bg-surface-high border-white/5 text-primary-emerald" : "bg-primary-emerald border-primary-emerald/20 text-void"}`}>
                {isModel ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className={`rounded-2xl px-4 py-3.5 text-[14.5px] sm:text-[15px] leading-[1.75] tracking-[0.005em] ${isModel ? "bg-surface-base border border-white/5 text-on-surface/90 font-normal" : "bg-primary-emerald text-void font-medium whitespace-pre-line"}`}>
                  {isModel ? <RichMessageContent text={msg.text} /> : msg.text}
                </div>
                {isModel && (msg.navLabel || (msg.sources && msg.sources.length > 0)) && (
                  <div className="flex flex-col items-start">
                    {msg.navLabel && (
                      <button
                        type="button"
                        onClick={() => msg.navigation && onNavigate?.(msg.navigation)}
                        className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-primary-emerald/10 hover:bg-primary-emerald/18 border border-primary-emerald/25 text-xs font-medium text-primary-emerald transition-colors cursor-pointer"
                      >
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>{msg.navLabel} 화면으로 이동</span>
                      </button>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <SourcesToggle sources={msg.sources} />
                    )}
                  </div>
                )}
                <div className={`text-[11px] text-on-surface-variant/55 mt-1.5 ${isModel ? "" : "text-right"}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator (첫 토큰 수신 전까지 표시) */}
        {isLoading && messages[messages.length - 1]?.role !== "model" && (
          <div className="flex gap-3 max-w-[80%] self-start">
            <div className="w-8 h-8 rounded-full bg-surface-high border border-white/5 flex items-center justify-center text-primary-emerald shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-surface-base border border-white/5 rounded-2xl px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-primary-emerald rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-primary-emerald rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-primary-emerald rounded-full animate-bounce" />
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex gap-3 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold mb-1">통신 오류가 발생했습니다.</p>
              <p className="text-red-400/80">{errorMessage}</p>
              <button
                onClick={() => setErrorMessage(null)}
                className="mt-2 text-primary-emerald hover:underline font-mono text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                창 닫기 및 재시도
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box */}
      <form onSubmit={handleFormSubmit} className="p-4 bg-surface-dim border-t border-white/5 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={isLoading ? "답변 대기 중..." : "궁금한 것을 물어보세요..."}
          disabled={isLoading}
          className="flex-1 bg-surface-low border border-white/5 rounded-xl px-4 py-3 text-[14.5px] sm:text-[15px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary-emerald/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          className="bg-primary-emerald hover:bg-primary-glow text-void font-bold p-3 rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
