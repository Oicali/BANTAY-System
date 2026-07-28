// backend/features/ai-assessment/prompts/prompt.assessment.js

"use strict";

// ─── CRIME-SPECIFIC REASONING GUIDES ─────────────────────────────────────────
const CRIME_REASONING = {
  THEFT: {
    nature:
      "property crime — often opportunistic; highest volume index crime; opportunity-driven, so police presence and target hardening are primary deterrents",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize theft pattern using actual incident count, prevalent place type, peak hour/day/month, and hotspot barangay if detected. Reference Crime Pattern Analysis (CPA) findings. Do NOT repeat the crime assessment summary — focus on what the pattern means for patrol deployment.
      - Mission: State what the patrol unit aims to accomplish — reduce theft opportunity in the identified area during peak hours.
      - Execution: Specify patrol method matched to place type from data (residential areas call for foot patrol at block level; commercial/market areas call for foot or motorcycle patrol along identified corridors). Name the hotspot barangay specifically.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from the modus names in ACTUAL MODUS IN DATA. Example format: "At 8:00 AM – 9:00 AM, conduct foot patrol and target hardening check at [place type from data] in [hotspot barangay]." Do not assign tasks for modus not in the data.
      - Coordinating Instructions: Engage Barangay Tanods and BPATs for joint patrol. Task patrollers to establish or activate Barangay Information Network (BIN) contacts near hotspot barangay.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: prepare information on modus operandi using only the names in ACTUAL MODUS IN DATA. Brief the COP on patterns tied to those specific modus in the hotspot barangay.
      - Task beat patrollers as 'bee workers' — collectors of significant information from residents and business owners near the hotspot barangay. Information collected feeds back to the next Preparatory Conference.
      - Flag as Emerging Crime Problem (ECP) if trend is increasing AND Case Solution Efficiency (CSE) is below 30%.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: present updated list of open cases with modus breakdown using names from ACTUAL MODUS IN DATA only.
      - Prioritize open cases by modus as shown in data — cross-reference modus across cases to detect series crime patterns in the hotspot barangay.
      - Pursue recovery of stolen property as a primary case-closing mechanism.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: develop community engagement strategies aligned to the prevalent modus and place type from data in the hotspot barangay.
      - Task patrollers to build Barangay Information Network (BIN) in the hotspot barangay — identify community volunteers who can serve as early-warning contacts.
      - Engage Barangay Tanods for joint patrol during peak hours identified in data.
      - Address quality-of-life issues (lighting, blind spots, unsecured areas) near the prevalent place type in the hotspot barangay.
    `,
  },

  ROBBERY: {
    nature:
      "violent property crime — use or threat of force; higher victim impact than theft; demands mobile response capacity and rapid TOC coordination",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize robbery pattern using actual count, prevalent place type, peak hour/day/month, and hotspot barangay. Reference CPA findings. Do NOT repeat the crime assessment summary — focus on the deployment implication.
      - Mission: State the patrol unit's objective — deter robbery in identified place type areas during peak shift.
      - Execution: Robbery demands mobile patrol with standby capacity — foot patrol alone is insufficient. Deploy near the place type in the hotspot barangay identified in data.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from modus names in ACTUAL MODUS IN DATA. Example format: "At 2:00 PM – 3:00 PM, conduct mobile patrol and exterior check of [place type from data] in [hotspot barangay]."
      - Coordinating Instructions: Coordinate with Tactical Operations Center (TOC) for real-time communications during patrol.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: brief on modus patterns using only names in ACTUAL MODUS IN DATA. Prepare persons-of-interest list for pre-deployment briefing if repeat modus patterns are present in the hotspot barangay.
      - Develop informants near the place type identified in data — feed information back to the Preparatory Conference.
      - Flag as ECP if trend is increasing and CSE is below 30%.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: present open case list with modus breakdown using names from ACTUAL MODUS IN DATA only.
      - Victims and witnesses in open cases should be re-contacted promptly — brief patrollers to assist with witness identification during patrol in the hotspot barangay.
      - Cross-reference modus across cases for series crime or escalation patterns.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: develop strategies to reduce robbery opportunity at the prevalent place type in the hotspot barangay.
      - Brief establishments in high-incident areas on deterrence measures appropriate to the place type.
      - Task patrollers to develop Barangay Information Network (BIN) contacts near the hotspot barangay.
    `,
  },

  RAPE: {
    nature:
      "sexual violence crime — requires sensitive, victim-centered response; often involves known offenders in private settings; street patrol has limited deterrent value in most cases",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize pattern using actual count, prevalent place type, and peak period. Note that most rape cases involve known offenders — patrol posture must reflect place type data. Do NOT repeat the crime assessment summary.
      - Mission: State objective in terms of victim support infrastructure and community early-warning, not just patrol visibility.
      - Execution: If residential place type dominates, prioritize Women and Children Protection Desk (WCPD) coordination over foot patrol. Name the hotspot barangay specifically.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Coordinate all tasks with WCPD in the hotspot barangay.
      - Coordinating Instructions: WCPD must be involved in all operational planning. Coordinate with barangay Violence Against Women and Children (VAWC) desk in the hotspot barangay.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: focus on identifying repeat offenders and recurring locations in the hotspot barangay.
      - Develop informants within the community network (barangay officials, community leaders, barangay health workers) for early warning.
      - Flag as ECP if trend is increasing.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: all rape cases are priority-one regardless of CCE/CSE figures. WCPD should lead or co-lead all active investigations.
      - Under Investigation cases must be reviewed for victim support status and evidence collection completeness.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: develop community engagement strategies through WCPD in the hotspot barangay.
      - Engage schools, barangay health centers, and women's organizations as community partners.
      - Task patrollers to establish Barangay Information Network (BIN) contacts with trusted community figures in the hotspot barangay who can serve as safe reporting conduits.
    `,
  },

  MURDER: {
    nature:
      "capital offense — intentional killing; low frequency but highest consequence; any occurrence triggers priority-one response regardless of trend",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, hotspot barangay if detected, and modus from ACTUAL MODUS IN DATA. Do NOT repeat the crime assessment summary — focus on the threat context and deployment implication.
      - Mission: State the objective — deter further incidents in the hotspot barangay and support active investigations.
      - Execution: Mobile patrol with investigation support posture. Focus on hotspot barangay if detected.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Include warrant service for persons of interest where applicable. Name the hotspot barangay specifically.
      - Coordinating Instructions: NBI or CIDG coordination if modus data suggests organized crime involvement.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: murder warrants immediate intelligence effort regardless of trend. Identify if cases share a modus or geographic cluster in the hotspot barangay.
      - Task intelligence personnel to map relationships between victims if multiple cases are present.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: all murder cases are priority-one. Present updated warrant list and persons of interest to brief patrollers.
      - CSE below 30% for murder is a significant performance concern — flag explicitly to COP.
      - Coordinate with Regional Homicide Unit if case complexity warrants.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: engage barangay officials and community leaders in the hotspot barangay for information.
      - Build trust through consistent, visible presence in the hotspot barangay. Task patrollers to develop Barangay Information Network (BIN) contacts as witness conduits.
    `,
  },

  HOMICIDE: {
    nature:
      "unlawful killing without premeditation — may arise from reckless acts, altercations, or dispute escalation; often linked to alcohol, recreation venues, or personal conflicts",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, peak hour/day/month, and modus from ACTUAL MODUS IN DATA. Do NOT repeat the crime assessment summary — focus on what the pattern means for patrol deployment.
      - Mission: State the objective — prevent escalation of disputes in identified venues during peak windows in the hotspot barangay.
      - Execution: Focus patrol on the place type identified in data in the hotspot barangay. If nighttime hours dominate, assign to the correct shift.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window derived from temporal data. Name the hotspot barangay specifically.
      - Coordinating Instructions: Coordinate with LGU on ordinance enforcement only if nighttime altercation pattern is supported by temporal data.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: map recurring dispute locations and known antagonist groups in the hotspot barangay.
      - Develop community informants near incident-dense areas identified in cluster data.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: homicide cases with Under Investigation status require witness follow-up as a priority in the hotspot barangay.
      - Use only modus names from ACTUAL MODUS IN DATA when identifying priority cases.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: develop dialogue-based intervention strategies for the hotspot barangay.
      - Task patrollers to build Barangay Information Network (BIN) contacts with purok leaders and barangay kagawads in the hotspot barangay as early-warning network for escalating disputes.
    `,
  },

  "PHYSICAL INJURY": {
    nature:
      "assault resulting in injury — frequently domestic, alcohol-related, or dispute-driven; rarely stranger crime; best addressed through barangay-level intervention",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, peak hour/day/month, and modus from ACTUAL MODUS IN DATA. Do NOT repeat the crime assessment summary — focus on deployment implication.
      - Mission: State the objective — reduce injury incidents at identified place type during peak window in the hotspot barangay.
      - Execution: Deploy visibility near the place type in the hotspot barangay ONLY during the specific peak window. Do NOT recommend generic 24/7 increased patrol.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Name the hotspot barangay specifically.
      - Coordinating Instructions: Check-in with Barangay Tanods at shift start in the hotspot barangay.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: focus on repeat-location and repeat-offender patterns in the hotspot barangay.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: review open cases for VAWC angles where applicable. Mediation through barangay is a valid case disposition option.
      - Use modus names from ACTUAL MODUS IN DATA when identifying priority cases.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: barangay-level conflict resolution programs are more effective than patrol for this crime type.
      - Coordinate with DSWD, WCPD, and barangay VAWC desk for domestic-origin cases in the hotspot barangay.
      - Task patrollers to engage purok leaders and barangay kagawads in the hotspot barangay as community conflict early-warning network.
    `,
  },

  "SPECIAL COMPLEX CRIME": {
    nature:
      "composite offense combining elements of multiple index crimes — rare but highest consequence; any occurrence demands immediate elevated response",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, specific composite offense type, prevalent place type, and hotspot barangay if detected. Do NOT repeat the crime assessment summary.
      - Mission: State the objective — secure incident area, support investigation, and prevent recurrence.
      - Execution: Recommend regional-level coordination immediately — SOCO, WCPD, NBI as appropriate. Name the hotspot barangay specifically.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Tasks must be derived from the specific composite offense type and place type in data.
      - Coordinating Instructions: SOCO, WCPD, NBI, and RIID as appropriate.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: treat any occurrence as a potential organized crime indicator. Coordinate with RIID for regional threat context.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: prioritize SOCO involvement and full forensic documentation. No special complex crime should remain Under Investigation without weekly COP review.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: all public communication must be coordinated with the PIO.
      - Task patrol supervisors to provide reassurance through visible command presence in the hotspot barangay.
    `,
  },

  "CARNAPPING - MC": {
    nature:
      "theft of motorcycles — often by organized groups; targets both parked and moving units; route-dependent and inter-jurisdictional in nature",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, peak hour/day/month, hotspot barangay if detected, and modus from ACTUAL MODUS IN DATA. Do NOT repeat the crime assessment summary.
      - Mission: State the objective — reduce motorcycle theft opportunity along identified routes in the hotspot barangay.
      - Execution: Carnapping is route-specific — checkpoint operations and highway patrol are more effective than beat patrol. Name the hotspot barangay specifically.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from modus names in ACTUAL MODUS IN DATA.
      - Coordinating Instructions: Highway Patrol Group (HPG) coordination is standard. LTO for hot unit flagging.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: brief on modus patterns using only names in ACTUAL MODUS IN DATA. Monitor online selling platforms for suspicious listings in the hotspot barangay area.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: recovery of stolen units is the primary case-closing metric — coordinate with LTO for plate and chassis tracing on all open cases.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: community awareness must be tailored to the modus in ACTUAL MODUS IN DATA in the hotspot barangay.
      - Engage transport groups near the hotspot barangay as Barangay Information Network (BIN) partners.
    `,
  },

  "CARNAPPING - MV": {
    nature:
      "theft of four-wheeled vehicles — typically more planned than motorcycle theft; may involve syndicate activity across jurisdictions",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, peak hour/day/month, hotspot barangay if detected, and modus from ACTUAL MODUS IN DATA. Do NOT repeat the crime assessment summary.
      - Mission: State the objective — reduce vehicle theft opportunity at identified place type during peak window in the hotspot barangay.
      - Execution: Mobile patrol with checkpoint authority on major roads near the hotspot barangay.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from modus names in ACTUAL MODUS IN DATA.
      - Coordinating Instructions: HPG and LTO coordination are standard.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: coordinate with CIDG and HPG intelligence units for syndicate-level threat assessment if data supports it in the hotspot barangay.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: LTO coordination for vehicle tracing is mandatory in all open cases.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: awareness campaign for vehicle owners must be tailored to the modus in ACTUAL MODUS IN DATA in the hotspot barangay.
      - Task patrollers to develop Barangay Information Network (BIN) contacts with parking attendants and establishment security in the hotspot barangay.
    `,
  },
};

const DEFAULT_REASONING = {
  nature: "index crime requiring standard QUAD policing response",
  operations: `
    FIVE-PART PLAN GUIDANCE:
    - Situation: Summarize using actual count, prevalent place type, peak hour/day/month, and hotspot barangay if detected. Do NOT repeat the crime assessment summary — focus on deployment implication.
    - Mission: State the patrol unit's objective based on the crime situation assessment.
    - Execution: Match patrol method to place type from data. Name the hotspot barangay specifically.
    - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from modus names in ACTUAL MODUS IN DATA.
    - Coordinating Instructions: Engage Barangay Tanods and BPATs for joint patrol in the hotspot barangay.
  `,
  intelligence: `
    - Intelligence function at the Preparatory Conference: brief on modus patterns using only names in ACTUAL MODUS IN DATA. Focus on the hotspot barangay.
    - Flag as ECP if trend is increasing and CSE is below 30%.
    - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
  `,
  investigations: `
    - Investigation function at the Preparatory Conference: present open case list with modus breakdown using names from ACTUAL MODUS IN DATA only.
  `,
  pcr: `
    - PCR function at the Preparatory Conference: develop community engagement strategies aligned to prevalent modus and place type in the hotspot barangay.
    - Task patrollers to build Barangay Information Network (BIN) contacts in the hotspot barangay.
  `,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatHourWindow(hour) {
  if (hour === null || hour === undefined) return "unknown hours";
  const startH = hour % 12 || 12;
  const startSuffix = hour < 12 ? "AM" : "PM";
  const nextHour = hour + 1;
  const endH = nextHour === 24 ? 12 : (nextHour % 12 || 12);
  const endSuffix = nextHour >= 12 && nextHour < 24 ? "PM" : "AM";
  return `${startH}:00 ${startSuffix} – ${endH}:00 ${endSuffix}`;
}

function buildModusBlock(top3Modus, modusDescriptions = []) {
  if (!top3Modus || top3Modus.length === 0) return "No modus data available.";
  return top3Modus
    .map((m) => {
      const base = `${m.modus} (${m.percentage}%)`;
      const dbEntry = modusDescriptions.find(
        (d) => d.name.toUpperCase() === m.modus.toUpperCase(),
      );
      const desc = dbEntry?.description || "";
      return desc ? `${base}: ${desc}` : base;
    })
    .join("\n      ");
}


function buildDiagnosticsBlock(diagnosticData) {
  if (!diagnosticData) return "No diagnostic data available.";

  const lines = [];

  // Place group summary
  if (diagnosticData.place_group_summary?.length) {
    lines.push("PLACE TYPE GROUP BREAKDOWN:");
    diagnosticData.place_group_summary.forEach((g) => {
      lines.push(`  - ${g.group}: ${g.count} incidents (${g.percent}%)`);
    });
  }

  // Dominant group
  if (diagnosticData.dominant_place_group) {
    const dg = diagnosticData.dominant_place_group;
    lines.push(`DOMINANT PLACE GROUP: ${dg.group} — ${dg.count} incidents (${dg.percent}%)`);
  }

  // Dominant group peak time
  if (diagnosticData.dominant_group_peak_time) {
    const dt = diagnosticData.dominant_group_peak_time;
    lines.push(
      `DOMINANT GROUP PEAK TIME: ${dt.hour_label} — ${dt.count} incidents (${dt.percent}% of total)`
    );
  }

  // Top place type with time breakdown
  if (diagnosticData.top_place_type) {
    lines.push(`TOP PLACE TYPE: ${diagnosticData.top_place_type}`);
  }

  if (diagnosticData.peak_window_at_top_place) {
    const pw = diagnosticData.peak_window_at_top_place;
    lines.push(
      `PEAK WINDOW AT TOP PLACE: ${pw.hour_label} — ${pw.count} incidents` +
      ` (${pw.pct_of_place}% of incidents at this place type, ${pw.pct_of_total}% of all incidents)`
    );
  }

  // Concentration
  lines.push(
    `PLACE-TIME CONCENTRATION: ${diagnosticData.concentration_label} ` +
    `(${diagnosticData.concentration_score}% of all incidents explained by ` +
    `top place + peak hour combination)`
  );

  // Top place time breakdown
  if (diagnosticData.top_place_time_breakdown?.length) {
    lines.push("TOP HOURS AT TOP PLACE TYPE:");
    diagnosticData.top_place_time_breakdown.forEach((t) => {
      lines.push(
        `  - ${t.hour_label}: ${t.count} incidents ` +
        `(${t.pct_of_place}% of place, ${t.pct_of_total}% of total)`
      );
    });
  }

  // Modus CSE breakdown
  if (diagnosticData.modus_cse_breakdown?.length) {
    lines.push("MODUS-LEVEL CSE BREAKDOWN:");
    diagnosticData.modus_cse_breakdown.forEach((m) => {
      lines.push(
        `  - ${m.modus}: ${m.total} incidents (${m.pct_of_total}% of total) — ` +
        `CSE ${m.cse_percent}%, CCE ${m.cce_percent}%`
      );
    });
  }

  // Case age
  if (diagnosticData.case_age) {
    const ca = diagnosticData.case_age;
    lines.push(`CASE AGE (Under Investigation cases):`);
    lines.push(`  - Open cases: ${ca.ui_count}`);
    if (ca.mean_days_open !== null) {
      lines.push(`  - Mean days open: ${ca.mean_days_open}`);
      lines.push(`  - Max days open: ${ca.max_days_open}`);
      lines.push(`  - Over 30 days: ${ca.over_30_days}`);
      lines.push(`  - Over 90 days: ${ca.over_90_days}`);
    }
  }

  // Environmental diagnosis
  if (diagnosticData.environmental_diagnosis) {
    lines.push(`ENVIRONMENTAL DIAGNOSIS: ${diagnosticData.environmental_diagnosis}`);
  }

  return lines.join("\n      ");
}

// ─── PROMPT 1 — OVERALL ASSESSMENT ───────────────────────────────────────────

const buildGeneralAssessmentPrompt = ({ analysis, baseAssessment, riskBarangays = [] }) => {
  const { filters, stats, clusters, temporal, mode, overall_forecast } =
    analysis;
  const overall = stats?.overall || {};

  

  // ── Risk table top barangays ──────────────────────────────────────────────
  const riskBlock = riskBarangays.length > 0
    ? riskBarangays
        .map((r, i) =>
          `${i + 1}. ${r.barangay} — Risk Score ${r.risk_score}/100 (${r.tier} tier) — ${r.why_flagged}`
        )
        .join("\n")
    : "No risk data available.";

  const topHotspot = riskBarangays[0]
    ? `${riskBarangays[0].barangay} (Risk Score ${riskBarangays[0].risk_score}/100)`
    : "None detected";

  const modeInstruction =
    mode === "retrospective"
      ? "Frame as LESSONS LEARNED for the Preparatory Conference review. Use past tense."
      : "Frame as IMMEDIATE ACTION ITEMS for today's Preparatory Conference. Use present/future tense.";

  return `
You are a senior PNP crime analyst writing the OVERALL ASSESSMENT for a station commander.
This will be presented at the Preparatory Conference (Section 2.8, PNP Managing Patrol Operations
Manual 2015) as the opening situational summary before per-crime EMPO assessments.

ASSESSMENT PERIOD : ${filters?.date_from || "unknown"} to ${filters?.date_to || "unknown"}
FILTERED BARANGAYS: ${filters?.barangays?.join(", ") || "All barangays"}
MODE              : ${mode || "current"}
${modeInstruction}

OVERALL SITUATION:
Total incidents     : ${overall.total ?? 0}
Cleared             : ${overall.cleared ?? 0}
Solved              : ${overall.solved ?? 0}
Under investigation : ${overall.under_investigation ?? 0}
Overall CCE         : ${overall.cce_percent ?? 0}%
Overall CSE         : ${overall.cse_percent ?? 0}%
Peak hour           : ${overall.peak_hour !== null && overall.peak_hour !== undefined ? formatHourWindow(overall.peak_hour) : "Unknown"}
Peak day            : ${overall.peak_day ?? "Unknown"}
Peak month          : ${overall.peak_month ?? "Unknown"}

PATROL PRIORITY BARANGAYS (from risk model — use these for all location references):
${riskBlock}

BARANGAY NEEDING MOST ATTENTION:
${topHotspot}

PRIOR DRAFT (improve this, do not copy verbatim):
${baseAssessment?.overall_assessment || baseAssessment?.general_assessment || ""}

When referencing counts, always use numerals (e.g. "10 incidents", "3 cases") — never spell out numbers as words.

Return VALID JSON ONLY. No markdown, no backticks, no code fences, no extra keys.
All newlines within string values must be represented as \\n, not literal line breaks.
{
  "overall_assessment": "4 to 6 sentences for the Preparatory Conference. Cover: (1) total incidents, CCE/CSE performance, (2) which barangay needs most attention — use BARANGAY INCIDENT TOTALS above NOT cluster count, (3) peak period across all crimes, (4) flag any overall Emerging Crime Problem if combined trend is increasing and overall CSE is below 30%. Use actual numbers. Be specific and formal. Do NOT mention any forecast or prediction. Do NOT use the phrase 'general assessment'."
}
`.trim();
};

// ─── PROMPT 2 — PER CRIME ASSESSMENT ─────────────────────────────────────────

const buildPerCrimePrompt = ({
  analysis,
  crimeType,
  crimeBase,
  modusMap = {},
  diagnosticsMap = {},
  riskBarangays = [],
}) => {
  const { filters, stats, temporal, clusters, mode } = analysis;

  const crimeStat =
    (stats?.per_crime || []).find((c) => c.crime === crimeType) || {};
  const temporalMap = Object.fromEntries(
    (temporal?.per_crime || []).map((t) => [t.crime, t]),
  );

  // ── Risk table top barangays for this crime ───────────────────────────────
  const crimeCluster = null; // DBSCAN removed from AI — handled by risk table

  const temporal_data = temporalMap[crimeType] || {};
  const peakHour = crimeStat.peak_hour ?? temporal_data.peak_hour ?? null;
  const top3Hours = crimeStat.top_3_hours?.length
    ? crimeStat.top_3_hours
    : temporal_data.top_3_hours || [];

  const hoursDisplay =
    top3Hours.length > 0
      ? top3Hours.map(formatHourWindow).join(", ")
      : peakHour !== null
        ? formatHourWindow(peakHour)
        : "unknown";

  // ── Peak month ────────────────────────────────────────────────────────────
  const peakMonth =
    crimeStat.peak_month || temporal_data.peak_month || "Unknown";

  // ── Primary hotspot from risk table ──────────────────────────────────────
  const hotspotBarangay = riskBarangays[0]?.barangay
    || filters?.barangays?.[0]
    || "the filtered area";

  const riskBarangayBlock = riskBarangays.length > 0
    ? riskBarangays
        .map((r, i) =>
          `  ${i + 1}. ${r.barangay} — Risk Score ${r.risk_score}/100 (${r.tier} tier) — ${r.why_flagged}`
        )
        .join("\n")
    : `  No specific risk data available for ${crimeType}.`;

  const hotspotContext = `PATROL PRIORITY CONTEXT FOR ${crimeType} (from risk model):
${riskBarangayBlock}

IMPORTANT INSTRUCTION ON BARANGAY MENTIONS:
- Crime Assessment and Situation: may reference the top risk barangay (${hotspotBarangay}) as pattern context only
- Must Do tasks: state ACTION and TIME ONLY — do not name a specific barangay in each task
- Intelligence and PCR: state what to do and who to engage — no specific barangay required per task
- Investigations: name barangays only when referencing specific open cases
- Coordinating Instructions: may reference risk areas generally
- Reason: the risk table already tells the commander WHERE — EMPO tells them WHAT, WHEN, and HOW`;

  const modeInstruction =
    mode === "retrospective"
      ? "Frame as LESSONS LEARNED for the Preparatory Conference review. Use past tense."
      : "Frame as IMMEDIATE ACTION ITEMS for today's Preparatory Conference. Use present/future tense.";

  const guide = CRIME_REASONING[crimeType] || DEFAULT_REASONING;
  const crimeDiagnostic = diagnosticsMap[crimeType] || null;
const diagnosticsBlock = buildDiagnosticsBlock(crimeDiagnostic);

  

  const clusterText = `Removed — see PATROL PRIORITY BARANGAYS above`;

  // ── Modus context ─────────────────────────────────────────────────────────
  const top3ModusNames = (crimeStat.top_3_modus || [])
    .map((m) => m.modus)
    .filter(Boolean);

  const modusContextBlock =
    top3ModusNames.length > 0
      ? `ACTUAL MODUS IN DATA (use ONLY these names — never invent others):
${top3ModusNames.map((m, i) => `  ${i + 1}. ${m}`).join("\n")}`
      : `ACTUAL MODUS IN DATA: None recorded. Do not reference any modus name.`;

  const patrolOpsContext = `
PATROL OPERATIONS FRAMEWORK (PNP Managing Patrol Operations Manual 2015):

Preparatory Conference (Section 2.8): daily meeting where COP, QUAD Staff, and Patrol
Supervisors review CPA and ECP to guide patrol deployment.

Four QUAD Functions:
  - Operations   : Five-Part Plan patrol deployment
  - Intelligence : Modus briefing and informant development
  - Investigation: Case status, warrant list, persons of interest
  - PCR          : Community engagement, BIN development, force multipliers

Five-Part Plan (Section 3.5):
  a. Situation            — pattern from CPA (NOT a repeat of crime assessment text)
  b. Mission              — what the patrol unit aims to accomplish
  c. Execution            — patrol method matched to place type; hotspot barangay named
  d. Tasks (MUST DOs)     — specific duties with TIME WINDOW and LOCATION each
  e. Coordinating         — force multipliers, TOC, inter-agency
     Instructions

MUST DOs: time-stamped and location-specific. Example:
  "At 9:00 AM – 10:00 AM, conduct foot patrol at [place type] in [hotspot barangay]"

Barangay Information Network (BIN):
  Community members recruited by patrollers for early warning — specific recruit
  target required (e.g., market vendors, transport drivers, purok leaders) in the hotspot barangay.

ECP: declared when trend is increasing and CSE < 30% — triggers Station Patrol Plan adjustment.
`;

  return `
You are a senior PNP crime analyst writing the CRIME ASSESSMENT for: ${crimeType}
This output will be presented at today's Preparatory Conference.
${modeInstruction}

CRIME PATTERN ANALYSIS (CPA) FOR ${crimeType}:
  Total incidents              : ${crimeStat.total ?? 0}
  Cleared                      : ${crimeStat.cleared ?? 0}
  Solved                       : ${crimeStat.solved ?? 0}
  Under investigation          : ${crimeStat.under_investigation ?? 0}
  CCE                          : ${crimeStat.cce_percent ?? 0}%
  CSE                          : ${crimeStat.cse_percent ?? 0}%
  Trend                        : ${crimeStat.trend === "insufficient_data" ? "insufficient data" : (crimeStat.trend ?? "stable")}
  Emerging Crime Problem (ECP) : ${crimeStat.is_ecp ? "YES — declare ECP; Station Patrol Plan must be adjusted" : "No"}
  Peak hours                   : ${hoursDisplay}
  Peak day                     : ${crimeStat.peak_day ?? temporal_data.peak_day ?? "Unknown"}
  Peak month                   : ${peakMonth}
  Prevalent place type         : ${crimeStat.top_place_type ?? "Unknown"}
  Top modus (with descriptions):
      ${buildModusBlock(crimeStat.top_3_modus, modusMap[crimeType] || [])}
  

${hotspotContext}

${modusContextBlock}

${patrolOpsContext}

DIAGNOSTIC ANALYTICS FOR ${crimeType}:
  (This is WHY the crime pattern exists — use this to explain causes, not just describe patterns)
  ${diagnosticsBlock}

REASONING GUIDE FOR ${crimeType}:
  Nature              : ${guide.nature}
  Operations guidance : ${guide.operations.trim()}
  Intelligence guide  : ${guide.intelligence.trim()}
  Investigations guide: ${guide.investigations.trim()}
  PCR guidance        : ${guide.pcr.trim()}

PRIOR DRAFT (improve this, do not copy verbatim):
  crime_assessment   : ${crimeBase.crime_assessment || crimeBase.general_assessment || ""}
  operations         : ${crimeBase.operations || ""}
  intelligence       : ${crimeBase.intelligence || ""}
  investigations     : ${crimeBase.investigations || ""}
  pcr                : ${crimeBase.police_community_relations || ""}

Return VALID JSON ONLY. No markdown, no backticks, no code fences, no extra keys.
All newlines within string values must be represented as \\n, not literal line breaks. One object only.
{
  "crime_type": "${crimeType}",
  "crime_assessment": "5 to 6 sentences — unified performance and diagnostic summary. Structure strictly as follows: (1) state total incidents, CCE%, CSE% — numbers only, (2) state trend direction — if ECP is YES write 'warrants ECP declaration — Station Patrol Plan must be adjusted'; if ECP is NO do not mention ECP at all, (3) state peak temporal pattern — peak hour in AM/PM format, peak day, peak month, (4) WHY the crime pattern exists — use DIAGNOSTIC ANALYTICS to name dominant place group and explain the environmental driver, (5) state peak time window at top place type and the real-world activity it corresponds to, (6) state concentration level and what it means for patrol scope — reference ${hotspotBarangay} as the highest-risk area per the risk model. Use causal language throughout.",
  "operations": "Write the Five-Part Plan as a single plain-text string. Must Do tasks MUST be in chronological time order. Use exactly this format:\\nSituation: [deployment implication of crime pattern — reference ${hotspotBarangay} as primary risk area from risk model and the dominant place type]\\nMission: [one sentence objective — what the patrol unit aims to accomplish]\\nExecution: [patrol method matched to place type from data; reference peak hours; note that specific barangay deployment is guided by the risk table shown to the commander]\\nMust Do (1): At [time AM/PM], [specific patrol action] at [place type from data — NO barangay name]\\nMust Do (2): At [time AM/PM], [specific patrol action] at [place type from data — NO barangay name]\\n[Add Must Do (3)-(5) only if strongly supported by data — minimum 2, maximum 5]\\nCoordinating Instructions: [force multipliers — may reference risk areas generally]",
  "intelligence": "1 to 2 sentences. Reference at least one modus by name from ACTUAL MODUS IN DATA. State what information patrollers collect as bee workers and from whom — focus on WHO to collect from and WHAT to collect, not which specific barangay. Flag ECP if applicable.",
  "investigations": "1 to 2 sentences. If under_investigation is 0, state all cases cleared/solved. If > 0, state the number of open cases, reference modus from ACTUAL MODUS IN DATA, and name specific barangays only when tied to actual open case locations — not as generic patrol targets.",
  "police_community_relations": "1 to 2 sentences. Name at least one specific community partner type tied to the dominant place type from data. State one actionable BIN recruitment task — who to recruit and why, tied to the modus and place type. Use AM/PM time format. No need to specify a single barangay — the risk table guides deployment location.",
  
}

Critical rules:
- crime_assessment must be the commander's strategic implication — NOT a duplicate of Operations Situation.
- ONLY use modus names from ACTUAL MODUS IN DATA. Never invent modus names.
- Reference ${hotspotBarangay} in Crime Assessment and Situation ONLY. Must Do tasks must NEVER contain a barangay name — action and time only. This is a hard rule.
- NEVER write "No ECP declared", "ECP not warranted", or any negative ECP statement. If ECP is NO, do not mention ECP at all. Only write about ECP when is_ecp is YES.
- Do NOT use markdown — no asterisks, bold, italics, headers, backticks, or code fences. Plain text only.
- ALL time references must use AM/PM format (e.g. "8:00 AM – 9:00 AM") — never 24-hour time.
- MUST DO tasks must be plain prose sentences — never JSON arrays or bullet lists.
- Must Do tasks must be in chronological time order — earliest to latest.
- No extra keys. No invented facts. No arrays inside field values.
- When referencing counts, always use numerals (e.g. "10 incidents", "3 cases") — never spell out numbers as words.
- All newlines within string values must be represented as \\n, not literal line breaks.
- Return VALID JSON ONLY. No markdown, no backticks, no code fences. Start your response with { and end with }.
`.trim();
};

// ─── LEGACY EXPORT ────────────────────────────────────────────────────────────

const buildAssessmentPrompt = ({ analysis, baseAssessment }) => {
  return buildGeneralAssessmentPrompt({ analysis, baseAssessment });
};

module.exports = {
  buildAssessmentPrompt,
  buildGeneralAssessmentPrompt,
  buildPerCrimePrompt,
};