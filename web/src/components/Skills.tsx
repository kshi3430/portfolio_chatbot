import React from "react";
import { SkillGroup } from "../types";
import { Cpu, Terminal, BrainCircuit, Server, Wrench } from "lucide-react";
import { motion } from "motion/react";

const SKILL_GROUPS: (SkillGroup & { icon: any })[] = [
  {
    category: "LANGUAGE",
    skills: ["Python"],
    icon: Terminal,
  },
  {
    category: "AI ENGINEERING",
    skills: ["LangChain", "RAG", "LangGraph", "LangSmith", "TypeSafe Jev", "Prompt Engineering", "Structured Output"],
    icon: BrainCircuit,
  },
  {
    category: "MODEL & BACKEND",
    skills: ["PyTorch", "FastAPI", "Pydantic", "Docker", "PostgreSQL"],
    icon: Server,
  },
  {
    category: "DATA & TOOLS",
    skills: ["Pinecone", "Vector DB", "Git", "Notion"],
    icon: Wrench,
  },
];

export function Skills() {
  return (
    <section className="py-12 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-1.5 font-mono text-xs text-primary-emerald tracking-widest uppercase mb-1">
            <Cpu className="w-3.5 h-3.5" />
            ENGINEERING SPECIFICATIONS
          </div>
          <h3 className="font-display text-2xl font-bold tracking-tight text-on-surface">
            Technical Stack
          </h3>
        </div>

        {/* Skill Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SKILL_GROUPS.map((group, groupIdx) => {
            const Icon = group.icon;
            return (
              <motion.div
                key={group.category}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: groupIdx * 0.1 }}
                className="glass-card p-6 rounded-2xl border border-white/5 bg-surface-low/20 flex flex-col justify-between group hover:border-primary-emerald/20 transition-all duration-300"
              >
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-surface-high border border-white/5 flex items-center justify-center text-primary-emerald group-hover:text-primary-glow transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <h4 className="font-display text-sm font-bold tracking-wider text-on-surface">
                      {group.category}
                    </h4>
                  </div>

                  <ul className="space-y-2 font-mono text-[11px] text-on-surface-variant">
                    {group.skills.map((skill, skillIdx) => (
                      <li key={skillIdx} className="flex items-center gap-1.5">
                        <span className="w-1 h-1 bg-primary-emerald/50 rounded-full" />
                        <span>{skill}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 font-mono text-[9px] text-on-surface-variant/40 uppercase">
                  STATUS // LEARNING_AND_BUILDING
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
