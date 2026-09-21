import { savedAlternatives } from './saved-alternatives';
import { defaultSettings } from '../settings/settings';
import type { WorkoutHistoryItem } from '@/application/workouts/workout-service';

it('uses the saved technical level, defaulting conservatively when it is unknown', () => {
  const settings = { ...defaultSettings, equipment: ['barbell', 'bench', 'dumbbells', 'incline-bench'] };
  expect(savedAlternatives('incline-dumbbell-press', 'PATTERN', 'other', settings)).toEqual([]);
  expect(savedAlternatives('incline-dumbbell-press', 'PATTERN', 'other', { ...settings, skillLevel: 'intermediate' }).map(item => item.exercise.id)).toEqual(['barbell-bench-press']);
});

it('ranks explicit preferences and recent completed history without counting pending exercises', () => {
  const settings = { ...defaultSettings, equipment: ['bodyweight', 'bands'], requirements: [{ kind: 'EXACT' as const, value: 'pallof-press' }] };
  const history = [{ id: 'recent', completedAt: '2026-09-20T12:00:00Z', prescribed: { dayIndex: 1, exercises: [] }, actual: { id: 'recent', safetyModifications: [], exercises: [{ exerciseId: 'pallof-press', originalExerciseId: 'pallof-press', requirement: 'CAPABILITY', sets: [{ load: '', reps: '8', rir: '3', pain: 0, technique: 'Limpia', notes: '', completed: true, skipped: false, disposition: 'COMPLETED' }] }] } }] as WorkoutHistoryItem[];
  expect(savedAlternatives('dead-bug', 'CAPABILITY', 'boredom', settings)[0]!.exercise.id).toBe('pallof-press');
  const ranked = savedAlternatives('dead-bug', 'CAPABILITY', 'boredom', settings, history);
  expect(ranked[0]!.exercise.id).toBe('bird-dog');
  expect(ranked.find(item => item.exercise.id === 'pallof-press')!.explanations).toContain('Ranked lower because it was used recently');
  history[0]!.actual.exercises[0]!.sets[0]!.disposition = 'PENDING';
  expect(savedAlternatives('dead-bug', 'CAPABILITY', 'boredom', settings, history)[0]!.exercise.id).toBe('pallof-press');
});
