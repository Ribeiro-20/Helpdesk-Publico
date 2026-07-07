import Link from "next/link";
import Header from "@/components/layout/Header";
import PublicFooter from "@/components/layout/PublicFooter";

const CSS = `
  #hp-404-page {
    width: 100%;
    min-height: calc(100vh - 220px);
    padding: 86px 20px 92px 20px;
    background:
      radial-gradient(circle at top left, rgba(47, 82, 24, 0.10), transparent 34%),
      linear-gradient(180deg, #f7fbf8 0%, #ffffff 100%);
    box-sizing: border-box;
    font-family: Arial, Helvetica, sans-serif;
    color: #24311f;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow: hidden;
    position: relative;
    z-index: 0;
    isolation: isolate;
  }
  #hp-404-page * { box-sizing: border-box; }
  #hp-404-page .hp-404-wrap {
    width: 100%;
    max-width: 860px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }
  #hp-404-page .hp-404-card {
    position: relative;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(47, 82, 24, 0.16);
    border-radius: 30px;
    padding: 58px 42px 52px 42px;
    box-shadow: 0 24px 70px rgba(36, 49, 31, 0.12);
    overflow: hidden;
  }
  #hp-404-page .hp-404-card::before {
    content: "";
    position: absolute;
    top: -90px; right: -90px;
    width: 230px; height: 230px;
    border-radius: 50%;
    background: rgba(47, 82, 24, 0.08);
    z-index: 0;
  }
  #hp-404-page .hp-404-card::after {
    content: "";
    position: absolute;
    left: -60px; bottom: -70px;
    width: 190px; height: 190px;
    border-radius: 50%;
    background: rgba(47, 82, 24, 0.055);
    z-index: 0;
  }
  #hp-404-page .hp-404-inner { position: relative; z-index: 2; }
  #hp-404-page .hp-404-stamp {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 156px; height: 156px;
    margin: 0 auto 22px auto;
    border: 5px solid #2f5218;
    border-radius: 50%;
    color: #2f5218;
    font-size: 44px;
    line-height: 1;
    font-weight: 800;
    letter-spacing: -1px;
    transform: rotate(-8deg);
    position: relative;
    background: rgba(247, 251, 248, 0.88);
  }
  #hp-404-page .hp-404-stamp::before {
    content: "";
    position: absolute;
    inset: 12px;
    border: 2px dashed rgba(47, 82, 24, 0.45);
    border-radius: 50%;
  }
  #hp-404-page .hp-404-status {
    display: inline-block;
    margin: 0 auto 24px auto;
    padding: 8px 16px;
    border-radius: 999px;
    background: #eef6ec;
    border: 1px solid rgba(47, 82, 24, 0.18);
    color: #2f5218;
    font-size: 13px;
    line-height: 1.35;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  #hp-404-page h1 {
    margin: 0 0 18px 0;
    color: #24311f;
    font-size: 42px;
    line-height: 1.12;
    font-weight: 800;
    letter-spacing: -0.035em;
  }
  #hp-404-page .hp-404-text {
    max-width: 720px;
    margin: 0 auto;
    color: #4f5f47;
    font-size: 18px;
    line-height: 1.65;
    font-weight: 400;
  }
  #hp-404-page .hp-404-text strong { color: #2f5218; font-weight: 700; }
  #hp-404-page .hp-404-actions {
    margin-top: 34px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  #hp-404-page .hp-404-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    padding: 15px 32px;
    border-radius: 999px;
    background: linear-gradient(135deg, #2f5218 0%, #3f6f27 100%);
    color: #ffffff;
    text-decoration: none;
    font-size: 15px;
    line-height: 1.2;
    font-weight: 800;
    border: 1px solid rgba(47, 82, 24, 0.95);
    box-shadow: 0 16px 34px rgba(47, 82, 24, 0.28);
    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    position: relative;
    overflow: hidden;
  }
  #hp-404-page .hp-404-btn::after {
    content: "›";
    display: inline-block;
    margin-left: 10px;
    font-size: 22px;
    line-height: 1;
    font-weight: 700;
    transform: translateY(-1px);
  }
  #hp-404-page .hp-404-btn:hover {
    background: linear-gradient(135deg, #243f13 0%, #2f5218 100%);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 20px 40px rgba(47, 82, 24, 0.34);
  }
  #hp-404-page .hp-404-btn-outline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    padding: 15px 32px;
    border-radius: 999px;
    background: transparent;
    color: #2f5218;
    text-decoration: none;
    font-size: 15px;
    line-height: 1.2;
    font-weight: 800;
    border: 2px solid #2f5218;
    transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease;
  }
  #hp-404-page .hp-404-btn-outline::after {
    content: "›";
    display: inline-block;
    margin-left: 10px;
    font-size: 22px;
    line-height: 1;
    font-weight: 700;
    transform: translateY(-1px);
  }
  #hp-404-page .hp-404-btn-outline:hover {
    background: #2f5218;
    color: #ffffff;
    transform: translateY(-2px);
  }
  #hp-404-page .hp-404-note {
    margin: 24px auto 0 auto;
    color: #6b7665;
    font-size: 14px;
    line-height: 1.55;
  }
  #hp-404-page .hp-mobile-break { display: none; }
  @media (min-width: 561px) {
    #hp-404-page .hp-desktop-tablet-break { display: block; }
  }
  @media (max-width: 900px) {
    #hp-404-page { min-height: auto; padding: 26px 18px 42px 18px; }
    #hp-404-page .hp-404-card { padding: 48px 30px 44px 30px; border-radius: 26px; }
    #hp-404-page .hp-404-stamp { width: 138px; height: 138px; font-size: 39px; }
    #hp-404-page h1 { font-size: 34px; }
    #hp-404-page .hp-404-text { font-size: 17px; }
  }
  @media (max-width: 560px) {
    #hp-404-page { min-height: calc(100vh - 180px); padding: 82px 14px 68px 14px; }
    #hp-404-page .hp-404-card { padding: 38px 20px 36px 20px; border-radius: 22px; }
    #hp-404-page .hp-404-stamp { width: 118px; height: 118px; margin-bottom: 20px; font-size: 34px; border-width: 4px; }
    #hp-404-page .hp-404-stamp::before { inset: 10px; }
    #hp-404-page .hp-404-status { font-size: 11px; padding: 8px 14px; margin-bottom: 20px; line-height: 1.32; }
    #hp-404-page .hp-404-status .hp-mobile-break { display: block; }
    #hp-404-page h1 { font-size: 29px; line-height: 1.16; margin-bottom: 16px; }
    #hp-404-page .hp-404-text { font-size: 16px; line-height: 1.58; }
    #hp-404-page .hp-404-actions { margin-top: 28px; }
    #hp-404-page .hp-404-btn,
    #hp-404-page .hp-404-btn-outline {
      width: 100%;
      max-width: 300px;
      min-height: 52px;
      padding: 15px 20px;
      text-align: center;
    }
    #hp-404-page .hp-404-note { font-size: 13px; }
    #hp-404-page .hp-desktop-tablet-break { display: none; }
  }
`;

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Header />

      <section id="hp-404-page">
        <div className="hp-404-wrap">
          <div className="hp-404-card">
            <div className="hp-404-inner">
              <div className="hp-404-stamp" aria-hidden="true">404</div>

              <div className="hp-404-status">
                Estado do procedimento:
                <span className="hp-mobile-break" />
                não adjudicado
              </div>

              <h1>
                Não foi possível adjudicar
                <span className="hp-desktop-tablet-break" />
                esta página
              </h1>

              <p className="hp-404-text">
                O conteúdo que procura poderá ter sido removido,
                <span className="hp-desktop-tablet-break" />
                alterado ou movido para outro endereço.
                <br />
                <strong>Entretanto, o Helpdesk Público continua operacional.</strong>
              </p>

              <div className="hp-404-actions">
                <Link href="/mp" className="hp-404-btn">
                  Mercado Público
                </Link>
                <a
                  href="https://www.helpdeskpublico.pt/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hp-404-btn-outline"
                >
                  Helpdesk Público
                </a>
              </div>

              <p className="hp-404-note">
                Pode também continuar a navegar através do menu principal.
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
