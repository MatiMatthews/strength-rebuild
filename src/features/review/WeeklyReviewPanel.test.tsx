import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { WeeklyReviewService } from '../../application/progression/weekly-review';
import { WeeklyReviewPanel } from './WeeklyReviewPanel';

describe('WeeklyReviewPanel', () => {
  it('explains a proposal and requires explicit acceptance or rejection', async () => {
    const reviews = {
      load: jest.fn().mockResolvedValue(null),
      propose: jest.fn().mockResolvedValue({ id: 'p1', cycleId: 'c1', weekIndex: 1, nextWeekIndex: 2, outcome: 'restricted', action: 'hold', explanation: 'Restricción activa.' }),
      decide: jest.fn().mockResolvedValue(undefined),
    } as unknown as WeeklyReviewService;
    const view = await render(<WeeklyReviewPanel cycleId="c1" nextWeekIndex={2} reviews={reviews} />);
    await view.findByLabelText('Restringida');
    await fireEvent.press(view.getByLabelText('Restringida'));
    await fireEvent.press(view.getByLabelText('Crear propuesta semanal'));
    expect(await view.findByText('Restricción activa.')).toBeTruthy();
    expect(reviews.decide).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('Rechazar propuesta semanal'));
    await waitFor(() => expect(reviews.decide).toHaveBeenCalledWith('p1', 'REJECTED'));
    expect(view.getByText('Revisión guardada. Cargas y repeticiones sin cambios. La preparación de seguridad sigue vigente.')).toBeTruthy();
  });
});

it('rehydrates a saved result, preserves it after a failed write', async () => {
  const reviews = {
    load: jest.fn().mockResolvedValue({ id: 'saved', cycleId: 'cycle', weekIndex: 2, nextWeekIndex: 3, outcome: 'missed', action: 'reduce', explanation: 'Resultado persistido.' }),
    propose: jest.fn(), decide: jest.fn().mockRejectedValue(new Error('No se pudo guardar')),
  } as unknown as WeeklyReviewService;
  const view = await render(<WeeklyReviewPanel cycleId="cycle" nextWeekIndex={3} reviews={reviews} />);
  expect(await view.findByText('Resultado persistido.')).toBeTruthy();
  expect(view.queryByLabelText('Crear propuesta semanal')).toBeNull();
  await fireEvent.press(view.getByLabelText('Mantener plan semanal'));
  expect(await view.findByText('No se pudo guardar')).toBeTruthy();
  expect(view.getByText('Resultado persistido.')).toBeTruthy();
  expect(reviews.propose).not.toHaveBeenCalled();
});
