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

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

app = FastAPI(title="BANTAY AI Assessment Service", version="0.2.4")


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

    df["hour"]             = df["date_time_commission"].dt.hour
    df["day_of_incident"]  = df["date_time_commission"].dt.day_name()
    df["month_of_incident"]= df["date_time_commission"].dt.month_name()
    df["status_norm"]      = normalize_status_series(df["status"])

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
        total              = int(len(group))
        cleared            = int((group["status_norm"] == "cleared").sum())
        solved             = int((group["status_norm"] == "solved").sum())
        under_investigation= int((~group["status_norm"].isin(["cleared", "solved", "closed"])).sum())

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
            "crime":              crime,
            "total":              total,
            "cleared":            cleared,
            "solved":             solved,
            "under_investigation":under_investigation,
            "cce_percent":        cce,
            "cse_percent":        cse,
            "top_3_modus":        top_modus_list,
            "top_place_type":     top_place_type,
            "peak_hour":          peak_hour,
            "peak_day":           peak_day,
        })

    total_all   = int(len(df))
    cleared_all = int((df["status_norm"] == "cleared").sum())
    solved_all  = int((df["status_norm"] == "solved").sum())
    ui_all      = int((~df["status_norm"].isin(["cleared", "solved", "closed"])).sum())

    return {
        "overall": {
            "total":              total_all,
            "cleared":            cleared_all,
            "solved":             solved_all,
            "under_investigation":ui_all,
            "cce_percent":        round(((cleared_all + solved_all) / total_all) * 100, 1) if total_all else 0.0,
            "cse_percent":        round((solved_all / total_all) * 100, 1) if total_all else 0.0,
            "peak_hour":          int(df["hour"].mode().iloc[0]) if not df["hour"].mode().empty else None,
            "peak_day":           df["day_of_incident"].mode().iloc[0] if not df["day_of_incident"].mode().empty else "Unknown",
            "peak_month":         df["month_of_incident"].mode().iloc[0] if not df["month_of_incident"].mode().empty else "Unknown",
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

    hourly_dist  = {f"{h:02d}": int(hourly.get(h, 0)) for h in range(24)}
    top_3_hours  = hourly.sort_values(ascending=False).head(3).index.tolist()

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
            "clusters":           [],
            "noise_count":        total_with_coords,
            "total_with_coords":  total_with_coords,
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

        centroid_lat   = float(cluster_rows["lat"].mean())
        centroid_lng   = float(cluster_rows["lng"].mean())
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

        clusters.append({
            "cluster_id":         int(label),
            "count":              int(len(cluster_rows)),
            "centroid_lat":       round(centroid_lat, 7),
            "centroid_lng":       round(centroid_lng, 7),
            "dominant_crime":     dominant_crime,
            "dominant_modus":     dominant_modus,
            "dominant_barangay":  dominant_barangay,
            "crime_types":        crime_types,
        })

    noise_count = int((geo_df["cluster_label"] == -1).sum())

    return {
        "clusters":          clusters,
        "noise_count":       noise_count,
        "total_with_coords": total_with_coords,
    }


# ─── MODULE 4 — LINEAR REGRESSION ─────────────────────────────────────────────

def compute_linreg(weekly_df: pd.DataFrame) -> dict[str, Any]:
    if weekly_df.empty:
        return {"per_crime": []}

    per_crime: list[dict[str, Any]] = []

    for crime, group in weekly_df.groupby("incident_type"):
        group = group.sort_values("week_start").reset_index(drop=True)
        group["week_index"] = range(len(group))

        x = group["week_index"].values.astype(float)
        y = group["count"].values.astype(float)

        if len(x) < 2:
            per_crime.append({
                "crime":                crime,
                "trend":                "stable",
                "slope":                0.0,
                "r_squared":            0.0,
                "confidence_level":     "low",
                "predicted_next_week":  int(y[-1]) if len(y) else 0,
                "weeks_of_data":        int(len(x)),
            })
            continue

        if np.all(y == y[0]):
            per_crime.append({
                "crime":                crime,
                "trend":                "stable",
                "slope":                0.0,
                "r_squared":            0.0,
                "confidence_level":     "low",
                "predicted_next_week":  int(y[-1]),
                "weeks_of_data":        int(len(x)),
            })
            continue

        result    = stats.linregress(x, y)
        slope     = float(result.slope)     if np.isfinite(result.slope)     else 0.0
        intercept = float(result.intercept) if np.isfinite(result.intercept) else 0.0
        r_squared = float(result.rvalue**2) if np.isfinite(result.rvalue)    else 0.0

        if slope > 0.1:   trend = "increasing"
        elif slope < -0.1: trend = "decreasing"
        else:              trend = "stable"

        if r_squared > 0.6:   confidence_level = "high"
        elif r_squared > 0.3: confidence_level = "moderate"
        else:                 confidence_level = "low"

        next_week_index = int(x[-1]) + 1
        predicted = max(0, round(intercept + slope * next_week_index))

        per_crime.append({
            "crime":                crime,
            "trend":                trend,
            "slope":                round(slope, 4),
            "r_squared":            round(r_squared, 4),
            "confidence_level":     confidence_level,
            "predicted_next_week":  int(predicted),
            "weeks_of_data":        int(len(x)),
        })

    return {"per_crime": per_crime}


# ─── MODULE 5 — ARIMA ─────────────────────────────────────────────────────────

def compute_arima(weekly_df: pd.DataFrame) -> dict[str, Any]:
    ARIMA_MIN_WEEKS = 10

    if weekly_df.empty:
        return {
            "predicted_total_next_week": None,
            "vs_average":                "unknown",
            "historical_weekly_mean":    None,
            "method":                    "no_data",
            "model_order":               None,
            "weeks_of_data":             0,
        }

    weekly_total = (
        weekly_df.groupby("week_start")["count"]
        .sum()
        .sort_index()
        .reset_index()
    )
    weekly_total.columns = ["week_start", "total"]

    series          = weekly_total["total"].values.astype(float)
    n_weeks         = int(len(series))
    historical_mean = float(series.mean())

    def _label_vs_average(predicted: float, mean: float) -> str:
        if mean == 0:
            return "normal"
        ratio = predicted / mean
        if ratio > 1.10: return "above"
        if ratio < 0.90: return "below"
        return "normal"

    if n_weeks >= ARIMA_MIN_WEEKS:
        try:
            import pmdarima as pm
            model    = pm.auto_arima(
                series, seasonal=False, stepwise=True,
                suppress_warnings=True, error_action="ignore",
                max_p=3, max_q=3, max_d=2,
            )
            forecast  = model.predict(n_periods=1)
            predicted = max(0, round(float(forecast[0])))
            return {
                "predicted_total_next_week": int(predicted),
                "vs_average":                _label_vs_average(predicted, historical_mean),
                "historical_weekly_mean":    round(historical_mean, 2),
                "method":                    "arima",
                "model_order":               list(model.order),
                "weeks_of_data":             n_weeks,
            }
        except Exception:
            pass

    x = np.arange(n_weeks, dtype=float)
    y = series

    if n_weeks >= 2:
        result    = stats.linregress(x, y)
        predicted = max(0, round(result.intercept + result.slope * n_weeks))
    else:
        predicted = int(series[-1]) if n_weeks else 0

    return {
        "predicted_total_next_week": int(predicted),
        "vs_average":                _label_vs_average(predicted, historical_mean),
        "historical_weekly_mean":    round(historical_mean, 2),
        "method":                    "linreg_fallback",
        "model_order":               None,
        "weeks_of_data":             n_weeks,
    }


# ─── HEALTH CHECK ──────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"ok": True, "service": "bantay-ai-assessment", "version": "0.2.4"}


# ─── /clusters — HEATMAP DBSCAN ENDPOINT ──────────────────────────────────────

@app.post("/clusters")
def get_clusters(payload: ClustersRequest):
    """
    Lightweight endpoint called by crimeMapController.js to get
    DBSCAN cluster centroids for the heatmap ring layer.
    Returns only cluster data — no trends, no ARIMA, no stats.
    """
    try:
        incidents_df = get_incidents(
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

        historical_weekly_df = get_historical_weekly(
            barangays=payload.barangays,
            up_to_date=payload.date_to,
            crime_types=payload.crime_types,
        )

        # Fill in zero-count weeks for sparse crimes
        if not historical_weekly_df.empty:
            all_weeks = pd.date_range(
                start=historical_weekly_df["week_start"].min(),
                end=historical_weekly_df["week_start"].max(),
                freq="W-MON",
            ).normalize()

            all_crimes = historical_weekly_df["incident_type"].unique()

            full_index = pd.MultiIndex.from_product(
                [all_weeks, all_crimes],
                names=["week_start", "incident_type"],
            )

            historical_weekly_df = (
                historical_weekly_df
                .set_index(["week_start", "incident_type"])
                .reindex(full_index, fill_value=0)
                .reset_index()
            )
            historical_weekly_df["week_start"] = pd.to_datetime(historical_weekly_df["week_start"])

        stats_result    = compute_basic_stats(incidents_df)
        temporal_result = compute_temporal(incidents_df)
        clusters_result = compute_clusters(incidents_df)
        linreg_result   = compute_linreg(historical_weekly_df)
        arima_result    = compute_arima(historical_weekly_df)

        linreg_map = {item["crime"]: item for item in linreg_result.get("per_crime", [])}

        for crime_stat in stats_result.get("per_crime", []):
            crime = crime_stat["crime"]
            lr    = linreg_map.get(crime, {})
            crime_stat["trend"]                = lr.get("trend", "stable")
            crime_stat["slope"]                = lr.get("slope", 0.0)
            crime_stat["predicted_next_week"]  = lr.get("predicted_next_week", 0)
            crime_stat["is_ecp"]               = (
                crime_stat["trend"] == "increasing"
                and crime_stat["cse_percent"] < 30.0
            )
            crime_stat["confidence_level"]     = lr.get("confidence_level", "low")
            crime_stat["weeks_of_data"]        = lr.get("weeks_of_data", 0)

        temporal_map = {item["crime"]: item for item in temporal_result.get("per_crime", [])}

        for crime_stat in stats_result.get("per_crime", []):
            crime = crime_stat["crime"]
            t     = temporal_map.get(crime, {})
            if "peak_hour" not in crime_stat or crime_stat["peak_hour"] is None:
                crime_stat["peak_hour"] = t.get("peak_hour")
            crime_stat["top_3_hours"] = t.get("top_3_hours", [])

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
            "linreg":                 linreg_result,
            "arima":                  arima_result,
            "historical_weekly_rows": historical_rows.to_dict(orient="records"),
        }

        return sanitize_for_json(response)

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))