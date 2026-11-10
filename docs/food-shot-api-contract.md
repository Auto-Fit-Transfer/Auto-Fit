# FoodShot public API contract

The app calls the NCP FastAPI server at `https://211-233-206-193.sslip.io`. Both endpoints require the user's Supabase access token in `Authorization: Bearer <token>`. The AI server key is kept on the backend.

## Analyze a photo

`POST /api/diet/food-shots/analyze` with `multipart/form-data` and one binary field named `file`. The backend accepts JPEG, PNG, or WebP, up to 10 MiB. The app must convert HEIC before upload. File content determines the type; the supplied filename and MIME do not override it.

The backend sends the image to AI `/food-analysis/analyze` as field `image`. It does not save the photo or analysis result. The response is the AI `FoodAnalysisResponse` with `recognition_source="openai_vision"` and `Cache-Control: no-store`.

## Recalculate confirmed foods

`POST /api/diet/food-shots/recalculate` with JSON:

```json
{
  "items": [
    {"name": "김치볶음밥", "amount_g": 200, "matched_food_code": "official-code"}
  ]
}
```

Send 1–20 items. Each name is 1–100 characters and each `amount_g` is greater than 0 and at most 5000. `matched_food_code` is optional, but send it when the user confirms the food from the previous analysis; remove it if the user changes the food identity. AI performs an exact code lookup when the code is present.

The response has the same shape as analysis, with `recognition_source="user_input"`, `amount_estimated=false`, `confidence=null`, and `Cache-Control: no-store`. The backend does not persist recalculation results.

## Result and errors

The response `status` is `completed`, `partial`, or `unavailable`. The app must show the items for user confirmation. `nutrition_complete=false` means the total excludes at least one item and must not be saved as a completed meal. `requires_user_confirmation` is always `true`. The public API rejects an AI response that violates these invariants with `502`.

Errors use `{"detail":{"code":"..."}}` for these endpoints. Local or AI image size errors return `413 FOOD_SHOT_TOO_LARGE`; unsupported or animated formats return `415 UNSUPPORTED_IMAGE_TYPE`; invalid input returns `422` (`FOOD_SHOT_INPUT_REJECTED` for an AI rejection); AI/server failures return `502`; unavailable AI service or connection timeout returns `503` with `Retry-After`. The usual `401` and shared `429` rate limit responses also apply. Avoid automatic analyze retries because a retry may repeat Vision cost.

Final meal recording and private photo attachment are separate from these transient endpoints. The app must not treat an analysis or recalculation response as a saved meal.
