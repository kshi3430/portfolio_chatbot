"""
RAG 핵심 엔진: 검색 + 생성 + 출처 반환

학생들은 이 파일에서 다음을 튜닝할 수 있습니다:
- top_k (검색 개수)
- chunk_size (문서 분할 크기)
- 임베딩 모델 변경
- retriever 전략 변경
"""

import os
import json
import shutil
from typing import List, Dict, Any
from pathlib import Path

# ChromaDB의 익명 telemetry는 posthog 버전 조합에 따라 경고를 낼 수 있습니다.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

from chromadb.config import Settings
from langchain_chroma import Chroma
from openai import OpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document

try:
    from .prompts import BASELINE_SYSTEM_PROMPT, QA_PROMPT_TEMPLATE
except ImportError:
    from prompts import BASELINE_SYSTEM_PROMPT, QA_PROMPT_TEMPLATE


RAG_INDEX_VERSION = "portfolio-json-v9-upstage-solar-embedding-2"
DEFAULT_UPSTAGE_BASE_URL = "https://api.upstage.ai/v1"
DEFAULT_UPSTAGE_MODEL = "solar-pro4"
DEFAULT_PASSAGE_EMBEDDING_MODEL = "solar-embedding-2-passage"
DEFAULT_QUERY_EMBEDDING_MODEL = "solar-embedding-2-query"


class UpstageEmbeddingsAdapter:
    """LangChain/Chroma가 요구하는 임베딩 인터페이스를 Upstage API로 제공합니다."""

    def __init__(
        self,
        client: OpenAI,
        passage_model: str = DEFAULT_PASSAGE_EMBEDDING_MODEL,
        query_model: str = DEFAULT_QUERY_EMBEDDING_MODEL,
        batch_size: int = 50,
    ):
        self.client = client
        self.passage_model = passage_model
        self.query_model = query_model
        self.batch_size = batch_size

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        vectors: List[List[float]] = []
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start : start + self.batch_size]
            response = self.client.embeddings.create(
                model=self.passage_model,
                input=batch,
            )
            vectors.extend(
                item.embedding for item in sorted(response.data, key=lambda item: item.index)
            )
        return vectors

    def embed_query(self, text: str) -> List[float]:
        response = self.client.embeddings.create(
            model=self.query_model,
            input=text,
        )
        return response.data[0].embedding


class RAGEngine:
    """
    프로젝트 포트폴리오를 위한 RAG 엔진

    주요 기능:
    1. projects.json 로드 및 벡터화
    2. 질문에 대한 유사 문서 검색
    3. LLM 기반 답변 생성 + 출처 반환
    """

    def __init__(
        self,
        projects_json_path: str,
        upstage_api_key: str,
        upstage_model: str = DEFAULT_UPSTAGE_MODEL,
        passage_embedding_model: str = DEFAULT_PASSAGE_EMBEDDING_MODEL,
        query_embedding_model: str = DEFAULT_QUERY_EMBEDDING_MODEL,
        base_url: str = DEFAULT_UPSTAGE_BASE_URL,
        persist_directory: str = "./chroma_db",
        top_k: int = 3,
        chunk_size: int = 1000,
        chunk_overlap: int = 0
    ):
        """
        Args:
            projects_json_path: projects.json 파일 경로
            upstage_api_key: Upstage API 키
            upstage_model: Upstage 채팅 모델명
            passage_embedding_model: 문서 저장용 임베딩 모델명
            query_embedding_model: 질의 검색용 임베딩 모델명
            base_url: Upstage OpenAI-compatible API Base URL
            persist_directory: ChromaDB 저장 경로
            top_k: 검색할 문서 개수 (학생 튜닝 가능)
            chunk_size: 문서 분할 크기 (학생 튜닝 가능)
            chunk_overlap: 청크 간 겹침 (학생 튜닝 가능)
        """
        self.projects_json_path = projects_json_path
        self.upstage_api_key = upstage_api_key
        self.upstage_model = upstage_model
        self.passage_embedding_model = passage_embedding_model
        self.query_embedding_model = query_embedding_model
        self.base_url = base_url
        self.top_k = top_k
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.persist_directory = persist_directory

        # 1. 답변 생성과 임베딩에 같은 Upstage OpenAI-compatible 클라이언트를 사용합니다.
        print(f"🔧 LLM 초기화: {upstage_model} ({base_url})")
        self.client = OpenAI(api_key=upstage_api_key, base_url=base_url, timeout=30.0)
        print(f"🔧 임베딩 모델 초기화: passage={passage_embedding_model}, query={query_embedding_model}")
        self.embeddings = UpstageEmbeddingsAdapter(
            self.client,
            passage_model=passage_embedding_model,
            query_model=query_embedding_model,
        )

        # 2. 벡터 스토어 초기화
        self.vectorstore = None
        self.retriever = None

    def _chroma_client_settings(self) -> Settings:
        """ChromaDB telemetry를 끈 클라이언트 설정."""
        return Settings(anonymized_telemetry=False)

    def _metadata_value(self, value: Any) -> str | int | float | bool:
        """ChromaDB가 허용하는 단순 메타데이터 값으로 변환합니다."""
        if isinstance(value, (str, int, float, bool)):
            return value
        if value is None:
            return ""
        if isinstance(value, list):
            return ", ".join(str(item) for item in value)
        return json.dumps(value, ensure_ascii=False)

    def _project_card_to_document(self, project: Dict[str, Any], idx: int) -> Document:
        """기존 id/title/description/tags/link 프로젝트 카드 형식을 Document로 변환합니다."""
        tags = project.get('tags') or []
        if isinstance(tags, str):
            tags = [tags]

        content = "\n".join([
            f"프로젝트: {project.get('title') or project.get('name') or f'project_{idx}' }",
            f"설명: {project.get('description') or project.get('summary') or ''}",
            f"태그: {', '.join(tags)}",
            f"링크: {project.get('link') or project.get('demoUrl') or project.get('githubUrl') or ''}",
        ])

        return Document(
            page_content=content,
            metadata={
                'source': project.get('title') or project.get('name') or f'project_{idx}',
                'project_id': project.get('id') or idx,
                'tags': ', '.join(tags),
                'document_type': 'project',
            }
        )

    def _rag_doc_to_document(self, item: Dict[str, Any], idx: int) -> Document:
        """build.py가 생성한 id/title/content/metadata RAG 문서 형식을 Document로 변환합니다."""
        metadata = {
            key: self._metadata_value(value)
            for key, value in (item.get('metadata') or {}).items()
        }
        title = item.get('title') or metadata.get('title') or item.get('id') or f'doc_{idx}'
        metadata.update({
            'source': str(title),
            'doc_id': item.get('id') or f'doc_{idx}',
        })
        return Document(page_content=item.get('content', ''), metadata=metadata)

    def _portfolio_to_documents(self, data: Dict[str, Any]) -> List[Document]:
        """profile/awards/projects 구조의 포트폴리오 JSON을 검색 문서로 펼칩니다."""
        documents = []

        def append_doc(content: str, metadata: Dict[str, Any]):
            if not content or not content.strip():
                return
            source = metadata.get('source') or metadata.get('project_name') or metadata.get('document_type') or 'portfolio'
            clean_metadata = {key: self._metadata_value(value) for key, value in metadata.items()}
            clean_metadata.setdefault('source', source)
            documents.append(Document(page_content=content.strip(), metadata=clean_metadata))

        profile = data.get('profile')
        if isinstance(profile, dict):
            metadata = dict(profile.get('metadata') or {})
            metadata.update({'source': '프로필 소개', 'doc_id': profile.get('id', 'profile')})
            append_doc(profile.get('content', ''), metadata)

        for section_key in ('education_and_skills', 'awards'):
            for idx, item in enumerate(data.get(section_key) or [], 1):
                if not isinstance(item, dict):
                    continue
                metadata = dict(item.get('metadata') or {})
                source = metadata.get('award_name') or metadata.get('topic') or item.get('id') or section_key
                metadata.update({'source': source, 'doc_id': item.get('id', f'{section_key}_{idx}')})
                append_doc(item.get('content', ''), metadata)

        project_items = [project for project in (data.get('projects') or []) if isinstance(project, dict)]
        if project_items:
            summary_lines = [
                "프로젝트 포트폴리오 전체 요약",
                "김성현의 대표 프로젝트들을 한눈에 볼 수 있도록 프로젝트명, 핵심 목적, 사용 기술을 정리한 문서입니다.",
            ]
            for project in project_items:
                project_name = project.get('project_name') or project.get('title') or project.get('project_id') or '프로젝트'
                summary = project.get('summary') or project.get('description') or ''
                technologies = self._metadata_value(project.get('technologies') or project.get('tags') or [])
                summary_lines.append(f"- {project_name}: {summary} (사용 기술: {technologies})")
            append_doc(
                "\n".join(summary_lines),
                {
                    'source': '프로젝트 전체 요약',
                    'document_type': 'project_summary',
                    'project_names': [project.get('project_name') or project.get('title') or project.get('project_id') for project in project_items],
                }
            )

        for idx, project in enumerate(project_items, 1):
            project_id = project.get('project_id') or project.get('id') or f'project_{idx}'
            project_name = project.get('project_name') or project.get('title') or project_id
            technologies = project.get('technologies') or project.get('tags') or []
            role = project.get('role') or []
            period = project.get('period') or {}
            if isinstance(period, dict):
                period_text = f"{period.get('start', '')} ~ {period.get('end') or '진행 중'}"
            else:
                period_text = str(period)

            base_metadata = {
                'document_type': 'project',
                'project_id': project_id,
                'project_name': project_name,
                'technologies': technologies,
                'role': role,
                'period': period_text,
            }

            motivation = project.get('motivation') or {}
            overview = "\n".join([
                f"프로젝트명: {project_name}",
                f"요약: {project.get('summary') or project.get('description') or ''}",
                f"기간: {period_text}",
                f"역할: {self._metadata_value(role)}",
                f"기술: {self._metadata_value(technologies)}",
                f"팀원 및 역할: {self._metadata_value(project.get('team_members') or [])}",
                f"개발 동기: {motivation.get('content', '') if isinstance(motivation, dict) else motivation}",
                f"포트폴리오 원문: {project.get('source_url') or ''}",
            ])
            append_doc(overview, {**base_metadata, 'source': f'{project_name} 개요', 'section': 'overview'})

            team_members = [member for member in (project.get('team_members') or []) if isinstance(member, dict)]
            if team_members:
                team_lines = [
                    f"프로젝트명: {project_name}",
                    f"{project_name} 팀원 구성과 담당 역할",
                ]
                team_lines.extend(
                    f"- {member.get('name', '')}: {member.get('role', '')}"
                    for member in team_members
                )
                append_doc(
                    "\n".join(team_lines),
                    {**base_metadata, 'source': f'{project_name} 팀원 및 역할', 'section': 'team'}
                )

            troubleshooting_items = [item for item in (project.get('troubleshooting') or []) if isinstance(item, dict)]
            if troubleshooting_items:
                troubleshooting_summary = [
                    f"프로젝트명: {project_name}",
                    "이 문서는 프로젝트에서 겪은 문제, 해결 방법, 결과를 한 번에 정리합니다.",
                ]
                for item in troubleshooting_items:
                    troubleshooting_summary.extend([
                        f"문제: {item.get('title', '')}",
                        f"상황: {item.get('problem', '')}",
                        f"해결 방법: {item.get('solution', '')}",
                        f"결과: {item.get('result', '')}",
                    ])
                append_doc(
                    "\n".join(troubleshooting_summary),
                    {**base_metadata, 'source': f'{project_name} 문제 해결 요약', 'section': 'troubleshooting_summary'}
                )

            for dev in project.get('development') or []:
                if not isinstance(dev, dict):
                    continue
                content = "\n".join([
                    f"프로젝트명: {project_name}",
                    f"개발 내용: {dev.get('title', '')}",
                    f"설명: {dev.get('content', '')}",
                    f"사용 기술: {self._metadata_value(dev.get('technologies') or [])}",
                ])
                append_doc(content, {**base_metadata, 'source': f"{project_name} - {dev.get('title', '개발 내용')}", 'section': 'development'})

            for issue in project.get('troubleshooting') or []:
                if not isinstance(issue, dict):
                    continue
                content = "\n".join([
                    f"프로젝트명: {project_name}",
                    f"트러블슈팅: {issue.get('title', '')}",
                    f"문제: {issue.get('problem', '')}",
                    f"해결: {issue.get('solution', '')}",
                    f"결과: {issue.get('result', '')}",
                ])
                append_doc(content, {**base_metadata, 'source': f"{project_name} - {issue.get('title', '트러블슈팅')}", 'section': 'troubleshooting'})

            for lesson in project.get('lessons') or []:
                if not isinstance(lesson, dict):
                    continue
                content = "\n".join([
                    f"프로젝트명: {project_name}",
                    f"배운 점: {lesson.get('title', '')}",
                    f"내용: {lesson.get('content', '')}",
                ])
                append_doc(content, {**base_metadata, 'source': f"{project_name} - {lesson.get('title', '배운 점')}", 'section': 'lessons'})

        return documents

    def load_projects(self) -> List[Document]:
        """
        projects.json을 로드하여 LangChain Document 형식으로 변환합니다.

        원본 포트폴리오 구조(profile/projects 포함), 새 RAG 문서 형식,
        기존 프로젝트 카드 형식을 모두 지원합니다.
        """
        with open(self.projects_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if isinstance(data, dict):
            documents = self._portfolio_to_documents(data)
        elif isinstance(data, list):
            documents = []
            for idx, item in enumerate(data):
                if not isinstance(item, dict):
                    continue
                if 'content' in item:
                    doc = self._rag_doc_to_document(item, idx)
                else:
                    doc = self._project_card_to_document(item, idx)
                if doc.page_content.strip():
                    documents.append(doc)
        else:
            raise ValueError("projects.json의 최상위 값은 객체 또는 리스트여야 합니다.")

        print(f"✅ {len(documents)}개 RAG 문서 로드 완료")
        return documents

    def build_vectorstore(self):
        """
        벡터 스토어 구축: 문서 로드 → 청킹 → 임베딩 → ChromaDB 저장
        """
        # 1. 프로젝트 로드
        documents = self.load_projects()

        # 2. 텍스트 분할 (학생이 chunk_size 튜닝 가능)
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )
        splits = text_splitter.split_documents(documents)
        print(f"📄 {len(splits)}개 청크로 분할")

        # 3. 벡터 스토어 생성 (ChromaDB)
        if os.path.exists(self.persist_directory):
            shutil.rmtree(self.persist_directory)
            print(f"🧹 기존 벡터 DB 삭제: {self.persist_directory}")

        print("💾 ChromaDB에 임베딩 저장 중...")
        self.vectorstore = Chroma.from_documents(
            documents=splits,
            embedding=self.embeddings,
            persist_directory=self.persist_directory,
            client_settings=self._chroma_client_settings()
        )
        Path(self.persist_directory).mkdir(parents=True, exist_ok=True)
        index_signature = (
            f"{RAG_INDEX_VERSION}:{self.passage_embedding_model}:{self.query_embedding_model}"
        )
        (Path(self.persist_directory) / ".rag_index_version").write_text(index_signature, encoding="utf-8")
        print(f"✅ 벡터 스토어 구축 완료: {self.persist_directory}")

    def build_qa_chain(self):
        """Retriever 구성: 검색은 Chroma, 생성은 Upstage Chat Completions API가 담당합니다."""
        if self.vectorstore is None:
            raise ValueError("벡터 스토어가 없습니다. build_vectorstore()를 먼저 실행하세요.")

        self.retriever = self.vectorstore.as_retriever(
            search_type="mmr",
            search_kwargs={
                "k": self.top_k,
                "fetch_k": max(self.top_k * 4, 20),
                "lambda_mult": 0.65,
            }
        )
        print("✅ Retriever 구축 완료")

    def _format_history(self, history: List[Dict[str, str]]) -> str:
        if not history:
            return "(이전 대화 없음)"

        role_labels = {"user": "사용자", "assistant": "어시스턴트"}
        return "\n".join(
            f"{role_labels.get(item.get('role', ''), '사용자')}: {item.get('content', '').strip()}"
            for item in history[-10:]
            if item.get('content', '').strip()
        )

    def _build_retrieval_query(self, question: str, history: List[Dict[str, str]]) -> str:
        if not history:
            return question

        recent_history = self._format_history(history[-6:])
        return f"이전 대화:\n{recent_history}\n\n현재 질문: {question}"

    def _invoke_llm(self, question: str, context: str, history: List[Dict[str, str]]) -> str:
        prompt = QA_PROMPT_TEMPLATE.format(
            history=self._format_history(history),
            context=context,
            question=question,
        )
        response = self.client.chat.completions.create(
            model=self.upstage_model,
            messages=[
                {"role": "system", "content": BASELINE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=1000,
        )
        return (response.choices[0].message.content or "").strip()

    def query(self, question: str, history: List[Dict[str, str]] | None = None) -> Dict[str, Any]:
        """
        질문에 대한 답변 + 출처 반환

        Args:
            question: 사용자 질문

        Returns:
            {
                'answer': 답변 텍스트,
                'sources': [출처 정보 리스트]
            }
        """
        if self.retriever is None:
            raise ValueError("Retriever가 없습니다. build_qa_chain()을 먼저 실행하세요.")

        history = history or []
        retrieval_query = self._build_retrieval_query(question, history)
        docs = self.retriever.invoke(retrieval_query)
        context = "\n\n---\n\n".join(doc.page_content for doc in docs)
        answer = self._invoke_llm(question, context, history)

        sources = []
        for doc in docs:
            sources.append({
                'title': doc.metadata.get('source', 'Unknown'),
                'content_preview': doc.page_content[:100] + "..."
            })

        return {
            'answer': answer,
            'sources': sources
        }

    @classmethod
    def from_existing_db(
        cls,
        projects_json_path: str,
        upstage_api_key: str,
        persist_directory: str = "./chroma_db",
        **kwargs
    ):
        """
        이미 구축된 벡터 DB를 재사용 (재실행 시 빠름)
        """
        instance = cls(
            projects_json_path=projects_json_path,
            upstage_api_key=upstage_api_key,
            persist_directory=persist_directory,
            **kwargs
        )

        # 기존 DB 로드
        print(f"📂 기존 벡터 DB 로드: {persist_directory}")
        instance.vectorstore = Chroma(
            persist_directory=persist_directory,
            embedding_function=instance.embeddings,
            client_settings=instance._chroma_client_settings()
        )
        instance.build_qa_chain()
        return instance


def build_rag_engine(
    projects_json_path: str,
    upstage_api_key: str,
    rebuild: bool = False,
    **kwargs
) -> RAGEngine:
    """
    RAG 엔진 빌더 (편의 함수)

    Args:
        projects_json_path: projects.json 경로
        upstage_api_key: Upstage API 키
        rebuild: True면 벡터 DB 재구축, False면 기존 DB 재사용
        **kwargs: RAGEngine 생성자 파라미터

    Returns:
        RAGEngine 인스턴스
    """
    persist_dir = kwargs.get('persist_directory', './chroma_db')

    data_mtime = os.path.getmtime(projects_json_path) if os.path.exists(projects_json_path) else 0
    db_mtime = os.path.getmtime(persist_dir) if os.path.exists(persist_dir) else 0
    data_changed = data_mtime > db_mtime
    version_file = Path(persist_dir) / ".rag_index_version"
    index_version = version_file.read_text(encoding="utf-8").strip() if version_file.exists() else ""
    passage_model = kwargs.get('passage_embedding_model', DEFAULT_PASSAGE_EMBEDDING_MODEL)
    query_model = kwargs.get('query_embedding_model', DEFAULT_QUERY_EMBEDDING_MODEL)
    expected_index_version = f"{RAG_INDEX_VERSION}:{passage_model}:{query_model}"
    index_outdated = index_version != expected_index_version

    # 기존 DB가 있고 rebuild=False면 재사용하되, 데이터나 인덱스 구조가 바뀌면 자동 재구축
    if not rebuild and os.path.exists(persist_dir) and not data_changed and not index_outdated:
        print("🔄 기존 벡터 DB 재사용")
        return RAGEngine.from_existing_db(
            projects_json_path=projects_json_path,
            upstage_api_key=upstage_api_key,
            **kwargs
        )

    if data_changed and os.path.exists(persist_dir):
        print("♻️  projects.json 변경 감지: 벡터 DB를 새로 구축합니다")
    if index_outdated and os.path.exists(persist_dir):
        print("♻️  RAG 인덱스 구조 변경 감지: 벡터 DB를 새로 구축합니다")

    # 새로 구축
    print("🏗️  벡터 DB 새로 구축")
    engine = RAGEngine(
        projects_json_path=projects_json_path,
        upstage_api_key=upstage_api_key,
        **kwargs
    )
    engine.build_vectorstore()
    engine.build_qa_chain()
    return engine
