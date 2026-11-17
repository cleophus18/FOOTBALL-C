import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/core/contracts.mjs', 'utf8');
const oldStr = `export function aiContractDecision(player, club, context = {}) {
  const rng = context.rng ?? Math.random;
  const day = Number(context.currentDay ?? 0);
  const overall = Number(player?.overall ?? 55);
  const potential = Number(player?.potential ?? overall);
  const age = Number(player?.age ?? context.ageOfPlayer ?? 25);
  const wage = Number(player?.contract?.weeklyWage ?? 0);
  const prestige = Number(club?.prestige ?? 50);
  const finance = club?.finances ?? {};
  const wageBudget = Number(finance.wageBudget ?? club?.wageBudget ?? 0);
  const wageBill = Number(context.wageBill ?? 0);
  const squadSize = Number(context.squadSize ?? 0);
  const positionalDepth = Number(context.positionalDepth ?? 2);
  const isGoalkeeper = normalizePosition(player?.position) === "GK";
  const apps = Number(player?.stats?.apps ?? 0);
  const rating = Number(player?.lastMatchRating ?? 6.5);
  const role = player?.contract?.squadRole ?? defaultSquadRole(player);

  // Squad protection: never discard a player if the squad is already thin.
  const squadFloor =
    context.transferListed === true
      ? SQUAD_MANAGEMENT_RULES.minimumReplacementSquadSize
      : SQUAD_MANAGEMENT_RULES.criticalSquadSize;
  const shortOfFloor = squadSize <= squadFloor;

  // Financial reality: can the club still afford him for another season?
  const expectedRenewalWage = Math.max(
    wage,
    estimateWeeklyWage(player, club) * 1.05,
  );
  const canAfford = wageBill + (expectedRenewalWage - wage) <= wageBudget;

  // Important starter with room in the budget: renew, always.
  const starterQualityGap = overall - (46 + prestige * 0.22);
  const isImportantStarter =
    starterQualityGap >= -4 &&
    (role === "Star Player" ||
      role === "Key Player" ||
      role === "Important Player" ||
      role === "Regular Starter");

  if (!shortOfFloor) {
    // Declining veterans the club can afford to let go.
    const declining =
      age >= 31 &&
      overall <= 74 &&
      potential - overall <= 2 &&
      positionalDepth > 2;
    if (declining && rng.chance(0.55)) {
      return {
        action: "release",
        reason: \`${player.first ?? "Player"} is ${age} and the club will not renew a declining squad player.\`,
        expectedWage: expectedRenewalWage,
      };
    }
    // Fringe players on wages the club would rather spend elsewhere.
    const expensiveFringe =
      (role === "Fringe Player" || role === "Squad Rotation") &&
      wage > estimateWeeklyWage(player, club) * 1.25 &&
      positionalDepth > 1;
    if (expensiveFringe && rng.chance(0.4)) {
      return {
        action: "transfer-list",
        reason: \`${player.first ?? "Player"} is transfer-listed: his wages no longer match his squad role.\`,
        expectedWage: expectedRenewalWage,
      };
    }
  }

  if (isImportantStarter && (canAfford || shortOfFloor)) {
    return {
      action: "renew",
      reason: \`${player.first ?? "Player"} remains an important player at ${age}.\`,
      expectedWage: expectedRenewalWage,
    };
  }

  // High-potential youngsters are cheap to keep and rarely sold.
  if (age <= 23 && potential >= overall + 4) {
    if (canAfford || shortOfFloor) {
      return {
        action: "renew",
        reason: \`${player.first ?? "Player"} is a prospect worth developing.\`,
        expectedWage: expectedRenewalWage,
      };
    }
  }

  // Good enough for the squad, affordable: renew quietly.
  if (canAfford && positionalDepth <= 3 && starterQualityGap >= -8) {
    return {
      action: "renew",
      reason: \`${player.first ?? "Player"} provides usable depth.\`,
      expectedWage: expectedRenewalWage,
    };
  }

  // Goalkeepers are always protected – a club without two keepers is broken.
  if (isGoalkeeper && positionalDepth <= 1) {
    return {
      action: "renew",
      reason: \`Goalkeeper cover must be retained.\`,
      expectedWage: expectedRenewalWage,
    };
  }

  if (shortOfFloor) {
    return {
      action: "renew",
      reason: \`The squad is too small to lose anyone.\`,
      expectedWage: expectedRenewalWage,
    };
  }

  // Default: not financially or technically justified – let him go.
  return {
    action: rng.chance(0.35) ? "transfer-list" : "release",
    reason: \`${player.first ?? "Player"} does not justify a renewal on footballing or financial grounds.\`,
    expectedWage: expectedRenewalWage,
  };
}`;
const newStr = `export function aiContractDecision(player, club, context = {}) {
  const rng = context.rng ?? Math.random;
  const day = Number(context.currentDay ?? 0);
  const overall = Number(player?.overall ?? 55);
  const potential = Number(player?.potential ?? overall);
  const age = Number(player?.age ?? context.ageOfPlayer ?? 25);
  const wage = Number(player?.contract?.weeklyWage ?? 0);
  const prestige = Number(club?.prestige ?? 50);
  const finance = club?.finances ?? {};
  const wageBudget = Number(finance.wageBudget ?? club?.wageBudget ?? 0);
  const wageBill = Number(context.wageBill ?? 0);
  const squadSize = Number(context.squadSize ?? 0);
  const positionalDepth = Number(context.positionalDepth ?? 2);
  const isGoalkeeper = normalizePosition(player?.position) === "GK";
  const apps = Number(player?.stats?.apps ?? 0);
  const rating = Number(player?.lastMatchRating ?? 6.5);
  const role = player?.contract?.squadRole ?? defaultSquadRole(player);
  
  // Manager personality influence
  const manager = club?.manager;
  const personality = manager?.personality ?? [];
  const riskTolerance = manager?.riskTolerance ?? 0.5;
  const ambition = manager?.ambition ?? 0.6;
  const youthBias = manager?.youthBias ?? 0.5;
  const transferPhilosophy = manager?.transferPhilosophy ?? "";
  
  // Squad protection: never discard a player if the squad is already thin.
  const squadFloor =
    context.transferListed === true
      ? SQUAD_MANAGEMENT_RULES.minimumReplacementSquadSize
      : SQUAD_MANAGEMENT_RULES.criticalSquadSize;
  const shortOfFloor = squadSize <= squadFloor;
  
  // Financial reality: can the club still afford him for another season?
  const expectedRenewalWage = Math.max(
    wage,
    estimateWeeklyWage(player, club) * 1.05,
  );
  const canAfford = wageBill + (expectedRenewalWage - wage) <= wageBudget;
  
  // Important starter with room in the budget: renew, always.
  const starterQualityGap = overall - (46 + prestige * 0.22);
  const isImportantStarter =
    starterQualityGap >= -4 &&
    (role === "Star Player" ||
      role === "Key Player" ||
      role === "Important Player" ||
      role === "Regular Starter");
  
  // Personality modifiers
  const isRiskTaker = personality.includes("Risk-Taker");
  const isPragmatic = personality.includes("Pragmatic");
  const isAmbitious = personality.includes("Ambitious");
  const isYouthDeveloper = personality.includes("Youth Developer");
  const isDefensive = personality.includes("Defensive Strategist") || personality.includes("Defensive");
  const isDisciplined = personality.includes("Disciplined");
  const isPatient = personality.includes("Patient");
  const isExperiencedSpecialist = personality.includes("Experienced-Player Specialist");
  
  if (!shortOfFloor) {
    // Declining veterans the club can afford to let go.
    // Pragmatic and risk-taking managers more likely to release declining players
    const declining =
      age >= 31 &&
      overall <= 74 &&
      potential - overall <= 2 &&
      positionalDepth > 2;
    if (declining) {
      const releaseChance = 0.4 + (isPragmatic ? 0.15 : 0) + (isRiskTaker ? 0.1 : 0) - (isPatient ? 0.1 : 0);
      if (rng.chance(clamp(releaseChance, 0.1, 0.8))) {
        return {
          action: "release",
          reason: \`${player.first ?? "Player"} is ${age} and the club will not renew a declining squad player.\`,
          expectedWage: expectedRenewalWage,
        };
      }
    }
    // Fringe players on wages the club would rather spend elsewhere.
    // Disciplined managers more likely to transfer-list expensive fringe players
    const expensiveFringe =
      (role === "Fringe Player" || role === "Squad Rotation") &&
      wage > estimateWeeklyWage(player, club) * 1.25 &&
      positionalDepth > 1;
    if (expensiveFringe) {
      const transferListChance = 0.3 + (isDisciplined ? 0.2 : 0) + (isRiskTaker ? 0.1 : 0);
      if (rng.chance(clamp(transferListChance, 0.1, 0.7))) {
        return {
          action: "transfer-list",
          reason: \`${player.first ?? "Player"} is transfer-listed: his wages no longer match his squad role.\`,
          expectedWage: expectedRenewalWage,
        };
      }
    }
  }
  
  if (isImportantStarter && (canAfford || shortOfFloor)) {
    return {
      action: "renew",
      reason: \`${player.first ?? "Player"} remains an important player at ${age}.\`,
      expectedWage: expectedRenewalWage,
    };
  }
  
  // High-potential youngsters are cheap to keep and rarely sold.
  // Ambitious and youth-developer managers prioritize young prospects
  if (age <= 23 && potential >= overall + 4) {
    const renewChance = 0.7 + (isAmbitious ? 0.15 : 0) + (isYouthDeveloper ? 0.2 : 0) - (isExperiencedSpecialist ? 0.1 : 0);
    if (canAfford || shortOfFloor || rng.chance(clamp(renewChance, 0.5, 0.95))) {
      return {
        action: "renew",
        reason: \`${player.first ?? "Player"} is a prospect worth developing.\`,
        expectedWage: expectedRenewalWage,
      };
    }
  }
  
  // Good enough for the squad, affordable: renew quietly.
  // Patient managers more likely to keep depth
  if (canAfford && positionalDepth <= 3 && starterQualityGap >= -8) {
    const renewChance = 0.6 + (isPatient ? 0.2 : 0);
    if (rng.chance(clamp(renewChance, 0.4, 0.9))) {
      return {
        action: "renew",
        reason: \`${player.first ?? "Player"} provides usable depth.\`,
        expectedWage: expectedRenewalWage,
      };
    }
  }
  
  // Goalkeepers are always protected – a club without two keepers is broken.
  if (isGoalkeeper && positionalDepth <= 1) {
    return {
      action: "renew",
      reason: \`Goalkeeper cover must be retained.\`,
      expectedWage: expectedRenewalWage,
    };
  }
  
  if (shortOfFloor) {
    return {
      action: "renew",
      reason: \`The squad is too small to lose anyone.\`,
      expectedWage: expectedRenewalWage,
    };
  }
  
  // Default: not financially or technically justified – let him go.
  // Pragmatic and disciplined managers more likely to release
  const releaseChance = 0.25 + (isPragmatic ? 0.15 : 0) + (isDisciplined ? 0.1 : 0) - (isAmbitious ? 0.1 : 0) - (isPatient ? 0.1 : 0);
  return {
    action: rng.chance(clamp(releaseChance, 0.1, 0.5)) ? "transfer-list" : "release",
    reason: \`${player.first ?? "Player"} does not justify a renewal on footballing or financial grounds.\`,
    expectedWage: expectedRenewalWage,
  };
}`;
const result = content.replace(oldStr, newStr);
if (result === content) {
  console.log('NOT FOUND');
} else {
  console.log('FOUND and replaced');
  fs.writeFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/core/contracts.mjs', result);
}