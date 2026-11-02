import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from backend.app.chat_actions import answer_record_action, validated_proposal
from backend.app.chat_service import match_service_query, service_answer


def _listed_record(kind: str):
    record_id = str(uuid4())
    if kind == "food_inventory":
        query = match_service_query("내 냉장고 재료")
        payload = {"inventory": [{"user_food_inventory_id": record_id,
                                  "custom_name": "사과", "quantity": 2}]}
    else:
        query = match_service_query("업로드한 건강 문서")
        payload = {"items": [{"uploaded_file_id": record_id,
                              "original_file_name": "검진표.pdf"}]}
    return record_id, service_answer(query, payload)


def test_inventory_quantity_change_requires_confirmation():
    record_id, listed = _listed_record("food_inventory")
    calls = []

    async def execute(proposal):
        calls.append(proposal)
        return True

    staged = asyncio.run(answer_record_action("1번 수량을 3으로 수정해줘", listed, execute))
    assert staged["required_data"] == ["confirmation"]
    assert calls == []
    proposal = staged["evidence"][0]
    assert proposal["id"] == record_id
    assert proposal["operation"] == "update_quantity"
    assert proposal["quantity"] == "3"
    previous = {**staged, "created_at": datetime.now(UTC).isoformat()}
    result = asyncio.run(answer_record_action("확인", previous, execute))
    assert result["intent"] == "record_action_completed"
    assert len(calls) == 1 and calls[0]["id"] == record_id


def test_health_document_delete_warns_about_cascading_data_and_can_cancel():
    _, listed = _listed_record("health_documents")

    async def forbidden(*args):
        raise AssertionError("must not execute")

    staged = asyncio.run(answer_record_action("1번 삭제해줘", listed, forbidden))
    assert "검진·체성분 및 파생 분석 데이터" in staged["content"]
    previous = {**staged, "created_at": datetime.now(UTC).isoformat()}
    cancelled = asyncio.run(answer_record_action("취소", previous, forbidden))
    assert cancelled["intent"] == "record_action_cancelled"


def test_expired_or_malformed_proposal_cannot_execute():
    _, listed = _listed_record("food_inventory")

    async def forbidden(*args):
        raise AssertionError("must not execute")

    staged = asyncio.run(answer_record_action("1번 삭제해줘", listed, forbidden))
    expired = {**staged, "created_at": (datetime.now(UTC) - timedelta(minutes=11)).isoformat()}
    assert validated_proposal(expired) is None
    answer = asyncio.run(answer_record_action("확인", expired, forbidden))
    assert answer["intent"] == "record_action_expired"
    forged = {**staged, "created_at": datetime.now(UTC).isoformat(),
              "evidence": [{**staged["evidence"][0], "id": "not-a-uuid"}]}
    assert validated_proposal(forged) is None


def test_record_change_without_list_cannot_target_user_data():
    async def forbidden(*args):
        raise AssertionError("must not execute")

    answer = asyncio.run(answer_record_action("1번 삭제해줘", None, forbidden))
    assert answer["intent"] == "record_action_selection"
    answer = asyncio.run(answer_record_action("6번 삭제해줘", None, forbidden))
    assert answer["intent"] == "record_action_selection"
