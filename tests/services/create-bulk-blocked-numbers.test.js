const {
  eligibleNumbersForChunk,
  processChunk,
  execute,
  CHUNK_SIZE,
} = require("../../services/create-bulk-blocked-numbers.service");
const { makeFakeKnex } = require("../helpers/fake-knex");

const knex = require("../../lib/db/knex");

describe("eligibleNumbersForChunk", () => {
  it("retorna lista vazia quando nao ha numeros disponiveis", () => {
    expect(
      eligibleNumbersForChunk({ available: [], blocked: [1, 2], awards: [3] })
    ).toEqual([]);
  });

  it("filtra numeros ja bloqueados e numeros premiados", () => {
    const result = eligibleNumbersForChunk({
      available: [1, 2, 3, 4, 5],
      blocked: [2],
      awards: [4],
    });
    expect(result).toEqual([1, 3, 5]);
  });

  it("preserva a ordem dos numeros disponiveis", () => {
    const result = eligibleNumbersForChunk({
      available: [10, 5, 7, 3],
      blocked: [],
      awards: [],
    });
    expect(result).toEqual([10, 5, 7, 3]);
  });
});

describe("processChunk", () => {
  function setupTrx({ available, blocked, awards }) {
    const fake = makeFakeKnex();
    fake.setResponses(
      "raffle_numbers_tenant1",
      [available.map((n) => ({ number: n })), 0]
    );
    fake.setResponses(
      "blocked_numbers",
      [blocked.map((n) => ({ number: n })), 0]
    );
    fake.setResponses("award_numbers", [awards.map((n) => ({ number: n }))]);
    return fake;
  }

  it("retorna 0 sem inserir nada quando nao ha numeros disponiveis", async () => {
    const fake = setupTrx({ available: [], blocked: [], awards: [] });

    const count = await processChunk(fake.db, {
      uniqueName: "tenant1",
      raffleId: 1,
      userId: 10,
      chunkStart: 0,
      chunkEnd: 99,
      position: 1,
      minValue: null,
      maxValue: null,
    });

    expect(count).toBe(0);
    const inserts = fake.calls.filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(0);
  });

  it("insere apenas numeros elegiveis e marca raffle_numbers como locked", async () => {
    const fake = setupTrx({
      available: [1, 2, 3, 4],
      blocked: [2],
      awards: [4],
    });

    const count = await processChunk(fake.db, {
      uniqueName: "tenant1",
      raffleId: 7,
      userId: 42,
      chunkStart: 0,
      chunkEnd: 99,
      position: 3,
      minValue: 10,
      maxValue: 20,
    });

    expect(count).toBe(2);

    const insert = fake.calls.find(
      (c) => c.table === "blocked_numbers" && c.op === "insert"
    );
    expect(insert).toBeDefined();
    expect(insert.rows).toHaveLength(2);
    expect(insert.rows.map((r) => r.number)).toEqual([1, 3]);
    expect(insert.rows[0]).toMatchObject({
      raffle_id: 7,
      user_id: 42,
      position: 3,
      min_value: 10,
      max_value: 20,
      locked: true,
    });

    const update = fake.calls.find(
      (c) => c.table === "raffle_numbers_tenant1" && c.op === "update"
    );
    expect(update).toBeDefined();
    expect(update.payload).toEqual({ locked: true });
  });

  it("nao insere nada quando todos os disponiveis sao bloqueados/premiados", async () => {
    const fake = setupTrx({
      available: [1, 2],
      blocked: [1],
      awards: [2],
    });

    const count = await processChunk(fake.db, {
      uniqueName: "tenant1",
      raffleId: 1,
      userId: 1,
      chunkStart: 0,
      chunkEnd: 99,
      position: 1,
      minValue: null,
      maxValue: null,
    });

    expect(count).toBe(0);
    const inserts = fake.calls.filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(0);
  });
});

describe("execute", () => {
  function withFakeKnex(fake, fn) {
    const original = knex.connect;
    knex.connect = async () => fake.db;
    return fn().finally(() => {
      knex.connect = original;
    });
  }

  it("retorna raffle_not_found quando raffle nao existe", async () => {
    const fake = makeFakeKnex();
    fake.setResponses("raffles", [null]);
    fake.setResponses("tenant_processing_statuses", [0]);

    const result = await withFakeKnex(fake, () =>
      execute({
        database: "rifas_test",
        userId: 1,
        uniqueName: "tenant1",
        raffleId: 99,
        startRange: 0,
        endRange: 10,
        position: 1,
        minValue: null,
        maxValue: null,
      })
    );

    expect(result).toEqual({ ok: false, reason: "raffle_not_found", raffleId: 99 });
  });

  it("lanca erro quando raffle ainda esta gerando", async () => {
    const fake = makeFakeKnex();
    fake.setResponses("raffles", [{ id: 1, numbers_status: "generating" }]);
    fake.setResponses("tenant_processing_statuses", [0]);

    await expect(
      withFakeKnex(fake, () =>
        execute({
          database: "rifas_test",
          userId: 1,
          uniqueName: "tenant1",
          raffleId: 1,
          startRange: 0,
          endRange: 10,
          position: 1,
          minValue: null,
          maxValue: null,
        })
      )
    ).rejects.toThrow(/Gerando n.meros do sorteio/);
  });
});

describe("constantes", () => {
  it("CHUNK_SIZE igual ao do service PHP", () => {
    expect(CHUNK_SIZE).toBe(5000);
  });
});
