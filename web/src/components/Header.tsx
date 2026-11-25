import React, { useState, useEffect } from "react";
import { Github, Mail, UsersRound } from "lucide-react";

export function Header() {
  const [visitorCount, setVisitorCount] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("light");
    document.documentElement.style.colorScheme = "light";
  }, []);

  useEffect(() => {
    const createVisitorId = (): string => {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
      return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    };

    const registerVisit = async () => {
      try {
        let visitorId: string | null = null;
        try {
          visitorId = localStorage.getItem("portfolio-visitor-id");
          if (!visitorId) {
            visitorId = createVisitorId();
            localStorage.setItem("portfolio-visitor-id", visitorId);
          }
        } catch {
          visitorId = sessionStorage.getItem("portfolio-visitor-session");
          if (!visitorId) {
            visitorId = createVisitorId();
            sessionStorage.setItem("portfolio-visitor-session", visitorId);
          }
        }

        const response = await fetch("/api/visitors", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: visitorId }),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data?.count === "number" && Number.isFinite(data.count)) {
          setVisitorCount(data.count);
        }
      } catch {
        // 방문자 집계 실패가 포트폴리오 이용을 방해하지 않도록 조용히 무시합니다.
      }
    };

    registerVisit();
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-void/80 backdrop-blur-md px-6 py-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Logo */}
        <h1 className="font-display font-bold tracking-wider text-lg text-on-surface whitespace-nowrap">
          KIM SEONGHYEON
        </h1>

        {/* Live Metadata & Connections */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 font-mono text-xs text-on-surface-variant">
          {/* Compact Visitor Count */}
          <div className="flex items-center gap-1.5 bg-surface-low/50 [:is(.light)_&]:bg-[#F9FAFB] px-2 py-1 rounded-md border border-white/5 [:is(.light)_&]:border-[#E5E7EB] text-[11px]" title="누적 방문자 수">
            <UsersRound className="w-3 h-3 text-primary-emerald [:is(.light)_&]:text-indigo-600" />
            <span>VISITORS {visitorCount === null ? "---" : visitorCount.toLocaleString("ko-KR")}</span>
          </div>

          {/* Social Icons */}
          <div className="flex items-center gap-2 border-l border-white/10 [:is(.light)_&]:border-[#E5E7EB] pl-4 h-5">
            <a
              href="https://github.com/kshi3430"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-emerald [:is(.light)_&]:hover:text-[#0A0A0A] transition-colors"
              title="GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
            <a
              href="mailto:kshi3430@gmail.com"
              className="hover:text-primary-emerald [:is(.light)_&]:hover:text-[#0A0A0A] transition-colors"
              title="Email"
            >
              <Mail className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
