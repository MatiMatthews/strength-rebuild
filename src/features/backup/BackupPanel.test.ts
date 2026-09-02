import { BackupPanel, backupDisplayPreview, backupEditorChange, backupEditorValue, backupNativeDisplayValue, NATIVE_BACKUP_EDITOR_LIMIT } from './BackupPanel';

describe('BackupPanel native editor boundary', () => {
  it('keeps editable backup text below the Android accessibility Binder budget', () => {
    expect(NATIVE_BACKUP_EDITOR_LIMIT).toBeLessThanOrEqual(4 * 1024);
  });

  it('does not bind a multi-megabyte backup to the native text editor', () => {
    const oversizedBackup = `{"payload":"${'x'.repeat(NATIVE_BACKUP_EDITOR_LIMIT)}"}`;

    expect(backupEditorValue(oversizedBackup)).toBe('');
    expect(backupEditorValue('{"version":1}')).toBe('{"version":1}');
  });

  it('keeps a compact native backup available to clipboard round-trip', () => {
    const compactBackup = `{"schemaVersion":1,"payload":"${'x'.repeat(1024)}"}`;

    expect(backupEditorValue(compactBackup)).toHaveLength(compactBackup.length);
  });

  it('bounds the rendered payload without changing the full backup transport', () => {
    const oversizedBackup = `{"payload":"${'x'.repeat(NATIVE_BACKUP_EDITOR_LIMIT)}"}`;

    expect(backupDisplayPreview(oversizedBackup)).toBe(`${oversizedBackup.slice(0, 160)}…`);
    expect(backupDisplayPreview('{"version":1}')).toBe('{"version":1}');
  });

  it('ignores the native empty-value echo when a large export is kept out of the editor', () => {
    const exported = 'x'.repeat(NATIVE_BACKUP_EDITOR_LIMIT + 1);

    expect(backupEditorChange(exported, '')).toBe(exported);
    expect(backupEditorChange(exported, '{')).toBe('{');
  });

  it('keeps generated compressed transports out of the native editor regardless of size', () => {
    const transport = '{"schemaVersion":1,"encoding":"lzw12-base64","payload":"AA"}';

    expect(backupEditorValue(transport)).toBe('');
    expect(backupEditorChange(transport, '')).toBe(transport);
  });

  it('does not duplicate the full backup into accessibility metadata', () => {
    const source = BackupPanel.toString();

    expect(source).not.toContain('accessibilityLabel:document');
    expect(source).not.toContain('accessibilityLabel={document}');
    const transport = '{"schemaVersion":1,"payload":"' + 'x'.repeat(5000) + '"}';
    expect(backupNativeDisplayValue(transport)).toBe(backupDisplayPreview(transport));
    expect(backupNativeDisplayValue(transport)).toHaveLength(161);
    expect(backupNativeDisplayValue(transport)).toMatch(/^\{"schemaVersion":1/);
    expect(source.indexOf('backupNativeDisplayValue(document)')).toBeLessThan(source.indexOf('backupEditorValue(document)'));
  });

  it('uses authenticated export and requires an explicit legacy acknowledgement', () => {
    const source = BackupPanel.toString();
    expect(source).toContain('exportEncrypted');
    expect(source).toContain('restorePortable');
    expect(source).toContain('legacyConfirmed');
    expect(source).toContain('Respaldo heredado sin cifrado');
    expect(source).not.toContain('Exportar JSON');
  });

});
