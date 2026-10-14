from backend.app.main import app


def test_every_operation_has_one_documented_feature_group():
    schema = app.openapi()
    groups = {tag["name"] for tag in schema["tags"]}
    assert groups == {"Profile", "health-documents", "Health Analysis", "Exercise", "Diet", "Chat", "Community", "System"}
    for path, methods in schema["paths"].items():
        expected = (
            "Exercise" if path.startswith("/api/exercise/") else
            "Diet" if path.startswith("/api/diet/") else
            "Chat" if path.startswith("/api/chats") else
            "Community" if path.startswith("/api/community/") else
            "health-documents" if path.startswith("/api/health-documents") else
            "Health Analysis" if path.startswith("/api/health-assessments/") else
            "System" if path in ("/health", "/api/test/roundtrip") else
            "Profile"
        )
        for operation in methods.values():
            assert operation["tags"] == [expected], path
