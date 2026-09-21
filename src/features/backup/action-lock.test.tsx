import { Platform } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { BackupPanel } from './BackupPanel';
import type { BackupService } from '@/application/export';

it('prevents repeated backup writes, preserves failed input and allows one retry', async () => {
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const restore = jest.fn(() => new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; }));
  const service = { previewPortable: jest.fn().mockResolvedValue({ records: 1, conflicts: 0 }), restorePortable: restore } as unknown as BackupService;
  const view = await render(<BackupPanel service={service} />);
  await fireEvent.press(view.getByLabelText('Mostrar importación avanzada'));
  await fireEvent.changeText(view.getByLabelText('Documento JSON de respaldo'), '{"synthetic":true}');
  await fireEvent.changeText(view.getByLabelText('Contraseña portátil del respaldo'), 'synthetic-test-password');
  await fireEvent.press(view.getByLabelText('Revisar respaldo antes de restaurar'));
  await fireEvent.press(view.getByLabelText('Confirmar restauración del respaldo'));
  expect(view.getByLabelText('Confirmar restauración del respaldo').props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  await fireEvent.press(view.getByLabelText('Confirmar restauración del respaldo'));
  expect(restore).toHaveBeenCalledTimes(1);
  await act(async () => fail(new Error('Synthetic restore failure')));
  expect(view.getByLabelText('Documento JSON de respaldo').props.value).toBe('{"synthetic":true}');
  expect(view.getByLabelText('Contraseña portátil del respaldo').props.value).toBe('synthetic-test-password');
  await fireEvent.press(view.getByLabelText('Confirmar restauración del respaldo'));
  await act(async () => finish());
  expect(restore).toHaveBeenCalledTimes(2);
  expect(view.getByText('Respaldo restaurado de forma atómica.')).toBeTruthy();
});

it('previews the exact encrypted envelope on Android without treating it as a legacy table document', async () => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const envelope = JSON.stringify({ format: 'encrypted', ciphertext: 'synthetic'.repeat(600) });
  const preview = jest.fn().mockResolvedValue({ records: 1, conflicts: 0 });
  const service = { exportEncrypted: jest.fn().mockResolvedValue(envelope), previewPortable: preview } as unknown as BackupService;
  try {
    const view = await render(<BackupPanel service={service} />);
    await fireEvent.press(view.getByLabelText('Mostrar importación avanzada'));
    await fireEvent.press(view.getByLabelText('Exportar respaldo cifrado'));
    expect(view.getByText('Respaldo cifrado y autenticado listo para guardar.')).toBeTruthy();
    expect(view.getByLabelText('Documento JSON de respaldo').props.value).toBe('');
    await fireEvent.press(view.getByLabelText('Revisar respaldo antes de restaurar'));
    expect(preview).toHaveBeenCalledWith(envelope, '');
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: previous }); }
});
