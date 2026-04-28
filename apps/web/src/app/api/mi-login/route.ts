import { NextResponse } from "next/server";

// Memory storage for verification codes
const globalAny: any = global;
if (!globalAny.miCodes) {
  globalAny.miCodes = new Map<string, { code: string; expires: number }>();
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in memory (expires in 10 minutes)
    globalAny.miCodes.set(email, {
      code,
      expires: Date.now() + 10 * 60 * 1000
    });

    console.log(`[MI-LOGIN] Code for ${email}: ${code}`);
    console.log(`[MI-LOGIN] BREVO_API_KEY exists: ${!!process.env.BREVO_API_KEY}, length: ${(process.env.BREVO_API_KEY || '').length}`);
    console.log(`[MI-LOGIN] BREVO_SENDER_EMAIL: ${process.env.BREVO_SENDER_EMAIL}`);

    // Send email using Brevo API
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY || "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Market Intelligence | Helpdesk Público",
          email: process.env.BREVO_SENDER_EMAIL || "helpdesk.publico@gmail.com",
        },
        to: [{ email: email }],
        subject: "Código de acesso - Market Intelligence | Helpdesk Público",
        htmlContent: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #059669;">Verificação de Acesso</h2>
            <p>Está a receber este e-mail pois solicitou acesso à área de <strong>Market Intelligence</strong> do <strong>Helpdesk Público</strong>.</p>
             <p>Caso necessite de suporte, contacte-nos através dos meios de contactos disponíveis no nosso website, em https://www.helpdeskpublico.pt</p>
            <p>Utilize o código abaixo para completar o seu login:</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; margin: 20px 0; color: #111827;">
              ${code}
            </div>
            <p style="font-size: 12px; color: #6b7280;">Este código expira em 10 minutos. Se você não solicitou este acesso, ignore este email.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[MI-LOGIN] Brevo Error:", errorData);
      return NextResponse.json({ error: "Erro ao enviar email de verificação." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[MI-LOGIN] Unexpected Error:", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
