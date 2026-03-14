-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT,
    "url" TEXT,
    "difficulty" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "errorType" TEXT,
    "runtime" INTEGER,
    "memory" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "aiAnalysis" TEXT NOT NULL,
    "improvementSuggestions" TEXT NOT NULL,
    "keyPoints" TEXT NOT NULL,
    "similarProblems" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "nextReviewDate" DATETIME NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewQueue_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "problem_search" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "source" TEXT
);

-- CreateIndex
CREATE INDEX "Problem_difficulty_idx" ON "Problem"("difficulty");

-- CreateIndex
CREATE INDEX "Problem_tags_idx" ON "Problem"("tags");

-- CreateIndex
CREATE INDEX "Submission_problemId_idx" ON "Submission"("problemId");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Review_submissionId_key" ON "Review"("submissionId");

-- CreateIndex
CREATE INDEX "Review_submissionId_idx" ON "Review"("submissionId");

-- CreateIndex
CREATE INDEX "ReviewQueue_nextReviewDate_idx" ON "ReviewQueue"("nextReviewDate");

-- CreateIndex
CREATE INDEX "ReviewQueue_completed_idx" ON "ReviewQueue"("completed");

-- CreateIndex
CREATE UNIQUE INDEX "problem_search_problemId_key" ON "problem_search"("problemId");
