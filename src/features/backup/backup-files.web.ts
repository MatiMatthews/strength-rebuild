import {
  encryptedFileContent,
  MAX_BACKUP_FILE_BYTES,
  type BackupFiles,
} from "./backup-file-types";

export const backupFiles: BackupFiles = {
  pick() {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".srb,.txt,.json,application/octet-stream";
      input.hidden = true;
      const clean = () => input.remove();
      input.oncancel = () => {
        clean();
        resolve(null);
      };
      input.onchange = async () => {
        try {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          if (file.size > MAX_BACKUP_FILE_BYTES)
            throw new Error("El archivo supera el límite seguro de 4 MB.");
          resolve({ name: file.name, content: await file.text() });
        } catch (error) {
          reject(error);
        } finally {
          clean();
        }
      };
      document.body.append(input);
      input.click();
    });
  },
  async save(content, filename) {
    const url = URL.createObjectURL(
      new Blob([encryptedFileContent(content)], {
        type: "application/octet-stream",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "downloaded";
  },
};
