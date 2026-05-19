const { makeFakeKnex } = require("../../helpers/fake-knex");
const {
  fetchExistingInRange,
  insertMany,
} = require("../../../lib/db/blocked-numbers.queries");

describe("blocked-numbers.queries", () => {
  describe("fetchExistingInRange", () => {
    it("converte rows do banco em array de numeros", async () => {
      const fake = makeFakeKnex();
      fake.setResponses("blocked_numbers", [
        [{ number: "5" }, { number: 8 }, { number: "13" }],
      ]);

      const result = await fetchExistingInRange(fake.db, {
        raffleId: 1,
        chunkStart: 0,
        chunkEnd: 100,
      });

      expect(result).toEqual([5, 8, 13]);
      const call = fake.calls[0];
      expect(call.table).toBe("blocked_numbers");
      const where = call.conditions.find((c) => c[0] === "where");
      expect(where[1]).toEqual(["raffle_id", 1]);
      const between = call.conditions.find((c) => c[0] === "whereBetween");
      expect(between[1]).toEqual(["number", [0, 100]]);
    });
  });

  describe("insertMany", () => {
    it("retorna 0 sem chamar o banco quando array vazio", async () => {
      const fake = makeFakeKnex();
      const result = await insertMany(fake.db, []);
      expect(result).toBe(0);
      expect(fake.calls).toHaveLength(0);
    });

    it("dispara um insert e retorna o total de rows", async () => {
      const fake = makeFakeKnex();
      fake.setResponses("blocked_numbers", [1]);

      const rows = [{ number: 1 }, { number: 2 }];
      const result = await insertMany(fake.db, rows);

      expect(result).toBe(2);
      const insert = fake.calls.find((c) => c.op === "insert");
      expect(insert.rows).toBe(rows);
    });
  });
});
