import {
  backupFilename,
  encryptedFileContent,
  MAX_BACKUP_FILE_BYTES,
} from "./backup-file-types";

it("uses a portable dated filename without personal identity", () => {
  expect(backupFilename(new Date("2026-09-20T12:34:56.000Z"))).toBe(
    "strength-rebuild-2026-09-20T12-34-56.srb",
  );
});

it("refuses plaintext and oversized exports before touching a file", () => {
  expect(() => encryptedFileContent('{"tables":{}}')).toThrow(/cifrado/);
  expect(() =>
    encryptedFileContent("SRB2." + "x".repeat(MAX_BACKUP_FILE_BYTES)),
  ).toThrow(/límite/);
  expect(encryptedFileContent("SRB2.metadata.ciphertext")).toBe(
    "SRB2.metadata.ciphertext",
  );
});
