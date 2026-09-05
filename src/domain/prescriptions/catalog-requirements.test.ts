import { generatePrescription } from './generator';
import { exerciseCatalog } from '../../data/seeds/exercises';

const request = { id: 'catalog-plan', type: 'strength' as const, weeks: 1 };
const requestedExercise = (kind: 'EXACT' | 'PATTERN' | 'CAPABILITY', value: string, equipment?: string[], restrictions?: string[]) => {
  const snapshot = generatePrescription({ ...request, ...(equipment ? { equipment } : {}), ...(restrictions ? { restrictions } : {}), requirements: [{ kind, value }] });
  const blocks = snapshot.weeks[0]!.sessions[0]!.blocks!;
  return blocks.find(({ role }) => role === (kind === 'EXACT' ? 'primary' : 'core'))!.exercises.at(-1)!;
};

describe('catalog requirements consumed by prescription generation', () => {
  it.each([
    ['EXACT', 'barbell-bench-press', 'barbell-bench-press'],
    ['PATTERN', 'horizontal-push', 'barbell-bench-press'],
    ['CAPABILITY', 'power', 'low-volume-jump'],
    ['PATTERN', 'Empuje horizontal', 'barbell-bench-press'],
    ['CAPABILITY', 'Potencia de tren inferior', 'low-volume-jump'],
  ] as const)('resolves %s %s to a catalog exercise', (kind, value, id) => {
    expect(requestedExercise(kind, value).exerciseId).toBe(id);
    expect(requestedExercise(kind, value)).toEqual(requestedExercise(kind, value));
  });

  it('uses catalog demand instead of downgrading requested exercise safety', () => {
    const generated = requestedExercise('EXACT', 'smith-box-squat');
    const catalog = exerciseCatalog.find(({ id }) => id === generated.exerciseId)!;
    expect(generated.braceDemand).toBe(catalog.braceDemand);
    expect(generated.lumbarDemand).toBe(catalog.lumbarDemand);
  });

  it.each(['strength', 'power', 'reentry'] as const)('retains catalog safety demands for every default %s exercise', (type) => {
    const snapshot = generatePrescription({ ...request, type });
    for (const session of snapshot.weeks[0]!.sessions) {
      for (const generated of session.exercises) {
        const catalog = exerciseCatalog.find(({ id }) => id === generated.exerciseId)!;
        expect({ id: generated.exerciseId, brace: generated.braceDemand, lumbar: generated.lumbarDemand })
          .toEqual({ id: catalog.id, brace: catalog.braceDemand, lumbar: catalog.lumbarDemand });
      }
    }
  });

  it('filters pattern candidates by equipment, including explicit saved aliases', () => {
    expect(requestedExercise('PATTERN', 'horizontal-push', ['dumbbells', 'incline-bench']).exerciseId).toBe('incline-dumbbell-press');
    expect(requestedExercise('EXACT', 'barbell-bench-press', ['Barra', 'Banco']).exerciseId).toBe('barbell-bench-press');
  });

  it.each([
    ['EXACT', 'Sentadilla con barra', undefined, undefined],
    ['EXACT', 'barbell-bench-press', ['bodyweight'], undefined],
    ['PATTERN', 'horizontal-push', ['bodyweight'], undefined],
    ['CAPABILITY', 'power', undefined, ['sin impacto']],
    ['EXACT', 'smith-box-squat', undefined, ['lumbar']],
    ['EXACT', 'barbell-bench-press', undefined, ['abdominal']],
    ['CAPABILITY', 'unknown', undefined, undefined],
    ['EXACT', 'session-review', undefined, undefined],
  ] as const)('rejects unsatisfied %s %s without inventing an ID', (kind, value, equipment, restrictions) => {
    expect(() => requestedExercise(kind, value, equipment ? [...equipment] : undefined, restrictions ? [...restrictions] : undefined)).toThrow(/Requisito 1/);
  });
});
