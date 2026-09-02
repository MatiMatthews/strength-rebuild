import type { SeedExercise } from '../../data/seeds/exercises';

type Requirement =
  | { readonly type: 'EXACT'; readonly value: string }
  | { readonly type: 'PATTERN'; readonly value: string }
  | { readonly type: 'CAPABILITY'; readonly value: string };
export type ReplacementReason = 'equipment-unavailable' | 'discomfort' | 'boredom' | 'skill-mismatch' | 'other';
type Demand = 'low' | 'moderate' | 'high';
type Impact = 'none' | 'low' | 'moderate' | 'high';
type Skill = 'beginner' | 'intermediate' | 'advanced';

export interface SubstitutionRequest {
  readonly originalExerciseId: string;
  readonly requirement: Requirement;
  readonly reason: ReplacementReason | null;
  readonly availableEquipment: readonly string[];
  readonly skillLevel: Skill;
  readonly restrictions: {
    readonly maxImpact: Impact;
    readonly maxBraceDemand: Demand;
    readonly maxLumbarDemand: Demand;
  };
  readonly recentExerciseIds: readonly string[];
  readonly preferredExerciseIds: readonly string[];
  readonly approvedEquivalentIds?: readonly string[];
}

export interface RankedSubstitution {
  readonly exercise: SeedExercise;
  readonly score: number;
  readonly explanations: readonly string[];
}

const demandRank: Readonly<Record<Demand, number>> = { low: 0, moderate: 1, high: 2 };
const impactRank: Readonly<Record<Impact, number>> = { none: 0, low: 1, moderate: 2, high: 3 };
const skillRank: Readonly<Record<Skill, number>> = { beginner: 0, intermediate: 1, advanced: 2 };

function fulfillsRequirement(exercise: SeedExercise, request: SubstitutionRequest): boolean {
  const { requirement } = request;
  if (requirement.type === 'EXACT') {
    return request.reason !== null && (request.approvedEquivalentIds ?? []).includes(exercise.id);
  }
  if (requirement.type === 'PATTERN') return exercise.pattern === requirement.value;
  return exercise.tags.includes(requirement.value);
}

function passesHardFilters(exercise: SeedExercise, request: SubstitutionRequest): boolean {
  const equipment = new Set(request.availableEquipment);
  return exercise.id !== request.originalExerciseId
    && fulfillsRequirement(exercise, request)
    && exercise.equipment.every((item) => equipment.has(item))
    && skillRank[exercise.skill] <= skillRank[request.skillLevel]
    && impactRank[exercise.impact] <= impactRank[request.restrictions.maxImpact]
    && demandRank[exercise.braceDemand] <= demandRank[request.restrictions.maxBraceDemand]
    && demandRank[exercise.lumbarDemand] <= demandRank[request.restrictions.maxLumbarDemand];
}

export function rankSubstitutions(
  catalog: readonly SeedExercise[],
  request: SubstitutionRequest,
): readonly RankedSubstitution[] {
  const original = catalog.find((exercise) => exercise.id === request.originalExerciseId);
  if (!original) return [];

  return catalog
    .filter((exercise) => passesHardFilters(exercise, request))
    .map((exercise): RankedSubstitution => {
      const sharedTags = exercise.tags.filter((tag) => original.tags.includes(tag)).sort();
      const patternMatch = exercise.pattern === original.pattern;
      const preferred = request.preferredExerciseIds.includes(exercise.id);
      const recent = request.recentExerciseIds.includes(exercise.id);
      const explanations = [
        ...(patternMatch ? [`Matches ${original.pattern}`] : []),
        ...(sharedTags.length > 0 ? [`Shares ${sharedTags.join(', ')} stimulus`] : []),
        ...(preferred ? ['Matches your saved preference'] : []),
        ...(recent ? ['Ranked lower because it was used recently'] : []),
      ];
      return {
        exercise,
        score: (patternMatch ? 40 : 0) + sharedTags.length * 15 + (preferred ? 8 : 0) - (recent ? 25 : 0),
        explanations: explanations.length > 0 ? explanations : [`Fulfills ${request.requirement.type.toLowerCase()} requirement`],
      };
    })
    .sort((left, right) => right.score - left.score || left.exercise.id.localeCompare(right.exercise.id))
    .slice(0, 3);
}
