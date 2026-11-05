"""
업로드 파일 → OCR 에 보낼 페이지 이미지(JPEG 바이트) 목록.

지원: JPEG, PNG, HEIC/HEIF(아이폰 사진), PDF(여러 페이지)
  · 폰 사진은 EXIF 회전 정보대로 똑바로 세운다 (안 하면 옆으로 누운 채로 읽힘)
  · 너무 큰 사진은 긴 변 3000px 로 줄인다 (A4 한 장에 충분, 전송 시간 단축)
  · PDF 는 페이지마다 200dpi 이미지로 바꾼다. 최대 MAX_PDF_PAGES 쪽까지만 읽는다.
파일은 메모리에서만 다루고 디스크에 저장하지 않는다.
"""

import io
from typing import List, Tuple

from PIL import Image, ImageOps

MAX_UPLOAD_MB = 20
MAX_PDF_PAGES = 5
MAX_SIDE = 3000
PDF_DPI = 200


class FileProblem(Exception):
    def __init__(self, code: str, status: int, message: str):
        super().__init__(message)
        self.code, self.status, self.message = code, status, message


def sniff(data: bytes) -> str:
    """확장자 대신 파일 내용 앞부분으로 형식을 판단한다."""
    head = data[:16]
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"\x89PNG"):
        return "png"
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"):
        return "heic"
    return "unknown"


def _to_jpeg(image: Image.Image) -> bytes:
    image = ImageOps.exif_transpose(image).convert("RGB")
    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=92)
    return out.getvalue()


def to_pages(data: bytes) -> Tuple[str, List[bytes], int]:
    """(파일형식, 페이지 JPEG 목록, 전체 페이지 수)"""
    if not data:
        raise FileProblem("EMPTY_FILE", 400, "빈 파일입니다.")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise FileProblem("FILE_TOO_LARGE", 413, f"파일은 {MAX_UPLOAD_MB}MB 이하만 받습니다.")

    kind = sniff(data)
    try:
        if kind in ("jpeg", "png"):
            return kind, [_to_jpeg(Image.open(io.BytesIO(data)))], 1

        if kind == "heic":
            import pillow_heif

            pillow_heif.register_heif_opener()
            return kind, [_to_jpeg(Image.open(io.BytesIO(data)))], 1

        if kind == "pdf":
            import pypdfium2 as pdfium

            pdf = pdfium.PdfDocument(data)
            total = len(pdf)
            if total == 0:
                raise FileProblem("EMPTY_FILE", 400, "페이지가 없는 PDF 입니다.")
            pages = []
            for i in range(min(total, MAX_PDF_PAGES)):
                bitmap = pdf[i].render(scale=PDF_DPI / 72)
                pages.append(_to_jpeg(bitmap.to_pil()))
            pdf.close()
            return kind, pages, total
    except FileProblem:
        raise
    except Exception as exc:
        raise FileProblem("CORRUPTED_FILE", 400, f"파일을 열 수 없습니다(손상 또는 암호 PDF): {type(exc).__name__}")

    raise FileProblem("UNSUPPORTED_FILE_TYPE", 415, "지원 형식은 JPEG, PNG, HEIC, PDF 입니다.")
