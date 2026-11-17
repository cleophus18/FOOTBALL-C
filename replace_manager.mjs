import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/model/club.mjs', 'utf8');
const oldStr = `export class Manager {
  constructor(spec = {}) {
    this.id = spec.id ?? \`mgr_\${Math.random().toString(36).slice(2, 9)}\`;
    this.name = spec.name ?? "Unknown Manager";
    this.nationality = spec.nationality ?? "ENG";
    this.style = MANAGER_STYLES[spec.style] ? spec.style : "Balanced";
    this.formation = spec.formation ?? "4-3-3";
    this.rating = clamp(spec.rating ?? 60, 1, 99);
    this.age = spec.age ?? 48;
    /**
     * How much the manager likes each player, keyed by player id, 0..100.
     * This is the hidden number behind "the manager trusts you". Squad selection reads
     * it directly, so a player can be visibly better than his rival and still be benched.
     */
    this.trust = {};
    /** Season objectives set by the board; drives manager pressure. */
    this.expectation = spec.expectation ?? "mid-table";
    this.pressure = 0;
    this.trophies = 0;
    /** Coaching bias 0..1: how much this coach favours youth over experience. */
    this.youthBias = clamp(spec.youthBias ?? (this.style === "Youth" ? 0.8 : 0.5), 0, 1);
  }

  /** Tactical multipliers for this manager's preferred setup. */
  get tactics() {
    return MANAGER_STYLES[this.style] ?? MANAGER_STYLES.Balanced;
  }

  /** The shapes this coach will consider, best-fit first. */
  get preferredFormations() {
    return COACH_STYLE_FORMATIONS[this.style] ?? COACH_STYLE_FORMATIONS.Balanced;
  }

  /**
   * Pick the formation this coach will actually use, given the players available.
   * He walks his preferred shapes and scores each by how many of its slots his squad
   * can fill with natural specialists, then keeps the best. A defensive coach will
   * still play four at the back if he has no third centre-back, which is realistic.
   */
  chooseFormation(players, dayIndex = 0) {
    const squad = players.filter((p) => !!p.position);
    if (!squad.length) return this.formation;
    const fitFor = (name) => {
      const shape = FORMATIONS[name];
      if (!shape) return -Infinity;
      const sel = selectLineup(squad, name, dayIndex);
      let fit = 0;
      for (const { slot, player } of sel.xi) {
        const natural = groupOf(player.position) === groupOf(slot);
        fit += natural ? 2 : -1;
        if (player.position === slot) fit += 1;
      }
      // A small bias so the coach's first choice wins ties.
      return fit + Math.max(0, 6 - this.preferredFormations.indexOf(name)) * 0.25;
    };
    let best = this.formation;
    let bestFit = -Infinity;
    for (const name of this.preferredFormations) {
      const fit = fitFor(name);
      if (fit > bestFit) {
        bestFit = fit;
        best = name;
      }
    }
    return best;
  }

  trustOf(playerId, fallback = 50) {
    return this.trust?.[playerId] ?? fallback;
  }

  /** Move a player's trust toward a target, respecting the manager's patience. */
  adjustTrust(playerId, delta) {
    const cur = this.trustOf(playerId);
    this.trust ??= {};
    this.trust[playerId] = clamp(cur + delta, 0, 100);
  }
}

`;
const newStr = `export class Manager {
  constructor(spec = {}) {
    this.id = spec.id ?? \`mgr_\${Math.random().toString(36).slice(2, 9)}\`;
    this.name = spec.name ?? "Unknown Manager";
    this.nationality = spec.nationality ?? "ENG";
    this.style = MANAGER_STYLES[spec.style] ? spec.style : "Balanced";
    this.formation = spec.formation ?? "4-3-3";
    this.rating = clamp(spec.rating ?? 60, 1, 99);
    this.age = spec.age ?? 48;
    /**
     * How much the manager likes each player, keyed by player id, 0..100.
     * This is the hidden number behind "the manager trusts you". Squad selection reads
     * it directly, so a player can be visibly better than his rival and still be benched.
     */
    this.trust = {};
    /** Season objectives set by the board; drives manager pressure. */
    this.expectation = spec.expectation ?? "mid-table";
    this.pressure = 0;
    this.trophies = 0;
    /** Coaching bias 0..1: how much this coach favours youth over experience. */
    this.youthBias = clamp(spec.youthBias ?? (this.style === "Youth" ? 0.8 : 0.5), 0, 1);
    
    // Personality system
    this.personality = spec.personality ?? this.generatePersonality(this.style);
    this.tacticalPhilosophy = spec.tacticalPhilosophy ?? this.getTacticalPhilosophy(this.style);
    this.transferPhilosophy = spec.transferPhilosophy ?? this.getTransferPhilosophy(this.style);
    this.riskTolerance = spec.riskTolerance ?? this.getRiskTolerance(this.style);
    this.tacticalFlexibility = spec.tacticalFlexibility ?? this.getTacticalFlexibility(this.style);
    this.squadRotationPreference = spec.squadRotationPreference ?? this.getSquadRotationPreference(this.style);
    this.ambition = spec.ambition ?? this.getAmbition(this.style);
    
    // Career statistics
    this.careerStats = spec.careerStats ?? {
      wins: 0,
      draws: 0,
      losses: 0,
      trophies: 0,
      seasonsManaged: 0,
      playerDevelopmentScore: 0,
      transferEfficiency: 0,
      boardConfidence: 50,
    };
    
    // Contract and employment
    this.contract = spec.contract ?? {
      yearsRemaining: 2,
      expirySeason: 0,
      wage: 0,
    };
    this.previousClubs = spec.previousClubs ?? [];
  }
  
  /** Generate a personality profile based on the manager's style. */
  generatePersonality(style) {
    const baseTraits = {
      "Possession": ["Possession Specialist", "Patient", "Technical"],
      "Counterattacking": ["Counterattacking Specialist", "Pragmatic", "Risk-Taker"],
      "High Press": ["High-Press Specialist", "Demanding", "Attacking"],
      "Defensive": ["Defensive Strategist", "Disciplined", "Pragmatic"],
      "Youth": ["Youth Developer", "Patient", "Ambitious"],
      "Attacking": ["Attacking", "Risk-Taker", "Possession Specialist"],
      "Pragmatic": ["Pragmatic", "Defensive Strategist", "Experienced-Player Specialist"],
      "Balanced": ["Tactical Genius", "Patient", "Ambitious"],
    };
    const traits = baseTraits[style] ?? baseTraits.Balanced;
    // Add some variation - each manager gets 2-4 traits
    const allTraits = [
      "Ambitious", "Pragmatic", "Tactical Genius", "Defensive", "Attacking",
      "Youth Developer", "Disciplined", "Demanding", "Patient", "Risk-Taker",
      "Possession Specialist", "Counterattacking Specialist", "High-Press Specialist",
      "Experienced-Player Specialist"
    ];
    const selected = [...traits];
    // Add 0-2 additional random traits
    const extraCount = Math.floor(Math.random() * 3);
    for (let i = 0; i < extraCount; i++) {
      const randomTrait = allTraits[Math.floor(Math.random() * allTraits.length)];
      if (!selected.includes(randomTrait)) {
        selected.push(randomTrait);
      }
    }
    return selected;
  }
  
  getTacticalPhilosophy(style) {
    const philosophies = {
      "Possession": "Control the game through ball retention and structured build-up play",
      "Counterattacking": "Absorb pressure and strike quickly on the break",
      "High Press": "Disrupt the opponent high up the pitch and force errors",
      "Defensive": "Prioritize defensive solidity and organization",
      "Youth": "Develop young talent and integrate academy players",
      "Attacking": "Play forward aggressively and create numerous chances",
      "Pragmatic": "Adapt to the opponent and prioritize results over style",
      "Balanced": "Flexible approach balancing attack and defense",
    };
    return philosophies[style] ?? philosophies.Balanced;
  }
  
  getTransferPhilosophy(style) {
    const philosophies = {
      "Possession": "Target technically gifted players who fit a possession system",
      "Counterattacking": "Seek pacey, direct players for quick transitions",
      "High Press": "Prioritize high-work-rate players suited to pressing",
      "Defensive": "Focus on experienced defenders and reliable goalkeepers",
      "Youth": "Invest in high-potential youngsters and academy graduates",
      "Attacking": "Sign creative attackers and goalscorers",
      "Pragmatic": "Buy proven performers who fit immediate needs",
      "Balanced": "Balanced recruitment across all positions and profiles",
    };
    return philosophies[style] ?? philosophies.Balanced;
  }
  
  getRiskTolerance(style) {
    const risks = {
      "Possession": 0.4,
      "Counterattacking": 0.7,
      "High Press": 0.6,
      "Defensive": 0.2,
      "Youth": 0.5,
      "Attacking": 0.7,
      "Pragmatic": 0.3,
      "Balanced": 0.5,
    };
    return risks[style] ?? 0.5;
  }
  
  getTacticalFlexibility(style) {
    const flexibility = {
      "Possession": 0.3,
      "Counterattacking": 0.6,
      "High Press": 0.4,
      "Defensive": 0.3,
      "Youth": 0.5,
      "Attacking": 0.5,
      "Pragmatic": 0.8,
      "Balanced": 0.6,
    };
    return flexibility[style] ?? 0.5;
  }
  
  getSquadRotationPreference(style) {
    const rotation = {
      "Possession": 0.4,
      "Counterattacking": 0.5,
      "High Press": 0.6,
      "Defensive": 0.3,
      "Youth": 0.6,
      "Attacking": 0.4,
      "Pragmatic": 0.5,
      "Balanced": 0.5,
    };
    return rotation[style] ?? 0.5;
  }
  
  getAmbition(style) {
    const ambition = {
      "Possession": 0.7,
      "Counterattacking": 0.6,
      "High Press": 0.7,
      "Defensive": 0.5,
      "Youth": 0.8,
      "Attacking": 0.8,
      "Pragmatic": 0.6,
      "Balanced": 0.7,
    };
    return ambition[style] ?? 0.6;
  }
  
  /** Tactical multipliers for this manager's preferred setup. */
  get tactics() {
    return MANAGER_STYLES[this.style] ?? MANAGER_STYLES.Balanced;
  }
  
  /** The shapes this coach will consider, best-fit first. */
  get preferredFormations() {
    return COACH_STYLE_FORMATIONS[this.style] ?? COACH_STYLE_FORMATIONS.Balanced;
  }
  
  /**
   * Pick the formation this coach will actually use, given the players available.
   * He walks his preferred shapes and scores each by how many of its slots his squad
   * can fill with natural specialists, then keeps the best. A defensive coach will
   * still play four at the back if he has no third centre-back, which is realistic.
   */
  chooseFormation(players, dayIndex = 0) {
    const squad = players.filter((p) => !!p.position);
    if (!squad.length) return this.formation;
    const fitFor = (name) => {
      const shape = FORMATIONS[name];
      if (!shape) return -Infinity;
      const sel = selectLineup(squad, name, dayIndex);
      let fit = 0;
      for (const { slot, player } of sel.xi) {
        const natural = groupOf(player.position) === groupOf(slot);
        fit += natural ? 2 : -1;
        if (player.position === slot) fit += 1;
      }
      // A small bias so the coach's first choice wins ties.
      return fit + Math.max(0, 6 - this.preferredFormations.indexOf(name)) * 0.25;
    };
    let best = this.formation;
    let bestFit = -Infinity;
    for (const name of this.preferredFormations) {
      const fit = fitFor(name);
      if (fit > bestFit) {
        bestFit = fit;
        best = name;
      }
    }
    return best;
  }
  
  trustOf(playerId, fallback = 50) {
    return this.trust?.[playerId] ?? fallback;
  }
  
  /** Move a player's trust toward a target, respecting the manager's patience. */
  adjustTrust(playerId, delta) {
    const cur = this.trustOf(playerId);
    this.trust ??= {};
    this.trust[playerId] = clamp(cur + delta, 0, 100);
  }
  
  /** Record a match result for career statistics. */
  recordResult(result) {
    if (result === "win") this.careerStats.wins++;
    else if (result === "draw") this.careerStats.draws++;
    else if (result === "loss") this.careerStats.losses++;
  }
  
  /** Get win percentage. */
  get winPercentage() {
    const total = this.careerStats.wins + this.careerStats.draws + this.careerStats.losses;
    return total > 0 ? (this.careerStats.wins / total) * 100 : 0;
  }
  
  /** Add a trophy to the cabinet. */
  addTrophy() {
    this.trophies++;
    this.careerStats.trophies++;
  }
  
  /** Update board confidence based on recent results. */
  updateBoardConfidence(recentResults, expectationMet) {
    let confidence = this.careerStats.boardConfidence;
    const wins = recentResults.filter(r => r === "win").length;
    const losses = recentResults.filter(r => r === "loss").length;
    confidence += (wins - losses) * 3;
    if (expectationMet) confidence += 5;
    else confidence -= 5;
    this.careerStats.boardConfidence = clamp(confidence, 0, 100);
    return this.careerStats.boardConfidence;
  }
  
  /** Check if manager is at risk of dismissal. */
  isAtRisk() {
    return this.careerStats.boardConfidence < 25;
  }
}

`;
const result = content.replace(oldStr, newStr);
if (result === content) {
  console.log('NOT FOUND');
} else {
  console.log('FOUND and replaced');
  fs.writeFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/model/club.mjs', result);
}