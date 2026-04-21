import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Date helpers ───────────────────────────────────────────
const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
const toLocalDateStr = (d) => {
  const dt = parseLocalDate(d);
  if (!dt) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
};
const generateDateRange = (start, end) => {
  if (!start || !end) return [];
  const dates = [], cur = parseLocalDate(start), last = parseLocalDate(end);
  if (!cur || !last) return [];
  while (cur <= last) {
    const s = toLocalDateStr(cur);
    if (s) dates.push(s);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};
const formatDate = (d) => {
  const dt = parseLocalDate(d);
  return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
};
const formatFullDate = (d) => {
  const dt = parseLocalDate(d);
  return dt ? dt.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "—";
};
const formatTime = (t) => t ? t.substring(0, 5) : "—";

export const exportBeatCardPDF = (patrol) => {
  if (!patrol) return;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();
  const now = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

  const dateRange  = generateDateRange(patrol.start_date, patrol.end_date);
  const barangays  = [...new Set((patrol.routes || []).filter((r) => (r.stop_order || 0) <= 0 && r.barangay).map((r) => r.barangay).filter(Boolean))];

  // ── PAGE HEADER ────────────────────────────────────────
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, W, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(patrol.patrol_name || "Patrol Detail", 10, 10);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const subtitle = [
    patrol.mobile_unit_name ? `Mobile Unit: ${patrol.mobile_unit_name}` : null,
    `Duration: ${formatDate(patrol.start_date)} — ${formatDate(patrol.end_date)}`,
  ].filter(Boolean).join("   |   ");
  doc.text(subtitle, 10, 17);
  doc.text(`Exported: ${now}`, W - 10, 17, { align: "right" });

  let y = 28;

  // ── SECTION HELPER ─────────────────────────────────────
  const sectionTitle = (title) => {
    doc.setFillColor(240, 244, 248);
    doc.rect(10, y, W - 20, 7, "F");
    doc.setTextColor(30, 58, 95);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title, 13, y + 5);
    y += 9;
  };

  // ── AREA OF RESPONSIBILITY ─────────────────────────────
  sectionTitle("AREA OF RESPONSIBILITY");
  if (barangays.length > 0) {
    const cols = 3;
    const colW = (W - 20) / cols;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(33, 37, 41);
    barangays.forEach((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      doc.text(`• ${b}`, 12 + col * colW, y + row * 6);
    });
    y += Math.ceil(barangays.length / cols) * 6 + 6;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text("No area of responsibility assigned.", 13, y);
    y += 8;
  }

  // ── PATROLLERS PER DATE ────────────────────────────────
  sectionTitle("ASSIGNED PATROLLERS");

  const patrollerRows = [];
  for (const date of dateRange) {
    const amP = (patrol.patrollers_detail || patrol.patrollers || [])
      .filter((p) => p.shift === "AM" && toLocalDateStr(p.route_date) === date);
    const pmP = (patrol.patrollers_detail || patrol.patrollers || [])
      .filter((p) => p.shift === "PM" && toLocalDateStr(p.route_date) === date);

    const maxRows = Math.max(amP.length, pmP.length, 1);
    for (let i = 0; i < maxRows; i++) {
      patrollerRows.push([
        i === 0 ? formatFullDate(date) : "",
        amP[i]?.officer_name || (i === 0 && amP.length === 0 ? "—" : ""),
        amP[i]?.contact_number || "",
        pmP[i]?.officer_name || (i === 0 && pmP.length === 0 ? "—" : ""),
        pmP[i]?.contact_number || "",
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Date", "AM Patroller", "AM Contact", "PM Patroller", "PM Contact"]],
    body: patrollerRows,
    margin: { left: 10, right: 10 },
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: "bold", textColor: [30, 58, 95] },
      1: { cellWidth: 40 },
      2: { cellWidth: 30 },
      3: { cellWidth: 40 },
      4: { cellWidth: 30 },
    },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, W / 2, H - 8, { align: "center" });
      doc.text("PNP BANTAY System — Confidential", 10, H - 8);
    },
  });

  y = doc.lastAutoTable.finalY + 8;

  // ── TIMETABLE PER DATE ─────────────────────────────────
  for (const shift of ["AM", "PM"]) {
    let hasAnyTasks = false;
    for (const date of dateRange) {
      const tasks = (patrol.routes || [])
        .filter((r) => toLocalDateStr(r.route_date) === date && r.shift === shift && (r.stop_order || 0) > 0)
        .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
      if (tasks.length > 0) { hasAnyTasks = true; break; }
    }
    if (!hasAnyTasks) continue;

    // Check if we need a new page
    if (y > H - 40) { doc.addPage(); y = 15; }

    sectionTitle(`${shift} SHIFT — TIME TABLE`);

    for (const date of dateRange) {
      const tasks = (patrol.routes || [])
        .filter((r) => toLocalDateStr(r.route_date) === date && r.shift === shift && (r.stop_order || 0) > 0)
        .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

      if (tasks.length === 0) continue;

      // Date sub-header
      doc.setFillColor(248, 249, 250);
      doc.rect(10, y, W - 20, 6, "F");
      doc.setTextColor(30, 58, 95);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(formatFullDate(date), 13, y + 4);
      y += 7;

      autoTable(doc, {
        startY: y,
        head: [["Time", "Task / Comment"]],
        body: tasks.map((r) => [
          `${formatTime(r.time_start)} — ${formatTime(r.time_end)}`,
          r.notes || "—",
        ]),
        margin: { left: 10, right: 10 },
        styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
          0: { cellWidth: 35, fontStyle: "bold", textColor: [30, 58, 95] },
          1: { cellWidth: "auto" },
        },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(`Page ${doc.internal.getNumberOfPages()}`, W / 2, H - 8, { align: "center" });
          doc.text("PNP BANTAY System — Confidential", 10, H - 8);
        },
      });

      y = doc.lastAutoTable.finalY + 5;
    }

    y += 4;
  }

  // ── FOOTER ON LAST PAGE ────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Page ${doc.internal.getNumberOfPages()}`, W / 2, H - 8, { align: "center" });
  doc.text("PNP BANTAY System — Confidential", 10, H - 8);

  doc.save(`${patrol.patrol_name?.replace(/\s+/g, "_") || "Patrol"}_Detail_${new Date().toISOString().split("T")[0]}.pdf`);
};