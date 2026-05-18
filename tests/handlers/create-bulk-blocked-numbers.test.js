const service = require("../../services/create-bulk-blocked-numbers.service");
const knex = require("../../lib/db/knex");
const handlerModule = require("../../handlers/create-bulk-blocked-numbers");
const { makeFakeKnex } = require("../helpers/fake-knex");

describe("handler create-bulk-blocked-numbers", () => {
  let executeSpy;
  let connectSpy;

  beforeEach(() => {
    executeSpy = vi.spyOn(service, "execute");
    connectSpy = vi.spyOn(knex, "connect").mockImplementation(async () => {
      const fake = makeFakeKnex();
      // reportError chama notificationsQ.insert + tenantProcessingQ.finish
      fake.setResponses("notifications", [1]);
      fake.setResponses("tenant_processing_statuses", [0]);
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
    startRange: 0,
    endRange: 99,
    position: 1,
  };

  it("aceita payload direto (invocacao SDK Lambda)", async () => {
    executeSpy.mockResolvedValueOnce({ ok: true, totalInserted: 5 });

    const result = await handlerModule.handler(basePayload);

    expect(executeSpy).toHaveBeenCalledOnce();
    expect(executeSpy.mock.calls[0][0]).toMatchObject({
      database: "rifas_test",
      userId: 1,
      raffleId: 7,
      startRange: 0,
      endRange: 99,
      position: 1,
      minValue: null,
      maxValue: null,
    });
    expect(result).toEqual({ ok: true, totalInserted: 5 });
  });

  it("aceita payload via event.detail (EventBridge)", async () => {
    executeSpy.mockResolvedValueOnce({ ok: true, totalInserted: 0 });

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

  it("re-lanca erro do service apos relatar falha", async () => {
    executeSpy.mockRejectedValueOnce(new Error("boom"));

    await expect(handlerModule.handler(basePayload)).rejects.toThrow("boom");
    // connect e chamado pelo execute (mockado) e pelo reportError
    expect(connectSpy).toHaveBeenCalled();
  });
});
