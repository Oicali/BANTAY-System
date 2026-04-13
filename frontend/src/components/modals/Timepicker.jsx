import { useState, useEffect, useRef } from "react";
import "./TimePicker.css";

/**
 * TimePicker
 * Props:
 *   value      — "HH:MM" 24h string (controlled)
 *   onChange   — (newValue: "HH:MM") => void
 *   baseHour   — optional number: which hour to start the list from (e.g. 8)
 */
const TimePicker = ({ value, onChange, baseHour }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Parse incoming 24h value
  const parse = (v) => {
    if (!v) return { h: baseHour ?? 8, m: 0, period: "AM" };
    const [hh, mm] = v.split(":").map(Number);
    const period = hh < 12 ? "AM" : "PM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return { h: h12, m: mm, period };
  };

  const { h, m, period } = parse(value);

  // Convert back to 24h "HH:MM"
  const to24 = (h12, min, p) => {
    let hh = h12 % 12;
    if (p === "PM") hh += 12;
    return `${String(hh).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };

  const emit = (h12, min, p) => onChange(to24(h12, min, p));

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll selected item into center when dropdown opens
  const hourListRef   = useRef(null);
  const minuteListRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const ITEM_HEIGHT = 36;
    setTimeout(() => {
      if (hourListRef.current)   hourListRef.current.scrollTop   = (h - 1) * ITEM_HEIGHT;
      if (minuteListRef.current) minuteListRef.current.scrollTop = m * ITEM_HEIGHT;
    }, 0);
  }, [open]);

  // Hours 1–12 (no loop)
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  // Minutes 0–59
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const displayH = String(h).padStart(2, "0");
  const displayM = String(m).padStart(2, "0");

  return (
    <div className="tp-root" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        className="tp-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tp-value">{displayH}:{displayM}</span>
        <span className="tp-period-badge">{period}</span>
        <svg className="tp-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="6.5"/>
          <path d="M8 4.5v3.75l2.5 1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="tp-dropdown">
          {/* Hours column */}
          <div className="tp-col">
            <div className="tp-col-label">HR</div>
            <div className="tp-list" ref={hourListRef}>
              {hours.map((hv) => (
                <div
                  key={hv}
                  className={`tp-item ${hv === h ? "tp-item-active" : ""}`}
                  onClick={() => emit(hv, m, period)}
                >
                  {String(hv).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          <div className="tp-sep">:</div>

          {/* Minutes column */}
          <div className="tp-col">
            <div className="tp-col-label">MIN</div>
            <div className="tp-list" ref={minuteListRef}>
              {minutes.map((mv) => (
                <div
                  key={mv}
                  className={`tp-item ${mv === m ? "tp-item-active" : ""}`}
                  onClick={() => emit(h, mv, period)}
                >
                  {String(mv).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          {/* AM / PM column */}
          <div className="tp-col tp-col-period">
            <div className="tp-col-label">‎</div>
            <div className="tp-period-list">
              {["AM", "PM"].map((p) => (
                <div
                  key={p}
                  className={`tp-period-item ${p === period ? "tp-period-active" : ""}`}
                  onClick={() => emit(h, m, p)}
                >
                  {p}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimePicker;