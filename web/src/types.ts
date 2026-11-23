export interface PortfolioNavigation {
  section: "projects" | "skills" | "about";
  projectId?: "capteam" | "jichini" | null;
  modalSection?: "modal-overview" | "modal-build" | "modal-troubleshooting" | "modal-learned" | null;
  highlightText?: string | null;
  label?: string;
}

export interface ChatSource {
  title: string;
  content_preview: string;
  category?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: Date;
  navLabel?: string;
  navigation?: PortfolioNavigation;
  sources?: ChatSource[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  longDescription?: string;
  period: string;
  role: string;
  team: string[];
  motivation: string;
  development: { title: string; details: string[] }[];
  troubleshooting: { title: string; problem: string; solution: string; result?: string }[];
  learnings?: string[];
  tags: string[];
  highlight: string;
  gridSpan: "large" | "medium" | "small";
  demoUrl?: string;
  githubUrl?: string;
}

export interface ExperienceItem {
  id: string;
  period: string;
  role: string;
  company: string;
  description: string;
  isCurrent?: boolean;
}

export interface SkillGroup {
  category: string;
  skills: string[];
}
