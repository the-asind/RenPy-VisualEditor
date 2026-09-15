import os

INSECURE_JWT_SECRET_PLACEHOLDER = "YOUR_SUPER_SECRET_KEY_CHANGE_IN_PRODUCTION"
DEV_JWT_SECRET = "renpy-visual-editor-local-dev-secret-change-before-production"

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30
SESSION_TOKEN_EXPIRE_MINUTES = 10

MAX_GRAPH_IMPORT_FILES = int(os.environ.get("MAX_GRAPH_IMPORT_FILES", "64"))
MAX_GRAPH_IMPORT_FILE_BYTES = int(os.environ.get("MAX_GRAPH_IMPORT_FILE_BYTES", str(1024 * 1024)))
MAX_GRAPH_IMPORT_TOTAL_BYTES = int(os.environ.get("MAX_GRAPH_IMPORT_TOTAL_BYTES", str(8 * 1024 * 1024)))
MAX_ASSET_CATALOG_BYTES = int(os.environ.get("MAX_ASSET_CATALOG_BYTES", str(1024 * 1024)))
MAX_ASSET_CATALOG_ENTRIES = int(os.environ.get("MAX_ASSET_CATALOG_ENTRIES", "5000"))
MAX_CRDT_SNAPSHOT_BYTES = int(os.environ.get("MAX_CRDT_SNAPSHOT_BYTES", str(8 * 1024 * 1024)))
MAX_WS_BINARY_UPDATE_BYTES = int(os.environ.get("MAX_WS_BINARY_UPDATE_BYTES", str(1024 * 1024)))
MAX_WS_CONNECTIONS_PER_USER = int(os.environ.get("MAX_WS_CONNECTIONS_PER_USER", "5"))
MAX_WS_CONNECTIONS_PER_PROJECT = int(os.environ.get("MAX_WS_CONNECTIONS_PER_PROJECT", "100"))
MAX_WS_MESSAGES_PER_WINDOW = int(os.environ.get("MAX_WS_MESSAGES_PER_WINDOW", "300"))
MAX_WS_BYTES_PER_WINDOW = int(os.environ.get("MAX_WS_BYTES_PER_WINDOW", str(8 * 1024 * 1024)))
WS_RATE_WINDOW_SECONDS = float(os.environ.get("WS_RATE_WINDOW_SECONDS", "10"))
MAX_OWNED_PROJECTS_PER_USER = int(os.environ.get("MAX_OWNED_PROJECTS_PER_USER", "10"))
MAX_OWNER_STORAGE_BYTES = int(os.environ.get("MAX_OWNER_STORAGE_BYTES", str(32 * 1024 * 1024)))
MAX_HTTP_BODY_BYTES = int(os.environ.get("MAX_HTTP_BODY_BYTES", str(10 * 1024 * 1024)))
MAX_HEAVY_REQUESTS = int(os.environ.get("MAX_HEAVY_REQUESTS", "2"))
MAX_WS_CONNECTIONS_TOTAL = int(os.environ.get("MAX_WS_CONNECTIONS_TOTAL", "200"))
MAX_WS_CONNECTIONS_PER_IP = int(os.environ.get("MAX_WS_CONNECTIONS_PER_IP", "20"))
RATE_LIMIT_REGISTRATION_REQUESTS = int(os.environ.get("RATE_LIMIT_REGISTRATION_REQUESTS", "10"))
RATE_LIMIT_REGISTRATION_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_REGISTRATION_WINDOW_SECONDS", "3600"))
RATE_LIMIT_LOGIN_REQUESTS = int(os.environ.get("RATE_LIMIT_LOGIN_REQUESTS", "30"))
RATE_LIMIT_LOGIN_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_LOGIN_WINDOW_SECONDS", "60"))
RATE_LIMIT_PROJECT_CREATE_REQUESTS = int(os.environ.get("RATE_LIMIT_PROJECT_CREATE_REQUESTS", "30"))
RATE_LIMIT_PROJECT_CREATE_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_PROJECT_CREATE_WINDOW_SECONDS", "60"))
RATE_LIMIT_DEMO_PREVIEW_REQUESTS = int(os.environ.get("RATE_LIMIT_DEMO_PREVIEW_REQUESTS", "120"))
RATE_LIMIT_DEMO_PREVIEW_WINDOW_SECONDS = int(os.environ.get("RATE_LIMIT_DEMO_PREVIEW_WINDOW_SECONDS", "60"))
MAX_GRAPH_EXPORT_JSON_BYTES = int(os.environ.get("MAX_GRAPH_EXPORT_JSON_BYTES", str(8 * 1024 * 1024)))
MAX_GRAPH_EXPORT_FILES = int(os.environ.get("MAX_GRAPH_EXPORT_FILES", "256"))
MAX_GRAPH_EXPORT_LABELS = int(os.environ.get("MAX_GRAPH_EXPORT_LABELS", "5000"))
MAX_GRAPH_EXPORT_LABEL_STARTS = int(os.environ.get("MAX_GRAPH_EXPORT_LABEL_STARTS", "5000"))
MAX_GRAPH_EXPORT_NODES = int(os.environ.get("MAX_GRAPH_EXPORT_NODES", "20000"))
MAX_GRAPH_EXPORT_EDGES = int(os.environ.get("MAX_GRAPH_EXPORT_EDGES", "40000"))
MAX_GRAPH_EXPORT_DIAGNOSTICS = int(os.environ.get("MAX_GRAPH_EXPORT_DIAGNOSTICS", "20000"))
MAX_GRAPH_EXPORT_TEXT_BYTES = int(os.environ.get("MAX_GRAPH_EXPORT_TEXT_BYTES", str(8 * 1024 * 1024)))
MAX_GRAPH_EXPORT_OUTPUT_BYTES = int(os.environ.get("MAX_GRAPH_EXPORT_OUTPUT_BYTES", str(8 * 1024 * 1024)))
PROJECT_GRAPH_BRIDGE_TIMEOUT_SECONDS = float(os.environ.get("PROJECT_GRAPH_BRIDGE_TIMEOUT_SECONDS", "10"))
PROJECT_GRAPH_BRIDGE_MAX_INPUT_BYTES = int(os.environ.get("PROJECT_GRAPH_BRIDGE_MAX_INPUT_BYTES", str(8 * 1024 * 1024)))
PROJECT_GRAPH_BRIDGE_MAX_OUTPUT_BYTES = int(os.environ.get("PROJECT_GRAPH_BRIDGE_MAX_OUTPUT_BYTES", str(8 * 1024 * 1024)))


def is_production_env() -> bool:
    return os.environ.get("APP_ENV", os.environ.get("ENVIRONMENT", "")).strip().lower() in {"prod", "production"}


def get_jwt_secret_key() -> str:
    secret = os.environ.get("JWT_SECRET_KEY")
    if secret and secret != INSECURE_JWT_SECRET_PLACEHOLDER:
        return secret
    if is_production_env():
        raise RuntimeError("JWT_SECRET_KEY must be set to a non-placeholder value in production")
    return DEV_JWT_SECRET


def get_cors_allow_origins() -> list[str]:
    raw_origins = os.environ.get("CORS_ALLOW_ORIGINS", "").strip()
    if raw_origins:
        origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
        if origins and "*" not in origins:
            return origins
        if is_production_env():
            raise RuntimeError("CORS_ALLOW_ORIGINS must list explicit origins in production")
    if is_production_env():
        raise RuntimeError("CORS_ALLOW_ORIGINS must be set in production")
    return [
        "http://localhost:5137",
        "http://127.0.0.1:5137",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
