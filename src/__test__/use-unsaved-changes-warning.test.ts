import { isLeavingClick, type LeavingClick } from "@/hooks/use-unsaved-changes-warning";

function click(overrides: Partial<LeavingClick> = {}): LeavingClick {
  return {
    button: 0,
    modifierKey: false,
    defaultPrevented: false,
    isLink: true,
    href: "/butterfly-haven/dashboard",
    ...overrides,
  };
}

describe("isLeavingClick", () => {
  it("guards a plain click on an in-app link", () => {
    expect(isLeavingClick(click())).toBe(true);
  });

  it("ignores clicks that hit no link", () => {
    expect(isLeavingClick(click({ isLink: false }))).toBe(false);
  });

  it("ignores clicks that open the link elsewhere", () => {
    expect(isLeavingClick(click({ modifierKey: true }))).toBe(false);
    expect(isLeavingClick(click({ button: 1 }))).toBe(false);
    expect(isLeavingClick(click({ linkTarget: "_blank" }))).toBe(false);
  });

  it("allows an explicit _self target through", () => {
    expect(isLeavingClick(click({ linkTarget: "_self" }))).toBe(true);
  });

  it("ignores same-page anchors", () => {
    expect(isLeavingClick(click({ href: "#contact" }))).toBe(false);
  });

  it("ignores clicks another handler already cancelled", () => {
    expect(isLeavingClick(click({ defaultPrevented: true }))).toBe(false);
  });
});
