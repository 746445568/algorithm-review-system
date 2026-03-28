import { useCallback, useEffect } from "react";

export function useReviewFlow({ problems, selectedId, onSelect, onSave, onStatusChange }) {
  const currentIndex = problems.findIndex((p) => p.problemId === selectedId);

  const goNext = useCallback(() => {
    if (currentIndex < problems.length - 1) {
      onSelect(problems[currentIndex + 1].problemId);
    }
  }, [currentIndex, problems, onSelect]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      onSelect(problems[currentIndex - 1].problemId);
    }
  }, [currentIndex, problems, onSelect]);

  useEffect(() => {
    function handleKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          goNext();
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          goPrev();
          break;
        case "1":
          onStatusChange("TODO");
          break;
        case "2":
          onStatusChange("REVIEWING");
          break;
        case "3":
          onStatusChange("SCHEDULED");
          break;
        case "4":
          onStatusChange("DONE");
          break;
        default:
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            void onSave();
          }
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, onSave, onStatusChange]);

  return {
    currentIndex,
    total: problems.length,
    hasNext: currentIndex < problems.length - 1,
    hasPrev: currentIndex > 0,
    goNext,
    goPrev,
  };
}
