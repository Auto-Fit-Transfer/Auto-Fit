"""The OCR container's image stack must convert accepted uploads to JPEG pages."""

from io import BytesIO

from PIL import Image

from server.files import to_pages


def test_png_upload_converts_to_one_jpeg_page() -> None:
    source = BytesIO()
    Image.new("RGB", (4, 4), "white").save(source, format="PNG")

    kind, pages, page_count = to_pages(source.getvalue())

    assert kind == "png"
    assert page_count == 1
    assert len(pages) == 1
    assert pages[0].startswith(b"\xff\xd8\xff")
