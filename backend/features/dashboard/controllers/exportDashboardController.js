// backend/features/dashboard/controllers/exportDashboardController.js
// Generates a .docx report from the crime dashboard data.
// Sections 1-8: portrait. Section 9 (Complete Data): landscape.

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  Header,
  Footer,
} = require("docx");

// ─── HELPERS ──────────────────────────────────────────────────────────────────

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
  return `${d}/${m}/${y}`;
};

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = {
  top: cellBorder,
  bottom: cellBorder,
  left: cellBorder,
  right: cellBorder,
};
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const DARK = "1E3A5F";
const LIGHT = "D9E4F0";
const WHITE = "FFFFFF";
const GRAY = "F3F4F6";

// A4 portrait content width: 11906 - 720 - 720 = 10466 DXA
const CONTENT_WIDTH = 10466;

// Full-width image: 17.23 cm × 5.15 cm in EMU
const FULL_W_EMU = 6680400;  // ~17.01cm — fits 10466 DXA content width
const FULL_H_EMU = 1854000;  // height unchanged

const emuToPx = (emu) => Math.round(emu / 9525);

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
          new TextRun({
            text,
            bold: true,
            color: WHITE,
            size: 18,
            font: "Arial",
          }),
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
    keepNext: true,
    children: [new TextRun({ text, size: 20, font: "Arial" })],
  });

const spacer = (before = 120) =>
  new Paragraph({ spacing: { before }, children: [new TextRun("")] });

// ─── IMAGE HELPER ─────────────────────────────────────────────────────────────

function imageBlock(b64, widthEmu, heightEmu) {
  if (!b64) return null;
  const buf = Buffer.from(b64, "base64");
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    children: [
      new ImageRun({
        data: buf,
        transformation: {
          width: emuToPx(widthEmu),
          height: emuToPx(heightEmu),
        },
        type: "png",
      }),
    ],
  });
}

// ─── TABLE BUILDERS ───────────────────────────────────────────────────────────

function buildIndexCrimeTable(summary) {
  const COL = [2766, 1100, 1100, 1100, 1300, 1100, 1000];
  const TWIDTH = COL.reduce((a, b) => a + b, 0);

  const totals = summary.reduce(
    (acc, d) => ({
      total: acc.total + d.total,
      cleared: acc.cleared + d.cleared,
      solved: acc.solved + d.solved,
      ui: acc.ui + d.underInvestigation,
    }),
    { total: 0, cleared: 0, solved: 0, ui: 0 },
  );

  return new Table({
    width: { size: TWIDTH, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          hCell("Index Crime", COL[0]),
          hCell("Total", COL[1], { center: true }),
          hCell("Cleared", COL[2], { center: true }),
          hCell("Solved", COL[3], { center: true }),
          hCell("Under Inv.", COL[4], { center: true }),
          hCell("CCE %", COL[5], { center: true }),
          hCell("CSE %", COL[6], { center: true }),
        ],
      }),
      ...summary.map((row, i) => {
        const cce = pct(row.cleared + row.solved, row.total);
        const cse = pct(row.solved, row.total);
        return new TableRow({
          children: [
            dCell(CRIME_DISPLAY[row.crime] || row.crime, COL[0], {
              alt: i % 2 === 1,
            }),
            dCell(row.total, COL[1], { center: true, alt: i % 2 === 1 }),
            dCell(row.cleared, COL[2], {
              center: true,
              alt: i % 2 === 1,
              color: "1d4ed8",
            }),
            dCell(row.solved, COL[3], {
              center: true,
              alt: i % 2 === 1,
              color: "15803d",
            }),
            dCell(row.underInvestigation, COL[4], {
              center: true,
              alt: i % 2 === 1,
              color: "b45309",
            }),
            dCell(`${cce}%`, COL[5], { center: true, alt: i % 2 === 1 }),
            dCell(`${cse}%`, COL[6], { center: true, alt: i % 2 === 1 }),
          ],
        });
      }),
      new TableRow({
        children: [
          dCell("TOTAL", COL[0], { bold: true, shade: true }),
          dCell(totals.total, COL[1], {
            center: true,
            bold: true,
            shade: true,
          }),
          dCell(totals.cleared, COL[2], {
            center: true,
            bold: true,
            shade: true,
          }),
          dCell(totals.solved, COL[3], {
            center: true,
            bold: true,
            shade: true,
          }),
          dCell(totals.ui, COL[4], { center: true, bold: true, shade: true }),
          dCell(
            `${pct(totals.cleared + totals.solved, totals.total)}%`,
            COL[5],
            { center: true, bold: true, shade: true },
          ),
          dCell(`${pct(totals.solved, totals.total)}%`, COL[6], {
            center: true,
            bold: true,
            shade: true,
          }),
        ],
      }),
    ],
  });
}

function buildSummaryStatRows(totals, cce, cse) {
  const stats = [
    ["Total Incidents", String(totals.total)],
    ["Cleared", String(totals.cleared)],
    ["Solved", String(totals.solved)],
    ["Under Investigation", String(totals.ui)],
    ["CCE %", `${cce}%`],
    ["CSE %", `${cse}%`],
  ];

  const COL = [3200, 3200];
  return [
    new Table({
      width: { size: 6400, type: WidthType.DXA },
      columnWidths: COL,
      rows: stats.map(
        ([label, val], i) =>
          new TableRow({
            children: [
              dCell(label, COL[0], { alt: i % 2 === 1 }),
              dCell(val, COL[1], { bold: true, alt: i % 2 === 1 }),
            ],
          }),
      ),
    }),
  ];
}

function buildByDayTable(byDay) {
  const COL = [4200, 2000];
  const TWIDTH = COL.reduce((a, b) => a + b, 0);
  const total = byDay.reduce((s, r) => s + (r.count || 0), 0);

  return new Table({
    width: { size: TWIDTH, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          hCell("Day of Week", COL[0]),
          hCell("Incidents", COL[1], { center: true }),
        ],
      }),
      ...byDay.map(
        (row, i) =>
          new TableRow({
            children: [
              dCell(row.day, COL[0], { alt: i % 2 === 1 }),
              dCell(row.count, COL[1], {
                center: true,
                bold: true,
                alt: i % 2 === 1,
              }),
            ],
          }),
      ),
      new TableRow({
        children: [
          dCell("TOTAL", COL[0], { bold: true, shade: true }),
          dCell(total, COL[1], { center: true, bold: true, shade: true }),
        ],
      }),
    ],
  });
}

function buildModusTable(modus) {
  const COL = [2200, 3566, 900];
  const TWIDTH = COL.reduce((a, b) => a + b, 0);

  return new Table({
    width: { size: TWIDTH, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          hCell("Crime", COL[0]),
          hCell("Modus", COL[1]),
          hCell("Count", COL[2], { center: true }),
        ],
      }),
      ...modus.map(
        (row, i) =>
          new TableRow({
            children: [
              dCell(CRIME_DISPLAY[row.crime] || row.crime, COL[0], {
                alt: i % 2 === 1,
              }),
              dCell(row.modus, COL[1], { alt: i % 2 === 1 }),
              dCell(row.count, COL[2], {
                center: true,
                bold: true,
                alt: i % 2 === 1,
              }),
            ],
          }),
      ),
    ],
  });
}

function buildPlaceTable(place) {
  const COL = [700, 4966, 1200];
  const TWIDTH = COL.reduce((a, b) => a + b, 0);

  return new Table({
    width: { size: TWIDTH, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          hCell("#", COL[0], { center: true }),
          hCell("Location", COL[1]),
          hCell("Count", COL[2], { center: true }),
        ],
      }),
      ...place.map(
        (row, i) =>
          new TableRow({
            children: [
              dCell(i + 1, COL[0], { center: true, alt: i % 2 === 1 }),
              dCell(row.place, COL[1], { alt: i % 2 === 1 }),
              dCell(row.count, COL[2], {
                center: true,
                bold: true,
                alt: i % 2 === 1,
              }),
            ],
          }),
      ),
    ],
  });
}

function buildBarangayTable(barangay) {
  const COL = [700, 4966, 1200];
  const TWIDTH = COL.reduce((a, b) => a + b, 0);

  return new Table({
    width: { size: TWIDTH, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          hCell("#", COL[0], { center: true }),
          hCell("Barangay", COL[1]),
          hCell("Incidents", COL[2], { center: true }),
        ],
      }),
      ...barangay.map(
        (row, i) =>
          new TableRow({
            children: [
              dCell(i + 1, COL[0], { center: true, alt: i % 2 === 1 }),
              dCell(row.barangay, COL[1], { alt: i % 2 === 1 }),
              dCell(row.count, COL[2], {
                center: true,
                bold: true,
                alt: i % 2 === 1,
              }),
            ],
          }),
      ),
    ],
  });
}

// Complete Data table — uses smaller font (size 14 = 7pt) to fit landscape page
function buildCompleteDataTable(completeData) {
  // Landscape content width: 14678 DXA split across 9 columns
  // barangay | typeOfPlace | date | time | crimeOffense | modus | lat | lng | caseStatus
  const COL = [1800, 1500, 900, 800, 1800, 2666, 1000];
  // Total: 12678 — leave some breathing room on the page
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
            new TextRun({
              text,
              bold: true,
              color: WHITE,
              size: 14,
              font: "Arial",
            }),
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
          smH("Barangay", COL[0]),
          smH("Type of Place", COL[1]),
          smH("Date", COL[2], { center: true }),
          smH("Time", COL[3], { center: true }),
          smH("Crime Offense", COL[4]),
          smH("Modus", COL[5]),
          smH("Case Status", COL[6]),
        ],
      }),
      ...completeData.map((row, i) => {
        const statusLower = (row.caseStatus || "").toLowerCase();
        const isUI = !["cleared", "cce", "solved", "cse", "closed"].includes(
          statusLower,
        );
        const isSolved = ["solved", "cse"].includes(statusLower);
        const isCleared = ["cleared", "cce"].includes(statusLower);
        const statusColor = isUI
          ? "b45309"
          : isSolved
            ? "15803d"
            : isCleared
              ? "1d4ed8"
              : "000000";

        return new TableRow({
          children: [
            smD(row.barangay, COL[0], { alt: i % 2 === 1 }),
            smD(row.typeOfPlace, COL[1], { alt: i % 2 === 1 }),
            smD(row.date, COL[2], { center: true, alt: i % 2 === 1 }),
            smD(row.time, COL[3], { center: true, alt: i % 2 === 1 }),
            smD(CRIME_DISPLAY[row.crimeOffense] || row.crimeOffense, COL[4], {
              alt: i % 2 === 1,
            }),
            smD(row.modus, COL[5], { alt: i % 2 === 1 }),
            smD(row.caseStatus, COL[6], {
              alt: i % 2 === 1,
              color: statusColor,
            }),
          ],
        });
      }),
    ],
  });
}

function buildAssessmentSection(assessment, analysisData) {
  if (!assessment) return [];

  const elements = [];

  elements.push(sectionHeading("10. AI Crime Assessment"));

  // Scope block
  if (assessment.scope) {
    const COL = [2400, 8066];
    elements.push(
      new Table({
        width: { size: COL[0] + COL[1], type: WidthType.DXA },
        columnWidths: COL,
        rows: [
          new TableRow({
            children: [
              dCell("Date Range", COL[0], { alt: false }),
              dCell(assessment.scope.dateRange || "-", COL[1], { alt: false }),
            ],
          }),
          new TableRow({
            children: [
              dCell("Crime Type", COL[0], { alt: true }),
              dCell(assessment.scope.crimes || "-", COL[1], { alt: true }),
            ],
          }),
          new TableRow({
            children: [
              dCell("Barangay", COL[0], { alt: false }),
              dCell(assessment.scope.barangays || "-", COL[1], { alt: false }),
            ],
          }),
        ],
      }),
    );
    elements.push(spacer(80));
  }

  // Stats row
  if (assessment.stats) {
    const stats = [
      ["Total Incidents", String(assessment.stats.total ?? 0)],
      ["CCE %", `${assessment.stats.cce ?? "0.0"}%`],
      ["CSE %", `${assessment.stats.cse ?? "0.0"}%`],
      ["Under Investigation", String(assessment.stats.ui ?? 0)],
    ];
    const COL = [2400, 2400];
    elements.push(
      new Table({
        width: { size: COL[0] * 2, type: WidthType.DXA },
        columnWidths: COL,
        rows: stats.map(
          ([label, val], i) =>
            new TableRow({
              children: [
                dCell(label, COL[0], { alt: i % 2 === 1 }),
                dCell(val, COL[1], { bold: true, alt: i % 2 === 1 }),
              ],
            }),
        ),
      }),
    );
    elements.push(spacer(80));
  }

  // General assessment
  if (assessment.general_assessment) {
    elements.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [
          new TextRun({
            text: "General Assessment",
            bold: true,
            size: 22,
            font: "Arial",
            color: DARK,
          }),
        ],
      }),
    );
    elements.push(bodyText(assessment.general_assessment));
    elements.push(spacer(80));
  }

  // Per-crime sections
  const perCrime = assessment.per_crime || [];
  for (const crime of perCrime) {
    // Crime type heading
    elements.push(
      new Paragraph({
        spacing: { before: 240, after: 80 },
        border: {
          left: { style: BorderStyle.SINGLE, size: 16, color: DARK, space: 4 },
        },
        indent: { left: 120 },
        children: [
          new TextRun({
            text: crime.crime_type || "",
            bold: true,
            size: 24,
            font: "Arial",
            color: DARK,
          }),
        ],
      }),
    );

    // Croston forecast data if available
    const crostonEntry = analysisData?.croston?.per_crime?.find(
      (c) => c.crime === crime.crime_type,
    );
    if (crostonEntry) {
      const trendLabel =
        crostonEntry.trend === "increasing"
          ? "↑ Increasing"
          : crostonEntry.trend === "decreasing"
            ? "↓ Decreasing"
            : crostonEntry.trend === "insufficient_data"
              ? "Insufficient Data"
              : "→ Stable";

      const forecastText =
        crostonEntry.predicted_next_week !== null &&
        crostonEntry.predicted_next_week !== undefined
          ? `${crostonEntry.predicted_next_week} incidents next week (${crostonEntry.confidence ?? 0}% confidence)`
          : "Insufficient data for forecast";

      const COL = [2400, 8066];
      elements.push(
        new Table({
          width: { size: COL[0] + COL[1], type: WidthType.DXA },
          columnWidths: COL,
          rows: [
            new TableRow({
              children: [
                dCell("Trend", COL[0], { alt: false }),
                dCell(trendLabel, COL[1], { bold: true, alt: false }),
              ],
            }),
            new TableRow({
              children: [
                dCell("Forecast", COL[0], { alt: true }),
                dCell(forecastText, COL[1], { alt: true }),
              ],
            }),
          ],
        }),
      );
      elements.push(spacer(80));
    }

    // QUAD sections
    const quadSections = [
      { label: "Crime Assessment", value: crime.general_assessment },
      { label: "Operations", value: crime.operations },
      { label: "Intelligence", value: crime.intelligence },
      { label: "Investigations", value: crime.investigations },
      {
        label: "Police Community Relations",
        value: crime.police_community_relations,
      },
    ];

    for (const { label, value } of quadSections) {
      if (!value) continue;

      elements.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            new TextRun({
              text: label,
              bold: true,
              size: 20,
              font: "Arial",
              color: "374151",
            }),
          ],
        }),
      );

      // Operations has newline-separated lines — render each as its own paragraph
      if (label === "Operations") {
        const lines = value.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          elements.push(
            new Paragraph({
              spacing: { after: 40 },
              children: [
                new TextRun({
                  text: line.replace(/\*\*/g, ""),
                  size: 18,
                  font: "Arial",
                }),
              ],
            }),
          );
        }
      } else {
        elements.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: value, size: 18, font: "Arial" }),
            ],
          }),
        );
      }
    }

    elements.push(spacer(80));
  }

  return elements;
}

// ─── DOCUMENT BUILDER ─────────────────────────────────────────────────────────

async function buildExportDoc({
  summary,
  byDay,
  place,
  barangay,
  modus,
  completeData = [],
  meta,
  images = {},
  assessment = null,
  analysisData = null,
}) {
  const totals = summary.reduce(
    (acc, d) => ({
      total: acc.total + d.total,
      cleared: acc.cleared + d.cleared,
      solved: acc.solved + d.solved,
      ui: acc.ui + d.underInvestigation,
    }),
    { total: 0, cleared: 0, solved: 0, ui: 0 },
  );

  const cce = pct(totals.cleared + totals.solved, totals.total);
  const cse = pct(totals.solved, totals.total);

  const now = new Date().toLocaleString("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
    hour12: true,
  });

  const pushFullImage = (b64) => {
    const img = imageBlock(b64, FULL_W_EMU, FULL_H_EMU);
    return img ? [img, spacer(60)] : [];
  };

  // ── Shared header / footer paragraphs ──────────────────────────────────────
  const makeHeader = () =>
    new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 4,
              color: DARK,
              space: 1,
            },
          },
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: "CRIME DASHBOARD REPORT  ",
              size: 16,
              color: "6B7280",
              font: "Arial",
            }),
            new TextRun({
              text: `${meta.dateFrom ? fmtDateIso(meta.dateFrom) : ""} — ${meta.dateTo ? fmtDateIso(meta.dateTo) : ""}`,
              size: 16,
              color: "6B7280",
              font: "Arial",
            }),
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
            top: {
              style: BorderStyle.SINGLE,
              size: 4,
              color: "D1D5DB",
              space: 1,
            },
          },
          spacing: { before: 60 },
          children: [
            new TextRun({
              text: "Page ",
              size: 16,
              color: "9CA3AF",
              font: "Arial",
            }),
            new TextRun({
              children: [PageNumber.CURRENT],
              size: 16,
              color: "9CA3AF",
              font: "Arial",
            }),
            new TextRun({
              text: " of ",
              size: 16,
              color: "9CA3AF",
              font: "Arial",
            }),
            new TextRun({
              children: [PageNumber.TOTAL_PAGES],
              size: 16,
              color: "9CA3AF",
              font: "Arial",
            }),
            new TextRun({
              text: "  ·  Confidential  ·  For Official Use Only",
              size: 16,
              color: "9CA3AF",
              font: "Arial",
            }),
          ],
        }),
      ],
    });

  // ── Portrait section children (sections 1-8) ───────────────────────────────
  const portraitChildren = [
    // Cover
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "CRIME DASHBOARD REPORT",
          bold: true,
          size: 40,
          font: "Arial",
          color: DARK,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Index Crime Statistics",
          size: 26,
          font: "Arial",
          color: "6B7280",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `Reporting Period: ${meta.dateFrom ? fmtDateIso(meta.dateFrom) : "All dates"} — ${meta.dateTo ? fmtDateIso(meta.dateTo) : "All dates"}`,
          size: 22,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `Crime Types: ${meta.crimeTypes?.length ? meta.crimeTypes.join(", ") : "All Index Crimes"}`,
          size: 22,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `Barangays: ${meta.barangays?.length ? meta.barangays.join(", ") : "All Barangays"}`,
          size: 22,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Generated: ${now}`,
          size: 20,
          font: "Arial",
          color: "9CA3AF",
        }),
      ],
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: DARK, space: 1 },
      },
      spacing: { after: 200 },
      children: [new TextRun("")],
    }),

    // 1. Summary Statistics
    sectionHeading("1. Summary Statistics"),
    ...buildSummaryStatRows(totals, cce, cse),
    spacer(),

    // 2. Index Crime Summary Table
    sectionHeading("2. Index Crime Summary Table"),
    bodyText(
      "CCE (Crime Clearance Efficiency) = (Cleared + Solved) / Total  ·  CSE (Crime Solution Efficiency) = Solved / Total",
    ),
    spacer(60),
    buildIndexCrimeTable(summary),
    spacer(),

    // 3. Crime Index Trends (chart image)
    sectionHeading("3. Crime Index Trends"),
    ...pushFullImage(images.trends),

    // 4. Crime Clock (chart image)
    sectionHeading("4. Crime Clock — Hourly Distribution"),
    ...pushFullImage(images.clock),

    // 5. Crime by Day of Week (table)
    sectionHeading("5. Crime by Day of Week"),
    buildByDayTable(byDay),
    spacer(),

    // 6. Modus Operandi (table)
    sectionHeading("6. Modus Operandi"),
    buildModusTable(modus),
    spacer(),

    // 7. Place of Commission (table)
    sectionHeading("7. Place of Commission"),
    buildPlaceTable(place),
    spacer(),

    // 8. Barangay Incidents (table)
    sectionHeading("8. Barangay Incidents"),
    buildBarangayTable(barangay),
    spacer(),
  ];

  // ── Landscape section children (section 9 — Complete Data) ────────────────
  const landscapeChildren = [
    sectionHeading("9. Complete Data"),
    bodyText(`${completeData.length} total records`),
    spacer(60),
    ...(completeData.length > 0
      ? [buildCompleteDataTable(completeData), spacer()]
      : [bodyText("No records found for the selected filters.")]),
    ...buildAssessmentSection(assessment, analysisData),
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
        children: [...portraitChildren, ...landscapeChildren],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ─── EXPRESS HANDLER ──────────────────────────────────────────────────────────

const exportDashboard = async (req, res) => {
  try {
    const {
      summary = [],
      byDay = [],
      place = [],
      barangay = [],
      modus = [],
      completeData = [],
      meta = {},
      images = {},
      assessment = null,
      analysisData = null,
    } = req.body;

    const buffer = await buildExportDoc({
      summary,
      byDay,
      place,
      barangay,
      modus,
      completeData,
      meta,
      images,
      assessment,
      analysisData,
    });

    const dateStr =
      meta.dateFrom && meta.dateTo
        ? `${meta.dateFrom}_to_${meta.dateTo}`
        : new Date().toISOString().slice(0, 10);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="crime_dashboard_${dateStr}.docx"`,
    );
    res.send(buffer);
  } catch (err) {
    console.error("exportDashboard error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { exportDashboard };
