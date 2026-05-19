const {
  execute,
  processChunk,
  CHUNK_SIZE,
} = require("../../services/delete-blocked-numbers.service");
const { makeFakeKnex } = require("../helpers/fake-knex");

const knex = require("../../lib/db/knex");

describe("processChunk", () => {
  it("retorna 0 quando nao ha mais numeros para deletar", async () => {
    const fake = makeFakeKnex();
    fake.setResponses("blocked_numbers", [[]]);

    const deleted = await processChunk(fake.db, {
      uniqueName: "tenant1",
      raffleId: 1,
    });

    expect(deleted).toBe(0);
    expect(
      fake.calls.some((c) => c.table === "raffle_numbers_tenant1")
    ).toBe(false);
  });

  it("destrava numbers em raffle_numbers e deleta de blocked_numbers", async () => {
    const fake = makeFakeKnex();
    fake.setResponses("blocked_numbers", [
      [{ number: 1 }, { number: 2 }, { number: 3 }], // fetchUnclaimedChunk
      3, // deleteUnclaimedByNumbers
    ]);
    fake.setResponses("raffle_numbers_tenant1", [3]); // unlockNumbers update

    const deleted = await processChunk(fake.db, {
      uniqueName: "tenant1",
      raffleId: 7,
    });

    expect(deleted).toBe(3);

    const unlock = fake.calls.find(
      (c) => c.table === "raffle_numbers_tenant1" && c.op === "update"
    );
    expect(unlock).toBeDefined();
    expect(unlock.payload).toEqual({ locked: false });

    const del = fake.calls.find(
      (c) => c.table === "blocked_numbers" && c.op === "del"
    );
    expect(del).toBeDefined();
    const whereIn = del.conditions.find((c) => c[0] === "whereIn");
    expect(whereIn[1]).toEqual(["number", [1, 2, 3]]);
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

  it("encerra cedo quando nao ha blocked_numbers e ainda assim notifica inicio/fim", async () => {
    const fake = makeFakeKnex();
    // 1) insert notif inicio | 2) count | 3) primeira iteracao retorna [] | 4) insert notif fim
    fake.setResponses("notifications", [1, 1]);
    fake.setResponses("blocked_numbers", [
      { count: 0 }, // count.first()
      [], // primeira fetchUnclaimedChunk = vazio → break
    ]);

    const result = await withFakeKnex(fake, () =>
      execute({
        database: "rifas_test",
        userId: 1,
        uniqueName: "tenant1",
        raffleId: 99,
      })
    );

    expect(result).toMatchObject({ ok: true, raffleId: 99, totalDeleted: 0 });

    const inserts = fake.calls.filter(
      (c) => c.table === "notifications" && c.op === "insert"
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0].rows.type).toBe("info");
    expect(inserts[1].rows.type).toBe("success");
    expect(inserts[0].rows.user_id).toBeNull();
  });

  it("itera ate esvaziar somando totalDeleted", async () => {
    const fake = makeFakeKnex();
    fake.setResponses("notifications", [1, 1]);
    fake.setResponses("blocked_numbers", [
      { count: 7 }, // count.first()
      [{ number: 1 }, { number: 2 }, { number: 3 }], // fetch 1
      3, // delete 1
      [{ number: 4 }, { number: 5 }], // fetch 2
      2, // delete 2
      [], // fetch 3 -> termina
    ]);
    fake.setResponses("raffle_numbers_tenant1", [3, 2]); // 2 unlocks

    const result = await withFakeKnex(fake, () =>
      execute({
        database: "rifas_test",
        userId: 1,
        uniqueName: "tenant1",
        raffleId: 7,
      })
    );

    expect(result).toMatchObject({ ok: true, raffleId: 7, totalDeleted: 5 });
    expect(result.iterations).toBe(3); // ate o break
  });

  it("estoura limite de iteracoes quando o chunk nunca esvazia", async () => {
    const fake = makeFakeKnex();
    fake.setResponses("notifications", [1]);
    // initialCount=0 -> maxIterations = 0+10 = 10. Vamos forcar 11 iteracoes nao-vazias.
    const blockedResponses = [{ count: 0 }];
    const raffleResponses = [];
    for (let i = 0; i < 11; i++) {
      blockedResponses.push([{ number: i }]); // fetch
      blockedResponses.push(1); // delete
      raffleResponses.push(1); // unlock
    }
    fake.setResponses("blocked_numbers", blockedResponses);
    fake.setResponses("raffle_numbers_tenant1", raffleResponses);

    await expect(
      withFakeKnex(fake, () =>
        execute({
          database: "rifas_test",
          userId: 1,
          uniqueName: "tenant1",
          raffleId: 7,
        })
      )
    ).rejects.toThrow(/limite de iteracoes/);
  });
});

describe("constantes", () => {
  it("CHUNK_SIZE igual ao do Job PHP", () => {
    expect(CHUNK_SIZE).toBe(5000);
  });
});
