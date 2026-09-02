import { fireEvent, render } from '@testing-library/react-native';

import { DataFailureScreen } from './DataFailureScreen';

it('explains a local database failure and offers an accessible retry', async () => {
  const retry = jest.fn();
  const screen = await render(<DataFailureScreen onRetry={retry} />);

  expect(screen.getByTestId('data-failure-recovery-band')).toBeTruthy();
  expect(screen.getByRole('alert').props.children).toContain('Tus datos siguen en este dispositivo');
  fireEvent.press(screen.getByRole('button', { name: 'Reintentar apertura de datos' }));
  expect(retry).toHaveBeenCalledTimes(1);
});
