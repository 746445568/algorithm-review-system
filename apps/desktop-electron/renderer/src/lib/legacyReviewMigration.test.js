import { describe, expect, it, vi } from "vitest";
import { migrateQueuedReviewStates } from "./legacyReviewMigration.js";

describe("migrateQueuedReviewStates", () => {
  it("replays review saves in order and removes each successful item", async () => {
    const calls = [];
    const remove = vi.fn();
    const finish = vi.fn();
    await migrateQueuedReviewStates({
      operations: [
        { id: 2, type: "saveReviewState", path: "/api/review/items/7", payload: { notes: "second" } },
        { id: 1, type: "saveReviewState", path: "/api/review/items/7", payload: { notes: "first" } },
      ],
      save: async (problemId, payload) => calls.push([problemId, payload.notes]),
      remove,
      finish,
    });

    expect(calls).toEqual([[7, "first"], [7, "second"]]);
    expect(remove.mock.calls).toEqual([[1], [2]]);
    expect(finish).toHaveBeenCalledOnce();
  });

  it("stops on failure and leaves the failed and later operations intact", async () => {
    const remove = vi.fn();
    const finish = vi.fn();
    await expect(migrateQueuedReviewStates({
      operations: [
        { id: 1, type: "saveReviewState", path: "/api/review/items/7", payload: {} },
        { id: 2, type: "saveReviewState", path: "/api/review/items/8", payload: {} },
      ],
      save: async (problemId) => {
        if (problemId === 8) throw new Error("service unavailable");
      },
      remove,
      finish,
    })).rejects.toThrow("service unavailable");

    expect(remove.mock.calls).toEqual([[1]]);
    expect(finish).not.toHaveBeenCalled();
  });
});
