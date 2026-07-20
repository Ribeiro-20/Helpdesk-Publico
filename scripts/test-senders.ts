import { config } from "dotenv";
config();

async function sendBrevoEmail(fromEmail) {
  const brevoKey = process.env.BREVO_MI_API_KEY;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": brevoKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: fromEmail,
        name: "Helpdesk Público",
      },
      to: [{ email: "silviomorg19@gmail.com" }],
      subject: `Teste Brevo de: ${fromEmail}`,
      htmlContent: `<p>Este é um teste para verificar se o remetente <b>${fromEmail}</b> entrega emails corretamente.</p>`,
      textContent: `Este é um teste para verificar se o remetente ${fromEmail} entrega emails corretamente.`,
    }),
  });
  const body = await res.text();
  console.log(`[${fromEmail}] Status: ${res.status} | Body: ${body}`);
}

async function run() {
  await sendBrevoEmail("alertas@helpdeskpublico.pt");
  await sendBrevoEmail("marketintelligence@helpdeskpublico.pt");
}
run().catch(console.error);
