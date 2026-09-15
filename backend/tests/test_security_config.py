from app.security import get_cors_allow_origins


def test_default_cors_origins_are_explicit_for_credentialed_requests(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)

    origins = get_cors_allow_origins()

    assert origins
    assert "*" not in origins
