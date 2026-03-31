// backend/features/dashboard/controllers/exportDashboardController.js
// Generates a .docx report from the crime dashboard data.
// Chart screenshots (base64 PNG) sent from the frontend are embedded as images.

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, AlignmentType, PageOrientation, HeadingLevel, BorderStyle,
  WidthType, ShadingType, VerticalAlign, PageNumber, Header, Footer,
} = require("docx");

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const CRIME_DISPLAY = {
  MURDER: "Murder",
  HOMICIDE: "Homicide",
  "PHYSICAL INJURY": "Physical Injury",
  RAPE: "Rape",
  ROBBERY: "Robbery",
  THEFT: "Theft",
  "CARNAPPING - MC": "Carnapping - MC",
  "CARNAPPING - MV": "Carnapping - MV",
  "SPECIAL COMPLEX CRIME": "Special Complex Crime",
};

const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

const fmtDateIso = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders   = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
const noBorders = {
  top:    { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right:  { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const DARK  = "1E3A5F";
const LIGHT = "D9E4F0";
const WHITE = "FFFFFF";
const GRAY  = "F3F4F6";

// Content width for landscape Letter: 15840 - 1080 - 1080 = 13680
const CONTENT_WIDTH = 13680;

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
        children: [new TextRun({ text, bold: true, color: WHITE, size: 18, font: "Arial" })],
      }),
    ],
  });

const dCell = (text, widthDxa, opts = {}) =>
  new TableCell({
    borders,
    width: { size: widthDxa, type: WidthType.DXA },
    shading: { fill: opts.shade ? LIGHT : (opts.alt ? GRAY : WHITE), type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({
          text: String(text ?? ""),
          bold: opts.bold || false,
          size: 18,
          font: "Arial",
          color: opts.color || "000000",
        })],
      }),
    ],
  });

const sectionHeading = (text) =>
  new Paragraph({
    spacing: { before: 300, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK, space: 1 } },
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

// ─── IMAGE HELPER ─────────────────────────────────────────────────────────────

/**
 * Build an ImageRun paragraph from a base64 PNG string.
 * `widthEmu` defaults to full content width (landscape letter, 0.75" margins each side).
 * Height is calculated to preserve the 2:1 aspect ratio typical of chart screenshots.
 * Returns null if b64 is falsy.
 */
function imageBlock(b64, widthEmu = 8534400, aspectRatio = 2.5) {
  if (!b64) return null;

  const buf = Buffer.from(b64, "base64");
  const heightEmu = Math.round(widthEmu / aspectRatio);

  return new Paragraph({
    spacing: { before: 80, after: 120 },
    children: [
      new ImageRun({
        data: buf,
        transformation: {
          width:  Math.round(widthEmu / 9525),   // EMU → pixels (1px = 9525 EMU)
          height: Math.round(heightEmu / 9525),
        },
        type: "png",
      }),
    ],
  });
}

// ─── TABLE BUILDERS ───────────────────────────────────────────────────────────

function buildIndexCrimeTable(summary) {
  const COL = [3200, 1200, 1200, 1200, 1500, 1330, 1330];
  const TWIDTH = COL.reduce((a, b) => a + b, 0);

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell("Index Crime",   COL[0]),
      hCell("Total",         COL[1], { center: true }),
      hCell("Cleared",       COL[2], { center: true }),
      hCell("Solved",        COL[3], { center: true }),
      hCell("Under Inv.",    COL[4], { center: true }),
      hCell("CCE %",         COL[5], { center: true }),
      hCell("CSE %",         COL[6], { center: true }),
    ],
  });

  const totals = summary.reduce(
    (acc, d) => ({
      total:   acc.total   + d.total,
      cleared: acc.cleared + d.cleared,
      solved:  acc.solved  + d.solved,
      ui:      acc.ui      + d.underInvestigation,
    }),
    { total: 0, cleared: 0, solved: 0, ui: 0 },
  );

  const dataRows = summary.map((row, i) => {
    const cce = pct(row.cleared + row.solved, row.total);
    const cse = pct(row.solved, row.total);
    return new TableRow({
      children: [
        dCell(CRIME_DISPLAY[row.crime] || row.crime, COL[0], { alt: i % 2 === 1 }),
        dCell(row.total,              COL[1], { center: true, alt: i % 2 === 1 }),
        dCell(row.cleared,            COL[2], { center: true, alt: i % 2 === 1, color: "1d4ed8" }),
        dCell(row.solved,             COL[3], { center: true, alt: i % 2 === 1, color: "15803d" }),
        dCell(row.underInvestigation, COL[4], { center: true, alt: i % 2 === 1, color: "b45309" }),
        dCell(`${cce}%`,              COL[5], { center: true, alt: i % 2 === 1 }),
        dCell(`${cse}%`,              COL[6], { center: true, alt: i % 2 === 1 }),
      ],
    });
  });

  const totalRow = new TableRow({
    children: [
      dCell("TOTAL",        COL[0], { bold: true, shade: true }),
      dCell(totals.total,   COL[1], { center: true, bold: true, shade: true }),
      dCell(totals.cleared, COL[2], { center: true, bold: true, shade: true }),
      dCell(totals.solved,  COL[3], { center: true, bold: true, shade: true }),
      dCell(totals.ui,      COL[4], { center: true, bold: true, shade: true }),
      dCell(`${pct(totals.cleared + totals.solved, totals.total)}%`, COL[5], { center: true, bold: true, shade: true }),
      dCell(`${pct(totals.solved, totals.total)}%`,                  COL[6], { center: true, bold: true, shade: true }),
    ],
  });

  return new Table({
    width: { size: TWIDTH, type: WidthType.DXA },
    columnWidths: COL,
    rows: [headerRow, ...dataRows, totalRow],
  });
}

function buildSummaryStatRows(totals, cce, cse) {
  const stats = [
    ["Total Incidents",      String(totals.total)],
    ["Cleared",              String(totals.cleared)],
    ["Solved",               String(totals.solved)],
    ["Under Investigation",  String(totals.ui)],
    ["CCE %",                `${cce}%`],
    ["CSE %",                `${cse}%`],
  ];

  const COL = [3200, 3200];
  const TWIDTH = 6400;

  return [
    new Table({
      width: { size: TWIDTH, type: WidthType.DXA },
      columnWidths: COL,
      rows: stats.map(([label, val], i) =>
        new TableRow({
          children: [
            dCell(label, COL[0], { alt: i % 2 === 1 }),
            dCell(val,   COL[1], { bold: true, alt: i % 2 === 1 }),
          ],
        }),
      ),
    }),
  ];
}

// ─── DOCUMENT BUILDER ─────────────────────────────────────────────────────────

async function buildExportDoc({ summary, trends, hourly, byDay, place, barangay, modus, meta, images = {} }) {
  const totals = summary.reduce(
    (acc, d) => ({
      total:   acc.total   + d.total,
      cleared: acc.cleared + d.cleared,
      solved:  acc.solved  + d.solved,
      ui:      acc.ui      + d.underInvestigation,
    }),
    { total: 0, cleared: 0, solved: 0, ui: 0 },
  );

  const cce = pct(totals.cleared + totals.solved, totals.total);
  const cse = pct(totals.solved, totals.total);

  const now = new Date().toLocaleString("en-PH", {
    dateStyle: "long", timeStyle: "short", hour12: true,
  });

  // Full-width image in landscape letter with 0.75" margins on each side:
  // Content width = 15840 - 1080 - 1080 = 13680 DXA = 13680 * 914.4 EMU ≈ 12,508,992 EMU
  // Using 12,400,000 EMU (~13.56") to leave a small margin
  const FULL_W_EMU = 12400000;

  // Half-width (two charts side by side)
  const HALF_W_EMU = Math.round(FULL_W_EMU / 2) - 100000;

  const pushImage = (b64, widthEmu = FULL_W_EMU, ratio = 2.2) => {
    const img = imageBlock(b64, widthEmu, ratio);
    return img ? [img, spacer(60)] : [];
  };

  const children = [
    // ── COVER ──────────────────────────────────────────────────
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "CRIME DASHBOARD REPORT", bold: true, size: 40, font: "Arial", color: DARK })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "Index Crime Statistics", size: 26, font: "Arial", color: "6B7280" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: `Reporting Period: ${meta.dateFrom ? fmtDateIso(meta.dateFrom) : "All dates"} — ${meta.dateTo ? fmtDateIso(meta.dateTo) : "All dates"}`, size: 22, font: "Arial" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: `Crime Types: ${meta.crimeTypes?.length ? meta.crimeTypes.join(", ") : "All Index Crimes"}`, size: 22, font: "Arial" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: `Barangays: ${meta.barangays?.length ? meta.barangays.join(", ") : "All Barangays"}`, size: 22, font: "Arial" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `Generated: ${now}`, size: 20, font: "Arial", color: "9CA3AF" })],
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: DARK, space: 1 } },
      spacing: { after: 200 },
      children: [new TextRun("")],
    }),

    // ── 1. SUMMARY STATS ───────────────────────────────────────
    sectionHeading("1. Summary Statistics"),
    ...buildSummaryStatRows(totals, cce, cse),
    spacer(),

    // ── 2. INDEX CRIME TABLE ───────────────────────────────────
    sectionHeading("2. Index Crime Summary Table"),
    bodyText("CCE (Crime Clearance Efficiency) = (Cleared + Solved) / Total  ·  CSE (Crime Solution Efficiency) = Solved / Total"),
    spacer(60),
    buildIndexCrimeTable(summary),
    spacer(),

    // ── 3. CASE STATUS CHART ───────────────────────────────────
    sectionHeading("3. Case Status per Index Crime"),
    ...pushImage(images.caseStatus, FULL_W_EMU, 2.0),

    // ── 4. CRIME TRENDS ────────────────────────────────────────
    sectionHeading("4. Crime Index Trends"),
    ...pushImage(images.trends, FULL_W_EMU, 2.2),

    // ── 5. CRIME CLOCK ─────────────────────────────────────────
    sectionHeading("5. Crime Clock — Hourly Distribution"),
    ...pushImage(images.clock, FULL_W_EMU, 2.8),

    // ── 6. DAY OF WEEK + MODUS (side by side) ──────────────────
    sectionHeading("6. Crime by Day of Week  &  Modus Operandi"),
    ...(images.byDay && images.modus
      ? [
          // Put both half-width images into a 2-cell table so they sit side by side
          new Table({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            columnWidths: [Math.round(CONTENT_WIDTH / 2), Math.round(CONTENT_WIDTH / 2)],
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorders,
                    width: { size: Math.round(CONTENT_WIDTH / 2), type: WidthType.DXA },
                    children: [imageBlock(images.byDay,   HALF_W_EMU, 1.4) || new Paragraph({ children: [new TextRun("")] })],
                  }),
                  new TableCell({
                    borders: noBorders,
                    width: { size: Math.round(CONTENT_WIDTH / 2), type: WidthType.DXA },
                    children: [imageBlock(images.modus,   HALF_W_EMU, 1.4) || new Paragraph({ children: [new TextRun("")] })],
                  }),
                ],
              }),
            ],
          }),
          spacer(),
        ]
      : [
          ...pushImage(images.byDay, HALF_W_EMU, 1.4),
          ...pushImage(images.modus, HALF_W_EMU, 1.4),
        ]
    ),

    // ── 7. PLACE OF COMMISSION + BARANGAY (side by side) ───────
    sectionHeading("7. Place of Commission  &  Barangay Incidents"),
    ...(images.place && images.barangay
      ? [
          new Table({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            columnWidths: [Math.round(CONTENT_WIDTH / 2), Math.round(CONTENT_WIDTH / 2)],
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: noBorders,
                    width: { size: Math.round(CONTENT_WIDTH / 2), type: WidthType.DXA },
                    children: [imageBlock(images.place,    HALF_W_EMU, 1.4) || new Paragraph({ children: [new TextRun("")] })],
                  }),
                  new TableCell({
                    borders: noBorders,
                    width: { size: Math.round(CONTENT_WIDTH / 2), type: WidthType.DXA },
                    children: [imageBlock(images.barangay, HALF_W_EMU, 1.4) || new Paragraph({ children: [new TextRun("")] })],
                  }),
                ],
              }),
            ],
          }),
          spacer(),
        ]
      : [
          ...pushImage(images.place,    HALF_W_EMU, 1.4),
          ...pushImage(images.barangay, HALF_W_EMU, 1.4),
        ]
    ),
  ];

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Arial", size: 20 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DARK, space: 1 } },
                spacing: { after: 60 },
                children: [
                  new TextRun({ text: "CRIME DASHBOARD REPORT  ", size: 16, color: "6B7280", font: "Arial" }),
                  new TextRun({ text: `${meta.dateFrom ? fmtDateIso(meta.dateFrom) : ""} — ${meta.dateTo ? fmtDateIso(meta.dateTo) : ""}`, size: 16, color: "6B7280", font: "Arial" }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB", space: 1 } },
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
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ─── EXPRESS HANDLER ──────────────────────────────────────────────────────────

const exportDashboard = async (req, res) => {
  try {
    const {
      summary = [], trends = [], hourly = [], byDay = [],
      place = [], barangay = [], modus = [], meta = {},
      images = {},
    } = req.body;

    const buffer = await buildExportDoc({
      summary, trends, hourly, byDay, place, barangay, modus, meta, images,
    });

    const dateStr = meta.dateFrom && meta.dateTo
      ? `${meta.dateFrom}_to_${meta.dateTo}`
      : new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="crime_dashboard_${dateStr}.docx"`);
    res.send(buffer);
  } catch (err) {
    console.error("exportDashboard error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { exportDashboard };