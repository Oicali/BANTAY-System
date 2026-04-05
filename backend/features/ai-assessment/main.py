# backend/features/ai-assessment/main.py

from __future__ import annotations

from pathlib import Path
import os
from typing import Any

import numpy as np
import pandas as pd
import psycopg2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from scipy import stats
from sklearn.cluster import DBSCAN

load_dotenv()

app = FastAPI(title="BANTAY AI Assessment Service", version="0.3.0")


# ─── CRIME TYPE MAPPING ────────────────────────────────────────────────────────
INDEX_CRIME_MAP = {
    "THEFT":                 "THEFT",
    "MURDER":                "MURDER",
    "RAPE":                  "RAPE",
    "ROBBERY":               "ROBBERY",
    "PHYSICAL INJURY":       "PHYSICAL INJURY",
    "PHYSICAL INJURIES":     "PHYSICAL INJURY",
    "HOMICIDE":              "HOMICIDE",
    "SPECIAL COMPLEX CRIME": "SPECIAL COMPLEX CRIME",
    "CARNAPPING - MC":       "CARNAPPING - MC",
    "CARNAPPING - MV":       "CARNAPPING - MV",
}

BARANGAY_ALIASES = {
    "ALIMA":        "SINEGUELASAN",
    "BANALO":       "SINEGUELASAN",
    "CAMPOSANTO":   "KAINGIN (POB.)",
    "DAANG BUKID":  "KAINGIN (POB.)",
    "TABING DAGAT": "KAINGIN (POB.)",
    "KAINGIN":      "KAINGIN DIGMAN",
    "DIGMAN":       "KAINGIN DIGMAN",
    "PANAPAAN":     "P.F. ESPIRITU I (PANAPAAN)",
    "PANAPAAN 2":   "P.F. ESPIRITU II",
    "PANAPAAN 4":   "P.F. ESPIRITU IV",
    "PANAPAAN 5":   "P.F. ESPIRITU V",
    "PANAPAAN 6":   "P.F. ESPIRITU VI",
    "MABOLO 1":     "MABOLO",
    "MABOLO 2":     "MABOLO",
    "MABOLO 3":     "MABOLO",
    "ANIBAN 3":     "ANIBAN I",
    "ANIBAN 4":     "ANIBAN II",
    "ANIBAN 5":     "ANIBAN I",
    "MALIKSI 3":    "MALIKSI II",
    "MAMBOG 5":     "MAMBOG II",
    "NIOG 2":       "NIOG",
    "NIOG 3":       "NIOG",
    "REAL 2":       "REAL",
    "SALINAS 3":    "SALINAS II",
    "SALINAS 4":    "SALINAS II",
    "TALABA 4":     "TALABA III",
    "TALABA 7":     "TALABA I",
}


# ─── REQUEST SCHEMAS ───────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    barangays:   list[str] = Field(default_factory=list)
    date_from:   str
    date_to:     str
    mode:        str = "current"
    crime_types: list[str] = Field(default_factory=list)


class ClustersRequest(BaseModel):
    barangays:   list[str] = Field(default_factory=list)
    date_from:   str
    date_to:     str
    crime_types: list[str] = Field(default_factory=list)


# ─── DB HELPERS ────────────────────────────────────────────────────────────────

def get_db_connection():
    required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASS"]
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError(f"Missing DB env vars: {', '.join(missing)}")

    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
    )


def normalize_crime_types(crime_types: list[str]) -> list[str]:
    if not crime_types:
        return []
    normalized: list[str] = []
    for crime in crime_types:
        key = crime.strip().upper()
        normalized.append(INDEX_CRIME_MAP.get(key, key))
    return sorted(set(normalized))


def expand_barangays(names: list[str]) -> list[str]:
    if not names:
        return []
    reverse_aliases: dict[str, list[str]] = {}
    for legacy, current in BARANGAY_ALIASES.items():
        reverse_aliases.setdefault(current, []).append(legacy)

    expanded: set[str] = set()
    for name in names:
        upper_name = name.strip().upper()
        expanded.add(upper_name)
        for alias in reverse_aliases.get(upper_name, []):
            expanded.add(alias)
    return sorted(expanded)


def normalize_status_series(status_series: pd.Series) -> pd.Series:
    status_norm = status_series.fillna("").astype(str).str.strip().str.lower()
    return pd.Series(
        np.where(
            status_norm.isin(["cleared", "cce"]),
            "cleared",
            np.where(
                status_norm.isin(["solved", "cse"]),
                "solved",
                np.where(
                    status_norm.eq("closed"),
                    "closed",
                    "under_investigation",
                ),
            ),
        ),
        index=status_series.index,
    )


def sanitize_for_json(value):
    if isinstance(value, dict):
        return {k: sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(v) for v in value]
    if isinstance(value, tuple):
        return [sanitize_for_json(v) for v in value]
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value) if np.isfinite(value) else 0.0
    if isinstance(value, float):
        return value if np.isfinite(value) else 0.0
    return value


# ─── DATA QUERIES ──────────────────────────────────────────────────────────────

def get_incidents(
    barangays:   list[str],
    date_from:   str,
    date_to:     str,
    crime_types: list[str] | None = None,
) -> pd.DataFrame:
    expanded_barangays = expand_barangays(barangays)
    normalized_crimes  = normalize_crime_types(crime_types or [])

    sql = """
        SELECT
            UPPER(TRIM(incident_type))                            AS incident_type,
            date_time_commission,
            status,
            lat,
            lng,
            COALESCE(NULLIF(TRIM(modus), ''), 'Unknown')          AS modus,
            COALESCE(NULLIF(TRIM(type_of_place), ''), 'Unknown')  AS type_of_place,
            UPPER(TRIM(place_barangay))                           AS place_barangay,
            COALESCE(NULLIF(TRIM(place_commission), ''), 'Unknown') AS place_commission
        FROM blotter_entries
        WHERE is_deleted = false
          AND date_time_commission >= %s
          AND date_time_commission < (%s::date + interval '1 day')
    """
    params: list[Any] = [date_from, date_to]

    if expanded_barangays:
        sql += " AND UPPER(TRIM(place_barangay)) = ANY(%s)"
        params.append(expanded_barangays)

    if normalized_crimes:
        sql += " AND UPPER(TRIM(incident_type)) = ANY(%s)"
        params.append(normalized_crimes)

    sql += " ORDER BY date_time_commission ASC"

    with get_db_connection() as conn:
        df = pd.read_sql_query(
            sql,
            conn,
            params=params,
            parse_dates=["date_time_commission"],
        )

    if df.empty:
        return df

    df["hour"]              = df["date_time_commission"].dt.hour
    df["day_of_incident"]   = df["date_time_commission"].dt.day_name()
    df["month_of_incident"] = df["date_time_commission"].dt.month_name()
    df["status_norm"]       = normalize_status_series(df["status"])

    return df


def get_historical_weekly(
    barangays:   list[str],
    up_to_date:  str,
    crime_types: list[str] | None = None,
) -> pd.DataFrame:
    expanded_barangays = expand_barangays(barangays)
    normalized_crimes  = normalize_crime_types(crime_types or [])

    sql = """
        SELECT
            DATE_TRUNC('week', date_time_commission)::date AS week_start,
            UPPER(TRIM(incident_type))                     AS incident_type,
            COUNT(*)                                       AS count
        FROM blotter_entries
        WHERE is_deleted = false
          AND date_time_commission < (%s::date + interval '1 day')
    """
    params: list[Any] = [up_to_date]

    if expanded_barangays:
        sql += " AND UPPER(TRIM(place_barangay)) = ANY(%s)"
        params.append(expanded_barangays)

    if normalized_crimes:
        sql += " AND UPPER(TRIM(incident_type)) = ANY(%s)"
        params.append(normalized_crimes)

    sql += """
        GROUP BY week_start, UPPER(TRIM(incident_type))
        ORDER BY week_start ASC, incident_type ASC
    """

    with get_db_connection() as conn:
        weekly_df = pd.read_sql_query(
            sql,
            conn,
            params=params,
            parse_dates=["week_start"],
        )

    if weekly_df.empty:
        return weekly_df

    weekly_df["count"] = weekly_df["count"].astype(int)
    return weekly_df


# ─── MODULE 1 — STATISTICS ─────────────────────────────────────────────────────

def compute_basic_stats(df: pd.DataFrame) -> dict[str, Any]:
    if df.empty:
        return {"overall": {}, "per_crime": []}

    per_crime: list[dict[str, Any]] = []

    for crime, group in df.groupby("incident_type"):
        total               = int(len(group))
        cleared             = int((group["status_norm"] == "cleared").sum())
        solved              = int((group["status_norm"] == "solved").sum())
        under_investigation = int((~group["status_norm"].isin(["cleared", "solved", "closed"])).sum())

        cce = round(((cleared + solved) / total) * 100, 1) if total else 0.0
        cse = round((solved / total) * 100, 1) if total else 0.0

        top_modus = (
            group["modus"]
            .value_counts(normalize=True)
            .head(3)
            .rename_axis("modus")
            .reset_index(name="ratio")
        )
        top_modus_list = [
            {"modus": row["modus"], "percentage": round(float(row["ratio"]) * 100, 1)}
            for _, row in top_modus.iterrows()
        ]

        top_place_type = (
            group["type_of_place"].mode().iloc[0]
            if not group["type_of_place"].mode().empty
            else "Unknown"
        )
        peak_hour = (
            int(group["hour"].mode().iloc[0])
            if not group["hour"].mode().empty
            else None
        )
        peak_day = (
            group["day_of_incident"].mode().iloc[0]
            if not group["day_of_incident"].mode().empty
            else "Unknown"
        )

        per_crime.append({
            "crime":               crime,
            "total":               total,
            "cleared":             cleared,
            "solved":              solved,
            "under_investigation": under_investigation,
            "cce_percent":         cce,
            "cse_percent":         cse,
            "top_3_modus":         top_modus_list,
            "top_place_type":      top_place_type,
            "peak_hour":           peak_hour,
            "peak_day":            peak_day,
        })

    total_all   = int(len(df))
    cleared_all = int((df["status_norm"] == "cleared").sum())
    solved_all  = int((df["status_norm"] == "solved").sum())
    ui_all      = int((~df["status_norm"].isin(["cleared", "solved", "closed"])).sum())

    return {
        "overall": {
            "total":               total_all,
            "cleared":             cleared_all,
            "solved":              solved_all,
            "under_investigation": ui_all,
            "cce_percent":         round(((cleared_all + solved_all) / total_all) * 100, 1) if total_all else 0.0,
            "cse_percent":         round((solved_all / total_all) * 100, 1) if total_all else 0.0,
            "peak_hour":           int(df["hour"].mode().iloc[0]) if not df["hour"].mode().empty else None,
            "peak_day":            df["day_of_incident"].mode().iloc[0] if not df["day_of_incident"].mode().empty else "Unknown",
            "peak_month":          df["month_of_incident"].mode().iloc[0] if not df["month_of_incident"].mode().empty else "Unknown",
        },
        "per_crime": per_crime,
    }


# ─── MODULE 2 — TEMPORAL ANALYSIS ─────────────────────────────────────────────

def compute_temporal(df: pd.DataFrame) -> dict[str, Any]:
    if df.empty:
        return {"overall": {}, "per_crime": []}

    hourly  = df["hour"].value_counts().sort_index()
    daily   = df["day_of_incident"].value_counts()
    monthly = df["month_of_incident"].value_counts()

    hourly_dist = {f"{h:02d}": int(hourly.get(h, 0)) for h in range(24)}
    top_3_hours = hourly.sort_values(ascending=False).head(3).index.tolist()

    overall = {
        "peak_hour":            int(hourly.idxmax()) if not hourly.empty else None,
        "top_3_hours":          [int(h) for h in top_3_hours],
        "peak_day":             daily.idxmax() if not daily.empty else "Unknown",
        "peak_month":           monthly.idxmax() if not monthly.empty else "Unknown",
        "hourly_distribution":  hourly_dist,
        "daily_distribution":   daily.to_dict(),
        "monthly_distribution": monthly.to_dict(),
    }

    per_crime: list[dict[str, Any]] = []
    for crime, group in df.groupby("incident_type"):
        c_hourly  = group["hour"].value_counts().sort_index()
        c_daily   = group["day_of_incident"].value_counts()
        c_monthly = group["month_of_incident"].value_counts()
        c_top3    = c_hourly.sort_values(ascending=False).head(3).index.tolist()

        per_crime.append({
            "crime":      crime,
            "peak_hour":  int(c_hourly.idxmax()) if not c_hourly.empty else None,
            "top_3_hours":[int(h) for h in c_top3],
            "peak_day":   c_daily.idxmax() if not c_daily.empty else "Unknown",
            "peak_month": c_monthly.idxmax() if not c_monthly.empty else "Unknown",
        })

    return {"overall": overall, "per_crime": per_crime}


# ─── MODULE 3 — DBSCAN SPATIAL CLUSTERING ─────────────────────────────────────

def compute_clusters(df: pd.DataFrame) -> dict[str, Any]:
    geo_df = df.dropna(subset=["lat", "lng"]).copy()
    total_with_coords = len(geo_df)

    if total_with_coords < 3:
        return {
            "clusters":          [],
            "noise_count":       total_with_coords,
            "total_with_coords": total_with_coords,
        }

    coords = geo_df[["lat", "lng"]].values.astype(float)
    db     = DBSCAN(eps=0.003, min_samples=3).fit(coords)
    geo_df = geo_df.copy()
    geo_df["cluster_label"] = db.labels_

    clusters: list[dict[str, Any]] = []

    for label in sorted(set(db.labels_)):
        if label == -1:
            continue

        cluster_rows = geo_df[geo_df["cluster_label"] == label]

        centroid_lat = float(cluster_rows["lat"].mean())
        centroid_lng = float(cluster_rows["lng"].mean())

        dominant_crime = (
            cluster_rows["incident_type"].mode().iloc[0]
            if not cluster_rows["incident_type"].mode().empty
            else "Unknown"
        )
        dominant_modus = (
            cluster_rows["modus"].mode().iloc[0]
            if not cluster_rows["modus"].mode().empty
            else "Unknown"
        )
        dominant_barangay = (
            cluster_rows["place_barangay"].mode().iloc[0]
            if not cluster_rows["place_barangay"].mode().empty
            else "Unknown"
        )
        crime_types = cluster_rows["incident_type"].unique().tolist()

        # ── Spatiotemporal: peak hour and day within this cluster ─────────────
        # Only report if cluster has enough incidents for a meaningful pattern.
        # With fewer than 5 incidents, mode() is not reliable — one incident
        # on a Friday doesn't mean "this cluster peaks on Fridays."
        has_temporal_pattern = len(cluster_rows) >= 5

        cluster_hours = cluster_rows["hour"].value_counts()
        cluster_days  = cluster_rows["day_of_incident"].value_counts()

        cluster_peak_hour = (
            int(cluster_hours.idxmax())
            if has_temporal_pattern and not cluster_hours.empty
            else None
        )
        cluster_peak_day = (
            cluster_days.idxmax()
            if has_temporal_pattern and not cluster_days.empty
            else None
        )

        clusters.append({
            "cluster_id":           int(label),
            "count":                int(len(cluster_rows)),
            "centroid_lat":         round(centroid_lat, 7),
            "centroid_lng":         round(centroid_lng, 7),
            "dominant_crime":       dominant_crime,
            "dominant_modus":       dominant_modus,
            "dominant_barangay":    dominant_barangay,
            "crime_types":          crime_types,
            # Spatiotemporal fields — None if insufficient incidents
            "peak_hour":            cluster_peak_hour,
            "peak_day":             cluster_peak_day,
            "has_temporal_pattern": has_temporal_pattern,
        })

    noise_count = int((geo_df["cluster_label"] == -1).sum())

    return {
        "clusters":          clusters,
        "noise_count":       noise_count,
        "total_with_coords": total_with_coords,
    }


# ─── MODULE 4 — CROSTON FORECASTING ───────────────────────────────────────────

def compute_croston(weekly_df: pd.DataFrame) -> dict[str, Any]:
    """
    Croston's method for intermittent demand forecasting.
    Designed for sparse count data — exactly the crime data profile.
    Only uses non-zero weeks. No zero-filling needed.
    """
    if weekly_df.empty:
        return {"per_crime": []}

    per_crime: list[dict[str, Any]] = []

    for crime, group in weekly_df.groupby("incident_type"):
        # Only non-zero weeks — Croston handles intervals itself
        nonzero = (
            group[group["count"] > 0]
            .sort_values("week_start")
            .reset_index(drop=True)
        )
        nonzero_count = int(len(nonzero))
        total_weeks   = int(len(group))

        # Insufficient data — skip forecast entirely
        if nonzero_count < 4:
            per_crime.append({
                "crime":               crime,
                "trend":               "insufficient_data",
                "predicted_next_week": None,
                "confidence":          "none",
                "nonzero_weeks":       nonzero_count,
                "total_weeks":         total_weeks,
                "method":              "none",
                "message":             f"Only {nonzero_count} incident weeks — insufficient for forecasting",
            })
            continue

        # Confidence level based on non-zero observations
        if nonzero_count < 8:
            confidence = "low"
        elif nonzero_count < 20:
            confidence = "moderate"
        else:
            confidence = "high"

        # ── Croston's method ──────────────────────────────────────────────────
        demands     = nonzero["count"].values.astype(float)
        week_starts = pd.to_datetime(nonzero["week_start"])

        # Compute intervals between non-zero weeks (in weeks)
        if len(week_starts) > 1:
            intervals = [
                max(1, (week_starts.iloc[i] - week_starts.iloc[i - 1]).days // 7)
                for i in range(1, len(week_starts))
            ]
        else:
            intervals = [1.0]

        # Exponential smoothing on demand sizes and intervals
        alpha            = 0.3
        smoothed_demand  = float(demands[0])
        smoothed_interval = float(intervals[0]) if intervals else 1.0

        for i in range(1, len(demands)):
            smoothed_demand = alpha * demands[i] + (1 - alpha) * smoothed_demand
            if i - 1 < len(intervals):
                smoothed_interval = alpha * intervals[i - 1] + (1 - alpha) * smoothed_interval

        # Croston forecast = smoothed demand / smoothed interval
        croston_rate = smoothed_demand / max(smoothed_interval, 1.0)
        predicted    = max(0, round(croston_rate))

        # ── Trend direction via moving average comparison ─────────────────────
        if nonzero_count >= 8:
            recent   = demands[-4:].mean()
            previous = demands[-8:-4].mean() if nonzero_count >= 8 else demands.mean()
            if previous > 0:
                pct_change = ((recent - previous) / previous) * 100
            else:
                pct_change = 0.0

            if pct_change > 20:
                trend = "increasing"
            elif pct_change < -20:
                trend = "decreasing"
            else:
                trend = "stable"
        else:
            trend = "stable"

        per_crime.append({
            "crime":               crime,
            "trend":               trend,
            "predicted_next_week": int(predicted),
            "confidence":          confidence,
            "nonzero_weeks":       nonzero_count,
            "total_weeks":         total_weeks,
            "method":              "croston",
            "smoothed_demand":     round(smoothed_demand, 2),
            "smoothed_interval":   round(smoothed_interval, 2),
        })

    return {"per_crime": per_crime}


# ─── HEALTH CHECK ──────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"ok": True, "service": "bantay-ai-assessment", "version": "0.3.0"}


# ─── /clusters — HEATMAP DBSCAN ENDPOINT ──────────────────────────────────────

@app.post("/clusters")
def get_clusters(payload: ClustersRequest):
    """
    Lightweight endpoint called by crimeMapController.js to get
    DBSCAN cluster centroids for the heatmap ring layer.
    Returns only cluster data — no trends, no stats.
    """
    try:
        incidents_df    = get_incidents(
            barangays=payload.barangays,
            date_from=payload.date_from,
            date_to=payload.date_to,
            crime_types=payload.crime_types,
        )
        clusters_result = compute_clusters(incidents_df)
        return sanitize_for_json(clusters_result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── /analyze — FULL ASSESSMENT ENDPOINT ──────────────────────────────────────

@app.post("/analyze")
def analyze(payload: AnalyzeRequest):
    try:
        incidents_df = get_incidents(
            barangays=payload.barangays,
            date_from=payload.date_from,
            date_to=payload.date_to,
            crime_types=payload.crime_types,
        )

        # All historical data up to date_to — no date_from cap
        # This gives Croston the full history regardless of display range
        historical_weekly_df = get_historical_weekly(
            barangays=payload.barangays,
            up_to_date=payload.date_to,
            crime_types=payload.crime_types,
        )

        stats_result    = compute_basic_stats(incidents_df)
        temporal_result = compute_temporal(incidents_df)
        clusters_result = compute_clusters(incidents_df)
        croston_result  = compute_croston(historical_weekly_df)

        # Merge Croston results into per_crime stats
        croston_map = {item["crime"]: item for item in croston_result.get("per_crime", [])}

        for crime_stat in stats_result.get("per_crime", []):
            crime = crime_stat["crime"]
            cr    = croston_map.get(crime, {})
            crime_stat["trend"]               = cr.get("trend", "stable")
            crime_stat["predicted_next_week"] = cr.get("predicted_next_week", None)
            crime_stat["confidence"]          = cr.get("confidence", "none")
            crime_stat["nonzero_weeks"]       = cr.get("nonzero_weeks", 0)
            crime_stat["forecast_method"]     = cr.get("method", "none")
            crime_stat["is_ecp"]              = (
                crime_stat["trend"] == "increasing"
                and crime_stat["cse_percent"] < 30.0
                and cr.get("confidence") not in ["none"]
            )

        # Merge temporal per_crime into stats per_crime
        temporal_map = {item["crime"]: item for item in temporal_result.get("per_crime", [])}

        for crime_stat in stats_result.get("per_crime", []):
            crime = crime_stat["crime"]
            t     = temporal_map.get(crime, {})
            if "peak_hour" not in crime_stat or crime_stat["peak_hour"] is None:
                crime_stat["peak_hour"] = t.get("peak_hour")
            crime_stat["top_3_hours"] = t.get("top_3_hours", [])

        # Prepare historical rows for sparkline chart
        # Keep only non-zero rows — frontend fills zeros for display
        historical_rows = historical_weekly_df.copy()
        if not historical_rows.empty:
            historical_rows["week_start"] = historical_rows["week_start"].dt.strftime("%Y-%m-%d")
            historical_rows["count"]      = historical_rows["count"].astype(int)
            historical_rows               = historical_rows.where(pd.notnull(historical_rows), None)

        response = {
            "mode":    payload.mode,
            "filters": {
                "barangays":   payload.barangays,
                "crime_types": payload.crime_types,
                "date_from":   payload.date_from,
                "date_to":     payload.date_to,
            },
            "stats":                  stats_result,
            "temporal":               temporal_result,
            "clusters":               clusters_result,
            "linreg":                 croston_result,   # key kept as "linreg" so frontend doesn't need changes
            "historical_weekly_rows": historical_rows.to_dict(orient="records"),
        }

        return sanitize_for_json(response)

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))