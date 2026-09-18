import { fireEvent, render } from '@testing-library/react-native';
import * as native from 'react-native';
import { StyleSheet } from 'react-native';
import * as current from './v2.2/primitives';
import * as compatible from './primitives';
import { ChoiceControl, TrainingField } from './v2.2/components/brand-primitives';
import { darkTheme, lightTheme } from './v2.2/tokens';
function contrast(a: string, b: string) {
  const luminance = (hex: string) => { const c = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722; };
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
for (const scheme of ['light', 'dark'] as const) describe(`${scheme} field states`, () => {
  beforeEach(() => jest.spyOn(native, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => jest.restoreAllMocks());
  const theme = scheme === 'light' ? lightTheme : darkTheme;
  for (const { TextField } of [current, compatible]) it.each([false, true])('field boundary, placeholder and validation are visible; error=%s', async invalid => {
    const screen = await render(<TextField label="Carga" value="60," {...(invalid ? { error: 'Escribe un número completo' } : {})} />);
    const input = screen.getByLabelText('Carga'), style = StyleSheet.flatten(input.props.style);
    expect(contrast(style.borderColor, style.backgroundColor)).toBeGreaterThanOrEqual(3);
    expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(input.props.placeholderTextColor, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    if (invalid) expect(contrast(StyleSheet.flatten(screen.getByText('Escribe un número completo').props.style).color, theme.canvas)).toBeGreaterThanOrEqual(4.5);
  });
  it('training instrument keeps its boundary visible and preserves the input draft across a theme change', async () => {
    const change = jest.fn(); const screen = await render(<TrainingField label="Carga" unit="kg" value="60," onChangeText={change} />);
    const input = screen.getByLabelText('Carga');
    const instrument = input.parent!;
    const style = StyleSheet.flatten(instrument.props.style);
    expect(contrast(style.borderColor, style.backgroundColor ?? theme.canvas)).toBeGreaterThanOrEqual(3);
    await fireEvent.changeText(input, '60,5'); expect(change).toHaveBeenCalledWith('60,5');
  });
  it.each([false, true])('choice marker and label are visible when selected=%s', async selected => {
    const press = jest.fn(); const screen = await render(<ChoiceControl label="Elegir" selected={selected} onPress={press} />);
    const radio = screen.getByRole('radio'), style = StyleSheet.flatten(radio.props.style);
    const mark = radio.children.find(child => typeof child !== 'string')!;
    expect(contrast(style.borderBottomColor ?? style.borderColor, style.backgroundColor ?? theme.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(StyleSheet.flatten((mark as typeof radio).props.style).borderColor, style.backgroundColor ?? theme.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(StyleSheet.flatten(screen.getByText('Elegir').props.style).color, style.backgroundColor ?? theme.canvas)).toBeGreaterThanOrEqual(4.5);
    await fireEvent.press(radio); expect(press).toHaveBeenCalledTimes(1);
  });
});
for (const scheme of ['light', 'dark'] as const) describe(`${scheme} unavailable choices`, () => {
  beforeEach(() => jest.spyOn(native, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => jest.restoreAllMocks());
  it.each([false,true])('busy choice preserves checked=%s and rejects repeated presses',async selected=>{
    const press=jest.fn();const screen=await render(<ChoiceControl busy label="Estado" selected={selected} onPress={press}/>);
    const control=screen.getByRole('radio'),style=StyleSheet.flatten(control.props.style);
    expect(control.props.accessibilityState).toMatchObject({checked:selected,disabled:true,busy:true});
    expect(contrast(StyleSheet.flatten(screen.getByText('Estado').props.style).color,style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    await fireEvent.press(control);await fireEvent.press(control);expect(press).not.toHaveBeenCalled();
  });
  it('pressed choice does not wash out the marker or change its selection',async()=>{
    const screen=await render(<ChoiceControl label="Estado" selected onPress={()=>undefined}/>);
    const control=screen.getByRole('radio');await fireEvent(control,'pressIn');const style=StyleSheet.flatten(control.props.style);
    expect(style.opacity??1).toBe(1);expect(control.props.accessibilityState.checked).toBe(true);
    expect(contrast(StyleSheet.flatten(screen.getByText('Estado').props.style).color,style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
});
