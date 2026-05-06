import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus, STATUS_LABEL } from "@/lib/announcements";

function raw(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : null;
  return String(value);
}

function pick(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw(payload, key);
    if (value) return value;
  }
  return null;
}

function extractProcedurePiecesUrl(payload: Record<string, unknown>): string | null {
  const detail = payload.detalhe_conteudo;
  if (!detail || typeof detail !== "object") return null;

  const texto = (detail as Record<string, unknown>).Texto;
  if (typeof texto !== "string" || !texto.trim()) return null;

  const labeled = texto.match(/Link\s+para\s+acesso\s+[àa]s\s+pe[cç]as\s+do\s+concurso\s*\(URL\)\s*:\s*(https?:\/\/\S+)/i);
  if (labeled) return labeled[1];

  const acingov = texto.match(/https?:\/\/\S*downloadProcedurePiece\/\S+/i);
  if (acingov) return acingov[0];

  const generic = texto.match(/https?:\/\/\S+/i);
  return generic ? generic[0] : null;
}

function rawFrom(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : null;
  return String(value);
}

function rawBool(payload: Record<string, unknown>, key: string): boolean | null {
  const value = payload[key];
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase().trim();
  if (["sim", "true", "1", "yes"].includes(normalized)) return true;
  if (["não", "nao", "false", "0", "no"].includes(normalized)) return false;
  return null;
}

function displayValue(value?: string | number | boolean | null): string {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

type Section = {
  number: number;
  title: string;
  rows: Array<{ label: unknown; value: string }>;
};

function buildSections(ann: Record<string, unknown>) {
  const rawPayload = (ann.raw_payload ?? {}) as Record<string, unknown>;
  const payload = (rawPayload.payload && typeof rawPayload.payload === "object")
    ? (rawPayload.payload as Record<string, unknown>)
    : rawPayload;
  const cpvList: string[] = Array.isArray(ann.cpv_list) ? (ann.cpv_list as string[]) : [];
  const cpvDisplay = cpvList.length > 0 ? cpvList.join(", ") : displayValue(ann.cpv_main as string | null);
  const lots = Array.isArray(payload.lotes) ? (payload.lotes as Record<string, unknown>[]) : [];
  const lot1 = lots[0] ?? {};
  const lot2 = lots[1] ?? {};
  const displayStatus = effectiveStatus(ann as never);

  const sections: Section[] = [
    {
      number: 1,
      title: "Identificação e contactos da entidade adjudicante",
      rows: [
        ["Designação da entidade adjudicante", ann.entity_name ?? pick(payload, ["designacaoEntidade"])],
        ["NIPC", ann.entity_nif ?? pick(payload, ["nifEntidade"])],
        ["Serviço/Órgão/Pessoa de contacto", pick(payload, ["servicoContacto", "orgaoContacto", "pessoaContacto"])],
        ["Endereço", pick(payload, ["moradaEntidade"])],
        ["Código postal", pick(payload, ["codigoPostalEntidade"])],
        ["Localidade", pick(payload, ["localidadeEntidade"])],
        ["País", pick(payload, ["paisEntidade"])],
        ["NUT III", pick(payload, ["nutIIIEntidade"])],
        ["Distrito", pick(payload, ["distritoEntidade"])],
        ["Concelho", pick(payload, ["concelhoEntidade"])],
        ["Freguesia", pick(payload, ["frEguesiasEntidade", "frEguesias"])],
        ["Telefone", pick(payload, ["telefoneEntidade"])],
        ["Fax", pick(payload, ["faxEntidade"])],
        ["Endereço da Entidade (URL)", pick(payload, ["urlEntidade"])],
        ["Endereço eletrónico", pick(payload, ["emailEntidade"])],
        ["eDelivery Gateway (URL)", pick(payload, ["eDeliveryGateway"])],
        ["Função da organização", pick(payload, ["funcaoOrganizacao"])],
        ["Norma jurídica da entidade adjudicante", pick(payload, ["normaJuridicaEntidade"])],
        ["Área de atividade da autoridade adjudicante", pick(payload, ["areaAtividadeEntidade"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 2,
      title: "Jornal Oficial da União Europeia",
      rows: [["Também é publicado no JOUE?", pick(payload, ["publicacaoJOUE", "publicacaoJornalOficial"])]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 3,
      title: "Aviso",
      rows: [
        ["Modelo de anúncio", pick(payload, ["modeloAnuncio"]) ?? (ann.procedure_type as string | null)],
        ["Data de envio do anúncio", pick(payload, ["dataEnvioAnuncio"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 4,
      title: "Entidades convidadas",
      rows: [["Entidades convidadas", pick(payload, ["entidadesConvidadas", "convidados"])]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 5,
      title: "Processo",
      rows: [
        ["Tipo de procedimento", pick(payload, ["tipoProcedimento"]) ?? (ann.procedure_type as string | null)],
        ["Preço base do procedimento (Sim/Não)", pick(payload, ["PrecoBase", "temPrecoBase"])],
        ["Valor do preço base do procedimento", ann.base_price != null ? `${Number(ann.base_price).toLocaleString("pt-PT")} ${ann.currency ?? "EUR"}` : pick(payload, ["valorPrecoBase"])],
        ["Procedimento com lotes? (Sim/Não)", pick(payload, ["procedimentoComLotes"])],
        ["Nº máx. de lotes autorizado", pick(payload, ["maxLotesAutorizado"])],
        ["Nº máx. de lotes adjudicáveis por concorrente", pick(payload, ["maxLotesPorConcorrente"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 6,
      title: "Objeto do contrato",
      rows: [
        ["Número de referência interna", pick(payload, ["numeroReferenciaInterna", "refInterna"])],
        ["Designação do contrato", ann.title as string | null],
        ["Descrição", (ann.description as string | null) ?? pick(payload, ["descricaoContrato"])],
        ["Tipo de contrato principal", pick(payload, ["tipoContratoPrincipal"])],
        ["Tipo de contrato", (ann.contract_type as string | null) ?? pick(payload, ["tiposContrato"])],
        ["CPV (objeto principal)", cpvDisplay],
        ["Preço base s/IVA (objeto principal)", pick(payload, ["PrecoBaseSemIVA", "precoBaseSemIVA"])],
        ["Identificador do lote 1", rawFrom(lot1, "id") ?? pick(payload, ["identificadorLote1"])],
        ["Descrição do lote 1", rawFrom(lot1, "descricao") ?? pick(payload, ["descricaoLote1"])],
        ["Preço base s/IVA (lote 1)", rawFrom(lot1, "precoBaseSemIva") ?? pick(payload, ["precoBaseLote1"])],
        ["CPV (lote 1)", rawFrom(lot1, "cpv") ?? pick(payload, ["cpvLote1"])],
        ["Identificador do lote 2", rawFrom(lot2, "id") ?? pick(payload, ["identificadorLote2"])],
        ["Descrição do lote 2", rawFrom(lot2, "descricao") ?? pick(payload, ["descricaoLote2"])],
        ["Preço base s/IVA (lote 2)", rawFrom(lot2, "precoBaseSemIva") ?? pick(payload, ["precoBaseLote2"])],
        ["CPV (lote 2)", rawFrom(lot2, "cpv") ?? pick(payload, ["cpvLote2"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 7,
      title: "Indicações adicionais",
      rows: [
        ["Aquisição conjunta? (Sim/Não)", rawBool(payload, "aquisicaoConjunta") ?? pick(payload, ["aquisicaoConjunta"])],
        ["Central de compras? (Sim/Não)", rawBool(payload, "centralCompras") ?? pick(payload, ["centralCompras"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | boolean | null) })),
    },
    {
      number: 8,
      title: "Técnicas",
      rows: [
        ["Acordo-quadro", pick(payload, ["acordoQuadro", "DescrAcordoQuadro"])],
        ["Leilão eletrónico? (Sim/Não)", pick(payload, ["leilaoEletronico"])],
        ["Fase de negociação? (Sim/Não)", pick(payload, ["faseNegociacao"])],
        ["Sistema de aquisição dinâmico", pick(payload, ["sistemAquisicaoDinamico", "SADinamico"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 9,
      title: "Local da execução do contrato (Procedimento)",
      rows: [
        ["País (procedimento)", pick(payload, ["paisExecucao"])],
        ["NUT III (procedimento)", pick(payload, ["nutIIIExecucao"])],
        ["Localidade (procedimento)", pick(payload, ["localidadeExecucao", "localExecucao"])],
        ["Distrito (procedimento)", pick(payload, ["distritoExecucao"])],
        ["Concelho (procedimento)", pick(payload, ["concelhoExecucao"])],
        ["Freguesia (procedimento)", pick(payload, ["frEguesiasExecucao"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 10,
      title: "Prazo de execução",
      rows: [
        ["Prazo de execução do contrato", ann.proposal_deadline_days != null ? `${ann.proposal_deadline_days} dias` : pick(payload, ["PrazoPropostas", "prazoExecucao"])],
        ["Previsão de renovações", pick(payload, ["previsaoRenovacoes"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 11,
      title: "Fundos",
      rows: [["Fundos da União Europeia", pick(payload, ["fundosUE", "fundosUniao"])]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 12,
      title: "Documentos de habilitação",
      rows: [["Habilitação para exercício da atividade profissional", pick(payload, ["habilitacaoAtividade", "documentosHabilitacao"])]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 13,
      title: "Condições de participação",
      rows: [["Condições de participação", pick(payload, ["condicoesParticipacao"])]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 14,
      title: "Apresentação de propostas",
      rows: [
        ["Plataforma eletrónica", pick(payload, ["plataformaEletronica"])],
        ["URL de apresentação", pick(payload, ["urlApresentacao"])],
        ["Propostas variantes", pick(payload, ["propostasVariantes"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 15,
      title: "Prazos da proposta",
      rows: [
        ["Prazo para apresentação de propostas", ann.proposal_deadline_at ? new Date(String(ann.proposal_deadline_at)).toLocaleDateString("pt-PT") : pick(payload, ["prazoApresentacaoPropostas"])],
        ["Prazo de manutenção das propostas", pick(payload, ["prazoManutencaoPropostas"])],
        ["Subcontratação na proposta", pick(payload, ["subcontratacaoProposta"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 16,
      title: "Caução",
      rows: [["Prestação de caução", pick(payload, ["prestacaoCaucao", "caucao"])]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 17,
      title: "Peças do procedimento",
      rows: [[
        "Link para acesso às peças do concurso",
        pick(payload, ["PecasProcedimento", "linkPecasProc"]) ?? extractProcedurePiecesUrl(payload) ?? (ann.detail_url as string | null),
      ]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 18,
      title: "Outros requisitos",
      rows: [["Contratos reservados", pick(payload, ["contratosReservados"])]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 19,
      title: "Critério de adjudicação",
      rows: [
        ["Tipo de critério", pick(payload, ["tipoCriterio", "criterioAdjudicacao"])],
        ["Nome do critério", pick(payload, ["nomeCriterio"])],
        ["Outro nome do critério", pick(payload, ["outroNomeCriterio"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 20,
      title: "Condições do contrato",
      rows: [
        ["Faturação eletrónica", pick(payload, ["faturacaoEletronica"])],
        ["Obrigação de subcontratação", pick(payload, ["obrigacaoSubcontratacao"])],
        ["Código da obrigação de subcontratação", pick(payload, ["codigoObrigacaoSubcontratacao"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 21,
      title: "Compra pública estratégica",
      rows: [
        ["Compra pública estratégica", pick(payload, ["compraPublicaEstrategica"])],
        ["Descrição do processo estratégico", pick(payload, ["descricaoProcessoEstrategico"])],
        ["Critérios ecológicos", pick(payload, ["criteriosEcologicos"])],
        ["Categorias da estratégia nacional", pick(payload, ["categoriasEstrategiaNacional"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 22,
      title: "Acessibilidade e mobilidade",
      rows: [
        ["Diretiva veículos não poluentes", pick(payload, ["diretivaVeiculosNaoPoluentes"])],
        ["Critério de acessibilidade", pick(payload, ["criterioAcessibilidade"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 23,
      title: "Informações adicionais",
      rows: [
        ["Contrato adequado para PME", pick(payload, ["contratoAdequadoPME"])],
        ["Cobertura ACP", pick(payload, ["coberturaACP"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 24,
      title: "Órgão de recursos administrativos",
      rows: [
        ["Designação", pick(payload, ["designacaoOrgaoRecursos"])],
        ["Endereço", pick(payload, ["moradaOrgaoRecursos"])],
        ["Código postal", pick(payload, ["codigoPostalOrgaoRecursos"])],
        ["Localidade", pick(payload, ["localidadeOrgaoRecursos"])],
        ["Telefone", pick(payload, ["telefoneOrgaoRecursos"])],
        ["Fax", pick(payload, ["faxOrgaoRecursos"])],
        ["Endereço eletrónico", pick(payload, ["emailOrgaoRecursos"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 25,
      title: "Serviço de mediação",
      rows: [
        ["Serviço de mediação", pick(payload, ["servicoMediacao"])],
        ["Contacto", pick(payload, ["contactoMediacao"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 26,
      title: "Publicação no portal",
      rows: [
        ["ID BASE", ann.base_announcement_id as string | null],
        ["Nº DR", ann.dr_announcement_no as string | null],
        ["URL do anúncio", ann.detail_url as string | null],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 27,
      title: "Estado e versionamento",
      rows: [
        ["Estado efetivo", STATUS_LABEL[displayStatus] ?? displayStatus],
        ["Fonte", ann.source as string | null],
        ["Atualizado em", ann.updated_at ? new Date(String(ann.updated_at)).toLocaleString("pt-PT") : null],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 28,
      title: "Autor do anúncio",
      rows: [
        ["Nome", pick(payload, ["nomeAutorAnuncio", "autorAnuncio"])],
        ["Cargo", pick(payload, ["cargoAutorAnuncio"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
  ];

  return {
    sections,
    summary: {
      title: displayValue(ann.title as string | null),
      publicationDate: displayValue(ann.publication_date as string | null),
      status: displayValue(STATUS_LABEL[displayStatus] ?? displayStatus),
      entity: displayValue((ann.entity_name as string | null) ?? pick(payload, ["designacaoEntidade"])),
      nipc: displayValue((ann.entity_nif as string | null) ?? pick(payload, ["nifEntidade"])),
      procedureType: displayValue((ann.procedure_type as string | null) ?? pick(payload, ["tipoProcedimento", "modeloAnuncio"])),
    },
  };
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 44;
const TOP_MARGIN = 48;
const BOTTOM_MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const FONT_SIZE = 9;
const LINE_HEIGHT = 12;

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const lines: string[] = [];
  const paragraphs = text.split(/\n+/);

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let currentLine = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const candidate = `${currentLine} ${words[index]}`;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = words[index];
      }
    }
    lines.push(currentLine);
  }

  return lines;
}

function createPage(pdf: PDFDocument) {
  return pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const lines = wrapText(text, font, size, maxWidth);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * (size + 3),
      size,
      font,
      color,
    });
  });
  return lines.length * (size + 3);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: ann } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .single();

  if (!ann) {
    return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  }

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { sections, summary } = buildSections(ann as Record<string, unknown>);

  let page = createPage(pdf);
  let y = PAGE_HEIGHT - TOP_MARGIN;

  page.drawText("BASE Monitor", {
    x: MARGIN_X,
    y,
    size: 18,
    font: bold,
    color: rgb(0.12, 0.33, 0.22),
  });
  y -= 24;

  y -= drawWrapped(page, `Anúncio: ${summary.title}`, MARGIN_X, y, CONTENT_WIDTH, bold, 12, rgb(0.1, 0.1, 0.1));
  y -= 8;

  const headerRows = [
    `Data de publicação: ${summary.publicationDate}`,
    `Estado: ${summary.status}`,
    `Entidade: ${summary.entity}`,
    `NIPC: ${summary.nipc}`,
    `Tipo de procedimento: ${summary.procedureType}`,
  ];

  for (const row of headerRows) {
    y -= drawWrapped(page, row, MARGIN_X, y, CONTENT_WIDTH, regular, 10, rgb(0.32, 0.32, 0.32));
    y -= 4;
  }

  y -= 6;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 1,
    color: rgb(0.86, 0.89, 0.91),
  });
  y -= 20;

  const labelWidth = 190;
  const valueWidth = CONTENT_WIDTH - labelWidth - 16;

  for (const section of sections) {
    const estimatedSectionHeight = 22 + section.rows.length * 26;
    if (y - estimatedSectionHeight < BOTTOM_MARGIN) {
      page = createPage(pdf);
      y = PAGE_HEIGHT - TOP_MARGIN;
    }

    page.drawText(`${section.number}. ${section.title}`, {
      x: MARGIN_X,
      y,
      size: 11,
      font: bold,
      color: rgb(0.12, 0.33, 0.22),
    });
    y -= 18;

    for (const row of section.rows) {
      const labelLines = wrapText(String(row.label ?? "-"), regular, FONT_SIZE, labelWidth);
      const valueLines = wrapText(row.value, bold, FONT_SIZE, valueWidth);
      const rowLineCount = Math.max(labelLines.length, valueLines.length);
      const rowHeight = rowLineCount * LINE_HEIGHT + 10;

      if (y - rowHeight < BOTTOM_MARGIN) {
        page = createPage(pdf);
        y = PAGE_HEIGHT - TOP_MARGIN;
      }

      page.drawRectangle({
        x: MARGIN_X,
        y: y - rowHeight + 5,
        width: CONTENT_WIDTH,
        height: rowHeight,
        borderWidth: 0.7,
        borderColor: rgb(0.88, 0.9, 0.92),
        color: rgb(0.99, 0.99, 1),
      });

      labelLines.forEach((line, index) => {
        page.drawText(line, {
          x: MARGIN_X + 8,
          y: y - 8 - index * LINE_HEIGHT,
          size: FONT_SIZE,
          font: regular,
          color: rgb(0.45, 0.47, 0.5),
        });
      });

      valueLines.forEach((line, index) => {
        page.drawText(line, {
          x: MARGIN_X + labelWidth + 16,
          y: y - 8 - index * LINE_HEIGHT,
          size: FONT_SIZE,
          font: bold,
          color: rgb(0.15, 0.17, 0.2),
        });
      });

      y -= rowHeight + 4;
    }

    y -= 12;
  }

  const bytes = await pdf.save();
  const safeId = String(ann.dr_announcement_no ?? ann.base_announcement_id ?? id).replace(/[^a-zA-Z0-9_-]+/g, "-");

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="anuncio-${safeId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
