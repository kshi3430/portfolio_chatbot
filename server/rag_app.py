"""
RAG 터미널 테스트 UI

사용법:
    python server/rag_app.py
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

from rag_core import build_rag_engine


def print_separator():
    print("\n" + "=" * 80 + "\n")


def print_answer(result: dict):
    print_separator()
    print(
        f"🧭 분류: intent={result.get('intent')} | "
        f"project={result.get('target_project')} | "
        f"style={result.get('response_style')} | "
        f"by={result.get('classified_by')}"
    )
    print("\n💬 답변:")
    print(result["answer"])

    print("\n📚 출처:")
    if result["sources"]:
        for idx, source in enumerate(result["sources"], 1):
            print(f"  [{idx}] ({source.get('category', 'portfolio')}) {source['title']}")
            print(f"      {source['content_preview']}")
    else:
        print("  (출처 없음)")
    print_separator()


def main():
    root_dir = Path(__file__).resolve().parent.parent
    load_dotenv(root_dir / ".env", override=True)
    upstage_api_key = os.getenv("UPSTAGE_API_KEY")

    if not upstage_api_key:
        print("❌ UPSTAGE_API_KEY가 설정되지 않았습니다.")
        print("   .env 파일에 'UPSTAGE_API_KEY=your_key' 를 추가하세요.")
        sys.exit(1)

    projects_json = root_dir / "data" / "projects.json"
    personal_json = root_dir / "data" / "personal.json"

    if not projects_json.exists():
        print(f"❌ projects.json을 찾을 수 없습니다: {projects_json}")
        sys.exit(1)

    print("🚀 RAG 엔진 초기화 중...")
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
        persist_directory=str(root_dir / "chroma_db"),
        upstage_model=os.getenv("UPSTAGE_MODEL", "solar-pro4"),
        passage_embedding_model=os.getenv(
            "UPSTAGE_EMBEDDING_PASSAGE_MODEL", "solar-embedding-2-passage"
        ),
        query_embedding_model=os.getenv(
            "UPSTAGE_EMBEDDING_QUERY_MODEL", "solar-embedding-2-query"
        ),
        base_url=os.getenv("UPSTAGE_BASE_URL", "https://api.upstage.ai/v1"),
    )

    print_separator()
    print("✅ RAG 시스템 준비 완료!")
    print("  - 종료하려면 'exit', 'quit', '종료' 입력")
    print_separator()

    history = []
    while True:
        question = input("\n🤔 질문: ").strip()
        if question.lower() in ["exit", "quit", "종료", "q"]:
            print("\n👋 종료합니다.")
            break
        if not question:
            continue

        try:
            print("\n🔍 검색 및 생성 중...")
            result = rag_engine.query(question, history=history)
            print_answer(result)
            history.append({"role": "user", "content": question})
            history.append({"role": "assistant", "content": result["answer"]})
        except Exception as e:
            print(f"\n❌ 오류 발생: {str(e)}")


if __name__ == "__main__":
    main()
