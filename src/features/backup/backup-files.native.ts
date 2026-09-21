import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  encryptedFileContent,
  MAX_BACKUP_FILE_BYTES,
  type BackupFiles,
} from "./backup-file-types";

export const backupFiles: BackupFiles = {
  async pick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) throw new Error("No se seleccionó un archivo.");
    try {
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (!info.exists || info.isDirectory)
        throw new Error("No se pudo abrir el archivo.");
      if (Math.max(asset.size ?? 0, info.size) > MAX_BACKUP_FILE_BYTES)
        throw new Error("El archivo supera el límite seguro de 4 MB.");
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (content.length > MAX_BACKUP_FILE_BYTES)
        throw new Error("El archivo supera el límite seguro de 4 MB.");
      return { name: asset.name, content };
    } finally {
      if (
        FileSystem.cacheDirectory &&
        asset.uri.startsWith(FileSystem.cacheDirectory)
      )
        await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(
          () => undefined,
        );
    }
  },
  async save(content, filename) {
    encryptedFileContent(content);
    if (Platform.OS !== "android")
      throw new Error("El guardado de archivos está disponible en Android.");
    const access =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!access.granted) return "cancelled";
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(
      access.directoryUri,
      filename,
      "application/octet-stream",
    );
    try {
      await FileSystem.writeAsStringAsync(uri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (error) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
        () => undefined,
      );
      throw error;
    }
    return "saved";
  },
};
