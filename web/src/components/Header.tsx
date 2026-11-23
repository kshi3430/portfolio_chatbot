import React, { useState, useEffect } from "react";
import { BrainCircuit, MapPin, Clock, Github, Mail, UsersRound, Moon, Sun } from "lucide-react";

export function Header() {
  const [currentTime, setCurrentTime] = useState("");
  const [visitorCount, setVisitorCount] = useState<number | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("portfolio-theme");
    if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    const updateClock = () => {
      const koreaTime = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date());
      setCurrentTime(koreaTime);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("portfolio-theme", theme);
  }, [theme]);

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
        {/* Logo and Role */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-low border border-primary-emerald/30 flex items-center justify-center text-primary-emerald shadow-inner relative group overflow-hidden">
            <div className="absolute inset-0 bg-primary-emerald/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <BrainCircuit className="w-5 h-5 relative z-10" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold tracking-wider text-lg text-on-surface whitespace-nowrap">
                KIM SEONGHYEON
              </h1>
              <span className="text-[10px] bg-primary-emerald/15 text-primary-emerald font-mono px-1.5 py-0.5 rounded border border-primary-emerald/20 whitespace-nowrap">
                AI ENGINEER
              </span>
            </div>
          </div>
        </div>

        {/* Live Metadata & Connections */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono text-xs text-on-surface-variant">
          {/* Location */}
          <div className="flex items-center gap-1.5 bg-surface-low/50 px-2.5 py-1.5 rounded-md border border-white/5">
            <MapPin className="w-3.5 h-3.5 text-primary-emerald" />
            <span>Gyeongbuk, KR</span>
            <span className="relative flex h-2 w-2 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-emerald opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-emerald"></span>
            </span>
          </div>

          {/* Local Time */}
          <div className="flex items-center gap-1.5 bg-surface-low/50 px-2.5 py-1.5 rounded-md border border-white/5">
            <Clock className="w-3.5 h-3.5 text-primary-emerald" />
            <span>KOREA {currentTime || "00:00:00"}</span>
          </div>

          {/* Visitor Count */}
          <div className="flex items-center gap-1.5 bg-surface-low/50 px-2.5 py-1.5 rounded-md border border-white/5" title="누적 방문자 수">
            <UsersRound className="w-3.5 h-3.5 text-primary-emerald" />
            <span>VISITORS {visitorCount === null ? "---" : visitorCount.toLocaleString("ko-KR")}</span>
          </div>

          {/* Social Icons */}
          <div className="flex items-center gap-2 border-l border-white/10 pl-4 h-5">
            <a
              href="https://github.com/kshi3430"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-emerald transition-colors"
              title="GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
            <a
              href="mailto:kshi3430@gmail.com"
              className="hover:text-primary-emerald transition-colors"
              title="Email"
            >
              <Mail className="w-4 h-4" />
            </a>
          </div>

          <button
            type="button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            className="w-9 h-9 rounded-lg bg-surface-low/70 border border-white/5 flex items-center justify-center hover:text-primary-emerald hover:border-primary-emerald/30 transition-all cursor-pointer"
            aria-label={theme === "dark" ? "화이트 모드로 전환" : "다크 모드로 전환"}
            title={theme === "dark" ? "화이트 모드" : "다크 모드"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
