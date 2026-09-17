import { exerciseCatalog, type SeedExercise } from '../../data/seeds/exercises';
import type { CyclePrescriptionRequest } from './generator';

import { catalogEquipment, normalizeEquipment, normalizeRequirement, restrictionLabels } from './catalog-options';

export class CatalogConstraintError extends Error {}

export class CatalogRequirementError extends Error {
  constructor(readonly requirementIndex: number, kind: string, value: string) {
    super(`Requisito ${requirementIndex + 1} (${kind}: ${value}): elige una opción del catálogo compatible con tu equipo y restricciones.`);
  }
}

/** Resolve user requirements before any plan writes; exact requests never substitute. */
export function resolveCatalogRequirements(request: CyclePrescriptionRequest): readonly SeedExercise[] {
  validateCatalogConstraints(request);
  const compatible = catalogCompatibility(request);
  return (request.requirements ?? []).map(({ kind, value }, index) => {
    if (!['EXACT', 'PATTERN', 'CAPABILITY'].includes(kind)) throw new CatalogRequirementError(index, kind, value);
    const normalized = normalizeRequirement(kind, value);
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
  const equipment = request.equipment && new Set(['bodyweight', ...request.equipment.map(normalizeEquipment)]);
  const restrictions = restrictionValues(request);
  const unknownEquipment = request.equipment?.some(item => !catalogEquipment.includes(normalizeEquipment(item)));
  return (exercise) => {
    return !unknownEquipment && (!equipment || exercise.equipment.every((item) => equipment.has(item)))
        && restrictions.every((value) => {
          const restriction = value.trim().toLowerCase();
          if (restriction === 'sin impacto') return exercise.impact === 'none';
          if (restriction === 'lumbar') return exercise.lumbarDemand === 'low';
          if (restriction === 'abdominal') return exercise.braceDemand === 'low';
          // Free text cannot safely be interpreted as a supported restriction.
          return false;
        });
  };
}

function restrictionValues(request: CyclePrescriptionRequest): readonly string[] {
  const input = request.restrictions;
  return Array.isArray(input) ? input : Object.entries(input ?? {}).filter(([, enabled]) => enabled).map(([key]) => key);
}
function validateCatalogConstraints(request: CyclePrescriptionRequest) {
  const unknownEquipment = request.equipment?.filter(item => !catalogEquipment.includes(normalizeEquipment(item)));
  if (unknownEquipment?.length) throw new CatalogConstraintError(`Equipo no compatible: ${unknownEquipment.join(', ')}. Revisa las opciones guardadas y elige equipo del catálogo.`);
  const unknownRestrictions = restrictionValues(request).filter(value => !Object.hasOwn(restrictionLabels, value.trim().toLowerCase()));
  if (unknownRestrictions.length) throw new CatalogConstraintError(`Restricciones no compatibles: ${unknownRestrictions.join(', ')}. Revisa cada valor guardado antes de cambiarlo.`);
}
