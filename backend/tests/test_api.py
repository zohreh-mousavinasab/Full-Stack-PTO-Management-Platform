from importlib import import_module
import sys

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("SECRET_KEY", "test-secret")

    for module_name in [
        "app.main",
        "app.services",
        "app.models",
        "app.db.session",
        "app.core.config",
    ]:
        sys.modules.pop(module_name, None)

    config_module = import_module("app.core.config")
    session_module = import_module("app.db.session")
    models_module = import_module("app.models")
    services_module = import_module("app.services")
    main_module = import_module("app.main")

    session_module.Base.metadata.create_all(bind=session_module.engine)
    with session_module.SessionLocal() as db:
        services_module.seed_database(db)
    return TestClient(main_module.app)


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_login_and_dashboard(client):
    response = client.post(
        "/auth/login",
        json={"email": "zohreh@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    me = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    dashboard = client.get("/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["stats"]


def test_conflicts_and_exports(client):
    login = client.post(
        "/auth/login",
        json={"email": "zohreh@example.com", "password": "password123"},
    )
    token = login.json()["access_token"]

    conflicts = client.get("/conflicts", headers={"Authorization": f"Bearer {token}"})
    assert conflicts.status_code == 200
    assert isinstance(conflicts.json(), list)

    export_response = client.get("/exports/usage", headers={"Authorization": f"Bearer {token}"})
    assert export_response.status_code == 200
    assert export_response.headers["content-type"].startswith("text/csv")
    assert "label,days" in export_response.text
