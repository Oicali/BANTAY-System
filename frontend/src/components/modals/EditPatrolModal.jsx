// src/components/modals/EditPatrolModal.jsx
import { useState, useRef, useCallback, useEffect } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./PatrolModal.css";
import LoadingModal from "./LoadingModal";
import Notification from "./Notification";
import TimePicker from "./TimePicker";
import { createPortal } from "react-dom";

const API_BASE = import.meta.env.VITE_API_URL;

const fillLayer = {
  id: "epm-fill",
  type: "fill",
  paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.5 },
};
const outlineLayer = {
  id: "epm-outline",
  type: "line",
  paint: { "line-color": "#1e3a5f", "line-width": 1.5, "line-opacity": 0.7 },
};
const labelLayer = {
  id: "epm-labels",
  type: "symbol",
  layout: {
    "text-field": ["get", "name_db"],
    "text-size": 10,
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
    "text-max-width": 8,
    "text-anchor": "center",
    "text-allow-overlap": false,
  },
  paint: {
    "text-color": "#0a1628",
    "text-halo-color": "rgba(255,255,255,0.85)",
    "text-halo-width": 1.5,
  },
};

const toDateStr = (d) => {
  if (!d) return null;
  if (typeof d === "string") {
    if (d.includes("T") || d.includes("Z")) {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    }
    return d.substring(0, 10);
  }
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
};

const generateDateRange = (start, end) => {
  if (!start || !end) return [];
  const startStr = toDateStr(start);
  const endStr = toDateStr(end);
  if (!startStr || !endStr) return [];
  const dates = [];
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  while (cur <= last) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

const MAX_PATROL_DAYS = 7;

const diffDaysInclusive = (start, end) => {
  const s = toDateStr(start),
    e = toDateStr(end);
  if (!s || !e) return 0;
  const [sy, sm, sd] = s.split("-").map(Number);
  const [ey, em, ed] = e.split("-").map(Number);
  return (
    Math.round(
      (new Date(ey, em - 1, ed) - new Date(sy, sm - 1, sd)) / 86400000,
    ) + 1
  );
};

const addDaysToDateStr = (dateStr, days) => {
  const s = toDateStr(dateStr);
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const maxEndDate = (startDate) =>
  startDate ? addDaysToDateStr(startDate, MAX_PATROL_DAYS - 1) : undefined;

const formatTabDate = (d) => {
  const s = toDateStr(d);
  if (!s) return "—";
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
};

// Runs `worker` over `items` with at most `limit` in flight at once —
// prevents flooding the DB connection pool when saving many dates at once.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    const i = nextIndex++;
    if (i >= items.length) return;
    results[i] = await worker(items[i], i);
    return runNext();
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, runNext),
  );
  return results;
}

// ── Apply Dates Dialog ─────────────────────────────────────────────
const ApplyDatesDialog = ({ dateRange, activeDate, onConfirm, onCancel }) => {
  const [selected, setSelected] = useState([activeDate]);

  const toggle = (date) => {
    if (date === activeDate) return;
    setSelected((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date],
    );
  };

  const formatD = (d) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  };

  return (
    <div className="apd-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="apd-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="apd-title">Apply changes to dates</div>
        <div className="apd-sub">
          Select which dates should receive the changes from the current date.
        </div>
        <div className="apd-dates">
          {dateRange.map((date) => (
            <div
              key={date}
              className={`apd-date-item ${selected.includes(date) ? "apd-selected" : ""} ${date === activeDate ? "apd-current" : ""}`}
              onClick={() => toggle(date)}
            >
              <div
                className={`apd-check ${selected.includes(date) ? "apd-check-on" : ""}`}
              >
                {selected.includes(date) ? "✓" : ""}
              </div>
              <span>{formatD(date)}</span>
              {date === activeDate && (
                <span className="apd-badge">Current</span>
              )}
            </div>
          ))}
        </div>
        <div className="apd-actions">
          <button
            className="apd-btn-all"
            onClick={() => setSelected([...dateRange])}
          >
            Select All
          </button>
          <div style={{ flex: 1 }} />
          <button className="apd-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="apd-btn-confirm"
            onClick={() => onConfirm(selected)}
          >
            Apply &amp; Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Reset Confirm Dialog ─────────────────────────────────────────
const ResetDateConfirmDialog = ({ onConfirm, onCancel }) => {
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1250,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "28px 28px 22px",
          width: "380px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "17px", fontWeight: 700, color: "#0a1628" }}>
          Change Patrol Dates?
        </div>
        <div style={{ fontSize: "13px", color: "#6c757d", lineHeight: 1.6 }}>
          Changing the start or end date will{" "}
          <strong style={{ color: "#212529" }}>
            clear all existing tasks and patroller assignments
          </strong>{" "}
          for this patrol. You'll need to re-assign patrollers and re-add tasks
          for the new dates.
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "8px",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #ced4da",
              borderRadius: "7px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#495057",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 20px",
              background: "#dc2626",
              border: "none",
              borderRadius: "7px",
              fontSize: "13px",
              fontWeight: 700,
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Change Dates &amp; Reset
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ── Confirm Apply-All Dialog (used after a date-range change/reset) ─────
const ConfirmApplyAllDialog = ({ activeDateLabel, onConfirm, onCancel }) => {
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1250,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "28px 28px 22px",
          width: "380px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "17px", fontWeight: 700, color: "#0a1628" }}>
          Save Changes?
        </div>
        <div style={{ fontSize: "13px", color: "#6c757d", lineHeight: 1.6 }}>
          Since the patrol dates were changed,{" "}
          <strong style={{ color: "#212529" }}>
            {activeDateLabel}'s tasks and patroller assignments will be applied
            to every date
          </strong>{" "}
          in the new range. Are you sure you want to save?
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "8px",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #ced4da",
              borderRadius: "7px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#495057",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 20px",
              background: "#1e3a5f",
              border: "none",
              borderRadius: "7px",
              fontSize: "13px",
              fontWeight: 700,
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Yes, Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ── Exit Confirm Dialog ──────────────────────────────────────────
const ExitConfirmDialog = ({ onConfirm, onCancel }) => {
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1260,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "28px 28px 22px",
          width: "380px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "17px", fontWeight: 700, color: "#0a1628" }}>
          Discard Changes?
        </div>
        <div style={{ fontSize: "13px", color: "#6c757d", lineHeight: 1.6 }}>
          You have unsaved changes. Exiting now will{" "}
          <strong style={{ color: "#212529" }}>
            discard everything you've edited
          </strong>{" "}
          in this patrol.
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "8px",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #ced4da",
              borderRadius: "7px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#495057",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Keep Editing
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 20px",
              background: "#dc2626",
              border: "none",
              borderRadius: "7px",
              fontSize: "13px",
              fontWeight: 700,
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Discard &amp; Exit
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ── Main Component ─────────────────────────────────────────────────
const EditPatrolModal = ({
  patrol,
  mobileUnits,
  geoJSONData,
  onClose,
  onSave,
}) => {
  const token = () => sessionStorage.getItem("token");
  const mapRef = useRef(null);
  const deletedRouteIds = useRef(new Set());
  const tasksDirty = useRef(false);
  const pendingRemovedTempIds = useRef(new Set());
  const [addingTask, setAddingTask] = useState(false);

  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState(null);
  const [activeShift, setActiveShift] = useState("AM");
  const activeShiftRef = useRef("AM");
  const [hoveredBrgy, setHoveredBrgy] = useState(null);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [patrollerSearch, setPatrollerSearch] = useState("");
  const [showPatrollers, setShowPatrollers] = useState(false);
  const [patrollerPage, setPatrollerPage] = useState(1);
  const [availableMobileUnits, setAvailableMobileUnits] = useState(null);
  const [loadingMobileUnits, setLoadingMobileUnits] = useState(false);

  const [hoveredPatroller, setHoveredPatroller] = useState(null);
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const [pendingDateChange, setPendingDateChange] = useState(null); // { apply: fn } | null
  const [dateRangeChanged, setDateRangeChanged] = useState(false);
  const [showConfirmAllDialog, setShowConfirmAllDialog] = useState(false);

  // The full list shown in the checklist (available + already assigned to this patrol)
  const [patrollerList, setPatrollerList] = useState([]);
  const [loadingPatrollers, setLoadingPatrollers] = useState(true);

  // routes ref for stale closure fix (mirrors localRoutes)
  const localRoutesRef = useRef([]);

  // live snapshot of patrollersByDate, so the patroller-list fetch can check
  // who's *currently* assigned instead of relying on the stale patrol prop
  const patrollersByDateRef = useRef({});

  // The patrol's original date range exactly as loaded from the server —
  // fixed at mount. Used to detect dates that fell OUT of range after an
  // edit, so their leftover patrol_assignment_patroller rows get cleared
  // on save instead of silently orphaned (they'd otherwise keep showing
  // up in AfterPatrol's "my patrols" list for officers no longer really
  // assigned to any current date).
  const originalDateRangeRef = useRef(
    generateDateRange(
      toDateStr(patrol?.start_date),
      toDateStr(patrol?.end_date),
    ),
  );

  const isPatrolCompleted = (() => {
    const end = toDateStr(patrol?.end_date);
    if (!end) return false;
    return end < toDateStr(new Date());
  })();

  const [form, setForm] = useState({
    patrol_name: patrol?.patrol_name || "",
    mobile_unit_id: patrol?.mobile_unit_id || "",
    start_date: toDateStr(patrol?.start_date) || "",
    end_date: toDateStr(patrol?.end_date) || "",
  });

  // Snapshot of the original values, taken once on open — used only to
  // detect "did anything actually change" when the admin tries to exit.
  const initialFormRef = useRef({
    patrol_name: patrol?.patrol_name || "",
    mobile_unit_id: patrol?.mobile_unit_id || "",
    start_date: toDateStr(patrol?.start_date) || "",
    end_date: toDateStr(patrol?.end_date) || "",
  });

  const [barangays, setBarangays] = useState(() => [
    ...new Set(
      (patrol?.routes || [])
        .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
        .map((r) => r.barangay),
    ),
  ]);

  const initialBarangaysRef = useRef([
    ...new Set(
      (patrol?.routes || [])
        .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
        .map((r) => r.barangay),
    ),
  ]);

  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const [localRoutes, setLocalRoutes] = useState(() => {
    const routes = (patrol?.routes || []).filter(
      (r) => (r.stop_order || 0) > 0,
    );
    localRoutesRef.current = routes;
    return routes;
  });

  const dateRange = generateDateRange(
    toDateStr(form.start_date),
    toDateStr(form.end_date),
  );
  const datesReady = dateRange.length > 0 && form.start_date && form.end_date;

  const [activeDate, setActiveDate] = useState(() => {
    const dates = generateDateRange(
      toDateStr(patrol?.start_date),
      toDateStr(patrol?.end_date),
    );
    return dates[0] || null;
  });

  // ── Per-date patroller state ────────────────────────────────────
  const [patrollersByDate, setPatrollersByDate] = useState(() => {
    const map = {};
    const source = patrol?.patrollers_detail || patrol?.patrollers || [];
    for (const p of source) {
      const d = toDateStr(p.route_date);
      if (!d) continue;
      if (!map[d]) map[d] = { am: [], pm: [] };
      if (p.shift === "AM") map[d].am.push(p.active_patroller_id);
      else map[d].pm.push(p.active_patroller_id);
    }
    return map;
  });

  useEffect(() => {
    patrollersByDateRef.current = patrollersByDate;
  }, [patrollersByDate]);

  // ── Dirty dates ──────────────────────────────────────────────────
  const [dirtyDates, setDirtyDates] = useState(new Set());
  const markDirty = (date) =>
    setDirtyDates((prev) => {
      const n = new Set(prev);
      n.add(date);
      return n;
    });
  const clearDirty = () => setDirtyDates(new Set());

  // ── Load patroller list on mount ─────────────────────────────────
  useEffect(() => {
    if (!patrol?.patrol_id) return;

    const start = toDateStr(form.start_date);
    const end = toDateStr(form.end_date);
    if (!start || !end || end < start) {
      // Dates aren't a valid range right now — the previously fetched list
      // no longer corresponds to anything selectable. Clear it instead of
      // leaving stale, clickable entries on screen.
      setPatrollerList([]);
      setLoadingPatrollers(false);
      return;
    }

    let cancelled = false;
    setLoadingPatrollers(true);

    fetch(
      `${API_BASE}/patrol/available-patrollers?start=${start}&end=${end}&exclude_patrol_id=${patrol.patrol_id}`,
      { headers: { Authorization: `Bearer ${token()}` } },
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const available = data.success ? data.data : [];

        // Only patch in officers still referenced in the *live* in-modal
        // state — not the original patrol prop, which goes stale after
        // date changes/resets (it still lists whoever was assigned when
        // the modal first opened).
        const currentlyAssignedIds = new Set(
          Object.values(patrollersByDateRef.current || {}).flatMap((d) => [
            ...(d.am || []),
            ...(d.pm || []),
          ]),
        );

        const assignedSource =
          patrol?.patrollers_detail || patrol?.patrollers || [];
        const merged = [...available];
        for (const p of assignedSource) {
          if (!currentlyAssignedIds.has(p.active_patroller_id)) continue; // stale — skip
          if (
            !merged.find((m) => m.active_patroller_id === p.active_patroller_id)
          ) {
            merged.push({
              active_patroller_id: p.active_patroller_id,
              officer_name: p.officer_name,
              contact_number: p.contact_number || null,
              profile_picture: p.profile_picture || null,
              rank: p.rank || null,
            });
          }
        }
        merged.sort((a, b) =>
          (a.officer_name || "").localeCompare(b.officer_name || ""),
        );
        setPatrollerList(merged);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Load patrollers error:", err);
        const currentlyAssignedIds = new Set(
          Object.values(patrollersByDateRef.current || {}).flatMap((d) => [
            ...(d.am || []),
            ...(d.pm || []),
          ]),
        );
        const assignedSource = (
          patrol?.patrollers_detail ||
          patrol?.patrollers ||
          []
        ).filter((p) => currentlyAssignedIds.has(p.active_patroller_id));
        const seen = new Set(assignedSource.map((p) => p.active_patroller_id));
        const unique = assignedSource.filter((p) => {
          if (seen.has(p.active_patroller_id)) {
            seen.delete(p.active_patroller_id);
            return true;
          }
          return false;
        });
        setPatrollerList(
          unique.sort((a, b) =>
            (a.officer_name || "").localeCompare(b.officer_name || ""),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingPatrollers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patrol?.patrol_id, form.start_date, form.end_date]);

  useEffect(() => {
    if (!form.start_date || !form.end_date || form.end_date < form.start_date)
      return;

    let cancelled = false;
    setLoadingMobileUnits(true);
    setAvailableMobileUnits(null); // clear stale list immediately so UI can't fall back to it on error

    const debugUrl = `${API_BASE}/patrol/available-mobile-units?start=${form.start_date}&end=${form.end_date}&exclude_patrol_id=${patrol.patrol_id}`;

    fetch(debugUrl, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) {
          setNotif({
            message:
              "Could not check mobile unit availability. Please retry before saving.",
            type: "error",
          });
          return;
        }

        const list = data.data;
        setAvailableMobileUnits(list);

        // If the currently selected unit isn't in the available list for this
        // date range anymore, clear it — same pattern as AddPatrolModal.
        setForm((p) => {
          if (!p.mobile_unit_id) return p;
          const stillAvailable = list.some(
            (u) => Number(u.mobile_unit_id) === Number(p.mobile_unit_id),
          );
          if (stillAvailable) return p;
          setNotif({
            message:
              "The selected mobile unit is unavailable for these dates. Please select a different unit.",
            type: "warning",
          });
          return { ...p, mobile_unit_id: "" };
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Mobile unit availability error:", err);
        setNotif({
          message:
            "Could not check mobile unit availability. Please retry before saving.",
          type: "error",
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingMobileUnits(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.start_date, form.end_date]);

  // Derived for current date + shift
  const activeDatePatrollers = patrollersByDate[activeDate] || {
    am: [],
    pm: [],
  };
  const currentPatrollerIds =
    activeShift === "AM" ? activeDatePatrollers.am : activeDatePatrollers.pm;
  const otherShiftIds =
    activeShift === "AM" ? activeDatePatrollers.pm : activeDatePatrollers.am;

  const togglePatroller = (id) => {
    if (isPatrolCompleted) return;
    if (!activeDate) return; // no valid date selected yet — nothing to assign to
    if (otherShiftIds.includes(id)) {
      setNotif({
        message: `This patroller is already assigned to the ${activeShift === "AM" ? "PM" : "AM"} shift on this date.`,
        type: "warning",
      });
      return;
    }
    markDirty(activeDate);
    setPatrollersByDate((prev) => {
      const existing = prev[activeDate] || { am: [], pm: [] };
      const key = activeShift === "AM" ? "am" : "pm";
      const ids = existing[key];
      return {
        ...prev,
        [activeDate]: {
          ...existing,
          [key]: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
        },
      };
    });
  };

  // ── Routes / tasks ──────────────────────────────────────────────
  // PM-aware normalizer (same as AddPatrolModal)
  const toPmMin = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    const raw = h * 60 + m;
    return raw < 12 * 60 ? raw + 24 * 60 : raw;
  };

  const toMin = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  // Sort routes for display — PM-aware
  const routesForDateShift = localRoutes
    .filter(
      (r) => toDateStr(r.route_date) === activeDate && r.shift === activeShift,
    )
    .slice()
    .sort((a, b) => {
      if (activeShift === "PM")
        return toPmMin(a.time_start) - toPmMin(b.time_start);
      return toMin(a.time_start) - toMin(b.time_start);
    });

  const handleTaskChange = (routeId, field, value) => {
    if (isPatrolCompleted) return;
    tasksDirty.current = true;
    setLocalRoutes((prev) => {
      const next = prev.map((r) =>
        r.route_id === routeId ? { ...r, [field]: value } : r,
      );
      localRoutesRef.current = next;
      return next;
    });
  };

  // ── Add task (optimistic — updates UI immediately, reconciles after API call) ──
  const addTask = async () => {
    if (isPatrolCompleted || addingTask) return; // prevent double submits from producing duplicate times
    const existing = localRoutesRef.current
      .filter(
        (r) =>
          toDateStr(r.route_date) === activeDate && r.shift === activeShift,
      )
      .slice()
      .sort((a, b) =>
        activeShift === "PM"
          ? toPmMin(a.time_start) - toPmMin(b.time_start)
          : toMin(a.time_start) - toMin(b.time_start),
      );

    // Limit check
    const AM_END = 20 * 60;

    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      if (last.time_end) {
        if (activeShift === "AM" && toMin(last.time_end) >= AM_END) {
          setNotif({
            message: "AM shift tasks cannot go past 8:00 PM.",
            type: "warning",
          });
          return;
        }
        if (activeShift === "PM") {
          const pmMinutes = toPmMin(last.time_end) - 20 * 60;
          if (pmMinutes >= 12 * 60) {
            setNotif({
              message: "PM shift tasks cannot go past 8:00 AM.",
              type: "warning",
            });
            return;
          }
        }
      }
    }

    // Default start
    let defaultStart;
    if (existing.length === 0) {
      defaultStart = activeShift === "AM" ? "08:00" : "20:00";
    } else {
      const last = existing[existing.length - 1];
      if (last.time_end) {
        const total = toMin(last.time_end) + 1;
        defaultStart = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      } else {
        defaultStart =
          last.time_start || (activeShift === "AM" ? "08:00" : "20:00");
      }
    }

    // Default end = start + 60 min (first task) or + 59 min (subsequent)
    const [dh, dm] = defaultStart.split(":").map(Number);
    const isFirst = existing.length === 0;
    const endTotal = dh * 60 + dm + (isFirst ? 60 : 59);
    const defaultEnd = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;

    const newStopOrder = existing.length + 1;
    const tempId = `temp-${Date.now()}`;

    const optimisticTask = {
      route_id: tempId,
      route_date: activeDate,
      shift: activeShift,
      time_start: defaultStart,
      time_end: defaultEnd,
      notes: "",
      stop_order: newStopOrder,
    };

    tasksDirty.current = true;
    setAddingTask(true);
    setLocalRoutes((prev) => {
      const next = [...prev, optimisticTask];
      localRoutesRef.current = next;
      return next;
    });

    try {
      const res = await fetch(`${API_BASE}/patrol/routes/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          patrol_id: patrol.patrol_id,
          route_date: activeDate,
          shift: activeShift,
          time_start: defaultStart,
          time_end: defaultEnd,
          notes: null,
          stop_order: newStopOrder,
        }),
      });
      const data = await res.json();

      if (data.success) {
        if (pendingRemovedTempIds.current.has(tempId)) {
          // user already removed this row while the request was in flight
          pendingRemovedTempIds.current.delete(tempId);
          deletedRouteIds.current.add(data.route_id);
        } else {
          setLocalRoutes((prev) => {
            const next = prev.map((r) =>
              r.route_id === tempId ? { ...r, route_id: data.route_id } : r,
            );
            localRoutesRef.current = next;
            return next;
          });
        }
      } else {
        pendingRemovedTempIds.current.delete(tempId);
        setLocalRoutes((prev) => {
          const next = prev.filter((r) => r.route_id !== tempId);
          localRoutesRef.current = next;
          return next;
        });
        setNotif({
          message: data.message || "Failed to add task.",
          type: "warning",
        });
      }
    } catch (err) {
      console.error("Add task error:", err);
      pendingRemovedTempIds.current.delete(tempId);
      setLocalRoutes((prev) => {
        const next = prev.filter((r) => r.route_id !== tempId);
        localRoutesRef.current = next;
        return next;
      });
      setNotif({
        message: "Failed to add task. Please try again.",
        type: "error",
      });
    } finally {
      setAddingTask(false);
    }
  };

  const removeTask = (routeId) => {
    if (isPatrolCompleted) return;
    tasksDirty.current = true;
    if (typeof routeId === "string" && routeId.startsWith("temp-")) {
      pendingRemovedTempIds.current.add(routeId);
    } else {
      deletedRouteIds.current.add(routeId);
    }
    setLocalRoutes((prev) => {
      const next = prev.filter((r) => r.route_id !== routeId);
      localRoutesRef.current = next;
      return next;
    });
  };

  const handleSave = () => {
    if (isPatrolCompleted) {
      setNotif({
        message: "This patrol has already ended and can no longer be edited.",
        type: "warning",
      });
      return;
    }
    if (
      !form.patrol_name.trim() ||
      !form.mobile_unit_id ||
      !form.start_date ||
      !form.end_date
    ) {
      setNotif({
        message: "Please fill in all required fields.",
        type: "warning",
      });
      return;
    }
    if (loadingMobileUnits) {
      setNotif({
        message: "Please wait while we check mobile unit availability.",
        type: "warning",
      });
      return;
    }
    if (availableMobileUnits === null) {
      setNotif({
        message: "Mobile unit availability hasn't loaded yet. Please retry.",
        type: "warning",
      });
      return;
    }
    {
      const selectedEntry = availableMobileUnits.find(
        (u) => Number(u.mobile_unit_id) === Number(form.mobile_unit_id),
      );
      if (!selectedEntry) {
        setNotif({
          message:
            "The selected mobile unit is unavailable for these dates. Please select a different unit.",
          type: "warning",
        });
        return;
      }
    }
    if (toDateStr(form.end_date) < toDateStr(form.start_date)) {
      setNotif({
        message: "End date must be on or after start date.",
        type: "warning",
      });
      return;
    }
    if (diffDaysInclusive(form.start_date, form.end_date) > MAX_PATROL_DAYS) {
      setNotif({
        message: `Patrol duration cannot exceed ${MAX_PATROL_DAYS} days.`,
        type: "warning",
      });
      return;
    }

    const taskRoutes = localRoutes.filter((r) => (r.stop_order || 0) > 0);

    // Per-task validation — PM-aware
    for (const r of taskRoutes) {
      if (!r.time_start || !r.time_end) {
        setNotif({
          message: "All tasks must have both a start and end time.",
          type: "warning",
        });
        return;
      }
      const effectiveStart =
        r.shift === "PM" ? toPmMin(r.time_start) : toMin(r.time_start);
      const effectiveEnd =
        r.shift === "PM" ? toPmMin(r.time_end) : toMin(r.time_end);
      if (effectiveEnd <= effectiveStart) {
        setNotif({
          message: "A task's end time must be after its start time.",
          type: "warning",
        });
        return;
      }
    }

    // Overlap check — PM-aware
    const groupKeys = [
      ...new Set(
        taskRoutes.map((r) => `${toDateStr(r.route_date)}__${r.shift}`),
      ),
    ];
    for (const key of groupKeys) {
      const [date, shift] = key.split("__");
      const group = taskRoutes
        .filter((r) => toDateStr(r.route_date) === date && r.shift === shift)
        .slice()
        .sort((a, b) => {
          const norm = (t) => {
            const [h, m] = t.split(":").map(Number);
            const raw = h * 60 + m;
            return shift === "PM" && raw < 12 * 60 ? raw + 24 * 60 : raw;
          };
          return norm(a.time_start) - norm(b.time_start);
        });

      for (let i = 0; i < group.length - 1; i++) {
        const norm = (t) => {
          const [h, m] = t.split(":").map(Number);
          const raw = h * 60 + m;
          return shift === "PM" && raw < 12 * 60 ? raw + 24 * 60 : raw;
        };
        if (norm(group[i].time_end) > norm(group[i + 1].time_start)) {
          const fmt = (t) => {
            const [h, m] = t.split(":").map(Number);
            const h12 = h % 12 === 0 ? 12 : h % 12;
            return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
          };
          setNotif({
            message: `Task overlap on ${shift}: ${fmt(group[i].time_start)}–${fmt(group[i].time_end)} overlaps ${fmt(group[i + 1].time_start)}–${fmt(group[i + 1].time_end)}.`,
            type: "warning",
          });
          return;
        }
      }
    }

    if (dateRangeChanged) {
      setShowConfirmAllDialog(true);
      return;
    }

    if (dateRange.length > 1 && (tasksDirty.current || dirtyDates.size > 0)) {
      setShowApplyDialog(true);
    } else {
      executeSave([activeDate]);
    }
  };

  // ── Execute save ────────────────────────────────────────────────
  const executeSave = async (selectedDates) => {
    // Every date about to receive a patroller update must end up staffed.
    // A date unchecked in the Apply Dates dialog keeps its own individual
    // state — which, right after a date-range reset, is still empty unless
    // the admin visited that tab directly. Catch that here instead of
    // silently saving an unstaffed date.
    const patrollerDatesToCheck = [
      ...new Set([...selectedDates, ...dirtyDates]),
    ].filter((d) => dateRange.includes(d));

    // If any date is set to inherit the active date's roster, the active
    // date's own assignment must be non-empty first — everything else
    // downstream depends on it.
    const activeDateWillBeCopied = patrollerDatesToCheck.some((d) =>
      selectedDates.includes(d),
    );
    if (activeDateWillBeCopied) {
      const activeDp = patrollersByDate[activeDate] || { am: [], pm: [] };
      const activeIsEmpty =
        (activeDp.am?.length || 0) === 0 && (activeDp.pm?.length || 0) === 0;
      if (activeIsEmpty) {
        setNotif({
          message: `Assign at least one patroller to ${formatTabDate(activeDate)} before saving — it will be copied to the other checked dates.`,
          type: "warning",
        });
        return;
      }
    }

    for (const date of patrollerDatesToCheck) {
      if (selectedDates.includes(date)) continue; // already validated via activeDate above
      const dp = patrollersByDate[date] || { am: [], pm: [] };
      const isEmpty = (dp.am?.length || 0) === 0 && (dp.pm?.length || 0) === 0;
      if (isEmpty) {
        setNotif({
          message: `${formatTabDate(date)} has no patrollers assigned. Assign at least one patroller on that date, or check it in the Apply Dates dialog to copy ${formatTabDate(activeDate)}'s assignments.`,
          type: "warning",
        });
        return;
      }
    }

    setShowApplyDialog(false);
    tasksDirty.current = false;
    setLoading(true);

    try {
      // Routes work (delete removed tasks, then patch/create the rest) and
      // patroller work touch different tables with no dependency on each
      // other, so run them concurrently instead of awaiting one before
      // starting the other — roughly halves save time when both changed.
      const routesWork = (async () => {
        // 1. Delete removed tasks + propagate to other selected dates
        const idsToDelete = [...deletedRouteIds.current];
        const deletedTaskDetails = idsToDelete
          .map((rid) => patrol.routes.find((r) => r.route_id === rid))
          .filter(Boolean);
        const allIdsToDelete = new Set(idsToDelete);

        for (const deletedTask of deletedTaskDetails) {
          for (const date of selectedDates) {
            if (date === activeDate) continue;
            const match = localRoutes.find(
              (r) =>
                toDateStr(r.route_date) === toDateStr(date) &&
                r.shift === deletedTask.shift &&
                Number(r.stop_order) === Number(deletedTask.stop_order),
            );
            if (match) allIdsToDelete.add(match.route_id);
          }
        }

        await Promise.all(
          [...allIdsToDelete].map((rid) =>
            fetch(`${API_BASE}/patrol/routes/${rid}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token()}` },
            }),
          ),
        );
        deletedRouteIds.current.clear();

        // 2. Patch / create tasks across selected dates
        const activeTasks = localRoutes.filter(
          (r) =>
            (r.stop_order || 0) > 0 && toDateStr(r.route_date) === activeDate,
        );
        const patchRequests = [];

        for (const date of selectedDates) {
          if (date === activeDate) {
            for (const r of activeTasks) {
              patchRequests.push(
                fetch(`${API_BASE}/patrol/routes/${r.route_id}/task`, {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token()}`,
                  },
                  body: JSON.stringify({
                    time_start: r.time_start || null,
                    time_end: r.time_end || null,
                    notes: r.notes || null,
                  }),
                }),
              );
            }
          } else {
            for (const activeTask of activeTasks) {
              const match = localRoutes.find(
                (r) =>
                  toDateStr(r.route_date) === toDateStr(date) &&
                  r.shift === activeTask.shift &&
                  Number(r.stop_order) === Number(activeTask.stop_order),
              );
              patchRequests.push(
                match
                  ? fetch(`${API_BASE}/patrol/routes/${match.route_id}/task`, {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token()}`,
                      },
                      body: JSON.stringify({
                        time_start: activeTask.time_start || null,
                        time_end: activeTask.time_end || null,
                        notes: activeTask.notes || null,
                      }),
                    })
                  : fetch(`${API_BASE}/patrol/routes/add`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token()}`,
                      },
                      body: JSON.stringify({
                        patrol_id: patrol.patrol_id,
                        route_date: date,
                        shift: activeTask.shift,
                        time_start: activeTask.time_start || null,
                        time_end: activeTask.time_end || null,
                        notes: activeTask.notes || null,
                        stop_order: activeTask.stop_order,
                      }),
                    }),
              );
            }
          }
        }
        await Promise.all(patchRequests);
      })();

      // 3. Save patrollers — dates checked in the Apply Dates dialog mirror
      // the active date's assignments; unchecked (but still dirty) dates
      // keep whatever was set for them individually — a reset-to-empty
      // state, or a manually customized assignment made on that date's tab.
      // Dates that were in the patrol's original range but fell out after
      // this edit — clear their assignments server-side (empty am/pm),
      // rather than leaving orphaned rows a former patroller is still
      // linked to.
      const datesToClear = originalDateRangeRef.current.filter(
        (d) => !dateRange.includes(d),
      );

      const patrollerDatestoSave = [
        ...new Set([...selectedDates, ...dirtyDates, ...datesToClear]),
      ].filter((d) => dateRange.includes(d) || datesToClear.includes(d));

      const activeDatePatrollerState = patrollersByDate[activeDate] || {
        am: [],
        pm: [],
      };

      const patrollerWork = mapWithConcurrency(
        patrollerDatestoSave,
        3,
        (date) => {
          const dp = selectedDates.includes(date)
            ? activeDatePatrollerState
            : patrollersByDate[date] || { am: [], pm: [] };
          return fetch(
            `${API_BASE}/patrol/patrols/${patrol.patrol_id}/patrollers/${date}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token()}`,
              },
              body: JSON.stringify({
                patroller_ids_am: dp.am,
                patroller_ids_pm: dp.pm,
              }),
            },
          ).then((r) => r.json().then((data) => ({ ...data, __date: date })));
        },
      );

      const [, patrollerResults] = await Promise.all([
        routesWork,
        patrollerWork,
      ]);

      const failure = patrollerResults.find((r) => !r.success);
      if (failure) {
        setLoading(false);
        if (failure.conflict) {
          // Real double-booking conflict — jump straight to the exact
          // date AND shift holding the conflicting patroller, since it's
          // almost always a leftover assignment on a tab the admin never
          // opened this session (otherwise invisible).
          const dp = patrollersByDate[failure.__date] || { am: [], pm: [] };
          const conflictId = failure.conflicting_patroller_id;
          const shiftWithConflict =
            conflictId != null &&
            dp.pm.includes(conflictId) &&
            !dp.am.includes(conflictId)
              ? "PM"
              : "AM";

          setActiveDate(failure.__date);
          setActiveShift(shiftWithConflict);
          activeShiftRef.current = shiftWithConflict;
          setShowPatrollers(true);

          // Pull the officer's name out of the message so the search box
          // filters straight down to them.
          const nameMatch = failure.message?.match(
            /^(.+?) is already assigned/,
          );
          setPatrollerSearch(nameMatch ? nameMatch[1] : "");

          setNotif({
            message: `${failure.message} You've been switched to ${formatTabDate(failure.__date)} (${shiftWithConflict} shift) — remove them, then save again.`,
            type: "warning",
          });
        } else {
          // Generic server/network failure (timeout, DB error, etc.) —
          // don't imply it's a patroller assignment problem.
          setNotif({
            message:
              failure.message || "Failed to save patrollers. Please try again.",
            type: "error",
          });
        }
        return;
      }

      // ── Aggregate newly-added patrollers across all saved dates into ONE notification per officer ──
      const assignmentMap = {};
      patrollerDatestoSave.forEach((date, idx) => {
        const { am = [], pm = [] } = patrollerResults[idx]?.newlyAdded || {};
        am.forEach((pid) => {
          assignmentMap[pid] ??= { dates: [], shifts: [] };
          assignmentMap[pid].dates.push(date);
          assignmentMap[pid].shifts.push("AM");
        });
        pm.forEach((pid) => {
          assignmentMap[pid] ??= { dates: [], shifts: [] };
          assignmentMap[pid].dates.push(date);
          assignmentMap[pid].shifts.push("PM");
        });
      });

      if (Object.keys(assignmentMap).length > 0) {
        fetch(
          `${API_BASE}/patrol/patrols/${patrol.patrol_id}/notify-assignments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token()}`,
            },
            body: JSON.stringify({ assignments: assignmentMap }),
          },
        ).catch((err) => console.error("notify-assignments error:", err));
      }

      clearDirty();
      setDateRangeChanged(false);

      // 4. Save patrol info + barangays
      await onSave({
        ...form,
        patrol_name: form.patrol_name.trim(),
        barangays,
      });
      setLoading(false);
    } catch (err) {
      console.error("Save error:", err);
      setLoading(false);
      setNotif({ message: "Failed to save. Please try again.", type: "error" });
    }
  };

  // ── Map ─────────────────────────────────────────────────────────
  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData) return null;
    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: barangays.includes(f.properties.name_db)
            ? "#1e3a5f"
            : "#adb5bd",
        },
      })),
    };
  }, [geoJSONData, barangays]);

  const handleMapClick = useCallback(
    (e) => {
      if (isPatrolCompleted || !geoJSONData) return;
      const { lng, lat } = e.lngLat;
      const inside = (pt, vs) => {
        let x = pt[0],
          y = pt[1],
          inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
          let xi = vs[i][0],
            yi = vs[i][1],
            xj = vs[j][0],
            yj = vs[j][1];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            inside = !inside;
        }
        return inside;
      };
      for (const f of geoJSONData.features) {
        const rings =
          f.geometry.type === "Polygon"
            ? [f.geometry.coordinates[0]]
            : f.geometry.coordinates.map((p) => p[0]);
        for (const ring of rings) {
          if (inside([lng, lat], ring)) {
            const name = f.properties.name_db;
            setBarangays((prev) =>
              prev.includes(name)
                ? prev.filter((b) => b !== name)
                : [...prev, name],
            );
            return;
          }
        }
      }
    },
    [geoJSONData],
  );

  const getInitials = (name) =>
    name ? name.substring(0, 2).toUpperCase() : "NA";

  // Anything that would be lost by closing without saving.
  const hasUnsavedChanges = () => {
    if (tasksDirty.current) return true;
    if (dirtyDates.size > 0) return true;
    if (dateRangeChanged) return true;

    const orig = initialFormRef.current;
    if (form.patrol_name !== orig.patrol_name) return true;
    if (Number(form.mobile_unit_id) !== Number(orig.mobile_unit_id))
      return true;
    if (form.start_date !== orig.start_date) return true;
    if (form.end_date !== orig.end_date) return true;

    const origB = initialBarangaysRef.current;
    if (
      barangays.length !== origB.length ||
      barangays.some((b) => !origB.includes(b))
    )
      return true;

    return false;
  };

  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  // Clamp activeDate back into range if a date change ever leaves it dangling.
  // While dateRangeChanged is true, force it to the first date — that's the
  // one "template" day being edited before it gets stamped across the range,
  // so there's nothing meaningful to switch between yet.
  useEffect(() => {
    if (dateRange.length === 0) {
      if (activeDate !== null) setActiveDate(null);
      return;
    }
    if (dateRangeChanged) {
      if (activeDate !== dateRange[0]) setActiveDate(dateRange[0]);
      return;
    }
    if (!dateRange.includes(activeDate)) setActiveDate(dateRange[0]);
  }, [dateRange, activeDate, dateRangeChanged]);

  // Prune any dirty/patroller-state entries that fall outside the current
  // date range — e.g. after changing start/end date, old dates like Sep 10
  // must not linger as "dirty" once they're no longer part of the patrol.
  useEffect(() => {
    const rangeSet = new Set(dateRange);

    setDirtyDates((prev) => {
      const filtered = [...prev].filter((d) => rangeSet.has(d));
      return filtered.length === prev.size ? prev : new Set(filtered);
    });

    setPatrollersByDate((prev) => {
      const keys = Object.keys(prev);
      const staleKeys = keys.filter((d) => !rangeSet.has(d));
      if (staleKeys.length === 0) return prev;
      const next = { ...prev };
      staleKeys.forEach((d) => delete next[d]);
      return next;
    });
  }, [dateRange]);

  const hasExistingWork = () =>
    localRoutes.some((r) => (r.stop_order || 0) > 0) ||
    Object.values(patrollersByDate).some(
      (d) => (d.am?.length || 0) > 0 || (d.pm?.length || 0) > 0,
    );

  const applyStartDateChange = (newStart) => {
    setDateRangeChanged(true);
    setForm((p) => {
      if (
        p.end_date &&
        diffDaysInclusive(newStart, p.end_date) > MAX_PATROL_DAYS
      ) {
        setNotif({
          message: `Patrol duration is limited to ${MAX_PATROL_DAYS} days. Please re-select the end date.`,
          type: "warning",
        });
        return { ...p, start_date: newStart, end_date: "" };
      }
      if (p.end_date && p.end_date < newStart) {
        return { ...p, start_date: newStart, end_date: "" };
      }
      return { ...p, start_date: newStart };
    });
  };

  const applyEndDateChange = (newEnd) => {
    setDateRangeChanged(true);
    setForm((p) => ({ ...p, end_date: newEnd }));
  };

  const resetTasksAndPatrollers = () => {
    // Queue every real (non-temp) task route for deletion on save
    localRoutes
      .filter(
        (r) =>
          (r.stop_order || 0) > 0 && !String(r.route_id).startsWith("temp-"),
      )
      .forEach((r) => deletedRouteIds.current.add(r.route_id));
    pendingRemovedTempIds.current.clear();
    setLocalRoutes([]);
    localRoutesRef.current = [];
    tasksDirty.current = true;

    // Mark every date that currently has patroller assignments dirty so the
    // clear propagates to the server on save
    const datesWithPatrollers = Object.keys(patrollersByDate);
    setDirtyDates((prev) => {
      const next = new Set(prev);
      datesWithPatrollers.forEach((d) => next.add(d));
      return next;
    });
    setPatrollersByDate({});
  };

  const handleStartDateChange = (e) => {
    if (isPatrolCompleted) return;
    const newStart = e.target.value;
    if (!newStart) {
      setForm((p) => ({ ...p, start_date: "" }));
      return;
    }
    if (newStart === form.start_date) return;

    if (hasExistingWork()) {
      setPendingDateChange({ apply: () => applyStartDateChange(newStart) });
      return;
    }
    applyStartDateChange(newStart);
  };

  const handleEndDateChange = (e) => {
    if (isPatrolCompleted) return;
    const newEnd = e.target.value;
    if (!newEnd) {
      setForm((p) => ({ ...p, end_date: "" }));
      return;
    }

    if (!form.start_date) {
      setNotif({
        message: "Please select a start date first.",
        type: "warning",
      });
      return;
    }
    if (newEnd < form.start_date) {
      setNotif({
        message: "End date cannot be before start date.",
        type: "warning",
      });
      return;
    }
    if (diffDaysInclusive(form.start_date, newEnd) > MAX_PATROL_DAYS) {
      setNotif({
        message: `Patrol duration cannot exceed ${MAX_PATROL_DAYS} days (max: ${maxEndDate(form.start_date)}).`,
        type: "warning",
      });
      return;
    }
    if (newEnd === form.end_date) return;

    if (hasExistingWork()) {
      setPendingDateChange({ apply: () => applyEndDateChange(newEnd) });
      return;
    }
    applyEndDateChange(newEnd);
  };

  const filteredPatrollers = patrollerList.filter((p) =>
    (p.officer_name || "")
      .toLowerCase()
      .includes(patrollerSearch.toLowerCase()),
  );

  if (!patrol) return null;

  return (
    <div className="epm-overlay">
      <div className="epm-modal" onClick={(e) => e.stopPropagation()}>
        {/* TOP BAR */}
        <div className="epm-topbar">
          <div className="epm-topbar-fields">
            <div className="epm-field">
              <label>
                Patrol Name <span className="epm-req">*</span>
              </label>
              <input
                type="text"
                value={form.patrol_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, patrol_name: e.target.value }))
                }
                placeholder="e.g. Sector 6 Beat 2"
                disabled={isPatrolCompleted}
              />
            </div>
            <div className="epm-field">
              <label>
                Mobile Unit <span className="epm-req">*</span>
              </label>
              <select
                value={form.mobile_unit_id}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    mobile_unit_id: e.target.value
                      ? Number(e.target.value)
                      : "",
                  }))
                }
                disabled={loadingMobileUnits || isPatrolCompleted}
              >
                {loadingMobileUnits ? (
                  <option value="">Loading...</option>
                ) : availableMobileUnits === null ? (
                  <option value="">— Select —</option>
                ) : availableMobileUnits.length === 0 ? (
                  <option value="">No units available</option>
                ) : (
                  <>
                    <option value="">— Select Mobile Unit —</option>
                    {availableMobileUnits.map((mu) => (
                      <option key={mu.mobile_unit_id} value={mu.mobile_unit_id}>
                        {mu.mobile_unit_name} ({mu.plate_number})
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div className="epm-field">
              <label>
                Start Date <span className="epm-req">*</span>
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={handleStartDateChange}
                disabled={isPatrolCompleted}
              />
            </div>
            <div className="epm-field">
              <label>
                End Date <span className="epm-req">*</span>
              </label>
              <input
                type="date"
                value={form.end_date}
                min={form.start_date}
                max={maxEndDate(form.start_date)}
                onChange={handleEndDateChange}
                disabled={isPatrolCompleted}
              />
            </div>
          </div>
          <div className="epm-topbar-actions">
            <button
              className="epm-btn-cancel epm-btn-cancel-desktop"
              onClick={handleCloseAttempt}
            >
              Cancel
            </button>
            <button
              className="epm-btn-save"
              onClick={handleSave}
              disabled={isPatrolCompleted}
              title={
                isPatrolCompleted
                  ? "This patrol has ended and is read-only"
                  : undefined
              }
            >
              Save Changes
            </button>
            <button className="epm-btn-x" onClick={handleCloseAttempt}>
              ✕
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="epm-body">
          {/* LEFT — Map */}
          <div className="epm-map-panel">
            {hoveredBrgy && (
              <div className="epm-map-tooltip">
                <strong>{hoveredBrgy}</strong>
                {barangays.includes(hoveredBrgy)
                  ? " — Click to remove"
                  : " — Click to add"}
              </div>
            )}
            <Map
              ref={mapRef}
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
              initialViewState={{
                longitude: 120.964,
                latitude: 14.4341,
                zoom: 12,
              }}
              style={{ width: "100%", height: "100%" }}
              mapStyle="mapbox://styles/mapbox/light-v11"
              onClick={handleMapClick}
              onMouseMove={(e) => {
                if (!geoJSONData) return;
                const features = e.target.queryRenderedFeatures(e.point, {
                  layers: ["epm-fill"],
                });
                if (features.length > 0) {
                  e.target.getCanvas().style.cursor = "pointer";
                  setHoveredBrgy(features[0].properties.name_db);
                } else {
                  e.target.getCanvas().style.cursor = "";
                  setHoveredBrgy(null);
                }
              }}
              onMouseLeave={() => setHoveredBrgy(null)}
            >
              {buildGeoJSON() && (
                <Source id="epm-barangays" type="geojson" data={buildGeoJSON()}>
                  <Layer {...fillLayer} />
                  <Layer {...outlineLayer} />
                  <Layer {...labelLayer} />
                </Source>
              )}
            </Map>
            {barangays.length > 0 && (
              <div className="epm-brgy-tags">
                {barangays.map((b) => (
                  <span key={b} className="epm-brgy-tag">
                    {b}
                    <button
                      onClick={() =>
                        setBarangays((prev) => prev.filter((x) => x !== b))
                      }
                      disabled={isPatrolCompleted}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="pm-map-controls">
              <button
                className="pm-map-ctrl-btn"
                title="Zoom in"
                onClick={() =>
                  mapRef.current?.getMap?.().zoomIn({ duration: 300 })
                }
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <div className="pm-map-ctrl-divider" />
              <button
                className="pm-map-ctrl-btn"
                title="Zoom out"
                onClick={() =>
                  mapRef.current?.getMap?.().zoomOut({ duration: 300 })
                }
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <div className="pm-map-ctrl-divider" />
              <button
                className="pm-map-ctrl-btn"
                title="Fit to barangays"
                onClick={() => {
                  const map = mapRef.current?.getMap?.();
                  if (!map || barangays.length === 0 || !geoJSONData) return;
                  const coords = [];
                  for (const f of geoJSONData.features) {
                    if (barangays.includes(f.properties.name_db)) {
                      const rings =
                        f.geometry.type === "Polygon"
                          ? [f.geometry.coordinates[0]]
                          : f.geometry.coordinates.map((p) => p[0]);
                      for (const ring of rings) coords.push(...ring);
                    }
                  }
                  if (coords.length === 0) return;
                  const lngs = coords.map((c) => c[0]);
                  const lats = coords.map((c) => c[1]);
                  map.fitBounds(
                    [
                      [Math.min(...lngs), Math.min(...lats)],
                      [Math.max(...lngs), Math.max(...lats)],
                    ],
                    { padding: 60, duration: 800 },
                  );
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
              <div className="pm-map-ctrl-divider" />
              <button
                className="pm-map-ctrl-btn"
                title="Fullscreen"
                onClick={() => {
                  const el = document.querySelector(".epm-map-panel");
                  if (!document.fullscreenElement) el?.requestFullscreen();
                  else document.exitFullscreen();
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </button>
            </div>
          </div>

          {/* RIGHT panel */}
          <div className="epm-info-panel">
            {isPatrolCompleted && (
              <div
                style={{
                  background: "#e9ecef",
                  border: "1px solid #adb5bd",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "12.5px",
                  color: "#495057",
                  marginBottom: "10px",
                  lineHeight: 1.5,
                }}
              >
                <strong>This patrol has ended.</strong> It's view-only — dates,
                tasks, and patrollers can't be changed.
              </div>
            )}

            {dateRangeChanged && (
              <div
                style={{
                  background: "#fff3cd",
                  border: "1px solid #ffc107",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "12.5px",
                  color: "#856404",
                  marginBottom: "10px",
                  lineHeight: 1.5,
                }}
              >
                <strong>Dates were changed.</strong> The next save will copy{" "}
                <strong>{formatTabDate(activeDate)}'s</strong> tasks and
                patrollers to every date in the new range — set up{" "}
                {formatTabDate(activeDate)} the way you want first, then save.
                Edits made on other date tabs before that first save will not be
                kept.
              </div>
            )}

            {/* ── Date tabs — hidden while a date change is pending; only
                 the active/template date matters until the first save ── */}
            {dateRangeChanged ? (
              <div
                style={{
                  background: "#fff3cd",
                  border: "1px solid #ffc107",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "12.5px",
                  color: "#856404",
                  marginBottom: "10px",
                  lineHeight: 1.5,
                }}
              >
                <strong>
                  Setting up template for {formatTabDate(activeDate)}.
                </strong>{" "}
                Whatever tasks and patrollers you assign here will be copied to
                all {dateRange.length} date
                {dateRange.length !== 1 ? "s" : ""} in the new range when you
                save.
              </div>
            ) : (
              dateRange.length > 0 && (
                <div className="epm-date-tabs">
                  {dateRange.map((date) => (
                    <button
                      key={date}
                      className={`epm-date-tab ${activeDate === date ? "epm-date-tab-active" : ""}`}
                      onClick={() => {
                        setActiveDate(date);
                        setPatrollerSearch("");
                        setShowPatrollers(false);
                        setPatrollerPage(1);
                      }}
                    >
                      {formatTabDate(date)}
                      {dirtyDates.has(date) && (
                        <span className="epm-date-dirty">●</span>
                      )}
                    </button>
                  ))}
                </div>
              )
            )}

            {/* ── AM/PM shift tabs ── */}
            <div className="epm-shift-tabs-top">
              <button
                className={`epm-shift-tab-top ${activeShift === "AM" ? "epm-shift-active" : ""}`}
                onClick={() => {
                  setActiveShift("AM");
                  activeShiftRef.current = "AM";
                  setPatrollerSearch("");
                  setShowPatrollers(false);
                  setPatrollerPage(1);
                }}
              >
                AM Shift
                {activeDatePatrollers.am.length > 0 && (
                  <span className="epm-shift-badge">
                    {activeDatePatrollers.am.length}
                  </span>
                )}
              </button>
              <button
                className={`epm-shift-tab-top ${activeShift === "PM" ? "epm-shift-active" : ""}`}
                onClick={() => {
                  setActiveShift("PM");
                  activeShiftRef.current = "PM";
                  setPatrollerSearch("");
                  setShowPatrollers(false);
                  setPatrollerPage(1);
                }}
              >
                PM Shift
                {activeDatePatrollers.pm.length > 0 && (
                  <span className="epm-shift-badge">
                    {activeDatePatrollers.pm.length}
                  </span>
                )}
              </button>
            </div>

            {/* ── Patrollers ── */}
            <div className="epm-section epm-patroller-section">
              <div className="epm-section-title-row">
                <span className="epm-section-title">
                  {activeShift} Patrollers — {formatTabDate(activeDate)}
                  {currentPatrollerIds.length > 0 && (
                    <span className="epm-shift-badge" style={{ marginLeft: 6 }}>
                      {currentPatrollerIds.length}
                    </span>
                  )}
                </span>
                {datesReady &&
                  !loadingPatrollers &&
                  (showPatrollers ? (
                    <button
                      className="epm-toggle-btn epm-toggle-hide"
                      onClick={() => {
                        setShowPatrollers(false);
                        setPatrollerPage(1);
                      }}
                    >
                      Hide
                    </button>
                  ) : (
                    <button
                      className="epm-toggle-btn epm-toggle-show"
                      onClick={() => setShowPatrollers(true)}
                    >
                      Show Patrollers
                    </button>
                  ))}
              </div>

              {!datesReady ? (
                <p
                  className="epm-empty"
                  style={{ fontStyle: "normal", color: "#6c757d" }}
                >
                  Please select a start and end date to manage patrollers.
                </p>
              ) : loadingPatrollers ? (
                <div className="epm-empty">Loading patrollers...</div>
              ) : (
                <>
                  {!showPatrollers && (
                    <p className="epm-patroller-hidden-hint">
                      {currentPatrollerIds.length > 0
                        ? `${currentPatrollerIds.length} selected — click Show Patrollers to manage`
                        : `${patrollerList.length} available — click Show Patrollers to assign`}
                    </p>
                  )}

                  {showPatrollers &&
                    (() => {
                      const PER_PAGE = 5;
                      const totalPP = Math.max(
                        1,
                        Math.ceil(filteredPatrollers.length / PER_PAGE),
                      );
                      const safePP = Math.min(patrollerPage, totalPP);
                      const paged = filteredPatrollers.slice(
                        (safePP - 1) * PER_PAGE,
                        safePP * PER_PAGE,
                      );
                      return (
                        <>
                          <input
                            className="epm-search"
                            type="text"
                            placeholder="Search patroller..."
                            style={{ fontSize: "16px" }}
                            value={patrollerSearch}
                            onChange={(e) => {
                              setPatrollerSearch(e.target.value);
                              setPatrollerPage(1);
                            }}
                          />
                          <div
                            className="epm-checklist"
                            style={
                              isPatrolCompleted
                                ? { opacity: 0.6, pointerEvents: "none" }
                                : undefined
                            }
                          >
                            {filteredPatrollers.length === 0 ? (
                              <div className="epm-empty">
                                No patrollers available.
                              </div>
                            ) : (
                              paged.map((p) => {
                                const isSelected = currentPatrollerIds.includes(
                                  p.active_patroller_id,
                                );
                                const isOtherShift = otherShiftIds.includes(
                                  p.active_patroller_id,
                                );
                                return (
                                  <div
                                    key={p.active_patroller_id}
                                    className={`epm-check-item ${isSelected ? "epm-checked" : ""} ${isOtherShift ? "epm-other-shift" : ""}`}
                                    onClick={() =>
                                      togglePatroller(p.active_patroller_id)
                                    }
                                    onMouseEnter={(e) => {
                                      setHoveredPatroller(p);
                                      setHoverAnchor(e.currentTarget);
                                    }}
                                    onMouseLeave={() => {
                                      setHoveredPatroller(null);
                                      setHoverAnchor(null);
                                    }}
                                    title={
                                      isOtherShift
                                        ? `Already in ${activeShift === "AM" ? "PM" : "AM"} shift on this date`
                                        : ""
                                    }
                                  >
                                    <div
                                      className="epm-avatar"
                                      style={{ overflow: "hidden", padding: 0 }}
                                    >
                                      {p.profile_picture ? (
                                        <img
                                          src={p.profile_picture}
                                          alt={p.officer_name}
                                          style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                            borderRadius: "50%",
                                          }}
                                        />
                                      ) : (
                                        getInitials(p.officer_name)
                                      )}
                                    </div>
                                    <div className="epm-officer-info">
                                      <span className="epm-officer-name">
                                        {p.officer_name}
                                      </span>
                                      {isOtherShift && (
                                        <span className="epm-other-shift-label">
                                          {activeShift === "AM" ? "PM" : "AM"}{" "}
                                          shift
                                        </span>
                                      )}
                                    </div>
                                    <div className="apm-checkbox-col">
                                      <div
                                        className={`epm-checkbox ${isSelected ? "epm-checkbox-on" : ""}`}
                                      >
                                        {isSelected ? "✓" : ""}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                            {filteredPatrollers.length > 0 &&
                              Array.from({
                                length: Math.max(0, PER_PAGE - paged.length),
                              }).map((_, i) => (
                                <div
                                  key={`ghost-${i}`}
                                  className="epm-checklist-ghost"
                                />
                              ))}
                          </div>
                          {totalPP > 1 && (
                            <div className="apm-pg-inline">
                              <button
                                className="apm-pg-arrow"
                                onClick={() =>
                                  setPatrollerPage((p) => Math.max(1, p - 1))
                                }
                                disabled={safePP === 1}
                              >
                                ‹
                              </button>
                              <span className="apm-pg-label">
                                {safePP} / {totalPP}
                              </span>
                              <button
                                className="apm-pg-arrow"
                                onClick={() =>
                                  setPatrollerPage((p) =>
                                    Math.min(totalPP, p + 1),
                                  )
                                }
                                disabled={safePP === totalPP}
                              >
                                ›
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                </>
              )}
            </div>

            {/* ── Timetable ── */}
            <div className="epm-section epm-section-grow">
              <div className="epm-timetable-header">
                <div className="epm-section-title">
                  {activeShift} Time Table — {formatTabDate(activeDate)}
                </div>
              </div>

              {routesForDateShift.length === 0 ? (
                <p className="epm-empty">No tasks for this date and shift.</p>
              ) : (
                <div
                  className="epm-timetable-wrap"
                  style={
                    isPatrolCompleted
                      ? { opacity: 0.6, pointerEvents: "none" }
                      : undefined
                  }
                >
                  <table className="epm-timetable">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Task / Comment</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {routesForDateShift.map((r, idx) => {
                        // PM-aware highlight logic (mirrors AddPatrolModal)
                        const toPmMinRow = (t) => {
                          if (!t) return null;
                          const [h, m] = t.split(":").map(Number);
                          const raw = h * 60 + m;
                          return activeShift === "PM" && raw < 12 * 60
                            ? raw + 24 * 60
                            : raw;
                        };

                        const prevRoute = routesForDateShift[idx - 1];
                        const startMin = toPmMinRow(r.time_start);
                        const endMin = toPmMinRow(r.time_end);
                        const badRange =
                          startMin !== null &&
                          endMin !== null &&
                          endMin <= startMin;
                        const hasOverlap =
                          prevRoute &&
                          startMin !== null &&
                          toPmMinRow(prevRoute.time_end) !== null &&
                          startMin < toPmMinRow(prevRoute.time_end);
                        const rowError = badRange || hasOverlap;

                        return (
                          <tr
                            key={r.route_id}
                            style={
                              rowError
                                ? {
                                    background: "#fffbeb",
                                    outline: "1px solid #f59e0b",
                                  }
                                : {}
                            }
                          >
                            <td className="epm-tt-time">
                              <div className="epm-time-inputs">
                                <TimePicker
                                  value={r.time_start || ""}
                                  onChange={(v) =>
                                    handleTaskChange(
                                      r.route_id,
                                      "time_start",
                                      v,
                                    )
                                  }
                                  shift={activeShift}
                                  baseHour={activeShift === "AM" ? 8 : 20}
                                />
                                <span>—</span>
                                <TimePicker
                                  value={r.time_end || r.time_start || ""}
                                  onChange={(v) =>
                                    handleTaskChange(r.route_id, "time_end", v)
                                  }
                                  shift={activeShift}
                                  baseHour={
                                    r.time_start
                                      ? parseInt(r.time_start.split(":")[0]) %
                                          12 || 12
                                      : 8
                                  }
                                />
                              </div>
                            </td>
                            <td className="epm-tt-notes">
                              <textarea
                                className="epm-notes"
                                value={r.notes || ""}
                                placeholder="Enter task..."
                                rows={1}
                                onChange={(e) => {
                                  handleTaskChange(
                                    r.route_id,
                                    "notes",
                                    e.target.value,
                                  );
                                  e.target.style.height = "auto";
                                  e.target.style.height =
                                    e.target.scrollHeight + "px";
                                }}
                              />
                            </td>
                            <td>
                              <button
                                className="epm-remove"
                                onClick={() => removeTask(r.route_id)}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                className="epm-add-task-btn"
                onClick={addTask}
                disabled={addingTask || !datesReady || isPatrolCompleted}
              >
                + Add Task
              </button>
            </div>
          </div>
        </div>
      </div>

      {showApplyDialog && (
        <ApplyDatesDialog
          key={activeDate}
          dateRange={dateRange}
          activeDate={activeDate}
          onConfirm={(selectedDates) => executeSave(selectedDates)}
          onCancel={() => setShowApplyDialog(false)}
        />
      )}

      {showConfirmAllDialog && (
        <ConfirmApplyAllDialog
          activeDateLabel={formatTabDate(activeDate)}
          onConfirm={() => {
            setShowConfirmAllDialog(false);
            executeSave(dateRange);
          }}
          onCancel={() => setShowConfirmAllDialog(false)}
        />
      )}

      {pendingDateChange && (
        <ResetDateConfirmDialog
          onConfirm={() => {
            resetTasksAndPatrollers();
            pendingDateChange.apply();
            setPendingDateChange(null);
          }}
          onCancel={() => setPendingDateChange(null)}
        />
      )}

      {showExitConfirm && (
        <ExitConfirmDialog
          onConfirm={() => {
            setShowExitConfirm(false);
            onClose();
          }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}

      {hoveredPatroller && hoverAnchor && (
        <PatrollerHoverCard
          patroller={hoveredPatroller}
          anchorEl={hoverAnchor}
        />
      )}

      <LoadingModal isOpen={loading} message="Saving patrol..." />
      {notif && (
        <Notification
          message={notif.message}
          type={notif.type}
          onClose={() => setNotif(null)}
          duration={2000}
        />
      )}
    </div>
  );
};

const PatrollerHoverCard = ({ patroller, anchorEl }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left });
    }
  }, [anchorEl]);

  const initials = patroller.officer_name
    ? patroller.officer_name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "??";

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 1300,
        background: "#fff",
        border: "1px solid #dee2e6",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
        padding: "14px 16px",
        minWidth: "160px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "52px",
          height: "52px",
          borderRadius: "50%",
          background: "#1e3a5f",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "18px",
          fontWeight: 700,
          overflow: "hidden",
          padding: 0,
        }}
      >
        {patroller.profile_picture ? (
          <img
            src={patroller.profile_picture}
            alt={patroller.officer_name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "50%",
            }}
          />
        ) : (
          initials
        )}
      </div>
      <div
        style={{
          fontWeight: 700,
          fontSize: "14px",
          color: "#0a1628",
          textAlign: "center",
        }}
      >
        {patroller.rank
          ? `${patroller.rank} ${patroller.officer_name}`
          : patroller.officer_name}
      </div>
    </div>,
    document.body,
  );
};

export default EditPatrolModal;
