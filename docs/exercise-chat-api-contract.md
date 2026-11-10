# Exercise chat actions for the app

The app uses the production FastAPI origin `https://211-233-206-193.sslip.io` and the existing user `Authorization: Bearer <Supabase access token>` header. These endpoints become available only after the exercise-chat DB migrations and backend deployment.

## Ask or describe a symptom

Use the existing `POST /api/chats/{chat_id}/messages` with a stable `client_message_id` UUID and the user's `content`. The response keeps the existing `chat`, `user_message`, `assistant_message`, and `is_replay` fields. The assistant message now also carries `action`, `action_status`, `requires_backend_apply`, `action_data`, and `pending_action_id`.

When `action="confirm_exercise_adjustment"` and `action_status="awaiting_confirmation"`, show a confirm/cancel card. Keep the opaque `pending_action_id` for the two endpoints below. Do not infer an action from the message text or apply exercise changes on the device before confirmation. A repeated message with the same `client_message_id` returns the same card rather than creating another pending action.

For an explicit high-risk symptom (`아파요`, `어지러워요`, `숨쉬기 힘들어요`), the backend records a stop event and attempts to stop the active dated exercise session without a confirmation card. It returns `action="exercise_session_stop"`; `action_data.backend_event_recorded` and `action_data.backend_apply_status` report what actually persisted. If the session cannot be stopped, show the safety guidance without offering resume or replacement exercise.

## Confirm or cancel

```http
POST /api/chats/{chat_id}/pending-actions/{pending_action_id}/confirm
Content-Type: application/json

{"idempotency_key":"<stable UUID for this button press>"}
```

Use the same URL and body with `/cancel` for cancellation. Reuse the same key on network retry; a different key is a new decision and cannot consume an already resolved card. Responses include the saved chat exchange, `adjusted_items`, and the current `exercise_session` with `session` and `items`. A successful confirmation changes only the active dated session's remaining exercise items. Cancel leaves the session unchanged.

An expired, consumed, or stale card returns `409`. `SESSION_VERSION_CONFLICT` includes `latest_session`; refresh the card or session from that value rather than replaying the stale approval. A card is valid for 10 minutes. Keep a pending card visible until a confirm/cancel response is received; avoid treating a local button tap as a server success.

The backend stores an idempotent stop event separately from the session update so a failed session update does not erase the safety report. The iPhone/Android app's existing in-session high-risk stop flow remains separate from this chat flow.
