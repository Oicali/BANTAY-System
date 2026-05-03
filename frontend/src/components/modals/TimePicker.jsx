import { useState, useEffect, useRef } from "react";
import "./TimePicker.css";

const TimePicker = ({ value, onChange, onBlur, baseHour, shift }) => {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef(null);

  const parse = (v) => {
    if (!v) return { h: baseHour ?? 8, m: 0, period: "AM" };
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

  const hours   = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const displayH = String(h).padStart(2, "0");
  const displayM = String(m).padStart(2, "0");

  return (
    <div className="tp-root" ref={ref}>
      <button
        type="button"
        className="tp-trigger"
        onClick={handleOpen}
      >
        <span className="tp-value">{displayH}:{displayM}</span>
        <span className="tp-period-badge">{period}</span>
        <svg className="tp-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="6.5"/>
          <path d="M8 4.5v3.75l2.5 1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div className={`tp-dropdown ${dropUp ? "tp-dropdown-up" : ""}`}>
          <div className="tp-col">
            <div className="tp-col-label">HR</div>
            <div className="tp-list" ref={hourListRef}>
              {hours.map((hv) => {
  // Convert this option to 24h to check if it's in the allowed shift range
  let hh24 = hv % 12;
  if (period === "PM") hh24 += 12;
  // AM shift: allowed 08:00–19:59 (8am to just before 8pm)
  // PM shift: allowed 20:00–07:59 (8pm to just before 8am)
  const outOfRange =
    shift === "AM" ? (hh24 < 8 || hh24 >= 20)
    : shift === "PM" ? (hh24 >= 8 && hh24 < 20)
    : false;
  return (
    <div
      key={hv}
      className={`tp-item ${hv === h ? "tp-item-active" : ""} ${outOfRange ? "tp-item-disabled" : ""}`}
      onClick={() => { if (!outOfRange) emit(hv, m, period); }}
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
  // AM shift: only AM hours (8–11) and PM hours (12–7) allowed — block PM after 8pm
  // PM shift: only PM hours (8–11pm) and AM hours (12–7am) allowed — block AM after 8am
  const isDisabled =
    (shift === "AM" && p === "AM" && false) ? false  // AM period always ok in AM shift
    : false; // we handle via hour disabling below
  return (
    <div
      key={p}
      className={`tp-period-item ${p === period ? "tp-period-active" : ""}`}
      onClick={() => emit(h, m, p)}
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