import { exerciseCatalog, type SeedExercise } from '../../data/seeds/exercises';
import type { CyclePrescriptionRequest } from './generator';

const equipmentAliases: Readonly<Record<string, string>> = {
  Barra: 'barbell', Mancuernas: 'dumbbells', Banco: 'bench', Bandas: 'bands',
};
const requirementAliases: Readonly<Record<string, string>> = {
  'PATTERN:Empuje horizontal': 'horizontal-push',
  'CAPABILITY:Potencia de tren inferior': 'power',
};

export class CatalogRequirementError extends Error {
  constructor(readonly requirementIndex: number, kind: string, value: string) {
    super(`Requisito ${requirementIndex + 1} (${kind}: ${value}): elige una opción del catálogo compatible con tu equipo y restricciones.`);
  }
}

/** Resolve user requirements before any plan writes; exact requests never substitute. */
export function resolveCatalogRequirements(request: CyclePrescriptionRequest): readonly SeedExercise[] {
  const compatible = catalogCompatibility(request);
  return (request.requirements ?? []).map(({ kind, value }, index) => {
    const normalized = requirementAliases[`${kind}:${value.trim()}`] ?? value.trim();
    const candidates = exerciseCatalog.filter((exercise) => {
      if (exercise.pattern === 'review') return false;
      const matches = kind === 'EXACT' ? exercise.id === normalized
        : kind === 'PATTERN' ? exercise.pattern === normalized : exercise.tags.includes(normalized);
      return matches
        && compatible(exercise);
    }).sort((left, right) => left.id.localeCompare(right.id));
    if (!candidates.length) {
      throw new CatalogRequirementError(index, kind, value);
    }
    return candidates[0]!;
  });
}

/** Shared constraints for requested exercises and generated defaults. */
export function catalogCompatibility(request: CyclePrescriptionRequest): (exercise: SeedExercise) => boolean {
  const equipment = request.equipment && new Set(['bodyweight', ...request.equipment.map((item) => equipmentAliases[item] ?? item)]);
  const input = request.restrictions;
  const restrictions: readonly string[] = Array.isArray(input) ? input
    : Object.entries(input ?? {}).filter(([, enabled]) => enabled).map(([key]) => key);
  return (exercise) => {
    return (!equipment || exercise.equipment.every((item) => equipment.has(item)))
        && restrictions.every((restriction) => {
          if (restriction === 'sin impacto') return exercise.impact === 'none';
          if (restriction === 'lumbar') return exercise.lumbarDemand === 'low';
          if (restriction === 'abdominal') return exercise.braceDemand === 'low';
          // Free text cannot safely be interpreted as a supported restriction.
          return false;
        });
  };
}
