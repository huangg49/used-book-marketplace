export const reviewDate = (s: string) =>
  new Date(s).toLocaleString("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
