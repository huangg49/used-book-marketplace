import { describe, expect, it } from "vitest";
import { editGroupedAmount, formatGroupedAmount } from "./grouped-amount";

describe("withdrawal amount display", () => {
  it.each([
    ["", ""],
    ["0", "0"],
    ["50", "50"],
    ["500", "500"],
    ["1000", "1.000"],
    ["50000", "50.000"],
    ["5300500", "5.300.500"],
    ["9007199254740993", "9.007.199.254.740.993"],
  ])("groups %s without rounding", (digits, shown) => {
    expect(formatGroupedAmount(digits)).toBe(shown);
  });
  it("keeps the caret beside an inserted middle digit", () => {
    expect(editGroupedAmount("5300500", "59.300.500", 2, "insertText")).toEqual(
      { digits: "59300500", formatted: "59.300.500", caret: 2, accepted: true },
    );
  });
  it.each([
    ["deleteContentBackward", "300500", "300.500", 0],
    ["deleteContentForward", "500500", "500.500", 1],
  ])(
    "deletes a digit across a separator: %s",
    (inputType, digits, formatted, caret) => {
      expect(
        editGroupedAmount("5300500", "5300.500", 1, String(inputType), true),
      ).toEqual({ digits, formatted, caret, accepted: true });
    },
  );
  it("restores the caret after regrouping a shortened prefix", () => {
    expect(
      editGroupedAmount("5300500", "5.30.500", 4, "deleteContentBackward"),
    ).toEqual({
      digits: "530500",
      formatted: "530.500",
      caret: 3,
      accepted: true,
    });
  });
  it("accepts an already formatted pasted amount", () => {
    expect(editGroupedAmount("", " 5.300.500 ", 11, "insertFromPaste")).toEqual(
      { digits: "5300500", formatted: "5.300.500", caret: 9, accepted: true },
    );
  });
  it("does not remove money digits when deleting only a selected separator", () => {
    expect(
      editGroupedAmount(
        "5300500",
        "5300.500",
        1,
        "deleteContentBackward",
        false,
      ),
    ).toMatchObject({ digits: "5300500", formatted: "5.300.500", caret: 1 });
  });
  it("normalizes leading zeroes and allows clearing", () => {
    expect(editGroupedAmount("", "0005300500", 10).digits).toBe("5300500");
    expect(editGroupedAmount("5300500", "", 0)).toEqual({
      digits: "",
      formatted: "",
      caret: 0,
      accepted: true,
    });
  });
  it.each(["-50000", "1e6", "5,30", "abc"])(
    "rejects %s instead of reinterpreting its amount",
    (text) => {
      expect(editGroupedAmount("100000", text, text.length)).toMatchObject({
        digits: "100000",
        formatted: "100.000",
        accepted: false,
      });
    },
  );
});
