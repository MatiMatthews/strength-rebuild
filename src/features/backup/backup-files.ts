import type { BackupFiles } from "./backup-file-types";

const unavailable = async (): Promise<never> => {
  throw new Error(
    "El selector de archivos no está disponible en esta plataforma.",
  );
};
export const backupFiles: BackupFiles = {
  pick: unavailable,
  save: unavailable,
};
