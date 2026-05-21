// backend/features/blotter/controllers/exportBlotterController.js
// Generates a PDF report from blotter records.
// Builds .docx first, then converts to PDF via LibreOffice.

const { logAudit, getClientIp } = require("../../../shared/utils/auditLogger");

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  Header,
  Footer,
} = require("docx");

const libre = require("libreoffice-convert");
const libreConvert = (buf, ext, opt) =>
  new Promise((resolve, reject) =>
    libre.convert(buf, ext, opt, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    }),
  );

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const DARK  = "1E3A5F";
const LIGHT = "D9E4F0";
const WHITE = "FFFFFF";
const GRAY  = "F3F4F6";

// A4 portrait content width: 11906 - 720 - 720 = 10466 DXA
const CONTENT_WIDTH = 10466;

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = {
  top: cellBorder,
  bottom: cellBorder,
  left: cellBorder,
  right: cellBorder,
};

const fmtDateIso = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Format datetime string like "MM/DD/YYYY" or "YYYY-MM-DDTHH:MM"
const fmtDateTime = (str) => {
  if (!str) return "";
  const cleaned = String(str).replace("Z", "").replace(/\+\d{2}:\d{2}$/, "");
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return str;
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = d.getFullYear();
  let hours   = d.getHours();
  const mins  = String(d.getMinutes()).padStart(2, "0");
  const ampm  = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day}/${month}/${year} ${hours}:${mins} ${ampm}`;
};

// ─── CELL BUILDERS ────────────────────────────────────────────────────────────

const hCell = (text, widthDxa, opts = {}) =>
  new TableCell({
    borders,
    width: { size: widthDxa, type: WidthType.DXA },
    shading: { fill: DARK, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({ text, bold: true, color: WHITE, size: 18, font: "Arial" }),
        ],
      }),
    ],
  });

const dCell = (text, widthDxa, opts = {}) =>
  new TableCell({
    borders,
    width: { size: widthDxa, type: WidthType.DXA },
    shading: {
      fill: opts.shade ? LIGHT : opts.alt ? GRAY : WHITE,
      type: ShadingType.CLEAR,
    },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: String(text ?? ""),
            bold: opts.bold || false,
            size: opts.size || 18,
            font: "Arial",
            color: opts.color || "000000",
          }),
        ],
      }),
    ],
  });

// ─── SHARED PARAGRAPH HELPERS ─────────────────────────────────────────────────

const sectionHeading = (text) =>
  new Paragraph({
    spacing: { before: 300, after: 120 },
    keepNext: true,
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK, space: 1 },
    },
    children: [
      new TextRun({ text, bold: true, size: 28, font: "Arial", color: DARK }),
    ],
  });

const bodyText = (text) =>
  new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 20, font: "Arial" })],
  });

const spacer = (before = 120) =>
  new Paragraph({ spacing: { before }, children: [new TextRun("")] });

// ─── SUMMARY STATS TABLE ──────────────────────────────────────────────────────

const buildSummaryTable = (records) => {
  const total = records.length;

  // Count by status
  const byStatus = records.reduce((acc, r) => {
    const s = (r.status || r.case_status || "").toLowerCase();
    if (["cleared", "cce"].includes(s)) acc.cleared++;
    else if (["solved", "cse"].includes(s)) acc.solved++;
    else acc.ui++;
    return acc;
  }, { cleared: 0, solved: 0, ui: 0 });

  // Count by crime type
  const byCrime = {};
  records.forEach((r) => {
    const ct = r.incident_type || r.crime_offense || "Unknown";
    byCrime[ct] = (byCrime[ct] || 0) + 1;
  });

  const COL = [5600, 4866];

  const statsRows = [
    ["Total Records", String(total)],
    ["Cleared", String(byStatus.cleared)],
    ["Solved", String(byStatus.solved)],
    ["Under Investigation", String(byStatus.ui)],
  ];

  return new Table({
    width: { size: COL[0] + COL[1], type: WidthType.DXA },
    columnWidths: COL,
    rows: statsRows.map(([label, val], i) =>
      new TableRow({
        children: [
          dCell(label, COL[0], { alt: i % 2 === 1 }),
          dCell(val,   COL[1], { bold: true, alt: i % 2 === 1 }),
        ],
      }),
    ),
  });
};

// ─── CRIME TYPE BREAKDOWN TABLE ───────────────────────────────────────────────

const buildCrimeBreakdownTable = (records) => {
  const byCrime = {};
  records.forEach((r) => {
    const ct = r.incident_type || r.crime_offense || "Unknown";
    if (!byCrime[ct]) byCrime[ct] = { total: 0, cleared: 0, solved: 0, ui: 0 };
    byCrime[ct].total++;
    const s = (r.status || r.case_status || "").toLowerCase();
    if (["cleared", "cce"].includes(s)) byCrime[ct].cleared++;
    else if (["solved", "cse"].includes(s)) byCrime[ct].solved++;
    else byCrime[ct].ui++;
  });

  const rows = Object.entries(byCrime).sort((a, b) => b[1].total - a[1].total);

  const COL = [3200, 900, 900, 900, 900, 900, 900];
  const TWIDTH = COL.reduce((a, b) => a + b, 0);

  const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

  return new Table({
    width: { size: TWIDTH, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          hCell("Crime Type",         COL[0]),
          hCell("Total",              COL[1], { center: true }),
          hCell("Cleared",            COL[2], { center: true }),
          hCell("Solved",             COL[3], { center: true }),
          hCell("Under Inv.",         COL[4], { center: true }),
          hCell("CCE %",              COL[5], { center: true }),
          hCell("CSE %",              COL[6], { center: true }),
        ],
      }),
      ...rows.map(([crime, d], i) =>
        new TableRow({
          children: [
            dCell(crime,                            COL[0], { alt: i % 2 === 1 }),
            dCell(d.total,                          COL[1], { center: true, alt: i % 2 === 1 }),
            dCell(d.cleared,                        COL[2], { center: true, alt: i % 2 === 1, color: "1d4ed8" }),
            dCell(d.solved,                         COL[3], { center: true, alt: i % 2 === 1, color: "15803d" }),
            dCell(d.ui,                             COL[4], { center: true, alt: i % 2 === 1, color: "b45309" }),
            dCell(`${pct(d.cleared + d.solved, d.total)}%`, COL[5], { center: true, alt: i % 2 === 1 }),
            dCell(`${pct(d.solved, d.total)}%`,     COL[6], { center: true, alt: i % 2 === 1 }),
          ],
        }),
      ),
    ],
  });
};

// ─── COMPLETE RECORDS TABLE ───────────────────────────────────────────────────

const buildRecordsTable = (records) => {
  // Columns: # | Report ID | Crime Type | Barangay | Date Reported | Status
  const COL = [500, 1800, 1800, 1800, 1800, 1700, 1066];
  const TWIDTH = COL.reduce((a, b) => a + b, 0);

  const smH = (text, w, opts = {}) =>
    new TableCell({
      borders,
      width: { size: w, type: WidthType.DXA },
      shading: { fill: DARK, type: ShadingType.CLEAR },
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [
            new TextRun({ text, bold: true, color: WHITE, size: 14, font: "Arial" }),
          ],
        }),
      ],
    });

  const smD = (text, w, opts = {}) =>
    new TableCell({
      borders,
      width: { size: w, type: WidthType.DXA },
      shading: {
        fill: opts.shade ? LIGHT : opts.alt ? GRAY : WHITE,
        type: ShadingType.CLEAR,
      },
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [
            new TextRun({
              text: String(text ?? ""),
              bold: opts.bold || false,
              size: 14,
              font: "Arial",
              color: opts.color || "000000",
            }),
          ],
        }),
      ],
    });

  return new Table({
    width: { size: TWIDTH, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          smH("#",              COL[0], { center: true }),
          smH("Report ID",      COL[1]),
          smH("Crime Type",     COL[2]),
          smH("Barangay",       COL[3]),
          smH("Date Reported",  COL[4]),
          smH("Date Commission",COL[5]),
          smH("Status",         COL[6]),
        ],
      }),
      ...records.map((r, i) => {
        const statusLower = (r.status || r.case_status || "").toLowerCase();
        const isSolved    = ["solved", "cse"].includes(statusLower);
        const isCleared   = ["cleared", "cce"].includes(statusLower);
        const isUI        = !isSolved && !isCleared;
        const statusColor = isUI ? "b45309" : isSolved ? "15803d" : "1d4ed8";

        return new TableRow({
          children: [
            smD(i + 1,                                        COL[0], { center: true, alt: i % 2 === 1 }),
            smD(r.blotter_entry_number || "",                 COL[1], { alt: i % 2 === 1 }),
            smD(r.incident_type || "",                        COL[2], { alt: i % 2 === 1 }),
            smD(r.place_barangay || "",                       COL[3], { alt: i % 2 === 1 }),
            smD(fmtDateTime(r.date_time_reported) || r.date || "", COL[4], { alt: i % 2 === 1 }),
            smD(fmtDateTime(r.date_time_commission) || "",    COL[5], { alt: i % 2 === 1 }),
            smD(r.status || r.case_status || "",              COL[6], { alt: i % 2 === 1, color: statusColor }),
          ],
        });
      }),
    ],
  });
};

// ─── DOCUMENT BUILDER ─────────────────────────────────────────────────────────

async function buildBlotterDoc({ records, meta }) {
  const now = new Date().toLocaleString("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
    hour12: true,
  });

  const dateRange =
    meta.dateFrom && meta.dateTo
      ? `${fmtDateIso(meta.dateFrom)} — ${fmtDateIso(meta.dateTo)}`
      : "All Dates";

  // ── Header & Footer ────────────────────────────────────────────────────────
  const makeHeader = () =>
    new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 4, color: DARK, space: 1 },
          },
          spacing: { after: 60 },
          children: [
            new TextRun({ text: "BLOTTER RECORDS REPORT  ", size: 16, color: "6B7280", font: "Arial" }),
            new TextRun({ text: dateRange, size: 16, color: "6B7280", font: "Arial" }),
          ],
        }),
      ],
    });

  const makeFooter = () =>
    new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB", space: 1 },
          },
          spacing: { before: 60 },
          children: [
            new TextRun({ text: "Page ", size: 16, color: "9CA3AF", font: "Arial" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "9CA3AF", font: "Arial" }),
            new TextRun({ text: " of ", size: 16, color: "9CA3AF", font: "Arial" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "9CA3AF", font: "Arial" }),
            new TextRun({ text: "  ·  Confidential  ·  For Official Use Only", size: 16, color: "9CA3AF", font: "Arial" }),
          ],
        }),
      ],
    });

  // ── Document Children ──────────────────────────────────────────────────────
  const children = [
    // ── COVER ─────────────────────────────────────────────────────────────────
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "BLOTTER RECORDS REPORT", bold: true, size: 40, font: "Arial", color: DARK }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Bacoor City Police Station", size: 26, font: "Arial", color: "6B7280" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `Reporting Period: ${dateRange}`, size: 22, font: "Arial" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: `Generated: ${now}`, size: 20, font: "Arial", color: "9CA3AF" }),
      ],
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: DARK, space: 1 },
      },
      spacing: { after: 200 },
      children: [new TextRun("")],
    }),

    // ── 1. SUMMARY STATISTICS ──────────────────────────────────────────────────
    sectionHeading("1. Summary Statistics"),
    buildSummaryTable(records),
    spacer(),

    // ── 2. CRIME TYPE BREAKDOWN ────────────────────────────────────────────────
    sectionHeading("2. Crime Type Breakdown"),
    bodyText("CCE (Crime Clearance Efficiency) = (Cleared + Solved) / Total  ·  CSE (Crime Solution Efficiency) = Solved / Total"),
    spacer(60),
    buildCrimeBreakdownTable(records),
    spacer(),

    // ── 3. COMPLETE RECORDS ────────────────────────────────────────────────────
    sectionHeading("3. Complete Records"),
    bodyText(`${records.length} total record${records.length !== 1 ? "s" : ""}`),
    spacer(60),
    ...(records.length > 0
      ? [buildRecordsTable(records), spacer()]
      : [bodyText("No records found for the selected date range.")]),
  ];

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        headers: { default: makeHeader() },
        footers: { default: makeFooter() },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ─── EXPRESS HANDLER ──────────────────────────────────────────────────────────

const exportBlotter = async (req, res) => {
  try {
    const { records = [], meta = {} } = req.body;

    const docxBuffer = await buildBlotterDoc({ records, meta });
    const pdfBuffer  = await libreConvert(docxBuffer, ".pdf", undefined);

    const dateStr =
      meta.dateFrom && meta.dateTo
        ? `${meta.dateFrom}_to_${meta.dateTo}`
        : new Date().toISOString().slice(0, 10);

    await logAudit({
      userId:      req.user?.user_id,
      username:    req.user?.username,
      eventName:   "Blotter Export",
      description: `Blotter records exported (${dateStr})`,
      action:      "EXPORT",
      status:      "success",
      source:      "Web Portal",
      ipAddress:   getClientIp(req),
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="blotter_${dateStr}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("exportBlotter error:", err);

    await logAudit({
      userId:    req.user?.user_id,
      username:  req.user?.username,
      eventName: "Blotter Export Failed",
      description: err.message,
      action:    "EXPORT",
      status:    "failed",
      source:    "Web Portal",
      ipAddress: getClientIp(req),
    });

    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { exportBlotter };