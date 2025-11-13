import { FiatPipe } from "./fiat.pipe";

describe("FiatPipe", () => {
  it("create an instance", () => {
    const pipe = new FiatPipe("en-US");
    expect(pipe).toBeTruthy();
  });
});
