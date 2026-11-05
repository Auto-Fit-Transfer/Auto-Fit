"""Service-role persistence with explicit ownership and opaque keyset cursors."""

import base64
import json
from datetime import datetime
from uuid import UUID

import httpx
from fastapi import HTTPException

from backend.app.http_client import client_scope

CHAT_FIELDS = "chat_id,title,status,created_at,updated_at"
MESSAGE_FIELDS = "message_id,chat_id,sender_type,content,intent,response_source,needs_more_data,evidence,required_data,created_at"


def fail(code, status_code=502):
    messages = {
        "CHAT_NOT_FOUND": "채팅방을 찾을 수 없습니다.",
        "CHAT_ARCHIVED": "보관된 채팅방에는 새 메시지를 보낼 수 없습니다.",
        "IDEMPOTENCY_CONFLICT": "같은 요청 ID가 다른 질문에 사용되었습니다.",
        "VALIDATION_ERROR": "입력값을 확인해 주세요.",
    }
    raise HTTPException(status_code, detail={
        "code": code, "message": messages.get(code, "채팅 데이터를 처리하지 못했습니다."), "fields": None,
    })


def project(row, fields):
    return {key: row.get(key) for key in fields.split(",")}


def encode_cursor(row, time_key, id_key, scope):
    data = [scope, row[time_key], row[id_key]]
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def cursor_filter(cursor, time_key, id_key, scope):
    if not cursor:
        return {}
    try:
        if len(cursor) > 1000:
            raise ValueError()
        saved_scope, timestamp, row_id = json.loads(base64.b64decode(cursor, altchars=b'-_', validate=True))
        if saved_scope != scope:
            raise ValueError()
        dt = datetime.fromisoformat(timestamp)
        if dt.tzinfo is None:
            raise ValueError()
        # Re-serialize typed values before constructing PostgREST filter syntax.
        timestamp, row_id = dt.isoformat(), str(UUID(row_id))
    except (ValueError, TypeError, UnicodeError):
        fail("VALIDATION_ERROR", 422)
    return {"or": f"({time_key}.lt.{timestamp},and({time_key}.eq.{timestamp},{id_key}.lt.{row_id}))"}


class ChatStore:
    def __init__(self, url, headers, user_id):
        self.url, self.headers, self.user_id = url, headers, user_id

    async def request(self, method, path, *, params=None, body=None):
        try:
            async with client_scope() as client:
                response = await client.request(
                    method, f"{self.url}/rest/v1/{path}",
                    headers={**self.headers, "Prefer": "return=representation"},
                    params=params, json=body,
                )
            if response.is_error:
                payload = response.json()
                code = payload.get("message") if isinstance(payload, dict) else None
                if code in {"CHAT_NOT_FOUND", "CHAT_ARCHIVED", "IDEMPOTENCY_CONFLICT"}:
                    fail(code, 404 if code == "CHAT_NOT_FOUND" else 409)
                fail("DATA_SOURCE_ERROR")
            payload = response.json()
            if path.startswith("rpc/"):
                if payload is not None and (
                    not isinstance(payload, dict)
                    or not isinstance(payload.get("is_replay"), bool)
                    or any(not isinstance(payload.get(key), dict) for key in ("chat", "user_message", "assistant_message"))
                ):
                    fail("DATA_SOURCE_ERROR")
            elif not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
                fail("DATA_SOURCE_ERROR")
            return payload
        except (httpx.HTTPError, ValueError):
            fail("DATA_SOURCE_ERROR")

    async def get(self, chat_id):
        rows = await self.request("GET", "chats", params={
            "select": CHAT_FIELDS, "user_id": f"eq.{self.user_id}", "chat_id": f"eq.{chat_id}", "limit": "1",
        })
        if not rows:
            fail("CHAT_NOT_FOUND", 404)
        return rows[0]

    async def create(self, title):
        rows = await self.request("POST", "chats", body={"user_id": self.user_id, "title": title})
        if not rows:
            fail("DATA_SOURCE_ERROR")
        return {"chat": project(rows[0], CHAT_FIELDS)}

    async def update(self, chat_id, updates):
        rows = await self.request("PATCH", "chats", params={
            "user_id": f"eq.{self.user_id}", "chat_id": f"eq.{chat_id}",
        }, body=updates)
        if not rows:
            fail("CHAT_NOT_FOUND", 404)
        return {"chat": project(rows[0], CHAT_FIELDS)}

    async def list_chats(self, chat_status, limit, cursor):
        scope = f"chats:{self.user_id}:{chat_status}"
        params = {
            "select": CHAT_FIELDS, "user_id": f"eq.{self.user_id}",
            "order": "updated_at.desc,chat_id.desc", "limit": str(limit + 1),
            **cursor_filter(cursor, "updated_at", "chat_id", scope),
        }
        if chat_status:
            params["status"] = f"eq.{chat_status}"
        rows = await self.request("GET", "chats", params=params)
        more, page = len(rows) > limit, rows[:limit]
        return {"chats": page, "has_more": more, "next_cursor":
                encode_cursor(page[-1], "updated_at", "chat_id", scope) if more else None}

    async def messages(self, chat_id, limit, before):
        await self.get(chat_id)
        scope = f"messages:{self.user_id}:{chat_id}"
        rows = await self.request("GET", "chat_messages", params={
            "select": MESSAGE_FIELDS, "user_id": f"eq.{self.user_id}", "chat_id": f"eq.{chat_id}",
            "order": "created_at.desc,message_id.desc", "limit": str(limit + 1),
            **cursor_filter(before, "created_at", "message_id", scope),
        })
        more, page = len(rows) > limit, rows[:limit]
        return {"chat_id": str(chat_id), "messages": list(reversed(page)), "has_more": more,
                "next_cursor": encode_cursor(page[-1], "created_at", "message_id", scope) if more else None}

    async def has_general_ai_answer(self, chat_id):
        await self.get(chat_id)
        rows = await self.request("GET", "chat_messages", params={
            "select": "message_id", "user_id": f"eq.{self.user_id}",
            "chat_id": f"eq.{chat_id}", "sender_type": "eq.assistant",
            "intent": "eq.general_information", "response_source": "eq.general_ai",
            "limit": "1",
        })
        return bool(rows)

    async def exchange(self, chat_id, client_message_id, content, answer=None):
        result = await self.request("POST", "rpc/save_chat_exchange", body={
            "p_user_id": self.user_id, "p_chat_id": str(chat_id),
            "p_client_message_id": str(client_message_id), "p_content": content, "p_answer": answer,
        })
        if result is None:
            return None
        return {"is_replay": result["is_replay"], "chat": project(result["chat"], CHAT_FIELDS),
                "user_message": project(result["user_message"], MESSAGE_FIELDS),
                "assistant_message": project(result["assistant_message"], MESSAGE_FIELDS)}
