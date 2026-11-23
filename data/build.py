#!/usr/bin/env python3
"""
포트폴리오 데이터 빌드 스크립트

data/projects/ 디렉토리의 project.json 중 실제 projects 배열이 있는
원본 포트폴리오 JSON을 data/projects.json과 web/data/projects.json으로 복사합니다.

RAG용 문서 변환은 server/rag_core.py에서 런타임에 수행합니다.

Usage:
    python data/build.py
"""

import json
import shutil
from pathlib import Path
from typing import Any


def has_real_projects(data: Any) -> bool:
    return isinstance(data, dict) and isinstance(data.get("projects"), list) and len(data["projects"]) > 0


def build_projects_json():
    data_dir = Path(__file__).parent
    root_dir = data_dir.parent
    projects_dir = data_dir / "projects"
    output_file = data_dir / "projects.json"
    web_output_file = root_dir / "web" / "data" / "projects.json"
    personal_file = data_dir / "personal.json"
    web_personal_file = root_dir / "web" / "data" / "personal.json"

    if not projects_dir.exists():
        print(f"❌ Error: {projects_dir} 디렉토리가 없습니다.")
        print("   data/projects/ 디렉토리를 먼저 생성해주세요.")
        return False

    project_folders = sorted([d for d in projects_dir.iterdir() if d.is_dir()])
    if not project_folders:
        print(f"⚠️  Warning: {projects_dir} 디렉토리가 비어있습니다.")
        print("   프로젝트 폴더를 추가해주세요.")
        return False

    print(f"📂 {len(project_folders)}개의 프로젝트 폴더를 발견했습니다.\n")

    candidates: list[tuple[Path, dict[str, Any]]] = []
    for project_folder in project_folders:
        project_json_path = project_folder / "project.json"
        if not project_json_path.exists():
            print(f"⚠️  Skip: {project_folder.name}/ (project.json 없음)")
            continue

        try:
            with open(project_json_path, "r", encoding="utf-8") as f:
                project_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"❌ Error: {project_folder.name}/project.json - JSON 파싱 실패")
            print(f"   {str(e)}")
            continue

        if has_real_projects(project_data):
            candidates.append((project_json_path, project_data))
            names = [project.get("project_name") or project.get("title") for project in project_data["projects"]]
            print(f"✅ {project_folder.name}: {len(names)}개 프로젝트 발견 ({', '.join(names)})")
        else:
            print(f"⚠️  Skip: {project_folder.name}/ (projects 배열이 비어있음)")

    if not candidates:
        print("\n❌ projects 배열이 있는 원본 JSON을 찾지 못했습니다.")
        return False

    if len(candidates) > 1:
        print("\n⚠️  여러 원본 후보가 있어 첫 번째 파일을 사용합니다:")
        for path, data in candidates:
            print(f"   - {path} ({len(data['projects'])}개 프로젝트)")

    source_path, portfolio_data = candidates[0]

    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(portfolio_data, f, ensure_ascii=False, indent=2)

        web_output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(web_output_file, "w", encoding="utf-8") as f:
            json.dump(portfolio_data, f, ensure_ascii=False, indent=2)

        if personal_file.exists():
            shutil.copyfile(personal_file, web_personal_file)

        print(f"\n🎉 성공! {output_file.name} 파일이 생성되었습니다.")
        print(f"   원본 파일: {source_path}")
        print(f"   웹 배포용 파일: {web_output_file}")
        print(f"   총 {len(portfolio_data['projects'])}개의 프로젝트가 포함되었습니다.")
        return True

    except Exception as e:
        print(f"\n❌ projects.json 생성 실패: {str(e)}")
        return False


if __name__ == "__main__":
    success = build_projects_json()
    exit(0 if success else 1)
