from fastapi.testclient import TestClient
import pandas as pd
import main

client = TestClient(main.app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["service"] == "bantay-ai-assessment"


def test_analyze_with_mocked_data(monkeypatch):
    def fake_get_incidents(**kwargs):
        return pd.DataFrame(
            [
                {
                    "incident_type": "THEFT",
                    "date_time_commission": pd.Timestamp("2024-03-01 10:00:00"),
                    "status": "Solved",
                    "lat": 14.4,
                    "lng": 120.9,
                    "modus": "Unknown",
                    "type_of_place": "Commercial/Business Establishment",
                    "place_barangay": "MOLINO I",
                    "place_commission": "Unknown",
                    "hour": 10,
                    "day_of_incident": "Friday",
                    "month_of_incident": "March",
                    "status_norm": "solved",
                }
            ]
        )

    def fake_get_historical_weekly(**kwargs):
        return pd.DataFrame(
            [
                {
                    "week_start": pd.Timestamp("2024-02-26"),
                    "incident_type": "THEFT",
                    "count": 1,
                }
            ]
        )

    monkeypatch.setattr(main, "get_incidents", fake_get_incidents)
    monkeypatch.setattr(main, "get_historical_weekly", fake_get_historical_weekly)

    response = client.post(
        "/analyze",
        json={
            "date_from": "2024-01-01",
            "date_to": "2024-03-31",
            "barangays": [],
            "crime_types": [],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "current"
    assert "stats" in data
    assert "temporal" in data
    assert "clusters" in data
    assert "linreg" in data
    assert "arima" in data