import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { classifyPortableBackup, type BackupService } from '@/application/export';
import { encodeBackupForTransfer } from '../../../plugins/backup-transfer-runtime';
import { ActionButton, AppText, TextField } from '@/design-system/v2.2/primitives';
import { OperationalSection, StatusActionBand } from '@/design-system/v2.2/components';
import { spacing , borders, palette, spacing as brandSpacing } from '@/design-system/v2.2/tokens';

// Keep editable text comfortably below Android's Binder transaction ceiling:
// accessibility services copy the native TextInput value into every event.
export const NATIVE_BACKUP_EDITOR_LIMIT = 4 * 1024;

function isCompressedBackupTransport(document: string) {
  return document.includes('"encoding":"lzw18-base64"') || document.includes('"encoding":"lzw12-base64"') || document.includes('"encoding":"lzw24-base64"');
}

export function backupEditorValue(document: string) {
  return document.length <= NATIVE_BACKUP_EDITOR_LIMIT && !isCompressedBackupTransport(document) ? document : '';
}

export function backupEditorChange(document: string, editorValue: string) {
  return (document.length > NATIVE_BACKUP_EDITOR_LIMIT || isCompressedBackupTransport(document)) && editorValue === '' ? document : editorValue;
}

export function backupDisplayPreview(document: string) {
  return document.length <= 160 ? document : `${document.slice(0, 160)}…`;
}

export function backupNativeDisplayValue(document: string) {
  return backupDisplayPreview(document);
}

export function BackupPanel({ scenario, service }: { scenario?: 'backup-valid' | 'backup-corrupt' | undefined; service: BackupService }) {
  const [document, setDocument] = useState('');
  const [preview, setPreview] = useState<{ records: number; conflicts: number } | null>(null);
  const [secret, setSecret] = useState('');
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [messageDanger, setMessageDanger] = useState(false);
  const inputKind = document ? (() => { try { return classifyPortableBackup(document).kind; } catch { return null; } })() : null;
  const inspect = async () => { try { setPreview(await service.previewPortable(document, secret)); setMessageDanger(false); setMessage('Respaldo autenticado y válido. Revisa los conflictos antes de restaurar.'); } catch (error) { setPreview(null); setMessageDanger(true); setMessage(error instanceof Error ? error.message : 'No se pudo leer el respaldo.'); } };
  const restore = async () => { try { await service.restorePortable(document, { secret, legacyConfirmed, replaceConfirmed: true }); setMessageDanger(false); setMessage('Respaldo restaurado de forma atómica.'); setPreview(null); setSecret(''); } catch (error) { setMessageDanger(true); setMessage(error instanceof Error ? error.message : 'No se pudo restaurar. La base local no cambió.'); } };
  useEffect(() => {
    if (!scenario) return;
    void (async () => {
      const exported = scenario === 'backup-valid' ? JSON.parse(await service.export()) as Record<string, unknown> : null;
      if (exported) exported.exportedAt = '2026-08-27T00:00:00.000Z';
      const nextDocument = exported ? JSON.stringify(exported, null, 2) : '{}';
      setDocument(nextDocument);
          try { setPreview(await service.previewPortable(nextDocument)); setMessageDanger(false); setMessage('Respaldo válido. Revisa los conflictos antes de restaurar.'); }
      catch (error) { setPreview(null); setMessageDanger(true); setMessage(error instanceof Error ? error.message : 'No se pudo leer el respaldo.'); }
    })();
  }, [scenario, service]);
  return <View testID="backup-operational-tools" style={styles.tools}>
    <OperationalSection label="RESPALDO LOCAL">
    <AppText color="muted">Exporta un respaldo con cifrado autenticado o pega uno existente. La contraseña nunca se guarda y no usa red ni nube.</AppText>
    <TextField accessibilityLabel="Contraseña portátil del respaldo" label="Contraseña del respaldo" secureTextEntry autoCapitalize="none" autoComplete="off" autoCorrect={false} onChangeText={setSecret} value={secret} />
    <ActionButton accessibilityLabel="Exportar respaldo cifrado" onPress={async () => { try { const exported = await service.exportEncrypted(secret); setMessage('Respaldo cifrado y autenticado listo para guardar.'); setMessageDanger(false); if (Platform.OS === 'android') setTimeout(() => setDocument(encodeBackupForTransfer(exported)), 2_000); else setDocument(exported); } catch (error) { setMessageDanger(true); setMessage(error instanceof Error ? error.message : 'No se pudo cifrar el respaldo.'); } }}>Exportar respaldo cifrado</ActionButton>
    {document.length > NATIVE_BACKUP_EDITOR_LIMIT || isCompressedBackupTransport(document) ? <AppText color="muted" numberOfLines={1}>{backupNativeDisplayValue(document)}</AppText> : null}
    <TextField accessibilityLabel="Documento JSON de respaldo" label="Documento JSON" multiline numberOfLines={5} selectTextOnFocus showSoftInputOnFocus={false} autoComplete="off" autoCorrect={false} spellCheck={false} keyboardType="visible-password" onChangeText={(value) => { setDocument((current) => backupEditorChange(current, value)); setPreview(null); }} value={backupEditorValue(document)} />
    {document.length > NATIVE_BACKUP_EDITOR_LIMIT || isCompressedBackupTransport(document) ? <><AppText color="muted">El respaldo se conserva completo fuera del editor para proteger la estabilidad de este dispositivo. Compártelo o revisa el documento antes de restaurar.</AppText><ActionButton accessibilityLabel="Compartir respaldo completo" onPress={() => Share.share({ message: document, title: 'Respaldo Strength Rebuild' })} tone="secondary">Compartir respaldo</ActionButton></> : null}
    {inputKind === 'legacy' ? <View style={{ gap: spacing.sm }}><AppText color="danger" variant="bodyStrong">Respaldo heredado sin cifrado ni autenticación</AppText><AppText color="muted">Continúa solo si reconoces el origen. La compresión no protege los datos.</AppText><ActionButton accessibilityLabel="Confirmar respaldo heredado sin protección" onPress={() => setLegacyConfirmed(true)} tone="secondary">{legacyConfirmed ? 'Riesgo heredado comprendido' : 'Entiendo y deseo revisar'}</ActionButton></View> : null}
    <ActionButton accessibilityLabel="Revisar respaldo antes de restaurar" onPress={inspect} tone="secondary">Revisar respaldo</ActionButton>
    {preview ? <View style={{ gap: spacing.sm }}><AppText variant="bodyStrong">{preview.records} registros · {preview.conflicts} conflictos</AppText><AppText color="muted">Restaurar reemplazará los datos locales actuales. Esta acción requiere confirmación explícita.</AppText><ActionButton accessibilityLabel="Confirmar restauración del respaldo" onPress={restore}>Confirmar y restaurar</ActionButton></View> : null}
    {message ? <StatusActionBand actionLabel={messageDanger ? 'Revisar' : 'Listo'} detail={message} onAction={messageDanger ? inspect : () => undefined} title={messageDanger ? 'Respaldo inválido' : 'Estado del respaldo'} /> : null}
    </OperationalSection>
  </View>;
}

const styles = StyleSheet.create({ sectionBand: { backgroundColor: palette.ink, paddingHorizontal: brandSpacing.lg, paddingVertical: brandSpacing.md }, sectionBandText: { color: palette.paper }, tools: { borderBottomColor: palette.line, borderBottomWidth: borders.emphasis, borderTopColor: palette.line, borderTopWidth: borders.emphasis, gap: brandSpacing.lg, paddingBottom: brandSpacing.lg } });
