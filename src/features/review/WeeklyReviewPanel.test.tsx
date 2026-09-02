import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { WeeklyReviewService } from '../../application/progression/weekly-review';
import { WeeklyReviewPanel } from './WeeklyReviewPanel';

describe('WeeklyReviewPanel', () => {
  it('explains a proposal and requires explicit acceptance or rejection', async () => {
    const reviews = {
      propose: jest.fn().mockResolvedValue({ id: 'p1', cycleId: 'c1', weekIndex: 1, nextWeekIndex: 2, outcome: 'restricted', action: 'hold', explanation: 'Restricción activa.' }),
      decide: jest.fn().mockResolvedValue(undefined),
    } as unknown as WeeklyReviewService;
    const view = await render(<WeeklyReviewPanel cycleId="c1" nextWeekIndex={2} reviews={reviews} />);
    await fireEvent.press(view.getByLabelText('Restringida'));
    await fireEvent.press(view.getByLabelText('Crear propuesta semanal'));
    expect(await view.findByText('Restricción activa.')).toBeTruthy();
    expect(reviews.decide).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('Rechazar propuesta semanal'));
    await waitFor(() => expect(reviews.decide).toHaveBeenCalledWith('p1', false));
    expect(view.getByText('Propuesta rechazada. El plan quedó sin cambios.')).toBeTruthy();
  });
});
