import oboe from "https://esm.sh/oboe";

async function testFetch() {
  const res = await fetch("https://www.base.gov.pt/APIBase2/GetInfoContrato?Ano=2026", {
     headers: { "_AcessToken": "tdPrNRG3WSQVMHxA6LfsJN3xg" }
  });
  
  if (!res.body) return;
  
  console.log("Starting oboe stream...");
  // oboe needs a Node-like stream or a way to pipe
  // This might be tricky in pure Deno without polyfills
}
