/**
 * test-mi-email.mjs
 * Envia um email de teste do Market Intelligence ao utilizador teste
 * com contratos REAIS da base de dados local para validar o botão "Ver contrato →"
 *
 * Uso: node scripts/test-mi-email.mjs
 */

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const FROM_EMAIL = "helpdesk.publico@gmail.com";
const TO_EMAIL = "silviomorg19@gmail.com";
const TO_NAME = "Silvio (Test)";
const APP_BASE_URL = "http://localhost:3001";

// Supabase local
const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// -------------------------------------------------------------------
// Buscar contratos reais da BD local
// -------------------------------------------------------------------
async function fetchRealContracts() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/contracts?select=id,object,contracting_entities,winners,contract_price,signing_date,execution_deadline_days&signing_date=not.is.null&execution_deadline_days=not.is.null&limit=2`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${res.status} ${err}`);
  }

  return res.json();
}

function cleanName(raw) {
  if (!raw) return "—";
  if (typeof raw === "string") return raw.replace(/^[\s\-\/\.]+/, "").trim();
  if (typeof raw === "object") {
    const val = raw.value ?? raw.label ?? raw.text ?? raw.name;
    if (typeof val === "string") return val.replace(/^[\s\-\/\.]+/, "").trim();
  }
  return "—";
}

// -------------------------------------------------------------------
// Template HTML
// -------------------------------------------------------------------
function buildEmail(contracts) {
  const subject = `[TESTE] Market Intelligence: ${contracts.length} contrato(s) prestes a terminar`;

  const contractRows = contracts.map((c) => {
    const progress = 0.87; // simulado para teste
    const progressPct = Math.round(progress * 100);
    const barColor = progressPct >= 100 ? "#ef4444" : progressPct >= 90 ? "#f59e0b" : "#22c55e";
    const priceStr = c.contract_price
      ? new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(c.contract_price)
      : "N/A";

    const entityRaw = Array.isArray(c.contracting_entities) ? c.contracting_entities[0] : c.contracting_entities;
    const winnerRaw = Array.isArray(c.winners) ? c.winners[0] : c.winners;
    const entity = cleanName(entityRaw);
    const winner = cleanName(winnerRaw);

    const signingDate = new Date(c.signing_date);
    const endDate = new Date(signingDate);
    endDate.setDate(endDate.getDate() + (c.execution_deadline_days || 0));
    const estimatedEndDate = endDate.toISOString().slice(0, 10);

    return `
      <tr>
        <td style="padding:16px; border-bottom:1px solid #e2e8f0;">
          <div style="font-weight:600; color:#1e293b; margin-bottom:4px;">${(c.object || "").slice(0, 100)}${(c.object || "").length > 100 ? "…" : ""}</div>
          <div style="font-size:12px; color:#64748b; margin-bottom:2px;">📋 Entidade: ${entity}</div>
          <div style="font-size:12px; color:#64748b; margin-bottom:6px;">🏆 Vencedor: ${winner}</div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <div style="width:120px; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
              <div style="width:${Math.min(progressPct, 100)}%; height:100%; background:${barColor}; border-radius:4px;"></div>
            </div>
            <span style="font-size:13px; font-weight:700; color:${barColor};">${progressPct}%</span>
          </div>
          <div style="font-size:11px; color:#94a3b8; margin-bottom:10px;">
            Celebração: ${c.signing_date} · Prazo: ${c.execution_deadline_days || "?"} dias · Término estimado: ${estimatedEndDate} · Valor: ${priceStr}
          </div>
          <a href="${APP_BASE_URL}/outros?contract=${c.id}" style="display:inline-block; background:#059669; color:white; padding:6px 14px; border-radius:6px; text-decoration:none; font-size:12px; font-weight:600;">Ver contrato →</a>
        </td>
      </tr>`;
  }).join("");

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 680px; margin: 0 auto; background: #f1f5f9; }
  .container { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
  .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 28px 24px; }
  .header h2 { margin: 0; font-size: 22px; }
  .header p { margin: 6px 0 0; opacity: 0.85; font-size: 14px; }
  .body { padding: 24px; }
  .test-banner { background:#fef3c7; border:1px solid #f59e0b; border-radius:8px; padding:10px 16px; margin-bottom:16px; font-size:13px; color:#92400e; }
  table { width: 100%; border-collapse: collapse; }
  .btn { display: inline-block; background: #059669; color: white; padding: 12px 28px;
         border-radius: 8px; text-decoration: none; margin-top: 16px; font-weight: 600; }
  .footer { font-size: 11px; color: #94a3b8; padding: 16px 24px; text-align: center; }
</style></head>
<body>
  <div class="container">
    <div class="header">
      <h2>⚠️ Alerta Market Intelligence</h2>
      <p>Contratos prestes a terminar o prazo de execução</p>
    </div>
    <div class="body">
      <div class="test-banner">🧪 <strong>Email de Teste</strong> — Contratos reais da BD local. Os botões "Ver contrato →" apontam para ${APP_BASE_URL}/contracts/[id]</div>
      <p>Olá <strong>${TO_NAME}</strong>,</p>
      <p>Foram detetados <strong>${contracts.length} contrato(s)</strong> que atingiram ≥75% do prazo de execução:</p>

      <table>${contractRows}</table>

      <div style="text-align:center; margin-top:24px;">
        <a href="${APP_BASE_URL}/outros" class="btn">Ver todos no Market Intelligence</a>
      </div>
    </div>
    <div class="footer">
      Recebe este email porque está subscrito aos alertas Market Intelligence do Helpdesk Público.<br/>
      Para deixar de receber, contacte-nos em <a href="${APP_BASE_URL}">${APP_BASE_URL}</a>.
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------
async function main() {
  console.log("🔍 A buscar contratos reais da base de dados local...");
  let contracts;
  try {
    contracts = await fetchRealContracts();
  } catch (err) {
    console.error("❌ Não foi possível ligar ao Supabase local:", err.message);
    console.error("   Garante que o Supabase está a correr: npx supabase start");
    process.exit(1);
  }

  if (!contracts || contracts.length === 0) {
    console.error("❌ Nenhum contrato encontrado na base de dados local.");
    process.exit(1);
  }

  console.log(`✅ Encontrados ${contracts.length} contrato(s) reais`);
  contracts.forEach((c) => {
    console.log(`   • ${(c.object || "").slice(0, 70)}… → /contracts/${c.id}`);
  });

  const { subject, html } = buildEmail(contracts);

  console.log(`\n📧 A enviar email de teste para: ${TO_EMAIL}`);
  console.log(`📌 Assunto: ${subject}`);

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Market Intelligence | Helpdesk Público", email: FROM_EMAIL },
      to: [{ email: TO_EMAIL, name: TO_NAME }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("❌ Erro Brevo:", err);
    process.exit(1);
  }

  const data = await res.json();
  console.log("✅ Email enviado com sucesso!");
  console.log("   Message ID:", data.messageId ?? "(sem ID)");
  console.log(`\n💡 Verifica o email em: ${TO_EMAIL}`);
  console.log(`   Clica "Ver contrato →" — abre ${APP_BASE_URL}/contracts/[id]`);
  console.log(`   (Tens de ter sessão MI activa em ${APP_BASE_URL}/login-mi para aceder)`);
}

main();
