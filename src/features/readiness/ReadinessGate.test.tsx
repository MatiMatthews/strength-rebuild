import { act, fireEvent, render } from '@testing-library/react-native';
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

it('does not confirm or replace an in-flight selection and retries a failed save', async () => {
 let reject!: (error: Error) => void;
 const onDecision = jest.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
 const onReady = jest.fn();
 const screen = await render(<ReadinessGate visible onClose={jest.fn()} onDecision={onDecision} onReady={onReady} />);
 await fireEvent.press(screen.getByRole('radio', {name:'Dolor de 0 a 2, estable'}));
 expect(screen.queryByLabelText('Confirmar preparación')).toBeNull();
 await fireEvent.press(screen.getByRole('radio', {name:'Dolor de 3 a 4 o técnica alterada'}));
 expect(onDecision).toHaveBeenCalledTimes(1);
 await act(async () => reject(new Error('disk')));
 expect(screen.getByText('No se pudo guardar la preparación. Tu selección se conserva; reintenta.')).toBeOnTheScreen();
 expect(onReady).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByRole('button',{name:'Reintentar guardar preparación'}));
 await fireEvent.press(screen.getByLabelText('Confirmar preparación'));
 expect(onReady).toHaveBeenCalledWith(expect.objectContaining({pain:1}));
});

it('shows legacy stopped evidence without inventing symptoms or offering clearance', async () => {
 const screen = await render(<ReadinessGate visible savedDecision={{policyVersion:'safety-v2.1',sessionPlanId:'planned',decidedAt:'2026-09-05T10:00:00Z',affectedPattern:'lumbar',appliedChanges:['Patrón lumbar retirado por hoy'],disposition:'STOP_PATTERN',sessionStatus:'PATTERN_STOPPED',reviewRequired:false}} onClose={jest.fn()} onReady={jest.fn()} />);
 expect(screen.getByText(/No se conserva la entrada original/)).toBeOnTheScreen();
 expect(screen.queryByText(/Dolor registrado/)).toBeNull();
 expect(screen.queryByLabelText('Confirmar preparación')).toBeNull();
 expect(screen.queryByRole('radio')).toBeNull();
});
