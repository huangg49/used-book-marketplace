// Visibility for internal development only; authorization always belongs to the API.
export const internalMemberViewsEnabled =
  process.env.EXPO_PUBLIC_INTERNAL_MEMBER_VIEWS === "1";
