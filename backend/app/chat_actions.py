"""One-confirmation record edits using server-stored chat evidence."""

import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID


CONFIRM_WORDS = {"확인", "확인해줘", "네 확인", "네, 확인"}
CANCEL_WORDS = {"취소", "아니", "아니요"}
MAX_PROPOSAL_AGE = timedelta(minutes=10)


def _answer(content: str, *, intent: str, evidence: list[dict],
            required_data: list[str] | None = None) -> dict:
    required = required_data or []
    return {"intent": intent, "content": content,
            "response_source": "need_more_data" if required else "database",
            "needs_more_data": bool(required), "evidence": evidence,
            "required_data": required}


def _evidence(message: dict | None, kind: str) -> list[dict]:
    return [row for row in (message or {}).get("evidence", [])
            if isinstance(row, dict) and row.get("type") == kind]


def _record_ref(content: str, message: dict | None) -> dict | None:
    match = re.search(r"(?<!\d)(\d+)\s*번", content)
    if match is None:
        return None
    ordinal = int(match.group(1))
    for row in _evidence(message, "record_ref"):
        if row.get("ordinal") == ordinal and row.get("kind") in {
            "food_inventory", "health_documents"
        }:
            try:
                UUID(str(row.get("id")))
            except (TypeError, ValueError):
                return None
            return row
    return None


def propose_record_action(content: str, last_assistant: dict | None) -> dict | None:
    ref = _record_ref(content, last_assistant)
    if ref is None:
        if re.search(r"(?<!\d)\d+\s*번", content) and any(
            word in content for word in ("삭제", "수정", "변경", "바꿔")
        ):
            return _answer("대상 기록을 확인할 수 없습니다. 먼저 냉장고 재료 또는 건강 문서 목록을 조회해 주세요.",
                           intent="record_action_selection", evidence=[], required_data=["record_selection"])
        return None
    kind, label = ref["kind"], str(ref.get("label") or "기록")[:100]
    if "삭제" in content:
        operation, quantity = "delete", None
        if kind == "health_documents":
            impact = "원본 파일과 연결된 검진·체성분 및 파생 분석 데이터도 함께 삭제됩니다. 복구할 수 없습니다."
        else:
            impact = "보유 식재료 목록에서 제거됩니다."
        prompt = f"{label}({ref['ordinal']}번)을 삭제할까요? {impact} 진행하려면 ‘확인’, 그만두려면 ‘취소’를 보내주세요."
    elif kind == "food_inventory" and any(word in content for word in ("수정", "변경", "바꿔")):
        match = re.search(r"(?:수량|개수)\s*(?:을|를|은|이)?\s*(\d+(?:\.\d+)?)", content)
        if match is None:
            return _answer("바꿀 수량을 숫자로 알려주세요. 예: 1번 수량 3으로 수정해줘.",
                           intent="record_action_details", evidence=[], required_data=["quantity"])
        try:
            amount = Decimal(match.group(1))
        except InvalidOperation:
            return None
        if amount < 0 or amount > 100000:
            return _answer("수량은 0~100000 사이로 알려주세요.", intent="record_action_details",
                           evidence=[], required_data=["quantity"])
        operation, quantity = "update_quantity", str(amount)
        prompt = f"{label}({ref['ordinal']}번)의 수량을 {quantity}로 바꿀까요? 진행하려면 ‘확인’, 그만두려면 ‘취소’를 보내주세요."
    else:
        return None
    proposal = {"type": "action_confirmation", "kind": kind,
                "id": str(ref["id"]), "label": label, "operation": operation}
    if quantity is not None:
        proposal["quantity"] = quantity
    return _answer(prompt, intent="record_action_confirmation",
                   evidence=[proposal], required_data=["confirmation"])


def validated_proposal(message: dict | None, now: datetime | None = None) -> dict | None:
    proposals = _evidence(message, "action_confirmation")
    if len(proposals) != 1:
        return None
    proposal = proposals[0]
    try:
        created_at = datetime.fromisoformat(message["created_at"].replace("Z", "+00:00"))
        if created_at.tzinfo is None:
            return None
        age = (now or datetime.now(UTC)) - created_at
        if age < timedelta(0) or age > MAX_PROPOSAL_AGE:
            return None
        UUID(str(proposal["id"]))
        if (proposal.get("kind"), proposal.get("operation")) not in {
            ("food_inventory", "delete"), ("food_inventory", "update_quantity"),
            ("health_documents", "delete"),
        }:
            return None
        if proposal["operation"] == "update_quantity":
            amount = Decimal(str(proposal["quantity"]))
            if not amount.is_finite() or not 0 <= amount <= 100000:
                return None
    except (KeyError, TypeError, ValueError, InvalidOperation):
        return None
    return proposal


async def answer_record_action(content: str, last_assistant: dict | None,
                               execute) -> dict | None:
    normalized = " ".join(content.strip().split())
    proposal = validated_proposal(last_assistant)
    if normalized in CANCEL_WORDS and proposal:
        return _answer("취소했습니다. 기록은 변경하지 않았어요.",
                       intent="record_action_cancelled", evidence=[])
    if normalized in CONFIRM_WORDS:
        if proposal is None:
            return _answer("확인할 변경 요청이 없거나 확인 시간이 지났습니다. 기록을 다시 조회해 주세요.",
                           intent="record_action_expired", evidence=[], required_data=["record_selection"])
        if not await execute(proposal):
            return _answer("기록이 이미 변경되었거나 삭제되었습니다. 목록을 다시 조회해 주세요.",
                           intent="record_action_stale", evidence=[], required_data=["record_selection"])
        verb = "삭제했습니다" if proposal["operation"] == "delete" else "수량을 변경했습니다"
        route = "/diet" if proposal["kind"] == "food_inventory" else "/health-data-management"
        return _answer(f"{proposal['label']} 기록을 {verb}.", intent="record_action_completed",
                       evidence=[{"type": "navigation", "route": route, "label": "변경 결과 확인"}])
    return propose_record_action(content, last_assistant)
