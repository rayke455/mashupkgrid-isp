import { describe, it, expect } from "vitest";
import { parseVlanInterfaceRow } from "../mikrotik/mikrotik.adapter.js";

/**
 * These fixtures are REAL output captured from a MikroTik hAP lite on RouterOS 7.12.1 during the
 * live verification of the VLAN operations, not values copied from documentation. That matters:
 * the trap this file exists to pin is that RouterOS sends booleans as the STRINGS "true"/"false",
 * and the string "false" is truthy in JavaScript. A `Boolean(row.disabled)` check reads every
 * VLAN on the router as disabled, which would make the dashboard confidently show working
 * customer VLANs as down.
 */
describe("parseVlanInterfaceRow", () => {
  const liveRow = {
    ".id": "*1",
    name: "mkgtest-vlan4001",
    "vlan-id": "4001",
    interface: "bridge",
    mtu: "1500",
    disabled: "false",
    running: "true",
    comment: "mashupkgrid verification - safe to delete",
  };

  it("maps a real RouterOS 7.12.1 row to the vendor-agnostic shape", () => {
    expect(parseVlanInterfaceRow(liveRow)).toEqual({
      id: "*1",
      name: "mkgtest-vlan4001",
      vlanId: 4001,
      parentInterface: "bridge",
      mtu: 1500,
      disabled: false,
      running: true,
      comment: "mashupkgrid verification - safe to delete",
    });
  });

  it('reads the STRING "false" as not-disabled, not as truthy', () => {
    expect(parseVlanInterfaceRow({ ...liveRow, disabled: "false" }).disabled).toBe(false);
    expect(parseVlanInterfaceRow({ ...liveRow, disabled: "true" }).disabled).toBe(true);
  });

  it('reads the STRING "false" for running the same way', () => {
    expect(parseVlanInterfaceRow({ ...liveRow, running: "false" }).running).toBe(false);
  });

  it("returns vlanId as a number so comparisons against our own vlanTag column work", () => {
    const parsed = parseVlanInterfaceRow(liveRow);
    expect(parsed.vlanId).toBe(4001);
    // The guard in removeVlanInterface compares with !==, which a string would always fail.
    expect(parsed.vlanId === 4001).toBe(true);
  });

  it("omits optional fields RouterOS did not send rather than inventing defaults", () => {
    // A VLAN created without an explicit comment simply has no comment key in the reply.
    const sparse = { ".id": "*2", name: "v20", "vlan-id": "20", interface: "ether2", disabled: "false" };
    const parsed = parseVlanInterfaceRow(sparse);
    expect(parsed).not.toHaveProperty("comment");
    expect(parsed).not.toHaveProperty("mtu");
    expect(parsed).not.toHaveProperty("running");
  });

  it("degrades safely on a row missing everything, rather than throwing mid-provisioning", () => {
    const parsed = parseVlanInterfaceRow({});
    expect(parsed.id).toBe("");
    expect(parsed.vlanId).toBe(0);
    expect(parsed.disabled).toBe(false);
  });
});
