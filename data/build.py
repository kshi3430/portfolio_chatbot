#!/usr/bin/env python3
"""
포트폴리오 Markdown 지식 베이스 동기화 스크립트

data/docs/*.md 파일들을 web/data/docs/*.md로 동기화합니다.
(Render 백엔드 server/rag_core.py는 data/docs/*.md를,
 Vercel 서버리스 web/api/chat.ts는 web/data/docs/*.md를 ## 헤더 단위로 청킹해 로드합니다.)

Usage:
    python data/build.py
"""

import shutil
from pathlib import Path


def sync_markdown_docs() -> bool:
    data_dir = Path(__file__).resolve().parent
    root_dir = data_dir.parent
    src_docs_dir = data_dir / "docs"
    dst_docs_dir = root_dir / "web" / "data" / "docs"

    if not src_docs_dir.exists():
        print(f"❌ Error: {src_docs_dir} 디렉토리가 없습니다.")
        return False

    md_files = sorted(src_docs_dir.glob("*.md"))
    if not md_files:
        print(f"❌ Error: {src_docs_dir}에 .md 파일이 없습니다.")
        return False

    dst_docs_dir.mkdir(parents=True, exist_ok=True)
    src_names = {p.name for p in md_files}
    for old_file in dst_docs_dir.glob("*.md"):
        if old_file.name not in src_names:
            old_file.unlink()
            print(f"🧹 삭제된 구형 문서 제거: {old_file.name}")

    for md_file in md_files:
        shutil.copyfile(md_file, dst_docs_dir / md_file.name)
        print(f"✅ 동기화 완료: {md_file.name}")

    print(f"\n🎉 총 {len(md_files)}개의 Markdown 지식 문서를 {dst_docs_dir}에 동기화했습니다.")
    return True


if __name__ == "__main__":
    success = sync_markdown_docs()
    exit(0 if success else 1)
