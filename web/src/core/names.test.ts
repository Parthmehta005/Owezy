import { describe, expect, it } from "vitest";
import { addNames, validateNames } from "./names";

describe("validateNames", () => {
  // test_logic.py: TestNames.test_valid_names
  it("accepts 2 or more distinct names", () => {
    expect(validateNames(["Parth", "Rahul"])).toEqual(["Parth", "Rahul"]);
  });

  // test_logic.py: TestNames.test_too_few_names
  it("requires at least 2 names", () => {
    expect(() => validateNames(["Parth"])).toThrow("Enter at least 2 names.");
    expect(() => validateNames([])).toThrow("Enter at least 2 names.");
  });

  // test_logic.py: TestNames.test_duplicates_case_insensitive
  it("rejects case-insensitive duplicates", () => {
    expect(() => validateNames(["Parth", "Rahul", "parth"])).toThrow("Duplicate name: parth");
  });

  it("trims names and rejects empty ones", () => {
    expect(validateNames([" Parth ", "Rahul"])).toEqual(["Parth", "Rahul"]);
    expect(() => validateNames(["Parth", "  "])).toThrow("Names cannot be empty.");
    expect(() => validateNames(["Parth", " parth"])).toThrow("Duplicate name");
  });
});

describe("addNames", () => {
  // test_logic.py: TestNames.test_add_names_appends_in_order
  it("appends new names in order without mutating the input", () => {
    const existing = ["Parth", "Rahul"];
    expect(addNames(existing, ["Aditi", "Neha"])).toEqual(["Parth", "Rahul", "Aditi", "Neha"]);
    expect(existing).toEqual(["Parth", "Rahul"]);
  });

  // test_logic.py: TestNames.test_add_names_rejects_empty
  it("requires at least 1 new name", () => {
    expect(() => addNames(["Parth", "Rahul"], [])).toThrow("Enter at least 1 name.");
  });

  // test_logic.py: TestNames.test_add_names_rejects_existing_case_insensitive
  it("rejects a name already in the group, ignoring case", () => {
    expect(() => addNames(["Parth", "Rahul"], ["rahul"])).toThrow("Duplicate name: rahul");
  });

  // test_logic.py: TestNames.test_add_names_rejects_duplicates_among_new
  it("rejects duplicates among the new names", () => {
    expect(() => addNames(["Parth", "Rahul"], ["Aditi", "ADITI"])).toThrow("Duplicate name: ADITI");
  });

  it("trims new names", () => {
    expect(addNames(["Parth"], ["  Aditi "])).toEqual(["Parth", "Aditi"]);
  });
});
