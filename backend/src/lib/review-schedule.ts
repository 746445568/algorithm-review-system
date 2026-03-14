export function calculateNextReview(interval: number) {
  const safeInterval = Math.max(1, interval || 1);
  const nextInterval = Math.min(safeInterval * 2, 30);
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + nextInterval);

  return {
    nextInterval,
    nextReviewDate,
  };
}
