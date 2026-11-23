"""
RAG 핵심 엔진: TypeSafe Jev 분류 + Hybrid Search (Chroma Dense + Kiwi BM25 Sparse) + LangGraph 프롬프트 체인

주요 설계:
1. 데이터 로드: projects.json (프로필/역량/수상/프로젝트) + personal.json (가벼운 개인정보)
2. Hard Isolation (개인정보 유입 원천 차단):
   - personal_tmi 의도일 때만 doc_category == "personal" 청크 검색
   - 포트폴리오 질문(career_profile, project_overview, project_deep_dive)에서는 doc_category != "personal" 하드 필터링
3. TypeSafe Jev (TYPESAFE_API_KEY) 기반 입력 분류:
   - 단일 system_one() 호출로 intent, target_project, response_style 동시 판단
   - 키 미설정 또는 일시적 오류 시 규칙 기반 폴백 및 포트폴리오 가드레일 보정
4. Hybrid Search:
   - Dense: ChromaDB + Upstage Solar Embedding
   - Sparse: kiwipiepy 형태소 분석기 + BM25Okapi
   - RRF (Reciprocal Rank Fusion) + Jev 메타데이터(target_project, section) 부스팅
5. LangGraph 워크플로:
   - classify_input -> (chitchat | out_of_scope | hybrid_search -> 의도별 전용 프롬프트 체인 노드) -> END
"""

import os
import re
import json
import shutil
from typing import List, Dict, Any, Literal, TypedDict, Optional
from pathlib import Path

# ChromaDB의 익명 telemetry는 posthog 버전 조합에 따라 경고를 낼 수 있습니다.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

from chromadb.config import Settings
from langchain_chroma import Chroma
from openai import OpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langgraph.graph import StateGraph, END
from rank_bm25 import BM25Okapi

try:
    from typesafe_sdk import TypeSafeClient, Choice
except ImportError:
    TypeSafeClient = None
    Choice = None

try:
    from .prompts import (
        JEV_INTENT_INSTRUCTIONS,
        JEV_INTENT_CRITERIA,
        JEV_PROJECT_INSTRUCTIONS,
        JEV_PROJECT_CRITERIA,
        JEV_STYLE_INSTRUCTIONS,
        JEV_STYLE_CRITERIA,
        JEV_UI_TARGET_INSTRUCTIONS,
        JEV_UI_TARGET_CRITERIA,
        CHITCHAT_SYSTEM_PROMPT,
        OUT_OF_SCOPE_RESPONSE,
        INTENT_SYSTEM_PROMPTS,
        STYLE_INSTRUCTIONS,
        QA_PROMPT_TEMPLATE,
        BASELINE_SYSTEM_PROMPT,
    )
except ImportError:
    from prompts import (
        JEV_INTENT_INSTRUCTIONS,
        JEV_INTENT_CRITERIA,
        JEV_PROJECT_INSTRUCTIONS,
        JEV_PROJECT_CRITERIA,
        JEV_STYLE_INSTRUCTIONS,
        JEV_STYLE_CRITERIA,
        JEV_UI_TARGET_INSTRUCTIONS,
        JEV_UI_TARGET_CRITERIA,
        CHITCHAT_SYSTEM_PROMPT,
        OUT_OF_SCOPE_RESPONSE,
        INTENT_SYSTEM_PROMPTS,
        STYLE_INSTRUCTIONS,
        QA_PROMPT_TEMPLATE,
        BASELINE_SYSTEM_PROMPT,
    )


RAG_INDEX_VERSION = "portfolio-json-v15-concise-overview"
DEFAULT_UPSTAGE_BASE_URL = "https://api.upstage.ai/v1"
DEFAULT_UPSTAGE_MODEL = "solar-pro4"
DEFAULT_PASSAGE_EMBEDDING_MODEL = "solar-embedding-2-passage"
DEFAULT_QUERY_EMBEDDING_MODEL = "solar-embedding-2-query"
DEFAULT_TYPESAFE_MODEL = "jev-latest"

IntentType = Literal[
    "chitchat",
    "personal_tmi",
    "career_profile",
    "project_overview",
    "project_deep_dive",
    "out_of_scope",
]
TargetProjectType = Literal["project-jichini", "project-capteam", "both", "none"]
ResponseStyleType = Literal["normal", "brief", "structured"]
UITargetType = Literal["none", "skills", "awards", "activities", "education", "projects_list", "project_detail"]


# 가드레일용 명백한 포트폴리오/기술 고유명사 (개인 TMI 오분류 방지 단방향 안전장치)
PORTFOLIO_STRICT_NOUNS = (
    "jichini", "지치니", "capteam", "캡팀", "프로젝트", "포트폴리오",
    "캡스톤", "기술스택", "기술 스택", "깃허브", "github", "노션", "notion",
    "langgraph", "rag", "fastapi", "pytorch", "pgvector", "koelectra",
    "advisory lock", "cross-encoder",
    "국제교류", "치바상업", "싱가포르 연수", "싱가포르연수",
    "해외 견학", "해외견학", "해외 연수", "해외연수",
)

# Jev(system_one) 경로 등 search_keywords가 비어있는 초단문 질문용 의도별 보조 시드 키워드
INTENT_SEED_KEYWORDS: Dict[str, str] = {
    "personal_tmi": "취미 운동 음악 노래 영화 만화 음식 음료 간식 MBTI 가족 형제",
    "career_profile": "프로필 자기소개 학력 기술 스택 수상 경력 연락처 GitHub Notion",
    "project_overview": "프로젝트 개요 요약 개발 동기 팀원 역할",
    "project_deep_dive": "트러블슈팅 문제 해결 최적화 구현 아키텍처 배운 점",
}

# 포트폴리오 질문과 개인 TMI 질문을 엄격히 분리하기 위한 폴백용 키워드 (최후 안전망)
PORTFOLIO_GUARD_KEYWORDS = (
    "프로젝트", "포트폴리오", "지치니", "jichini", "캡팀", "capteam",
    "기술", "스택", "수상", "상장", "해커톤", "올림피아드", "koai",
    "학력", "학교", "소마고", "마이스터고", "전공", "동아리", "이메일", "연락처",
    "전화번호", "깃허브", "github", "노션", "notion", "이력", "역량",
    "자기소개", "어떤 개발자", "가치관", "철학", "강점", "장점",
    "rag", "langgraph", "langchain", "typesafe", "jev", "pytorch", "fastapi",
    "pgvector", "postgresql", "docker", "pydantic", "트러블슈팅", "koelectra",
    "영속", "대화 메모리", "advisory lock", "hitl", "비식별", "리랭커", "cross-encoder",
    "문제 해결", "성능", "최적화", "속도", "비용", "지연", "p95", "정확도", "아키텍처",
    "워크플로", "병렬", "팀원", "역할", "배운 점", "느낀 점",
    "대외활동", "국제교류", "치바상업", "싱가포르 연수", "해외 견학", "해외 연수",
)

PERSONAL_TMI_KEYWORDS = (
    "취미", "운동", "축구", "헬스", "벤치프레스", "벤치", "85kg", "시대회",
    "피파", "fifa", "pc방", "피시방", "게임", "음악", "노래", "발라드",
    "나윤권", "나였으면", "추천곡", "영화", "인생영화", "건축학개론",
    "mbti", "infj", "성격유형", "음료", "음료수", "천연사이다", "사이다",
    "키가", "키 몇", "신장", "178", "좋아하는 나라", "가보고 싶은 나라",
    "여행", "일본", "아이슬란드", "버킷리스트", "계절", "여름", "겨울",
    "좋아하는 색", "색깔", "초록색", "만화", "애니", "웹툰", "원피스",
    "간식", "과자", "눈을감자", "해외축구", "프리미어리그", "epl", "라리가",
    "이강인", "at마드리드", "아틀레티코", "응원팀", "고향", "출신", "경산",
    "혈액형", "a형", "과일", "포도", "블루베리", "형제", "가족", "삼남매",
    "삼형제", "둘째", "형 ", "동생", "동물", "반려동물", "강아지", "고양이",
    "평소에 뭐", "시간 보내", "여가", "쉬는 날", "쉴 때", "보는 거", "듣는 거",
    "입맛", "음식 취향", "식성", "먹는 거", "마시는 거",
)

DEEP_DIVE_KEYWORDS = (
    "어떻게", "원리", "구현", "최적화", "개선", "트러블슈팅", "문제", "해결",
    "성능", "속도", "비용", "절감", "단축", "p95", "병렬", "루프", "랜덤성",
    "과대평가", "워크플로", "구조", "아키텍처", "설계", "배운", "점수", "rrf",
    "pgvector", "임베딩", "배치", "worker", "batch",
    "메모리", "영속", "advisory lock", "토큰", "압축", "복귀", "hitl",
    "koelectra", "비식별", "리랭커", "cross-encoder", "정확도", "bm25", "헛매칭",
    "어떻게 만든", "어떻게 반응", "후하게", "결과가 바뀌", "골치", "시간 문제",
)

OVERVIEW_HINT_KEYWORDS = (
    "왜 시작", "시작하게 된", "계기", "동기", "만든 서비스", "어떤 서비스", "뭐였죠",
)

PERSONAL_TOPIC_ALIASES: Dict[str, str] = {
    "hobby_sports": "평소 여가 시간 보내는 법, 쉬는 날 몸 움직이는 취미 활동, 스트레스 푸는 운동",
    "hobby_game": "평소 여가 시간 보내는 법, 쉬는 날 PC방에서 즐기는 게임 활동",
    "movie": "쉴 때 주로 보는 것, 영상·영화 관람 취향",
    "favorite_manga": "쉴 때 주로 보는 것, 만화·애니·웹툰 취향",
    "football_viewing": "쉴 때 주로 보는 것, 스포츠·축구 경기 시청 취향",
    "music_genre": "쉴 때 주로 듣는 것, 음악 장르 취향",
    "music_recommendation": "쉴 때 주로 듣는 것, 감성적인 추천 노래",
    "drink": "입맛, 음식·음료·마시는 거 취향, 식성",
    "favorite_snack": "입맛, 음식·간식·과자·먹는 거 취향, 식성",
    "favorite_fruit": "입맛, 음식·과일·먹는 거 취향, 식성",
}

CHITCHAT_PATTERNS = (
    "안녕", "안녕하세요", "반가워", "반갑습니다", "고마워", "고맙습니다", "감사합니다",
    "감사해요", "수고해", "수고하세요", "잘가", "바보", "넌 누구", "누구세요",
    "뭐할 수 있", "무엇을 할 수", "도움말", "hi", "hello", "hey", "thanks", "thank you",
)


class PortfolioGraphState(TypedDict):
    """LangGraph 워크플로 상태 스키마"""
    question: str
    history: List[Dict[str, str]]
    intent: IntentType
    intent_confidence: float
    target_project: TargetProjectType
    response_style: ResponseStyleType
    ui_target: UITargetType
    search_keywords: str
    classified_by: str
    retrieval_query: str
    documents: List[Document]
    context: str
    answer: str
    sources: List[Dict[str, Any]]


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
                encoding_format="float",
            )
            vectors.extend(
                item.embedding for item in sorted(response.data, key=lambda item: item.index)
            )
        return vectors

    def embed_query(self, text: str) -> List[float]:
        response = self.client.embeddings.create(
            model=self.query_model,
            input=text,
            encoding_format="float",
        )
        return response.data[0].embedding


class KiwiBM25Tokenizer:
    """
    Render 무료 플랜(512MB RAM) OOM 방지를 위한 초경량 한국어 어간/N-gram + 영문/숫자 BM25 토크나이저.
    (환경변수 USE_KIWI_TOKENIZER=1 설정 시에만 kiwipiepy 네이티브 사전을 로드합니다.)
    """

    MEANINGFUL_TAGS = {
        "NNG", "NNP", "NNB", "NR", "NP",
        "VV", "VA",
        "MAG",
        "SL", "SN", "SH",
    }

    DOMAIN_STOPWORDS = {
        "김성현", "성현", "김성", "좋아하", "좋아하는", "알리", "알려", "알려줘", "주다", "무엇", "어떤", "어떻",
        "대하", "대해", "관하", "관해", "관련", "정보", "소개", "설명", "말하", "궁금", "궁금하", "궁금해",
        "있", "없", "하", "되", "같", "것", "수", "등", "점", "중", "위", "때",
        "주로", "가장", "제일", "많이", "자주", "전체", "내용", "부분",
        "지금", "정리", "목록", "방법", "편", "적", "거", "게", "걸", "뭐야", "뭔가",
    }

    KOREAN_SUFFIX_RE = re.compile(
        r"(으로부터|로부터|에서부터|에게는|에서는|으로는|이라도|이라고|이라며|이지만|이나마|에게서|한테서|"
        r"입니다|합니다|했습니다|있습니다|없습니다|됩니다|였습니|이었습|이라고|라는|이란|에서|에게|한테|으로|으로써|로서|"
        r"부터|까지|처럼|보다|하고|이나|에는|조차|마저|이며|이고|이나|든지|라도|이랑|랑|하고|"
        r"은|는|이|가|을|를|의|에|로|과|와|도|만|며|고|서|지|네|요|야)$"
    )

    def __init__(self):
        self.kiwi = None
        if os.getenv("USE_KIWI_TOKENIZER", "").strip() == "1":
            try:
                from kiwipiepy import Kiwi  # type: ignore

                self.kiwi = Kiwi(
                    num_workers=1,
                    load_default_dict=False,
                    load_typo_dict=False,
                    load_multi_dict=False,
                    model_type="cong",
                )
            except Exception:
                self.kiwi = None

    def tokenize(self, text: str) -> List[str]:
        if not text or not text.strip():
            return []

        normalized = text.lower()
        tokens: List[str] = []

        if self.kiwi is not None:
            for token in self.kiwi.tokenize(normalized):
                form = token.form.strip()
                if not form or form in self.DOMAIN_STOPWORDS:
                    continue
                if token.tag in self.MEANINGFUL_TAGS and (
                    len(form) > 1 or token.tag in {"SL", "SN", "NNP", "NNG"}
                ):
                    tokens.append(form)
        else:
            # 초경량 한국어 조사/어미 제거 + 복합명사 분해를 위한 2-gram 서브워드 추출
            raw_chunks = re.findall(r"[가-힣]+|[0-9a-zA-Z]+", normalized)
            for chunk in raw_chunks:
                if chunk in self.DOMAIN_STOPWORDS:
                    continue
                if re.match(r"^[가-힣]+$", chunk):
                    stem = self.KOREAN_SUFFIX_RE.sub("", chunk)
                    if len(stem) >= 1 and stem not in self.DOMAIN_STOPWORDS:
                        tokens.append(stem)
                    if len(chunk) >= 2 and chunk != stem and chunk not in self.DOMAIN_STOPWORDS:
                        tokens.append(chunk)
                    # 복합명사('기술스택', '겨울방학', '국제교류' 등) 매칭을 위한 2글자 바이그램 추가
                    if len(stem) >= 3:
                        for i in range(len(stem) - 1):
                            bg = stem[i : i + 2]
                            if bg not in self.DOMAIN_STOPWORDS:
                                tokens.append(bg)
                elif len(chunk) >= 2:
                    tokens.append(chunk)

        # 영문/숫자 포함 복합 어절(예: 85kg, p95, solar-pro4, a형) 보조 토큰화
        compound_words = re.findall(r"[0-9a-zA-Z]+[0-9a-zA-Z가-힣_-]*", normalized)
        for word in compound_words:
            if len(word) >= 2 and word not in self.DOMAIN_STOPWORDS:
                tokens.append(word)

        return tokens


class RAGEngine:
    """
    포트폴리오 챗봇을 위한 Jev + Hybrid Search + LangGraph RAG 엔진
    """

    def __init__(
        self,
        projects_json_path: str,
        upstage_api_key: str,
        personal_json_path: Optional[str] = None,
        typesafe_api_key: Optional[str] = None,
        typesafe_model: str = DEFAULT_TYPESAFE_MODEL,
        upstage_model: str = DEFAULT_UPSTAGE_MODEL,
        passage_embedding_model: str = DEFAULT_PASSAGE_EMBEDDING_MODEL,
        query_embedding_model: str = DEFAULT_QUERY_EMBEDDING_MODEL,
        base_url: str = DEFAULT_UPSTAGE_BASE_URL,
        persist_directory: str = "./chroma_db",
        top_k: int = 5,
        chunk_size: int = 1000,
        chunk_overlap: int = 0,
    ):
        self.projects_json_path = projects_json_path
        self.personal_json_path = personal_json_path or str(
            Path(projects_json_path).resolve().parent / "personal.json"
        )
        self.upstage_api_key = upstage_api_key
        self.typesafe_api_key = (
            typesafe_api_key if typesafe_api_key is not None else os.getenv("TYPESAFE_API_KEY", "")
        ).strip()
        self.typesafe_model = typesafe_model or os.getenv("TYPESAFE_DEFAULT_MODEL", DEFAULT_TYPESAFE_MODEL)
        self.upstage_model = upstage_model
        self.passage_embedding_model = passage_embedding_model
        self.query_embedding_model = query_embedding_model
        self.base_url = base_url
        self.top_k = top_k
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.persist_directory = persist_directory

        # 1. Upstage LLM & Embedding 클라이언트
        print(f"🔧 LLM 초기화: {upstage_model} ({base_url})")
        self.client = OpenAI(api_key=upstage_api_key, base_url=base_url, timeout=30.0)
        print(f"🔧 임베딩 모델 초기화: passage={passage_embedding_model}, query={query_embedding_model}")
        self.embeddings = UpstageEmbeddingsAdapter(
            self.client,
            passage_model=passage_embedding_model,
            query_model=query_embedding_model,
        )

        # 2. TypeSafe Jev 클라이언트 초기화 (TYPESAFE_API_KEY 설정 시 활성화)
        self.jev_client: Optional[TypeSafeClient] = None
        if self._has_valid_typesafe_key() and TypeSafeClient is not None:
            try:
                self.jev_client = TypeSafeClient(
                    api_key=self.typesafe_api_key,
                    model=self.typesafe_model,
                    timeout=8.0,
                )
                print(f"🔧 TypeSafe Jev 분류기 활성화: model={self.typesafe_model}")
            except Exception as e:
                print(f"⚠️  TypeSafe Jev 초기화 실패 (폴백 분류기 사용): {e}")
        else:
            print("ℹ️  TYPESAFE_API_KEY 미설정: 규칙 기반 폴백 분류기로 동작합니다. (.env에 키 입력 시 Jev 즉시 활성화)")

        # 3. Hybrid Search & LangGraph 컴포넌트
        self.tokenizer = KiwiBM25Tokenizer()
        self.vectorstore: Optional[Chroma] = None
        self.retriever = None
        self.chunks: List[Document] = []
        self.chunk_tokens: List[List[str]] = []
        self.graph = None

    def _has_valid_typesafe_key(self) -> bool:
        if not self.typesafe_api_key:
            return False
        placeholders = {"your-typesafe-api-key-here", "your_key", "none", "null"}
        return self.typesafe_api_key.lower() not in placeholders

    def ensure_jev_client(self, latest_api_key: Optional[str] = None):
        """런타임에 .env의 TYPESAFE_API_KEY가 새로 입력된 경우 즉시 Jev 클라이언트를 활성화합니다."""
        candidate_key = (
            latest_api_key if latest_api_key is not None else os.getenv("TYPESAFE_API_KEY", "")
        ).strip()
        if candidate_key and candidate_key != self.typesafe_api_key:
            self.typesafe_api_key = candidate_key
            self.jev_client = None

        if self.jev_client is None and self._has_valid_typesafe_key() and TypeSafeClient is not None:
            try:
                self.jev_client = TypeSafeClient(
                    api_key=self.typesafe_api_key,
                    model=self.typesafe_model,
                    timeout=8.0,
                )
                print(f"🔧 TypeSafe Jev 분류기 활성화 완료: model={self.typesafe_model}")
            except Exception as e:
                print(f"⚠️  TypeSafe Jev 초기화 실패: {e}")

    def _chroma_client_settings(self) -> Settings:
        return Settings(anonymized_telemetry=False)

    def _metadata_value(self, value: Any) -> str | int | float | bool:
        if isinstance(value, (str, int, float, bool)):
            return value
        if value is None:
            return ""
        if isinstance(value, list):
            return ", ".join(str(item) for item in value)
        return json.dumps(value, ensure_ascii=False)

    def _project_card_to_document(self, project: Dict[str, Any], idx: int) -> Document:
        tags = project.get("tags") or []
        if isinstance(tags, str):
            tags = [tags]

        content = "\n".join([
            f"프로젝트: {project.get('title') or project.get('name') or f'project_{idx}'}",
            f"설명: {project.get('description') or project.get('summary') or ''}",
            f"태그: {', '.join(tags)}",
            f"링크: {project.get('link') or project.get('demoUrl') or project.get('githubUrl') or ''}",
        ])

        return Document(
            page_content=content,
            metadata={
                "source": project.get("title") or project.get("name") or f"project_{idx}",
                "project_id": str(project.get("id") or idx),
                "tags": ", ".join(tags),
                "document_type": "project",
                "doc_category": "project",
            },
        )

    def _rag_doc_to_document(self, item: Dict[str, Any], idx: int) -> Document:
        metadata = {
            key: self._metadata_value(value)
            for key, value in (item.get("metadata") or {}).items()
        }
        title = item.get("title") or metadata.get("title") or item.get("id") or f"doc_{idx}"
        doc_category = (
            "personal"
            if metadata.get("section") == "personal" or metadata.get("document_type") == "personal"
            else "profile"
            if metadata.get("section") == "profile"
            else "project"
        )
        metadata.update({
            "source": str(title),
            "doc_id": item.get("id") or f"doc_{idx}",
            "doc_category": doc_category,
        })
        return Document(page_content=item.get("content", ""), metadata=metadata)

    def _portfolio_to_documents(self, data: Dict[str, Any]) -> List[Document]:
        """profile/awards/projects 구조의 포트폴리오 JSON을 검색 문서로 펼칩니다."""
        documents: List[Document] = []

        def append_doc(content: str, metadata: Dict[str, Any]):
            if not content or not content.strip():
                return
            source = (
                metadata.get("source")
                or metadata.get("project_name")
                or metadata.get("document_type")
                or "portfolio"
            )
            clean_metadata = {key: self._metadata_value(value) for key, value in metadata.items()}
            clean_metadata.setdefault("source", source)
            clean_metadata.setdefault("doc_category", "project")
            documents.append(Document(page_content=content.strip(), metadata=clean_metadata))

        profile = data.get("profile")
        if isinstance(profile, dict):
            metadata = dict(profile.get("metadata") or {})
            metadata.update({
                "source": "프로필 소개",
                "doc_id": profile.get("id", "profile"),
                "doc_category": "profile",
                "section": "profile",
            })
            append_doc(profile.get("content", ""), metadata)

        for section_key in ("education_and_skills", "awards", "activities"):
            for idx, item in enumerate(data.get(section_key) or [], 1):
                if not isinstance(item, dict):
                    continue
                metadata = dict(item.get("metadata") or {})
                source = (
                    metadata.get("activity_name")
                    or metadata.get("award_name")
                    or metadata.get("topic")
                    or item.get("id")
                    or section_key
                )
                metadata.update({
                    "source": source,
                    "doc_id": item.get("id", f"{section_key}_{idx}"),
                    "doc_category": "profile",
                    "section": "profile",
                })
                content_text = (item.get("content") or "").strip()
                if section_key == "activities" and metadata.get("category"):
                    content_text = f"[{metadata['category']}] {content_text}"
                append_doc(content_text, metadata)

        award_items = [item for item in (data.get("awards") or []) if isinstance(item, dict)]
        if award_items:
            award_lines = [
                "김성현의 수상 경력 전체 요약 목록",
                "교내외 프로젝트 및 대회 수상 내역을 한 번에 정리한 문서입니다.",
            ]
            for item in award_items:
                meta = item.get("metadata") or {}
                award_name = meta.get("award_name") or item.get("id") or ""
                content_text = (item.get("content") or "").strip()
                award_lines.append(f"- {award_name}: {content_text}")
            append_doc(
                "\n".join(award_lines),
                {
                    "source": "수상 경력 전체 요약",
                    "doc_id": "award-summary-all",
                    "document_type": "award_summary",
                    "doc_category": "profile",
                    "section": "profile",
                    "topic": "award_summary",
                    "keywords": ["수상", "수상 경력", "상장", "대회", "해커톤", "성과", "등수"],
                },
            )

        activity_items = [item for item in (data.get("activities") or []) if isinstance(item, dict)]
        if activity_items:
            activity_lines = [
                "김성현의 대외활동 및 연수 전체 요약 목록",
                "경진대회·해커톤·공모전 참가와 국제교류, 해외 견학 활동을 분류별로 정리한 문서입니다.",
            ]
            for item in activity_items:
                meta = item.get("metadata") or {}
                category = meta.get("category") or "활동"
                activity_name = meta.get("activity_name") or meta.get("award_name") or item.get("id") or ""
                content_text = (item.get("content") or "").strip()
                activity_lines.append(f"- [{category}] {activity_name}: {content_text}")
            append_doc(
                "\n".join(activity_lines),
                {
                    "source": "대외활동 및 연수 전체 요약",
                    "doc_id": "activity-summary-all",
                    "document_type": "activity_summary",
                    "doc_category": "profile",
                    "section": "profile",
                    "topic": "activity_summary",
                    "keywords": [
                        "활동",
                        "대외활동",
                        "경진대회",
                        "해커톤",
                        "공모전",
                        "국제교류",
                        "해외 견학",
                        "해외 연수",
                        "싱가포르 연수",
                        "치바상업고등학교",
                    ],
                },
            )

        project_items = [project for project in (data.get("projects") or []) if isinstance(project, dict)]
        if project_items:
            summary_lines = [
                "프로젝트 포트폴리오 전체 요약",
                "김성현의 대표 프로젝트들을 한눈에 볼 수 있도록 프로젝트명, 핵심 목적, 사용 기술을 정리한 문서입니다.",
            ]
            for project in project_items:
                project_name = project.get("project_name") or project.get("title") or project.get("project_id") or "프로젝트"
                summary = project.get("summary") or project.get("description") or ""
                technologies = self._metadata_value(project.get("technologies") or project.get("tags") or [])
                summary_lines.append(f"- {project_name}: {summary} (사용 기술: {technologies})")
            append_doc(
                "\n".join(summary_lines),
                {
                    "source": "프로젝트 전체 요약",
                    "doc_id": "project-summary-all",
                    "document_type": "project_summary",
                    "doc_category": "project",
                    "section": "summary",
                    "project_id": "all",
                    "project_names": [
                        project.get("project_name") or project.get("title") or project.get("project_id")
                        for project in project_items
                    ],
                },
            )

        for idx, project in enumerate(project_items, 1):
            project_id = project.get("project_id") or project.get("id") or f"project_{idx}"
            project_name = project.get("project_name") or project.get("title") or project_id
            technologies = project.get("technologies") or project.get("tags") or []
            role = project.get("role") or []
            period = project.get("period") or {}
            if isinstance(period, dict):
                period_text = f"{period.get('start', '')} ~ {period.get('end') or '진행 중'}"
            else:
                period_text = str(period)

            base_metadata = {
                "document_type": "project",
                "doc_category": "project",
                "project_id": project_id,
                "project_name": project_name,
                "technologies": technologies,
                "role": role,
                "period": period_text,
            }

            motivation = project.get("motivation") or {}
            dev_items = [item for item in (project.get("development") or []) if isinstance(item, dict)]
            ts_items = [item for item in (project.get("troubleshooting") or []) if isinstance(item, dict)]
            overview_lines = [
                f"프로젝트명: {project_name}",
                f"요약: {project.get('summary') or project.get('description') or ''}",
                f"기간: {period_text}",
                f"역할: {self._metadata_value(role)}",
                f"기술: {self._metadata_value(technologies)}",
                f"팀원 및 역할: {self._metadata_value(project.get('team_members') or [])}",
                f"개발 동기: {motivation.get('content', '') if isinstance(motivation, dict) else motivation}",
            ]
            if dev_items:
                overview_lines.append("주요 구현 요약:")
                for item in dev_items:
                    first_sentence = (item.get("content") or "").split(". ")[0].strip()
                    if first_sentence and not first_sentence.endswith("."):
                        first_sentence += "."
                    overview_lines.append(f"- {item.get('title', '')}: {first_sentence}")
            if ts_items:
                overview_lines.append("주요 트러블슈팅 성과:")
                for item in ts_items:
                    overview_lines.append(
                        f"- {item.get('title', '')}: {item.get('result', '')}"
                    )
            overview_lines.append(f"포트폴리오 원문: {project.get('source_url') or ''}")
            overview = "\n".join(overview_lines)
            append_doc(
                overview,
                {
                    **base_metadata,
                    "doc_id": f"{project_id}-overview",
                    "source": f"{project_name} 개요",
                    "section": "overview",
                },
            )

            team_members = [member for member in (project.get("team_members") or []) if isinstance(member, dict)]
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
                    {
                        **base_metadata,
                        "doc_id": f"{project_id}-team",
                        "source": f"{project_name} 팀원 및 역할",
                        "section": "team",
                    },
                )

            troubleshooting_items = [item for item in (project.get("troubleshooting") or []) if isinstance(item, dict)]
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
                    {
                        **base_metadata,
                        "doc_id": f"{project_id}-troubleshooting-summary",
                        "source": f"{project_name} 문제 해결 요약",
                        "section": "troubleshooting_summary",
                    },
                )

            for dev_idx, dev in enumerate(project.get("development") or [], 1):
                if not isinstance(dev, dict):
                    continue
                content = "\n".join([
                    f"프로젝트명: {project_name}",
                    f"개발 내용: {dev.get('title', '')}",
                    f"설명: {dev.get('content', '')}",
                    f"사용 기술: {self._metadata_value(dev.get('technologies') or [])}",
                ])
                append_doc(
                    content,
                    {
                        **base_metadata,
                        "doc_id": dev.get("id") or f"{project_id}-dev-{dev_idx}",
                        "source": f"{project_name} - {dev.get('title', '개발 내용')}",
                        "section": "development",
                    },
                )

            for issue_idx, issue in enumerate(project.get("troubleshooting") or [], 1):
                if not isinstance(issue, dict):
                    continue
                content = "\n".join([
                    f"프로젝트명: {project_name}",
                    f"트러블슈팅: {issue.get('title', '')}",
                    f"문제: {issue.get('problem', '')}",
                    f"해결: {issue.get('solution', '')}",
                    f"결과: {issue.get('result', '')}",
                ])
                append_doc(
                    content,
                    {
                        **base_metadata,
                        "doc_id": issue.get("id") or f"{project_id}-issue-{issue_idx}",
                        "source": f"{project_name} - {issue.get('title', '트러블슈팅')}",
                        "section": "troubleshooting",
                    },
                )

            for lesson_idx, lesson in enumerate(project.get("lessons") or [], 1):
                if not isinstance(lesson, dict):
                    continue
                content = "\n".join([
                    f"프로젝트명: {project_name}",
                    f"배운 점: {lesson.get('title', '')}",
                    f"내용: {lesson.get('content', '')}",
                ])
                append_doc(
                    content,
                    {
                        **base_metadata,
                        "doc_id": lesson.get("id") or f"{project_id}-lesson-{lesson_idx}",
                        "source": f"{project_name} - {lesson.get('title', '배운 점')}",
                        "section": "lessons",
                    },
                )

        return documents

    def _personal_to_documents(self, data: Dict[str, Any]) -> List[Document]:
        """personal.json 데이터를 doc_category='personal'로 격리된 Document 리스트로 변환합니다."""
        documents: List[Document] = []
        items = data.get("personal") if isinstance(data, dict) else data
        if not isinstance(items, list):
            return documents

        for idx, item in enumerate(items, 1):
            if not isinstance(item, dict):
                continue
            content = (item.get("content") or "").strip()
            if not content:
                continue

            raw_meta = dict(item.get("metadata") or {})
            topic = str(raw_meta.get("topic") or item.get("id") or f"personal_{idx}")
            alias = PERSONAL_TOPIC_ALIASES.get(topic, "")
            clean_meta = {key: self._metadata_value(value) for key, value in raw_meta.items()}
            clean_meta.update({
                "doc_id": item.get("id") or f"personal_{idx}",
                "source": f"개인 소개 ({topic})",
                "document_type": "personal",
                "doc_category": "personal",
                "section": "personal",
                "topic": topic,
                "topic_aliases": alias,
            })
            enriched_content = f"{content}\n(관련 주제: {alias})" if alias else content
            documents.append(Document(page_content=enriched_content, metadata=clean_meta))

        return documents

    def load_projects(self) -> List[Document]:
        """
        projects.json과 personal.json을 모두 로드하여 LangChain Document 형식으로 변환합니다.
        """
        with open(self.projects_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, dict):
            documents = self._portfolio_to_documents(data)
        elif isinstance(data, list):
            documents = []
            for idx, item in enumerate(data):
                if not isinstance(item, dict):
                    continue
                doc = self._rag_doc_to_document(item, idx) if "content" in item else self._project_card_to_document(item, idx)
                if doc.page_content.strip():
                    documents.append(doc)
        else:
            raise ValueError("projects.json의 최상위 값은 객체 또는 리스트여야 합니다.")

        personal_count = 0
        if self.personal_json_path and os.path.exists(self.personal_json_path):
            with open(self.personal_json_path, "r", encoding="utf-8") as f:
                personal_data = json.load(f)
            personal_docs = self._personal_to_documents(personal_data)
            personal_count = len(personal_docs)
            documents.extend(personal_docs)

        print(f"✅ 총 {len(documents)}개 RAG 문서 로드 완료 (포트폴리오: {len(documents) - personal_count}개, 개인정보: {personal_count}개)")
        return documents

    def _split_documents(self, documents: List[Document]) -> List[Document]:
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=["\n\n", "\n", " ", ""],
        )
        splits = text_splitter.split_documents(documents)
        for idx, chunk in enumerate(splits):
            chunk.metadata.setdefault("chunk_id", f"{chunk.metadata.get('doc_id', 'doc')}_{idx}")
        return splits

    def _chunk_indexing_text(self, doc: Document) -> str:
        """BM25 인덱싱 시 본문뿐 아니라 제목, 키워드, 기술 스택 메타데이터를 함께 반영합니다."""
        meta = doc.metadata or {}
        parts = [
            str(meta.get("source", "")),
            str(meta.get("project_name", "")),
            str(meta.get("keywords", "")),
            str(meta.get("technologies", "")),
            str(meta.get("topic", "")),
            str(meta.get("topic_aliases", "")),
            doc.page_content,
        ]
        return "\n".join(part for part in parts if part)

    def _prepare_sparse_index(self):
        """Kiwi 형태소 분석 기반 BM25 Sparse 검색용 청크 및 토큰을 준비합니다."""
        documents = self.load_projects()
        self.chunks = self._split_documents(documents)
        self.chunk_tokens = [
            self.tokenizer.tokenize(self._chunk_indexing_text(chunk))
            for chunk in self.chunks
        ]
        print(f"🔍 Kiwi + BM25 Sparse 인덱스 준비 완료 ({len(self.chunks)}개 청크)")

    def build_vectorstore(self):
        """벡터 스토어 구축: 문서 로드 → 청킹 → 임베딩 → ChromaDB 저장"""
        documents = self.load_projects()
        splits = self._split_documents(documents)
        self.chunks = splits
        self.chunk_tokens = [
            self.tokenizer.tokenize(self._chunk_indexing_text(chunk))
            for chunk in self.chunks
        ]
        print(f"📄 {len(splits)}개 청크로 분할")

        if os.path.exists(self.persist_directory):
            shutil.rmtree(self.persist_directory)
            print(f"🧹 기존 벡터 DB 삭제: {self.persist_directory}")

        print("💾 ChromaDB에 임베딩 저장 중...")
        self.vectorstore = Chroma.from_documents(
            documents=splits,
            embedding=self.embeddings,
            persist_directory=self.persist_directory,
            client_settings=self._chroma_client_settings(),
        )
        Path(self.persist_directory).mkdir(parents=True, exist_ok=True)
        index_signature = (
            f"{RAG_INDEX_VERSION}:{self.passage_embedding_model}:{self.query_embedding_model}"
        )
        (Path(self.persist_directory) / ".rag_index_version").write_text(
            index_signature, encoding="utf-8"
        )
        print(f"✅ 벡터 스토어 구축 완료: {self.persist_directory}")

    def build_qa_chain(self):
        """Hybrid Search 인덱스 및 LangGraph 상태 그래프를 구성합니다."""
        if self.vectorstore is None:
            raise ValueError("벡터 스토어가 없습니다. build_vectorstore()를 먼저 실행하세요.")

        if not self.chunks or not self.chunk_tokens:
            self._prepare_sparse_index()

        self.retriever = self.vectorstore.as_retriever(
            search_type="mmr",
            search_kwargs={
                "k": self.top_k,
                "fetch_k": max(self.top_k * 4, 20),
                "lambda_mult": 0.65,
            },
        )
        self.graph = self._build_langgraph()
        print("✅ Hybrid Retriever 및 LangGraph 프롬프트 체인 구축 완료")

    # =====================================================================
    # 1단계: Jev 입력 분류 및 가드레일 보정
    # =====================================================================

    def _format_history(self, history: List[Dict[str, str]], limit: int = 10) -> str:
        if not history:
            return "(이전 대화 없음)"

        role_labels = {"user": "사용자", "assistant": "어시스턴트"}
        return "\n".join(
            f"{role_labels.get(item.get('role', ''), '사용자')}: {item.get('content', '').strip()}"
            for item in history[-limit:]
            if item.get("content", "").strip()
        )

    def _infer_project_from_text(self, text: str, history: List[Dict[str, str]]) -> TargetProjectType:
        lowered = text.lower()
        jichini_cues = (
            "jichini", "지치니", "사회초년생", "고민 연결",
            "속마음", "힘든 이야기", "비슷한 처지", "요즘 힘들어", "좀 힘들어",
        )
        capteam_cues = (
            "capteam", "캡팀", "캡스톤", "팀 매칭", "팀 자동",
            "조 짜", "조를 짜", "선생님", "과대평가", "후하게", "결과가 바뀌",
            "팀 수정", "반복 루프", "설문",
        )
        has_jichini = any(k in lowered for k in jichini_cues)
        has_capteam = any(k in lowered for k in capteam_cues)

        if has_jichini and has_capteam:
            return "both"
        if has_jichini:
            return "project-jichini"
        if has_capteam:
            return "project-capteam"

        recent_text = " ".join(item.get("content", "") for item in history[-4:]).lower()
        hist_jichini = any(k in recent_text for k in ("jichini", "지치니"))
        hist_capteam = any(k in recent_text for k in ("capteam", "캡팀"))

        # "다른 프로젝트", "나머지 프로젝트", "그거 말고" 등 문맥 전환 표현 시 직전과 반대 프로젝트로 전환
        is_switch = any(
            cue in lowered
            for cue in (
                "다른 프로젝트",
                "그 외 프로젝트",
                "나머지 프로젝트",
                "반대 프로젝트",
                "그거 말고",
                "거기 말고",
            )
        )
        if is_switch:
            if hist_jichini and not hist_capteam:
                return "project-capteam"
            if hist_capteam and not hist_jichini:
                return "project-jichini"
            return "none"

        # "제일 최근", "최근에 한" 표현 + 직전 대화에 프로젝트가 언급된 경우 최신 프로젝트(CapTeam) 매핑
        if any(cue in lowered for cue in ("제일 최근", "가장 최근", "최근에 한", "마지막 프로젝트")) and (
            hist_jichini or hist_capteam
        ):
            return "project-capteam"

        # 대명사/생략 후속 질문인 경우 최근 대화에서 프로젝트 맥락 추론
        if hist_jichini and not hist_capteam:
            return "project-jichini"
        if hist_capteam and not hist_jichini:
            return "project-capteam"
        return "none"

    def _infer_style_from_text(self, text: str) -> ResponseStyleType:
        lowered = text.lower()
        if any(k in lowered for k in ("한줄", "한 줄", "간단히", "간단하게", "짧게", "핵심만")):
            return "brief"
        if any(k in lowered for k in ("목록", "리스트", "단계별", "비교해", "차이점", "정리해")):
            return "structured"
        return "normal"

    def _rule_based_classify(
        self, question: str, history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """TYPESAFE_API_KEY 미설정 또는 API 실패 시 동작하는 결정론적 폴백 분류기"""
        q_lower = question.strip().lower()
        target_project = self._infer_project_from_text(question, history)
        response_style = self._infer_style_from_text(question)

        has_portfolio_kw = any(k in q_lower for k in PORTFOLIO_GUARD_KEYWORDS)
        has_personal_kw = any(k in q_lower for k in PERSONAL_TMI_KEYWORDS)
        has_deep_kw = any(k in q_lower for k in DEEP_DIVE_KEYWORDS)
        has_overview_kw = any(k in q_lower for k in OVERVIEW_HINT_KEYWORDS)

        # 단순 인사/잡담 체크
        if (
            len(q_lower) <= 18
            and any(p in q_lower for p in CHITCHAT_PATTERNS)
            and not has_portfolio_kw
            and not has_personal_kw
        ):
            return {
                "intent": "chitchat",
                "intent_confidence": 0.9,
                "target_project": "none",
                "response_style": response_style,
                "classified_by": "fallback_rule",
            }

        # 개인 TMI 키워드가 명확하고 포트폴리오 키워드가 없는 경우에만 personal_tmi 허용
        if has_personal_kw and not has_portfolio_kw:
            return {
                "intent": "personal_tmi",
                "intent_confidence": 0.9,
                "target_project": "none",
                "response_style": response_style,
                "classified_by": "fallback_rule",
            }

        # 프로젝트 관련 질문 (명시적 프로젝트명, 프로젝트 단서, 또는 개요/심층 힌트 포함 시)
        if (
            target_project != "none"
            or has_overview_kw
            or any(k in q_lower for k in ("프로젝트", "지치니", "jichini", "캡팀", "capteam"))
        ):
            intent: IntentType = "project_deep_dive" if (has_deep_kw and not has_overview_kw) else "project_overview"
            return {
                "intent": intent,
                "intent_confidence": 0.85,
                "target_project": target_project,
                "response_style": response_style,
                "classified_by": "fallback_rule",
            }

        if has_deep_kw and has_portfolio_kw:
            return {
                "intent": "project_deep_dive",
                "intent_confidence": 0.8,
                "target_project": target_project,
                "response_style": response_style,
                "classified_by": "fallback_rule",
            }

        return {
            "intent": "career_profile",
            "intent_confidence": 0.8,
            "target_project": "none",
            "response_style": response_style,
            "classified_by": "fallback_rule",
        }

    def _apply_isolation_guardrails(
        self,
        question: str,
        history: List[Dict[str, str]],
        raw_intent: str,
        confidence: float,
        raw_project: str,
        raw_style: str,
        raw_ui_target: str = "none",
        search_keywords: str = "",
    ) -> Dict[str, Any]:
        """
        단방향 안전장치:
        명백한 포트폴리오/기술 고유명사가 포함된 질문이 personal_tmi 또는 out_of_scope로 오분류되는 경우만 차단합니다.
        """
        q_lower = question.strip().lower()
        has_strict_portfolio_noun = any(noun in q_lower for noun in PORTFOLIO_STRICT_NOUNS)

        intent: IntentType = (
            raw_intent  # type: ignore[assignment]
            if raw_intent in JEV_INTENT_CRITERIA
            else "career_profile"
        )
        target_project: TargetProjectType = (
            raw_project  # type: ignore[assignment]
            if raw_project in JEV_PROJECT_CRITERIA
            else "none"
        )
        response_style: ResponseStyleType = (
            raw_style  # type: ignore[assignment]
            if raw_style in JEV_STYLE_CRITERIA
            else "normal"
        )
        ui_target: UITargetType = (
            raw_ui_target  # type: ignore[assignment]
            if raw_ui_target in JEV_UI_TARGET_CRITERIA
            else "none"
        )

        # 단방향 가드레일: 명백한 포트폴리오 키워드가 있는데 personal_tmi 또는 out_of_scope로 오분류된 경우 차단
        has_portfolio_guard_kw = any(kw in q_lower for kw in PORTFOLIO_GUARD_KEYWORDS)
        if (intent == "personal_tmi" and has_strict_portfolio_noun) or (
            intent == "out_of_scope" and (has_strict_portfolio_noun or has_portfolio_guard_kw)
        ):
            intent = (
                "project_overview"
                if any(k in q_lower for k in ("jichini", "지치니", "capteam", "캡팀", "프로젝트", "캡스톤"))
                else "career_profile"
            )
            target_project = "none"

        # 프로젝트명이 명시되어 있으면 target_project 보강/전환 (단, personal_tmi는 제외)
        if intent in ("project_overview", "project_deep_dive"):
            inferred_project = self._infer_project_from_text(question, history)
            has_switch_cue = any(
                cue in question.lower()
                for cue in (
                    "다른 프로젝트",
                    "그 외 프로젝트",
                    "나머지 프로젝트",
                    "반대 프로젝트",
                    "그거 말고",
                    "거기 말고",
                )
            )
            if target_project == "none" or (has_switch_cue and inferred_project != "none"):
                if inferred_project != "none":
                    target_project = inferred_project
        else:
            target_project = "none"

        # UI 타겟 일관성 보정
        if intent in ("chitchat", "out_of_scope", "personal_tmi"):
            ui_target = "none"
        elif intent in ("project_overview", "project_deep_dive") and target_project in (
            "project-jichini",
            "project-capteam",
        ):
            ui_target = "project_detail"
        elif intent == "career_profile" and ui_target == "none" and any(
            k in q_lower for k in ("스택", "기술스택", "기술 스택")
        ):
            ui_target = "skills"

        # 스타일 명시 키워드 보강
        inferred_style = self._infer_style_from_text(question)
        if response_style == "normal" and inferred_style != "normal":
            response_style = inferred_style

        return {
            "intent": intent,
            "intent_confidence": confidence,
            "target_project": target_project,
            "response_style": response_style,
            "ui_target": ui_target,
            "search_keywords": search_keywords.strip(),
        }

    def _semantic_classify_fallback(
        self, question: str, history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        TYPESAFE_API_KEY 미설정 또는 Jev 호출 실패 시 동작하는 경량 의미 기반 JSON 분류기.
        키워드 매칭 대신 LLM이 질문 의도, 대상 프로젝트, 응답 스타일, 검색 확장 키워드를 판단합니다.
        """
        system_prompt = """김성현 포트폴리오 챗봇의 입력 분류기입니다. 현재 질문과 이전 대화를 보고 반드시 JSON만 반환하세요.

JSON 스키마:
{"intent": "...", "target_project": "...", "response_style": "...", "search_keywords": "..."}

1. intent 선택 (하나만):
- chitchat: 단순 인사, 감사, 챗봇 정체 질문
- personal_tmi: 사적인 취미, 주말/여가 일상, 운동/헬스/축구, 게임/PC방, 음악/노래/이어폰, 영화/만화, 음식/음료/간식/편의점, 성격유형(MBTI, 내향/외향), 키/혈액형/고향/가족/외동/형제, 연애/여친 등 사적 정보 질문
- career_profile: 개발 철학/가치관/일하는 방식/업무 스타일·태도, 자기소개, 학교/학력/나이, 기술 스택, 수상/공모전/챌린지, 연락처/GitHub/Notion 학습 기록 질문
- project_overview: 프로젝트 요약, 목록, 개발 동기/시기/목적, 팀원/맡은 역할 질문 (고유명사 없이 '첫번째꺼', '2025년 겨울에 한 거', '조별활동 매칭 시스템'처럼 프로젝트 지칭 포함)
- project_deep_dive: 프로젝트 구현 방식, DB/아키텍처, 트러블슈팅(힘들었던 거, 무한루프, 속도/비용 최적화, 레이턴시, 신상정보/민감정보 처리), 배운 점 질문
- out_of_scope: 김성현 및 포트폴리오와 전혀 무관한 외부 상식/날씨/코딩 대행

분류 핵심 주의사항:
- 업무·개발 태도/일하는 방식/개발 스타일을 물으면 반드시 career_profile, 내향/외향/MBTI나 개인 취향이면 personal_tmi.
- "2025년 겨울에 한 프로젝트/거"처럼 시기를 뜻하는 '겨울'이 들어간 프로젝트 질문은 절대 personal_tmi가 아닌 project_overview 또는 project_deep_dive.

2. target_project 선택:
- project-jichini: JICHINI/지치니, 사회초년생/고민연결, 타지 생활 위로 앱, 2025년 겨울 프로젝트, 첫 번째 프로젝트
- project-capteam: CapTeam/캡팀, 캡스톤/조별활동/팀 매칭, 최근 프로젝트, 무한루프/병렬처리/과대평가
- both: 두 프로젝트 비교/동시 지칭
- none: 특정 프로젝트 미지칭 (또는 이전 대화 맥락 '거기 말고'로 전환된 대상이 특정되지 않은 경우)

3. response_style 선택:
- brief: '한줄', '간단히', '짧게', '단 한 문장' 등 짧은 요약 요청 시에만
- structured: '목록으로', '비교해줘', '표/리스트로 정리' 요청 시에만 (단순 링크 요청은 normal)
- normal: 일반 질문

4. search_keywords:
구어체/초단문/대명사 질문을 문서(포트폴리오·개인정보) 검색에 유리한 핵심 단어 4~8개로 확장한 공백 구분 문자열."""

        user_prompt = f"이전 대화:\n{self._format_history(history, limit=4)}\n\n현재 질문: {question}"

        try:
            response = self.client.chat.completions.create(
                model=self.upstage_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
                max_tokens=150,
                response_format={"type": "json_object"},
            )
            raw_content = (response.choices[0].message.content or "").strip()
            parsed = json.loads(raw_content)

            guarded = self._apply_isolation_guardrails(
                question=question,
                history=history,
                raw_intent=str(parsed.get("intent", "career_profile")),
                confidence=0.9,
                raw_project=str(parsed.get("target_project", "none")),
                raw_style=str(parsed.get("response_style", "normal")),
                search_keywords=str(parsed.get("search_keywords", "")),
            )
            guarded["classified_by"] = f"semantic_llm({self.upstage_model})"
            return guarded
        except Exception as e:
            print(f"⚠️  의미 기반 폴백 분류 실패, 규칙 분류기로 대체합니다: {e}")
            rule_res = self._rule_based_classify(question, history)
            rule_res["search_keywords"] = ""
            return rule_res

    def classify_with_jev(
        self, question: str, history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """TypeSafe Jev (system_one) 우선 호출, 미설정 시 경량 의미 기반 분류기로 라우팅합니다."""
        self.ensure_jev_client()
        if self.jev_client is not None and Choice is not None:
            try:
                response = self.jev_client.system_one(
                    state={
                        "current_question": question,
                        "recent_history": self._format_history(history, limit=6),
                    },
                    questions={
                        "intent": Choice(
                            instructions=JEV_INTENT_INSTRUCTIONS,
                            criteria=JEV_INTENT_CRITERIA,
                        ),
                        "target_project": Choice(
                            instructions=JEV_PROJECT_INSTRUCTIONS,
                            criteria=JEV_PROJECT_CRITERIA,
                        ),
                        "response_style": Choice(
                            instructions=JEV_STYLE_INSTRUCTIONS,
                            criteria=JEV_STYLE_CRITERIA,
                        ),
                        "ui_target": Choice(
                            instructions=JEV_UI_TARGET_INSTRUCTIONS,
                            criteria=JEV_UI_TARGET_CRITERIA,
                        ),
                    },
                )
                intent_ans = response.choices["intent"]
                project_ans = response.choices["target_project"]
                style_ans = response.choices["response_style"]
                ui_target_ans = response.choices["ui_target"]

                guarded = self._apply_isolation_guardrails(
                    question=question,
                    history=history,
                    raw_intent=intent_ans.choice,
                    confidence=float(intent_ans.confidence),
                    raw_project=project_ans.choice,
                    raw_style=style_ans.choice,
                    raw_ui_target=ui_target_ans.choice,
                    search_keywords="",
                )
                guarded["classified_by"] = f"typesafe_jev({response.model})"
                return guarded
            except Exception as e:
                print(f"⚠️  TypeSafe Jev 호출 실패, 의미 기반 폴백 분류기로 전환합니다: {e}")

        return self._semantic_classify_fallback(question, history)

    def _build_retrieval_query(
        self,
        question: str,
        history: List[Dict[str, str]],
        target_project: TargetProjectType,
        search_keywords: str = "",
        intent: IntentType = "career_profile",
        ui_target: UITargetType = "none",
    ) -> str:
        """분류기가 추출한 대상 프로젝트와 검색 확장 키워드(또는 초단문 시드)를 결합합니다."""
        project_hint = ""
        if target_project == "project-jichini":
            project_hint = "JICHINI 지치니 프로젝트 "
        elif target_project == "project-capteam":
            project_hint = "CapTeam 캡팀 프로젝트 "
        elif target_project == "both":
            project_hint = "JICHINI CapTeam 프로젝트 비교 "

        kw_suffix = search_keywords.strip()
        if kw_suffix:
            return f"{project_hint}{question} {kw_suffix}".strip()

        if not history:
            return f"{project_hint}{question}".strip()

        lowered = question.lower()
        is_switch = any(
            cue in lowered
            for cue in ("다른 프로젝트", "그 외 프로젝트", "나머지 프로젝트", "반대 프로젝트", "거기 말고", "그거 말고")
        )
        if is_switch:
            return f"{project_hint}{question}".strip()

        needs_context = len(question.strip()) < 25 or any(
            pronoun in question
            for pronoun in ("그 ", "그중", "그거", "거기", "이 ", "해당", "위 ", "방금", "더 ", "최근", "전자", "후자", "첫번째", "두번째")
        )
        if needs_context and target_project == "none" and ui_target in ("none", "project_detail"):
            recent_user_msgs = [
                item.get("content", "").strip()
                for item in history[-4:]
                if item.get("role") == "user" and item.get("content", "").strip()
            ]
            context_prefix = " ".join(recent_user_msgs[-2:])
            return f"{project_hint}{context_prefix} {question}".strip()

        return f"{project_hint}{question}".strip()

    # =====================================================================
    # 2단계: Hard Isolation이 적용된 Hybrid Search (Chroma Dense + Kiwi BM25)
    # =====================================================================

    def _allowed_doc_categories(self, intent: IntentType) -> List[str]:
        """
        1차 방어선 (Hard Isolation):
        personal_tmi일 때만 'personal' 카테고리를 검색하고,
        그 외 모든 포트폴리오 의도에서는 'personal'을 물리적으로 배제합니다.
        """
        if intent == "personal_tmi":
            return ["personal"]
        if intent == "career_profile":
            return ["profile", "project"]
        return ["project", "profile"]

    def _chroma_category_filter(self, allowed_categories: List[str]) -> Dict[str, Any]:
        if len(allowed_categories) == 1:
            return {"doc_category": allowed_categories[0]}
        return {"doc_category": {"$in": allowed_categories}}

    def _metadata_boost(
        self,
        doc: Document,
        intent: IntentType,
        target_project: TargetProjectType,
        query: str = "",
        ui_target: UITargetType = "none",
    ) -> float:
        """Jev가 분류한 intent, target_project, ui_target에 맞춰 RRF 점수를 정밀 보정합니다.
        (Dense/BM25 1위 합의 결과를 덮어쓰지 않도록 완만한 스케일을 유지합니다.)
        """
        meta = doc.metadata or {}
        doc_category = meta.get("doc_category", "")
        doc_project_id = meta.get("project_id", "")
        doc_section = meta.get("section", "")
        doc_type = meta.get("document_type", "")
        doc_topic = meta.get("topic", "")

        boost = 0.0

        if intent == "career_profile":
            if doc_category == "profile":
                boost += 0.003
            elif doc_type == "project_summary":
                boost += 0.001

        elif intent in ("project_overview", "project_deep_dive"):
            if doc_category == "project":
                boost += 0.003

            # 특정 프로젝트 타겟팅 시 타 프로젝트 문서 혼입 억제
            if target_project in ("project-jichini", "project-capteam"):
                if doc_project_id == target_project:
                    boost += 0.008
                elif doc_project_id and doc_project_id not in (target_project, "all"):
                    boost -= 0.006
            elif target_project in ("both", "none") and intent == "project_overview":
                if doc_type == "project_summary" or doc_section == "overview":
                    boost += 0.004

            # 개요 vs 심층/팀 섹션 가중치 차별화
            if intent == "project_overview":
                q_lower = query.lower()
                asks_team_or_role = any(
                    cue in q_lower
                    for cue in ("팀원", "역할", "담당", "맡", "파트", "구성", "인원", "몇 명", "누구")
                )
                if asks_team_or_role:
                    if doc_section == "team":
                        boost += 0.008
                    elif doc_section in ("overview", "summary"):
                        boost += 0.004
                else:
                    if doc_section == "overview":
                        boost += 0.008
                    elif doc_section == "summary":
                        boost += 0.006
                    elif doc_section == "team":
                        boost += 0.002
            elif intent == "project_deep_dive" and doc_section in (
                "troubleshooting",
                "troubleshooting_summary",
                "development",
                "lessons",
            ):
                boost += 0.004

        if intent != "personal_tmi":
            if ui_target == "skills" and doc_type == "skill":
                boost += 0.018 if doc_topic == "ai_stack" else 0.015
            elif ui_target == "awards" and doc_type in ("award", "award_summary"):
                boost += 0.018 if doc_type == "award_summary" else 0.014
            elif ui_target == "activities" and doc_type in ("activity", "activity_summary"):
                boost += 0.018 if doc_type == "activity_summary" else 0.014
            elif ui_target == "education" and doc_type in ("education", "profile"):
                boost += 0.015

        return boost

    def hybrid_search(
        self,
        query: str,
        intent: IntentType,
        target_project: TargetProjectType = "none",
        top_k: Optional[int] = None,
        question: Optional[str] = None,
        ui_target: UITargetType = "none",
    ) -> List[Document]:
        """
        Dense(ChromaDB) + Sparse(Kiwi BM25) 결과를 RRF로 통합하고
        Hard Category Filter로 개인정보 청크 유출을 원천 차단합니다.
        """
        if self.vectorstore is None:
            raise ValueError("벡터 스토어가 초기화되지 않았습니다.")

        k = top_k or self.top_k
        fetch_k = max(k * 4, 20)
        allowed_categories = self._allowed_doc_categories(intent)
        chroma_filter = self._chroma_category_filter(allowed_categories)

        # 1. Dense Search (ChromaDB + 메타데이터 하드 필터)
        dense_results: List[Document] = []
        try:
            dense_with_scores = self.vectorstore.similarity_search_with_score(
                query,
                k=fetch_k,
                filter=chroma_filter,
            )
            dense_results = [
                doc for doc, _score in dense_with_scores
                if doc.metadata.get("doc_category") in allowed_categories
            ]
        except Exception as e:
            print(f"⚠️  Dense 필터 검색 중 예외 발생, 후처리 필터로 대체: {e}")
            raw_dense = self.vectorstore.similarity_search(query, k=fetch_k)
            dense_results = [
                doc for doc in raw_dense
                if doc.metadata.get("doc_category") in allowed_categories
            ]

        # 2. Sparse Search (Kiwi 형태소 분석 + BM25Okapi + 하드 필터)
        sparse_results: List[Document] = []
        filtered_indices = [
            idx for idx, chunk in enumerate(self.chunks)
            if chunk.metadata.get("doc_category") in allowed_categories
        ]
        query_tokens = self.tokenizer.tokenize(query)

        if filtered_indices and query_tokens:
            sub_corpus = [self.chunk_tokens[idx] for idx in filtered_indices]
            bm25 = BM25Okapi(sub_corpus)
            scores = bm25.get_scores(query_tokens)
            ranked_pairs = sorted(
                zip(filtered_indices, scores),
                key=lambda item: item[1],
                reverse=True,
            )
            sparse_results = [
                self.chunks[idx]
                for idx, score in ranked_pairs[:fetch_k]
                if score > 0.0
            ]

        # 3. RRF (Reciprocal Rank Fusion) 결합 + Jev 메타데이터 부스팅
        rrf_k = 60
        fused_scores: Dict[str, float] = {}
        doc_map: Dict[str, Document] = {}

        def doc_key(doc: Document) -> str:
            meta = doc.metadata or {}
            return str(meta.get("chunk_id") or meta.get("doc_id") or hash(doc.page_content))

        for rank, doc in enumerate(dense_results, start=1):
            key = doc_key(doc)
            doc_map[key] = doc
            fused_scores[key] = fused_scores.get(key, 0.0) + (1.0 / (rrf_k + rank))

        # personal_tmi에서는 고유명사/별칭 매칭을 위해 1.35, 포트폴리오 질문에서는 범용어 역전 방지를 위해 1.1 적용
        sparse_weight = 1.35 if intent == "personal_tmi" else 1.1
        for rank, doc in enumerate(sparse_results, start=1):
            key = doc_key(doc)
            doc_map[key] = doc
            fused_scores[key] = fused_scores.get(key, 0.0) + (sparse_weight / (rrf_k + rank))

        boost_query = question if question is not None else query
        for key, doc in doc_map.items():
            fused_scores[key] += self._metadata_boost(
                doc, intent, target_project, boost_query, ui_target=ui_target
            )

        ranked_keys = sorted(fused_scores.keys(), key=lambda key: fused_scores[key], reverse=True)
        final_docs = [doc_map[key] for key in ranked_keys[:k]]

        # 최종 안전 검증: personal_tmi가 아닐 때 personal 청크가 절대 포함되지 않도록 재확인
        if intent != "personal_tmi":
            final_docs = [
                doc for doc in final_docs
                if doc.metadata.get("doc_category") != "personal"
            ]

        return final_docs

    # =====================================================================
    # 3단계: LangGraph 노드 및 프롬프트 체인 구성
    # =====================================================================

    def _node_classify_input(self, state: PortfolioGraphState) -> Dict[str, Any]:
        question = state["question"]
        history = state.get("history") or []
        classification = self.classify_with_jev(question, history)
        search_keywords = classification.get("search_keywords", "")
        retrieval_query = self._build_retrieval_query(
            question=question,
            history=history,
            target_project=classification["target_project"],
            search_keywords=search_keywords,
            intent=classification["intent"],
            ui_target=classification.get("ui_target", "none"),
        )
        return {
            "intent": classification["intent"],
            "intent_confidence": classification["intent_confidence"],
            "target_project": classification["target_project"],
            "response_style": classification["response_style"],
            "ui_target": classification.get("ui_target", "none"),
            "search_keywords": search_keywords,
            "classified_by": classification["classified_by"],
            "retrieval_query": retrieval_query,
        }

    def _build_chitchat_messages(self, question: str, history: List[Dict[str, str]]) -> List[Dict[str, str]]:
        prompt = f"이전 대화:\n{self._format_history(history, limit=4)}\n\n사용자 메시지: {question}\n\n답변:"
        return [
            {"role": "system", "content": CHITCHAT_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

    def _node_handle_chitchat(self, state: PortfolioGraphState) -> Dict[str, Any]:
        question = state["question"]
        history = state.get("history") or []
        response = self.client.chat.completions.create(
            model=self.upstage_model,
            messages=self._build_chitchat_messages(question, history),
            temperature=0.3,
            max_tokens=300,
        )
        answer = (response.choices[0].message.content or "").strip()
        return {
            "documents": [],
            "context": "",
            "answer": answer,
            "sources": [],
        }

    def _node_handle_out_of_scope(self, _state: PortfolioGraphState) -> Dict[str, Any]:
        return {
            "documents": [],
            "context": "",
            "answer": OUT_OF_SCOPE_RESPONSE,
            "sources": [],
        }

    def _format_context_and_sources(self, docs: List[Document]) -> tuple[str, List[Dict[str, Any]]]:
        context = "\n\n---\n\n".join(
            f"[참고 문서 {idx} | {doc.metadata.get('source', '포트폴리오 정보')}]\n{doc.page_content}"
            for idx, doc in enumerate(docs, start=1)
        )
        sources = [
            {
                "title": doc.metadata.get("source", "Unknown"),
                "content_preview": doc.page_content[:100] + ("..." if len(doc.page_content) > 100 else ""),
                "category": doc.metadata.get("doc_category", "portfolio"),
            }
            for doc in docs
        ]
        return context, sources

    def _node_hybrid_retrieve(self, state: PortfolioGraphState) -> Dict[str, Any]:
        docs = self.hybrid_search(
            query=state["retrieval_query"],
            intent=state["intent"],
            target_project=state["target_project"],
            top_k=self.top_k,
            question=state["question"],
            ui_target=state.get("ui_target", "none"),
        )
        context, sources = self._format_context_and_sources(docs)
        return {
            "documents": docs,
            "context": context,
            "sources": sources,
        }

    def _build_intent_messages(
        self,
        intent_key: IntentType,
        question: str,
        history: List[Dict[str, str]],
        target_project: TargetProjectType,
        response_style: ResponseStyleType,
        context: str,
    ) -> List[Dict[str, str]]:
        system_prompt = INTENT_SYSTEM_PROMPTS.get(intent_key, BASELINE_SYSTEM_PROMPT)
        style_instruction = STYLE_INSTRUCTIONS.get(response_style, STYLE_INSTRUCTIONS["normal"])
        prompt = QA_PROMPT_TEMPLATE.format(
            intent=intent_key,
            target_project=target_project,
            style_instruction=style_instruction,
            history=self._format_history(history),
            context=context,
            question=question,
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]

    def _invoke_intent_prompt_chain(
        self,
        state: PortfolioGraphState,
        intent_key: IntentType,
    ) -> Dict[str, Any]:
        messages = self._build_intent_messages(
            intent_key=intent_key,
            question=state["question"],
            history=state.get("history") or [],
            target_project=state.get("target_project", "none"),
            response_style=state.get("response_style", "normal"),
            context=state.get("context", ""),
        )
        response = self.client.chat.completions.create(
            model=self.upstage_model,
            messages=messages,
            temperature=0.35,
            max_tokens=1000,
        )
        answer = (response.choices[0].message.content or "").strip()
        return {"answer": answer}

    def _node_generate_personal(self, state: PortfolioGraphState) -> Dict[str, Any]:
        return self._invoke_intent_prompt_chain(state, "personal_tmi")

    def _node_generate_profile(self, state: PortfolioGraphState) -> Dict[str, Any]:
        return self._invoke_intent_prompt_chain(state, "career_profile")

    def _node_generate_project_overview(self, state: PortfolioGraphState) -> Dict[str, Any]:
        return self._invoke_intent_prompt_chain(state, "project_overview")

    def _node_generate_project_deep_dive(self, state: PortfolioGraphState) -> Dict[str, Any]:
        return self._invoke_intent_prompt_chain(state, "project_deep_dive")

    @staticmethod
    def _route_after_classification(state: PortfolioGraphState) -> str:
        intent = state.get("intent", "career_profile")
        if intent == "chitchat":
            return "chitchat"
        if intent == "out_of_scope":
            return "out_of_scope"
        return "hybrid_retrieve"

    @staticmethod
    def _route_to_prompt_chain(state: PortfolioGraphState) -> str:
        intent = state.get("intent", "career_profile")
        if intent == "personal_tmi":
            return "generate_personal"
        if intent == "project_overview":
            return "generate_project_overview"
        if intent == "project_deep_dive":
            return "generate_project_deep_dive"
        return "generate_profile"

    def _build_langgraph(self):
        workflow = StateGraph(PortfolioGraphState)

        # 노드 등록
        workflow.add_node("classify_input", self._node_classify_input)
        workflow.add_node("chitchat", self._node_handle_chitchat)
        workflow.add_node("out_of_scope", self._node_handle_out_of_scope)
        workflow.add_node("hybrid_retrieve", self._node_hybrid_retrieve)
        workflow.add_node("generate_personal", self._node_generate_personal)
        workflow.add_node("generate_profile", self._node_generate_profile)
        workflow.add_node("generate_project_overview", self._node_generate_project_overview)
        workflow.add_node("generate_project_deep_dive", self._node_generate_project_deep_dive)

        # 시작점 및 조건부 라우팅 연결
        workflow.set_entry_point("classify_input")
        workflow.add_conditional_edges(
            "classify_input",
            self._route_after_classification,
            {
                "chitchat": "chitchat",
                "out_of_scope": "out_of_scope",
                "hybrid_retrieve": "hybrid_retrieve",
            },
        )
        workflow.add_conditional_edges(
            "hybrid_retrieve",
            self._route_to_prompt_chain,
            {
                "generate_personal": "generate_personal",
                "generate_profile": "generate_profile",
                "generate_project_overview": "generate_project_overview",
                "generate_project_deep_dive": "generate_project_deep_dive",
            },
        )

        # 종료 엣지
        workflow.add_edge("chitchat", END)
        workflow.add_edge("out_of_scope", END)
        workflow.add_edge("generate_personal", END)
        workflow.add_edge("generate_profile", END)
        workflow.add_edge("generate_project_overview", END)
        workflow.add_edge("generate_project_deep_dive", END)

        return workflow.compile()

    _PROJECT_ID_TO_UI = {
        "project-capteam": "capteam",
        "project-jichini": "jichini",
    }

    _PROJECT_UI_LABELS = {
        "capteam": "CapTeam",
        "jichini": "JICHINI",
    }

    _SECTION_TO_MODAL = {
        "overview": ("modal-overview", "개요 & 동기"),
        "team": ("modal-overview", "팀 & 역할"),
        "development": ("modal-build", "개발 내용"),
        "troubleshooting": ("modal-troubleshooting", "문제와 해결"),
        "troubleshooting_summary": ("modal-troubleshooting", "문제와 해결"),
        "lessons": ("modal-learned", "배운 점"),
    }

    _DOC_ID_TO_CARD_TITLE = {
        "capteam-development-dataset": "Dataset 설계",
        "capteam-development-structured-output": "Structured Output",
        "capteam-development-langgraph-workflow": "LangGraph Workflow",
        "capteam-development-backend": "Backend Framework",
        "capteam-troubleshooting-randomness": "학생 분석 결과의 랜덤성과 과대평가",
        "capteam-troubleshooting-loop": "LLM 팀 수정의 최대 횟수 반복",
        "capteam-troubleshooting-context-performance": "컨텍스트 길이 초과와 긴 처리 시간",
        "jichini-development-jev-langgraph": "Jev 기반 입력 판단 및 LangGraph 응답 분기",
        "jichini-development-rag-vector-db": "pgvector 기반 유사 사용자 매칭",
        "jichini-development-persistent-memory": "PostgreSQL 영속 대화 메모리",
        "jichini-development-backend-api": "Backend Framework",
        "jichini-troubleshooting-optimization": "모호한 고민 구체화와 판단 호출 줄이기",
        "jichini-troubleshooting-search-method": "유사 사용자 검색 방식 개선",
    }

    def _resolve_navigation(
        self,
        intent: IntentType,
        target_project: TargetProjectType,
        docs: List[Document],
        question: str = "",
        ui_target: UITargetType = "none",
    ) -> Optional[Dict[str, Any]]:
        """Jev가 판단한 ui_target과 검색 문서를 바탕으로 프론트엔드 자동 이동 대상을 결정합니다."""
        if intent in ("chitchat", "out_of_scope", "personal_tmi") or not docs:
            return None

        if ui_target == "none":
            return None

        if ui_target == "skills":
            skill_doc = next(
                (d for d in docs if (d.metadata or {}).get("document_type") == "skill"),
                None,
            )
            skill_topic = str((skill_doc.metadata or {}).get("topic") or "") if skill_doc else "ai_stack"
            stack_target = "Also Used" if skill_topic == "language_backend_tools" else "Primary Stack"
            return {
                "section": "skills",
                "projectId": None,
                "modalSection": None,
                "highlightText": stack_target,
                "label": f"기술 스택 · {stack_target}",
            }

        if ui_target == "awards":
            return {
                "section": "about",
                "projectId": None,
                "modalSection": None,
                "highlightText": "AWARDS",
                "label": "수상 경력",
            }

        if ui_target == "activities":
            return {
                "section": "about",
                "projectId": None,
                "modalSection": None,
                "highlightText": "ACTIVITIES",
                "label": "대외활동 · 연수",
            }

        if ui_target == "education":
            return {
                "section": "about",
                "projectId": None,
                "modalSection": None,
                "highlightText": "EDUCATION",
                "label": "학력 및 활동",
            }

        if ui_target == "projects_list":
            return {
                "section": "projects",
                "projectId": None,
                "modalSection": None,
                "highlightText": None,
                "label": "프로젝트 섹션",
            }

        # ui_target == "project_detail"
        top_meta = docs[0].metadata or {}
        ui_project_id = self._PROJECT_ID_TO_UI.get(target_project)
        if not ui_project_id:
            top_proj = str(top_meta.get("project_id") or "")
            ui_project_id = self._PROJECT_ID_TO_UI.get(top_proj)

        if not ui_project_id:
            return {
                "section": "projects",
                "projectId": None,
                "modalSection": None,
                "highlightText": None,
                "label": "프로젝트 섹션",
            }

        target_backend_pid = f"project-{ui_project_id}"
        candidates = [
            doc for doc in docs if (doc.metadata or {}).get("project_id") == target_backend_pid
        ] or docs

        q_lower = question.lower()
        q_tokens = set(self.tokenizer.tokenize(question))

        def _score_doc(idx_doc: tuple[int, Document]) -> float:
            idx, doc = idx_doc
            meta = doc.metadata or {}
            sec = str(meta.get("section") or "")
            text_blob = f"{meta.get('source', '')} {doc.page_content}".lower()
            score = (len(candidates) - idx) * 0.5
            score += sum(2.0 for tok in q_tokens if tok in text_blob)
            if any(k in q_lower for k in ("문제", "오류", "버그", "트러블", "루프", "고침", "해결", "최적화", "속도", "비용", "지연", "정확도", "리랭커", "reranker", "cross-encoder", "헛매칭", "검색 방식", "bm25", "rrf")):
                if sec in ("troubleshooting", "troubleshooting_summary"):
                    score += 3.0
            elif any(k in q_lower for k in ("배운", "느낀", "회고")):
                if sec == "lessons":
                    score += 3.0
            elif any(k in q_lower for k in ("구현", "개발", "db", "데이터베이스", "백엔드", "api", "워크플로", "아키텍처", "메모리", "영속", "저장", "기억", "락", "토큰", "요약", "압축", "복귀", "비식별", "ner", "koelectra", "hitl")):
                if sec == "development":
                    score += 2.5
            return score

        _, matched_doc = max(enumerate(candidates), key=_score_doc)
        m = matched_doc.metadata or {}
        doc_section = str(m.get("section") or "overview")
        doc_id = str(m.get("doc_id") or "")

        modal_section, modal_label = self._SECTION_TO_MODAL.get(
            doc_section, ("modal-overview", "개요 & 동기")
        )
        highlight_text = self._DOC_ID_TO_CARD_TITLE.get(doc_id)
        project_label = self._PROJECT_UI_LABELS.get(ui_project_id, ui_project_id)

        return {
            "section": "projects",
            "projectId": ui_project_id,
            "modalSection": modal_section,
            "highlightText": highlight_text,
            "label": f"{project_label} · {modal_label}",
        }

    def query(self, question: str, history: List[Dict[str, str]] | None = None) -> Dict[str, Any]:
        """
        LangGraph 파이프라인을 실행하여 질문에 대한 답변과 출처, 분류 메타데이터를 반환합니다.
        """
        if self.graph is None:
            raise ValueError("LangGraph가 초기화되지 않았습니다. build_qa_chain()을 먼저 실행하세요.")

        initial_state: PortfolioGraphState = {
            "question": question,
            "history": history or [],
            "intent": "career_profile",
            "intent_confidence": 0.0,
            "target_project": "none",
            "response_style": "normal",
            "ui_target": "none",
            "search_keywords": "",
            "classified_by": "",
            "retrieval_query": question,
            "documents": [],
            "context": "",
            "answer": "",
            "sources": [],
        }

        final_state = self.graph.invoke(initial_state)
        intent: IntentType = final_state.get("intent", "career_profile")
        target_project: TargetProjectType = final_state.get("target_project", "none")
        ui_target: UITargetType = final_state.get("ui_target", "none")
        docs = final_state.get("documents") or []

        return {
            "answer": final_state.get("answer", ""),
            "sources": final_state.get("sources", []),
            "intent": intent,
            "target_project": target_project,
            "response_style": final_state.get("response_style", "normal"),
            "classified_by": final_state.get("classified_by", ""),
            "navigation": self._resolve_navigation(intent, target_project, docs, question, ui_target=ui_target),
        }

    def stream_query(self, question: str, history: List[Dict[str, str]] | None = None):
        """
        Jev 분류 및 Hybrid Search 후 화면 이동(navigate) 이벤트와 LLM 토큰을 순차 스트리밍합니다.
        """
        safe_history = history or []
        classified = self._node_classify_input({"question": question, "history": safe_history})
        intent: IntentType = classified["intent"]
        target_project: TargetProjectType = classified["target_project"]
        response_style: ResponseStyleType = classified["response_style"]
        ui_target: UITargetType = classified.get("ui_target", "none")
        classified_by: str = classified["classified_by"]

        if intent == "out_of_scope":
            yield {"type": "token", "text": OUT_OF_SCOPE_RESPONSE}
            yield {
                "type": "done",
                "answer": OUT_OF_SCOPE_RESPONSE,
                "sources": [],
                "intent": intent,
                "target_project": target_project,
                "response_style": response_style,
                "classified_by": classified_by,
                "navigation": None,
            }
            return

        navigation: Optional[Dict[str, Any]] = None
        if intent == "chitchat":
            sources: List[Dict[str, Any]] = []
            messages = self._build_chitchat_messages(question, safe_history)
            temperature = 0.3
            max_tokens = 300
        else:
            docs = self.hybrid_search(
                query=classified["retrieval_query"],
                intent=intent,
                target_project=target_project,
                top_k=self.top_k,
                question=question,
                ui_target=ui_target,
            )
            context, sources = self._format_context_and_sources(docs)
            navigation = self._resolve_navigation(intent, target_project, docs, question, ui_target=ui_target)
            if navigation is not None:
                yield {"type": "navigate", "navigation": navigation}

            messages = self._build_intent_messages(
                intent_key=intent,
                question=question,
                history=safe_history,
                target_project=target_project,
                response_style=response_style,
                context=context,
            )
            temperature = 0.35
            max_tokens = 1000

        stream = self.client.chat.completions.create(
            model=self.upstage_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )

        collected: List[str] = []
        for chunk in stream:
            if not getattr(chunk, "choices", None):
                continue
            delta = getattr(chunk.choices[0].delta, "content", None)
            if delta:
                collected.append(delta)
                yield {"type": "token", "text": delta}

        yield {
            "type": "done",
            "answer": "".join(collected).strip(),
            "sources": sources,
            "intent": intent,
            "target_project": target_project,
            "response_style": response_style,
            "classified_by": classified_by,
            "navigation": navigation,
        }

    @classmethod
    def from_existing_db(
        cls,
        projects_json_path: str,
        upstage_api_key: str,
        persist_directory: str = "./chroma_db",
        **kwargs,
    ):
        """이미 구축된 벡터 DB를 재사용하면서 Kiwi BM25 인덱스와 LangGraph를 함께 초기화합니다."""
        instance = cls(
            projects_json_path=projects_json_path,
            upstage_api_key=upstage_api_key,
            persist_directory=persist_directory,
            **kwargs,
        )

        print(f"📂 기존 벡터 DB 로드: {persist_directory}")
        instance.vectorstore = Chroma(
            persist_directory=persist_directory,
            embedding_function=instance.embeddings,
            client_settings=instance._chroma_client_settings(),
        )
        instance.build_qa_chain()
        return instance


def build_rag_engine(
    projects_json_path: str,
    upstage_api_key: str,
    rebuild: bool = False,
    **kwargs,
) -> RAGEngine:
    """
    RAG 엔진 빌더 (projects.json 또는 personal.json 변경 시 벡터 DB 자동 재구축)
    """
    persist_dir = kwargs.get("persist_directory", "./chroma_db")
    personal_json_path = kwargs.get("personal_json_path") or str(
        Path(projects_json_path).resolve().parent / "personal.json"
    )

    projects_mtime = os.path.getmtime(projects_json_path) if os.path.exists(projects_json_path) else 0
    personal_mtime = os.path.getmtime(personal_json_path) if os.path.exists(personal_json_path) else 0
    data_mtime = max(projects_mtime, personal_mtime)

    db_mtime = os.path.getmtime(persist_dir) if os.path.exists(persist_dir) else 0
    data_changed = data_mtime > db_mtime
    version_file = Path(persist_dir) / ".rag_index_version"
    index_version = version_file.read_text(encoding="utf-8").strip() if version_file.exists() else ""
    passage_model = kwargs.get("passage_embedding_model", DEFAULT_PASSAGE_EMBEDDING_MODEL)
    query_model = kwargs.get("query_embedding_model", DEFAULT_QUERY_EMBEDDING_MODEL)
    expected_index_version = f"{RAG_INDEX_VERSION}:{passage_model}:{query_model}"
    index_outdated = index_version != expected_index_version

    if not rebuild and os.path.exists(persist_dir) and not data_changed and not index_outdated:
        print("🔄 기존 벡터 DB 재사용")
        return RAGEngine.from_existing_db(
            projects_json_path=projects_json_path,
            upstage_api_key=upstage_api_key,
            **kwargs,
        )

    if data_changed and os.path.exists(persist_dir):
        print("♻️  포트폴리오/개인정보 데이터 변경 감지: 벡터 DB를 새로 구축합니다")
    if index_outdated and os.path.exists(persist_dir):
        print("♻️  RAG 인덱스 구조 변경 감지: 벡터 DB를 새로 구축합니다")

    print("🏗️  벡터 DB 새로 구축")
    engine = RAGEngine(
        projects_json_path=projects_json_path,
        upstage_api_key=upstage_api_key,
        **kwargs,
    )
    engine.build_vectorstore()
    engine.build_qa_chain()
    return engine
