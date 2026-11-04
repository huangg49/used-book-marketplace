/** Group digit strings without rounding them through Number. */
export function formatGroupedAmount(digits: string): string {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.push(digits.slice(Math.max(0, end - 3), end));
  }
  return groups.reverse().join(".");
}

const digitCount = (text: string) => text.replace(/[^0-9]/g, "").length;
const caretAfterDigits = (formatted: string, count: number) => {
  if (count <= 0) return 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[0-9]/.test(formatted[i]) && --count === 0) return i + 1;
  }
  return formatted.length;
};

export function editGroupedAmount(
  previous: string,
  text: string,
  caret: number,
  inputType = "",
  collapsedSelection = false,
) {
  let before = digitCount(text.slice(0, caret));
  if (!/^[0-9.\s]*$/.test(text)) {
    const formatted = formatGroupedAmount(previous);
    return {
      digits: previous,
      formatted,
      caret: caretAfterDigits(formatted, before),
      accepted: false,
    };
  }
  let digits = text.replace(/[.\s]/g, "");
  // Backspace/Delete at a separator should remove the adjacent digit, not get stuck.
  if (
    collapsedSelection &&
    digits === previous &&
    text !== formatGroupedAmount(previous)
  ) {
    const backward = inputType === "deleteContentBackward";
    const forward = inputType === "deleteContentForward";
    const index = backward ? before - 1 : before;
    if ((backward || forward) && index >= 0 && index < digits.length) {
      digits = digits.slice(0, index) + digits.slice(index + 1);
      if (backward) before--;
    }
  }
  const normalized = digits.replace(/^0+(?=[0-9])/, "");
  before = Math.max(0, before - (digits.length - normalized.length));
  const formatted = formatGroupedAmount(normalized);
  return {
    digits: normalized,
    formatted,
    caret: caretAfterDigits(formatted, before),
    accepted: true,
  };
}
