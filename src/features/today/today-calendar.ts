import type { TodayData } from '@/application/programs/program-service';

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const names: Record<string, string> = { monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo' };

export function todayCalendar(data: TodayData | null, now: Date) {
  const schedule = data?.cycle.weeks.find(week => week.index === data.weekIndex)?.sessions.flatMap(session => session.day ? [session.day] : []) ?? [];
  const restDay = schedule.length > 0 && !schedule.includes(weekdays[now.getDay()] as typeof schedule[number]);
  return {
    date: now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
    restDay,
    status: restDay ? 'Hoy: descanso' : schedule.length ? 'Día de entrenamiento' : 'Próxima sesión',
    nextSession: data?.session.day ? `Próxima sesión: ${names[data.session.day]}` : 'Próxima sesión pendiente',
  };
}
