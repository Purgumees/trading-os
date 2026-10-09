/**
 * Tests for historical display utilities
 * Verifies latest-N selection, chronological ordering, and frequency limits
 */

import {
  getLatestObservations,
  getFrequencyDisplayLimit,
  formatMetricValue,
  calculateChange,
  getTrendDirection,
  getTrendArrow,
} from "@/lib/historical-display-utils";

describe("Historical Display Utilities", () => {
  describe("getLatestObservations", () => {
    it("should select the latest N observations", () => {
      const observations = [
        { date: "2024-01", value: 10 },
        { date: "2024-02", value: 11 },
        { date: "2024-03", value: 12 },
        { date: "2024-04", value: 13 },
        { date: "2024-05", value: 14 },
        { date: "2024-06", value: 15 },
        { date: "2024-07", value: 16 },
      ];

      const latest3 = getLatestObservations(observations, 3);
      expect(latest3).toHaveLength(3);
      // Should get the last 3 observations: 2024-05, 2024-06, 2024-07
      expect(latest3[0].date).toBe("2024-05");
      expect(latest3[1].date).toBe("2024-06");
      expect(latest3[2].date).toBe("2024-07");
    });

    it("should order observations chronologically (oldest → newest)", () => {
      const observations = [
        { date: "2024-03", value: 12 },
        { date: "2024-01", value: 10 },
        { date: "2024-02", value: 11 },
      ];

      const result = getLatestObservations(observations, 10);
      expect(result[0].date).toBe("2024-01");
      expect(result[1].date).toBe("2024-02");
      expect(result[2].date).toBe("2024-03");
    });

    it("should return all observations if dataset is smaller than limit", () => {
      const observations = [
        { date: "2024-01", value: 10 },
        { date: "2024-02", value: 11 },
      ];

      const result = getLatestObservations(observations, 6);
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe("2024-01");
      expect(result[1].date).toBe("2024-02");
    });

    it("should handle quarterly data correctly", () => {
      const observations = [
        { date: "2023-Q1", value: 100 },
        { date: "2023-Q2", value: 101 },
        { date: "2023-Q3", value: 102 },
        { date: "2023-Q4", value: 103 },
        { date: "2024-Q1", value: 104 },
        { date: "2024-Q2", value: 105 },
        { date: "2024-Q3", value: 106 },
      ];

      const latest2Q = getLatestObservations(observations, 2);
      expect(latest2Q).toHaveLength(2);
      expect(latest2Q[0].date).toBe("2024-Q2");
      expect(latest2Q[1].date).toBe("2024-Q3");
    });

    it("should handle empty observations gracefully", () => {
      const observations: Array<{ date: string; value: number | null }> = [];
      const result = getLatestObservations(observations, 6);
      expect(result).toHaveLength(0);
    });
  });

  describe("getFrequencyDisplayLimit", () => {
    it("should return correct limits for each frequency", () => {
      expect(getFrequencyDisplayLimit("D")).toBe(20); // Daily: 20 observations
      expect(getFrequencyDisplayLimit("W")).toBe(8); // Weekly: 8 weeks
      expect(getFrequencyDisplayLimit("M")).toBe(6); // Monthly: 6 months
      expect(getFrequencyDisplayLimit("Q")).toBe(6); // Quarterly: 6 quarters
      expect(getFrequencyDisplayLimit("A")).toBe(5); // Annual: 5 years
    });
  });

  describe("formatMetricValue", () => {
    it("should format numeric values with correct decimals", () => {
      expect(formatMetricValue(3.14159, 2)).toBe("3.14");
      expect(formatMetricValue(100, 0)).toBe("100");
      expect(formatMetricValue(0.5, 1)).toBe("0.5");
    });

    it("should return '—' for null values", () => {
      expect(formatMetricValue(null, 2)).toBe("—");
    });
  });

  describe("calculateChange", () => {
    it("should calculate positive changes correctly", () => {
      expect(calculateChange(105, 100, 2)).toBe("+5.00");
    });

    it("should calculate negative changes correctly", () => {
      expect(calculateChange(95, 100, 2)).toBe("-5.00");
    });

    it("should return '—' for null values", () => {
      expect(calculateChange(null, 100, 2)).toBe("—");
      expect(calculateChange(100, null, 2)).toBe("—");
    });

    it("should respect decimal precision", () => {
      expect(calculateChange(3.14159, 3.14, 3)).toBe("+0.002");
    });
  });

  describe("getTrendDirection", () => {
    it("should identify uptrend", () => {
      expect(getTrendDirection(105, 100)).toBe("up");
    });

    it("should identify downtrend", () => {
      expect(getTrendDirection(95, 100)).toBe("down");
    });

    it("should identify flat trend", () => {
      expect(getTrendDirection(100, 100)).toBe("flat");
    });

    it("should return unavailable for null values", () => {
      expect(getTrendDirection(null, 100)).toBe("unavailable");
      expect(getTrendDirection(100, null)).toBe("unavailable");
    });
  });

  describe("getTrendArrow", () => {
    it("should return correct arrows for trends", () => {
      expect(getTrendArrow("up")).toBe("↑");
      expect(getTrendArrow("down")).toBe("↓");
      expect(getTrendArrow("flat")).toBe("→");
      expect(getTrendArrow("unavailable")).toBe("—");
    });
  });

  describe("Integration: Monthly inflation data scenario", () => {
    it("should correctly select and order latest 6 months for monthly inflation", () => {
      const observations = [
        { date: "2024-01", value: 2.5 },
        { date: "2024-02", value: 2.4 },
        { date: "2024-03", value: 2.3 },
        { date: "2024-04", value: 2.2 },
        { date: "2024-05", value: 2.1 },
        { date: "2024-06", value: 2.0 },
        { date: "2024-07", value: 1.9 },
        { date: "2024-08", value: 1.8 },
        { date: "2024-09", value: 1.7 },
      ];

      const limit = getFrequencyDisplayLimit("M");
      expect(limit).toBe(6);

      const result = getLatestObservations(observations, limit);
      expect(result).toHaveLength(6);
      expect(result[0].date).toBe("2024-04");
      expect(result[result.length - 1].date).toBe("2024-09");

      // Verify chronological ordering
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].date < result[i + 1].date).toBe(true);
      }
    });

    it("should correctly select and order latest 6 quarters for quarterly data", () => {
      const observations = [
        { date: "2022-Q1", value: 5.0 },
        { date: "2022-Q2", value: 4.9 },
        { date: "2022-Q3", value: 4.8 },
        { date: "2022-Q4", value: 4.7 },
        { date: "2023-Q1", value: 4.6 },
        { date: "2023-Q2", value: 4.5 },
        { date: "2023-Q3", value: 4.4 },
        { date: "2023-Q4", value: 4.3 },
      ];

      const limit = getFrequencyDisplayLimit("Q");
      expect(limit).toBe(6);

      const result = getLatestObservations(observations, limit);
      expect(result).toHaveLength(6);
      expect(result[0].date).toBe("2022-Q3");
      expect(result[result.length - 1].date).toBe("2023-Q4");
    });
  });

  describe("Edge cases", () => {
    it("should handle single observation", () => {
      const observations = [{ date: "2024-01", value: 10 }];
      const result = getLatestObservations(observations, 6);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe("2024-01");
    });

    it("should handle limit of 1", () => {
      const observations = [
        { date: "2024-01", value: 10 },
        { date: "2024-02", value: 11 },
        { date: "2024-03", value: 12 },
      ];
      const result = getLatestObservations(observations, 1);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe("2024-03");
    });

    it("should handle date strings with different formats", () => {
      const observations = [
        { date: "2024-01-15", value: 10 },
        { date: "2024-02-20", value: 11 },
        { date: "2024-03-25", value: 12 },
      ];
      const result = getLatestObservations(observations, 10);
      expect(result).toHaveLength(3);
      // Chronological ordering should work with ISO date format
      expect(result[0].date).toBe("2024-01-15");
      expect(result[1].date).toBe("2024-02-20");
      expect(result[2].date).toBe("2024-03-25");
    });
  });
});
