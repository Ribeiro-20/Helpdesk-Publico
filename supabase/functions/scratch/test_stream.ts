import { parse } from "https://esm.sh/JSONStream";

// Simulating a large JSON array stream
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue('[{"id":1},{"id":2}]');
    controller.close();
  }
});

const parser = parse("*");
// In Deno, we need to adapt the Web Stream to Node stream or find a Deno-native streaming parser.
console.log("Testing streaming parser...");
