import asyncio
import json
import httpx
import pytest
from fastapi import HTTPException
from backend.app.chat_rate_limit import ChatRateLimiter


@pytest.mark.parametrize('payload,expected', [
    ({'allowed':True,'retry_after':0},None),
    ({'allowed':False,'retry_after':21},429),
    ({'allowed':'true','retry_after':0},502),
    ({'allowed':False,'retry_after':-1},502),
    ({'allowed':False,'retry_after':True},502),
    ([],502),
])
def test_quota_response(monkeypatch,payload,expected):
    original=httpx.AsyncClient
    def handler(req):
        assert json.loads(req.content)=={'p_user_id':'owner','p_bucket':'answers'}
        return httpx.Response(200,json=payload)
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handler),**kw))
    call=ChatRateLimiter('https://example.supabase.co',{},'owner').check('answers')
    if expected is None:
        asyncio.run(call)
    else:
        with pytest.raises(HTTPException) as err: asyncio.run(call)
        assert err.value.status_code==expected
        if expected==429:
            assert err.value.headers['Retry-After']=='21'
            assert err.value.detail['code']=='RATE_LIMITED'


@pytest.mark.parametrize('mode',['error','timeout','bad_json'])
def test_quota_fails_closed(monkeypatch,mode):
    original=httpx.AsyncClient
    def handler(req):
        if mode=='timeout':raise httpx.ReadTimeout('secret',request=req)
        return httpx.Response(500 if mode=='error' else 200,text='secret')
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handler),**kw))
    with pytest.raises(HTTPException) as err:
        asyncio.run(ChatRateLimiter('https://example.supabase.co',{},'owner').check('answers'))
    assert err.value.status_code==502
    assert 'secret' not in str(err.value.detail)


@pytest.mark.parametrize('path,method,body',[
    ('/api/chats','GET',None),
    ('/api/chats','POST',{}),
    ('/api/chats/00000000-0000-4000-8000-000000000001','PATCH',{'title':'title'}),
    ('/api/chats/00000000-0000-4000-8000-000000000001/messages','GET',None),
    ('/api/chats/00000000-0000-4000-8000-000000000001/messages','POST',{'content':'hi','client_message_id':'00000000-0000-4000-8000-000000000002'}),
    ('/api/chats/answer-preview','POST',{'content':'hi'}),
    ('/api/chats/health-score-preview','POST',{}),
])
def test_all_chat_routes_block_before_work(path,method,body):
    from fastapi.testclient import TestClient
    from backend.app import main
    from backend.tests.test_main import TEST_SETTINGS
    class Denied:
        async def check(self,bucket):
            assert bucket=='requests'
            raise HTTPException(429,detail={'code':'RATE_LIMITED','retry_after':12},headers={'Retry-After':'12'})
    main.app.dependency_overrides[main.get_current_user]=lambda:main.AuthenticatedUser(id='owner')
    main.app.dependency_overrides[main.get_settings]=lambda:TEST_SETTINGS
    main.app.dependency_overrides[main.get_chat_limiter]=lambda:Denied()
    try:
        r=TestClient(main.app).request(method,path,json=body)
        assert r.status_code==429 and r.headers['Retry-After']=='12'
        assert r.json()['detail']['code']=='RATE_LIMITED'
    finally:
        main.app.dependency_overrides.clear()


@pytest.mark.parametrize('replay',[True,False])
def test_completed_replay_skips_answer_quota(monkeypatch,replay):
    from fastapi.testclient import TestClient
    from backend.app import main
    from backend.app.chat_storage import ChatStore
    from backend.tests.test_main import TEST_SETTINGS
    calls=[]
    class Quota:
        async def check(self,bucket): calls.append(bucket)
    async def exchange(self,*args):
        if replay or len(args)==4:return {'is_replay':replay,'assistant_message':{'content':'test'}}
        return None
    async def has_general_ai_answer(self, chat_id):
        return False
    monkeypatch.setattr(ChatStore,'exchange',exchange)
    monkeypatch.setattr(ChatStore,'has_general_ai_answer',has_general_ai_answer)
    main.app.dependency_overrides[main.get_current_user]=lambda:main.AuthenticatedUser(id='owner')
    main.app.dependency_overrides[main.get_settings]=lambda:TEST_SETTINGS
    main.app.dependency_overrides[main.get_chat_limiter]=lambda:Quota()
    try:
        r=TestClient(main.app).post('/api/chats/00000000-0000-4000-8000-000000000001/messages',json={'content':'hi','client_message_id':'00000000-0000-4000-8000-000000000002'})
        assert r.status_code==(200 if replay else 201)
        assert calls==(['requests'] if replay else ['requests','answers'])
    finally:main.app.dependency_overrides.clear()
