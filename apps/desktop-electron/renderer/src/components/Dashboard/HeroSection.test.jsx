import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeroSection } from "./HeroSection.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, values) => {
      if (key === "dashboard.hero.startReview") return "开始复习";
      if (key === "dashboard.hero.progressCount") return `${values.done}/${values.total}`;
      return key;
    },
  }),
}));

describe("HeroSection", () => {
  it("keeps review as the primary dashboard action", () => {
    const navigateTo = vi.fn();
    render(
      <HeroSection
        data={{ reviewSummary: { dueReviewCount: 2, scheduledReviewCount: 1 }, accounts: [], goals: [] }}
        navigateTo={navigateTo}
        loading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /开始复习/ }));

    expect(navigateTo).toHaveBeenCalledWith("review");
    expect(screen.queryByRole("button", { name: /同步|重试同步/ })).not.toBeInTheDocument();
  });
});
