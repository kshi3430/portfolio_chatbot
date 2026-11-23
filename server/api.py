"""
FastAPI 챗봇 API 서버

엔드포인트:
- POST /chat: 질문을 받아 Jev + Hybrid Search + LangGraph 기반 RAG 답변 반환
- GET /health: 서버 및 RAG/Jev 상태 확인
"""

import json
import os
from pathlib import Path
from typing import Literal
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

try:
    from .rag_core import build_rag_engine
except ImportError:
    from rag_core import build_rag_engine

# 실행 위치와 상관없이 프로젝트 루트의 .env를 로드합니다.
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(
    title="AI Portfolio RAG API",
    description="TypeSafe Jev + Hybrid Search + LangGraph 기반 포트폴리오 질의응답 API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rag_engine = None


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatHistoryItem] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    sources: list


@app.on_event("startup")
async def startup_event():
    """서버 시작 시 RAG 엔진(Hybrid Search + Jev + LangGraph) 초기화"""
    global rag_engine

    load_dotenv(ROOT_DIR / ".env", override=True)
    upstage_api_key = os.getenv("UPSTAGE_API_KEY")
    if not upstage_api_key:
        raise RuntimeError("UPSTAGE_API_KEY가 설정되지 않았습니다.")

    projects_json = ROOT_DIR / "data" / "projects.json"
    personal_json = ROOT_DIR / "data" / "personal.json"

    print("🚀 RAG 엔진(Jev + Hybrid Search + LangGraph) 초기화 중...")

    rag_engine = build_rag_engine(
        projects_json_path=str(projects_json),
        personal_json_path=str(personal_json),
        upstage_api_key=upstage_api_key,
        typesafe_api_key=os.getenv("TYPESAFE_API_KEY", ""),
        typesafe_model=os.getenv("TYPESAFE_DEFAULT_MODEL", "jev-latest"),
        rebuild=False,
        top_k=5,
        chunk_size=1000,
        chunk_overlap=0,
        persist_directory=str(ROOT_DIR / "chroma_db"),
        upstage_model=os.getenv("UPSTAGE_MODEL", "solar-pro4"),
        passage_embedding_model=os.getenv(
            "UPSTAGE_EMBEDDING_PASSAGE_MODEL", "solar-embedding-2-passage"
        ),
        query_embedding_model=os.getenv(
            "UPSTAGE_EMBEDDING_QUERY_MODEL", "solar-embedding-2-query"
        ),
        base_url=os.getenv("UPSTAGE_BASE_URL", "https://api.upstage.ai/v1"),
    )

    print("✅ RAG 엔진 준비 완료!")


@app.get("/")
async def root():
    return {
        "message": "AI Portfolio RAG API",
        "version": "2.0.0",
        "endpoints": {
            "/chat": "POST - 챗봇 질의응답 (Jev + Hybrid Search + LangGraph)",
            "/health": "GET - 서버 상태 확인",
        },
    }


@app.get("/health")
async def health_check():
    if rag_engine is None:
        raise HTTPException(status_code=503, detail="RAG 엔진이 초기화되지 않았습니다.")

    load_dotenv(ROOT_DIR / ".env", override=True)
    rag_engine.ensure_jev_client(os.getenv("TYPESAFE_API_KEY", ""))

    return {
        "status": "healthy",
        "rag_engine": "ready",
        "jev_classifier": "active" if rag_engine.jev_client is not None else "fallback_rule",
    }


def _prepare_chat_inputs(request: ChatRequest) -> list[dict[str, str]]:
    if rag_engine is None:
        raise HTTPException(status_code=503, detail="RAG 엔진이 초기화되지 않았습니다.")

    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="질문이 비어있습니다.")

    # .env에 TYPESAFE_API_KEY를 새로 넣었을 때 재시작 없이도 즉시 반영
    load_dotenv(ROOT_DIR / ".env", override=True)
    rag_engine.ensure_jev_client(os.getenv("TYPESAFE_API_KEY", ""))

    return [
        {
            "role": item.role,
            "content": item.content.strip()[:2000],
        }
        for item in request.history[-10:]
        if item.content.strip()
    ]


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    history = _prepare_chat_inputs(request)

    try:
        result = rag_engine.query(request.question, history=history)

        return ChatResponse(
            answer=result["answer"],
            sources=result["sources"],
        )

    except Exception as e:
        print(f"❌ 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail=f"답변 생성 중 오류: {str(e)}")


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    history = _prepare_chat_inputs(request)

    def event_generator():
        try:
            for event in rag_engine.stream_query(request.question, history=history):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            print(f"❌ 스트리밍 오류 발생: {str(e)}")
            error_payload = {"type": "error", "error": f"답변 생성 중 오류: {str(e)}"}
            yield f"data: {json.dumps(error_payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
    )
