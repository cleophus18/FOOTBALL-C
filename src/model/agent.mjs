import { clamp } from "../core/util.mjs";

export class Agent {
  constructor(spec = {}) {
    this.id = spec.id ?? `agent-${Math.random().toString(36).slice(2, 9)}`;
    this.name = spec.name ?? "Agent";
    this.specialty = spec.specialty ?? "General";
    this.rating = clamp(Number(spec.rating) || 70, 1, 99);
    this.fee = clamp(Number(spec.fee) || 100000, 0, 50_000_000);
    this.reputation = clamp(Number(spec.reputation) || 60, 1, 99);
    this.knownFor = spec.knownFor ?? "Transfer negotiations";
    this.preferredClubs = Array.isArray(spec.preferredClubs) ? [...spec.preferredClubs] : [];
  }

  get quality() {
    return clamp(Math.round(this.rating * 0.7 + this.reputation * 0.3), 1, 99);
  }
}

export function createAgent(spec = {}) {
  return new Agent(spec);
}
