# 모바일 냉장고 맞춤 식단 생성 테스트

공용 개발 서버의 `/test/diet-generation`에 모바일 브라우저로 접속한다.

1. 프론트엔드 담당자 계정으로 로그인한다.
2. `냉장고 맞춤 식단 새로 만들기`를 누른다.
3. 완료 시간, DB 저장 완료, 아침·점심·저녁·간식 결과를 확인한다.

테스트 화면은 인증된 사용자만 아래 API를 호출한다.

```http
POST /api/diet/recommendations/generate
Authorization: Bearer <access-token>
Content-Type: application/json

{}
```

이 API는 사용자 냉장고 재료, 알레르기, 음식 카탈로그를 반영해 새 식단을 생성한다.
같은 날짜의 기존 활성 식단은 취소되고 새 결과가 운영 식단으로 저장된다.
`POST /api/diet/recommendations/generate-preview`는 별도의 비저장 검증 API로 유지하지만
이 화면에서는 사용하지 않는다.
