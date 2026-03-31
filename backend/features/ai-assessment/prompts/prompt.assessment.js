// backend/features/ai-assessment/prompts/prompt.assessment.js

/**
 * assessment.prompt.js
 * Builds the Gemini/Ollama prompt from Python /analyze output.
 *
 * Key improvements over v1:
 *  - Crime-specific reasoning per offense type (not generic QUAD boilerplate)
 *  - Modus descriptions injected when available from crime_modus_reference
 *  - Operations section follows PNP 5-part patrol plan format
 *  - Zero-crime offenses still get a "continued vigilance" note
 *  - Forecast confidence level (low/moderate/high) included
 *  - ECP flag logic is explicit in the prompt instructions
 */

"use strict";

// ─── CRIME-SPECIFIC REASONING GUIDES ─────────────────────────────────────────
// Each entry tells the LLM HOW to reason about that specific crime type.
// This is what prevents generic, copy-paste QUAD output.

const CRIME_REASONING = {
  THEFT: {
    nature: "property crime, often opportunistic, highest volume index crime",
    operations: `
      - Prioritize foot patrol near the dominant place type (residential = Akyat Bahay prevention, commercial = Salisi/Snatching).
      - Deploy during peak hours identified in temporal data — not generic "evening patrol".
      - Reference the specific barangays with DBSCAN clusters if present.
      - Use PNP patrol format: state Situation (cluster location + peak hours), Mission (reduce theft opportunity), Execution (patrol method, beat assignment, shift timing, standby points), Tasks (MUST DOs: bank/pawnshop inspection if commercial modus; residential block checks if Akyat Bahay), Coordinating Instructions (engage Barangay Tanods for joint patrol, establish BIN near cluster centroid).
    `,
    intelligence: `
      - Focus on modus-based pattern: Akyat Bahay = monitor repeat target residences; Salisi = identify known offenders near market/transport hubs; Snatching = track motorcycle descriptions.
      - Flag as ECP if trend is increasing AND CSE < 30%.
      - Task patrollers as "bee workers" to collect info from residents near hotspot centroid.
    `,
    investigations: `
      - Prioritize open cases with Akyat Bahay or Hold-up modus (higher re-offense risk).
      - Cross-reference modus across cases for series crime patterns.
      - Pursue recovery of stolen property as a case-closing mechanism.
    `,
    pcr: `
      - Community awareness on home security (door locks, lighting) if residential modus dominates.
      - Market/transport hub awareness if Salisi/Snatching dominates.
      - Recruit Block Information Network (BIN) volunteers near cluster centroid.
      - Engage barangay tanods for night patrol near peak-hour areas.
    `,
  },

  ROBBERY: {
    nature: "violent property crime, use or threat of force, higher victim impact than theft",
    operations: `
      - Robbery demands mobile patrol with standby capacity — foot patrol alone is insufficient.
      - Deploy near commercial corridors, ATMs, pawnshops, and transport terminals based on place type data.
      - Peak hours should drive shift assignment — specify shift (e.g., Shift 2 = 3PM–11PM) not just "evening".
      - Use PNP patrol format: Situation (armed modus + place type), Mission (deter and intercept), Execution (mobile patrol with quick-response standby, beat coverage of high-value targets), Tasks (MUST DOs: bank/pawnshop exterior checks, ATM area visibility), Coordinating Instructions (coordinate TOC for real-time comms, HPG if highway robbery modus present).
      - If Hold-up w/ gun modus: recommend directed operations planning.
    `,
    intelligence: `
      - Robbery with firearm modus warrants immediate ECP declaration if increasing.
      - Develop informants near transport terminals and commercial areas where modus concentrates.
      - Prepare persons-of-interest list for pre-deployment briefing if there are repeat modus patterns.
    `,
    investigations: `
      - Robbery cases with firearm modus are high-priority — higher re-offense and escalation risk.
      - Victims and witnesses should be re-contacted promptly for leads.
      - Cross-reference with theft cases for escalation patterns (thief → robber).
    `,
    pcr: `
      - Brief business establishments in high-incident areas on robbery deterrence (CCTV, security guards, signage).
      - Encourage pawnshops and money changers to coordinate with station on suspicious transactions.
      - Engage barangay emergency response volunteers near commercial clusters.
    `,
  },

  RAPE: {
    nature:
      "sexual violence crime — requires sensitive, victim-centered response; often involves known offender",
    operations: `
      - Patrol recommendations must be careful: most rape cases involve known offenders in private settings — street patrol has limited deterrent value.
      - Focus on place type: if residential, recommend WCPD coordination and community safety programs rather than foot patrol.
      - If public place is the dominant place type, then visibility at the specific location type (park, school vicinity) is appropriate.
      - Use PNP patrol format: frame Execution around safe-haven visibility and WCPD-coordinated response rather than crime interception.
      - Coordinate with WCPD (Women and Children Protection Desk) for all operational planning involving this offense.
    `,
    intelligence: `
      - Intelligence focus is on identifying repeat offenders and locations, not street-level modus.
      - Develop informants within the community network (barangay officials, community leaders) for early warning.
      - Flag as ECP if increasing — but note the sensitivity of this classification to the commander.
    `,
    investigations: `
      - All rape cases are high-priority regardless of CCE/CSE figures.
      - WCPD should lead or co-lead all active investigations.
      - Under Investigation cases must be reviewed for victim support status and evidence collection completeness.
      - Avoid cross-referencing victims across cases in a way that could compromise privacy.
    `,
    pcr: `
      - Community awareness programs must be run through WCPD, not general patrol.
      - Engage schools, barangay health centers, and women's organizations — not generic tanod briefings.
      - Focus messaging on reporting mechanisms and victim support, not victim-blaming prevention language.
      - Establish safe reporting channels through barangay-level VAWC desks.
    `,
  },

  MURDER: {
    nature:
      "capital offense — intentional killing; often connected to rido, drug trade, or personal dispute",
    operations: `
      - Murder is low-frequency but high-consequence — patrol recommendations focus on deterrence in identified hotspot areas, not volume response.
      - If DBSCAN clusters are present, recommend directed operations in that geographic cluster.
      - Use PNP patrol format: Situation (murder cluster location, dominant modus if identifiable), Mission (deter further incidents, support investigation), Execution (mobile patrol with investigation support posture, not just visibility), Tasks (warrant service for persons of interest, coordination with investigation team), Coordinating Instructions (NBI/PNP-CIDG coordination if organized crime modus is suspected).
      - Recommend heightened alert posture for adjacent barangays if cluster is near barangay boundaries.
    `,
    intelligence: `
      - Murder warrants immediate intelligence effort regardless of trend direction.
      - Identify if cases share a modus or geographic cluster — series pattern indicates organized threat.
      - Task intelligence personnel to map relationships between victims if multiple cases.
      - Consider rido mapping or drug trade presence as intelligence context.
    `,
    investigations: `
      - All murder cases are priority-one investigations — no case should remain Under Investigation without active follow-up.
      - Warrant service for identified persons of interest should be briefed at every pre-deployment.
      - CSE for murder below 30% is a significant performance concern — flag explicitly to commander.
      - Coordinate with Regional Homicide Unit if case complexity warrants.
    `,
    pcr: `
      - Engage barangay officials and community leaders for information — murder cases often have community witnesses who are reluctant to come forward.
      - Build trust through consistent, visible presence (not reactive surge) in affected barangay.
      - Consider peace-building dialogues if rido or dispute origin is suspected.
      - Avoid public announcements that could compromise witness safety.
    `,
  },

  HOMICIDE: {
    nature:
      "unlawful killing without intent to kill — may arise from reckless acts, fights, or escalation",
    operations: `
      - Similar to murder in operational response but typically lower organized-crime risk.
      - Use PNP patrol format: focus Execution on visibility at venues where altercations occurred (bars, basketball courts, public gathering spots if identified in place type data).
      - Recommend alcohol-related enforcement operations if night hours and recreation venue are dominant.
      - Coordinating Instructions: coordinate with LGU on ordinance enforcement (liquor bans, curfew) if nighttime altercation pattern is present.
    `,
    intelligence: `
      - Map recurring dispute locations and known antagonist groups.
      - Develop community informants near incident-dense barangays.
    `,
    investigations: `
      - Homicide cases with Under Investigation status require witness follow-up as a priority.
      - Modus analysis (bladed weapon vs. firearm vs. blunt object) informs arrest and evidence strategy.
    `,
    pcr: `
      - Dialogue-based intervention in barangays with multiple homicide incidents.
      - Engage barangay peace and order councils on early conflict resolution.
      - Partner with BJMP/DSWD for at-risk individual referrals if youth or substance involvement is noted.
    `,
  },

  "PHYSICAL INJURY": {
    nature:
      "assault resulting in injury — frequently domestic, alcohol-related, or neighbor disputes; rarely stranger crime",
    operations: `
      - Physical injuries are poorly addressed by street patrol — most occur indoors or in semi-private spaces.
      - Peak day and hour data is critical: if weekend night hours dominate, recommend visibility near drinking establishments and public gathering areas during those specific windows only.
      - Use PNP patrol format: Situation (peak hours, place type), Mission (deter altercations, provide immediate first-responder presence), Execution (foot patrol near entertainment establishments during peak hours; mobile patrol for rapid response), Tasks (MUST DOs: check-in with barangay tanods at start of shift, coordinate with barangay officials on known dispute households).
      - Do NOT recommend generic 24/7 increased patrol — be specific to the peak window.
    `,
    intelligence: `
      - Intelligence value is limited for stranger-crime; focus on repeat-location and repeat-offender patterns.
      - Flag households or establishments with multiple incidents for barangay-level intervention.
    `,
    investigations: `
      - Physical injuries with open cases should be reviewed for VAWC (violence against women and children) angles.
      - Mediation through barangay may resolve some cases — note this as a case disposition option.
    `,
    pcr: `
      - Barangay-level conflict resolution programs are more effective than patrol for this crime type.
      - Coordinate with DSWD, WCPD, and barangay VAWC desk for domestic-origin cases.
      - Engage purok leaders and barangay kagawads as community conflict early-warning network.
    `,
  },

  "SPECIAL COMPLEX CRIME": {
    nature:
      "composite offense combining elements of multiple index crimes (e.g., rape with homicide, kidnapping with murder)",
    operations: `
      - Rare but high-impact — any occurrence warrants elevated response posture.
      - Recommend regional-level coordination in Execution (e.g., CIDG, SOCO) in addition to local patrol.
      - Use PNP patrol format: Situation (incident details without victim-identifying info), Mission (prevent recurrence, support full investigation), Execution (secure crime scene area, mobile patrol with investigation support), Coordinating Instructions (SOCO, WCPD, NBI as appropriate).
    `,
    intelligence: `
      - Treat any occurrence as a potential organized crime indicator — initiate full intelligence assessment.
      - Coordinate with RID/RIID for regional threat context.
    `,
    investigations: `
      - Prioritize SOCO involvement and full forensic documentation.
      - Command attention required — no special complex crime should be in Under Investigation status without weekly command review.
    `,
    pcr: `
      - Public communication must be coordinated with PIO — community anxiety is high for this offense type.
      - Reassure community through visible command presence, not just rank-and-file patrol.
    `,
  },

  "CARNAPPING - MC": {
    nature:
      "theft of motorcycles — often by organized groups, targets both parked and moving motorcycles",
    operations: `
      - Carnapping is route-specific — checkpoint operations and highway patrol are more effective than beat patrol.
      - Use PNP patrol format: Situation (dominant modus — force vs. opportunistic; peak hours; barangay cluster), Mission (intercept and deter motorcycle theft), Execution (checkpoint operations on major exit routes from cluster area; coordinate with HPG for highway coverage), Tasks (MUST DOs: verify motorcycle registrations at checkpoints; monitor chop-shop indicators in adjacent industrial/residential areas), Coordinating Instructions (HPG coordination required; coordinate with LTO for hot unit flagging).
      - Recommend Oplan Katok in residential areas if parked-motorcycle modus dominates.
    `,
    intelligence: `
      - Carnapping groups operate across multiple jurisdictions — develop intelligence on receiver/chop-shop networks.
      - Coordinate with adjacent stations for stolen unit sightings.
      - Monitor online selling platforms for suspiciously priced motorcycles matching stolen unit profiles.
    `,
    investigations: `
      - Recovery of stolen units is a primary case-closing metric — coordinate with LTO for plate tracing.
      - Build a stolen motorcycle database entry for each case for cross-station matching.
    `,
    pcr: `
      - Community awareness on motorcycle security: wheel locks, hidden GPS trackers, secure parking.
      - Encourage motorcycle owners to register with the station's community profiling database.
      - Engage transport groups (habal-habal, delivery riders) as community information partners.
    `,
  },

  "CARNAPPING - MV": {
    nature:
      "theft of four-wheeled vehicles — often more sophisticated, may involve key cloning or relay attacks",
    operations: `
      - Four-wheel carnapping is typically more planned than motorcycle theft — modus identification is critical.
      - Use PNP patrol format: Situation (modus — force vs. stealthy; target vehicle types; location pattern), Mission (deter vehicle theft, increase recovery rate), Execution (mobile patrol with checkpoint authority on major roads; coordinate with HPG), Tasks (MUST DOs: check parking areas of malls/markets; verify vehicle papers during checkpoints), Coordinating Instructions (HPG, LTO coordination; CIDG if carnapping syndicate is suspected).
    `,
    intelligence: `
      - Coordinate with CIDG and HPG intelligence units for syndicate-level threat assessment.
      - Monitor reports of suspicious vehicle activity (casing of parking areas) from community.
    `,
    investigations: `
      - LTO coordination for vehicle tracing is mandatory in all open cases.
      - Check insurance fraud angle if multiple high-value units are involved.
    `,
    pcr: `
      - Awareness campaign for vehicle owners on anti-theft measures (GPS trackers, steering locks).
      - Coordinate with mall/establishment security on CCTV coverage of parking facilities.
    `,
  },
};

// Fallback for any crime type not explicitly listed above
const DEFAULT_REASONING = {
  nature: "index crime requiring standard QUAD response",
  operations: `
    - Recommend patrol deployment aligned to peak hours and dominant place type from temporal data.
    - Use PNP patrol format: Situation, Mission, Execution (method + beat + timing), Tasks (MUST DOs), Coordinating Instructions (force multipliers).
  `,
  intelligence: `
    - Monitor modus patterns and flag ECP if trend is increasing and CSE is below 30%.
    - Task patrollers as information collectors from the community near incident hotspots.
  `,
  investigations: `
    - Prioritize open cases by modus severity.
    - Cross-reference modus across cases for series crime indicators.
  `,
  pcr: `
    - Community awareness aligned to dominant modus and place type.
    - Engage barangay tanods for joint patrol and information development.
  `,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Formats a 24h integer hour to a readable time window.
 * e.g. 21 → "9:00 PM – 10:00 PM"
 */
function formatHourWindow(hour) {
  if (hour === null || hour === undefined) return "unknown hours";
  const start = hour % 12 || 12;
  const end = (hour + 1) % 12 || 12;
  const startSuffix = hour < 12 ? "AM" : "PM";
  const endSuffix = (hour + 1) < 12 ? "AM" : "PM";
  return `${start}:00 ${startSuffix}–${end}:00 ${endSuffix}`;
}

/**
 * Builds a human-readable modus block for a crime's top modus entries.
 * Includes description if available, gracefully skips if null.
 */
function buildModusBlock(top3Modus) {
  if (!top3Modus || top3Modus.length === 0) return "No modus data available.";

  return top3Modus
    .map((m) => {
      const base = `${m.modus} (${m.percentage}%)`;
      if (m.description) {
        return `${base}: ${m.description}`;
      }
      return base;
    })
    .join("\n      ");
}

/**
 * Derives a confidence statement from the linreg confidence_level field.
 */
function formatConfidence(confidenceLevel, weeksOfData) {
  const weekNote =
    weeksOfData && weeksOfData < 10
      ? ` (based on only ${weeksOfData} weeks of data — treat with caution)`
      : weeksOfData
        ? ` (based on ${weeksOfData} weeks of data)`
        : "";

  switch (confidenceLevel) {
    case "high":
      return `high confidence${weekNote}`;
    case "moderate":
      return `moderate confidence${weekNote}`;
    case "low":
    default:
      return `low confidence — trend is weak or data is insufficient${weekNote}`;
  }
}

/**
 * Builds the per-crime data block fed into the prompt for each offense.
 * This is structured text, not raw JSON — easier for the LLM to reason over.
 */
function buildPerCrimeDataBlock(crimeStat, linregMap, temporalMap) {
  const crime = crimeStat.crime;
  const lr = linregMap[crime] || {};
  const temporal = temporalMap[crime] || {};

  const peakHour =
    crimeStat.peak_hour ?? temporal.peak_hour ?? null;
  const top3Hours =
    crimeStat.top_3_hours?.length
      ? crimeStat.top_3_hours
      : temporal.top_3_hours || [];

  const hoursDisplay =
    top3Hours.length > 0
      ? top3Hours.map(formatHourWindow).join(", ")
      : peakHour !== null
        ? formatHourWindow(peakHour)
        : "unknown";

  const confidenceStr = formatConfidence(
    lr.confidence_level || "low",
    lr.weeks_of_data
  );

  const isEcp =
    crimeStat.is_ecp ||
    (crimeStat.trend === "increasing" && crimeStat.cse_percent < 30);

  return `
CRIME: ${crime}
  Total incidents : ${crimeStat.total}
  Status          : ${crimeStat.cleared} cleared | ${crimeStat.solved} solved | ${crimeStat.under_investigation} under investigation
  CCE             : ${crimeStat.cce_percent}%
  CSE             : ${crimeStat.cse_percent}%
  Trend           : ${crimeStat.trend ?? lr.trend ?? "stable"}
  Forecast (next week): ${lr.predicted_next_week ?? "N/A"} incidents
  Forecast confidence : ${confidenceStr}
  ECP flag        : ${isEcp ? "YES — Emerging Crime Problem" : "No"}
  Peak hours      : ${hoursDisplay}
  Peak day        : ${crimeStat.peak_day ?? temporal.peak_day ?? "Unknown"}
  Dominant place  : ${crimeStat.top_place_type ?? "Unknown"}
  Top modus:
      ${buildModusBlock(crimeStat.top_3_modus)}
`.trim();
}

/**
 * Builds the reasoning guide block for the LLM for a specific crime type.
 */
function buildCrimeReasoningBlock(crime) {
  const guide = CRIME_REASONING[crime] || DEFAULT_REASONING;
  return `
REASONING GUIDE FOR ${crime}:
  Nature: ${guide.nature}
  Operations guidance: ${guide.operations.trim()}
  Intelligence guidance: ${guide.intelligence.trim()}
  Investigations guidance: ${guide.investigations.trim()}
  PCR guidance: ${guide.pcr.trim()}
`.trim();
}

/**
 * Builds the cluster summary block if DBSCAN found geographic hotspots.
 */
function buildClusterBlock(clusters) {
  if (!clusters || clusters.length === 0)
    return "No significant geographic clusters detected.";

  return clusters
    .map(
      (c) =>
        `Cluster ${c.cluster_id}: ${c.count} incidents near (${c.centroid_lat}, ${c.centroid_lng}) — dominant crime: ${c.dominant_crime}, dominant modus: ${c.dominant_modus}, crime types: ${c.crime_types?.join(", ") || "mixed"}`
    )
    .join("\n");
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * Builds the full LLM prompt from Python /analyze output.
 *
 * @param {object} params
 * @param {object} params.analysis - Full response from Python /analyze endpoint
 * @param {string} [params.baseAssessment] - Optional prior draft to refine
 * @returns {string} Prompt string ready to send to Gemini or Ollama
 */
const buildAssessmentPrompt = ({ analysis, baseAssessment }) => {
  const { filters, stats, temporal, clusters, linreg, arima, mode } = analysis;

  // Build lookup maps for quick access
  const linregMap = Object.fromEntries(
    (linreg?.per_crime || []).map((lr) => [lr.crime, lr])
  );
  const temporalMap = Object.fromEntries(
    (temporal?.per_crime || []).map((t) => [t.crime, t])
  );

  const overall = stats?.overall || {};
  const perCrime = stats?.per_crime || [];

  const modeInstruction =
    mode === "retrospective"
      ? "Frame all recommendations as LESSONS LEARNED and POST-INCIDENT analysis. Use past tense for observations. Frame recommendations as adjustments for the next patrol cycle."
      : "Frame all recommendations as IMMEDIATE ACTION ITEMS. Use present/future tense. Patrol commanders should be able to act on this assessment in the next deployment briefing.";

  // ARIMA summary
  const arimaBlock = arima
    ? `Overall crime forecast: ${arima.predicted_total_next_week ?? "N/A"} total incidents next week (method: ${arima.method}, historical weekly mean: ${arima.historical_weekly_mean ?? "N/A"}, vs average: ${arima.vs_average})`
    : "Overall forecast not available.";

  // Geographic clusters
  const clusterBlock = buildClusterBlock(clusters?.clusters || []);

  // Per-crime data and reasoning blocks
  const perCrimeBlocks = perCrime
    .map((cs) =>
      [
        buildPerCrimeDataBlock(cs, linregMap, temporalMap),
        buildCrimeReasoningBlock(cs.crime),
      ].join("\n\n")
    )
    .join("\n\n---\n\n");

  // All crime types present (for JSON output instruction)
  const presentCrimeTypes = perCrime.map((cs) => cs.crime);

  // Determine what crime types have zero incidents (filtered but no records)
  // These still need output — just "continued vigilance" framing
  const zeroCrimeTypes = (filters?.crime_types || [])
    .map((c) => c.toUpperCase().trim())
    .filter((c) => !presentCrimeTypes.includes(c));

  const zeroCrimeInstruction =
    zeroCrimeTypes.length > 0
      ? `
The following crime types were included in the filter but have ZERO recorded incidents in this period:
${zeroCrimeTypes.join(", ")}
For each of these, still generate a per_crime entry. Use this framing:
  - general_assessment: Note that no incidents were recorded but that continued vigilance is advised.
  - operations: Recommend maintaining standard patrol posture and monitoring.
  - intelligence: Recommend continued community information gathering as a preventive measure.
  - investigations: State "No open cases for this period."
  - police_community_relations: Recommend sustained community awareness as prevention.
Do NOT say "no data available" and skip the entry. Every crime type must have an output.
`
      : "";

  // Build base assessment context if provided
  const baseDraftBlock = baseAssessment
    ? `
PRIOR DRAFT TO IMPROVE (refine this, do not copy it verbatim):
${baseAssessment}
`
    : "";

  return `
You are a senior PNP crime analyst writing a formal strategic assessment for a station commander.
You follow the QUAD policing model: Operations, Intelligence, Investigations, and Police-Community Relations (PCR).
You are familiar with the PNP Managing Patrol Operations Manual (2015 Edition).

ASSESSMENT PERIOD: ${filters?.date_from || "unknown"} to ${filters?.date_to || "unknown"}
AREA: ${filters?.barangays?.join(", ") || "All barangays"}
MODE: ${mode || "current"}
${modeInstruction}

─── OVERALL SITUATION ───────────────────────────────────────────────
Total incidents in period : ${overall.total ?? 0}
Cleared                   : ${overall.cleared ?? 0}
Solved                    : ${overall.solved ?? 0}
Under investigation        : ${overall.under_investigation ?? 0}
Overall CCE               : ${overall.cce_percent ?? 0}%
Overall CSE               : ${overall.cse_percent ?? 0}%
Peak hour (all crimes)    : ${overall.peak_hour !== null && overall.peak_hour !== undefined ? formatHourWindow(overall.peak_hour) : "Unknown"}
Peak day (all crimes)     : ${overall.peak_day ?? "Unknown"}
Peak month                : ${overall.peak_month ?? "Unknown"}
${arimaBlock}

─── GEOGRAPHIC HOTSPOTS (DBSCAN) ────────────────────────────────────
${clusterBlock}

─── PER-CRIME DATA AND REASONING GUIDES ─────────────────────────────
For each crime type below, use BOTH the data AND the reasoning guide to write specific, non-generic recommendations.
The reasoning guide tells you HOW to think about this specific crime — follow it closely.

${perCrimeBlocks}

${zeroCrimeInstruction}

${baseDraftBlock}

─── OUTPUT INSTRUCTIONS ─────────────────────────────────────────────
Return VALID JSON ONLY. No markdown. No explanation before or after. No extra keys.

The JSON must follow this exact shape:

{
  "title": "AI Crime Assessment — [date range]",
  "general_assessment": "3 to 5 sentences. Cover: overall crime volume, CCE/CSE performance, the top crime by volume, the overall forecast direction, and the most significant geographic hotspot if one exists. Be specific — use actual numbers and barangay names.",
  "per_crime": [
    {
      "crime_type": "THEFT",
      "general_assessment": "2 to 3 sentences — specific to this offense. Include: incident count, trend with confidence level, peak hour and day, dominant modus, and whether it is flagged as ECP.",
      "operations": "2 to 4 sentences — MUST follow the 5-part patrol plan format: (1) Situation: summarize the crime pattern driving the deployment decision. (2) Mission: one sentence on what the patrol aims to accomplish. (3) Execution: specify patrol method (foot/mobile), which barangay or cluster area, which shift hours tied to the peak hours in the data. (4) Tasks (MUST DOs): list 2–3 specific tasks patrollers must do — tied to the dominant modus and place type, not generic. (5) Coordinating Instructions: name the specific force multipliers to engage (Barangay Tanods, BPATs, HPG, WCPD, etc.) based on the crime type.",
      "intelligence": "2 to 3 sentences — based on the reasoning guide for this crime type. Reference specific modus names from the data. Flag ECP explicitly if applicable.",
      "investigations": "1 to 2 sentences — reference actual open case count and specific modus priority. Do not give generic advice.",
      "police_community_relations": "2 to 3 sentences — engagement strategy tied to the dominant place type and modus. Name specific community partners (BINs, WCPD, barangay councils, transport groups, etc.) relevant to this crime type."
    }
  ]
}

Crime types to include in per_crime (one entry each, in this order):
${[...presentCrimeTypes, ...zeroCrimeTypes].join(", ")}

Critical rules:
- Every per_crime entry must reference actual numbers from the data for that specific crime — not the overall totals.
- Operations must follow the 5-part format described above — it must not be a generic "increase patrol visibility" sentence.
- Intelligence must mention at least one specific modus by name.
- PCR must name at least one specific community partner type relevant to that crime.
- If modus has a description provided, use that description to inform the recommendation — do not ignore it.
- If trend confidence is "low", qualify the forecast explicitly: "with low confidence given limited data."
- Tone: formal, concise, and actionable. A patrol commander should be able to read the operations section and issue a deployment order from it.
- No markdown. No extra keys. No invented facts.
`.trim();
};

module.exports = {
  buildAssessmentPrompt,
};