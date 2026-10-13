export const WORKSPACES = {
  adult: {
    id: "adult",
    label: "Adult Ops",
    caseTypes: ["Adult"],
    highRiskThreshold: 75,
    mediumRiskThreshold: 55,
    ageThresholdDays: 2
  },
  specialty: {
    id: "specialty",
    label: "Ped / Newborn / NICU Ops",
    caseTypes: ["Peds", "Newborn", "NICU"],
    highRiskThreshold: 75,
    mediumRiskThreshold: 55,
    ageThresholdDays: 2
  }
};

const NLC_TOKEN = "NLC";
// Synthetic demo coverage fixture, not a current licensing authority.
const NLC_ACTIVE_JURISDICTIONS = [
  "AL", "AR", "AZ", "CO", "CT", "DE", "FL", "GA", "GU", "IA", "ID", "IN", "KS", "KY", "LA", "MD", "ME", "MO",
  "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "OH", "OK", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA",
  "VT", "WA", "WI", "WV", "WY"
];

const ADULT_TEAM_BLUEPRINTS = [
  {
    team: "Atlas Adult",
    manager: "Monica Alvarez",
    clients: ["Acme Manufacturing", "Northstar Logistics"],
    states: ["TX", "AZ", "NM", "NV"],
    nurseNames: ["Naomi Price", "Rita Gomez", "Alyssa Bell", "Derek Shah", "Kelly Hunt"]
  },
  {
    team: "Beacon Adult",
    manager: "Jordan Brooks",
    clients: ["Brightline Retail", "Cobalt Engineering", "Pioneer Schools"],
    states: ["IL", "IN", "OH", "MI"],
    nurseNames: ["Tina Green", "Marcus Lee", "Vanessa Ford", "Paula Kim", "Jonah Patel"]
  },
  {
    team: "Cedar Adult",
    manager: "Priya Chen",
    clients: ["Redwood Foods", "Summit Utilities"],
    states: ["CA", "NV", "AZ", "CO"],
    nurseNames: ["Erin Flores", "Leslie Ruiz", "Mia Barnes", "Sharon Powell", "Nathan Cole"]
  },
  {
    team: "Delta Adult",
    manager: "Elise Davis",
    clients: ["Lakeside Distribution", "Vertex Hospitality"],
    states: ["FL", "GA", "NC", "SC"],
    nurseNames: ["Olivia Ross", "Trevor Scott", "Danielle Cruz", "Brianna Hall"]
  }
];

const SPECIALTY_PROGRAM = {
  team: "Harbor Pediatric",
  manager: "Sofia Patel",
  clients: ["Blue River Manufacturing", "Horizon Public Schools", "Evergreen Transit", "Union Fabrication"],
  states: ["TX", "FL", "GA", "NC", "SC", "OH", "PA", "VA", "TN"],
  pedsOnlyNames: ["Maya Lewis", "Carmen Diaz", "Ava Turner", "Lena Brooks"],
  fullScopeNames: ["Nina Howard", "Rachel Kim", "Julia Foster", "Brielle Young", "Sara Malik"]
};

const GLOBAL_STATES = ["TX", "AZ", "NM", "NV", "IL", "IN", "OH", "MI", "CA", "CO", "FL", "GA", "NC", "SC", "TN", "WA", "PA", "VA"];
const UNSUPPORTED_CLIENTS = ["Evergreen Aerospace", "Metro Transit Works"];
const CLINICAL_REASONS = [
  "Recent ED utilization",
  "Medication access barrier",
  "Behavioral health follow-up",
  "Polypharmacy concern",
  "Dialysis coordination",
  "Missed PCP follow-up",
  "Complex discharge planning",
  "Post-op wound follow-up",
  "Home health coordination",
  "Social work escalation",
  "Feeding support follow-up",
  "Respiratory monitoring"
];

const PEDIATRIC_CASE_TYPE_ORDER = {
  Peds: 2,
  Newborn: 1,
  NICU: 1,
  Adult: 0
};

export function getWorkspaceDemoData(workspaceId, referenceDate = new Date().toISOString()) {
  requireWorkspace(workspaceId);
  const random = mulberry32(workspaceId === WORKSPACES.adult.id ? 81234 : 90214);
  const at = validTimestamp(referenceDate);
  return workspaceId === WORKSPACES.adult.id
    ? { cases: generateAdultCases(random, at), nurses: generateAdultNurses(random) }
    : { cases: generateSpecialtyCases(random, at), nurses: generateSpecialtyNurses(random) };
}

function generateAdultNurses(random) {
  const nurses = [];

  ADULT_TEAM_BLUEPRINTS.forEach((blueprint, teamIndex) => {
    blueprint.nurseNames.forEach((name, nurseIndex) => {
      const licensedStates = chooseUnique(
        blueprint.states,
        2 + Math.floor(random() * Math.min(2, blueprint.states.length - 1)),
        random
      );

      if (random() < 0.35 && !licensedStates.includes(NLC_TOKEN)) {
        licensedStates.unshift(NLC_TOKEN);
      }

      nurses.push({
        nurseId: `AD-${teamIndex + 1}-${nurseIndex + 1}`,
        nurseName: name,
        workspace: WORKSPACES.adult.id,
        team: blueprint.team,
        manager: blueprint.manager,
        coveredClients: chooseUnique(blueprint.clients, 1 + Math.floor(random() * blueprint.clients.length), random),
        licensedStates,
        capabilities: ["Adult"],
        dailyCapacity: 5 + Math.floor(random() * 4),
        currentlyAssignedCount: Math.floor(random() * 3),
        active: true
      });
    });
  });

  return nurses;
}

function generateSpecialtyNurses(random) {
  const names = SPECIALTY_PROGRAM.pedsOnlyNames.concat(SPECIALTY_PROGRAM.fullScopeNames);

  return names.map((name, index) => {
    const licensedStates = chooseUnique(SPECIALTY_PROGRAM.states, 2 + Math.floor(random() * 3), random);
    if (random() < 0.55 && !licensedStates.includes(NLC_TOKEN)) {
      licensedStates.unshift(NLC_TOKEN);
    }

    const isPedsOnly = SPECIALTY_PROGRAM.pedsOnlyNames.includes(name);

    return {
      nurseId: `PD-${index + 1}`,
      nurseName: name,
      workspace: WORKSPACES.specialty.id,
      team: SPECIALTY_PROGRAM.team,
      manager: SPECIALTY_PROGRAM.manager,
      coveredClients: chooseUnique(SPECIALTY_PROGRAM.clients, 2 + Math.floor(random() * 2), random),
      licensedStates,
      capabilities: isPedsOnly ? ["Peds"] : ["Peds", "Newborn", "NICU"],
      dailyCapacity: isPedsOnly ? 4 + Math.floor(random() * 2) : 5 + Math.floor(random() * 3),
      currentlyAssignedCount: Math.floor(random() * 3),
      active: true
    };
  });
}

function generateAdultCases(random, referenceDate) {
  const adultClients = ADULT_TEAM_BLUEPRINTS.flatMap((blueprint) => blueprint.clients);
  const cases = [];

  for (let index = 0; index < 200; index += 1) {
    const client = random() < 0.92
      ? adultClients[Math.floor(random() * adultClients.length)]
      : UNSUPPORTED_CLIENTS[Math.floor(random() * UNSUPPORTED_CLIENTS.length)];
    const teamBlueprint = ADULT_TEAM_BLUEPRINTS.find((blueprint) => blueprint.clients.includes(client));
    const readmissionScore = normalizeReadmissionScore(Math.round(Math.pow(random(), 0.58) * 100));
    const caseAgeDays = Math.floor(random() * 6) + (readmissionScore >= 85 ? 1 : 0);

    cases.push({
      caseId: `CASE-A-${100000 + index}`,
      memberId: `SF-${100000 + index}`,
      workspace: WORKSPACES.adult.id,
      caseType: "Adult",
      client,
      state: pickCaseState(teamBlueprint ? teamBlueprint.states : GLOBAL_STATES, random),
      readmissionScore,
      laceScore: Math.max(4, Math.min(16, Math.round(4 + random() * 8 + readmissionScore / 20))),
      reasonText: chooseUnique(CLINICAL_REASONS, 2, random).join("; "),
      assignmentStatus: random() < 0.22 ? "assigned" : "unassigned",
      caseCreatedDate: shiftDate(-caseAgeDays, referenceDate)
    });
  }

  return cases;
}

function generateSpecialtyCases(random, referenceDate) {
  const cases = [];
  const caseTypes = [];

  while (caseTypes.length < 34) caseTypes.push("Peds");
  while (caseTypes.length < 47) caseTypes.push("Newborn");
  while (caseTypes.length < 60) caseTypes.push("NICU");

  for (let index = 0; index < caseTypes.length; index += 1) {
    const readmissionScore = normalizeReadmissionScore(Math.round(Math.pow(random(), 0.6) * 100));
    const caseAgeDays = Math.floor(random() * 5) + (readmissionScore >= 80 ? 1 : 0);
    const client = random() < 0.9
      ? SPECIALTY_PROGRAM.clients[Math.floor(random() * SPECIALTY_PROGRAM.clients.length)]
      : UNSUPPORTED_CLIENTS[Math.floor(random() * UNSUPPORTED_CLIENTS.length)];

    cases.push({
      caseId: `CASE-P-${200000 + index}`,
      memberId: `SF-${200000 + index}`,
      workspace: WORKSPACES.specialty.id,
      caseType: caseTypes[index],
      client,
      state: pickCaseState(SPECIALTY_PROGRAM.states, random),
      readmissionScore,
      laceScore: Math.max(3, Math.min(16, Math.round(3 + random() * 7 + readmissionScore / 22))),
      reasonText: chooseUnique(CLINICAL_REASONS, 2, random).join("; "),
      assignmentStatus: random() < 0.2 ? "assigned" : "unassigned",
      caseCreatedDate: shiftDate(-caseAgeDays, referenceDate)
    });
  }

  return cases;
}

function pickCaseState(states, random) {
  const source = states || GLOBAL_STATES;
  if (random() < 0.84) {
    return source[Math.floor(random() * source.length)];
  }
  return GLOBAL_STATES[Math.floor(random() * GLOBAL_STATES.length)];
}

function chooseUnique(source, count, random) {
  const pool = source.slice();
  const picked = [];

  while (pool.length && picked.length < count) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }

  return picked;
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const VALID_STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY GU PR VI AS MP".split(" "));
const DAY_MS = 86400000;
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function requireWorkspace(workspaceId) {
  if (!Object.hasOwn(WORKSPACES, workspaceId)) throw new Error(`Unknown workspace: ${workspaceId}`);
  return WORKSPACES[workspaceId];
}

export function validTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new Error("A valid ISO date or timestamp is required.");
  }
  const date = new Date(value);
  const day = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new Error("A valid ISO date or timestamp is required.");
  }
  return date.toISOString();
}

export function getCaseAgeDays(caseItem, referenceDate = new Date().toISOString()) {
  const created = validTimestamp(caseItem.caseCreatedDate).slice(0, 10);
  const asOf = validTimestamp(referenceDate).slice(0, 10);
  return Math.max(0, Math.round((Date.parse(asOf) - Date.parse(created)) / DAY_MS));
}

function shiftDate(dayOffset, referenceDate) {
  const date = new Date(validTimestamp(referenceDate).slice(0, 10));
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function normalizeReadmissionScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeAssignmentStatus(value) {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status !== "assigned" && status !== "unassigned") throw new Error("Case assignmentStatus must be assigned or unassigned.");
  return status;
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a nonempty string.`);
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be an array of nonempty strings.`);
  }
}

function requireUniqueIds(items, key) {
  const ids = new Set();
  items.forEach((item) => {
    if (!item || typeof item !== "object") throw new Error(`Invalid ${key} record.`);
    requireText(item[key], key);
    if (ids.has(item[key])) throw new Error(`Duplicate ${key}: ${item[key]}`);
    ids.add(item[key]);
  });
}

/** Fail closed for malformed in-scope records; unrelated workspaces never enter a plan. */
export function validateWorkspaceInputs({ workspaceId, cases, nurses }) {
  const config = requireWorkspace(workspaceId);
  if (!Array.isArray(cases) || !Array.isArray(nurses)) throw new Error("Cases and nurses must be arrays.");
  requireUniqueIds(cases, "caseId");
  requireUniqueIds(nurses, "nurseId");
  const scopedCases = cases.filter((item) => item.workspace === workspaceId);
  const scopedNurses = nurses.filter((item) => item.workspace === workspaceId);
  scopedCases.forEach((item) => {
    ["caseId", "memberId", "client"].forEach((key) => requireText(item[key], key));
    if (!config.caseTypes.includes(item.caseType)) throw new Error(`Invalid case type for ${workspaceId}: ${item.caseType}`);
    if (!VALID_STATES.has(item.state)) throw new Error(`Invalid case state: ${item.state}`);
    if (!Number.isFinite(item.readmissionScore) || item.readmissionScore < 0 || item.readmissionScore > 100) throw new Error("Readmission score must be a finite number from 0 to 100.");
    if (!Number.isFinite(item.laceScore) || item.laceScore < 0 || item.laceScore > 20) throw new Error("LACE score must be a finite number from 0 to 20.");
    normalizeAssignmentStatus(item.assignmentStatus);
    validTimestamp(item.caseCreatedDate);
  });
  scopedNurses.forEach((nurse) => {
    requireText(nurse.nurseName, "nurseName");
    ["coveredClients", "licensedStates", "capabilities"].forEach((key) => requireStringArray(nurse[key], key));
    if (nurse.licensedStates.some((state) => state !== NLC_TOKEN && !VALID_STATES.has(state))) throw new Error("Invalid nurse license state.");
    if (nurse.capabilities.some((type) => !config.caseTypes.includes(type))) throw new Error("Invalid nurse capability for workspace.");
    if (typeof nurse.active !== "boolean") throw new Error("Nurse active must be a boolean.");
    ["dailyCapacity", "currentlyAssignedCount"].forEach((key) => {
      if (!Number.isSafeInteger(nurse[key]) || nurse[key] < 0) throw new Error(`${key} must be a nonnegative integer.`);
    });
  });
  return { config, cases: scopedCases, nurses: scopedNurses };
}

export function nurseCanPracticeInState(nurse, stateCode) {
  return Array.isArray(nurse.licensedStates) && (
    nurse.licensedStates.includes(stateCode) ||
    (nurse.licensedStates.includes(NLC_TOKEN) && NLC_ACTIVE_JURISDICTIONS.includes(stateCode))
  );
}

function remainingCapacity(nurse, loads) {
  return Math.max(0, nurse.dailyCapacity - nurse.currentlyAssignedCount - (loads.get(nurse.nurseId) || 0));
}

function loadsFor(assignments, excludedCaseId) {
  const loads = new Map();
  assignments.forEach((assignment) => {
    if (assignment.caseId !== excludedCaseId) loads.set(assignment.nurseId, (loads.get(assignment.nurseId) || 0) + 1);
  });
  return loads;
}

const BLOCKERS = {
  "inactive-nurse": "No active nurse in this workspace",
  "client-mismatch": "No nurse covers this client",
  "capability-mismatch": "No nurse qualified for this case type",
  "state-mismatch": "No eligible state license",
  "capacity-full": "No available capacity",
  "manual-hold": "Held during review",
  "pending-assignment": "Eligible nurse available; awaiting manual assignment"
};

function evaluateCaseEligibility(caseItem, nurses, loads, config) {
  let candidates = nurses.filter((nurse) => nurse.workspace === config.id && nurse.active === true);
  if (!candidates.length) return { eligibleNurses: [], reasonCode: "inactive-nurse" };
  const filters = [
    ["client-mismatch", (nurse) => nurse.coveredClients.includes(caseItem.client)],
    ["capability-mismatch", (nurse) => nurse.capabilities.includes(caseItem.caseType)],
    ["state-mismatch", (nurse) => nurseCanPracticeInState(nurse, caseItem.state)],
    ["capacity-full", (nurse) => remainingCapacity(nurse, loads) > 0]
  ];
  for (const [reasonCode, predicate] of filters) {
    candidates = candidates.filter(predicate);
    if (!candidates.length) return { eligibleNurses: [], reasonCode };
  }
  candidates.sort((left, right) => remainingCapacity(right, loads) - remainingCapacity(left, loads)
    || left.currentlyAssignedCount - right.currentlyAssignedCount
    || compareText(left.nurseName, right.nurseName)
    || compareText(left.nurseId, right.nurseId));
  return { eligibleNurses: candidates, reasonCode: "pending-assignment" };
}

export function getEligibleNurseOptions({ workspaceId, caseItem, nurses, assignments = [], excludeNurseId }) {
  const scoped = validateWorkspaceInputs({ workspaceId, cases: [caseItem], nurses });
  if (caseItem.workspace !== workspaceId || normalizeAssignmentStatus(caseItem.assignmentStatus) !== "unassigned") return [];
  if (!Array.isArray(assignments)) throw new Error("Assignments must be an array.");
  const loads = loadsFor(assignments, caseItem.caseId);
  return evaluateCaseEligibility(caseItem, scoped.nurses, loads, scoped.config).eligibleNurses
    .filter((nurse) => nurse.nurseId !== excludeNurseId);
}

function isHighRisk(item, config) { return item.readmissionScore >= config.highRiskThreshold; }
function priorityBand(item, config, at) {
  const age = getCaseAgeDays(item, at);
  if (isHighRisk(item, config) && age >= config.ageThresholdDays) return 0;
  if (isHighRisk(item, config)) return 1;
  if (item.readmissionScore >= config.mediumRiskThreshold && age >= config.ageThresholdDays) return 2;
  if (age >= config.ageThresholdDays * 2) return 3;
  return 4;
}

function compareCases(left, right, config, at) {
  return priorityBand(left, config, at) - priorityBand(right, config, at)
    || (config.id === "specialty" ? PEDIATRIC_CASE_TYPE_ORDER[right.caseType] - PEDIATRIC_CASE_TYPE_ORDER[left.caseType] : 0)
    || right.readmissionScore - left.readmissionScore
    || getCaseAgeDays(right, at) - getCaseAgeDays(left, at)
    || right.laceScore - left.laceScore
    || Date.parse(left.caseCreatedDate) - Date.parse(right.caseCreatedDate)
    || compareText(left.caseId, right.caseId);
}

function priorityReasons(item, config, at) {
  const reasons = [];
  if (isHighRisk(item, config)) reasons.push("High readmission score");
  else if (item.readmissionScore >= config.mediumRiskThreshold) reasons.push("Elevated readmission score");
  if (item.laceScore >= 13) reasons.push("High LACE");
  else if (item.laceScore >= 10) reasons.push("Elevated LACE");
  if (getCaseAgeDays(item, at) >= config.ageThresholdDays) reasons.push("Older case");
  if (config.id === "specialty" && item.caseType === "Peds") reasons.push("Peds priority");
  return reasons;
}

function eligibilityReasons(item, nurse) {
  return ["Active nurse", "Eligible by client", "Eligible by case type", "Eligible by state license", "Capacity available"];
}

function assignmentDetails(assignment, item, nurse, config, at) {
  const priorities = priorityReasons(item, config, at);
  const eligibility = eligibilityReasons(item, nurse);
  const manual = assignment.source === "manual";
  return {
    ...assignment,
    source: manual ? "manual" : "engine",
    confidence: manual ? "Manual override" : "Rules matched",
    priorityReasons: priorities,
    eligibilityReasons: eligibility,
    explanation: `${manual ? "Manually assigned" : "Proposed"} to ${nurse.nurseName}: ${priorities.concat(eligibility).join(", ").toLowerCase()}.${manual ? ` Review reason: ${assignment.overrideReason}` : ""}`
  };
}

/** Rebuild from canonical assignments so every counter, explanation, and alert agrees. */
export function generateDraftPlan({ workspaceId, cases, nurses, stage = "draft", lastRunAt = new Date().toISOString(), assignments, manualHolds = [] }) {
  if (!["draft", "reviewed", "published"].includes(stage)) throw new Error("Invalid plan stage.");
  const at = validTimestamp(lastRunAt);
  const scoped = validateWorkspaceInputs({ workspaceId, cases, nurses });
  const config = scoped.config;
  const caseMap = new Map(scoped.cases.map((item) => [item.caseId, item]));
  const nurseMap = new Map(scoped.nurses.map((nurse) => [nurse.nurseId, nurse]));
  const openCases = scoped.cases.filter((item) => normalizeAssignmentStatus(item.assignmentStatus) === "unassigned").sort((a, b) => compareCases(a, b, config, at));
  if (!Array.isArray(manualHolds)) throw new Error("Manual holds must be an array.");
  const holdMap = new Map();
  manualHolds.forEach((hold) => {
    if (!hold || !openCases.some((item) => item.caseId === hold.caseId) || holdMap.has(hold.caseId)) throw new Error("Invalid or duplicate manual hold.");
    requireText(hold.reason, "Manual hold reason");
    holdMap.set(hold.caseId, { caseId: hold.caseId, reason: hold.reason.trim() });
  });
  const result = [];
  const loads = new Map();
  const seen = new Set();
  const add = (assignment) => {
    const item = caseMap.get(assignment?.caseId);
    const nurse = nurseMap.get(assignment?.nurseId);
    if (!item || normalizeAssignmentStatus(item.assignmentStatus) !== "unassigned") throw new Error("Assignment case is missing, outside workspace, or already assigned.");
    if (seen.has(item.caseId)) throw new Error(`Duplicate assignment for ${item.caseId}.`);
    if (holdMap.has(item.caseId)) throw new Error("A held case cannot also be assigned.");
    const eligible = evaluateCaseEligibility(item, scoped.nurses, loads, config).eligibleNurses;
    if (!nurse || !eligible.some((candidate) => candidate.nurseId === nurse.nurseId)) throw new Error(`Nurse is not eligible or has no capacity for ${item.caseId}.`);
    if (assignment.source === "manual") requireText(assignment.overrideReason, "Override reason");
    seen.add(item.caseId);
    loads.set(nurse.nurseId, (loads.get(nurse.nurseId) || 0) + 1);
    result.push(assignmentDetails(assignment, item, nurse, config, at));
  };
  if (assignments !== undefined) {
    if (!Array.isArray(assignments)) throw new Error("Assignments must be an array.");
    assignments.forEach(add);
  } else {
    openCases.filter((item) => !holdMap.has(item.caseId)).forEach((item) => {
      const best = evaluateCaseEligibility(item, scoped.nurses, loads, config).eligibleNurses[0];
      if (best) add({ caseId: item.caseId, nurseId: best.nurseId });
    });
  }
  result.sort((left, right) => compareCases(caseMap.get(left.caseId), caseMap.get(right.caseId), config, at));
  const assignmentMap = new Map(result.map((assignment) => [assignment.caseId, assignment]));
  const ageRow = (item) => ({ ...item, caseAgeDays: getCaseAgeDays(item, at) });
  const overflow = openCases.filter((item) => !seen.has(item.caseId)).map((item) => {
    const hold = holdMap.get(item.caseId);
    const reasonCode = hold ? "manual-hold" : evaluateCaseEligibility(item, scoped.nurses, loads, config).reasonCode;
    return { ...ageRow(item), reasonCode, blockerReason: hold ? `${BLOCKERS[reasonCode]}: ${hold.reason}` : BLOCKERS[reasonCode], blockerTone: ["capacity-full", "manual-hold", "pending-assignment"].includes(reasonCode) ? "warning" : "danger" };
  });
  const assignmentGroups = scoped.nurses.map((nurse) => ({
    nurse: { ...nurse },
    assignedCases: result.filter((assignment) => assignment.nurseId === nurse.nurseId).map((assignment) => ({
      ...ageRow(caseMap.get(assignment.caseId)),
      _nurse: { ...nurse },
      assignmentExplanation: assignment.explanation,
      assignmentConfidence: assignment.confidence,
      priorityReasons: assignment.priorityReasons,
      eligibilityReasons: assignment.eligibilityReasons
    }))
  })).filter((group) => group.assignedCases.length).sort((left, right) => right.assignedCases.length - left.assignedCases.length || compareText(left.nurse.nurseName, right.nurse.nurseName) || compareText(left.nurse.nurseId, right.nurse.nurseId));
  const highRiskCases = openCases.filter((item) => isHighRisk(item, config));
  const highRiskOverflow = overflow.filter((item) => isHighRisk(item, config));
  const agedOverflow = overflow.filter((item) => item.caseAgeDays >= config.ageThresholdDays);
  const activeNurses = scoped.nurses.filter((nurse) => nurse.active === true);
  const maxAge = (items) => items.length ? Math.max(...items.map((item) => getCaseAgeDays(item, at))) : 0;
  const capacityToday = activeNurses.reduce((sum, nurse) => sum + remainingCapacity(nurse, new Map()), 0);
  const totalRemaining = activeNurses.reduce((sum, nurse) => sum + remainingCapacity(nurse, loads), 0);
  const overflowMap = new Map(overflow.map((item) => [item.caseId, item]));
  const agingWatchlist = openCases.filter((item) => getCaseAgeDays(item, at) >= config.ageThresholdDays)
    .sort((left, right) => Number(isHighRisk(right, config)) - Number(isHighRisk(left, config)) || getCaseAgeDays(right, at) - getCaseAgeDays(left, at) || compareCases(left, right, config, at))
    .map((item) => {
      const assignment = assignmentMap.get(item.caseId);
      const nurse = assignment ? nurseMap.get(assignment.nurseId) : null;
      const label = stage === "published" ? "Published" : stage === "reviewed" ? "Reviewed" : "Draft";
      return { ...ageRow(item), status: assignment ? `${label} assigned` : "Open", reason: nurse ? `${label} to ${nurse.nurseName}` : overflowMap.get(item.caseId).blockerReason };
    });
  const alerts = [];
  const alert = (type, severity, title, items, message) => {
    if (items.length) alerts.push({ id: `${workspaceId}-${type}`, type, severity, title, count: items.length, caseIds: items.map((item) => item.caseId), message });
  };
  alert("overflow", "warning", "Unassigned cases need review", overflow, `${overflow.length} cases remain unassigned after this run.`);
  alert("high-risk-overflow", "danger", "High-risk cases remain unassigned", highRiskOverflow, `${highRiskOverflow.length} cases at or above the demo risk threshold (${config.highRiskThreshold}) remain open.`);
  alert("aging", "danger", "Aging cases need attention", agedOverflow, `${agedOverflow.length} unassigned cases have waited at least ${config.ageThresholdDays} days.`);
  return {
    workspaceId, stage, lastRunAt: at, referenceDate: at, assignments: result,
    manualHolds: Array.from(holdMap.values()), assignmentGroups, overflow, agingWatchlist, alerts,
    exceptions: overflow,
    metrics: {
      openCases: openCases.length,
      highRiskOpen: highRiskCases.length,
      capacityToday,
      remainingCapacity: totalRemaining,
      oldestCaseAge: maxAge(openCases),
      oldestHighRiskAge: maxAge(highRiskCases),
      averageCaseAge: openCases.length ? Number((openCases.reduce((sum, item) => sum + getCaseAgeDays(item, at), 0) / openCases.length).toFixed(1)) : 0,
      unassignedHighRisk: highRiskOverflow.length,
      assignedCount: result.length,
      overflowCount: overflow.length,
      agingUnassigned: agedOverflow.length,
      assignableRightNow: overflow.filter((item) => evaluateCaseEligibility(item, scoped.nurses, loads, config).eligibleNurses.length > 0).length,
      highRiskCoverage: highRiskCases.length ? Math.round((highRiskCases.length - highRiskOverflow.length) / highRiskCases.length * 100) : 100,
      lastRunTime: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(at)) + " UTC"
    },
    overflowSummary: {
      highRiskUnassigned: highRiskOverflow.length,
      oldestUnassigned: maxAge(overflow),
      noEligibleNurse: overflow.filter((item) => ["inactive-nurse", "client-mismatch", "capability-mismatch", "state-mismatch"].includes(item.reasonCode)).length,
      noCapacity: overflow.filter((item) => item.reasonCode === "capacity-full").length,
      manualHolds: holdMap.size
    },
    subtypeMetrics: workspaceId === "specialty" ? {
      casesByType: config.caseTypes.map((caseType) => {
        const matching = openCases.filter((item) => item.caseType === caseType);
        return { caseType, openCount: matching.length, oldestAge: maxAge(matching), unassignedCount: matching.filter((item) => overflowMap.has(item.caseId)).length, draftedCount: matching.filter((item) => assignmentMap.has(item.caseId)).length };
      }),
      capacityByNurseType: {
        pedsOnly: activeNurses.filter((nurse) => nurse.capabilities.length === 1 && nurse.capabilities[0] === "Peds").reduce((sum, nurse) => sum + remainingCapacity(nurse, loads), 0),
        fullScope: activeNurses.filter((nurse) => nurse.capabilities.includes("Newborn") || nurse.capabilities.includes("NICU")).reduce((sum, nurse) => sum + remainingCapacity(nurse, loads), 0)
      }
    } : null
  };
}

export function buildCaseDrawerModel({ workspaceId, caseItem, nurse, overflowReason, referenceDate = new Date().toISOString(), stage = "draft" }) {
  const config = requireWorkspace(workspaceId);
  const reasons = priorityReasons(caseItem, config, referenceDate);
  const eligibility = nurse ? eligibilityReasons(caseItem, nurse) : [];
  return {
    ...caseItem,
    caseAgeDays: getCaseAgeDays(caseItem, referenceDate),
    assignmentStatus: nurse ? stage === "published" ? "Published" : "Recommended" : normalizeAssignmentStatus(caseItem.assignmentStatus) === "assigned" ? "Already assigned" : "Unassigned",
    priorityReasons: reasons,
    eligibilityReasons: eligibility,
    prioritySummary: reasons.join(", "),
    nurseEligibilitySummary: nurse ? `Eligible by the demo rules: ${eligibility.join(", ").toLowerCase()}.` : overflowReason || "No eligible nurse identified for this case."
  };
}
