# Portfolio AI Chatbot 아키텍처 및 구현

## [Portfolio Chatbot / 개요] 포트폴리오 AI 챗봇 아키텍처 개요

이 포트폴리오 웹사이트에 탑재된 **Portfolio AI Assistant**는 방문자가 김성현의 프로젝트, 기술 스택, 수상 경력, 대외활동, 개인 소개까지 자연어로 질문하고 근거 문서와 함께 즉시 답변을 받을 수 있도록 설계된 RAG(Retrieval-Augmented Generation) 기반 AI 챗봇입니다.
단일 서버에 의존하지 않고 **Vercel Serverless(`/api/chat`)** 와 **Render FastAPI 백엔드(`server/api.py`, `server/rag_core.py`)** 를 결합한 이중화 구조로 구축해, 외부 백엔드가 슬립 상태여도 끊김 없이 응답합니다.

## [Portfolio Chatbot / 이중화 배포] Vercel Serverless 프록시 및 8초 Fallback 구조

운영 환경은 프론트엔드(React + Vite)와 API 게이트웨이(Vercel Serverless)가 먼저 요청을 받고, `RAG_API_URL`로 연결된 Render FastAPI 백엔드로 프록시합니다.
- **정상 프록시 경로**: Render 백엔드가 깨어 있으면 TypeSafe Jev + ChromaDB·Kiwi BM25 Hybrid Search + LangGraph 파이프라인을 실행해 SSE 스트리밍(`/chat/stream`)으로 응답합니다. 이때 연결·헤더 응답 단계에만 8초 `AbortController` 타임아웃을 걸고, 스트리밍 수신이 시작되면 타임아웃을 해제해 긴 답변도 끊기지 않게 처리합니다.
- **무중단 Fallback 경로**: Render 무료 플랜이 슬립 상태이거나 8초 내 응답하지 못하면, Vercel Serverless(`web/api/chat.ts`)가 즉시 내장 RAG 엔진(Upstage Solar Embedding 코사인 검색 + Upstage Solar Pro 4 스트리밍)으로 자동 전환해 응답합니다.

## [Portfolio Chatbot / 지식 베이스] Markdown(## 헤더) 단위 청킹과 개인정보 격리

챗봇의 지식 베이스는 `data/docs/*.md` 순수 마크다운 문서들로 관리되며, `data/build.py`를 통해 `web/data/docs/*.md`와 동기화됩니다.
- **청킹 규칙**: 모든 `.md` 문서는 **`##` (`h2`) 헤더마다 1개의 청크**로 분할되며, 청크 내부의 `###` (`h3`) 소제목은 문맥 유지를 위해 한 청크 안에 함께 묶입니다.
- **유연한 검색 + 하이브리드 격리**: 프로젝트나 섹션 단위의 과도한 하드 필터링을 두지 않고 전체 포트폴리오 청크를 유연하게 검색해 자연스러운 답변을 생성합니다. 단, `personal.md`(`[Personal]`) 청크는 `personal` 카테고리로 격리해 `personal_tmi` 의도일 때만 검색하고 일반 포트폴리오 질문에서는 물리적으로 차단합니다.

## [Portfolio Chatbot / 검색 및 추론] TypeSafe Jev 의도 분류, Hybrid Search, LangGraph 및 Solar Pro 4

1. **의도 분류 (TypeSafe Jev)**: 단일 호출로 질문 의도(`chitchat`, `out_of_scope`, `personal_tmi`, `career_profile`, `project_overview`, `project_deep_dive`), 대상 프로젝트, UI 이동 타겟을 분류하며, 키 미설정·오류 시 규칙 기반 가드레일로 안전하게 보정합니다.
2. **Hybrid Search (Dense + Sparse RRF)**:
   - **Dense**: ChromaDB + Upstage Solar Embedding (`solar-embedding-2-passage` / `solar-embedding-2-query`)
   - **Sparse**: `kiwipiepy` 한국어 형태소 분석기 + `BM25Okapi`
   - 두 결과를 RRF(Reciprocal Rank Fusion)로 결합하고, `##` 헤더 태그와 키워드 힌트를 완만하게 가산해 상위 문서를 선별합니다.
3. **LangGraph 워크플로 및 LLM 생성**: `classify_input → (chitchat | out_of_scope | hybrid_search → 의도별 전용 프롬프트 노드) → END` 그래프로 분기하며, **Upstage Solar Pro 4 (`solar-pro4`)** 모델이 근거 문서 기반의 구조화된 답변을 생성합니다.

## [Portfolio Chatbot / 관측 및 UX] LangSmith 트레이싱, SSE 스트리밍 및 화면 자동 이동

- **LangSmith 관측성**: Render 백엔드(`langsmith.wrappers.wrap_openai` + LangGraph)와 Vercel Serverless(`wrapOpenAI` + `traceable` + `awaitPendingTraceBatches`) 양쪽 모두에 LangSmith 트레이싱을 연동해 요청 흐름, 검색 문서, LLM 지연 시간과 토큰 비용을 추적합니다.
- **실시간 SSE 스트리밍 & 구조화 UI**: 토큰 단위 스트리밍과 함께 `💡 주요 기능 및 구현 내용`, 클릭 가능한 번호형 토글 카드, 참고 문서 출처(`sources`) 토글을 제공합니다.
- **질문 연동 화면 자동 이동(Navigation)**: 질문 의도와 `##` 헤더의 프로젝트/섹션 태그(`[JICHINI / 개발 내용]`, `[CapTeam / 문제와 해결]` 등)를 분석해 `navigate` 이벤트를 전송하고, 해당 포트폴리오 섹션 스크롤 또는 프로젝트 상세 모달(`01 개요 & 동기`, `02 개발 내용`, `03 문제와 해결`, `04 배운 점`)을 자동으로 열어 하이라이트합니다.
