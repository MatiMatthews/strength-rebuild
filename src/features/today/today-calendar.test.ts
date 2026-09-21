import { generateCycleSequence } from '@/domain/prescriptions/generator';
import type { TodayData } from '@/application/programs/program-service';
import { todayCalendar } from './today-calendar';

it('uses the local date and persisted schedule without advancing the pending session', () => {
  const cycle = generateCycleSequence([{ id: 'calendar', type: 'strength', weeks: 2, schedule: [1, 3, 5] }])[0]!;
  const data: TodayData = { cycleId: cycle.id, cycleType: cycle.type, cycle, weekIndex: 1, dayIndex: 1, session: cycle.weeks[0]!.sessions[0]! };
  const original = JSON.stringify(data);
  expect(todayCalendar(data, new Date(2026, 8, 20, 23))).toEqual(expect.objectContaining({ restDay: true, status: 'Hoy: descanso', nextSession: 'Próxima sesión: Lunes' }));
  expect(todayCalendar(data, new Date(2026, 8, 21, 0))).toEqual(expect.objectContaining({ restDay: false, status: 'Día de entrenamiento' }));
  expect(todayCalendar(data, new Date(2026, 8, 20, 23)).date).toContain('20 de septiembre');
  expect(JSON.stringify(data)).toBe(original);
});

it('does not invent a rest day for a legacy plan without weekdays', () => {
  expect(todayCalendar(null, new Date(2026, 8, 20)).restDay).toBe(false);
});
