import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ReadinessGate } from './ReadinessGate';

describe('ReadinessGate', () => {
  it('presents ruled, scalable radio rows and a reachable terminal command', async () => {
    const onReady = jest.fn();
    const screen = await render(<ReadinessGate visible onClose={jest.fn()} onReady={onReady} />);
    const stable = screen.getByRole('radio', { name: 'Dolor de 0 a 2, estable' });
    expect(StyleSheet.flatten(stable.props.style)).toMatchObject({ minHeight: 56, borderBottomWidth: 1 });
    expect(stable.props.accessibilityState.checked).toBe(false);

    await fireEvent.press(stable);
    expect(screen.getByLabelText('Confirmar preparación')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Confirmar preparación'));
    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ pain: 1, painTrend: 'stable' }));
  });

  it.each([
    'Dolor sobre 4, creciente o señal de alerta',
    'Hormigueo, adormecimiento, pérdida de fuerza o señal neurológica',
  ])('keeps the stop path %s visible and unable to continue', async (label) => {
    const onDecision = jest.fn();
    const screen = await render(<ReadinessGate visible onClose={jest.fn()} onDecision={onDecision} onReady={jest.fn()} />);
    await fireEvent.press(screen.getByRole('radio', { name: label }));
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Confirmar preparación')).toBeNull();
    expect(onDecision).toHaveBeenCalledTimes(1);
  });
});
