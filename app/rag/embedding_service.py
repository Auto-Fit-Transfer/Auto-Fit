from openai import OpenAI

from app.core.config import get_settings


class EmbeddingService:
    def __init__(self) -> None:
        settings = get_settings()

        if not settings.openai_api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is not configured."
            )

        self.client = OpenAI(
            api_key=settings.openai_api_key
        )

        self.model = "text-embedding-3-small"

    def embed_text(
        self,
        text: str,
    ) -> list[float]:
        response = self.client.embeddings.create(
            model=self.model,
            input=text,
        )

        return response.data[0].embedding

    def embed_texts(
        self,
        texts: list[str],
    ) -> list[list[float]]:
        """
        여러 chunk를 한 번의 API 호출로 embedding한다.
        """

        if not texts:
            return []

        response = self.client.embeddings.create(
            model=self.model,
            input=texts,
        )

        return [
            item.embedding
            for item in response.data
        ]


_embedding_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    global _embedding_service

    if _embedding_service is None:
        _embedding_service = EmbeddingService()

    return _embedding_service