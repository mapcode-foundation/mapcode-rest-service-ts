import { describe, it, expect } from "vitest";
import {
  ApiError, ApiInvalidFormatError, ApiNotFoundError,
  ApiForbiddenError, ApiConflictError, ApiIntegerOutOfRangeError,
} from "../src/errors.ts";

describe("ApiError hierarchy", () => {
  it("maps each error to the correct HTTP status", () => {
    expect(new ApiInvalidFormatError("lat", "x", "[-90, 90]").httpStatus).toBe(400);
    expect(new ApiNotFoundError("nope").httpStatus).toBe(404);
    expect(new ApiForbiddenError("nope").httpStatus).toBe(403);
    expect(new ApiConflictError("nope").httpStatus).toBe(409);
    expect(new ApiIntegerOutOfRangeError("count", -1, 0, 10).httpStatus).toBe(400);
  });

  it("are instances of ApiError and Error", () => {
    const e = new ApiNotFoundError("x");
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toBeInstanceOf(Error);
  });

  it("ApiInvalidFormatError includes field/value/expected in its message", () => {
    const e = new ApiInvalidFormatError("lat", "x", "[-90, 90]");
    expect(e.message).toContain("lat");
    expect(e.message).toContain("[-90, 90]");
  });
});
