import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { BackupService } from "@/application/export";
import { BackupPanel } from "./BackupPanel";

it("keeps raw payload secondary and requires file preview before explicit restore", async () => {
  const service = {
    exportEncrypted: jest.fn().mockResolvedValue("SRB2.meta.cipher"),
    previewPortable: jest.fn().mockResolvedValue({ records: 42, conflicts: 2 }),
    restorePortable: jest.fn().mockResolvedValue(undefined),
  } as unknown as BackupService;
  const files = {
    pick: jest
      .fn()
      .mockResolvedValue({ name: "training.srb", content: "SRB2.meta.cipher" }),
    save: jest.fn().mockResolvedValue("saved"),
  };
  const view = await render(<BackupPanel service={service} files={files} />);
  expect(view.queryByLabelText("Documento JSON de respaldo")).toBeNull();
  await fireEvent.changeText(
    view.getByLabelText("Contraseña portátil del respaldo"),
    "synthetic-password",
  );
  await fireEvent.press(view.getByLabelText("Importar archivo de respaldo"));
  expect(service.previewPortable).toHaveBeenCalledWith(
    "SRB2.meta.cipher",
    "synthetic-password",
  );
  expect(view.getByText("42 registros · 2 conflictos")).toBeTruthy();
  expect(service.restorePortable).not.toHaveBeenCalled();
  await fireEvent.press(
    view.getByLabelText("Confirmar restauración del respaldo"),
  );
  expect(service.restorePortable).toHaveBeenCalledTimes(1);
  expect(view.getByText("Respaldo restaurado de forma atómica.")).toBeTruthy();
});

it("cancelled picker and invalid file never restore or replace the current database", async () => {
  const service = {
    previewPortable: jest
      .fn()
      .mockRejectedValue(
        new Error("La contraseña es incorrecta o el respaldo fue alterado."),
      ),
    restorePortable: jest.fn(),
  } as unknown as BackupService;
  const files = {
    pick: jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: "bad.srb", content: "SRB2.invalid" }),
    save: jest.fn(),
  };
  const view = await render(<BackupPanel service={service} files={files} />);
  await fireEvent.press(view.getByLabelText("Importar archivo de respaldo"));
  expect(service.previewPortable).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText("Importar archivo de respaldo"));
  expect(view.getByText(/contraseña es incorrecta/)).toBeTruthy();
  expect(
    view.queryByLabelText("Confirmar restauración del respaldo"),
  ).toBeNull();
  expect(service.restorePortable).not.toHaveBeenCalled();
});

it("exports only encrypted content and distinguishes saved from cancelled file picking", async () => {
  let finish!: (value: "saved" | "cancelled") => void;
  const files = {
    pick: jest.fn(),
    save: jest.fn(
      () =>
        new Promise<"saved" | "cancelled">((resolve) => {
          finish = resolve;
        }),
    ),
  };
  const service = {
    exportEncrypted: jest.fn().mockResolvedValue("SRB2.meta.cipher"),
  } as unknown as BackupService;
  const view = await render(<BackupPanel service={service} files={files} />);
  await fireEvent.press(view.getByLabelText("Exportar respaldo cifrado"));
  await fireEvent.press(view.getByLabelText("Guardar archivo cifrado"));
  await fireEvent.press(view.getByLabelText("Guardar archivo cifrado"));
  expect(files.save).toHaveBeenCalledTimes(1);
  expect(files.save).toHaveBeenCalledWith(
    "SRB2.meta.cipher",
    expect.stringMatching(/^strength-rebuild-.*\.srb$/),
  );
  await act(async () => finish("cancelled"));
  expect(view.getByText(/Guardado cancelado/)).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Guardar archivo cifrado"));
  await act(async () => finish("saved"));
  await waitFor(() =>
    expect(view.getByText(/Archivo cifrado guardado/)).toBeTruthy(),
  );
});
