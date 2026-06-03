import postgres from "postgres";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "..", ".env") });

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString);

async function main() {
  try {
    // 1. Get default tenant ID
    const tenants = await sql`SELECT id FROM tenants LIMIT 1`;
    if (tenants.length === 0) {
      console.error("No tenant found. Run bootstrap first.");
      process.exit(1);
    }
    const tenantId = tenants[0].id;

    // 2. Clear existing mock contracts to start fresh
    await sql`DELETE FROM contracts WHERE object LIKE 'MOCK - %'`;

    const today = new Date();
    
    // Helper to format date as YYYY-MM-DD
    const formatDate = (date: Date) => date.toISOString().slice(0, 10);

    // Calculate signing dates
    const date80Pct = new Date(today);
    date80Pct.setDate(today.getDate() - 80);

    const date95Pct = new Date(today);
    date95Pct.setDate(today.getDate() - 95);

    const date50Pct = new Date(today);
    date50Pct.setDate(today.getDate() - 50);

    const date110Pct = new Date(today);
    date110Pct.setDate(today.getDate() - 110);

    // Mock records
    const mockContracts = [
      {
        tenant_id: tenantId,
        source: "MOCK_API",
        base_contract_id: "mock-1",
        object: "MOCK - Aquisição de Licenças de Software Educativo (80% Executado)",
        description: "Licenciamento de software para escolas primárias",
        procedure_type: "Concurso Público",
        contract_type: "Serviços",
        publication_date: formatDate(date80Pct),
        signing_date: formatDate(date80Pct),
        base_price: 15000.00,
        contract_price: 12500.00,
        currency: "EUR",
        contracting_entities: ["Câmara Municipal de Lisboa"],
        winners: ["501234567 - Software Portugal S.A."],
        cpv_main: "48000000-8",
        cpv_list: ["48000000-8"],
        execution_deadline_days: 100,
        status: "active"
      },
      {
        tenant_id: tenantId,
        source: "MOCK_API",
        base_contract_id: "mock-2",
        object: "MOCK - Remodelação das Instalações da Fundação INATEL (95% Executado)",
        description: "Obras de conservação do pavilhão gimnodesportivo",
        procedure_type: "Consulta Prévia",
        contract_type: "Obras Públicas",
        publication_date: formatDate(date95Pct),
        signing_date: formatDate(date95Pct),
        base_price: 45000.00,
        contract_price: 42000.00,
        currency: "EUR",
        contracting_entities: ["Fundação INATEL"],
        winners: ["502345678 - Obras & Construções Lda."],
        cpv_main: "45000000-7",
        cpv_list: ["45000000-7"],
        execution_deadline_days: 100,
        status: "active"
      },
      {
        tenant_id: tenantId,
        source: "MOCK_API",
        base_contract_id: "mock-3",
        object: "MOCK - Fornecimento de Papel Multifunções (50% Executado)",
        description: "Consumíveis de escritório para os serviços centrais",
        procedure_type: "Ajuste Direto",
        contract_type: "Fornecimentos",
        publication_date: formatDate(date50Pct),
        signing_date: formatDate(date50Pct),
        base_price: 2500.00,
        contract_price: 2200.00,
        currency: "EUR",
        contracting_entities: ["Instituto Politécnico do Porto"],
        winners: ["503456789 - Papelaria Global S.A."],
        cpv_main: "30197630-1",
        cpv_list: ["30197630-1"],
        execution_deadline_days: 100,
        status: "active"
      },
      {
        tenant_id: tenantId,
        source: "MOCK_API",
        base_contract_id: "mock-4",
        object: "MOCK - Aquisição de Fardamento de Proteção Civil (110% Executado - Excedido)",
        description: "Fardas e botas de proteção para bombeiros voluntários",
        procedure_type: "Concurso Público",
        contract_type: "Fornecimentos",
        publication_date: formatDate(date110Pct),
        signing_date: formatDate(date110Pct),
        base_price: 35000.00,
        contract_price: 33000.00,
        currency: "EUR",
        contracting_entities: ["Câmara Municipal de Castro Marim"],
        winners: ["504567890 - Têxteis Seguros Lda."],
        cpv_main: "18143000-3",
        cpv_list: ["18143000-3"],
        execution_deadline_days: 100,
        status: "active"
      }
    ];

    console.log("Seeding mock contracts...");
    for (const c of mockContracts) {
      await sql`
        INSERT INTO contracts (
          tenant_id, source, base_contract_id, object, description, 
          procedure_type, contract_type, publication_date, signing_date, 
          base_price, contract_price, currency, contracting_entities, 
          winners, cpv_main, cpv_list, execution_deadline_days, status, raw_payload, raw_hash
        ) VALUES (
          ${c.tenant_id}, ${c.source}, ${c.base_contract_id}, ${c.object}, ${c.description},
          ${c.procedure_type}, ${c.contract_type}, ${c.publication_date}, ${c.signing_date},
          ${c.base_price}, ${c.contract_price}, ${c.currency}, ${c.contracting_entities},
          ${c.winners}, ${c.cpv_main}, ${c.cpv_list}, ${c.execution_deadline_days}, ${c.status},
          '{}'::jsonb, 'mock_hash'
        )
      `;
      console.log(`Inserted: "${c.object}"`);
    }

    console.log("\nMock contracts successfully seeded!");
  } catch (err: any) {
    console.error("Error seeding contracts:", err.message);
  } finally {
    await sql.end();
  }
}

main();
