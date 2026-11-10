# Exercise chat and FoodShot release handoff

## Production status (2026-11-10)

The production FastAPI origin remains `https://211-233-206-193.sslip.io`. The existing remote `back-end` and local worktree are at `64fbc60cf82563be2a9acabc5c934530d8125ebc`. The NCP owner reported that this exact commit was pinned and running at 11:30:30 KST, with FoodShot and pending-action routes visible in OpenAPI. The owner also confirmed that the production AI service runs `ebdce8d5b0f132c8335ef086a6ecf3bbb4a25f9b` and exposes the three endpoints listed below. These server observations are the owner's report; this workspace cannot inspect the running service over SSH.

Read-only production Supabase checks confirmed all six exercise-chat migration versions. The public OpenAPI was independently checked and exposed 141 paths and 178 operations, including the FoodShot and pending-action routes. Do not run a broad `supabase db push` for this release.

After explicit user approval and a fresh preflight (zero expired chat messages, pending actions, weekly plans and related recipes; 13 expired rate-limit events), cleanup cron jobs 1–3 were reactivated without changing their commands or five-minute schedules. Their first run at 11:45 KST succeeded for all three jobs. Job 2 deleted 15 expired rate-limit events; two more became eligible between preflight and execution. Jobs 1 and 3 returned successfully. Their active state was checked immediately after reactivation.

A dedicated production test account completed `POST /api/diet/food-shots/analyze` and `/recalculate` with HTTP 200. Both results were valid `partial` responses with one item, `requires_user_confirmation=true` and `Cache-Control: no-store`; the recalculation reported `recognition_source="user_input"`. The account's exercise preferences and recommendation context were created, but recommendation generation returned `403 EXERCISE_AI_NOT_ENABLED`. Therefore adjustment confirm/cancel and high-risk stop remain **unverified in production**. The test account was deleted through `DELETE /api/account` (204), and Auth user, profile, context, chat and session row counts were verified as zero. A designated test account needs exercise AI access on the NCP server before the remaining chat tests can run.

The iPhone TestFlight build `Auto-Fit Test 1.0.0 (52)` was built from the official read-only `front-end` commit `6d0ae22301ab778ca1fb88be9b8689eb2017734f`. Apple accepted it for internal beta testing. Physical-device verification of the high-risk exercise stop is still pending.

## Database and API release checklist

1. Confirm the posture release has been pushed/deployed and its two migrations `20261109061727` and `20261109070000` are in production history. Do not include posture work in this release by accident.
2. Confirm the production AI service supports the official `ai` contract at `ebdce8d`: `/chat/orchestrate`, `/food-analysis/analyze`, and `/food-analysis/recalculate`. The backend does not expose the AI key to the app.
3. Apply exactly these exercise-chat migrations in order, recording each version: `20261109042535_exercise_chat_session_safety.sql`, `20261109042659_exercise_chat_event_and_pending_storage.sql`, `20261109042801_exercise_chat_message_actions.sql`, `20261109042841_exercise_chat_action_transactions.sql`, `20261109042905_exercise_chat_proposal_exchange.sql`, `20261110014003_exercise_chat_pending_retention.sql`. The FoodShot proxy has no new database schema.
4. Verify service-only RPC grants, RLS on `exercise_chat_pending_actions`, and the 30-day retention wrapper. The three cleanup cron jobs must remain inactive until the API switch and an updated deletion-count preflight.
5. Push the reviewed backend commit to the existing remote `back-end` without a force push, then ask the NCP owner to pin that full hash. DB migrations must precede the pin switch; the new API reads action columns and calls new RPCs.
6. Verify `/health`, authenticated chat message/confirm/cancel, a direct high-risk symptom stop, and authenticated FoodShot analyze/recalculate. Use a designated test account and avoid a real user's meal/exercise records. Confirm that an AI failure does not erase a stop event, other exercise dates remain unchanged, and an analysis result is not persisted as a meal.
7. Recheck cleanup jobs 1–3, pending deletion counts, and recent run errors. Under the user's conditional approval, re-enable them and confirm one successful run. This was completed at 11:45 KST as recorded above; do not repeat the reactivation.

If a backend health or endpoint check fails after the switch, restore the previous pinned API commit and preserve the additive database migrations. Do not run DB restore or broad recovery SQL without diagnosing the symptom. Keep the cleanup jobs inactive until the cause is understood.

## Verification already completed locally

The combined worktree passed 1,188 backend tests, 24 isolated exercise-chat SQL checks, the dated discomfort SQL regression, 13 chat-storage SQL checks, and `git diff --check`. SQL tests did not exercise multi-connection concurrency or the production AI service. The FoodShot app routes and error contract are described in [food-shot-api-contract.md](food-shot-api-contract.md); chat card and stop behavior are in [exercise-chat-api-contract.md](exercise-chat-api-contract.md).
