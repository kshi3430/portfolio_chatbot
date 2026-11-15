"""
FastAPI 챗봇 API 서버

엔드포인트:
- POST /chat: 질문을 받아 RAG 답변 반환
- GET /health: 서버 상태 확인
"""

import os
from pathlib import Path
from typing import Dict, Any, Literal
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from .rag_core import build_rag_engine
except ImportError:
    from rag_core import build_rag_engine

# 실행 위치와 상관없이 프로젝트 루트의 .env를 로드합니다.
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

# FastAPI 앱 생성
app = FastAPI(
    title="AI Portfolio RAG API",
    description="프로젝트 포트폴리오 질의응답 API",
    version="1.0.0"
)

# CORS 설정 (웹에서 접근 가능하도록)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 중에는 모든 origin 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# RAG 엔진 전역 변수
rag_engine = None


# 요청/응답 모델 정의
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
    """
    서버 시작 시 RAG 엔진 초기화
    """
    global rag_engine

    # API 키 확인
    upstage_api_key = os.getenv("UPSTAGE_API_KEY")
    if not upstage_api_key:
        raise RuntimeError("UPSTAGE_API_KEY가 설정되지 않았습니다.")

    # projects.json 경로
    projects_json = ROOT_DIR / "data" / "projects.json"

    print("🚀 RAG 엔진 초기화 중...")

    # RAG 엔진 빌드
    rag_engine = build_rag_engine(
        projects_json_path=str(projects_json),
        upstage_api_key=upstage_api_key,
        rebuild=False,  # 기존 DB 재사용
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
    """
    API 루트 - 간단한 정보 반환
    """
    return {
        "message": "AI Portfolio RAG API",
        "version": "1.0.0",
        "endpoints": {
            "/chat": "POST - 챗봇 질의응답",
            "/health": "GET - 서버 상태 확인"
        }
    }


@app.get("/health")
async def health_check():
    """
    서버 상태 확인
    """
    if rag_engine is None:
        raise HTTPException(status_code=503, detail="RAG 엔진이 초기화되지 않았습니다.")

    return {
        "status": "healthy",
        "rag_engine": "ready"
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    챗봇 질의응답

    Args:
        request: 질문 요청

    Returns:
        답변 및 출처
    """
    if rag_engine is None:
        raise HTTPException(status_code=503, detail="RAG 엔진이 초기화되지 않았습니다.")

    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="질문이 비어있습니다.")

    try:
        # RAG 실행
        history = [
            {
                "role": item.role,
                "content": item.content.strip()[:2000],
            }
            for item in request.history[-10:]
            if item.content.strip()
        ]
        result = rag_engine.query(request.question, history=history)

        return ChatResponse(
            answer=result['answer'],
            sources=result['sources']
        )

    except Exception as e:
        print(f"❌ 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail=f"답변 생성 중 오류: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    # 개발 서버 실행
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8001,
        reload=True  # 코드 변경 시 자동 재시작
    )
