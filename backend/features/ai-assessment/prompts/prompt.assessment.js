// backend/features/ai-assessment/prompts/prompt.assessment.js

/**
 * prompt.assessment.js
 * Builds the Groq/LLM prompts from Python /analyze output.
 *
 * v5 changes (aligned to PNP Managing Patrol Operations Manual 2015):
 *  - Replaced incorrect "EMPO framework" reference with the manual's actual
 *    Five-Part Plan format: Situation → Mission → Execution → Tasks →
 *    Coordinating Instructions (Section 3.5)
 *  - Added Preparatory Conference (Section 2.8) as the framing context —
 *    AI output is now positioned as inputs to the daily COP conference
 *  - MUST DOs now require time window + specific location, per Annex A
 *  - BIN (Barangay Information Network) now framed as an actionable
 *    deliverable patrollers build, not just a mention
 *  - CPA (Crime Pattern Analysis) added as the analytical basis distinct
 *    from ECP (Emerging Crime Problem)
 *  - All hardcoded modus names removed from CRIME_REASONING static text
 *  - Dynamic modusContextBlock injected per crime — AI only sees modus
 *    names drawn from real incident data
 *  - Duplicate REASONING GUIDE block removed
 *  - formatShift() helper added for shift-aware deployment language
 */

"use strict";

// ─── CRIME-SPECIFIC REASONING GUIDES ─────────────────────────────────────────
// IMPORTANT: These guides must remain modus-agnostic.
// Do NOT hardcode any modus names here.
// Modus-specific content is injected dynamically via modusContextBlock,
// which is built from actual incident data at prompt-build time.
//
// All structural references below follow the PNP Managing Patrol Operations
// Manual 2015 (Five-Part Plan, QUAD functions, IPS, BIN, CPA/ECP, MUST DOs).

const CRIME_REASONING = {
  THEFT: {
    nature:
      "property crime — often opportunistic; highest volume index crime; opportunity-driven, so police presence and target hardening are primary deterrents",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize theft pattern using actual incident count, prevalent place type, peak hour/day, and cluster barangay if detected. Reference Crime Pattern Analysis (CPA) findings.
      - Mission: State what the patrol unit aims to accomplish — reduce theft opportunity in the identified area during peak hours.
      - Execution: Specify patrol method matched to place type from data (residential areas call for foot patrol at block level; commercial/market areas call for foot or motorcycle patrol along identified corridors).
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from the modus names in ACTUAL MODUS IN DATA. Example format: "At 8:00 AM – 9:00 AM, conduct foot patrol and target hardening check at [place type from data] in [cluster barangay]." Do not assign tasks for modus not in the data.
      - Coordinating Instructions: Engage Barangay Tanods and BPATs for joint patrol. Task patrollers to establish or activate Barangay Information Network (BIN) contacts near cluster barangay — BIN contacts are community members who provide early warning on suspicious persons and activity.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: prepare information on modus operandi using only the names in ACTUAL MODUS IN DATA. Brief the COP on patterns tied to those specific modus.
      - Task beat patrollers as 'bee workers' — collectors of significant information from residents and business owners near the hotspot area. Information collected feeds back to the next Preparatory Conference.
      - Flag as Emerging Crime Problem (ECP) if trend is increasing AND Case Solution Efficiency (CSE) is below 30% — ECP declaration triggers adjustment of the Station Patrol Plan.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: present updated list of open cases with modus breakdown using names from ACTUAL MODUS IN DATA only.
      - Prioritize open cases by modus as shown in data — cross-reference modus across cases to detect series crime patterns.
      - Pursue recovery of stolen property as a primary case-closing mechanism. Brief patrollers on persons of interest and wanted persons related to open theft cases.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: develop community engagement strategies aligned to the prevalent modus and place type from data — not generic theft prevention messaging.
      - Task patrollers to build Barangay Information Network (BIN) in the cluster barangay — identify community volunteers who can serve as early-warning contacts.
      - Engage Barangay Tanods for joint patrol during peak hours identified in data.
      - Address quality-of-life issues (lighting, blind spots, unsecured areas) near the prevalent place type as crime breeding grounds.
    `,
  },

  ROBBERY: {
    nature:
      "violent property crime — use or threat of force; higher victim impact than theft; demands mobile response capacity and rapid TOC coordination",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize robbery pattern using actual count, prevalent place type, peak hour/day, and cluster barangay. Reference CPA findings and note if an ECP declaration is warranted.
      - Mission: State the patrol unit's objective — deter robbery in identified place type areas during peak shift.
      - Execution: Robbery demands mobile patrol with standby capacity — foot patrol alone is insufficient. Deploy near the place type identified in data.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from modus names in ACTUAL MODUS IN DATA. Example format: "At 2:00 PM – 3:00 PM, conduct mobile patrol and exterior check of [place type from data] in [cluster barangay]." Do not assign tasks for modus not in the data.
      - Coordinating Instructions: Coordinate with Tactical Operations Center (TOC) for real-time communications during patrol. Engage Highway Patrol Group (HPG) only if highway-related modus appears in ACTUAL MODUS IN DATA.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: brief on modus patterns using only names in ACTUAL MODUS IN DATA. Prepare persons-of-interest list for pre-deployment briefing if repeat modus patterns are present.
      - Develop informants near the place type identified in data — feed information back to the Preparatory Conference.
      - Flag as ECP if trend is increasing and CSE is below 30%.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: present open case list with modus breakdown using names from ACTUAL MODUS IN DATA only. Update staff on case development and support needed.
      - Victims and witnesses in open cases should be re-contacted promptly — brief patrollers to assist with witness identification during patrol.
      - Cross-reference modus across cases for series crime or escalation patterns.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: develop strategies to reduce robbery opportunity at the prevalent place type from data.
      - Brief establishments in high-incident areas on deterrence measures appropriate to the place type — engage relevant business associations.
      - Task patrollers to develop Barangay Information Network (BIN) contacts near commercial or transport clusters if identified in data.
    `,
  },

  RAPE: {
    nature:
      "sexual violence crime — requires sensitive, victim-centered response; often involves known offenders in private settings; street patrol has limited deterrent value in most cases",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize pattern using actual count, prevalent place type, and peak period. Note that most rape cases involve known offenders — patrol posture must reflect place type data, not assumed street-crime patterns.
      - Mission: State objective in terms of victim support infrastructure and community early-warning, not just patrol visibility.
      - Execution: If residential place type dominates, prioritize Women and Children Protection Desk (WCPD) coordination over foot patrol. If public place type dominates, assign visibility at the specific location type identified in data during peak hours.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks from place type and temporal data — not from modus assumptions. Coordinate all tasks with WCPD.
      - Coordinating Instructions: WCPD must be involved in all operational planning for this offense. Coordinate with barangay Violence Against Women and Children (VAWC) desk.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: focus on identifying repeat offenders and recurring locations — not street-level modus patterns.
      - Develop informants within the community network (barangay officials, community leaders, barangay health workers) for early warning.
      - Flag as ECP if trend is increasing — note the sensitivity of this classification to the commander.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: all rape cases are priority-one regardless of CCE/CSE figures. WCPD should lead or co-lead all active investigations.
      - Under Investigation cases must be reviewed for victim support status and evidence collection completeness — brief the COP on any gaps.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: develop community engagement strategies through WCPD — not general patrol channels.
      - Engage schools, barangay health centers, and women's organizations as community partners.
      - Task patrollers to establish Barangay Information Network (BIN) contacts with trusted community figures who can serve as safe reporting conduits.
      - Establish safe reporting channels through barangay-level VAWC desks.
    `,
  },

  MURDER: {
    nature:
      "capital offense — intentional killing; low frequency but highest consequence; any occurrence triggers priority-one response regardless of trend",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, cluster barangay if detected, and modus from ACTUAL MODUS IN DATA. Note CPA findings and any series pattern across cases.
      - Mission: State the objective — deter further incidents in identified hotspot area and support active investigations.
      - Execution: Mobile patrol with investigation support posture — not just visibility. Focus on cluster barangay if detected.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Include warrant service for persons of interest as a MUST DO where applicable. Example format: "At 6:00 PM – 8:00 PM, conduct mobile patrol with heightened visibility in [cluster barangay]; coordinate warrant service for persons of interest with investigation team."
      - Coordinating Instructions: National Bureau of Investigation (NBI) or Criminal Investigation and Detection Group (CIDG) coordination if modus data suggests organized crime involvement. Regional Homicide Unit if case complexity warrants.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: murder warrants immediate intelligence effort regardless of trend. Identify if cases share a modus or geographic cluster — a series pattern indicates an organized threat.
      - Task intelligence personnel to map relationships between victims if multiple cases are present. Consider contextual threat factors consistent with the modus data — do not assume context not shown in data.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: all murder cases are priority-one — no case should remain Under Investigation without active follow-up. Present updated warrant list and persons of interest to brief patrollers.
      - CSE below 30% for murder is a significant performance concern — flag explicitly to COP.
      - Coordinate with Regional Homicide Unit if case complexity warrants.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: engage barangay officials and community leaders for information — murder cases often have community witnesses reluctant to come forward.
      - Build trust through consistent, visible presence in the affected barangay. Task patrollers to develop Barangay Information Network (BIN) contacts as witness conduits.
      - Tailor engagement approach to contextual factors suggested by modus data — avoid public announcements that could compromise witness safety.
    `,
  },

  HOMICIDE: {
    nature:
      "unlawful killing without premeditation — may arise from reckless acts, altercations, or dispute escalation; often linked to alcohol, recreation venues, or personal conflicts",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, peak hour/day, and modus from ACTUAL MODUS IN DATA. Note if nighttime altercation pattern is present in temporal data.
      - Mission: State the objective — prevent escalation of disputes in identified venues during peak windows.
      - Execution: Focus patrol on the place type identified in data (recreation venues, public gathering spots, drinking establishments). If nighttime hours dominate, assign to the correct shift. Recommend alcohol-related enforcement only if nighttime and recreation venue pattern is supported by data.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window derived from temporal data. Example format: "At 9:00 PM – 11:00 PM, conduct foot patrol and visibility check at [place type from data] in [cluster barangay or peak area]."
      - Coordinating Instructions: Coordinate with Local Government Unit (LGU) on ordinance enforcement (liquor bans, curfew) only if nighttime altercation pattern is supported by temporal data.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: map recurring dispute locations and known antagonist groups using actual incident locations from data.
      - Develop community informants near incident-dense barangays identified in cluster data.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: homicide cases with Under Investigation status require witness follow-up as a priority — brief patrollers to assist with witness identification during patrol.
      - Modus data should inform arrest and evidence strategy — use only modus names from ACTUAL MODUS IN DATA.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: develop dialogue-based intervention strategies for barangays with multiple homicide incidents.
      - Engage barangay peace and order councils on early conflict resolution — address dispute breeding grounds.
      - Task patrollers to build Barangay Information Network (BIN) contacts with purok leaders and barangay kagawads as early-warning network for escalating disputes.
      - Partner with Department of Social Welfare and Development (DSWD) for at-risk individual referrals if temporal or place data suggests youth or substance involvement.
    `,
  },

  "PHYSICAL INJURY": {
    nature:
      "assault resulting in injury — frequently domestic, alcohol-related, or dispute-driven; rarely stranger crime; poorly addressed by blanket street patrol; best addressed through barangay-level intervention",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, peak hour/day, and modus from ACTUAL MODUS IN DATA. Note if domestic or recreational venue pattern is evident.
      - Mission: State the objective — reduce injury incidents at identified place type during peak window; support barangay-level dispute resolution.
      - Execution: Physical injuries are poorly addressed by blanket street patrol — most occur in residential or semi-private spaces. Deploy visibility near the place type identified in data ONLY during the specific peak window. Do NOT recommend generic 24/7 increased patrol.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Example format: "At 10:00 PM – 12:00 AM, conduct foot patrol and check-in with Barangay Tanods near [place type from data] in [cluster barangay or peak area]." Tasks must be derived from place type and temporal data only — not invented from assumed modus.
      - Coordinating Instructions: Check-in with Barangay Tanods at shift start. Coordinate with barangay officials on known dispute-prone households or establishments identified through community intelligence.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: focus on repeat-location and repeat-offender patterns using actual incident data. Flag establishments or households with multiple incidents for barangay-level intervention.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: review open cases for Violence Against Women and Children (VAWC) angles where applicable. Mediation through barangay is a valid case disposition option — note this to the COP.
      - Use modus names from ACTUAL MODUS IN DATA when identifying priority cases.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: barangay-level conflict resolution programs are more effective than patrol for this crime type — develop these as the primary PCR strategy.
      - Coordinate with DSWD, Women and Children Protection Desk (WCPD), and barangay VAWC desk for domestic-origin cases.
      - Task patrollers to engage purok leaders and barangay kagawads as community conflict early-warning network — these are the Barangay Information Network (BIN) contacts for this crime type.
    `,
  },

  "SPECIAL COMPLEX CRIME": {
    nature:
      "composite offense combining elements of multiple index crimes (e.g. rape with homicide, kidnapping with murder) — rare but highest consequence; any occurrence demands immediate elevated response",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, specific composite offense type, prevalent place type, and cluster if detected. Any occurrence warrants elevated CPA review at the Preparatory Conference.
      - Mission: State the objective — secure incident area, support investigation, and prevent recurrence.
      - Execution: Recommend regional-level coordination immediately — Scene of the Crime Operations (SOCO), WCPD, NBI as appropriate to the specific composite offense. Mobile patrol with investigation support posture.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Tasks must be derived from the specific composite offense type and place type in data.
      - Coordinating Instructions: SOCO, WCPD, NBI, and Regional Intelligence and Investigation Division (RIID) as appropriate. Public Information Officer (PIO) must coordinate any community communication.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: treat any occurrence as a potential organized crime indicator — initiate full intelligence assessment immediately. Coordinate with RIID for regional threat context.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: prioritize SOCO involvement and full forensic documentation. No special complex crime should remain Under Investigation without weekly COP review — flag this explicitly.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: all public communication must be coordinated with the Public Information Officer (PIO) — community anxiety is high for this offense type.
      - Task patrol supervisors to provide reassurance through visible command presence in the affected barangay — not just rank-and-file patrol.
      - Avoid releasing case details that could compromise investigation integrity.
    `,
  },

  "CARNAPPING - MC": {
    nature:
      "theft of motorcycles — often by organized groups; targets both parked and moving units; route-dependent and inter-jurisdictional in nature",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, peak hour/day, cluster barangay if detected, and modus from ACTUAL MODUS IN DATA. Note if inter-jurisdictional pattern is suggested by data.
      - Mission: State the objective — reduce motorcycle theft opportunity along identified routes and in cluster barangay.
      - Execution: Carnapping is route-specific — checkpoint operations and highway patrol are more effective than beat patrol. Reference the peak hour window and assign to the correct shift.
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from modus names in ACTUAL MODUS IN DATA. Example format: "At 8:00 PM – 10:00 PM, conduct checkpoint operation at [specific road or area in cluster barangay]; verify motorcycle registrations and check for hot units." Do not assign tasks for modus not in the data.
      - Coordinating Instructions: Highway Patrol Group (HPG) coordination is standard. Land Transportation Office (LTO) for hot unit flagging. Coordinate with adjacent stations if cross-boundary modus pattern is evident in data.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: brief on modus patterns using only names in ACTUAL MODUS IN DATA. Carnapping groups often operate across jurisdictions — develop intelligence on receiver and chop-shop networks consistent with the modus data.
      - Monitor online selling platforms for suspicious listings aligned to unit types in incident data.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: recovery of stolen units is the primary case-closing metric — coordinate with LTO for plate and chassis tracing on all open cases.
      - Build a stolen motorcycle database entry per case for cross-station matching. Prioritize cases by modus names in ACTUAL MODUS IN DATA.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: community awareness must be tailored to the modus in ACTUAL MODUS IN DATA — not generic anti-theft messaging.
      - Engage transport groups relevant to the unit types in incident data as Barangay Information Network (BIN) partners — delivery riders and transport operators are valuable community intelligence sources for this crime type.
    `,
  },

  "CARNAPPING - MV": {
    nature:
      "theft of four-wheeled vehicles — typically more planned than motorcycle theft; method varies by modus; may involve syndicate activity across jurisdictions",
    operations: `
      FIVE-PART PLAN GUIDANCE:
      - Situation: Summarize using actual count, prevalent place type, peak hour/day, cluster barangay if detected, and modus from ACTUAL MODUS IN DATA. Note if syndicate-level pattern is suggested by data.
      - Mission: State the objective — reduce vehicle theft opportunity at identified place type during peak window.
      - Execution: Mobile patrol with checkpoint authority on major roads. 
      - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from modus names in ACTUAL MODUS IN DATA. Example format: "At 10:00 AM – 12:00 PM, conduct mobile patrol and parking area check at [place type from data] in [cluster barangay]; verify vehicle registrations at checkpoint." Do not assign tasks for modus not in the data.
      - Coordinating Instructions: HPG and LTO coordination are standard. CIDG engagement only if syndicate-level modus is suggested by data.
    `,
    intelligence: `
      - Intelligence function at the Preparatory Conference: coordinate with CIDG and HPG intelligence units for syndicate-level threat assessment if data supports it. Monitor reports of suspicious activity (e.g., casing of parking areas) — tie to place type in data.
      - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
    `,
    investigations: `
      - Investigation function at the Preparatory Conference: LTO coordination for vehicle tracing is mandatory in all open cases. Review for insurance fraud angle only if volume data supports this.
      - Prioritize cases by modus names in ACTUAL MODUS IN DATA.
    `,
    pcr: `
      - PCR function at the Preparatory Conference: awareness campaign for vehicle owners must be tailored to the modus in ACTUAL MODUS IN DATA — not generic anti-theft advice.
      - Coordinate with mall and establishment security on CCTV coverage of parking facilities if place type data supports this.
      - Task patrollers to develop Barangay Information Network (BIN) contacts with parking attendants and establishment security as early-warning sources.
    `,
  },
};

const DEFAULT_REASONING = {
  nature: "index crime requiring standard QUAD policing response",
  operations: `
    FIVE-PART PLAN GUIDANCE:
    - Situation: Summarize using actual count, prevalent place type, peak hour/day, and cluster barangay if detected. Reference CPA findings.
    - Mission: State the patrol unit's objective based on the crime situation assessment.
    - Execution: Match patrol method to place type from data. Reference cluster barangay by name — never use coordinates.
    - Tasks (MUST DOs): Each task must have a specific location AND a time window. Derive tasks exclusively from modus names in ACTUAL MODUS IN DATA. Do not assign tasks for modus not listed.
    - Coordinating Instructions: Engage Barangay Tanods and BPATs for joint patrol. Activate Barangay Information Network (BIN) near cluster area.
  `,
  intelligence: `
    - Intelligence function at the Preparatory Conference: brief on modus patterns using only names in ACTUAL MODUS IN DATA.
    - Task beat patrollers as 'bee workers' — collectors of significant information from the community near incident hotspots. Feed back to next Preparatory Conference.
    - Flag as ECP if trend is increasing and CSE is below 30%.
    - CRITICAL: Never reference a modus name not present in ACTUAL MODUS IN DATA.
  `,
  investigations: `
    - Investigation function at the Preparatory Conference: present open case list with modus breakdown using names from ACTUAL MODUS IN DATA only.
    - Cross-reference modus across cases for series crime indicators.
  `,
  pcr: `
    - PCR function at the Preparatory Conference: develop community engagement strategies aligned to prevalent modus and place type from data — not generic messaging.
    - Task patrollers to build Barangay Information Network (BIN) contacts in the cluster barangay.
    - Engage Barangay Tanods for joint patrol and information development during peak hours.
  `,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatHourWindow(hour) {
  if (hour === null || hour === undefined) return "unknown hours";
  const start = hour % 12 || 12;
  const end = (hour + 1) % 12 || 12;
  const startSuffix = hour < 12 ? "AM" : "PM";
  const endSuffix = hour + 1 < 12 ? "AM" : "PM";
  return `${start}:00 ${startSuffix} – ${end}:00 ${endSuffix}`;
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

/**
 * Builds cluster summary using barangay names — no raw coordinates.
 */
function buildClusterBlock(clusters) {
  if (!clusters || clusters.length === 0)
    return "No significant geographic clusters detected.";

  return clusters
    .map((c, i) => {
      const label = String.fromCharCode(65 + i); // A, B, C...
      return `Cluster ${label}: ${c.count} incidents in ${c.prevalent_barangay || "Unknown barangay"} — prevalent crime: ${c.prevalent_crime}, prevalent modus: ${c.prevalent_modus}`;
    })
    .join("\n");
}

// ─── PROMPT 1 — GENERAL ASSESSMENT ONLY ──────────────────────────────────────

const buildGeneralAssessmentPrompt = ({ analysis, baseAssessment }) => {
  const { filters, stats, clusters, mode } = analysis;
  const overall = stats?.overall || {};
  const clusterBlock = buildClusterBlock(clusters?.clusters || []);

  const modeInstruction =
    mode === "retrospective"
      ? "Frame as LESSONS LEARNED for the Preparatory Conference review. Use past tense."
      : "Frame as IMMEDIATE ACTION ITEMS for today's Preparatory Conference. Use present/future tense.";

  return `
You are a senior PNP crime analyst writing a formal strategic assessment for a station commander.
This assessment will be presented at the Preparatory Conference (Section 2.8 of the PNP Managing
Patrol Operations Manual 2015) — the daily meeting where the Chief of Police, QUAD Staff, and
Patrol Supervisors review Crime Pattern Analysis (CPA) and Emerging Crime Problems (ECP) to guide
patrol deployment decisions.

ASSESSMENT PERIOD: ${filters?.date_from || "unknown"} to ${filters?.date_to || "unknown"}
AREA: ${filters?.barangays?.join(", ") || "All barangays"}
MODE: ${mode || "current"}
${modeInstruction}

OVERALL SITUATION (Crime Pattern Analysis):
Total incidents     : ${overall.total ?? 0}
Cleared             : ${overall.cleared ?? 0}
Solved              : ${overall.solved ?? 0}
Under investigation : ${overall.under_investigation ?? 0}
Overall CCE         : ${overall.cce_percent ?? 0}%
Overall CSE         : ${overall.cse_percent ?? 0}%
Peak hour           : ${overall.peak_hour !== null && overall.peak_hour !== undefined ? formatHourWindow(overall.peak_hour) : "Unknown"}
Peak day            : ${overall.peak_day ?? "Unknown"}
Peak month          : ${overall.peak_month ?? "Unknown"}

GEOGRAPHIC HOTSPOTS (DBSCAN Cluster Analysis):
${clusterBlock}

PRIOR DRAFT (improve this, do not copy verbatim):
${baseAssessment?.general_assessment || ""}

Return VALID JSON ONLY. No markdown. No extra keys.
{
  "general_assessment": "3 to 5 sentences for the Preparatory Conference. Cover: total incidents from the Crime Pattern Analysis, CCE/CSE performance, top crime by volume, peak period, and most significant hotspot barangay if detected. Flag any Emerging Crime Problem. Use actual numbers. Be specific and formal."
}
`.trim();
};

// ─── PROMPT 2 — PER CRIME TYPE (called once per crime) ────────────────────────

const buildPerCrimePrompt = ({
  analysis,
  crimeType,
  crimeBase,
  modusMap = {},
}) => {
  const { filters, stats, temporal, clusters, mode } = analysis;

  const crimeStat =
    (stats?.per_crime || []).find((c) => c.crime === crimeType) || {};
  const temporalMap = Object.fromEntries(
    (temporal?.per_crime || []).map((t) => [t.crime, t]),
  );
  const crimeCluster = (clusters?.clusters || []).find(
    (c) => c.prevalent_crime === crimeType,
  );

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

  const modeInstruction =
    mode === "retrospective"
      ? "Frame as LESSONS LEARNED for the Preparatory Conference review. Use past tense."
      : "Frame as IMMEDIATE ACTION ITEMS for today's Preparatory Conference. Use present/future tense.";

  const guide = CRIME_REASONING[crimeType] || DEFAULT_REASONING;

  const forecastText =
    crimeStat.predicted_next_week !== null &&
    crimeStat.predicted_next_week !== undefined
      ? `${crimeStat.predicted_next_week} incidents (${crimeStat.confidence || "low"} confidence, Croston method)`
      : "Insufficient data for forecast";

  const clusterText = crimeCluster
    ? `Cluster detected in ${crimeCluster.prevalent_barangay} — ${crimeCluster.count} incidents, prevalent modus: ${crimeCluster.prevalent_modus}`
    : "No geographic cluster detected for this crime type";

  // ── Dynamic modus context — built from actual incident data only ──────────
  // This is the single source of truth for modus names the AI is allowed to use.
  // CRIME_REASONING guides are intentionally modus-agnostic so that only
  // these names — drawn from real data — appear in the AI output.
  const top3ModusNames = (crimeStat.top_3_modus || [])
    .map((m) => m.modus)
    .filter(Boolean);

  const modusContextBlock =
    top3ModusNames.length > 0
      ? `ACTUAL MODUS IN DATA (use ONLY these names in your response — never invent or assume others):
${top3ModusNames.map((m, i) => `  ${i + 1}. ${m}`).join("\n")}`
      : `ACTUAL MODUS IN DATA: None recorded for this period. Do not reference any modus name in your response.`;

  const patrolOpsContext = `
PATROL OPERATIONS FRAMEWORK (PNP Managing Patrol Operations Manual 2015):

This assessment output will be used at the Preparatory Conference (Section 2.8) — the daily
meeting where the COP, QUAD Staff, and Patrol Supervisors review Crime Pattern Analysis (CPA)
and Emerging Crime Problems (ECP) to guide patrol deployment.

The Four QUAD Functions (each section of the output maps to one):
  - Operations   : Adjust patrol deployment based on CPA. Uses the Five-Part Plan format.
  - Intelligence : Prepare info on criminal elements and modus operandi for the briefing.
  - Investigation: Present updated case status, warrant list, and persons of interest.
  - PCR          : Develop community engagement strategies; organize force multipliers and BINs.

Five-Part Plan Format (Section 3.5 of the Manual — for the Operations section):
  a. Situation            — Nature and extent of crime; modus; time/location/rate of incidence
  b. Mission              — What the patrol unit aims to accomplish
  c. Execution            — Concept of operations; patrol method;  beat/sector
  d. Tasks (MUST DOs)     — Specific duties with TIME WINDOW and LOCATION for each task
  e. Coordinating         — Force multipliers, TOC, adjacent units, inter-agency coordination
     Instructions

Patrol Methods (choose based on place type from data):
  - Foot patrol      : Heavily populated areas, markets, schools, terminals, residential blocks
  - Motorcycle patrol: Against mobile criminals; traffic-congested areas
  - Mobile/automobile: Wider coverage; rapid response; highway and checkpoint operations


MUST DOs (per Annex A of the Manual):
  - Must be time-stamped and location-specific
  - Example: "At 9:00 AM – 10:00 AM, conduct foot patrol and target hardening check at [place] in [barangay]"
  - Derived from CPA findings and crime clock data — never generic

Force Multipliers (Section 2.3):
  - Barangay Tanods, BPATs, HPG, CIDG, NBI, WCPD, DSWD, LTO, LGU

Barangay Information Network (BIN):
  - Community members recruited by patrollers to provide early warning on suspicious activity
  - Patrollers act as 'bee workers' — collectors of community intelligence fed back to the Preparatory Conference
  - BIN contacts are an actionable PCR deliverable with a specific recruit target (e.g., market vendors, transport drivers, purok leaders)

ECP and CPA:
  - CPA (Crime Pattern Analysis): the analytical basis — what the data shows
  - ECP (Emerging Crime Problem): declared when trend is increasing and CSE < 30%; triggers Station Patrol Plan adjustment
`;

  return `
You are a senior PNP crime analyst writing ONE section of a formal assessment for a station commander.
This output will be presented at today's Preparatory Conference (Section 2.8, PNP Managing Patrol
Operations Manual 2015) for the crime type: ${crimeType}
${modeInstruction}

CRIME PATTERN ANALYSIS (CPA) FOR ${crimeType}:
  Total incidents              : ${crimeStat.total ?? 0}
  Cleared                      : ${crimeStat.cleared ?? 0}
  Solved                       : ${crimeStat.solved ?? 0}
  Under investigation          : ${crimeStat.under_investigation ?? 0}
  CCE                          : ${crimeStat.cce_percent ?? 0}%
  CSE                          : ${crimeStat.cse_percent ?? 0}%
  Trend                        : ${(crimeStat.trend === "insufficient_data" ? "insufficient data" : crimeStat.trend) ?? "stable"}
  Forecast next week           : ${forecastText}
  Emerging Crime Problem (ECP) : ${crimeStat.is_ecp ? "YES — declare ECP; Station Patrol Plan must be adjusted" : "No"}
  Peak hours                   : ${hoursDisplay}
  Peak day                     : ${crimeStat.peak_day ?? temporal_data.peak_day ?? "Unknown"}
  prevalent place type          : ${crimeStat.top_place_type ?? "Unknown"}
  Top modus (with descriptions):
      ${buildModusBlock(crimeStat.top_3_modus, modusMap[crimeType] || [])}
  Geographic cluster           : ${clusterText}

${modusContextBlock}

${patrolOpsContext}

REASONING GUIDE FOR ${crimeType}
(Ground all recommendations in the CPA data above.
 Adapt to ACTUAL MODUS IN DATA — never reference modus not in that list.
 Use the Five-Part Plan format for the operations section.
 MUST DOs must each include a time window and a specific location.):

  Nature              : ${guide.nature}
  Operations guidance : ${guide.operations.trim()}
  Intelligence guide  : ${guide.intelligence.trim()}
  Investigations guide: ${guide.investigations.trim()}
  PCR guidance        : ${guide.pcr.trim()}

PRIOR DRAFT (improve this, do not copy verbatim):
  general_assessment : ${crimeBase.general_assessment || ""}
  operations         : ${crimeBase.operations || ""}
  intelligence       : ${crimeBase.intelligence || ""}
  investigations     : ${crimeBase.investigations || ""}
  pcr                : ${crimeBase.police_community_relations || ""}

Return VALID JSON ONLY. No markdown. No extra keys. One object only.
{
  "crime_type": "${crimeType}",
  "general_assessment": "2 to 3 sentences for the Preparatory Conference. Cover: incident count from CPA, trend with forecast and confidence level, peak time, prevalent modus by name from ACTUAL MODUS IN DATA only, ECP status if applicable.",
  "operations": "Use the Five-Part Plan format as flowing prose — do NOT use arrays, bullet points, or JSON inside this field. Structure: Situation: [crime pattern from CPA]. Mission: [one sentence goal]. Execution: [patrol method matched to place type, cluster barangay by name if detected, peak hours]. Tasks (MUST DOs): [write exactly 2 MUST DOs as plain sentences, each starting with a time in AM/PM format, e.g. 'At 8:00 AM – 9:00 AM, ...', tied to ACTUAL MODUS IN DATA]. Coordinating Instructions: [name relevant force multipliers].",
  "intelligence": "1 to 2 sentences for the Preparatory Conference intelligence brief. Reference at least one specific modus by name from ACTUAL MODUS IN DATA only. State what patrollers should collect as 'bee workers' from the community. Flag ECP if applicable. Never mention modus not in ACTUAL MODUS IN DATA.",
  "investigations": "1 to 2 sentences for the Preparatory Conference investigation brief. CRITICAL: If under_investigation count is 0, do NOT suggest follow-up on open cases — state that all cases have been cleared or solved. Only reference open cases if under_investigation > 0. Reference modus names from ACTUAL MODUS IN DATA only where applicable.",
  "police_community_relations": "1 to 2 sentences for the Preparatory Conference PCR brief. Name at least one specific community partner. State one actionable BIN task — who patrollers should recruit as BIN contacts and why. Tie to prevalent place type and modus from ACTUAL MODUS IN DATA. Any time references must use AM/PM format (e.g. '11:00 PM'), never 24-hour military time.",
}

Critical rules:
- ONLY use modus names from ACTUAL MODUS IN DATA. Never invent or assume modus names not in that list.
- ALL time references anywhere in your response must use AM/PM format (e.g. "8:00 AM – 9:00 AM", "11:00 PM") — never 24-hour military time. This applies to every field: general_assessment, operations, intelligence, investigations, and police_community_relations.
- MUST DO tasks must be written as plain prose sentences — never as a JSON array or bullet list.
- Reference cluster barangay by name if detected — never use coordinates.
- No markdown. No extra keys. No invented facts. No arrays inside field values.
- Spell out all abbreviations fully on first use.
`.trim();
};

// ─── LEGACY EXPORT (kept for backward compatibility) ──────────────────────────

const buildAssessmentPrompt = ({ analysis, baseAssessment }) => {
  return buildGeneralAssessmentPrompt({ analysis, baseAssessment });
};

module.exports = {
  buildAssessmentPrompt,
  buildGeneralAssessmentPrompt,
  buildPerCrimePrompt,
};