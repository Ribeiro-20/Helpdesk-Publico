import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Access the shared memory storage
const globalAny: any = global;

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email e código são obrigatórios" }, { status: 400 });
    }

    const storedData = globalAny.miCodes?.get(email);

    if (!storedData) {
      return NextResponse.json({ error: "Código não encontrado ou expirado." }, { status: 400 });
    }

    if (Date.now() > storedData.expires) {
      globalAny.miCodes.delete(email);
      return NextResponse.json({ error: "Código expirado. Solicite um novo." }, { status: 400 });
    }

    if (storedData.code !== code) {
      return NextResponse.json({ error: "Código incorreto." }, { status: 400 });
    }

    // Success! 
    // Delete code from memory
    globalAny.miCodes.delete(email);

    // Set MI session cookie (10 minutes as per previous requirements)
    const response = NextResponse.json({ success: true });
    
    // Using 10 minutes expiry for the session
    cookies().set("mi-session", "active", {
      path: "/",
      maxAge: 60 * 10, // 10 minutes
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  } catch (err) {
    console.error("[MI-VERIFY] Error:", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
