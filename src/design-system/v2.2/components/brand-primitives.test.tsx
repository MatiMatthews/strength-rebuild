import { fireEvent, render } from '@testing-library/react-native';
import { ArrowRight } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';

import {
  AppMasthead,
  BrandBand,
  BrandMark,
  CycleProgressBand,
  ExerciseRunSheetRow,
  MetricStrip,
  Ordinal,
  StatusActionBand,
} from './brand-primitives';

describe('V2.2 structural brand primitives', () => {
  it('uses compact, fixed-size typography for long operational titles', async () => {
    const screen = await render(<><AppMasthead title="HOY" /><AppMasthead title="ENTRENAMIENTO" context="GUARDADO AUTOMATICO" /></>);

    expect(StyleSheet.flatten(screen.getByText('HOY').props.style).fontSize).toBe(44);
    expect(StyleSheet.flatten(screen.getByText('ENTRENAMIENTO').props.style).fontSize).toBe(22);
    expect(StyleSheet.flatten(screen.getByLabelText('ENTRENAMIENTO · GUARDADO AUTOMATICO').props.style).minWidth).toBe(0);
  });

  it('uses full-width structural bands and constrained inner content', async () => {
    const screen = await render(<BrandBand testID="band"><Text>Contenido</Text></BrandBand>);
    expect(StyleSheet.flatten(screen.getByTestId('band').props.style).width).toBe('100%');
    expect(StyleSheet.flatten(screen.getByTestId('brand-band-content').props.style).maxWidth).toBe(800);
  });

  it('exposes brand, ordinal, metrics, and progress semantics', async () => {
    const screen = await render(<><BrandMark /><Ordinal value={2} /><MetricStrip metrics={[{ label: 'Series', value: '4' }]} /><CycleProgressBand current={2} total={4} /></>);
    expect(screen.getByLabelText('Strength Rebuild')).toBeTruthy();
    expect(screen.getByLabelText('Ejercicio 2')).toBeTruthy();
    expect(screen.getByText('Series')).toBeTruthy();
    expect(screen.getByLabelText('Semana 2 de 4')).toHaveAccessibilityValue({ min: 1, max: 4, now: 2 });
  });

  it('keeps status and row commands accessible and at least 48 dp', async () => {
    const onPress = jest.fn();
    const screen = await render(<><StatusActionBand title="Listo" actionLabel="Continuar" onAction={onPress} /><ExerciseRunSheetRow ordinal={1} name="Sentadilla" detail="4 × 6" actionLabel="Abrir Sentadilla" icon={ArrowRight} onPress={onPress} /></>);
    for (const control of screen.getAllByRole('button')) expect(StyleSheet.flatten(control.props.style).minHeight).toBeGreaterThanOrEqual(48);
    fireEvent.press(screen.getByLabelText('Abrir Sentadilla'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes status detail text as an explicit native accessibility label', async () => {
    const screen = await render(<StatusActionBand title="Estado del respaldo" detail="Respaldo listo para copiar y guardar." actionLabel="Listo" onAction={() => undefined} />);

    expect(screen.getByLabelText('Respaldo listo para copiar y guardar.')).toBeTruthy();
  });
});
