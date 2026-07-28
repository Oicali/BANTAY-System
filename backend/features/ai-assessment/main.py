# backend/features/ai-assessment/main.py

from __future__ import annotations

from pathlib import Path
import os
from typing import Any

import numpy as np
import pandas as pd
import psycopg2
import math
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from scipy import stats
from sklearn.cluster import DBSCAN

load_dotenv()

app = FastAPI(title="BANTAY AI Assessment Service", version="0.4.0")


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

PLACE_TYPE_GROUPS = {
    "Commercial/Business Establishment":                    "Commercial Activity",
    "Transportation Terminals (Tricycle, Jeep, FX, Bus, Train Station)": "Commercial Activity",
    "Parking Area (vacant lot, in bldg/structure, open parking)":        "Commercial Activity",
    "Residential (house/condo)":                            "Residential Environment",
    "Abandoned Structure (house, bldg, apartment/condo)":  "Residential Environment",
    "Along the street":                                     "Public/Open Space",
    "Vacant Lot (unused/unoccupied open area)":             "Public/Open Space",
    "River/Lake":                                           "Public/Open Space",
    "Farm/Ricefield":                                       "Public/Open Space",
    "Government Office/Establishment":                      "Institutional",
    "School (Grade/High School/College/University)":        "Institutional",
    "Construction/Industrial Barracks":                     "Institutional",
    "Recreational Place (resorts/parks)":                   "Leisure/Recreation",
    "Onboard a vehicle (riding in/on)":                     "Transit/Mobile",
}

HOUR_LABELS = {
    range(5, 9):   "Early Morning (5AM-8AM)",
    range(9, 12):  "Morning (9AM-11AM)",
    range(12, 14): "Midday (12PM-1PM)",
    range(14, 18): "Afternoon (2PM-5PM)",
    range(18, 21): "Evening (6PM-8PM)",
    range(21, 24): "Night (9PM-11PM)",
    range(0, 5):   "Late Night (12AM-4AM)",
}

def get_hour_label(hour: int) -> str:
    for r, label in HOUR_LABELS.items():
        if hour in r:
            return label
    return "Unknown"

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

class ForecastRequest(BaseModel):
    barangays:    list[str] = Field(default_factory=list)
    date_from:    str
    date_to:      str
    crime_types:  list[str] = Field(default_factory=list)
    decay_window: int = 90


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


# ─── RISK & CLUSTERING HELPERS ────────────────────────────────────────────────

def get_risk_color(crime_count: int, date_from: str, date_to: str) -> str:
    days  = (pd.Timestamp(date_to) - pd.Timestamp(date_from)).days + 1
    weeks = max(days / 7, 1)
    rate  = crime_count / weeks

    if crime_count == 0:
        return "#adb5bd"
    elif rate < 0.15:
        return "#eab308"
    elif rate < 0.30:
        return "#f97316"
    else:
        return "#b91c1c"


def get_dbscan_eps(date_from: str, date_to: str) -> float:
    days = (pd.Timestamp(date_to) - pd.Timestamp(date_from)).days + 1
    if days <= 7:
        return 0.005
    elif days <= 30:
        return 0.004
    elif days <= 90:
        return 0.004
    else:
        return 0.003


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
            UPPER(TRIM(place_barangay))                           AS place_barangay
        FROM blotter_analytics_view
        WHERE date_time_commission >= %s
        AND date_time_commission < (%s::date + interval '1 day')
        AND LOWER(TRIM(status)) IN (
            'cleared','cce','solved','cse',
            'under investigation','ui',
            'for investigation','active','ongoing'
        )
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
    df["month_of_incident"] = df["date_time_commission"].dt.strftime("%B %Y")
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
        FROM blotter_analytics_view
        WHERE date_time_commission < (%s::date + interval '1 day')
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

        modus_vc = group["modus"].value_counts()
        known_modus_vc = modus_vc[modus_vc.index != "Unknown"]
        if len(known_modus_vc) > 0:
            top_modus = (
                known_modus_vc.head(min(3, len(known_modus_vc)))
                .rename_axis("modus")
                .reset_index(name="count")
            )
            total_modus = int(known_modus_vc.sum())
        else:
            top_modus = (
                modus_vc.head(min(3, len(modus_vc)))
                .rename_axis("modus")
                .reset_index(name="count")
            )
            total_modus = int(modus_vc.sum())

        top_modus_list = [
            {
                "modus": row["modus"],
                "percentage": round((int(row["count"]) / total_modus) * 100, 1)
            }
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
        peak_month = (
            group["month_of_incident"].mode().iloc[0]
            if not group["month_of_incident"].mode().empty
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
            "peak_month":          peak_month,
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
            "crime":        crime,
            "peak_hour":    int(c_hourly.idxmax()) if not c_hourly.empty else None,
            "top_3_hours":  [int(h) for h in c_top3],
            "peak_day":     c_daily.idxmax() if not c_daily.empty else "Unknown",
            "peak_month":   c_monthly.idxmax() if not c_monthly.empty else "Unknown",
        })

    return {"overall": overall, "per_crime": per_crime}


# ─── MODULE 3 — DBSCAN SPATIAL CLUSTERING ─────────────────────────────────────

def compute_clusters(df: pd.DataFrame, eps: float = 0.003) -> dict[str, Any]:
    geo_df = df.dropna(subset=["lat", "lng"]).copy()
    total_with_coords = len(geo_df)

    if total_with_coords < 3:
        return {
            "clusters":          [],
            "noise_count":       total_with_coords,
            "total_with_coords": total_with_coords,
        }

    coords = geo_df[["lat", "lng"]].values.astype(float)
    db = DBSCAN(eps=eps, min_samples=3).fit(coords)
    core_sample_indices = db.core_sample_indices_
    print(f"Core points: {len(core_sample_indices)} out of {total_with_coords} total")
    print(f"Noise/outliers: {list(db.labels_).count(-1)}, Border points: {total_with_coords - len(db.core_sample_indices_) - list(db.labels_).count(-1)}")
    geo_df = geo_df.copy()
    geo_df["cluster_label"] = db.labels_

    clusters: list[dict[str, Any]] = []

    for label in sorted(set(db.labels_)):
        if label == -1:
            continue

        cluster_rows = geo_df[geo_df["cluster_label"] == label]

        coords_cluster = cluster_rows[["lat", "lng"]].values
        neighbor_counts = []
        for pt in coords_cluster:
            dists = np.sqrt(((coords_cluster - pt) ** 2).sum(axis=1))
            neighbor_counts.append((dists < eps).sum())
        densest_idx = cluster_rows.index[np.argmax(neighbor_counts)]
        centroid_lat = float(cluster_rows.loc[densest_idx, "lat"])
        centroid_lng = float(cluster_rows.loc[densest_idx, "lng"])

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

        def haversine(lat1, lon1, lat2, lon2):
            R = 6371000
            phi1, phi2 = math.radians(lat1), math.radians(lat2)
            dphi = math.radians(lat2 - lat1)
            dlambda = math.radians(lon2 - lon1)
            a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
            return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        radius_m = float(cluster_rows.apply(
            lambda row: haversine(centroid_lat, centroid_lng, row["lat"], row["lng"]),
            axis=1
        ).max())
        radius_m = max(min(radius_m * 1.2, 100), 50)

        clusters.append({
            "cluster_id":           int(label),
            "count":                int(len(cluster_rows)),
            "centroid_lat":         round(centroid_lat, 7),
            "centroid_lng":         round(centroid_lng, 7),
            "radius_m":             round(radius_m, 1),
            "dominant_crime":       dominant_crime,
            "dominant_modus":       dominant_modus,
            "dominant_barangay":    dominant_barangay,
            "crime_types":          crime_types,
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

# MODULE - Diagnostic
def compute_diagnostics(df: pd.DataFrame) -> dict[str, Any]:
    if df.empty:
        return {"per_crime": []}

    results: list[dict[str, Any]] = []

    for crime, group in df.groupby("incident_type"):
        total = len(group)

        # ── 1. Place type distribution ────────────────────────────────────────
        place_counts = group["type_of_place"].value_counts()
        place_dist: list[dict[str, Any]] = []

        for place, count in place_counts.items():
            group_label = PLACE_TYPE_GROUPS.get(place, "Other")
            pct = round((count / total) * 100, 1)
            place_dist.append({
                "place_type":  place,
                "group":       group_label,
                "count":       int(count),
                "percent":     pct,
            })

        # ── 2. Place group summary ────────────────────────────────────────────
        group_summary: dict[str, Any] = {}
        for entry in place_dist:
            g = entry["group"]
            if g not in group_summary:
                group_summary[g] = {"count": 0, "percent": 0.0}
            group_summary[g]["count"]   += entry["count"]
            group_summary[g]["percent"] += entry["percent"]

        group_summary_list = sorted(
            [{"group": k, **v} for k, v in group_summary.items()],
            key=lambda x: x["count"],
            reverse=True,
        )
        dominant_group = group_summary_list[0] if group_summary_list else None

        # ── 3. Top place type with time breakdown ─────────────────────────────
        top_place_type = place_dist[0]["place_type"] if place_dist else None
        top_place_time_breakdown: list[dict[str, Any]] = []

        if top_place_type:
            top_place_group = group[group["type_of_place"] == top_place_type]
            hour_counts = top_place_group["hour"].value_counts().sort_index()

            for hour, count in hour_counts.items():
                pct_of_place = round((count / len(top_place_group)) * 100, 1)
                pct_of_total = round((count / total) * 100, 1)
                top_place_time_breakdown.append({
                    "hour":          int(hour),
                    "hour_label":    get_hour_label(int(hour)),
                    "count":         int(count),
                    "pct_of_place":  pct_of_place,
                    "pct_of_total":  pct_of_total,
                })

            top_place_time_breakdown.sort(
                key=lambda x: x["count"], reverse=True
            )

        # ── 4. Peak time window at top place ──────────────────────────────────
        peak_window = None
        if top_place_time_breakdown:
            peak_entry = top_place_time_breakdown[0]
            peak_window = {
                "hour":         peak_entry["hour"],
                "hour_label":   peak_entry["hour_label"],
                "count":        peak_entry["count"],
                "pct_of_place": peak_entry["pct_of_place"],
                "pct_of_total": peak_entry["pct_of_total"],
            }

        # ── 5. Place-time concentration score ────────────────────────────────
        # What % of ALL incidents are explained by just the top place + peak hour
        concentration_score = peak_window["pct_of_total"] if peak_window else 0.0
        if concentration_score >= 40:
            concentration_label = "Highly Concentrated"
        elif concentration_score >= 20:
            concentration_label = "Moderately Concentrated"
        else:
            concentration_label = "Dispersed"

        # ── 6. Place group dominant time ──────────────────────────────────────
        # For the dominant group, what hour window has the most incidents
        dominant_group_time = None
        if dominant_group:
            dom_group_name  = dominant_group["group"]
            dom_place_types = [
                p for p, g in PLACE_TYPE_GROUPS.items()
                if g == dom_group_name
            ]
            dom_group_df = group[group["type_of_place"].isin(dom_place_types)]
            if not dom_group_df.empty:
                dom_hour = int(dom_group_df["hour"].mode().iloc[0])
                dom_hour_count = int((dom_group_df["hour"] == dom_hour).sum())
                dominant_group_time = {
                    "hour":       dom_hour,
                    "hour_label": get_hour_label(dom_hour),
                    "count":      dom_hour_count,
                    "percent":    round((dom_hour_count / total) * 100, 1),
                }

        # ── 7. Modus-CSE breakdown ────────────────────────────────────────────
        modus_cse: list[dict[str, Any]] = []
        for modus, m_group in group.groupby("modus"):
            if modus == "Unknown":
                continue
            m_total  = len(m_group)
            m_solved = int((m_group["status_norm"] == "solved").sum())
            m_cce    = int(
                (m_group["status_norm"].isin(["cleared", "solved"])).sum()
            )
            modus_cse.append({
                "modus":       modus,
                "total":       m_total,
                "solved":      m_solved,
                "cse_percent": round((m_solved / m_total) * 100, 1) if m_total else 0.0,
                "cce_percent": round((m_cce   / m_total) * 100, 1) if m_total else 0.0,
                "pct_of_total": round((m_total / total) * 100, 1),
            })
        modus_cse.sort(key=lambda x: x["total"], reverse=True)

        # ── 8. Case age analysis ──────────────────────────────────────────────
        ui_group = group[
            ~group["status_norm"].isin(["cleared", "solved", "closed"])
        ]
        case_age: dict[str, Any] = {
            "ui_count":       int(len(ui_group)),
            "mean_days_open": None,
            "max_days_open":  None,
            "over_30_days":   0,
            "over_90_days":   0,
        }
        if not ui_group.empty:
            now  = pd.Timestamp.now()
            ages = (now - ui_group["date_time_commission"]).dt.days
            case_age.update({
                "mean_days_open": round(float(ages.mean()), 1),
                "max_days_open":  int(ages.max()),
                "over_30_days":   int((ages > 30).sum()),
                "over_90_days":   int((ages > 90).sum()),
            })

        # ── 9. Environmental diagnosis label ─────────────────────────────────
        if dominant_group:
            dg = dominant_group["group"]
            dp = dominant_group["percent"]
            if dg == "Commercial Activity" and dp >= 40:
                env_diagnosis = (
                    f"Crime is primarily driven by commercial activity density. "
                    f"{dp}% of incidents occur at commercial/business place types, "
                    f"suggesting that business establishment concentration and "
                    f"associated foot traffic are the primary environmental factors."
                )
            elif dg == "Residential Environment" and dp >= 40:
                env_diagnosis = (
                    f"Crime is primarily domestic or residential in character. "
                    f"{dp}% of incidents occur in residential settings, "
                    f"suggesting interpersonal or household-origin causes "
                    f"rather than commercial opportunity."
                )
            elif dg == "Public/Open Space" and dp >= 40:
                env_diagnosis = (
                    f"Crime is concentrated in public and open spaces. "
                    f"{dp}% of incidents occur along streets, vacant lots, "
                    f"or open areas — suggesting opportunistic street-level "
                    f"crime rather than establishment-based targeting."
                )
            elif dg == "Transit/Mobile" and dp >= 40:
                env_diagnosis = (
                    f"Crime is transit-oriented. {dp}% of incidents occur "
                    f"onboard vehicles or at transit points, suggesting "
                    f"commuter exposure as the primary vulnerability."
                )
            elif dg == "Leisure/Recreation" and dp >= 40:
                env_diagnosis = (
                    f"Crime is concentrated at recreational venues. "
                    f"{dp}% of incidents occur at resorts, parks, or "
                    f"recreational places — often associated with "
                    f"alcohol consumption or nighttime activity."
                )
            else:
                env_diagnosis = (
                    f"Crime is distributed across multiple place type "
                    f"categories. The dominant group is {dg} at {dp}%, "
                    f"but no single environmental factor accounts for "
                    f"the majority of incidents."
                )
        else:
            env_diagnosis = "Insufficient place type data for environmental diagnosis."

        results.append({
            "crime":                    crime,
            "total":                    total,
            "place_type_distribution":  place_dist,
            "place_group_summary":      group_summary_list,
            "dominant_place_group":     dominant_group,
            "dominant_group_peak_time": dominant_group_time,
            "top_place_type":           top_place_type,
            "top_place_time_breakdown": top_place_time_breakdown[:5],
            "peak_window_at_top_place": peak_window,
            "concentration_score":      concentration_score,
            "concentration_label":      concentration_label,
            "modus_cse_breakdown":      modus_cse[:5],
            "case_age":                 case_age,
            "environmental_diagnosis":  env_diagnosis,
        })

    return {"per_crime": results}


# ─── MODULE 4 — SBA FORECASTING ───────────────────────────────────────────────

def build_full_weekly_series(
    weekly_df: pd.DataFrame,
    date_from: str,
    date_to: str,
) -> pd.DataFrame:
    if weekly_df.empty:
        return weekly_df

    all_weeks = pd.date_range(
        start=pd.Timestamp(date_from) - pd.Timedelta(days=pd.Timestamp(date_from).weekday()),
        end=pd.Timestamp(date_to),
        freq="W-MON",
    ).normalize()

    crime_types = weekly_df["incident_type"].unique()
    index = pd.MultiIndex.from_product(
        [all_weeks, crime_types],
        names=["week_start", "incident_type"],
    )
    full = pd.DataFrame(index=index).reset_index()
    full["week_start"] = pd.to_datetime(full["week_start"])
    weekly_df["week_start"] = pd.to_datetime(weekly_df["week_start"])

    merged = full.merge(weekly_df, on=["week_start", "incident_type"], how="left")
    merged["count"] = merged["count"].fillna(0).astype(int)
    return merged.sort_values(["incident_type", "week_start"]).reset_index(drop=True)


def compute_sba(
    weekly_df: pd.DataFrame,
    date_from: str,
    date_to: str,
) -> dict[str, Any]:
    if weekly_df.empty:
        return {"per_crime": []}

    full_df = build_full_weekly_series(weekly_df, date_from, date_to)
    alpha   = 0.3
    per_crime: list[dict[str, Any]] = []

    for crime, group in full_df.groupby("incident_type"):
        series        = group.sort_values("week_start")["count"].values.astype(float)
        total_weeks   = int(len(series))
        nonzero_idx   = [i for i, v in enumerate(series) if v > 0]
        nonzero_count = len(nonzero_idx)

        if nonzero_count < 4:
            per_crime.append({
                "crime":               crime,
                "trend":               "insufficient_data",
                "predicted_next_week": None,
                "confidence":          0,
                "forecast_state":      "insufficient",
                "nonzero_weeks":       nonzero_count,
                "total_weeks":         total_weeks,
                "method":              "none",
            })
            continue

        demands   = [series[i] for i in nonzero_idx]
        intervals = [nonzero_idx[i] - nonzero_idx[i - 1] for i in range(1, len(nonzero_idx))]

        s_d = float(demands[0])
        s_i = float(intervals[0]) if intervals else 1.0

        for i in range(1, len(demands)):
            s_d = alpha * demands[i] + (1 - alpha) * s_d
            if i <= len(intervals):
                s_i = alpha * intervals[i - 1] + (1 - alpha) * s_i

        # SBA bias correction
        sba_rate  = (1 - alpha / 2) * (s_d / max(s_i, 1.0))
        predicted = max(0, round(sba_rate))

        forecast_state = "full" if nonzero_count >= 10 else "limited"

        # Trend from full series including zeros
        if total_weeks >= 8:
            recent   = series[-4:].mean()
            previous = series[-8:-4].mean()
            pct_change = ((recent - previous) / previous * 100) if previous > 0 else 0.0
            trend = "increasing" if pct_change > 20 else ("decreasing" if pct_change < -20 else "stable")
        else:
            trend = "stable"

        confidence_pct = min(round((nonzero_count / max(total_weeks, 1)) * 100), 85) if forecast_state == "full" else min(round((nonzero_count / 10) * 50), 50)

        per_crime.append({
            "crime":               crime,
            "trend":               trend,
            "predicted_next_week": int(predicted),
            "confidence":          confidence_pct,
            "forecast_state":      forecast_state,
            "nonzero_weeks":       nonzero_count,
            "total_weeks":         total_weeks,
            "method":              "sba",
            "smoothed_demand":     round(s_d, 2),
            "smoothed_interval":   round(s_i, 2),
            "sba_rate":            round(sba_rate, 4),
        })

    return {"per_crime": per_crime}


def compute_barangay_risk(
    incidents_df:    pd.DataFrame,
    date_from:       str,
    date_to:         str,
    decay_window:    int = 90,
    reference_date:  str | None = None,
) -> dict[str, Any]:
    if incidents_df.empty:
        return {"barangay_risk": [], "backtest": None, "decay_window_used": decay_window}

    ref_date = (
    pd.Timestamp(reference_date).normalize() + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
    if reference_date
    else pd.Timestamp(date_to).normalize() + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
)
    total_weeks = max((pd.Timestamp(date_to) - pd.Timestamp(date_from)).days / 7, 1)

    # ── Per-barangay aggregation ──────────────────────────────────────────────
    brgy_group = incidents_df.groupby("place_barangay")

    results: list[dict[str, Any]] = []

    for brgy, group in brgy_group:
        total_incidents = int(len(group))
        freq_rate       = total_incidents / total_weeks

        # Last incident date
        last_dt       = group["date_time_commission"].max()
        days_since    = max(0, int((ref_date - last_dt).days))
        recency_score = max(0.0, 1.0 - (days_since / decay_window))

        # Top crime types
        top_crimes = (
            group["incident_type"]
            .value_counts()
            .head(2)
            .index.tolist()
        )

        # SBA per barangay — only if enough data
        nonzero_weeks_brgy = (
            group.groupby(
                group["date_time_commission"].dt.to_period("W")
            ).size()
        )
        nonzero_count = int((nonzero_weeks_brgy > 0).sum())

        sba_score    = 0.0
        overdue      = False
        avg_interval = None
        tier         = "SPARSE"

        if nonzero_count >= 10:
            tier = "SBA"
            week_starts = sorted(
                group["date_time_commission"]
                .dt.to_period("W")
                .dt.start_time.unique()
            )
            if len(week_starts) > 1:
                intervals_days = [
                    (week_starts[i] - week_starts[i - 1]).days
                    for i in range(1, len(week_starts))
                ]
                s_i = float(intervals_days[0])
                s_d = 1.0
                a   = 0.3
                for iv in intervals_days[1:]:
                    s_i = a * iv + (1 - a) * s_i
                    s_d = a * 1.0 + (1 - a) * s_d
                sba_rate_brgy = (1 - a / 2) * (s_d / max(s_i, 1.0))
                sba_score     = sba_rate_brgy
                avg_interval  = round(s_i, 1)
                overdue       = days_since > s_i

        elif nonzero_count >= 5:
            tier      = "FREQ"
            sba_score = 0.0

        results.append({
            "barangay":       brgy,
            "total":          total_incidents,
            "freq_rate":      round(freq_rate, 4),
            "recency_score":  round(recency_score, 4),
            "sba_score":      round(sba_score, 4),
            "days_since_last": days_since,
            "last_incident":  last_dt.strftime("%b %d, %Y"),
            "top_crimes":     top_crimes,
            "tier":           tier,
            "overdue":        overdue,
            "avg_interval_days": avg_interval,
            "nonzero_weeks":  nonzero_count,
        })

    if not results:
        return {"barangay_risk": [], "backtest": None, "decay_window_used": decay_window}

    # ── Normalize and ensemble ────────────────────────────────────────────────
    max_freq = max(r["freq_rate"] for r in results) or 1.0
    max_sba  = max(r["sba_score"] for r in results) or 1.0

    for r in results:
        freq_norm   = r["freq_rate"] / max_freq
        sba_norm    = r["sba_score"] / max_sba if max_sba > 0 else 0.0
        rec_norm    = r["recency_score"]

        raw_score   = (freq_norm * 0.50) + (sba_norm * 0.30) + (rec_norm * 0.20)
        r["raw_score"] = raw_score

    max_raw = max(r["raw_score"] for r in results) or 1.0
    for r in results:
        r["risk_score"] = round((r["raw_score"] / max_raw) * 100)

        # Why flagged label
        freq_contrib = (r["freq_rate"] / max_freq) * 0.50
        sba_contrib  = (r["sba_score"] / max_sba if max_sba > 0 else 0.0) * 0.30
        rec_contrib  = r["recency_score"] * 0.20

        drivers = sorted(
            [("High frequency", freq_contrib), ("Interval pattern", sba_contrib), ("Recent incident", rec_contrib)],
            key=lambda x: x[1],
            reverse=True,
        )
        top_drivers = [d[0] for d in drivers if d[1] > 0.01][:2]

        extras = []
        if r["overdue"]:
            extras.append(f"overdue by {r['days_since_last'] - int(r['avg_interval_days'] or 0)} days")
        if r["days_since_last"] <= 7:
            extras.append(f"last crime {r['days_since_last']} day(s) ago")

        why_parts = top_drivers + extras
        r["why_flagged"] = " + ".join(why_parts) if why_parts else "Historical frequency"

    results.sort(key=lambda x: x["risk_score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1
        r.pop("raw_score", None)

    # ── Walk-forward backtest ─────────────────────────────────────────────────
    backtest = _run_backtest(incidents_df, date_from, date_to, decay_window)

    return {
        "barangay_risk":     results[:15],
        "all_barangay_risk": results,
        "backtest":          backtest,
        "decay_window_used": decay_window,
        "total_barangays":   len(results),
    }


def _run_backtest(
    incidents_df: pd.DataFrame,
    date_from:    str,
    date_to:      str,
    decay_window: int,
) -> dict[str, Any]:
    total_weeks = (pd.Timestamp(date_to) - pd.Timestamp(date_from)).days // 7
    min_train   = 30

    if total_weeks < min_train + 4:
        return {
            "status":  "insufficient",
            "message": f"Need at least {min_train + 4} weeks of data for backtesting. Have {total_weeks}.",
        }

    train_end_idx  = total_weeks - 8
    fold_results: list[dict[str, Any]] = []

    for fold in range(8):
        fold_end_date = (
            pd.Timestamp(date_from) + pd.Timedelta(weeks=train_end_idx + fold)
        ).strftime("%Y-%m-%d")

        fold_next_start = pd.Timestamp(fold_end_date) + pd.Timedelta(days=1)
        fold_next_end   = fold_next_start + pd.Timedelta(days=6)

        train_df = incidents_df[
            incidents_df["date_time_commission"] <= pd.Timestamp(fold_end_date)
        ].copy()

        actual_df = incidents_df[
            (incidents_df["date_time_commission"] >= fold_next_start) &
            (incidents_df["date_time_commission"] <= fold_next_end)
        ]

        actual_barangays = set(actual_df["place_barangay"].unique())

        if train_df.empty or not actual_barangays:
            continue

        # ── Lightweight inline scoring — no recursive call ────────────────────
        ref_date = pd.Timestamp(fold_end_date).normalize() + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
        total_weeks_train = max(
            (ref_date - pd.Timestamp(date_from)).days / 7, 1
        )

        scores: list[dict[str, Any]] = []

        for brgy, grp in train_df.groupby("place_barangay"):
            total_inc  = len(grp)
            freq_rate  = total_inc / total_weeks_train
            last_dt    = grp["date_time_commission"].max()
            days_since = max(0, int((ref_date - last_dt).days))
            recency    = max(0.0, 1.0 - (days_since / decay_window))

            nonzero_weeks = int(
                grp.groupby(
                    grp["date_time_commission"].dt.to_period("W")
                ).size().gt(0).sum()
            )

            sba_score = 0.0
            if nonzero_weeks >= 10:
                week_starts = sorted(
                    grp["date_time_commission"]
                    .dt.to_period("W")
                    .dt.start_time.unique()
                )
                if len(week_starts) > 1:
                    intervals_days = [
                        (week_starts[i] - week_starts[i - 1]).days
                        for i in range(1, len(week_starts))
                    ]
                    s_i = float(intervals_days[0])
                    s_d = 1.0
                    a   = 0.3
                    for iv in intervals_days[1:]:
                        s_i = a * iv + (1 - a) * s_i
                        s_d = a * 1.0 + (1 - a) * s_d
                    sba_score = (1 - a / 2) * (s_d / max(s_i, 1.0))

            scores.append({
                "barangay":   brgy,
                "freq_rate":  freq_rate,
                "sba_score":  sba_score,
                "recency":    recency,
            })

        if not scores:
            continue

        max_freq = max(s["freq_rate"] for s in scores) or 1.0
        max_sba  = max(s["sba_score"] for s in scores) or 1.0

        for s in scores:
            s["risk"] = (
                (s["freq_rate"] / max_freq) * 0.50 +
                (s["sba_score"] / max_sba if max_sba > 0 else 0.0) * 0.30 +
                s["recency"] * 0.20
            )

        scores.sort(key=lambda x: x["risk"], reverse=True)

        ranked_brgys = [s["barangay"] for s in scores]
        top5  = set(ranked_brgys[:5])
        top10 = set(ranked_brgys[:10])
        top15 = set(ranked_brgys[:15])

        # ── Phase 1 snapshot — top 15 ranking at this fold ───────────────────
        fold_top15_snapshot = [
            {
                "rank":           i + 1,
                "barangay":       s["barangay"],
                "risk_score":     round((s["risk"] / scores[0]["risk"]) * 100) if scores[0]["risk"] > 0 else 0,
                "freq_rate":      round(s["freq_rate"], 4),
                "sba_score":      round(s["sba_score"], 4),
                "recency":        round(s["recency"], 4),
            }
            for i, s in enumerate(scores[:15])
        ]

        actual_ranks = [
            i + 1 for i, b in enumerate(ranked_brgys)
            if b in actual_barangays
        ]
        mean_rank = round(
            sum(actual_ranks) / len(actual_ranks), 1
        ) if actual_ranks else None

        fold_results.append({
            "fold":            fold + 1,
            "train_end":       fold_end_date,
            "test_week_start": fold_next_start.strftime("%Y-%m-%d"),
            "test_week_end":   fold_next_end.strftime("%Y-%m-%d"),
            "actual_brgy":     list(actual_barangays),
            "hit_top5":        bool(actual_barangays & top5),
            "hit_top10":       bool(actual_barangays & top10),
            "hit_top15":       bool(actual_barangays & top15),
            "mean_rank":       mean_rank,
            "phase1_top15":    fold_top15_snapshot,
        })
    if not fold_results:
        return {"status": "insufficient", "message": "No valid folds produced."}

    hit5  = sum(1 for f in fold_results if f["hit_top5"])
    hit10 = sum(1 for f in fold_results if f["hit_top10"])
    hit15 = sum(1 for f in fold_results if f["hit_top15"])
    n     = len(fold_results)
    valid_ranks = [
        f["mean_rank"] for f in fold_results if f["mean_rank"] is not None
    ]

    return {
        "status":         "ok",
        "folds":          n,
        "hit_rate_top5":  round(hit5  / n * 100),
        "hit_rate_top10": round(hit10 / n * 100),
        "hit_rate_top15": round(hit15 / n * 100),
        "mean_rank":      round(sum(valid_ranks) / len(valid_ranks), 1) if valid_ranks else None,
        "per_fold":       fold_results,
        "model_verdict":  (
            "trustworthy" if hit10 / n >= 0.7
            else "use with caution" if hit10 / n >= 0.5
            else "insufficient signal"
        ),
    }


# ─── HEALTH CHECK ──────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"ok": True, "service": "bantay-ai-assessment", "version": "0.4.0"}


# ─── /clusters — HEATMAP DBSCAN ENDPOINT ──────────────────────────────────────

@app.post("/clusters")
def get_clusters(payload: ClustersRequest):
    try:
        incidents_df = get_incidents(
            barangays=payload.barangays,
            date_from=payload.date_from,
            date_to=payload.date_to,
            crime_types=payload.crime_types,
        )
        eps             = get_dbscan_eps(payload.date_from, payload.date_to)
        clusters_result = compute_clusters(incidents_df, eps=eps)
        
        return sanitize_for_json(clusters_result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

def is_significant_ecp(crime_key, per_crime_sba, crime_stat, total_weeks):
    cr = per_crime_sba.get(crime_key, {})

    if cr.get("forecast_state") == "insufficient":
        return False

    if cr.get("trend", "stable") != "increasing":
        return False

    min_incidents = max(3, round(total_weeks * 0.05))
    if crime_stat.get("total", 0) < min_incidents:
        return False

    return True


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

        stats_result       = compute_basic_stats(incidents_df)
        temporal_result    = compute_temporal(incidents_df)
        eps                = get_dbscan_eps(payload.date_from, payload.date_to)
        clusters_result    = compute_clusters(incidents_df, eps=eps)
        diagnostics_result = compute_diagnostics(incidents_df)

        barangay_summary: list[dict[str, Any]] = []
        if not incidents_df.empty and "place_barangay" in incidents_df.columns:
            brgy_vc = (
                incidents_df["place_barangay"]
                .value_counts()
                .reset_index()
            )
            brgy_vc.columns = ["barangay", "count"]
            barangay_summary = brgy_vc.to_dict(orient="records")

        if not historical_weekly_df.empty:
            combined_weekly = (
                historical_weekly_df
                .groupby("week_start")["count"]
                .sum()
                .reset_index()
            )
            combined_weekly["incident_type"] = "ALL_CRIMES"
            historical_with_combined = pd.concat(
                [historical_weekly_df, combined_weekly],
                ignore_index=True,
            )
        else:
            historical_with_combined = historical_weekly_df

        sba_result = compute_sba(
            historical_with_combined,
            payload.date_from,
            payload.date_to,
        )

        overall_forecast = next(
            (x for x in sba_result["per_crime"] if x["crime"] == "ALL_CRIMES"),
            None,
        )
        per_crime_sba = {
            item["crime"]: item
            for item in sba_result["per_crime"]
            if item["crime"] != "ALL_CRIMES"
        }

        for crime_stat in stats_result.get("per_crime", []):
            crime = crime_stat["crime"]
            cr    = per_crime_sba.get(crime, {})
            crime_stat["trend"]               = cr.get("trend", "stable")
            crime_stat["predicted_next_week"] = cr.get("predicted_next_week", None)
            crime_stat["confidence"]          = cr.get("confidence", 0)
            crime_stat["forecast_state"]      = cr.get("forecast_state", "insufficient")
            crime_stat["nonzero_weeks"]       = cr.get("nonzero_weeks", 0)
            crime_stat["forecast_method"]     = cr.get("method", "none")
            date_range_weeks = max(
                (pd.Timestamp(payload.date_to) - pd.Timestamp(payload.date_from)).days / 7,
                1,
            )
            crime_stat["is_ecp"] = is_significant_ecp(
                crime,
                per_crime_sba,
                crime_stat,
                date_range_weeks,
            )

        temporal_map = {
            item["crime"]: item
            for item in temporal_result.get("per_crime", [])
        }
        for crime_stat in stats_result.get("per_crime", []):
            crime = crime_stat["crime"]
            t     = temporal_map.get(crime, {})
            if "peak_hour" not in crime_stat or crime_stat["peak_hour"] is None:
                crime_stat["peak_hour"] = t.get("peak_hour")
            crime_stat["top_3_hours"] = t.get("top_3_hours", [])
            if not crime_stat.get("peak_month") or crime_stat["peak_month"] == "Unknown":
                crime_stat["peak_month"] = t.get("peak_month", "Unknown")

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
            "croston":                {"per_crime": list(per_crime_sba.values())},
            "overall_forecast":       overall_forecast,
            "barangay_summary":       barangay_summary,
            "historical_weekly_rows": historical_rows.to_dict(orient="records"),
            "diagnostics":            diagnostics_result,
        }

        return sanitize_for_json(response)

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ─── /forecast — BARANGAY RISK FORECAST ENDPOINT ──────────────────────────────

@app.post("/forecast")
def forecast(payload: ForecastRequest):
    try:
        incidents_df = get_incidents(
            barangays=payload.barangays,
            date_from=payload.date_from,
            date_to=payload.date_to,
            crime_types=payload.crime_types,
        )

        risk_result = compute_barangay_risk(
            incidents_df,
            payload.date_from,
            payload.date_to,
            decay_window=payload.decay_window,
        )

        return sanitize_for_json(risk_result)

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))