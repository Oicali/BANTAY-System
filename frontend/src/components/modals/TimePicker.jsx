import { useState, useEffect, useRef } from "react";
import "./TimePicker.css";

const TimePicker = ({ value, onChange, onBlur, baseHour, shift, disabled }) => {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef(null);

  const parse = (v) => {
    if (!v) {
      // baseHour is a 24h hint (e.g. 8 for AM shift, 20 for PM shift) —
      // convert it the same way a real value would be, so an empty/blank
      // field never displays something like "20:00 AM".
      const bh = baseHour ?? 8;
      const period = bh < 12 ? "AM" : "PM";
      const h12 = bh % 12 === 0 ? 12 : bh % 12;
      return { h: h12, m: 0, period };
    }
    const [hh, mm] = v.split(":").map(Number);
    const period = hh < 12 ? "AM" : "PM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return { h: h12, m: mm, period };
  };

  const { h, m, period } = parse(value);

  const to24 = (h12, min, p) => {
    let hh = h12 % 12;
    if (p === "PM") hh += 12;
    return `${String(hh).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };

  const emit = (h12, min, p) => onChange(to24(h12, min, p));

  // Determine whether a 12-hour hour value is inside the current shift's
  // allowed window for the given AM/PM period. Used for both the hour list
  // and the AM/PM toggle so they always agree on what's selectable.
  const isHourAllowed = (h12, p) => {
    if (!shift) return true;
    let hh24 = h12 % 12;
    if (p === "PM") hh24 += 12;
    return shift === "AM" ? hh24 >= 8 && hh24 < 20 : hh24 >= 20 || hh24 < 8;
  };

  // Close on outside click + trigger onBlur
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        if (open) {
          setOpen(false);
          onBlur?.();
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onBlur]);

  // Detect if dropdown should open upward
  const handleOpen = () => {
    if (disabled) return;
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // dropdown is ~220px tall
      setDropUp(spaceBelow < 230 && spaceAbove > spaceBelow);
    }
    setOpen((o) => !o);
  };

  // Close with onBlur when pressing Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        onBlur?.();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onBlur]);

  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const ITEM_HEIGHT = 36;
    setTimeout(() => {
      if (hourListRef.current)
        hourListRef.current.scrollTop = (h - 1) * ITEM_HEIGHT;
      if (minuteListRef.current)
        minuteListRef.current.scrollTop = m * ITEM_HEIGHT;
    }, 0);
  }, [open]);

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const displayH = String(h).padStart(2, "0");
  const displayM = String(m).padStart(2, "0");

  return (
    <div className="tp-root" ref={ref}>
      <button
        type="button"
        className={`tp-trigger ${disabled ? "tp-trigger-disabled" : ""}`}
        onClick={handleOpen}
        disabled={disabled}
      >
        <span className="tp-value">
          {displayH}:{displayM}
        </span>
        <span className="tp-period-badge">{period}</span>
        <svg
          className="tp-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 4.5v3.75l2.5 1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className={`tp-dropdown ${dropUp ? "tp-dropdown-up" : ""}`}>
          <div className="tp-col">
            <div className="tp-col-label">HR</div>
            <div className="tp-list" ref={hourListRef}>
              {hours.map((hv) => {
                const outOfRange = !isHourAllowed(hv, period);
                return (
                  <div
                    key={hv}
                    className={`tp-item ${hv === h ? "tp-item-active" : ""} ${outOfRange ? "tp-item-disabled" : ""}`}
                    onClick={() => {
                      if (!outOfRange) emit(hv, m, period);
                    }}
                  >
                    {String(hv).padStart(2, "0")}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tp-sep">:</div>

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

          <div className="tp-col tp-col-period">
            <div className="tp-col-label">‎</div>
            <div className="tp-period-list">
              {["AM", "PM"].map((p) => {
                // A period is only disabled if NONE of its 12 hours are valid for the
                // current shift — not just whichever hour happens to be selected right
                // now. Otherwise a PM shift (8pm–7:59am) could never reach its AM half
                // (12am–7:59am) once an 8–11pm hour was already selected.
                const outOfRange = !hours.some((hv) => isHourAllowed(hv, p));
                return (
                  <div
                    key={p}
                    className={`tp-period-item ${p === period ? "tp-period-active" : ""} ${outOfRange ? "tp-item-disabled" : ""}`}
                    onClick={() => {
                      if (outOfRange) return;
                      // Current hour may not be valid in the new period (e.g. 11 PM ->
                      // AM). Snap to the first valid hour in that period instead.
                      const targetH = isHourAllowed(h, p)
                        ? h
                        : hours.find((hv) => isHourAllowed(hv, p));
                      emit(targetH, m, p);
                    }}
                  >
                    {p}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimePicker;
