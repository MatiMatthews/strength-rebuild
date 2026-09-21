import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { backupFiles } from "./backup-files.native";
import { MAX_BACKUP_FILE_BYTES } from "./backup-file-types";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { UTF8: "utf8" },
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(),
  },
}));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined);
});

it("cancelled import does not read a file and oversized cache copies are removed before content is read", async () => {
  jest
    .mocked(DocumentPicker.getDocumentAsync)
    .mockResolvedValueOnce({ canceled: true, assets: null });
  expect(await backupFiles.pick()).toBeNull();
  expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  jest
    .mocked(DocumentPicker.getDocumentAsync)
    .mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/oversized.srb",
          name: "oversized.srb",
          size: 1,
          lastModified: 0,
        },
      ],
    });
  jest
    .mocked(FileSystem.getInfoAsync)
    .mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: MAX_BACKUP_FILE_BYTES + 1,
      uri: "file:///cache/oversized.srb",
      modificationTime: 0,
    });
  await expect(backupFiles.pick()).rejects.toThrow(/límite/);
  expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    "file:///cache/oversized.srb",
    { idempotent: true },
  );
});

it("returns the complete selected envelope and removes only the temporary cache copy", async () => {
  jest
    .mocked(DocumentPicker.getDocumentAsync)
    .mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/backup.srb",
          name: "backup.srb",
          size: 20,
          lastModified: 0,
        },
      ],
    });
  jest
    .mocked(FileSystem.getInfoAsync)
    .mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 20,
      uri: "file:///cache/backup.srb",
      modificationTime: 0,
    });
  jest
    .mocked(FileSystem.readAsStringAsync)
    .mockResolvedValue("SRB2.meta.cipher");
  await expect(backupFiles.pick()).resolves.toEqual({
    name: "backup.srb",
    content: "SRB2.meta.cipher",
  });
  expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
    type: "*/*",
    multiple: false,
    copyToCacheDirectory: true,
  });
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    "file:///cache/backup.srb",
    { idempotent: true },
  );
});

it("Android save cancellation creates nothing; confirmation writes only ciphertext and removes failed partial files", async () => {
  const platform = Platform.OS;
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  });
  try {
    const saf = FileSystem.StorageAccessFramework;
    jest
      .mocked(saf.requestDirectoryPermissionsAsync)
      .mockResolvedValueOnce({ granted: false });
    expect(await backupFiles.save("SRB2.meta.cipher", "backup.srb")).toBe(
      "cancelled",
    );
    expect(saf.createFileAsync).not.toHaveBeenCalled();
    await expect(
      backupFiles.save('{"tables":{}}', "backup.srb"),
    ).rejects.toThrow(/cifrado/);
    expect(saf.requestDirectoryPermissionsAsync).toHaveBeenCalledTimes(1);
    jest
      .mocked(saf.requestDirectoryPermissionsAsync)
      .mockResolvedValue({ granted: true, directoryUri: "content://folder" });
    jest
      .mocked(saf.createFileAsync)
      .mockResolvedValue("content://folder/backup.srb");
    jest
      .mocked(FileSystem.writeAsStringAsync)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Disk full"));
    expect(await backupFiles.save("SRB2.meta.cipher", "backup.srb")).toBe(
      "saved",
    );
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      "content://folder/backup.srb",
      "SRB2.meta.cipher",
      { encoding: "utf8" },
    );
    await expect(
      backupFiles.save("SRB2.meta.cipher", "backup.srb"),
    ).rejects.toThrow("Disk full");
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      "content://folder/backup.srb",
      { idempotent: true },
    );
  } finally {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: platform,
    });
  }
});
