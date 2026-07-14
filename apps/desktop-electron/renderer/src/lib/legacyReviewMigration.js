import { deleteDB, openDB } from "idb";

const LEGACY_DATABASE_NAME = "OJReviewDB";

export async function migrateQueuedReviewStates({ operations, save, remove, finish }) {
  const ordered = [...operations].sort((left, right) => Number(left.id) - Number(right.id));
  for (const operation of ordered) {
    if (operation.type !== "saveReviewState") {
      throw new Error(`unsupported legacy operation: ${operation.type || "unknown"}`);
    }
    const match = String(operation.path || "").match(/^\/api\/review\/items\/(\d+)$/);
    if (!match) throw new Error("legacy review operation has an invalid path");
    await save(Number(match[1]), operation.payload || {});
    await remove(operation.id);
  }
  await finish();
}

export async function migrateLegacyReviewQueue(saveReviewState) {
  if (typeof indexedDB === "undefined") return { migrated: 0 };
  const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : null;
  if (databases && !databases.some((database) => database.name === LEGACY_DATABASE_NAME)) {
    return { migrated: 0 };
  }

  const database = await openDB(LEGACY_DATABASE_NAME);
  if (!database.objectStoreNames.contains("syncQueue")) {
    database.close();
    await deleteDB(LEGACY_DATABASE_NAME);
    return { migrated: 0 };
  }

  const operations = await database.getAll("syncQueue");
  try {
    await migrateQueuedReviewStates({
      operations,
      save: saveReviewState,
      remove: (id) => database.delete("syncQueue", id),
      finish: async () => {
        database.close();
        await deleteDB(LEGACY_DATABASE_NAME);
      },
    });
  } catch (error) {
    database.close();
    throw error;
  }
  return { migrated: operations.length };
}
