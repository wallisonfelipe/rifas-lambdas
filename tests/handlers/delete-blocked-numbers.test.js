const service = require("../../services/delete-blocked-numbers.service");
const knex = require("../../lib/db/knex");
const handlerModule = require("../../handlers/delete-blocked-numbers");
const { makeFakeKnex } = require("../helpers/fake-knex");

describe("handler delete-blocked-numbers", () => {
  let executeSpy;
  let connectSpy;

  beforeEach(() => {
    executeSpy = vi.spyOn(service, "execute");
    connectSpy = vi.spyOn(knex, "connect").mockImplementation(async () => {
      const fake = makeFakeKnex();
      fake.setResponses("notifications", [1]);
      return fake.db;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const basePayload = {
    database: "rifas_test",
    userId: 1,
    uniqueName: "tenant1",
    raffleId: 7,
  };

  it("aceita payload direto (invocacao SDK Lambda)", async () => {
    executeSpy.mockResolvedValueOnce({ ok: true, totalDeleted: 0 });

    const result = await handlerModule.handler(basePayload);

    expect(executeSpy).toHaveBeenCalledOnce();
    expect(executeSpy.mock.calls[0][0]).toMatchObject(basePayload);
    expect(result).toEqual({ ok: true, totalDeleted: 0 });
  });

  it("aceita payload via event.detail (EventBridge)", async () => {
    executeSpy.mockResolvedValueOnce({ ok: true, totalDeleted: 5 });

    await handlerModule.handler({ detail: basePayload });

    expect(executeSpy).toHaveBeenCalledOnce();
    expect(executeSpy.mock.calls[0][0]).toMatchObject(basePayload);
  });

  it("rejeita payload sem campos obrigatorios", async () => {
    await expect(
      handlerModule.handler({ database: "rifas_test", userId: 1 })
    ).rejects.toThrow(/obrigatorio/);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("propaga erro do service e dispara reportError", async () => {
    executeSpy.mockRejectedValueOnce(new Error("boom"));

    await expect(handlerModule.handler(basePayload)).rejects.toThrow("boom");
    expect(connectSpy).toHaveBeenCalled();
  });
});
