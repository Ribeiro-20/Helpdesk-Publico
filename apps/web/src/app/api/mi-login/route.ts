import { NextResponse } from "next/server";

// Memory storage for verification codes
const globalAny: any = global;
if (!globalAny.miCodes) {
  globalAny.miCodes = new Map<string, { code: string; expires: number }>();
}

// ---------------------------------------------------------------------------
// HubSpot helpers — validate email belongs to MI segment
// ---------------------------------------------------------------------------

const HUBSPOT_BASE = "https://api.hubapi.com";

async function hubspotFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = payload?.message ?? payload?.error ?? text;
    throw new Error(`HubSpot ${res.status}: ${msg}`);
  }

  return payload as T;
}

/**
 * Check if an email belongs to a contact in the given HubSpot segment/list.
 * Returns the contact name if found, null otherwise.
 */
async function isEmailInMiSegment(
  email: string,
  token: string,
  segmentId: string,
): Promise<{ found: boolean; contactName: string | null }> {
  // 1. Search for the contact by email
  const searchResult = await hubspotFetch<{
    total: number;
    results?: Array<{ id: string; properties?: Record<string, string | null> }>;
  }>("/crm/v3/objects/contacts/search", token, {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            { propertyName: "email", operator: "EQ", value: email },
          ],
        },
      ],
      properties: ["firstname", "lastname", "email"],
      limit: 1,
    }),
  });

  if (!searchResult.results || searchResult.results.length === 0) {
    return { found: false, contactName: null };
  }

  const contact = searchResult.results[0];
  const contactId = contact.id;
  const firstName = contact.properties?.firstname ?? "";
  const lastName = contact.properties?.lastname ?? "";
  const contactName = [firstName, lastName].filter(Boolean).join(" ").trim() || email;

  // 2. Fetch all member IDs from the MI segment and check if this contact is in it
  let after: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "250" });
    if (after) params.set("after", after);

    const page = await hubspotFetch<{
      results?: Array<{ recordId?: string; objectId?: string; id?: string }>;
      paging?: { next?: { after?: string } };
    }>(`/crm/v3/lists/${segmentId}/memberships?${params.toString()}`, token);

    const members = page.results ?? [];
    for (const m of members) {
      const memberId = String(m.recordId ?? m.objectId ?? m.id ?? "");
      if (memberId === contactId) {
        return { found: true, contactName };
      }
    }

    after = page.paging?.next?.after ?? null;
  } while (after);

  return { found: false, contactName };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
    }

    // Validate against HubSpot MI segment
    const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN ?? "";
    const miSegmentId = process.env.HUBSPOT_MI_SEGMENT_ID ?? "";

    if (!hubspotToken || !miSegmentId) {
      console.error("[MI-LOGIN] HUBSPOT_ACCESS_TOKEN or HUBSPOT_MI_SEGMENT_ID not configured");
      return NextResponse.json(
        { error: "Serviço de autenticação indisponível. Contacte o administrador." },
        { status: 503 },
      );
    }

    console.log(`[MI-LOGIN] Validating ${email} against HubSpot segment ${miSegmentId}...`);

    const { found, contactName } = await isEmailInMiSegment(email, hubspotToken, miSegmentId);

    if (!found) {
      console.log(`[MI-LOGIN] Email ${email} NOT found in MI segment ${miSegmentId}`);
      return NextResponse.json(
        { error: "Este email não está registado como subscritor de Market Intelligence." },
        { status: 403 },
      );
    }

    console.log(`[MI-LOGIN] ✓ Email ${email} found in MI segment (${contactName})`);

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in memory (expires in 10 minutes)
    globalAny.miCodes.set(email, {
      code,
      expires: Date.now() + 10 * 60 * 1000
    });

    console.log(`[MI-LOGIN] Code for ${email}: ${code}`);

    // Send email using Brevo API with the official no-reply sender
    const senderEmail = process.env.BREVO_SENDER_EMAIL || "no-reply@helpdeskpublico.pt";
    const apiKey = process.env.BREVO_API_KEY || "";

    console.log(`[MI-LOGIN] Using sender: ${senderEmail}`);
    console.log(`[MI-LOGIN] API key present: ${apiKey ? "yes" : "no"}`);

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Helpdesk Público",
          email: senderEmail,
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
