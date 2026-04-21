import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Date helpers ───────────────────────────────────────────
const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
const formatDate = (d) => {
  const dt = parseLocalDate(d);
  return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
};
const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
const getPatrolStatus = (patrol) => {
  const t = today(), start = parseLocalDate(patrol.start_date), end = parseLocalDate(patrol.end_date);
  if (!start || !end) return "unknown";
  if (t < start) return "upcoming";
  if (t > end)   return "completed";
  return "active";
};
const getUniqueBarangays = (routes) =>
  [...new Set((routes || []).filter((r) => (r.stop_order || 0) <= 0 && r.barangay).map((r) => r.barangay).filter(Boolean))];

export const exportPatrolSummaryPDF = (patrols) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const now = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

  // ── Header ─────────────────────────────────────────────
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, W, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("PNP BANTAY SYSTEM — Patrol Schedule Summary Report", 10, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${now}`, W - 10, 12, { align: "right" });

  // ── Summary counts ─────────────────────────────────────
  const active    = patrols.filter((p) => getPatrolStatus(p) === "active");
  const upcoming  = patrols.filter((p) => getPatrolStatus(p) === "upcoming");
  const completed = patrols.filter((p) => getPatrolStatus(p) === "completed");

  let y = 24;
  doc.setTextColor(30, 58, 95);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Total Patrols: ${patrols.length}   Active: ${active.length}   Upcoming: ${upcoming.length}   Completed: ${completed.length}`, 10, y);
  y += 8;

  // ── Table columns ──────────────────────────────────────
  const cols = ["Patrol Name", "Mobile Unit", "Duration", "Patrollers", "Area of Responsibility"];

  const buildRows = (list) =>
    list.map((p) => {
      const patrollers = [...new Set((p.patrollers || []).map((pt) => pt.officer_name))].join(", ") || "—";
      const barangays  = getUniqueBarangays(p.routes).join(", ") || "—";
      return [
        p.patrol_name,
        p.mobile_unit_name || "—",
        `${formatDate(p.start_date)} — ${formatDate(p.end_date)}`,
        patrollers,
        barangays,
      ];
    });

  const sections = [
    { label: "ACTIVE PATROLS",    data: active,    color: [22, 163, 74]  },
    { label: "UPCOMING PATROLS",  data: upcoming,  color: [217, 119, 6]  },
    { label: "COMPLETED PATROLS", data: completed, color: [107, 114, 128] },
  ];

  for (const section of sections) {
    if (section.data.length === 0) continue;

    // Section header
    doc.setFillColor(...section.color);
    doc.rect(10, y, W - 20, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${section.label} (${section.data.length})`, 13, y + 5);
    y += 9;

    autoTable(doc, {
      startY: y,
      head: [cols],
      body: buildRows(section.data),
      margin: { left: 10, right: 10 },
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [240, 244, 248], textColor: [30, 58, 95], fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 35 },
        2: { cellWidth: 45 },
        3: { cellWidth: 55 },
        4: { cellWidth: "auto" },
      },
      didDrawPage: (data) => {
        // Footer on each page
        const pg = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${pg}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
        doc.text("PNP BANTAY System — Confidential", 10, doc.internal.pageSize.getHeight() - 8);
      },
    });

    y = doc.lastAutoTable.finalY + 10;
  }

  doc.save(`Patrol_Summary_${new Date().toISOString().split("T")[0]}.pdf`);
};