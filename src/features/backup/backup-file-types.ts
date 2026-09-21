import { BACKUP_LIMITS } from "@/application/export";

export const MAX_BACKUP_FILE_BYTES = BACKUP_LIMITS.maxInputBytes;
export interface BackupFiles {
  pick(): Promise<{ name: string; content: string } | null>;
  save(
    content: string,
    filename: string,
  ): Promise<"saved" | "downloaded" | "cancelled">;
}

export function backupFilename(date = new Date()) {
  return `strength-rebuild-${date.toISOString().slice(0, 19).replaceAll(":", "-")}.srb`;
}

export function encryptedFileContent(content: string) {
  if (!content.startsWith("SRB2."))
    throw new Error("Solo se puede guardar un respaldo cifrado.");
  if (content.length > MAX_BACKUP_FILE_BYTES)
    throw new Error("El archivo supera el límite seguro de 4 MB.");
  return content;
}
