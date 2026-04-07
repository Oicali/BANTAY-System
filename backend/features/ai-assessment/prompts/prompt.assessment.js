// backend/features/ai-assessment/prompts/prompt.assessment.js

/**
 * assessment.prompt.js
 * Builds the Gemini/Ollama prompts from Python /analyze output.
 *
 * v3 changes:
 *  - Split into two focused prompts: general + per-crime
 *  - Per-crime prompt is called once per crime type (no context overflow)
 *  - ARIMA removed — uses Croston forecast fields
 *  - buildClusterBlock uses barangay names not coordinates
 *  - CRIME_REASONING guides kept — they feed the per-crime prompt
 */

"use strict";

// ─── CRIME-SPECIFIC REASONING GUIDES ─────────────────────────────────────────

const CRIME_REASONING = {
  THEFT: {
    nature: "property crime, often opportunistic, highest volume index crime",
    operations: `
      - Prioritize foot patrol near the dominant place type (residential = Akyat Bahay prevention, commercial = Salisi/Snatching).
      - Deploy during peak hours identified in temporal data — not generic "evening patrol".
      - If a DBSCAN cluster exists for this crime, reference the barangay name — never use coordinates.
      - Tasks (MUST DOs): derive tasks from actual top modus in data only. If modus is commercial (Salisi, Snatching), task patrollers to monitor market areas. If modus is residential (Akyat Bahay), task residential block checks. Use ONLY what the data shows.
      - Coordinating Instructions: engage Barangay Tanods for joint patrol, establish Block Information Network near cluster area.
    `,
    intelligence: `
      - Focus on modus-based pattern: Akyat Bahay = monitor repeat target residences; Salisi = identify known offenders near market/transport hubs; Snatching = track motorcycle descriptions.
      - Flag as ECP if trend is increasing AND CSE < 30%.
      - Task patrollers as information collectors from residents near hotspot area.
      - CRITICAL: Only mention modus names that appear in the top modus data. Never invent modus names.
    `,
    investigations: `
      - Prioritize open cases by modus severity — use actual modus names from data.
      - Cross-reference modus across cases for series crime patterns.
      - Pursue recovery of stolen property as a case-closing mechanism.
    `,
    pcr: `
      - Community awareness aligned to dominant modus and place type from data.
      - Market/transport hub awareness if Salisi/Snatching dominates.
      - Recruit Block Information Network volunteers near cluster area.
      - Engage barangay tanods for night patrol near peak-hour areas.
    `,
  },

  ROBBERY: {
    nature:
      "violent property crime, use or threat of force, higher victim impact than theft",
    operations: `
      - Robbery demands mobile patrol with standby capacity — foot patrol alone is insufficient.
      - Deploy near commercial corridors, ATMs, pawnshops, and transport terminals based on place type data.
      - Peak hours should drive shift assignment — specify shift (e.g., Shift 2 = 3PM–11PM) not just "evening".
      - If a cluster exists, reference the barangay name in the Situation.
      - Tasks (MUST DOs): bank/pawnshop exterior checks, ATM area visibility.
      - Coordinating Instructions: coordinate TOC for real-time comms, HPG if highway robbery modus present.
    `,
    intelligence: `
      - Robbery with firearm modus warrants immediate ECP declaration if increasing.
      - Develop informants near transport terminals and commercial areas where modus concentrates.
      - Prepare persons-of-interest list for pre-deployment briefing if there are repeat modus patterns.
      - CRITICAL: Only mention modus names from the top modus data.
    `,
    investigations: `
      - Robbery cases with firearm modus are high-priority — higher re-offense and escalation risk.
      - Victims and witnesses should be re-contacted promptly for leads.
      - Cross-reference with theft cases for escalation patterns.
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
      - Focus on place type: if residential, recommend Women and Children Protection Desk coordination and community safety programs rather than foot patrol.
      - If public place is the dominant place type, visibility at the specific location type (park, school vicinity) is appropriate.
      - Coordinate with Women and Children Protection Desk for all operational planning involving this offense.
    `,
    intelligence: `
      - Intelligence focus is on identifying repeat offenders and locations, not street-level modus.
      - Develop informants within the community network (barangay officials, community leaders) for early warning.
      - Flag as ECP if increasing — but note the sensitivity of this classification to the commander.
    `,
    investigations: `
      - All rape cases are high-priority regardless of CCE/CSE figures.
      - Women and Children Protection Desk should lead or co-lead all active investigations.
      - Under Investigation cases must be reviewed for victim support status and evidence collection completeness.
    `,
    pcr: `
      - Community awareness programs must be run through Women and Children Protection Desk, not general patrol.
      - Engage schools, barangay health centers, and women's organizations.
      - Focus messaging on reporting mechanisms and victim support.
      - Establish safe reporting channels through barangay-level Violence Against Women and Children desks.
    `,
  },

  MURDER: {
    nature:
      "capital offense — intentional killing; often connected to rido, drug trade, or personal dispute",
    operations: `
      - Murder is low-frequency but high-consequence — patrol recommendations focus on deterrence in identified hotspot areas.
      - If a DBSCAN cluster exists, reference the barangay name in the Situation — not coordinates.
      - Mobile patrol with investigation support posture, not just visibility.
      - Tasks: warrant service for persons of interest, coordination with investigation team.
      - Coordinating Instructions: National Bureau of Investigation or Criminal Investigation and Detection Group coordination if organized crime modus is suspected.
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
      - Build trust through consistent, visible presence in affected barangay.
      - Consider peace-building dialogues if rido or dispute origin is suspected.
      - Avoid public announcements that could compromise witness safety.
    `,
  },

  HOMICIDE: {
    nature:
      "unlawful killing without intent to kill — may arise from reckless acts, fights, or escalation",
    operations: `
      - Similar to murder in operational response but typically lower organized-crime risk.
      - Focus Execution on visibility at venues where altercations occurred (bars, basketball courts, public gathering spots if identified in place type data).
      - Recommend alcohol-related enforcement operations if night hours and recreation venue are dominant.
      - Coordinating Instructions: coordinate with Local Government Unit on ordinance enforcement (liquor bans, curfew) if nighttime altercation pattern is present.
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
      - Partner with Bureau of Jail Management and Penology or Department of Social Welfare and Development for at-risk individual referrals if youth or substance involvement is noted.
    `,
  },

  "PHYSICAL INJURY": {
    nature:
      "assault resulting in injury — frequently domestic, alcohol-related, or neighbor disputes; rarely stranger crime",
    operations: `
      - Physical injuries are poorly addressed by street patrol — most occur indoors or in semi-private spaces.
      - Peak day and hour data is critical: if weekend night hours dominate, recommend visibility near drinking establishments during those specific windows only.
      - Do NOT recommend generic 24/7 increased patrol — be specific to the peak window.
      - Tasks (MUST DOs): check-in with barangay tanods at start of shift, coordinate with barangay officials on known dispute households.
    `,
    intelligence: `
      - Focus on repeat-location and repeat-offender patterns.
      - Flag households or establishments with multiple incidents for barangay-level intervention.
    `,
    investigations: `
      - Physical injuries with open cases should be reviewed for Violence Against Women and Children angles.
      - Mediation through barangay may resolve some cases — note this as a case disposition option.
    `,
    pcr: `
      - Barangay-level conflict resolution programs are more effective than patrol for this crime type.
      - Coordinate with Department of Social Welfare and Development, Women and Children Protection Desk, and barangay Violence Against Women and Children desk for domestic-origin cases.
      - Engage purok leaders and barangay kagawads as community conflict early-warning network.
    `,
  },

  "SPECIAL COMPLEX CRIME": {
    nature:
      "composite offense combining elements of multiple index crimes (e.g., rape with homicide, kidnapping with murder)",
    operations: `
      - Rare but high-impact — any occurrence warrants elevated response posture.
      - Recommend regional-level coordination in Execution (Scene of the Crime Operations, Women and Children Protection Desk, National Bureau of Investigation as appropriate).
      - Secure crime scene area, mobile patrol with investigation support.
    `,
    intelligence: `
      - Treat any occurrence as a potential organized crime indicator — initiate full intelligence assessment.
      - Coordinate with Regional Intelligence and Investigation Division for regional threat context.
    `,
    investigations: `
      - Prioritize Scene of the Crime Operations involvement and full forensic documentation.
      - No special complex crime should be in Under Investigation status without weekly command review.
    `,
    pcr: `
      - Public communication must be coordinated with Public Information Officer — community anxiety is high for this offense type.
      - Reassure community through visible command presence, not just rank-and-file patrol.
    `,
  },

  "CARNAPPING - MC": {
    nature:
      "theft of motorcycles — often by organized groups, targets both parked and moving motorcycles",
    operations: `
      - Carnapping is route-specific — checkpoint operations and highway patrol are more effective than beat patrol.
      - If a cluster exists, reference the barangay name in Situation.
      - Tasks (MUST DOs): verify motorcycle registrations at checkpoints; monitor chop-shop indicators in adjacent industrial/residential areas.
      - Coordinating Instructions: Highway Patrol Group coordination required; coordinate with Land Transportation Office for hot unit flagging.
      - Recommend Oplan Katok in residential areas if parked-motorcycle modus dominates.
    `,
    intelligence: `
      - Carnapping groups operate across multiple jurisdictions — develop intelligence on receiver/chop-shop networks.
      - Coordinate with adjacent stations for stolen unit sightings.
      - Monitor online selling platforms for suspiciously priced motorcycles.
      - CRITICAL: Only mention modus names from the top modus data.
    `,
    investigations: `
      - Recovery of stolen units is a primary case-closing metric — coordinate with Land Transportation Office for plate tracing.
      - Build a stolen motorcycle database entry for each case for cross-station matching.
    `,
    pcr: `
      - Community awareness on motorcycle security: wheel locks, hidden trackers, secure parking.
      - Engage transport groups (habal-habal, delivery riders) as community information partners.
    `,
  },

  "CARNAPPING - MV": {
    nature:
      "theft of four-wheeled vehicles — often more sophisticated, may involve key cloning or relay attacks",
    operations: `
      - Four-wheel carnapping is typically more planned than motorcycle theft — modus identification is critical.
      - Mobile patrol with checkpoint authority on major roads; coordinate with Highway Patrol Group.
      - Tasks (MUST DOs): check parking areas of malls/markets; verify vehicle papers during checkpoints.
      - Coordinating Instructions: Highway Patrol Group, Land Transportation Office coordination; Criminal Investigation and Detection Group if carnapping syndicate is suspected.
    `,
    intelligence: `
      - Coordinate with Criminal Investigation and Detection Group and Highway Patrol Group intelligence units for syndicate-level threat assessment.
      - Monitor reports of suspicious vehicle activity (casing of parking areas) from community.
    `,
    investigations: `
      - Land Transportation Office coordination for vehicle tracing is mandatory in all open cases.
      - Check insurance fraud angle if multiple high-value units are involved.
    `,
    pcr: `
      - Awareness campaign for vehicle owners on anti-theft measures.
      - Coordinate with mall/establishment security on closed-circuit television coverage of parking facilities.
    `,
  },
};

const DEFAULT_REASONING = {
  nature: "index crime requiring standard QUAD response",
  operations: `
    - Recommend patrol deployment aligned to peak hours and dominant place type from temporal data.
    - If a DBSCAN cluster exists, reference the barangay name — never use coordinates.
    - Tasks derived from actual dominant modus in data only.
  `,
  intelligence: `
    - Monitor modus patterns and flag Emerging Crime Problem if trend is increasing and CSE is below 30%.
    - Task patrollers as information collectors from the community near incident hotspots.
    - CRITICAL: Only mention modus names from the top modus data.
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

function formatHourWindow(hour) {
  if (hour === null || hour === undefined) return "unknown hours";
  const start = hour % 12 || 12;
  const end = (hour + 1) % 12 || 12;
  const startSuffix = hour < 12 ? "AM" : "PM";
  const endSuffix = hour + 1 < 12 ? "AM" : "PM";
  return `${start}:00 ${startSuffix}–${end}:00 ${endSuffix}`;
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
      return `Cluster ${label}: ${c.count} incidents in ${c.dominant_barangay || "Unknown barangay"} — dominant crime: ${c.dominant_crime}, dominant modus: ${c.dominant_modus}`;
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
      ? "Frame as LESSONS LEARNED. Use past tense."
      : "Frame as IMMEDIATE ACTION ITEMS. Use present/future tense.";

  return `
You are a senior PNP crime analyst writing a formal strategic assessment for a station commander.

ASSESSMENT PERIOD: ${filters?.date_from || "unknown"} to ${filters?.date_to || "unknown"}
AREA: ${filters?.barangays?.join(", ") || "All barangays"}
MODE: ${mode || "current"}
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

GEOGRAPHIC HOTSPOTS (DBSCAN):
${clusterBlock}

PRIOR DRAFT (improve this, do not copy verbatim):
${baseAssessment?.general_assessment || ""}

Return VALID JSON ONLY. No markdown. No extra keys.
{
  "general_assessment": "3 to 5 sentences. Cover: total incidents, CCE/CSE performance, top crime by volume, peak period, and most significant hotspot barangay if detected. Use actual numbers. Be specific and formal."
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
    (c) => c.dominant_crime === crimeType,
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
      ? "Frame as LESSONS LEARNED. Use past tense."
      : "Frame as IMMEDIATE ACTION ITEMS. Use present/future tense.";

  const guide = CRIME_REASONING[crimeType] || DEFAULT_REASONING;

  const forecastText =
    crimeStat.predicted_next_week !== null &&
    crimeStat.predicted_next_week !== undefined
      ? `${crimeStat.predicted_next_week} incidents (${crimeStat.confidence || "low"} confidence, Croston method)`
      : "Insufficient data for forecast";

  const clusterText = crimeCluster
    ? `Cluster detected in ${crimeCluster.dominant_barangay} — ${crimeCluster.count} incidents, dominant modus: ${crimeCluster.dominant_modus}`
    : "No geographic cluster detected for this crime type";

  const patrolOpsContext = `
PATROL OPERATIONS FRAMEWORK (PNP Managing Patrol Operations Manual):
- Patrol deployment must follow the EMPO framework: Employment, Mission, Priority, and Operations.
- Foot patrol is preferred in high-density areas; mobile patrol for wider coverage.
- Checkpoint operations require designated sites approved by station commander.
- Shift assignments: Shift 1 = 6AM-2PM, Shift 2 = 2PM-10PM, Shift 3 = 10PM-6AM.
- All patrol tasks must include: specific location, time window, and assigned unit.
- Force multipliers: Barangay Tanods, CAFGU, BPSO, HPG, CIDG as appropriate.
- Hot pursuit and warrant service are patrol functions requiring pre-briefing.
- Intelligence-driven patrol: deploy based on crime clock data, not generic schedules.
`;

  return `
You are a senior PNP crime analyst writing ONE section of a formal assessment for a station commander.
Write ONLY for the crime type: ${crimeType}
${modeInstruction}

CRIME DATA FOR ${crimeType}:
  Total incidents     : ${crimeStat.total ?? 0}
  Cleared             : ${crimeStat.cleared ?? 0}
  Solved              : ${crimeStat.solved ?? 0}
  Under investigation : ${crimeStat.under_investigation ?? 0}
  CCE                 : ${crimeStat.cce_percent ?? 0}%
  CSE                 : ${crimeStat.cse_percent ?? 0}%
  Trend               : ${crimeStat.trend ?? "stable"}
  Forecast next week  : ${forecastText}
  Emerging Crime Problem flag : ${crimeStat.is_ecp ? "YES — flag explicitly" : "No"}
  Peak hours          : ${hoursDisplay}
  Peak day            : ${crimeStat.peak_day ?? temporal_data.peak_day ?? "Unknown"}
  Dominant place type : ${crimeStat.top_place_type ?? "Unknown"}
  Top modus           :
      ${buildModusBlock(crimeStat.top_3_modus, modusMap[crimeType] || [])}
  Geographic cluster  : ${clusterText}

${patrolOpsContext}
REASONING GUIDE FOR ${crimeType}:

REASONING GUIDE FOR ${crimeType}:
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
  "general_assessment": "2 to 3 sentences — incident count, trend with confidence level, peak time and day, dominant modus by name, Emerging Crime Problem status if applicable.",
  "operations": "2 to 3 sentences. Situation: summarize the crime pattern. Mission: one sentence goal. Execution: specify patrol method, barangay from cluster if detected, peak hours from data. Tasks: 2 specific tasks tied to the actual dominant modus — not generic. Coordinating Instructions: name relevant force multipliers.",
  "intelligence": "1 to 2 sentences. Reference at least one specific modus by name from the top modus data. Flag Emerging Crime Problem if applicable. Do not mention modus names not in the data.",
  "investigations": "1 to 2 sentences. Reference actual open case count. Mention specific modus priority. No generic advice.",
  "police_community_relations": "1 to 2 sentences. Name at least one specific community partner type relevant to this crime (Block Information Network volunteers, Women and Children Protection Desk, barangay tanods, transport groups, etc.). Tie to dominant place type and modus."
}

Critical rules:
- ONLY use modus names that appear in the Top modus data above. Never invent modus names not in the data.
- Reference the cluster barangay by name if one was detected — never use coordinates.
- No markdown. No extra keys. No invented facts.
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
