import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";

// HMAC secret — uses SUPABASE_SERVICE_ROLE_KEY as a server-side secret
function getHmacSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "mi-login-fallback-secret";
}

function createVerificationToken(email: string, code: string, expiresAt: number): string {
  const payload = `${email}:${code}:${expiresAt}`;
  const hmac = crypto.createHmac("sha256", getHmacSecret()).update(payload).digest("hex");
  const token = Buffer.from(JSON.stringify({ email, expiresAt, hmac })).toString("base64url");
  return token;
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = await createAdminClient();

    // 1. Verify if subscriber exists and is active
    const { data: subscriber, error: dbError } = await supabase
      .from("mi_subscribers")
      .select("id, is_active")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (dbError) {
      console.error("[MI-LOGIN] Database error:", dbError);
      return NextResponse.json({ error: "Erro ao validar subscritor." }, { status: 500 });
    }

    if (!subscriber) {
      return NextResponse.json({ error: "Este email não está autorizado a aceder ao Market Intelligence." }, { status: 403 });
    }

    if (!subscriber.is_active) {
      return NextResponse.json({ error: "A sua subscrição do Market Intelligence está inativa." }, { status: 403 });
    }

    // 2. Generate 6-digit code and sign it (stateless — nothing stored in DB)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    const verificationToken = createVerificationToken(normalizedEmail, code, expiresAt);

    console.log(`[MI-LOGIN] Code for ${normalizedEmail}: ${code}`);

    // 3. Send email using Brevo API
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
          email: process.env.BREVO_SENDER_EMAIL || "helpdesk.publico@11113040.brevosend.com",
        },
        to: [{ email: normalizedEmail }],
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

    // Return the verification token to the client (no DB storage needed)
    return NextResponse.json({ success: true, token: verificationToken });
  } catch (err) {
    console.error("[MI-LOGIN] Unexpected Error:", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
