# Posture analysis release handoff

## Production status (2026-11-10)

The reviewed posture commit `877848e1` and this handoff commit `30d5c3df` were pushed to the existing remote `back-end`. Production Supabase has both posture migration versions `20261109061727` and `20261109070000`; the private `posture-analysis-temp` bucket and service-only RPC permissions were verified directly.

The NCP owner reported deployment of `30d5c3df` at 11:13 KST, installation of `ffmpeg`/`ffprobe` 6.1.1 for the venv service, and a successful authenticated end-to-end test through the public API. The test completed a 13-second squat video, returned a Schema 1.1 result, and left zero temporary Storage objects and cleanup queue rows. The test account was deleted. The owner later reported the API pinned to `64fbc60cf82563be2a9acabc5c934530d8125ebc` at 11:30:30 KST with posture writes and cleanup enabled. These server observations are the owner's report; the local workspace has no SSH access to independently inspect the running service.

The frontend-facing contract is [posture-analysis-api-contract.md](posture-analysis-api-contract.md). Actual-device integration remains for the frontend owner.

## Verified source and local result

- Backend: `back-end` commit `877848e1` (posture analysis only).
- AI contract source: public `ai` branch commit `ebdce8d`, read without changing that branch.
- A 13-second squat video completed through the local API, AI server, Supabase Auth, PostgREST, RPC and private Storage. The Schema 1.1 result contained two repetitions. The temporary video, cleanup queue entry, test user and test jobs were removed.
- The isolated Backend commit passed 1,154 Backend tests. Local Docker image build and `git diff --check` passed.

## Historical production preflight

Before the release, the fixed production FastAPI origin was `https://211-233-206-193.sslip.io/`; Render was not used. On 2026-11-10, its `/health` returned HTTP 200. The pre-release Supabase query found zero posture jobs and showed migration history through `20261109041000`, without the two posture migrations below. The migrations have since been applied, as recorded in the production status above.

```sql
select count(*) as total_jobs,
       count(*) filter (where status in ('awaiting_upload','processing','cleanup_pending')) as active_jobs,
       (select count(*) from (
          select user_id from public.posture_analysis_jobs
          where status in ('awaiting_upload','processing','cleanup_pending')
          group by user_id having count(*) > 1
       ) duplicates) as users_with_duplicate_active_jobs
from public.posture_analysis_jobs;
```

At release time, the zero duplicate-active-job check allowed the partial unique index to be created. A broad `supabase db push` was avoided so the posture release stayed separate from the then-pending exercise-chat migrations.

## Historical release checklist

The steps below record the release sequence followed on 2026-11-10. Steps 1–4 are complete; the frontend handoff in step 5 remains. These are not instructions to reapply migrations or repush commits.

1. Push only the reviewed Backend commit to the existing remote `back-end` branch, without force push or history rewrite. Keep the unrelated uncommitted exercise-chat and food-shot changes out of the release.
2. Apply `20261109061727_posture_analysis_contract_v11.sql` and then `20261109070000_posture_analysis_atomic_result.sql` to the Auto-Fit production database. Confirm both versions in migration history, the private `posture-analysis-temp` bucket, and service-only `expire_stale_posture_upload` and `save_posture_analysis_result` RPC access.
3. Confirm the production AI service exposes the Schema 1.1 posture endpoint and validated capabilities from the reviewed AI source. Deploy the Backend image to the Naver server with `POSTURE_ANALYSIS_WRITE_ENABLED=false` initially.
4. Verify authenticated `/api/posture/capabilities`, then enable `POSTURE_ANALYSIS_WRITE_ENABLED=true` and `POSTURE_ANALYSIS_CLEANUP_ENABLED=true`. Exercise the job creation, multipart `video` upload, job status and result endpoints with an authorized test account. Check that the Storage object and pending cleanup queue are empty after completion. Remove the test account and rows.
5. After the Backend release passes, give the frontend owner the capability profile and four endpoint contracts. Only that owner commits to `front-end`.

For an API rollback, disable writes and leave cleanup enabled until queued videos are removed; restore the previous API image if needed. The two schema migrations are additive and should remain in place during an API rollback.
