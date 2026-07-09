import React, { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../types";
import { Send, Bot, User, CornerDownLeft, Sparkles, AlertCircle, RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const SUGGESTIONS = [
  "김성현은 어떤 AI 기술을 다루나요?",
  "CapTeam의 성능 개선이 궁금해요.",
  "JICHINI 프로젝트를 설명해줘.",
  "Def API에서 어떤 문제를 해결했나요?",
];

export function ChatPanel({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      text: "안녕하세요! AI 엔지니어 김성현의 포트폴리오 어시스턴트입니다. 프로젝트, 기술 스택, 수상 경험과 개발 과정에 대해 편하게 물어보세요.",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
      // Map history for the API (role: 'user' | 'model', text)
      // Exclude the welcome message if you like, or pass it as 'model'
      const historyPayload = messages.map((msg) => ({
        role: msg.role,
        text: msg.text,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: textToSend,
          history: historyPayload,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "서버와의 통신에 실패했습니다. 다시 시도해 주세요.");
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const modelMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: "model",
        text: data.text || "답변을 가져오는 도중 문제가 발생했습니다.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, modelMsg]);
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
    <div className="glass-card rounded-2xl border border-white/10 bg-surface-low/50 flex flex-col h-[650px] relative overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 bg-surface-dim/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-emerald/15 border border-primary-emerald/30 flex items-center justify-center text-primary-emerald">
            <Bot className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h4 className="font-display text-sm font-bold text-on-surface flex items-center gap-1.5">
              Portfolio AI Assistant
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-emerald opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-emerald"></span>
              </span>
            </h4>
            <p className="text-[10px] font-mono text-on-surface-variant/70">
              KIM SEONGHYEON · AI ENGINEER
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-primary-emerald bg-primary-emerald/10 border border-primary-emerald/20 px-2.5 py-1 rounded">
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
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        {messages.map((msg) => {
          const isModel = msg.role === "model";
          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[85%] ${isModel ? "self-start" : "self-end ml-auto flex-row-reverse"}`}
            >
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${isModel ? "bg-surface-high border-white/5 text-primary-emerald" : "bg-primary-emerald border-primary-emerald/20 text-void"}`}>
                {isModel ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              <div>
                <div className={`rounded-2xl px-4 py-3 text-xs md:text-sm leading-relaxed whitespace-pre-line ${isModel ? "bg-surface-base border border-white/5 text-on-surface" : "bg-primary-emerald text-void font-semibold"}`}>
                  {msg.text}
                </div>
                <div className={`text-[9px] font-mono text-on-surface-variant/50 mt-1 ${isModel ? "" : "text-right"}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
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

      {/* Suggested Prompts Grid */}
      <div className="px-6 py-3 bg-surface-dim/50 border-t border-white/5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant/40 mb-2">
          Suggested Prompts
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSendMessage(s)}
              disabled={isLoading}
              className="text-[10px] md:text-xs font-mono bg-surface-high/60 hover:bg-surface-high text-on-surface-variant hover:text-primary-emerald border border-white/5 hover:border-primary-emerald/30 px-3 py-1.5 rounded-full transition-all duration-200 text-left disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Message Input Box */}
      <form onSubmit={handleFormSubmit} className="p-4 bg-surface-dim border-t border-white/5 flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={isLoading ? "답변 대기 중..." : "김성현의 프로젝트와 기술에 대해 물어보세요..."}
          disabled={isLoading}
          className="flex-1 bg-surface-low border border-white/5 rounded-xl px-4 py-3 text-xs md:text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary-emerald/40 disabled:opacity-50"
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
