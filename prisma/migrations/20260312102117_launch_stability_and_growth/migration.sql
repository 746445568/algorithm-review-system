-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExternalAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "rating" INTEGER,
    "lastSyncedAt" DATETIME,
    "lastSyncStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastSyncAttemptAt" DATETIME,
    "lastSuccessfulSyncAt" DATETIME,
    "lastSyncError" TEXT,
    "lastImportedProblems" INTEGER NOT NULL DEFAULT 0,
    "lastImportedSubmissions" INTEGER NOT NULL DEFAULT 0,
    "lastSyncDurationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExternalAccount" ("avatarUrl", "createdAt", "handle", "id", "lastSyncedAt", "provider", "providerUserId", "rating", "updatedAt", "userId") SELECT "avatarUrl", "createdAt", "handle", "id", "lastSyncedAt", "provider", "providerUserId", "rating", "updatedAt", "userId" FROM "ExternalAccount";
DROP TABLE "ExternalAccount";
ALTER TABLE "new_ExternalAccount" RENAME TO "ExternalAccount";
CREATE INDEX "ExternalAccount_handle_idx" ON "ExternalAccount"("handle");
CREATE UNIQUE INDEX "ExternalAccount_provider_providerUserId_key" ON "ExternalAccount"("provider", "providerUserId");
CREATE UNIQUE INDEX "ExternalAccount_userId_provider_key" ON "ExternalAccount"("userId", "provider");
CREATE TABLE "new_ReviewQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "nextReviewDate" DATETIME NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewQueue_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReviewQueue" ("completed", "createdAt", "id", "interval", "nextReviewDate", "priority", "problemId", "updatedAt", "userId") SELECT "completed", "createdAt", "id", "interval", "nextReviewDate", "priority", "problemId", "updatedAt", "userId" FROM "ReviewQueue";
DROP TABLE "ReviewQueue";
ALTER TABLE "new_ReviewQueue" RENAME TO "ReviewQueue";
CREATE INDEX "ReviewQueue_userId_idx" ON "ReviewQueue"("userId");
CREATE INDEX "ReviewQueue_nextReviewDate_idx" ON "ReviewQueue"("nextReviewDate");
CREATE INDEX "ReviewQueue_completed_idx" ON "ReviewQueue"("completed");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
