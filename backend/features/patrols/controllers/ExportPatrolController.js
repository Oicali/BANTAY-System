// backend/features/patrols/controllers/exportPatrolController.js
// Two PDF exports using docx + LibreOffice (same pattern as exportDashboardController.js)
//
//  POST /patrol/export/list   — full patrol list (active / upcoming / completed tables)
//  POST /patrol/export/detail — single patrol detail (map image + patrollers + timetable)

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
  PageBreak,
} = require("docx");

const libre = require("libreoffice-convert");
const libreConvert = (buf, ext, opt) =>
  new Promise((resolve, reject) =>
    libre.convert(buf, ext, opt, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    })
  );

// ─── SHARED DESIGN TOKENS ─────────────────────────────────────────────────────
const DARK  = "1E3A5F";
const LIGHT = "D9E4F0";
const WHITE = "FFFFFF";
const GRAY  = "F3F4F6";
const RED   = "DC2626";
const GREEN = "15803D";
const AMBER = "B45309";

const CONTENT_W = 10466; // A4 portrait: 11906 - 720*2 margins

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = {
  top: cellBorder, bottom: cellBorder,
  left: cellBorder, right: cellBorder,
};

// ─── CELL BUILDERS ────────────────────────────────────────────────────────────
const hCell = (text, w, opts = {}) =>
  new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: DARK, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text, bold: true, color: WHITE, size: 18, font: "Arial" })],
    })],
  });

const dCell = (text, w, opts = {}) =>
  new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: opts.shade ? LIGHT : opts.alt ? GRAY : WHITE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({
        text: String(text ?? "—"),
        bold: opts.bold || false,
        size: opts.size || 18,
        font: "Arial",
        color: opts.color || "000000",
      })],
    })],
  });

// ─── PARAGRAPH HELPERS ────────────────────────────────────────────────────────
const sectionHeading = (text) =>
  new Paragraph({
    spacing: { before: 320, after: 120 },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DARK, space: 1 } },
    children: [new TextRun({ text, bold: true, size: 28, font: "Arial", color: DARK })],
  });

const subHeading = (text) =>
  new Paragraph({
    spacing: { before: 200, after: 80 },
    keepNext: true,
    children: [new TextRun({ text, bold: true, size: 22, font: "Arial", color: DARK })],
  });

const bodyText = (text) =>
  new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 18, font: "Arial" })],
  });

const spacer = (before = 120) =>
  new Paragraph({ spacing: { before }, children: [new TextRun("")] });

// ─── DATE / TIME FORMATTERS ───────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
    .toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const fmtTime = (t) => {
  if (!t) return "—";
  const [hh, mm] = t.substring(0, 5).split(":").map(Number);
  const period = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${period}`;
};

// ─── HEADER / FOOTER FACTORIES ────────────────────────────────────────────────
const makeHeader = (title, subtitle = "") =>
  new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DARK, space: 1 } },
      spacing: { after: 60 },
      children: [
        new TextRun({ text: title, size: 16, color: "6B7280", font: "Arial" }),
        ...(subtitle ? [new TextRun({ text: `  ·  ${subtitle}`, size: 16, color: "9CA3AF", font: "Arial" })] : []),
      ],
    })],
  });

const makeFooter = () =>
  new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB", space: 1 } },
      spacing: { before: 60 },
      children: [
        new TextRun({ text: "Page ", size: 16, color: "9CA3AF", font: "Arial" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "9CA3AF", font: "Arial" }),
        new TextRun({ text: " of ", size: 16, color: "9CA3AF", font: "Arial" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "9CA3AF", font: "Arial" }),
        new TextRun({ text: "  ·  For Official Use Only", size: 16, color: "9CA3AF", font: "Arial" }),
      ],
    })],
  });

// ─── IMAGE BLOCK ──────────────────────────────────────────────────────────────
const emuToPx = (emu) => Math.round(emu / 9525);

const imageBlock = (b64, widthEmu, heightEmu) => {
  if (!b64) return null;
  const buf = Buffer.from(b64, "base64");
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    children: [new ImageRun({
      data: buf,
      transformation: { width: emuToPx(widthEmu), height: emuToPx(heightEmu) },
      type: "png",
    })],
  });
};

// ─── PATROL STATUS HELPERS ────────────────────────────────────────────────────
const getStatus = (patrol) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(patrol.start_date);
  const end   = new Date(patrol.end_date);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (today < start) return "upcoming";
  if (today > end)   return "completed";
  return "active";
};

const getStatusColor = (s) =>
  s === "active" ? GREEN : s === "upcoming" ? DARK : "6B7280";

// ─── PATROL LIST TABLE ────────────────────────────────────────────────────────
// Columns: #, Patrol Name, Mobile Unit, Duration, Patrollers, Barangays
const COL_LIST = [500, 2300, 1800, 2066, 1400, 2400];
const COL_LIST_TOTAL = COL_LIST.reduce((a, b) => a + b, 0);

const buildPatrolListTable = (patrols) => {
  if (!patrols.length) return bodyText("No patrols in this category.");

  return new Table({
    width: { size: COL_LIST_TOTAL, type: WidthType.DXA },
    columnWidths: COL_LIST,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          hCell("#",            COL_LIST[0], { center: true }),
          hCell("Patrol Name",  COL_LIST[1]),
          hCell("Mobile Unit",  COL_LIST[2]),
          hCell("Duration",     COL_LIST[3]),
          hCell("Patrollers",   COL_LIST[4], { center: true }),
          hCell("Barangays",    COL_LIST[5]),
        ],
      }),
      ...patrols.map((p, i) => {
        const barangays = [
          ...new Set(
            (p.routes || [])
              .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
              .map((r) => r.barangay)
          ),
        ].join(", ") || "—";

        const patrollerCount = [...new Set(
          (p.patrollers || []).map((pt) => pt.active_patroller_id)
        )].length;

        const duration = `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`;

        return new TableRow({
          children: [
            dCell(i + 1, COL_LIST[0], { center: true, alt: i % 2 === 1 }),
            dCell(p.patrol_name, COL_LIST[1], { bold: true, alt: i % 2 === 1 }),
            dCell(p.mobile_unit_name || "—", COL_LIST[2], { alt: i % 2 === 1 }),
            dCell(duration, COL_LIST[3], { alt: i % 2 === 1 }),
            dCell(patrollerCount, COL_LIST[4], { center: true, bold: true, alt: i % 2 === 1 }),
            dCell(barangays, COL_LIST[5], { alt: i % 2 === 1, size: 16 }),
          ],
        });
      }),
    ],
  });
};

// ─── EXPORT 1: PATROL LIST PDF ────────────────────────────────────────────────
const exportPatrolList = async (req, res) => {
  try {
    const { patrols = [] } = req.body;

    const active    = patrols.filter((p) => getStatus(p) === "active");
    const upcoming  = patrols.filter((p) => getStatus(p) === "upcoming");
    const completed = patrols.filter((p) => getStatus(p) === "completed");

    const now = new Date().toLocaleString("en-PH", {
      dateStyle: "long", timeStyle: "short", hour12: true,
    });

    // Summary stat cells
    const statCOL = [3200, 1600];
    const statTable = new Table({
      width: { size: 4800, type: WidthType.DXA },
      columnWidths: statCOL,
      rows: [
        new TableRow({ children: [
          dCell("Total Patrols",   statCOL[0]),
          dCell(patrols.length,   statCOL[1], { bold: true, center: true }),
        ]}),
        new TableRow({ children: [
          dCell("Active",          statCOL[0], { alt: true }),
          dCell(active.length,    statCOL[1], { bold: true, center: true, alt: true, color: GREEN }),
        ]}),
        new TableRow({ children: [
          dCell("Upcoming",        statCOL[0]),
          dCell(upcoming.length,  statCOL[1], { bold: true, center: true, color: DARK }),
        ]}),
        new TableRow({ children: [
          dCell("Completed",       statCOL[0], { alt: true }),
          dCell(completed.length, statCOL[1], { bold: true, center: true, alt: true, color: "6B7280" }),
        ]}),
      ],
    });

    const children = [
      // Cover
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: "PATROL SCHEDULING REPORT", bold: true, size: 40, font: "Arial", color: DARK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: `Generated: ${now}`, size: 20, font: "Arial", color: "9CA3AF" })],
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: DARK, space: 1 } },
        spacing: { after: 200 },
        children: [new TextRun("")],
      }),

      sectionHeading("Summary"),
      statTable,
      spacer(),

      // Active
      sectionHeading(`Active Patrols  (${active.length})`),
      buildPatrolListTable(active),
      spacer(),

      // Upcoming
      sectionHeading(`Upcoming Patrols  (${upcoming.length})`),
      buildPatrolListTable(upcoming),
      spacer(),

      // Completed
      sectionHeading(`Completed Patrols  (${completed.length})`),
      buildPatrolListTable(completed),
      spacer(),
    ];

    const doc = new Document({
      styles: { default: { document: { run: { font: "Arial", size: 18 } } } },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        headers: { default: makeHeader("PATROL SCHEDULING REPORT") },
        footers: { default: makeFooter() },
        children,
      }],
    });

    const docxBuf = await Packer.toBuffer(doc);
    const pdfBuf  = await libreConvert(docxBuf, ".pdf", undefined);

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="patrol_list_${dateStr}.pdf"`);
    res.send(pdfBuf);
  } catch (err) {
    console.error("exportPatrolList error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── EXPORT 2: PATROL DETAIL PDF ──────────────────────────────────────────────
const exportPatrolDetail = async (req, res) => {
  try {
    const { patrol, mapImage = null } = req.body;
    if (!patrol) return res.status(400).json({ success: false, message: "patrol is required" });

    const status      = getStatus(patrol);
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const statusColor = getStatusColor(status);

    const barangays = [
      ...new Set(
        (patrol.routes || [])
          .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
          .map((r) => r.barangay)
      ),
    ];

    // All unique dates in the patrol
    const dateRange = [];
    const start = new Date(patrol.start_date);
    const end   = new Date(patrol.end_date);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const cur = new Date(start);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      dateRange.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }

    const toDateStr = (d) => {
      if (!d) return null;
      if (typeof d === "string") {
        if (d.includes("T") || d.includes("Z")) {
          const dt = new Date(d);
          return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
        }
        return d.substring(0, 10);
      }
      return null;
    };

    const now = new Date().toLocaleString("en-PH", {
      dateStyle: "long", timeStyle: "short", hour12: true,
    });

    // ── 1. Cover / Info block ──────────────────────────────────────
    const infoCOL = [2800, CONTENT_W - 2800];
    const infoRows = [
      ["Patrol Name",   patrol.patrol_name],
      ["Mobile Unit",   patrol.mobile_unit_name || "—"],
      ["Status",        statusLabel],
      ["Start Date",    fmtDate(patrol.start_date)],
      ["End Date",      fmtDate(patrol.end_date)],
      ["Barangays",     barangays.join(", ") || "—"],
    ].map(([label, value], i) =>
      new TableRow({ children: [
        dCell(label, infoCOL[0], { alt: i % 2 === 1 }),
        dCell(value, infoCOL[1], {
          bold: label === "Patrol Name",
          alt: i % 2 === 1,
          color: label === "Status" ? statusColor : "000000",
        }),
      ]})
    );

    const infoTable = new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: infoCOL,
      rows: infoRows,
    });

    // ── 2. Map image ───────────────────────────────────────────────
    // ~17cm wide × ~10cm tall in EMU
   // AFTER — taller to fit the full map
const MAP_W_EMU = 6429600;  
const MAP_H_EMU = 5143500;  
    const mapBlock  = mapImage ? imageBlock(mapImage, MAP_W_EMU, MAP_H_EMU) : null;

    // ── 3. Patrollers table ────────────────────────────────────────
    const buildPatrollersTable = (patrollers) => {
      if (!patrollers || patrollers.length === 0)
        return bodyText("No patrollers assigned.");

      const COL = [500, 4000, 2000, 1500];
      const TOTAL = COL.reduce((a, b) => a + b, 0);

      return new Table({
        width: { size: TOTAL, type: WidthType.DXA },
        columnWidths: COL,
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              hCell("#",             COL[0], { center: true }),
              hCell("Officer Name",  COL[1]),
              hCell("Contact",       COL[2]),
              hCell("Shift",         COL[3], { center: true }),
            ],
          }),
          ...patrollers.map((p, i) =>
            new TableRow({ children: [
              dCell(i + 1,             COL[0], { center: true, alt: i % 2 === 1 }),
              dCell(p.officer_name,    COL[1], { alt: i % 2 === 1 }),
              dCell(p.contact_number || "—", COL[2], { alt: i % 2 === 1 }),
              dCell(p.shift || "—",   COL[3], { center: true, alt: i % 2 === 1,
                color: p.shift === "AM" ? DARK : AMBER }),
            ]})
          ),
        ],
      });
    };

    // Deduplicate patrollers for display
    const uniquePatrollers = [];
    const seen = new Set();
    for (const p of (patrol.patrollers || [])) {
      const key = `${p.active_patroller_id}-${p.shift}`;
      if (!seen.has(key)) { seen.add(key); uniquePatrollers.push(p); }
    }

    // ── 4. Timetable per date + shift ─────────────────────────────
    const buildTimetableTable = (tasks) => {
      if (!tasks || tasks.length === 0) return bodyText("No tasks scheduled.");

      const COL = [2200, 6266];
      const TOTAL = COL.reduce((a, b) => a + b, 0);

      return new Table({
        width: { size: TOTAL, type: WidthType.DXA },
        columnWidths: COL,
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              hCell("Time",         COL[0]),
              hCell("Task / Notes", COL[1]),
            ],
          }),
          ...tasks.map((r, i) =>
            new TableRow({ children: [
              dCell(`${fmtTime(r.time_start)} — ${fmtTime(r.time_end)}`, COL[0], {
                alt: i % 2 === 1, bold: true, color: DARK,
              }),
              dCell(r.notes || "—", COL[1], { alt: i % 2 === 1 }),
            ]})
          ),
        ],
      });
    };

    // Build timetable sections for every date × shift combo that has tasks
    const timetableElements = [];
    for (const date of dateRange) {
      const dateLabel = fmtDate(date);
      const amTasks = (patrol.routes || [])
        .filter((r) => toDateStr(r.route_date) === date && r.shift === "AM" && (r.stop_order || 0) > 0)
        .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
      const pmTasks = (patrol.routes || [])
        .filter((r) => toDateStr(r.route_date) === date && r.shift === "PM" && (r.stop_order || 0) > 0)
        .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

      if (amTasks.length === 0 && pmTasks.length === 0) continue;

      timetableElements.push(subHeading(dateLabel));

      if (amTasks.length > 0) {
        timetableElements.push(bodyText("AM Shift"));
        timetableElements.push(buildTimetableTable(amTasks));
        timetableElements.push(spacer(60));
      }
      if (pmTasks.length > 0) {
        timetableElements.push(bodyText("PM Shift"));
        timetableElements.push(buildTimetableTable(pmTasks));
        timetableElements.push(spacer(60));
      }
    }

    // ── Assemble children ──────────────────────────────────────────
    const children = [
      // Cover
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: "PATROL DETAIL REPORT", bold: true, size: 40, font: "Arial", color: DARK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: patrol.patrol_name, bold: true, size: 28, font: "Arial" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: `Generated: ${now}`, size: 18, font: "Arial", color: "9CA3AF" })],
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: DARK, space: 1 } },
        spacing: { after: 200 },
        children: [new TextRun("")],
      }),

      // 1. Patrol info
      sectionHeading("1. Patrol Information"),
      infoTable,
      spacer(),

      // 2. Area of Responsibility map
      sectionHeading("2. Area of Responsibility"),
      ...(mapBlock
        ? [mapBlock, spacer(60)]
        : [bodyText("Map image not available."), spacer(60)]),
      barangays.length > 0
        ? bodyText(`Barangays: ${barangays.join(", ")}`)
        : bodyText("No barangays assigned."),
      spacer(),

      // 3. Assigned Patrollers
      sectionHeading("3. Assigned Patrollers"),
      buildPatrollersTable(uniquePatrollers),
      spacer(),

      // 4. Timetable
      sectionHeading("4. Patrol Timetable"),
      ...(timetableElements.length > 0
        ? timetableElements
        : [bodyText("No tasks scheduled for this patrol.")]),
      spacer(),
    ];

    const doc = new Document({
      styles: { default: { document: { run: { font: "Arial", size: 18 } } } },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        headers: { default: makeHeader("PATROL DETAIL REPORT", patrol.patrol_name) },
        footers: { default: makeFooter() },
        children,
      }],
    });

    const docxBuf = await Packer.toBuffer(doc);
    const pdfBuf  = await libreConvert(docxBuf, ".pdf", undefined);

    const safeName = (patrol.patrol_name || "patrol").replace(/[^a-zA-Z0-9_-]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="patrol_${safeName}.pdf"`);
    res.send(pdfBuf);
  } catch (err) {
    console.error("exportPatrolDetail error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { exportPatrolList, exportPatrolDetail };