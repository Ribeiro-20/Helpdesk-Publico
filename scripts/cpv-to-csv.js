const fs = require("fs");
const cpvs = JSON.parse(fs.readFileSync("cpvs_final.json", "utf-8"));
const lines = cpvs.map(c => c.id + "\t" + c.descricao.replace(/\\/g, "\\\\").replace(/\t/g, " "));
process.stdout.write(lines.join("\n") + "\n");
