import asyncio
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from backend.app import chat_exercise_info as info
from backend.app.chat_answers import answer_question

async def forbidden(*args):
    pytest.fail('unexpected private data access')

@pytest.mark.parametrize('q', ['하체 운동을 하고 싶다. 종류 알려줘', '상체 운동 종류 알려줘', '코어 운동 종류', '유산소 운동 종류', '전신 운동 종류'])
def test_types_routing(q):
    assert info.information_topic(q)

@pytest.mark.parametrize('q', ['오늘 운동 추천해줘', '이번 주 운동 기록 종류', '하체 운동 종류와 건강 점수', '하체 운동 세트와 종류', '상체 하체 운동 종류', '어깨 운동 종류'])
def test_not_overbroad(q):
    assert info.information_topic(q) is None

def test_database_first(monkeypatch):
    model=AsyncMock(side_effect=AssertionError('no AI needed'))
    monkeypatch.setattr(info,'exercise_information',model)
    catalog=AsyncMock(return_value=[{'name':'스쿼트','category':'근력'},{'name':'걷기','category':'유산소'}])
    answer=asyncio.run(answer_question('하체 운동을 하고 싶다. 종류 알려줘',forbidden,forbidden,catalog))
    assert answer['response_source']=='database'
    assert '스쿼트' in answer['content'] and '걷기' not in answer['content']
    catalog.assert_awaited_once()
    model.assert_not_awaited()

@pytest.mark.parametrize('response,source', [('스쿼트, 런지','general_ai'),(None,'need_more_data')])
def test_empty_catalog_model_and_outage(monkeypatch,response,source):
    model=AsyncMock(return_value=response)
    monkeypatch.setattr(info,'exercise_information',model)
    answer=asyncio.run(answer_question('하체 운동 종류 알려줘',forbidden,forbidden,AsyncMock(return_value=[])))
    assert answer['response_source']==source
    model.assert_awaited_once_with('하체')
    assert answer['evidence']==[]

@pytest.mark.parametrize('q',['무릎 통증이 있는데 하체 운동 종류 알려줘','디스크 재활 하체 운동 종류','임신 중 하체 운동 종류'])
def test_safety_before_db_or_model(q):
    answer=asyncio.run(answer_question(q,forbidden,forbidden,forbidden))
    assert answer['response_source']=='need_more_data'
    assert answer['required_data']==['professional_exercise_guidance']

def test_db_error_not_empty_fallback(monkeypatch):
    model=AsyncMock()
    monkeypatch.setattr(info,'exercise_information',model)
    with pytest.raises(HTTPException):
        asyncio.run(answer_question('하체 운동 종류',forbidden,forbidden,AsyncMock(side_effect=HTTPException(502))))
    model.assert_not_awaited()
