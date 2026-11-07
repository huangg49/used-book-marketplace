export const CHAT_MESSAGE_LIMIT = 2000;
export const CHAT_RATE_LIMIT_TEXT = "Bạn đã gửi 20 tin trong một phút. Hãy chờ một chút rồi gửi lại.";

export function clipChatMessage(text: string) {
  if (text.length <= CHAT_MESSAGE_LIMIT) return text;
  return [...text].slice(0, CHAT_MESSAGE_LIMIT).join("");
}

export function chatSendWasRateLimited(reply: unknown) {
  return Boolean(reply && typeof reply === "object" && "code" in reply && reply.code === "RATE_LIMITED");
}
