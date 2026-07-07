import { readFileSync } from "node:fs";

const raw = JSON.parse(readFileSync("cpv_hierarquia.min.json", "utf-8"));
const cpvs = raw
	.map((cpv) => ({
		id: String(cpv.code ?? cpv.id ?? "").trim(),
		descricao: String(cpv.label ?? cpv.descricao ?? "").trim(),
	}))
	.filter((cpv) => cpv.id && cpv.descricao);

const lines = cpvs.map(c => c.id + "\t" + c.descricao.replace(/\\/g, "\\\\").replace(/\t/g, " "));
process.stdout.write(lines.join("\n") + "\n");
