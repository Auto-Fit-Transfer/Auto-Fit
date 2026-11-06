from pathlib import Path
from typing import Any

import chromadb

from app.rag.embedding_service import (
    get_embedding_service,
)


class RAGVectorStore:

    def __init__(
        self,
        path: str | Path = "data/chroma",
        collection_name: str = "health_guidelines",
    ):
        self.path = str(path)

        self.client = chromadb.PersistentClient(
            path=self.path
        )

        self.collection = (
            self.client.get_or_create_collection(
                name=collection_name
            )
        )

    def add_chunk(
        self,
        chunk_id: str,
        content: str,
        metadata: dict[str, Any],
    ) -> None:
        """
        문서 chunk를 embedding한 뒤
        Chroma에 저장한다.
        """

        embedding_service = get_embedding_service()

        embedding = embedding_service.embed_text(
            content
        )

        # Chroma metadata는
        # str / int / float / bool 타입만 허용
        safe_metadata = {
            key: value
            for key, value in metadata.items()
            if value is not None
            and isinstance(
                value,
                (
                    str,
                    int,
                    float,
                    bool,
                ),
            )
        }

        self.collection.upsert(
            ids=[chunk_id],
            embeddings=[embedding],
            documents=[content],
            metadatas=[safe_metadata],
        )

    def search(
        self,
        query: str | list[float] | None = None,
        *,
        query_embedding: list[float] | None = None,
        n_results: int = 5,
        topic: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        문자열 query 또는 query_embedding으로
        ChromaDB를 검색한다.

        기존 호출부 호환성을 위해:
        - search(query="...")
        - search(query_embedding=[...])

        두 방식을 모두 지원한다.

        반환값은 rag_node.py가 기대하는
        평탄화된 list[dict] 형태이다.
        """

        # 기존 코드에서 positional argument로
        # embedding vector를 넘기는 경우도 호환
        if (
            query_embedding is None
            and isinstance(query, list)
        ):
            query_embedding = query
            query = None

        # 문자열 query만 들어온 경우
        # 문서 저장 시와 동일한 embedding service 사용
        if query_embedding is None:
            if not isinstance(query, str) or not query.strip():
                raise ValueError(
                    "Either query or query_embedding must be provided."
                )

            embedding_service = (
                get_embedding_service()
            )

            query_embedding = (
                embedding_service.embed_text(
                    query
                )
            )

        where = None

        if topic:
            where = {
                "topic": topic
            }

        query_kwargs: dict[str, Any] = {
            "query_embeddings": [
                query_embedding
            ],
            "n_results": n_results,
            "include": [
                "documents",
                "metadatas",
                "distances",
            ],
        }

        if where is not None:
            query_kwargs["where"] = where

        raw = self.collection.query(
            **query_kwargs
        )

        ids = raw.get(
            "ids",
            [[]],
        )[0]

        documents = raw.get(
            "documents",
            [[]],
        )[0]

        metadatas = raw.get(
            "metadatas",
            [[]],
        )[0]

        distances = raw.get(
            "distances",
            [[]],
        )[0]

        results: list[
            dict[str, Any]
        ] = []

        for (
            chunk_id,
            content,
            metadata,
            distance,
        ) in zip(
            ids,
            documents,
            metadatas,
            distances,
        ):
            flattened_metadata: dict[
                str,
                Any,
            ] = {}

            if isinstance(
                metadata,
                dict,
            ):
                flattened_metadata.update(
                    metadata
                )

            # metadata에 같은 이름의 key가 있더라도
            # 실제 Chroma 검색 결과를 우선하도록
            # 마지막에 덮어쓴다.
            item = {
                **flattened_metadata,
                "id": chunk_id,
                "content": content or "",
                "distance": distance,
            }

            results.append(
                item
            )

        return results

    def add_chunks(
        self,
        chunks: list[dict[str, Any]],
    ) -> None:
        """
        여러 chunk를 batch embedding 후
        Chroma에 한 번에 저장한다.
        """

        if not chunks:
            return

        embedding_service = get_embedding_service()

        contents = [
            chunk["content"]
            for chunk in chunks
        ]

        embeddings = embedding_service.embed_texts(
            contents
        )

        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict[str, Any]] = []

        for chunk in chunks:
            ids.append(
                chunk["chunk_id"]
            )

            documents.append(
                chunk["content"]
            )

            metadata = chunk["metadata"]

            safe_metadata = {
                key: value
                for key, value in metadata.items()
                if value is not None
                and isinstance(
                    value,
                    (
                        str,
                        int,
                        float,
                        bool,
                    ),
                )
            }

            metadatas.append(
                safe_metadata
            )

        self.collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )


rag_vector_store = RAGVectorStore()
