/*
  Warnings:

  - Added the required column `userId` to the `Problem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `ReviewQueue` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Submission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `problem_search` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "rating" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "rating" INTEGER,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Problem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT,
    "url" TEXT,
    "difficulty" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "provider" TEXT,
    "externalProblemKey" TEXT,
    "contestId" INTEGER,
    "problemIndex" TEXT,
    "externalUrl" TEXT,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Problem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Problem" ("createdAt", "description", "difficulty", "id", "source", "tags", "title", "updatedAt", "url") SELECT "createdAt", "description", "difficulty", "id", "source", "tags", "title", "updatedAt", "url" FROM "Problem";
DROP TABLE "Problem";
ALTER TABLE "new_Problem" RENAME TO "Problem";
CREATE INDEX "Problem_userId_idx" ON "Problem"("userId");
CREATE INDEX "Problem_difficulty_idx" ON "Problem"("difficulty");
CREATE INDEX "Problem_tags_idx" ON "Problem"("tags");
CREATE UNIQUE INDEX "Problem_userId_provider_externalProblemKey_key" ON "Problem"("userId", "provider", "externalProblemKey");
CREATE TABLE "new_ReviewQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "nextReviewDate" DATETIME NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewQueue_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReviewQueue" ("completed", "createdAt", "id", "interval", "nextReviewDate", "priority", "problemId", "updatedAt") SELECT "completed", "createdAt", "id", "interval", "nextReviewDate", "priority", "problemId", "updatedAt" FROM "ReviewQueue";
DROP TABLE "ReviewQueue";
ALTER TABLE "new_ReviewQueue" RENAME TO "ReviewQueue";
CREATE INDEX "ReviewQueue_userId_idx" ON "ReviewQueue"("userId");
CREATE INDEX "ReviewQueue_nextReviewDate_idx" ON "ReviewQueue"("nextReviewDate");
CREATE INDEX "ReviewQueue_completed_idx" ON "ReviewQueue"("completed");
CREATE TABLE "new_Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "code" TEXT,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "errorType" TEXT,
    "runtime" INTEGER,
    "memory" INTEGER,
    "externalSubmissionId" TEXT,
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Submission" ("code", "createdAt", "errorMessage", "errorType", "id", "language", "memory", "problemId", "runtime", "status") SELECT "code", "createdAt", "errorMessage", "errorType", "id", "language", "memory", "problemId", "runtime", "status" FROM "Submission";
DROP TABLE "Submission";
ALTER TABLE "new_Submission" RENAME TO "Submission";
CREATE UNIQUE INDEX "Submission_externalSubmissionId_key" ON "Submission"("externalSubmissionId");
CREATE INDEX "Submission_userId_idx" ON "Submission"("userId");
CREATE INDEX "Submission_problemId_idx" ON "Submission"("problemId");
CREATE INDEX "Submission_status_idx" ON "Submission"("status");
CREATE TABLE "new_problem_search" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "source" TEXT,
    CONSTRAINT "problem_search_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "problem_search_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_problem_search" ("description", "id", "problemId", "source", "tags", "title") SELECT "description", "id", "problemId", "source", "tags", "title" FROM "problem_search";
DROP TABLE "problem_search";
ALTER TABLE "new_problem_search" RENAME TO "problem_search";
CREATE UNIQUE INDEX "problem_search_problemId_key" ON "problem_search"("problemId");
CREATE INDEX "problem_search_userId_idx" ON "problem_search"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "ExternalAccount_handle_idx" ON "ExternalAccount"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccount_provider_providerUserId_key" ON "ExternalAccount"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccount_userId_provider_key" ON "ExternalAccount"("userId", "provider");
