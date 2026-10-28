import hashlib
import re
from typing import Any

from app.rag.document_schema import (
    RAGDocument,
)
from app.rag.source_policy import (
    is_allowed_source,
)
from app.rag.vector_store import (
    rag_vector_store,
)


class RAGIngestionService:

    def validate_document(
        self,
        document: RAGDocument,
    ) -> bool:
        """
        문서가 허용된 공식/검증 출처인지 검사한다.
        """

        return is_allowed_source(
            source_org=document.metadata.source_org,
            document_type=document.metadata.document_type,
            verified=document.metadata.verified,
        )

    def _normalize_text(
        self,
        text: str,
    ) -> str:
        """
        PDF/HTML 추출 텍스트를 기본 정리한다.
        """

        text = text.replace(
            "\r\n",
            "\n",
        )

        text = text.replace(
            "\r",
            "\n",
        )

        # 과도한 공백 제거
        text = re.sub(
            r"[ \t]+",
            " ",
            text,
        )

        # 3개 이상의 연속 줄바꿈은 2개로 축소
        text = re.sub(
            r"\n{3,}",
            "\n\n",
            text,
        )

        return text.strip()

    def _split_paragraphs(
        self,
        text: str,
    ) -> list[str]:
        """
        빈 줄을 기준으로 문단을 분리한다.
        """

        raw_paragraphs = re.split(
            r"\n\s*\n",
            text,
        )

        paragraphs: list[str] = []

        for paragraph in raw_paragraphs:

            cleaned = " ".join(
                line.strip()
                for line in paragraph.splitlines()
                if line.strip()
            ).strip()

            if cleaned:
                paragraphs.append(
                    cleaned
                )

        return paragraphs

    def _split_long_text(
        self,
        text: str,
        max_chunk_size: int,
    ) -> list[str]:
        """
        하나의 문단 자체가 너무 긴 경우
        문장 경계를 우선 이용하여 나눈다.
        """

        if len(text) <= max_chunk_size:
            return [
                text
            ]

        sentences = re.split(
            r"(?<=[.!?。])\s+",
            text,
        )

        chunks: list[str] = []
        current = ""

        for sentence in sentences:

            sentence = sentence.strip()

            if not sentence:
                continue

            if not current:
                current = sentence
                continue

            candidate = (
                current
                + " "
                + sentence
            )

            if len(candidate) <= max_chunk_size:
                current = candidate
            else:
                chunks.append(
                    current.strip()
                )

                current = sentence

        if current:
            chunks.append(
                current.strip()
            )

        # 문장 분리 자체가 잘 안 된 매우 긴 텍스트 fallback
        final_chunks: list[str] = []

        for chunk in chunks:

            if len(chunk) <= max_chunk_size:
                final_chunks.append(
                    chunk
                )
                continue

            start = 0

            while start < len(chunk):

                end = min(
                    start + max_chunk_size,
                    len(chunk),
                )

                piece = chunk[
                    start:end
                ].strip()

                if piece:
                    final_chunks.append(
                        piece
                    )

                start = end

        return final_chunks

    def chunk_document(
        self,
        document: RAGDocument,
        min_chunk_size: int = 500,
        target_chunk_size: int = 900,
        max_chunk_size: int = 1200,
    ) -> list[dict[str, Any]]:
        """
        문단 중심 chunking.

        목표:
        - 너무 짧은 문단은 합친다.
        - 의미상 문단 경계를 최대한 유지한다.
        - 너무 긴 문단만 추가 분할한다.
        """

        if not self.validate_document(
            document
        ):
            raise ValueError(
                "허용되지 않은 RAG 문서 출처입니다."
            )

        text = self._normalize_text(
            document.content
        )

        if not text:
            raise ValueError(
                "RAG 문서 내용이 비어 있습니다."
            )

        if min_chunk_size <= 0:
            raise ValueError(
                "min_chunk_size는 1 이상이어야 합니다."
            )

        if target_chunk_size < min_chunk_size:
            raise ValueError(
                "target_chunk_size는 min_chunk_size보다 "
                "크거나 같아야 합니다."
            )

        if max_chunk_size < target_chunk_size:
            raise ValueError(
                "max_chunk_size는 target_chunk_size보다 "
                "크거나 같아야 합니다."
            )

        paragraphs = self._split_paragraphs(
            text
        )

        chunks_text: list[str] = []

        current_parts: list[str] = []
        current_length = 0

        for paragraph in paragraphs:

            paragraph_parts = (
                self._split_long_text(
                    text=paragraph,
                    max_chunk_size=max_chunk_size,
                )
            )

            for part in paragraph_parts:

                part_length = len(
                    part
                )

                if not current_parts:
                    current_parts.append(
                        part
                    )

                    current_length = (
                        part_length
                    )

                    continue

                candidate_length = (
                    current_length
                    + 2
                    + part_length
                )

                # target 이하면 자연스럽게 합친다.
                if candidate_length <= target_chunk_size:

                    current_parts.append(
                        part
                    )

                    current_length = (
                        candidate_length
                    )

                    continue

                # 현재 chunk가 너무 짧으면
                # max 범위까지는 한 번 더 합친다.
                if (
                    current_length < min_chunk_size
                    and candidate_length <= max_chunk_size
                ):
                    current_parts.append(
                        part
                    )

                    current_length = (
                        candidate_length
                    )

                    continue

                chunks_text.append(
                    "\n\n".join(
                        current_parts
                    ).strip()
                )

                current_parts = [
                    part
                ]

                current_length = (
                    part_length
                )

        if current_parts:
            chunks_text.append(
                "\n\n".join(
                    current_parts
                ).strip()
            )

        chunks: list[
            dict[str, Any]
        ] = []

        for (
            chunk_index,
            chunk_text,
        ) in enumerate(
            chunks_text
        ):

            if not chunk_text:
                continue

            metadata = {
                **document.metadata.model_dump(),
                "chunk_index": chunk_index,
            }

            chunks.append(
                {
                    "content": chunk_text,
                    "metadata": metadata,
                }
            )

        return chunks

    def prepare_document(
        self,
        document: RAGDocument,
    ) -> list[dict[str, Any]]:
        """
        문서를 검증하고 chunk 목록을 생성한다.
        """

        return self.chunk_document(
            document
        )

    def _build_chunk_id(
        self,
        content: str,
        metadata: dict[str, Any],
    ) -> str:
        """
        출처 + 제목 + chunk index + 내용을 이용해
        안정적인 chunk ID를 생성한다.
        """

        unique_source = (
            f"{metadata.get('source_org', '')}|"
            f"{metadata.get('title', '')}|"
            f"{metadata.get('chunk_index', '')}|"
            f"{content}"
        )

        return hashlib.sha256(
            unique_source.encode(
                "utf-8"
            )
        ).hexdigest()

    def ingest_document(
        self,
        document: RAGDocument,
        batch_size: int = 50,
    ) -> int:
        """
        문서를 semantic-like chunking한 뒤
        batch embedding하여 Chroma에 저장한다.
        """

        if batch_size <= 0:
            raise ValueError(
                "batch_size는 1 이상이어야 합니다."
            )

        chunks = self.prepare_document(
            document
        )

        prepared_chunks: list[
            dict[str, Any]
        ] = []

        for chunk in chunks:

            content = chunk[
                "content"
            ]

            metadata = chunk[
                "metadata"
            ]

            chunk_id = self._build_chunk_id(
                content=content,
                metadata=metadata,
            )

            prepared_chunks.append(
                {
                    "chunk_id": chunk_id,
                    "content": content,
                    "metadata": metadata,
                }
            )

        total = len(
            prepared_chunks
        )

        if total == 0:
            return 0

        print(
            f"[INFO] total chunks: {total}",
            flush=True,
        )

        for start in range(
            0,
            total,
            batch_size,
        ):

            end = min(
                start + batch_size,
                total,
            )

            batch = prepared_chunks[
                start:end
            ]

            print(
                f"[EMBED] "
                f"{start + 1}-{end} / {total}",
                flush=True,
            )

            rag_vector_store.add_chunks(
                batch
            )

        return total


rag_ingestion_service = (
    RAGIngestionService()
)


def ingest_document(
    document: RAGDocument,
    batch_size: int = 50,
) -> int:
    """
    외부 스크립트용 wrapper.
    """

    return (
        rag_ingestion_service
        .ingest_document(
            document=document,
            batch_size=batch_size,
        )
    )