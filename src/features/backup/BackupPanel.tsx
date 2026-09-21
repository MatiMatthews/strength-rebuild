import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Download, FolderOpen, ChevronDown, X } from "lucide-react-native";

import {
  classifyPortableBackup,
  type BackupService,
} from "@/application/export";
import {
  ActionButton,
  AppText,
  TextField,
  FeedbackBanner,
  IconButton,
} from "@/design-system/v2.2/primitives";
import { OperationalSection } from "@/design-system/v2.2/components";
import {
  spacing,
  borders,
  palette,
  spacing as brandSpacing,
} from "@/design-system/v2.2/tokens";
import { backupFiles } from "./backup-files";
import { backupFilename, type BackupFiles } from "./backup-file-types";

// Keep editable text comfortably below Android's Binder transaction ceiling:
// accessibility services copy the native TextInput value into every event.
export const NATIVE_BACKUP_EDITOR_LIMIT = 4 * 1024;

function isCompressedBackupTransport(document: string) {
  return (
    document.includes('"encoding":"lzw18-base64"') ||
    document.includes('"encoding":"lzw12-base64"') ||
    document.includes('"encoding":"lzw24-base64"')
  );
}

export function backupEditorValue(document: string) {
  return document.length <= NATIVE_BACKUP_EDITOR_LIMIT &&
    !isCompressedBackupTransport(document)
    ? document
    : "";
}

export function backupEditorChange(document: string, editorValue: string) {
  return (document.length > NATIVE_BACKUP_EDITOR_LIMIT ||
    isCompressedBackupTransport(document)) &&
    editorValue === ""
    ? document
    : editorValue;
}

export function backupDisplayPreview(document: string) {
  return document.length <= 160 ? document : `${document.slice(0, 160)}…`;
}

export function backupNativeDisplayValue(document: string) {
  return backupDisplayPreview(document);
}

export function BackupPanel({
  scenario,
  service,
  files = backupFiles,
}: {
  scenario?: "backup-valid" | "backup-corrupt" | undefined;
  service: BackupService;
  files?: BackupFiles;
}) {
  const [document, setDocument] = useState("");
  const [filename, setFilename] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const [preview, setPreview] = useState<{
    records: number;
    conflicts: number;
  } | null>(null);
  const [secret, setSecret] = useState("");
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [messageDanger, setMessageDanger] = useState(false);
  const inputKind = document
    ? (() => {
        try {
          return classifyPortableBackup(document).kind;
        } catch {
          return null;
        }
      })()
    : null;
  const fail = (error: unknown, fallback: string) => {
    setMessageDanger(true);
    setMessage(error instanceof Error ? error.message : fallback);
  };
  const previewMessage = (value: string) =>
    classifyPortableBackup(value).kind === "legacy"
      ? "Respaldo heredado válido, sin autenticación. Revisa su origen y los conflictos antes de restaurar."
      : "Respaldo autenticado y válido. Revisa los conflictos antes de restaurar.";
  const importFile = () =>
    run(async () => {
      try {
        const selected = await files.pick();
        if (!selected) {
          setMessageDanger(false);
          setMessage("Selección cancelada. Tus datos no cambiaron.");
          return;
        }
        setDocument(selected.content);
        setFilename(selected.name);
        setPreview(null);
        setLegacyConfirmed(false);
        setPreview(await service.previewPortable(selected.content, secret));
        setMessageDanger(false);
        setMessage(previewMessage(selected.content));
      } catch (error) {
        setPreview(null);
        fail(error, "No se pudo abrir el archivo. Tus datos no cambiaron.");
      }
    });
  const saveFile = () =>
    run(async () => {
      try {
        const name = backupFilename();
        const result = await files.save(document, name);
        if (result !== "cancelled") setFilename(name);
        setMessageDanger(false);
        setMessage(
          result === "cancelled"
            ? "Guardado cancelado. El respaldo sigue disponible en esta pantalla."
            : result === "downloaded"
              ? `Descarga iniciada: ${name}`
              : `Archivo cifrado guardado: ${name}`,
        );
      } catch (error) {
        fail(
          error,
          "No se pudo guardar el archivo. Puedes volver a intentarlo.",
        );
      }
    });
  const inspect = () =>
    run(async () => {
      try {
        setPreview(await service.previewPortable(document, secret));
        setMessageDanger(false);
        setMessage(previewMessage(document));
      } catch (error) {
        setPreview(null);
        setMessageDanger(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo leer el respaldo.",
        );
      }
    });
  const restore = () =>
    run(async () => {
      try {
        await service.restorePortable(document, {
          secret,
          legacyConfirmed,
          replaceConfirmed: true,
        });
        setMessageDanger(false);
        setMessage("Respaldo restaurado de forma atómica.");
        setPreview(null);
        setSecret("");
      } catch (error) {
        setMessageDanger(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo restaurar. La base local no cambió.",
        );
      }
    });
  useEffect(() => {
    if (!scenario) return;
    void (async () => {
      const exported =
        scenario === "backup-valid"
          ? (JSON.parse(await service.export()) as Record<string, unknown>)
          : null;
      if (exported) exported.exportedAt = "2026-08-27T00:00:00.000Z";
      const nextDocument = exported ? JSON.stringify(exported, null, 2) : "{}";
      setDocument(nextDocument);
      try {
        setPreview(await service.previewPortable(nextDocument));
        setMessageDanger(false);
        setMessage(
          "Respaldo válido. Revisa los conflictos antes de restaurar.",
        );
      } catch (error) {
        setPreview(null);
        setMessageDanger(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo leer el respaldo.",
        );
      }
    })();
  }, [scenario, service]);
  return (
    <View testID="backup-operational-tools" style={styles.tools}>
      <OperationalSection label="RESPALDO LOCAL">
        <View style={styles.fields}>
          <AppText color="muted">
            Archivo cifrado, sin conexión. La contraseña no se guarda; la
            necesitarás para recuperar tus datos.
          </AppText>
          <TextField
            editable={!busy}
            accessibilityLabel="Contraseña portátil del respaldo"
            label="Contraseña del respaldo"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            onChangeText={(value) => {
              setSecret(value);
              setPreview(null);
            }}
            value={secret}
          />
          <ActionButton
            icon={Download}
            busy={busy}
            accessibilityLabel="Exportar respaldo cifrado"
            onPress={() => {
              void run(async () => {
                try {
                  const exported = await service.exportEncrypted(secret);
                  setPreview(null);
                  setLegacyConfirmed(false);
                  setFilename(backupFilename());
                  setMessage(
                    "Respaldo cifrado y autenticado listo para guardar.",
                  );
                  setMessageDanger(false);
                  setDocument(exported);
                } catch (error) {
                  fail(error, "No se pudo cifrar el respaldo.");
                }
              });
            }}
          >
            Crear respaldo cifrado
          </ActionButton>
          <ActionButton
            icon={FolderOpen}
            busy={busy}
            accessibilityLabel="Importar archivo de respaldo"
            onPress={() => {
              void importFile();
            }}
            tone="secondary"
          >
            Abrir archivo
          </ActionButton>
          {filename ? <AppText variant="bodyStrong">{filename}</AppText> : null}
          {document.startsWith("SRB2.") ? (
            <ActionButton
              icon={Download}
              busy={busy}
              accessibilityLabel="Guardar archivo cifrado"
              onPress={() => {
                void saveFile();
              }}
            >
              Guardar archivo
            </ActionButton>
          ) : null}
          <ActionButton
            icon={ChevronDown}
            disabled={busy}
            accessibilityLabel={
              advanced
                ? "Ocultar importación avanzada"
                : "Mostrar importación avanzada"
            }
            tone="secondary"
            onPress={() => setAdvanced((value) => !value)}
          >
            Importación avanzada
          </ActionButton>
          {advanced ? (
            <>
              {document.length > NATIVE_BACKUP_EDITOR_LIMIT ||
              isCompressedBackupTransport(document) ? (
                <AppText color="muted" numberOfLines={1}>
                  {backupNativeDisplayValue(document)}
                </AppText>
              ) : null}
              <TextField
                editable={!busy}
                accessibilityLabel="Documento JSON de respaldo"
                label="Documento heredado o texto cifrado"
                multiline
                numberOfLines={5}
                selectTextOnFocus
                showSoftInputOnFocus={false}
                autoComplete="off"
                autoCorrect={false}
                spellCheck={false}
                keyboardType="visible-password"
                onChangeText={(value) => {
                  setDocument((current) => backupEditorChange(current, value));
                  setPreview(null);
                  setFilename("");
                  setLegacyConfirmed(false);
                }}
                value={backupEditorValue(document)}
              />
            </>
          ) : null}
          {inputKind === "legacy" ? (
            <View style={{ gap: spacing.sm }}>
              <AppText color="danger" variant="bodyStrong">
                Respaldo heredado sin cifrado ni autenticación
              </AppText>
              <AppText color="muted">
                Continúa solo si reconoces el origen. La compresión no protege
                los datos.
              </AppText>
              <ActionButton
                busy={busy}
                accessibilityLabel="Confirmar respaldo heredado sin protección"
                onPress={() => setLegacyConfirmed(true)}
                tone="secondary"
              >
                {legacyConfirmed
                  ? "Riesgo heredado comprendido"
                  : "Entiendo y deseo revisar"}
              </ActionButton>
            </View>
          ) : null}
          <ActionButton
            busy={busy}
            disabled={!document}
            accessibilityLabel="Revisar respaldo antes de restaurar"
            onPress={() => {
              void inspect();
            }}
            tone="secondary"
          >
            Revisar respaldo
          </ActionButton>
          {preview ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="bodyStrong">
                {preview.records} registros · {preview.conflicts} conflictos
              </AppText>
              <AppText color="muted">
                Restaurar reemplazará los datos locales actuales. Esta acción
                requiere confirmación explícita.
              </AppText>
              <ActionButton
                busy={busy}
                accessibilityLabel="Confirmar restauración del respaldo"
                onPress={() => {
                  void restore();
                }}
              >
                Confirmar y restaurar
              </ActionButton>
            </View>
          ) : null}
          {busy ? (
            <AppText accessibilityRole="alert">Procesando respaldo…</AppText>
          ) : null}
          {message ? (
            <View style={{ gap: spacing.sm }}>
              <FeedbackBanner
                message={message}
                tone={messageDanger ? "danger" : "success"}
              />
              <IconButton
                accessibilityLabel="Descartar mensaje de respaldo"
                disabled={busy}
                icon={X}
                onPress={() => setMessage("")}
              />
            </View>
          ) : null}
        </View>
      </OperationalSection>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md, paddingTop: spacing.md },
  sectionBand: {
    backgroundColor: palette.ink,
    paddingHorizontal: brandSpacing.lg,
    paddingVertical: brandSpacing.md,
  },
  sectionBandText: { color: palette.paper },
  tools: {
    borderBottomColor: palette.line,
    borderBottomWidth: borders.emphasis,
    borderTopColor: palette.line,
    borderTopWidth: borders.emphasis,
    gap: brandSpacing.lg,
    paddingBottom: brandSpacing.lg,
  },
});
