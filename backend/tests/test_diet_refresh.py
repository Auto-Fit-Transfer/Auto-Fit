import asyncio
from contextlib import asynccontextmanager

from backend.app import diet_refresh, main


def test_refresh_includes_profiles_without_completed_onboarding(monkeypatch) -> None:
    settings = main.Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="publishable-test",
        supabase_service_role_key="service-role-test",
        frontend_origin="http://localhost:3000",
    )
    requested_params = []

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"user_id": "complete"}, {"user_id": "incomplete"}]

    class Client:
        async def get(self, url, *, headers, params):
            requested_params.append(params)
            return Response()

    @asynccontextmanager
    async def fake_client_scope():
        yield Client()

    monkeypatch.setattr(diet_refresh, "get_settings", lambda: settings)
    monkeypatch.setattr(diet_refresh, "client_scope", fake_client_scope)

    assert asyncio.run(diet_refresh.fetch_refresh_user_ids()) == ["complete", "incomplete"]
    assert requested_params == [{
        "select": "user_id", "order": "user_id.asc", "limit": "1000", "offset": "0",
    }]
