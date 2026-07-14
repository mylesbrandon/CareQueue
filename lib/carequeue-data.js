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

export function getWorkspaceDemoData(workspaceId) {
  const random = mulberry32(workspaceId === WORKSPACES.adult.id ? 81234 : 90214);

  if (workspaceId === WORKSPACES.adult.id) {
    return {
      cases: generateAdultCases(random),
      nurses: generateAdultNurses(random)
    };
  }

  return {
    cases: generateSpecialtyCases(random),
    nurses: generateSpecialtyNurses(random)
  };
}

export function generateDraftPlan({ workspaceId, cases, nurses, stage = "draft", lastRunAt = new Date().toISOString() }) {
  const workspaceConfig = WORKSPACES[workspaceId];
  const result = runAssignmentEngine(workspaceConfig, cases, nurses);

  return {
    workspaceId,
    stage,
    lastRunAt,
    metrics: buildWorkspaceMetrics(workspaceConfig, cases, nurses, result),
    assignmentGroups: buildAssignmentGroups(result.assignments, cases, nurses, workspaceConfig),
    overflow: buildOverflowRows(result.overflow, cases, workspaceConfig),
    agingWatchlist: buildAgingRows(cases, result, nurses, workspaceConfig),
    exceptions: buildExceptions(result, cases, workspaceConfig),
    overflowSummary: buildOverflowSummary(result.overflow, cases, workspaceConfig),
    subtypeMetrics: workspaceId === WORKSPACES.specialty.id ? buildSpecialtySubtypeMetrics(cases, result, nurses) : null
  };
}

export function getEligibleNurseOptions({ workspaceId, caseItem, nurses, assignments, excludeNurseId }) {
  const workspaceConfig = WORKSPACES[workspaceId];
  const nurseLoadMap = new Map();

  assignments.forEach((assignment) => {
    if (assignment.caseId !== caseItem.caseId) {
      nurseLoadMap.set(assignment.nurseId, (nurseLoadMap.get(assignment.nurseId) || 0) + 1);
    }
  });

  return nurses
    .filter((nurse) => nurse.workspace === workspaceId && nurse.nurseId !== excludeNurseId)
    .filter((nurse) => nurse.coveredClients.includes(caseItem.client))
    .filter((nurse) => nurse.capabilities.includes(caseItem.caseType))
    .filter((nurse) => nurseCanPracticeInState(nurse, caseItem.state))
    .filter((nurse) => getRemainingCapacity(nurse, nurseLoadMap) > 0)
    .sort((left, right) => {
      const remainingGap = getRemainingCapacity(right, nurseLoadMap) - getRemainingCapacity(left, nurseLoadMap);
      if (remainingGap !== 0) {
        return remainingGap;
      }
      return left.nurseName.localeCompare(right.nurseName);
    });
}

export function buildCaseDrawerModel({ workspaceId, caseItem, nurse, overflowReason }) {
  const workspaceConfig = WORKSPACES[workspaceId];

  return {
    memberId: caseItem.memberId,
    client: caseItem.client,
    state: caseItem.state,
    caseType: caseItem.caseType,
    readmissionScore: caseItem.readmissionScore,
    laceScore: caseItem.laceScore,
    reasonText: caseItem.reasonText,
    caseAgeDays: getCaseAgeDays(caseItem),
    assignmentStatus: nurse ? "Recommended" : normalizeAssignmentStatus(caseItem.assignmentStatus) === "assigned" ? "Already assigned" : "Unassigned",
    priorityReasons: buildPriorityReasons(caseItem, workspaceConfig),
    eligibilityReasons: nurse ? buildEligibilityReasons(caseItem, nurse, workspaceConfig) : [],
    prioritySummary: buildPriorityReasons(caseItem, workspaceConfig).join(", "),
    nurseEligibilitySummary: nurse ? buildEligibilitySentence(caseItem, nurse, workspaceConfig) : overflowReason || "No eligible nurse identified for this case."
  };
}

export function getDemoRunHistory() {
  return [
    {
      id: "run-2026-04-12-a",
      workspace: "Adult Ops",
      timestamp: "2026-04-12T08:11:00-05:00",
      draftAssignments: 68,
      publishedAssignments: 64,
      highRiskCoverage: "83%",
      overflowCount: 17,
      overrideCount: 6,
      beforeAfter: "High-risk unassigned 14 -> 6"
    },
    {
      id: "run-2026-04-12-s",
      workspace: "Ped / Newborn / NICU Ops",
      timestamp: "2026-04-12T08:19:00-05:00",
      draftAssignments: 24,
      publishedAssignments: 22,
      highRiskCoverage: "79%",
      overflowCount: 9,
      overrideCount: 2,
      beforeAfter: "High-risk unassigned 6 -> 3"
    },
    {
      id: "run-2026-04-11-a",
      workspace: "Adult Ops",
      timestamp: "2026-04-11T08:07:00-05:00",
      draftAssignments: 66,
      publishedAssignments: 63,
      highRiskCoverage: "81%",
      overflowCount: 18,
      overrideCount: 4,
      beforeAfter: "High-risk unassigned 15 -> 7"
    }
  ];
}

export function getDemoTrendRows() {
  return [
    { day: "Apr 6", highRiskCoverage: 76, averageCaseAge: 2.9, overflowCount: 20, publishRate: 92 },
    { day: "Apr 7", highRiskCoverage: 78, averageCaseAge: 2.7, overflowCount: 18, publishRate: 93 },
    { day: "Apr 8", highRiskCoverage: 79, averageCaseAge: 2.6, overflowCount: 17, publishRate: 94 },
    { day: "Apr 9", highRiskCoverage: 81, averageCaseAge: 2.4, overflowCount: 15, publishRate: 94 },
    { day: "Apr 10", highRiskCoverage: 82, averageCaseAge: 2.3, overflowCount: 14, publishRate: 95 },
    { day: "Apr 11", highRiskCoverage: 80, averageCaseAge: 2.5, overflowCount: 16, publishRate: 94 },
    { day: "Apr 12", highRiskCoverage: 83, averageCaseAge: 2.2, overflowCount: 13, publishRate: 96 }
  ];
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

function generateAdultCases(random) {
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
      caseCreatedDate: shiftDate(-caseAgeDays)
    });
  }

  return cases;
}

function generateSpecialtyCases(random) {
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
      caseCreatedDate: shiftDate(-caseAgeDays)
    });
  }

  return cases;
}

function runAssignmentEngine(workspaceConfig, cases, nurses) {
  const workspaceCases = cases.filter((caseItem) => caseItem.workspace === workspaceConfig.id);
  const workspaceNurses = nurses.filter((nurse) => nurse.workspace === workspaceConfig.id && nurse.active !== false);
  const candidateCases = workspaceCases
    .filter((caseItem) => normalizeAssignmentStatus(caseItem.assignmentStatus) === "unassigned")
    .slice()
    .sort((left, right) => compareCasesForAssignment(left, right, workspaceConfig));

  const nurseLoadMap = new Map();
  const assignments = [];
  const overflow = [];

  workspaceNurses.forEach((nurse) => {
    nurseLoadMap.set(nurse.nurseId, 0);
  });

  candidateCases.forEach((caseItem) => {
    const eligibility = evaluateCaseEligibility(caseItem, workspaceNurses, nurseLoadMap, workspaceConfig);

    if (eligibility.eligibleNurses.length > 0) {
      const selectedNurse = selectBestNurse(eligibility.eligibleNurses, nurseLoadMap);
      nurseLoadMap.set(selectedNurse.nurseId, (nurseLoadMap.get(selectedNurse.nurseId) || 0) + 1);

      assignments.push({
        caseId: caseItem.caseId,
        nurseId: selectedNurse.nurseId,
        confidence: buildAssignmentConfidence(caseItem, selectedNurse, workspaceConfig),
        priorityReasons: buildPriorityReasons(caseItem, workspaceConfig),
        eligibilityReasons: buildEligibilityReasons(caseItem, selectedNurse, workspaceConfig),
        explanation: buildAssignmentExplanation(caseItem, selectedNurse, workspaceConfig)
      });
    } else {
      overflow.push({
        caseId: caseItem.caseId,
        reasonCode: eligibility.reasonCode,
        reasonLabel: eligibility.reasonLabel,
        blockerTone: mapBlockerTone(eligibility.reasonCode)
      });
    }
  });

  return {
    assignments,
    overflow
  };
}

function buildAssignmentGroups(assignments, cases, nurses, workspaceConfig) {
  const caseMap = buildCaseMap(cases);
  const nurseMap = new Map(nurses.map((nurse) => [nurse.nurseId, nurse]));
  const grouped = new Map();

  assignments.forEach((assignment) => {
    if (!grouped.has(assignment.nurseId)) {
      grouped.set(assignment.nurseId, []);
    }

    const caseItem = caseMap.get(assignment.caseId);
    if (caseItem) {
      grouped.get(assignment.nurseId).push({
        ...caseItem,
        caseAgeDays: getCaseAgeDays(caseItem),
        assignmentExplanation: assignment.explanation,
        assignmentConfidence: assignment.confidence,
        priorityReasons: assignment.priorityReasons,
        eligibilityReasons: assignment.eligibilityReasons
      });
    }
  });

  return Array.from(grouped.entries())
    .map(([nurseId, assignedCases]) => ({
      nurse: nurseMap.get(nurseId),
      assignedCases: assignedCases.sort((left, right) => compareCasesForAssignment(left, right, workspaceConfig))
    }))
    .sort((left, right) => {
      const assignmentGap = right.assignedCases.length - left.assignedCases.length;
      if (assignmentGap !== 0) {
        return assignmentGap;
      }
      return left.nurse.nurseName.localeCompare(right.nurse.nurseName);
    });
}

function buildOverflowRows(overflow, cases, workspaceConfig) {
  const caseMap = buildCaseMap(cases);

  return overflow
    .map((entry) => {
      const caseItem = caseMap.get(entry.caseId);
      return caseItem
        ? {
            ...caseItem,
            caseAgeDays: getCaseAgeDays(caseItem),
            blockerReason: entry.reasonLabel,
            blockerTone: entry.blockerTone
          }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => compareCasesForAssignment(left, right, workspaceConfig));
}

function buildAgingRows(cases, result, nurses, workspaceConfig) {
  const assignmentMap = new Map(result.assignments.map((assignment) => [assignment.caseId, assignment]));
  const nurseMap = new Map(nurses.map((nurse) => [nurse.nurseId, nurse]));
  const overflowMap = new Map(result.overflow.map((entry) => [entry.caseId, entry]));

  return cases
    .slice()
    .sort((left, right) => compareCasesForAging(left, right, workspaceConfig))
    .map((caseItem) => {
      const assignment = assignmentMap.get(caseItem.caseId);
      const overflow = overflowMap.get(caseItem.caseId);
      const nurse = assignment ? nurseMap.get(assignment.nurseId) : null;

      return {
        ...caseItem,
        caseAgeDays: getCaseAgeDays(caseItem),
        status: normalizeAssignmentStatus(caseItem.assignmentStatus) === "assigned"
          ? "Already assigned"
          : assignment
            ? "Draft assigned"
            : "Open",
        reason: normalizeAssignmentStatus(caseItem.assignmentStatus) === "assigned"
          ? "Already assigned before morning run"
          : assignment
            ? `Drafted to ${nurse ? nurse.nurseName : assignment.nurseId}`
            : overflow
              ? overflow.reasonLabel
              : "Pending review"
      };
    })
    .slice(0, 24);
}

function buildExceptions(result, cases, workspaceConfig) {
  const caseMap = buildCaseMap(cases);

  return result.overflow
    .map((entry) => {
      const caseItem = caseMap.get(entry.caseId);
      return caseItem
        ? {
            ...caseItem,
            caseAgeDays: getCaseAgeDays(caseItem),
            blockerReason: entry.reasonLabel,
            blockerTone: entry.blockerTone
          }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => compareCasesForAssignment(left, right, workspaceConfig))
    .slice(0, 12);
}

function buildOverflowSummary(overflow, cases, workspaceConfig) {
  const caseMap = buildCaseMap(cases);
  const overflowCases = overflow.map((entry) => caseMap.get(entry.caseId)).filter(Boolean);

  return {
    highRiskUnassigned: overflowCases.filter((caseItem) => isHighRisk(caseItem, workspaceConfig)).length,
    oldestUnassigned: overflowCases.length ? Math.max(...overflowCases.map(getCaseAgeDays)) : 0,
    noEligibleNurse: overflow.filter((entry) => entry.reasonCode === "client-mismatch" || entry.reasonCode === "capability-mismatch" || entry.reasonCode === "state-mismatch").length,
    noCapacity: overflow.filter((entry) => entry.reasonCode === "capacity-full").length
  };
}

function buildSpecialtySubtypeMetrics(cases, result, nurses) {
  const assignmentMap = new Map(result.assignments.map((assignment) => [assignment.caseId, assignment]));
  const overflowMap = new Map(result.overflow.map((entry) => [entry.caseId, entry]));

  const casesByType = ["Peds", "Newborn", "NICU"].map((caseType) => {
    const matchingCases = cases.filter((caseItem) => caseItem.caseType === caseType);
    const openCases = matchingCases.filter((caseItem) => normalizeAssignmentStatus(caseItem.assignmentStatus) === "unassigned");

    return {
      caseType,
      openCount: openCases.length,
      oldestAge: openCases.length ? Math.max(...openCases.map(getCaseAgeDays)) : 0,
      unassignedCount: openCases.filter((caseItem) => overflowMap.has(caseItem.caseId)).length,
      draftedCount: openCases.filter((caseItem) => assignmentMap.has(caseItem.caseId)).length
    };
  });

  const pedsOnly = nurses
    .filter((nurse) => nurse.capabilities.length === 1 && nurse.capabilities[0] === "Peds")
    .reduce((sum, nurse) => sum + Math.max(0, nurse.dailyCapacity - nurse.currentlyAssignedCount), 0);
  const fullScope = nurses
    .filter((nurse) => nurse.capabilities.includes("Newborn") || nurse.capabilities.includes("NICU"))
    .reduce((sum, nurse) => sum + Math.max(0, nurse.dailyCapacity - nurse.currentlyAssignedCount), 0);

  return {
    casesByType,
    capacityByNurseType: { pedsOnly, fullScope }
  };
}

function buildWorkspaceMetrics(workspaceConfig, cases, nurses, result) {
  const workspaceCases = cases.filter((caseItem) => caseItem.workspace === workspaceConfig.id);
  const openCases = workspaceCases.filter((caseItem) => normalizeAssignmentStatus(caseItem.assignmentStatus) === "unassigned");
  const highRiskCases = openCases.filter((caseItem) => isHighRisk(caseItem, workspaceConfig));
  const capacityToday = nurses
    .filter((nurse) => nurse.workspace === workspaceConfig.id && nurse.active !== false)
    .reduce((sum, nurse) => sum + Math.max(0, nurse.dailyCapacity - nurse.currentlyAssignedCount), 0);

  return {
    openCases: openCases.length,
    highRiskOpen: highRiskCases.length,
    capacityToday,
    oldestCaseAge: getMaxAge(openCases),
    oldestHighRiskAge: getMaxAge(highRiskCases),
    averageCaseAge: averageAge(openCases),
    unassignedHighRisk: result.overflow.filter((entry) => {
      const caseItem = workspaceCases.find((candidate) => candidate.caseId === entry.caseId);
      return caseItem && isHighRisk(caseItem, workspaceConfig);
    }).length,
    assignableRightNow: countAssignableCases(openCases, nurses, workspaceConfig),
    lastRunTime: formatTimestamp(new Date().toISOString())
  };
}

function countAssignableCases(cases, nurses, workspaceConfig) {
  return cases.filter((caseItem) => nurses.some((nurse) => {
    if (nurse.workspace !== workspaceConfig.id || nurse.active === false) return false;
    if (!nurse.coveredClients.includes(caseItem.client)) return false;
    if (!nurse.capabilities.includes(caseItem.caseType)) return false;
    if (!nurseCanPracticeInState(nurse, caseItem.state)) return false;
    return nurse.dailyCapacity - nurse.currentlyAssignedCount > 0;
  })).length;
}

function evaluateCaseEligibility(caseItem, nurses, nurseLoadMap, workspaceConfig) {
  const clientMatches = nurses.filter((nurse) => nurse.coveredClients.includes(caseItem.client));
  if (clientMatches.length === 0) {
    return {
      eligibleNurses: [],
      reasonCode: "client-mismatch",
      reasonLabel: "No eligible nurse"
    };
  }

  const capabilityMatches = clientMatches.filter((nurse) => nurse.capabilities.includes(caseItem.caseType));
  if (capabilityMatches.length === 0) {
    return {
      eligibleNurses: [],
      reasonCode: "capability-mismatch",
      reasonLabel: "Filtered out by team"
    };
  }

  const licensedMatches = capabilityMatches.filter((nurse) => nurseCanPracticeInState(nurse, caseItem.state));
  if (licensedMatches.length === 0) {
    return {
      eligibleNurses: [],
      reasonCode: "state-mismatch",
      reasonLabel: "No eligible state license"
    };
  }

  const capacityMatches = licensedMatches.filter((nurse) => getRemainingCapacity(nurse, nurseLoadMap) > 0);
  if (capacityMatches.length === 0) {
    return {
      eligibleNurses: [],
      reasonCode: "capacity-full",
      reasonLabel: "No available capacity"
    };
  }

  return {
    eligibleNurses: capacityMatches,
    reasonCode: "",
    reasonLabel: ""
  };
}

function selectBestNurse(eligibleNurses, nurseLoadMap) {
  return eligibleNurses.slice().sort((left, right) => {
    const remainingGap = getRemainingCapacity(right, nurseLoadMap) - getRemainingCapacity(left, nurseLoadMap);
    if (remainingGap !== 0) {
      return remainingGap;
    }

    const currentGap = left.currentlyAssignedCount - right.currentlyAssignedCount;
    if (currentGap !== 0) {
      return currentGap;
    }

    return left.nurseName.localeCompare(right.nurseName);
  })[0];
}

function buildPriorityReasons(caseItem, workspaceConfig) {
  const reasons = [];

  if (isHighRisk(caseItem, workspaceConfig)) {
    reasons.push("High readmission score");
  } else if (isMediumRisk(caseItem, workspaceConfig)) {
    reasons.push("Elevated readmission score");
  }

  if (caseItem.laceScore >= 13) {
    reasons.push("High LACE");
  } else if (caseItem.laceScore >= 10) {
    reasons.push("Elevated LACE");
  }

  if (getCaseAgeDays(caseItem) >= workspaceConfig.ageThresholdDays) {
    reasons.push("Older case");
  }

  if (workspaceConfig.id === WORKSPACES.specialty.id && caseItem.caseType === "Peds") {
    reasons.push("Peds priority");
  }

  return reasons;
}

function buildEligibilityReasons(caseItem, nurse, workspaceConfig) {
  const reasons = ["Eligible by client", "Eligible by state license", "Capacity available"];

  if (workspaceConfig.id === WORKSPACES.specialty.id) {
    reasons.push(nurse.capabilities.length === 1 ? "Peds-only match" : "Full-scope match");
  }

  return reasons;
}

function buildAssignmentExplanation(caseItem, nurse, workspaceConfig) {
  return `Assigned because ${buildPriorityReasons(caseItem, workspaceConfig).concat(buildEligibilityReasons(caseItem, nurse, workspaceConfig)).join(", ").toLowerCase()}.`;
}

function buildEligibilitySentence(caseItem, nurse, workspaceConfig) {
  return `Eligible because ${buildEligibilityReasons(caseItem, nurse, workspaceConfig).join(", ").toLowerCase()}.`;
}

function buildAssignmentConfidence(caseItem, nurse, workspaceConfig) {
  const reasons = buildPriorityReasons(caseItem, workspaceConfig);

  if (isHighRisk(caseItem, workspaceConfig) && reasons.length >= 2) {
    return "High fit";
  }
  if (nurse.capabilities.length > 1 || nurse.coveredClients.length > 1) {
    return "Good fit";
  }
  return "Standard fit";
}

function mapBlockerTone(reasonCode) {
  if (reasonCode === "capacity-full") {
    return "warning";
  }
  if (reasonCode === "client-mismatch" || reasonCode === "capability-mismatch" || reasonCode === "state-mismatch") {
    return "danger";
  }
  return "neutral";
}

function buildCaseMap(cases) {
  return new Map(cases.map((caseItem) => [caseItem.caseId, caseItem]));
}

function compareCasesForAssignment(left, right, workspaceConfig) {
  const bandGap = getPriorityBand(left, workspaceConfig) - getPriorityBand(right, workspaceConfig);
  if (bandGap !== 0) {
    return bandGap;
  }

  if (workspaceConfig.id === WORKSPACES.specialty.id) {
    const typeGap = getCaseTypePriority(right.caseType) - getCaseTypePriority(left.caseType);
    if (typeGap !== 0) {
      return typeGap;
    }
  }

  if (right.readmissionScore !== left.readmissionScore) {
    return right.readmissionScore - left.readmissionScore;
  }

  const ageGap = getCaseAgeDays(right) - getCaseAgeDays(left);
  if (ageGap !== 0) {
    return ageGap;
  }

  if (right.laceScore !== left.laceScore) {
    return right.laceScore - left.laceScore;
  }

  return new Date(left.caseCreatedDate).getTime() - new Date(right.caseCreatedDate).getTime();
}

function compareCasesForAging(left, right, workspaceConfig) {
  const highRiskGap = Number(isHighRisk(right, workspaceConfig)) - Number(isHighRisk(left, workspaceConfig));
  if (highRiskGap !== 0) {
    return highRiskGap;
  }

  const ageGap = getCaseAgeDays(right) - getCaseAgeDays(left);
  if (ageGap !== 0) {
    return ageGap;
  }

  if (workspaceConfig.id === WORKSPACES.specialty.id) {
    const typeGap = getCaseTypePriority(right.caseType) - getCaseTypePriority(left.caseType);
    if (typeGap !== 0) {
      return typeGap;
    }
  }

  if (right.readmissionScore !== left.readmissionScore) {
    return right.readmissionScore - left.readmissionScore;
  }

  return right.laceScore - left.laceScore;
}

function getPriorityBand(caseItem, workspaceConfig) {
  const ageDays = getCaseAgeDays(caseItem);

  if (isHighRisk(caseItem, workspaceConfig) && ageDays >= workspaceConfig.ageThresholdDays) return 0;
  if (isHighRisk(caseItem, workspaceConfig)) return 1;
  if (isMediumRisk(caseItem, workspaceConfig) && ageDays >= workspaceConfig.ageThresholdDays) return 2;
  if (ageDays >= workspaceConfig.ageThresholdDays * 2) return 3;
  return 4;
}

function getRemainingCapacity(nurse, nurseLoadMap) {
  return nurse.dailyCapacity - nurse.currentlyAssignedCount - (nurseLoadMap.get(nurse.nurseId) || 0);
}

function nurseCanPracticeInState(nurse, stateCode) {
  return getPracticeStatesForNurse(nurse).includes(stateCode);
}

function getPracticeStatesForNurse(nurse) {
  const practiceStates = new Set();

  nurse.licensedStates.forEach((token) => {
    if (token === NLC_TOKEN) {
      NLC_ACTIVE_JURISDICTIONS.forEach((state) => practiceStates.add(state));
    } else if (token) {
      practiceStates.add(token);
    }
  });

  return Array.from(practiceStates);
}

function getCaseTypePriority(caseType) {
  return PEDIATRIC_CASE_TYPE_ORDER[caseType] || 0;
}

function normalizeAssignmentStatus(value) {
  return String(value || "").trim().toLowerCase() === "assigned" ? "assigned" : "unassigned";
}

function normalizeReadmissionScore(value) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return 0;
  if (numericValue > 0 && numericValue <= 1) return Math.round(numericValue * 100);
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function isHighRisk(caseItem, workspaceConfig) {
  return caseItem.readmissionScore >= workspaceConfig.highRiskThreshold;
}

function isMediumRisk(caseItem, workspaceConfig) {
  return caseItem.readmissionScore >= workspaceConfig.mediumRiskThreshold;
}

function getCaseAgeDays(caseItem) {
  return daysSince(caseItem.caseCreatedDate);
}

function getMaxAge(cases) {
  return cases.length ? Math.max(...cases.map(getCaseAgeDays)) : 0;
}

function averageAge(cases) {
  if (!cases.length) return 0;
  return Number((cases.reduce((sum, caseItem) => sum + getCaseAgeDays(caseItem), 0) / cases.length).toFixed(1));
}

function formatTimestamp(value) {
  if (!value) return "Not run";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function shiftDate(dayOffset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - date.getTime()) / 86400000));
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
