import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus, STATUS_LABEL } from "@/lib/announcements";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function raw(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : null;
  const normalized = String(value).trim();
  return normalized || null;
}

function pick(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw(payload, key);
    if (value) return value;
  }
  return null;
}

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDetailLabelMap(text: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const line of text.split(/\r?\n/)) {
    const colon = line.match(/^\s*([^:]{2,160})\s*:\s*(.+?)\s*$/);
    if (colon) {
      const key = normalizeLabel(colon[1]);
      const value = colon[2].trim();
      if (value && value !== "-" && !map.has(key)) map.set(key, value);
      continue;
    }

    const question = line.match(/^\s*(.+\?)\s+(.+?)\s*$/);
    if (question) {
      const key = normalizeLabel(question[1]);
      const value = question[2].trim();
      if (value && value !== "-" && !map.has(key)) map.set(key, value);
    }
  }

  return map;
}

function extractSectionText(text: string, sectionNumber: number): string {
  const escapedNumber = String(sectionNumber).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(`(?:^|\\n)\\s*${escapedNumber}\\s*-([\\s\\S]*?)(?=\\n\\s*\\d+\\s*-|$)`, "i");
  const match = text.match(rx);
  return match ? match[0] : "";
}

function pickFromDetailMap(detailMap: Map<string, string>, labels: string[]): string | null {
  for (const label of labels) {
    const found = detailMap.get(normalizeLabel(label));
    if (found) return found;
  }

  return null;
}

function extractProcedurePiecesUrl(payload: Record<string, unknown>): string | null {
  const detail = asRecord(payload.detalhe_conteudo);
  const texto = detail?.Texto;
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
  const detalhe = asRecord(payload.detalhe_conteudo);
  const detalheTexto = typeof detalhe?.Texto === "string" ? detalhe.Texto : "";
  const detailMap = parseDetailLabelMap(detalheTexto);
  const fromDetail = (labels: string[]) => pickFromDetailMap(detailMap, labels);
  const resolve = (keys: string[], labels: string[] = []) => pick(payload, keys) ?? (labels.length > 0 ? fromDetail(labels) : null);
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
        ["Designação da entidade adjudicante", ann.entity_name ?? resolve(["designacaoEntidade"], ["Designação da entidade adjudicante"])],
        ["NIPC", ann.entity_nif ?? resolve(["nifEntidade"], ["NIPC"])],
        ["Serviço/Órgão/Pessoa de contacto", resolve(["servicoContacto", "orgaoContacto", "pessoaContacto"], ["Serviço/Órgão/Pessoa de contacto"])],
        ["Endereço", resolve(["moradaEntidade"], ["Endereço"])],
        ["Código postal", resolve(["codigoPostalEntidade"], ["Código postal"])],
        ["Localidade", resolve(["localidadeEntidade"], ["Localidade"])],
        ["País", resolve(["paisEntidade"], ["País"])],
        ["NUT III", resolve(["nutIIIEntidade"], ["NUT III"])],
        ["Distrito", resolve(["distritoEntidade"], ["Distrito"])],
        ["Concelho", resolve(["concelhoEntidade"], ["Concelho"])],
        ["Freguesia", resolve(["frEguesiasEntidade", "frEguesias"], ["Freguesia"])],
        ["Telefone", resolve(["telefoneEntidade"], ["Telefone"])],
        ["Fax", resolve(["faxEntidade"], ["Fax"])],
        ["Endereço da Entidade (URL)", resolve(["urlEntidade"], ["Endereço da Entidade (URL)"])],
        ["Endereço eletrónico", resolve(["emailEntidade"], ["Endereço eletrónico", "Endereço Eletrónico"])],
        ["eDelivery Gateway (URL)", resolve(["eDeliveryGateway"], ["eDelivery Gateway (URL)"])],
        ["Função da organização", resolve(["funcaoOrganizacao"], ["Função da organização", "Função da Organização"])],
        ["Norma jurídica da entidade adjudicante", resolve(["normaJuridicaEntidade"], ["Norma jurídica da entidade adjudicante", "Norma jurídica da Entidade Adjudicante"])],
        ["Área de atividade da autoridade adjudicante", resolve(["areaAtividadeEntidade"], ["Área de atividade da autoridade adjudicante", "Área de atividade da Autoridade Adjudicante"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 2,
      title: "Jornal Oficial da União Europeia",
      rows: [["Também é publicado no JOUE?", resolve(["publicacaoJOUE", "publicacaoJornalOficial"], ["Também é publicado no JOUE?"]) ]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 3,
      title: "Aviso",
      rows: [
        ["Modelo de anúncio", resolve(["modeloAnuncio"], ["Modelo de anúncio"]) ?? (ann.procedure_type as string | null)],
        ["Data de envio do anúncio", resolve(["dataEnvioAnuncio"], ["Data de envio do anúncio"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 4,
      title: "Entidades convidadas",
      rows: [["Entidades convidadas", resolve(["entidadesConvidadas", "convidados"], ["Entidades convidadas"]) ]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 5,
      title: "Processo",
      rows: [
        ["Tipo de procedimento", resolve(["tipoProcedimento"], ["Tipo de procedimento"]) ?? (ann.procedure_type as string | null)],
        ["Preço base do procedimento (Sim/Não)", resolve(["PrecoBase", "temPrecoBase"], ["Preço base do procedimento (Sim/Não)", "Preço base do procedimento"])],
        ["Valor do preço base do procedimento", ann.base_price != null ? `${Number(ann.base_price).toLocaleString("pt-PT")} ${ann.currency ?? "EUR"}` : resolve(["valorPrecoBase"], ["Valor do preço base do procedimento"])],
        ["Procedimento com lotes? (Sim/Não)", resolve(["procedimentoComLotes"], ["Procedimento com lotes? (Sim/Não)", "Procedimento com lotes?"])],
        ["Nº máx. de lotes autorizado", resolve(["maxLotesAutorizado"], ["Nº máx. de lotes autorizado", "Nº Máx. de Lotes Autorizado"])],
        ["Nº máx. de lotes adjudicáveis por concorrente", resolve(["maxLotesPorConcorrente"], ["Nº máx. de lotes adjudicáveis por concorrente", "Número máximo de lotes que podem ser adjudicados a um concorrente"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 6,
      title: "Objeto do contrato",
      rows: [
        ["Número de referência interna", resolve(["numeroReferenciaInterna", "refInterna"], ["Número de referência interna"])],
        ["Designação do contrato", ann.title as string | null],
        ["Descrição", (ann.description as string | null) ?? resolve(["descricaoContrato"], ["Descrição", "Sumário"])],
        ["Tipo de contrato principal", resolve(["tipoContratoPrincipal"], ["Tipo de contrato principal", "Tipo de Contrato Principal"])],
        ["Tipo de contrato", (ann.contract_type as string | null) ?? resolve(["tiposContrato"], ["Tipo de contrato", "Tipo de Contrato"])],
        ["CPV (objeto principal)", cpvDisplay],
        ["Preço base s/IVA (objeto principal)", resolve(["PrecoBaseSemIVA", "precoBaseSemIVA"], ["Preço base s/IVA (objeto principal)", "Preço base s/IVA"])],
        ["Identificador do lote 1", rawFrom(lot1, "id") ?? resolve(["identificadorLote1"], ["Identificador do lote 1", "Identificador do lote"])],
        ["Descrição do lote 1", rawFrom(lot1, "descricao") ?? resolve(["descricaoLote1"], ["Descrição do lote 1", "Descrição do lote"])],
        ["Preço base s/IVA (lote 1)", rawFrom(lot1, "precoBaseSemIva") ?? resolve(["precoBaseLote1"], ["Preço base s/IVA (lote 1)", "Preço base s/IVA (lote)"])],
        ["CPV (lote 1)", rawFrom(lot1, "cpv") ?? resolve(["cpvLote1"], ["CPV (lote 1)", "CPV (lote)"])],
        ["Identificador do lote 2", rawFrom(lot2, "id") ?? resolve(["identificadorLote2"], ["Identificador do lote 2"])],
        ["Descrição do lote 2", rawFrom(lot2, "descricao") ?? resolve(["descricaoLote2"], ["Descrição do lote 2"])],
        ["Preço base s/IVA (lote 2)", rawFrom(lot2, "precoBaseSemIva") ?? resolve(["precoBaseLote2"], ["Preço base s/IVA (lote 2)"])],
        ["CPV (lote 2)", rawFrom(lot2, "cpv") ?? resolve(["cpvLote2"], ["CPV (lote 2)"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 7,
      title: "Indicações adicionais",
      rows: [
        ["Aquisição conjunta? (Sim/Não)", rawBool(payload, "aquisicaoConjunta") ?? resolve(["aquisicaoConjunta"], ["Aquisição conjunta? (Sim/Não)", "O contrato envolve aquisição conjunta (satisfação de várias entidades)?"])],
        ["Central de compras? (Sim/Não)", rawBool(payload, "centralCompras") ?? resolve(["centralCompras"], ["Central de compras? (Sim/Não)", "O contrato é adjudicado por uma central de compras?"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | boolean | null) })),
    },
    {
      number: 8,
      title: "Técnicas",
      rows: [
        ["Acordo-quadro", resolve(["acordoQuadro", "DescrAcordoQuadro"], ["Acordo-quadro", "O concurso destina-se à celebração de um acordo-quadro?"])],
        ["Leilão eletrónico? (Sim/Não)", resolve(["leilaoEletronico"], ["Leilão eletrónico? (Sim/Não)", "É utilizado um leilão eletrónico?"])],
        ["Fase de negociação? (Sim/Não)", resolve(["faseNegociacao"], ["Fase de negociação? (Sim/Não)", "É adotada uma fase de negociação?"])],
        ["Sistema de aquisição dinâmico", resolve(["sistemAquisicaoDinamico", "SADinamico"], ["Sistema de aquisição dinâmico", "Sistema de Aquisição Dinâmico"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 9,
      title: "Local da execução do contrato (Procedimento)",
      rows: [
        ["País (procedimento)", resolve(["paisExecucao"], ["País (procedimento)", "País"])],
        ["NUT III (procedimento)", resolve(["nutIIIExecucao"], ["NUT III (procedimento)", "NUT III"])],
        ["Localidade (procedimento)", resolve(["localidadeExecucao", "localExecucao"], ["Localidade (procedimento)", "Localidade"])],
        ["Distrito (procedimento)", resolve(["distritoExecucao"], ["Distrito (procedimento)", "Distrito"])],
        ["Concelho (procedimento)", resolve(["concelhoExecucao"], ["Concelho (procedimento)", "Concelho"])],
        ["Freguesia (procedimento)", resolve(["frEguesiasExecucao"], ["Freguesia (procedimento)", "Freguesia"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 10,
      title: "Prazo de execução",
      rows: [
        ["Prazo de execução do contrato", ann.proposal_deadline_days != null ? `${ann.proposal_deadline_days} dias` : resolve(["PrazoPropostas", "prazoExecucao"], ["Prazo de execução do contrato"])],
        ["Previsão de renovações", resolve(["previsaoRenovacoes"], ["Previsão de renovações"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 11,
      title: "Fundos",
      rows: [["Fundos da União Europeia", resolve(["fundosUE", "fundosUniao"], ["Fundos da União Europeia"]) ]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 12,
      title: "Documentos de habilitação",
      rows: [["Habilitação para exercício da atividade profissional", resolve(["habilitacaoAtividade", "documentosHabilitacao"], ["Habilitação para exercício da atividade profissional"]) ]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 13,
      title: "Condições de participação",
      rows: [["Condições de participação", resolve(["condicoesParticipacao"], ["Condições de participação"]) ]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 14,
      title: "Apresentação de propostas",
      rows: [
        ["Plataforma eletrónica", resolve(["plataformaEletronica"], ["Plataforma eletrónica"])],
        ["URL de apresentação", resolve(["urlApresentacao"], ["URL de apresentação"])],
        ["Propostas variantes", resolve(["propostasVariantes"], ["Propostas variantes"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 15,
      title: "Prazos da proposta",
      rows: [
        ["Prazo para apresentação de propostas", ann.proposal_deadline_at ? new Date(String(ann.proposal_deadline_at)).toLocaleDateString("pt-PT") : resolve(["prazoApresentacaoPropostas"], ["Prazo para apresentação de propostas"])],
        ["Prazo de manutenção das propostas", resolve(["prazoManutencaoPropostas"], ["Prazo de manutenção das propostas"])],
        ["Subcontratação na proposta", resolve(["subcontratacaoProposta"], ["Subcontratação na proposta"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 16,
      title: "Caução",
      rows: [["Prestação de caução", resolve(["prestacaoCaucao", "caucao"], ["Prestação de caução"]) ]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 17,
      title: "Peças do procedimento",
      rows: [[
        "Link para acesso às peças do concurso",
        resolve(["PecasProcedimento", "linkPecasProc", "procedure_docs_url"], ["Link para acesso às peças do concurso", "Link para acesso às peças do concurso (URL)"]) ?? extractProcedurePiecesUrl(payload) ?? (ann.detail_url as string | null),
      ]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 18,
      title: "Outros requisitos",
      rows: [["Contratos reservados", resolve(["contratosReservados"], ["Contratos reservados"]) ]].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 19,
      title: "Critério de adjudicação",
      rows: [
        ["Tipo de critério", resolve(["tipoCriterio", "criterioAdjudicacao"], ["Tipo de critério"])],
        ["Nome do critério", resolve(["nomeCriterio"], ["Nome do critério"])],
        ["Outro nome do critério", resolve(["outroNomeCriterio"], ["Outro nome do critério"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 20,
      title: "Condições do contrato",
      rows: [
        ["Faturação eletrónica", resolve(["faturacaoEletronica"], ["Faturação eletrónica"])],
        ["Obrigação de subcontratação", resolve(["obrigacaoSubcontratacao"], ["Obrigação de subcontratação"])],
        ["Código da obrigação de subcontratação", resolve(["codigoObrigacaoSubcontratacao"], ["Código da obrigação de subcontratação", "Código da Obrigação de Subcontratação"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 21,
      title: "Compra pública estratégica",
      rows: [
        ["Compra pública estratégica", resolve(["compraPublicaEstrategica"], ["Compra pública estratégica"])],
        ["Descrição do processo estratégico", resolve(["descricaoProcessoEstrategico"], ["Descrição do processo estratégico"])],
        ["Critérios ecológicos", resolve(["criteriosEcologicos"], ["Critérios ecológicos"])],
        ["Categorias da estratégia nacional", resolve(["categoriasEstrategiaNacional"], ["Categorias da estratégia nacional"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 22,
      title: "Acessibilidade e mobilidade",
      rows: [
        ["Diretiva veículos não poluentes", resolve(["diretivaVeiculosNaoPoluentes"], ["Diretiva veículos não poluentes"])],
        ["Critério de acessibilidade", resolve(["criterioAcessibilidade"], ["Critério de acessibilidade"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 23,
      title: "Informações adicionais",
      rows: [
        ["Contrato adequado para PME", resolve(["contratoAdequadoPME"], ["Contrato adequado para PME"])],
        ["Cobertura ACP", resolve(["coberturaACP"], ["Cobertura ACP"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 24,
      title: "Órgão de recursos administrativos",
      rows: [
        ["Designação", resolve(["designacaoOrgaoRecursos"], ["Designação"])],
        ["Endereço", resolve(["moradaOrgaoRecursos"], ["Endereço"])],
        ["Código postal", resolve(["codigoPostalOrgaoRecursos"], ["Código postal"])],
        ["Localidade", resolve(["localidadeOrgaoRecursos"], ["Localidade"])],
        ["Telefone", resolve(["telefoneOrgaoRecursos"], ["Telefone"])],
        ["Fax", resolve(["faxOrgaoRecursos"], ["Fax"])],
        ["Endereço eletrónico", resolve(["emailOrgaoRecursos"], ["Endereço eletrónico", "Endereço Eletrónico"])],
      ].map(([label, value]) => ({ label, value: displayValue(value as string | null) })),
    },
    {
      number: 25,
      title: "Serviço de mediação",
      rows: [
        ["Serviço de mediação", resolve(["servicoMediacao"], ["Serviço de mediação"])],
        ["Contacto", resolve(["contactoMediacao"], ["Contacto"])],
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
        ["Nome", resolve(["nomeAutorAnuncio", "autorAnuncio"], ["Nome"])],
        ["Cargo", resolve(["cargoAutorAnuncio"], ["Cargo"])],
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
const BOTTOM_MARGIN = 58;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const FONT_SIZE = 9;
const LINE_HEIGHT = 12;

const COLORS = {
  ink: rgb(0.12, 0.16, 0.19),
  muted: rgb(0.46, 0.5, 0.54),
  line: rgb(0.86, 0.89, 0.91),
  softLine: rgb(0.91, 0.93, 0.95),
  paper: rgb(0.99, 0.99, 1),
  paperAlt: rgb(0.97, 0.98, 0.99),
  paperSoft: rgb(0.95, 0.97, 0.98),
  brand: rgb(0.12, 0.33, 0.22),
  brandDark: rgb(0.09, 0.26, 0.17),
  brandSoft: rgb(0.93, 0.97, 0.95),
  brandAccent: rgb(0.28, 0.57, 0.39),
  accent: rgb(0.71, 0.82, 0.76),
};

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

function drawFooter(page: PDFPage, pageNumber: number, totalPages: number, regular: PDFFont) {
  page.drawLine({
    start: { x: MARGIN_X, y: 34 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: 34 },
    thickness: 0.8,
    color: COLORS.line,
  });

  page.drawText(`Página ${pageNumber} de ${totalPages}`, {
    x: MARGIN_X,
    y: 18,
    size: 8,
    font: regular,
    color: COLORS.muted,
  });

  page.drawText(`Gerado em ${new Date().toLocaleString("pt-PT")}`, {
    x: PAGE_WIDTH - MARGIN_X - 150,
    y: 18,
    size: 8,
    font: regular,
    color: COLORS.muted,
  });
}

function drawHeader(page: PDFPage, summary: { title: string; publicationDate: string; status: string; entity: string; nipc: string; procedureType: string }, bold: PDFFont, regular: PDFFont) {
  const headerHeight = 160;

  page.drawRectangle({
    x: MARGIN_X,
    y: PAGE_HEIGHT - TOP_MARGIN - headerHeight + 10,
    width: CONTENT_WIDTH,
    height: headerHeight,
    color: COLORS.brandDark,
  });

  page.drawRectangle({
    x: MARGIN_X,
    y: PAGE_HEIGHT - TOP_MARGIN - headerHeight + 10,
    width: CONTENT_WIDTH,
    height: 18,
    color: COLORS.brandAccent,
  });

  page.drawText("Helpdesk Público", {
    x: MARGIN_X + 18,
    y: PAGE_HEIGHT - TOP_MARGIN - 30,
    size: 16,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Detalhe do anúncio", {
    x: MARGIN_X + 18,
    y: PAGE_HEIGHT - TOP_MARGIN - 50,
    size: 22,
    font: bold,
    color: rgb(1, 1, 1),
  });

  const titleTop = PAGE_HEIGHT - TOP_MARGIN - 70;
  page.drawText(
    fitTextWithEllipsis(summary.title, regular, 9, CONTENT_WIDTH - 36),
    {
      x: MARGIN_X + 18,
      y: titleTop,
      size: 9,
      font: regular,
      color: rgb(0.92, 0.96, 0.94),
    },
  );

  const chips = [
    { label: "Publicado", value: summary.publicationDate, width: 78 },
    { label: "Estado", value: summary.status, width: 78 },
    { label: "Entidade", value: summary.entity, width: 138 },
    { label: "NIPC", value: summary.nipc, width: 78 },
  ];

  let chipX = MARGIN_X + 18;
  const chipY = PAGE_HEIGHT - TOP_MARGIN - 138;
  for (const chip of chips) {
    const chipValue = fitTextWithEllipsis(chip.value, bold, 8.5, chip.width - 18);
    page.drawRectangle({
      x: chipX,
      y: chipY,
      width: chip.width,
      height: 38,
      color: COLORS.paper,
      borderWidth: 0,
    });
    page.drawText(chip.label, {
      x: chipX + 9,
      y: chipY + 22,
      size: 7,
      font: regular,
      color: COLORS.muted,
    });
    page.drawText(chipValue, {
      x: chipX + 9,
      y: chipY + 10,
      size: 8.5,
      font: bold,
      color: COLORS.ink,
    });
    chipX += chip.width + 6;
  }
}

function drawSectionHeader(page: PDFPage, section: Section, bold: PDFFont, regular: PDFFont, y: number) {
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 4,
    width: CONTENT_WIDTH,
    height: 24,
    color: COLORS.brand,
  });

  page.drawText(`${section.number}. ${section.title}`, {
    x: MARGIN_X + 12,
    y: y + 4,
    size: 11,
    font: bold,
    color: rgb(1, 1, 1),
  });
}

function drawSectionRow(page: PDFPage, row: { label: unknown; value: string }, y: number, rowHeight: number, bold: PDFFont, regular: PDFFont) {
  const labelWidth = 190;

  page.drawRectangle({
    x: MARGIN_X,
    y: y - rowHeight + 2,
    width: CONTENT_WIDTH,
    height: rowHeight,
    borderWidth: 0.7,
    borderColor: COLORS.softLine,
    color: COLORS.paper,
  });

  page.drawRectangle({
    x: MARGIN_X,
    y: y - rowHeight + 2,
    width: labelWidth + 18,
    height: rowHeight,
    color: COLORS.paperSoft,
  });

  page.drawLine({
    start: { x: MARGIN_X + labelWidth + 18, y: y - rowHeight + 2 },
    end: { x: MARGIN_X + labelWidth + 18, y: y + 2 },
    thickness: 0.7,
    color: COLORS.softLine,
  });

  const labelLines = wrapText(String(row.label ?? "-"), regular, FONT_SIZE, labelWidth - 10);
  const valueLines = wrapText(row.value, bold, FONT_SIZE, CONTENT_WIDTH - labelWidth - 34);

  labelLines.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN_X + 8,
      y: y - 8 - index * LINE_HEIGHT,
      size: FONT_SIZE,
      font: regular,
      color: COLORS.muted,
    });
  });

  valueLines.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN_X + labelWidth + 28,
      y: y - 8 - index * LINE_HEIGHT,
      size: FONT_SIZE,
      font: bold,
      color: COLORS.ink,
    });
  });
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
  function fitTextWithEllipsis(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
    const trimmed = text.trim();
    if (!trimmed) return "";
    if (font.widthOfTextAtSize(trimmed, fontSize) <= maxWidth) return trimmed;

    const ellipsis = "...";
    let candidate = trimmed;

    while (candidate.length > 0) {
      candidate = candidate.slice(0, -1).trimEnd();
      if (!candidate) break;
      if (font.widthOfTextAtSize(`${candidate}${ellipsis}`, fontSize) <= maxWidth) {
        return `${candidate}${ellipsis}`;
      }
    }

    return ellipsis;
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
  let y = PAGE_HEIGHT - TOP_MARGIN - 184;

  drawHeader(page, summary, bold, regular);

  for (const section of sections) {
    if (y - 28 < BOTTOM_MARGIN) {
      page = createPage(pdf);
      y = PAGE_HEIGHT - TOP_MARGIN - 24;
    }

    drawSectionHeader(page, section, bold, regular, y);
    y -= 28;

    for (const row of section.rows) {
      const labelLines = wrapText(String(row.label ?? "-"), regular, FONT_SIZE, 180);
      const valueLines = wrapText(row.value, bold, FONT_SIZE, CONTENT_WIDTH - 224);
      const rowLineCount = Math.max(labelLines.length, valueLines.length);
      const rowHeight = rowLineCount * LINE_HEIGHT + 12;

      if (y - rowHeight < BOTTOM_MARGIN) {
        page = createPage(pdf);
        y = PAGE_HEIGHT - TOP_MARGIN - 24;
        drawSectionHeader(page, section, bold, regular, y);
        y -= 28;
      }

      drawSectionRow(page, row, y, rowHeight, bold, regular);

      y -= rowHeight + 4;
    }

    y -= 14;
  }

  const pages = pdf.getPages();
  const totalPages = pages.length;
  pages.forEach((currentPage, index) => drawFooter(currentPage, index + 1, totalPages, regular));

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
