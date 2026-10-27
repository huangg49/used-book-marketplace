import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { CommandPalette } from "./CommandPalette";
import {
  findCommands,
  foldCommandText,
  isCommandShortcut,
  nextCommandIndex,
  workspaceCommands,
} from "./commands";
import { navigationGroups } from "./navigation";
const user: CurrentUser = {
  id: crypto.randomUUID(),
  displayName: "Admin QA",
  email: "qa@example.test",
  status: "ACTIVE",
  roles: ["ADMIN"],
};
const render = (value: CurrentUser | undefined, enabled = true) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <CommandPalette
        user={value}
        open
        enabled={enabled}
        onOpen={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );

describe("command catalogue and Vietnamese search", () => {
  it.each([
    ["ADMIN"],
    ["STAFF"],
    ["TEST_OPERATOR"],
    ["ADMIN", "STAFF", "TEST_OPERATOR"],
  ] as CurrentUser["roles"][])(
    "uses exactly the permitted navigation destinations for %s",
    (...roles) => {
      const profile = { ...user, roles };
      expect(workspaceCommands(profile).map((command) => command.to)).toEqual(
        navigationGroups(profile).flatMap((group) =>
          group.items.map((item) => item.to),
        ),
      );
    },
  );
  it.each(["LOCKED", "RESTRICTED"] as const)(
    "has no commands for a %s account",
    (status) => {
      expect(workspaceCommands({ ...user, status })).toEqual([]);
      expect(render({ ...user, status })).toBe("");
    },
  );
  it("has no commands before profile, for Member or while profile/logout disables the palette", () => {
    expect(render(undefined)).toBe("");
    expect(render({ ...user, roles: ["MEMBER"] })).toBe("");
    expect(render(user, false)).toBe("");
  });
  it("matches Đ, mixed case, composed accents, decomposed accents and multiword searches", () => {
    const commands = workspaceCommands(user);
    expect(foldCommandText("ĐẦU SÁCH")).toBe("dau sach");
    for (const query of [
      "dau sach",
      "ĐẦU SÁCH",
      "đầu sách".normalize("NFD"),
      "  dau   sach ",
    ])
      expect(findCommands(commands, query)[0].to).toBe(
        "/review/catalog-requests",
      );
    expect(findCommands(commands, "tai khoan")[0].to).toBe("/users");
    expect(findCommands(commands, "quy su co")[0].to).toBe(
      "/operations/incidents",
    );
  });
  it("does not reveal denied destinations through aliases or descriptions", () => {
    const staff = workspaceCommands({ ...user, roles: ["STAFF"] });
    expect(findCommands(staff, "nguoi dung")).toEqual([]);
    expect(findCommands(staff, "catalog")).toEqual([]);
    const operator = workspaceCommands({ ...user, roles: ["TEST_OPERATOR"] });
    expect(findCommands(operator, "dau sach")).toEqual([]);
    expect(findCommands(operator, "nap tien")[0].to).toBe(
      "/simulator/events/topups",
    );
    expect(
      workspaceCommands(user).some((command) =>
        /report|logout/i.test(command.to),
      ),
    ).toBe(false);
  });
  it("keeps stable order for an empty query and distinguishes no results without inventing a destination", () => {
    const commands = workspaceCommands(user);
    expect(findCommands(commands, "   ")).toEqual(commands);
    expect(findCommands(commands, "qwerty không tồn tại")).toEqual([]);
    expect(new Set(commands.map((command) => command.to)).size).toBe(
      commands.length,
    );
  });
});

describe("command palette keyboard and markup", () => {
  it("wraps arrow selection and tolerates zero or one result", () => {
    expect(nextCommandIndex(0, -1, 4)).toBe(3);
    expect(nextCommandIndex(3, 1, 4)).toBe(0);
    expect(nextCommandIndex(0, 1, 1)).toBe(0);
    expect(nextCommandIndex(-1, 1, 0)).toBe(-1);
  });
  it("accepts Ctrl/Cmd K but ignores IME, held keys and unrelated modifier shortcuts", () => {
    const event = {
      key: "k",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      isComposing: false,
    };
    expect(isCommandShortcut(event)).toBe(true);
    expect(
      isCommandShortcut({ ...event, key: "K", ctrlKey: false, metaKey: true }),
    ).toBe(true);
    for (const change of [
      { isComposing: true },
      { repeat: true },
      { altKey: true },
      { shiftKey: true },
      { ctrlKey: false },
      { key: "j" },
    ])
      expect(isCommandShortcut({ ...event, ...change })).toBe(false);
  });
  it("exposes a labelled dialog, input-driven listbox selection and only real role destinations", () => {
    const html = render(user);
    expect(html).toContain("Đi tới đâu?");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain("aria-activedescendant=");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Quản lý người dùng");
    expect(html).not.toContain("Nạp tiền mô phỏng");
    expect(html).not.toContain('href="/logout"');
  });
});
