"""Public exercise-type lookup, separate from private recommendation records."""
import httpx
from backend.app.chat_model import exercise_information
from backend.app.chat_storage import fail
from backend.app.http_client import client_scope

TOPICS = {
    '하체': ('하체', '스쿼트', '런지', '레그', '카프'),
    '상체': ('상체', '푸시업', '풀업', '벤치', '로우'),
    '코어': ('코어', '복근', '플랭크', '크런치'),
    '유산소': ('유산소', '걷기', '달리기', '자전거', '수영'),
}


def information_topic(content):
    text = ''.join(content.casefold().split())
    if '운동' not in text or not any(w in text for w in ('종류', '무슨운동', '어떤운동')):
        return None
    if any(w in text for w in ('기록', '했어', '했던', '한운동', '삭제', '수정', '저장', '다른사람', '다른사용자', '건강점수', '식단', '식사', '열량', '칼로리', '중량', '세트', '루틴')):
        return None
    topics = [k for k in TOPICS if k in text or (k == '코어' and '복근' in text)]
    return topics[0] if len(topics) == 1 else ('전신' if '전신' in text and not topics else None)


def needs_safety_guidance(content):
    text = ''.join(content.split())
    return any(w in text for w in ('통증', '아프', '아픈', '아파', '부상', '수술', '재활', '질환', '질병', '디스크', '임신', '어지', '호흡곤란', '가슴통', '당뇨', '고혈압', '관절염'))


async def load_exercise_types(url, headers):
    try:
        async with client_scope() as client:
            r = await client.get(url+'/rest/v1/exercise_types', headers=headers,
                params={'select':'name,category', 'is_active':'eq.true', 'order':'name.asc,exercise_type_id.asc', 'limit':'101'})
    except httpx.HTTPError:
        fail('DATA_SOURCE_ERROR')
    if r.status_code != 200:
        fail('DATA_SOURCE_ERROR')
    try:
        rows = r.json()
    except ValueError:
        fail('DATA_SOURCE_ERROR')
    if not isinstance(rows, list) or len(rows) > 100 or any(
        not isinstance(x, dict) or not isinstance(x.get('name'), str)
        or not 1 <= len(x['name']) <= 100 or not isinstance(x.get('category'), (str, type(None))) for x in rows
    ):
        fail('DATA_SOURCE_ERROR')
    return rows


async def answer_exercise_information(topic, loader):
    rows = await loader()  # DB errors must not be mistaken for an empty catalogue.
    words = TOPICS.get(topic)
    matches = [r['name'] for r in rows if words is None or any(w in r['name']+' '+(r['category'] or '') for w in words)]
    answer = {'intent':'exercise_information', 'content':'', 'response_source':'database',
              'needs_more_data':False, 'evidence':[], 'required_data':[]}
    if matches:
        answer['content'] = '공용 운동 목록에서 찾은 '+topic+' 운동 종류입니다.\n'+ '\n'.join('- '+name for name in dict.fromkeys(matches[:5])) + '\n일반적인 종류 안내이며 개인 맞춤 추천은 아닙니다.'
        return answer
    explanation = await exercise_information(topic)
    if explanation is not None:
        return {**answer, 'response_source':'general_ai', 'content':'공용 DB에 해당 운동 항목이 없어 AI의 일반 정보를 안내합니다. 개인 맞춤 추천은 아닙니다.\n'+explanation}
    return {**answer, 'response_source':'need_more_data', 'needs_more_data':True,
            'content':'공용 DB에 해당 운동 항목이 없고 현재 AI 안내를 제공할 수 없습니다. 잠시 후 다시 시도해 주세요.',
            'required_data':['exercise_catalog_or_ai']}
