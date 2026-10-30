// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/es.json";

const { saveClient, refresh } = vi.hoisted(() => ({ saveClient: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/actions/clients", () => ({ saveClient }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ProjectFormFields } from "./project-form-fields";

const NEW_CLIENT = "__new_client__";
const CLIENTS = [{ id: "c1", name: "YPF" }];

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);

function renderFields(props: { canManageFinance?: boolean } = {}) {
  render(
    <NextIntlClientProvider locale="es-AR" messages={messages}>
      <form data-testid="project-form">
        <ProjectFormFields pending={false} clients={CLIENTS} coordinators={[]} {...props} />
      </form>
    </NextIntlClientProvider>,
  );
  const select = document.querySelector<HTMLSelectElement>("#project-client");
  if (!select) throw new Error("no está el selector de cliente");
  return select;
}

/** Lo que el servidor recibiría: el valor real del campo, no el que se ve. */
function submittedClientId(select: HTMLSelectElement): FormDataEntryValue | null {
  return new FormData(select.form as HTMLFormElement).get("clientId");
}

describe("alta de cliente desde «Nuevo proyecto»", () => {
  it("ofrece «Crear cliente nuevo» al final de la lista", () => {
    const select = renderFields();
    const labels = Array.from(select.options).map((option) => option.textContent);
    expect(labels.at(-1)).toContain("Crear cliente nuevo");
    expect(labels).toContain("YPF");
  });

  it("no la ofrece a quien no puede crear clientes", () => {
    const select = renderFields({ canManageFinance: false });
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).not.toContain(NEW_CLIENT);
  });

  it("elegirla abre el alta sin cambiar el cliente elegido ni enviarla como valor", async () => {
    const select = renderFields();
    fireEvent.change(select, { target: { value: "c1" } });
    fireEvent.change(select, { target: { value: NEW_CLIENT } });
    await screen.findByRole("dialog");
    expect(select.value).toBe("c1");
    expect(submittedClientId(select)).toBe("c1");
  });

  it("cancelar el alta deja el formulario como estaba", async () => {
    const select = renderFields();
    fireEvent.change(select, { target: { value: NEW_CLIENT } });
    await screen.findByRole("dialog");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(select.value).toBe("");
    expect(saveClient).not.toHaveBeenCalled();
  });

  it("al guardar, el cliente nuevo queda en la lista y elegido", async () => {
    saveClient.mockResolvedValue({ error: null, ok: true, client: { id: "c2", name: "Shopping Norte" } });
    const select = renderFields();
    fireEvent.change(select, { target: { value: NEW_CLIENT } });
    await screen.findByRole("dialog");

    fireEvent.change(document.querySelector<HTMLInputElement>("#client-name") as HTMLInputElement, {
      target: { value: "Shopping Norte" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.Clients.save }));

    await waitFor(() => expect(select.value).toBe("c2"));
    expect(Array.from(select.options).map((option) => option.textContent)).toContain("Shopping Norte");
    expect(submittedClientId(select)).toBe("c2");
    expect(saveClient).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("si el alta falla, el cliente sigue sin elegir y el error se ve", async () => {
    saveClient.mockResolvedValue({ error: "El nombre ya existe" });
    const select = renderFields();
    fireEvent.change(select, { target: { value: NEW_CLIENT } });
    await screen.findByRole("dialog");
    fireEvent.change(document.querySelector<HTMLInputElement>("#client-name") as HTMLInputElement, {
      target: { value: "YPF" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.Clients.save }));

    await screen.findByText("El nombre ya existe");
    expect(select.value).toBe("");
    expect(submittedClientId(select)).toBe("");
  });
});
