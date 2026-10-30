import asyncio
from unittest.mock import AsyncMock

import pytest

from backend.app import chat_answers
from backend.app.chat_intents import is_off_topic_question
from backend.app.chat_storage import ChatStore


async def forbidden(*args):
    pytest.fail('unexpected private database lookup')


@pytest.mark.parametrize('question', ['프랑스 수도가 어디야?', '파이썬이 뭐야?', '오늘 날씨 알려줘'])
def test_unrelated_questions_are_off_topic(question):
    assert is_off_topic_question(question)


@pytest.mark.parametrize('question', ['이번 주 운동 기록 알려줘', '오늘 식사 내역', '최근 건강 점수', '내 체중 알려줘'])
def test_service_questions_are_not_off_topic(question):
    assert not is_off_topic_question(question)


def test_first_off_topic_question_gets_answer_and_gentle_notice(monkeypatch):
    model = AsyncMock(return_value='파리는 프랑스의 수도입니다.')
    monkeypatch.setattr(chat_answers, 'general_information', model)
    result = asyncio.run(chat_answers.answer_question(
        '프랑스 수도가 어디야?', forbidden, forbidden, None, True
    ))
    assert result['response_source'] == 'general_ai'
    assert '파리는' in result['content']
    assert '이번에는 간단히 도와드렸어요' in result['content']
    assert '다음부터는' in result['content']
    assert result['evidence'] == []
    model.assert_awaited_once_with('프랑스 수도가 어디야?')


def test_later_off_topic_question_is_not_sent_to_ai(monkeypatch):
    model = AsyncMock(side_effect=AssertionError('must not call AI'))
    monkeypatch.setattr(chat_answers, 'general_information', model)
    result = asyncio.run(chat_answers.answer_question(
        '다른 일반 질문', forbidden, forbidden, None, False
    ))
    assert result['response_source'] == 'need_more_data'
    assert result['required_data'] == ['autofit_topic_question']
    assert '기꺼이 도와드릴게요' in result['content']
    model.assert_not_awaited()


def test_failed_first_general_answer_does_not_claim_it_answered(monkeypatch):
    monkeypatch.setattr(chat_answers, 'general_information', AsyncMock(return_value=None))
    result = asyncio.run(chat_answers.answer_question(
        '일반 질문', forbidden, forbidden, None, True
    ))
    assert result['response_source'] == 'need_more_data'
    assert '답변을 준비하지 못했어요' in result['content']


def test_general_answer_marker_is_owner_and_chat_scoped(monkeypatch):
    calls = []
    async def request(self, method, path, **kwargs):
        calls.append((method, path, kwargs.get('params')))
        if path == 'chats':
            return [{'chat_id': 'chat'}]
        return [{'message_id': 'answer'}]
    monkeypatch.setattr(ChatStore, 'request', request)
    found = asyncio.run(ChatStore('url', {}, 'owner').has_general_ai_answer('chat'))
    assert found
    params = calls[1][2]
    assert params['user_id'] == 'eq.owner'
    assert params['chat_id'] == 'eq.chat'
    assert params['sender_type'] == 'eq.assistant'
    assert params['intent'] == 'eq.general_information'
    assert params['response_source'] == 'eq.general_ai'
