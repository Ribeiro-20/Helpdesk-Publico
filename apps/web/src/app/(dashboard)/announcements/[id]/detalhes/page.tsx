import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/layout/PageHeader";
import { notFound } from "next/navigation";
import { ArrowDownToLine, CalendarDays, ExternalLink, Megaphone } from "lucide-react";
import { effectiveStatus, STATUS_BADGE, STATUS_LABEL } from "@/lib/announcements";

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

    // Some DR rows come as "Question? Sim/Não" without a colon.
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

function extractProcedurePiecesUrl(text: string): string | null {
  if (!text.trim()) return null;
  const labeled = text.match(/Link\s+para\s+acesso\s+[àa]s\s+pe[cç]as\s+do\s+concurso\s*\(URL\)\s*:\s*(https?:\/\/\S+)/i);
  if (labeled) return labeled[1];

  const acingov = text.match(/https?:\/\/\S*downloadProcedurePiece\/\S+/i);
  if (acingov) return acingov[0];

  const generic = text.match(/https?:\/\/\S+/i);
  return generic ? generic[0] : null;
}

type LotInfo = {
  id: string;
  descricao: string | null;
  preco: string | null;
  cpv: string | null;
};

function parseLotsFromDetailText(text: string): LotInfo[] {
  const out: LotInfo[] = [];
  const lotRegex = /N[ºo]:\s*(LOT-\d{4})\s*([\s\S]*?)(?=\n\s*N[ºo]:\s*LOT-\d{4}|$)/gi;
  let lotMatch: RegExpExecArray | null;

  while ((lotMatch = lotRegex.exec(text)) !== null) {
    const section = lotMatch[2] ?? "";
    const descricao = section.match(/Descri[cç][aã]o\s+do\s+Lote:\s*([^\r\n]+)/i)?.[1]?.trim() ?? null;
    const preco = section.match(/Pre[cç]o\s+base\s+s\/IVA:\s*([^\r\n]+)/i)?.[1]?.trim() ?? null;
    const cpv = section.match(/Vocabul[aá]rio\s+Principal:\s*(\d{8}(?:-\d)?)/i)?.[1]?.trim() ?? null;

    out.push({
      id: lotMatch[1],
      descricao,
      preco,
      cpv,
    });
  }

  return out;
}

function normalizeCpvCode(raw: unknown): string | null {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!value || value === "-" || value === "—") return null;

  const embedded = value.match(/\b\d{8}(?:-\d)?\b/);
  if (embedded) return embedded[0];

  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return `${digits.slice(0, 8)}-${digits[8]}`;
  if (digits.length === 8) return digits;
  return null;
}

function cpvCore8(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : "";
}

function SectionTitle({ number, title }: { number: number; title: string }) {
  return (
    <h3 className="mt-6 mb-2 text-base font-bold text-green-800">
      {number} — {title}
    </h3>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | number | boolean | null;
  mono?: boolean;
}) {
  const display =
    value == null || value === "" ? "" : typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value);

  return (
    <div className="detail-row flex items-baseline justify-between gap-6 rounded-md border border-[#e1e6eb] px-4 py-2.5">
      <p className="shrink-0 w-1/2 text-sm text-gray-500">{label}</p>
      <p className={`w-1/2 text-right text-sm font-semibold text-gray-900 break-words whitespace-normal ${mono ? "font-mono" : ""}`}>
        {display || "—"}
      </p>
    </div>
  );
}

function DetailRowLink({
  label,
  href,
}: {
  label: string;
  href?: string | null;
}) {
  const safeHref = (href ?? "").trim();

  return (
    <div className="detail-row flex items-baseline justify-between gap-6 rounded-md border border-[#e1e6eb] px-4 py-2.5">
      <p className="shrink-0 w-1/2 text-sm text-gray-500">{label}</p>
      <div className="w-1/2 text-right text-sm font-semibold text-gray-900 break-all whitespace-normal">
        {safeHref ? (
          <a
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:underline"
          >
            {safeHref}
          </a>
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

function raw(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  if (v == null || v === "") return null;
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : null;
  return String(v);
}

function pick(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw(payload, key);
    if (value) return value;
  }

  const nested = payload.detalhe_conteudo;
  if (nested && typeof nested === "object") {
    for (const key of keys) {
      const value = raw(nested as Record<string, unknown>, key);
      if (value) return value;
    }
  }

  return null;
}

function rawFrom(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : null;
  return String(value);
}

function rawBool(payload: Record<string, unknown>, key: string): boolean | null {
  const v = payload[key];
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  if (s === "sim" || s === "true" || s === "1" || s === "yes") return true;
  if (s === "não" || s === "nao" || s === "false" || s === "0" || s === "no") return false;
  return null;
}

export default async function AnnouncementDetalhesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: ann } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .single();

  if (!ann) notFound();

  const p = (ann.raw_payload ?? {}) as Record<string, unknown>;
  const payloadRoot = (p.payload && typeof p.payload === "object")
    ? (p.payload as Record<string, unknown>)
    : p;
  const detalhe = (payloadRoot.detalhe_conteudo && typeof payloadRoot.detalhe_conteudo === "object")
    ? (payloadRoot.detalhe_conteudo as Record<string, unknown>)
    : {};
  const detalheTexto = typeof detalhe.Texto === "string" ? detalhe.Texto : "";
  const detailMap = parseDetailLabelMap(detalheTexto);
  const fromDetail = (labels: string[]) => pickFromDetailMap(detailMap, labels);
  const sec1Map = parseDetailLabelMap(extractSectionText(detalheTexto, 1));
  const sec9Map = parseDetailLabelMap(extractSectionText(detalheTexto, 9));
  const sec24Map = parseDetailLabelMap(extractSectionText(detalheTexto, 27));
  const sec28Map = parseDetailLabelMap(extractSectionText(detalheTexto, 28));
  const sec11Map = parseDetailLabelMap(extractSectionText(detalheTexto, 11));
  const sec12Map = parseDetailLabelMap(extractSectionText(detalheTexto, 12));
  const sec18Map = parseDetailLabelMap(extractSectionText(detalheTexto, 20));
  const sec19Map = parseDetailLabelMap(extractSectionText(detalheTexto, 21));
  const sec21Map = parseDetailLabelMap(extractSectionText(detalheTexto, 25));
  const sec23Map = parseDetailLabelMap(extractSectionText(detalheTexto, 26));
  const fromSec1 = (labels: string[]) => pickFromDetailMap(sec1Map, labels);
  const fromSec9 = (labels: string[]) => pickFromDetailMap(sec9Map, labels);
  const fromSec24 = (labels: string[]) => pickFromDetailMap(sec24Map, labels);
  const fromSec28 = (labels: string[]) => pickFromDetailMap(sec28Map, labels);
  const fromSec11 = (labels: string[]) => pickFromDetailMap(sec11Map, labels);
  const fromSec12 = (labels: string[]) => pickFromDetailMap(sec12Map, labels);
  const fromSec18 = (labels: string[]) => pickFromDetailMap(sec18Map, labels);
  const fromSec19 = (labels: string[]) => pickFromDetailMap(sec19Map, labels);
  const fromSec21 = (labels: string[]) => pickFromDetailMap(sec21Map, labels);
  const fromSec23 = (labels: string[]) => pickFromDetailMap(sec23Map, labels);

  const cpvListRaw: string[] = Array.isArray(ann.cpv_list) ? ann.cpv_list : [];
  const normalizedMainCpv = normalizeCpvCode(ann.cpv_main);
  const normalizedListCpvs = Array.from(
    new Set(cpvListRaw.map((code) => normalizeCpvCode(code)).filter((code): code is string => Boolean(code))),
  );

  const cpvShortCodes = Array.from(
    new Set(
      [normalizedMainCpv, ...normalizedListCpvs].filter((code): code is string => Boolean(code && /^\d{8}$/.test(code))),
    ),
  );

  const cpvDisplayMap = new Map<string, string>();
  if (cpvShortCodes.length > 0) {
    const orFilter = cpvShortCodes.map((code) => `id.ilike.${code}-%`).join(",");
    const { data: cpvRows } = await supabase
      .from("cpv_codes")
      .select("id")
      .or(orFilter)
      .limit(Math.max(20, cpvShortCodes.length * 3));

    for (const row of cpvRows ?? []) {
      const id = String((row as { id?: unknown }).id ?? "").trim();
      if (!id) continue;
      const core = cpvCore8(id);
      if (core && !cpvDisplayMap.has(core)) cpvDisplayMap.set(core, id);
    }
  }

  const resolveCpvDisplay = (code: string | null | undefined): string | null => {
    const normalized = normalizeCpvCode(code);
    if (!normalized) return null;
    if (/^\d{8}$/.test(normalized)) return cpvDisplayMap.get(normalized) ?? normalized;
    return normalized;
  };

  const cpvListDisplay = Array.from(
    new Set(normalizedListCpvs.map((code) => resolveCpvDisplay(code)).filter((code): code is string => Boolean(code))),
  );
  const displayStatus = effectiveStatus(ann);
  const lots = Array.isArray(p.lotes) ? (p.lotes as Record<string, unknown>[]) : [];
  const parsedLots = parseLotsFromDetailText(detalheTexto);
  const lot1 = lots[0] ?? {};
  const lot2 = lots[1] ?? {};
  const lot1Parsed = parsedLots[0] ?? null;
  const lot2Parsed = parsedLots[1] ?? null;

  const cpvDisplay = cpvListDisplay.length > 0 ? cpvListDisplay.join(", ") : resolveCpvDisplay(normalizedMainCpv);
  const piecesUrl =
    pick(payloadRoot, ["PecasProcedimento", "linkPecasProc"]) ??
    fromDetail(["Link para acesso às peças do concurso (URL)"]) ??
    extractProcedurePiecesUrl(detalheTexto) ??
    ann.detail_url;
  const subcontractCode =
    pick(payloadRoot, ["codigoObrigacaoSubcontratacao"]) ??
    fromDetail(["Código da Obrigação de Subcontratação"]);

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        icon={Megaphone}
        title="Informação detalhada"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
            <CalendarDays className="h-3.5 w-3.5" />
            Publicado em {ann.publication_date}
          </span>
        }
        backHref={`/announcements/${id}`}
        backLabel="Anúncio"
        size="detail"
        badge={
          <span
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_BADGE[displayStatus] ?? "bg-gray-100 text-gray-600"}`}
          >
            {STATUS_LABEL[displayStatus] ?? displayStatus}
          </span>
        }
      />

      <div className="flex flex-wrap justify-end gap-3">
        <a
          href={`/api/announcements/${id}/pdf`}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <ArrowDownToLine className="h-4 w-4" />
          Transferir PDF
        </a>

        {ann.detail_url && (
          <a
            href={ann.detail_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-50"
          >
            <ExternalLink className="h-4 w-4" />
            Ver original
          </a>
        )}
      </div>

      <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-card">
        <SectionTitle number={1} title="Identificação e contactos da entidade adjudicante" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Designação da entidade adjudicante" value={ann.entity_name ?? pick(payloadRoot, ["designacaoEntidade", "Emissor"]) ?? fromDetail(["Designação da entidade adjudicante"]) ?? ""} />
          <DetailRow label="NIPC" value={ann.entity_nif ?? pick(payloadRoot, ["nifEntidade"]) ?? fromDetail(["NIPC"]) ?? ""} mono />
          <DetailRow label="Serviço/Órgão/Pessoa de contacto" value={pick(payloadRoot, ["servicoContacto", "orgaoContacto", "pessoaContacto"]) ?? fromSec1(["Serviço/Órgão/Pessoa de contacto"]) ?? ""} />
          <DetailRow label="Endereço" value={pick(payloadRoot, ["moradaEntidade"]) ?? fromSec1(["Endereço"]) ?? ""} />
          <DetailRow label="Código postal" value={pick(payloadRoot, ["codigoPostalEntidade"]) ?? fromSec1(["Código postal"]) ?? ""} />
          <DetailRow label="Localidade" value={pick(payloadRoot, ["localidadeEntidade"]) ?? fromSec1(["Localidade"]) ?? ""} />
          <DetailRow label="País" value={pick(payloadRoot, ["paisEntidade"]) ?? fromSec1(["País"]) ?? ""} />
          <DetailRow label="NUT III" value={pick(payloadRoot, ["nutIIIEntidade"]) ?? fromSec1(["NUT III"]) ?? ""} />
          <DetailRow label="Distrito" value={pick(payloadRoot, ["distritoEntidade"]) ?? fromSec1(["Distrito"]) ?? ""} />
          <DetailRow label="Concelho" value={pick(payloadRoot, ["concelhoEntidade"]) ?? fromSec1(["Concelho"]) ?? ""} />
          <DetailRow label="Freguesia" value={pick(payloadRoot, ["frEguesiasEntidade", "frEguesias"]) ?? fromSec1(["Freguesia"]) ?? ""} />
          <DetailRow label="Telefone" value={pick(payloadRoot, ["telefoneEntidade"]) ?? fromSec1(["Telefone"]) ?? ""} />
          <DetailRow label="Fax" value={pick(payloadRoot, ["faxEntidade"]) ?? fromSec1(["Fax"]) ?? ""} />
          <DetailRow label="Endereço da Entidade (URL)" value={pick(payloadRoot, ["urlEntidade"]) ?? fromSec1(["Endereço da Entidade (URL)"]) ?? ""} />
          <DetailRow label="Endereço eletrónico" value={pick(payloadRoot, ["emailEntidade"]) ?? fromSec1(["Endereço Eletrónico", "Endereço eletrónico"]) ?? ""} />
          <DetailRow label="eDelivery Gateway (URL)" value={pick(payloadRoot, ["eDeliveryGateway"]) ?? fromSec1(["eDelivery Gateway (URL)"]) ?? ""} />
          <DetailRow label="Função da organização" value={pick(payloadRoot, ["funcaoOrganizacao"]) ?? fromSec1(["Função da Organização"]) ?? ""} />
          <DetailRow label="Norma jurídica da entidade adjudicante" value={pick(payloadRoot, ["normaJuridicaEntidade"]) ?? fromSec1(["Norma jurídica da Entidade Adjudicante"]) ?? ""} />
          <DetailRow label="Área de atividade da autoridade adjudicante" value={pick(payloadRoot, ["areaAtividadeEntidade"]) ?? fromSec1(["Área de atividade da Autoridade Adjudicante"]) ?? ""} />
        </div>

        <SectionTitle number={2} title="Jornal Oficial da União Europeia" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Também é publicado no JOUE?" value={pick(payloadRoot, ["publicacaoJOUE", "publicacaoJornalOficial"]) ?? fromDetail(["O procedimento a que este anúncio diz respeito também é publicitado no Jornal Oficial da União Europeia?"]) ?? ""} />
        </div>

        <SectionTitle number={3} title="Aviso" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Modelo de anúncio" value={pick(payloadRoot, ["modeloAnuncio"]) ?? fromDetail(["Modelo de Anúncio"]) ?? ann.procedure_type ?? ""} />
          <DetailRow label="Data de envio do anúncio" value={pick(payloadRoot, ["dataEnvioAnuncio"]) ?? fromDetail(["Data de Envio do Anúncio"]) ?? ""} />
        </div>

        <SectionTitle number={4} title="Entidades convidadas" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Entidades convidadas" value={pick(p, ["entidadesConvidadas", "convidados"]) ?? ""} />
        </div>

        <SectionTitle number={5} title="Processo" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Tipo de procedimento" value={pick(payloadRoot, ["tipoProcedimento"]) ?? fromDetail(["Tipo de Procedimento"]) ?? ann.procedure_type ?? ""} />
          <DetailRow label="Preço base do procedimento (Sim/Não)" value={pick(payloadRoot, ["temPrecoBase"]) ?? fromDetail(["Preço base do procedimento"]) ?? ""} />
          <DetailRow
            label="Valor do preço base do procedimento"
            value={ann.base_price != null ? `${Number(ann.base_price).toLocaleString("pt-PT")} ${ann.currency ?? "EUR"}` : pick(payloadRoot, ["valorPrecoBase"]) ?? fromDetail(["Valor do preço base do procedimento"]) ?? ""}
          />
          <DetailRow label="Procedimento com lotes? (Sim/Não)" value={pick(payloadRoot, ["procedimentoComLotes"]) ?? fromDetail(["Procedimento com lotes?"]) ?? ""} />
          <DetailRow label="Nº máx. de lotes autorizado" value={pick(payloadRoot, ["maxLotesAutorizado"]) ?? fromDetail(["Nº Máx. de Lotes Autorizado"]) ?? ""} />
          <DetailRow label="Nº máx. de lotes adjudicáveis por concorrente" value={pick(payloadRoot, ["maxLotesPorConcorrente"]) ?? fromDetail(["Número máximo de lotes que podem ser adjudicados a um concorrente"]) ?? ""} />
        </div>

        <SectionTitle number={6} title="Objeto do contrato" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Número de referência interna" value={pick(payloadRoot, ["numeroReferenciaInterna", "refInterna"]) ?? fromDetail(["Número de referência interna"]) ?? ""} />
          <DetailRow label="Designação do contrato" value={ann.title ?? ""} />
          <DetailRow label="Descrição" value={ann.description ?? pick(payloadRoot, ["descricaoContrato", "Sumario"]) ?? fromDetail(["Descrição"]) ?? ""} />
          <DetailRow label="Tipo de contrato principal" value={pick(payloadRoot, ["tipoContratoPrincipal"]) ?? fromDetail(["Tipo de Contrato Principal"]) ?? ""} />
          <DetailRow label="Tipo de contrato" value={ann.contract_type ?? pick(payloadRoot, ["tiposContrato"]) ?? fromDetail(["Tipo de Contrato"]) ?? ""} />
          <DetailRow label="CPV (objeto principal)" value={cpvDisplay ?? ""} mono />
          <DetailRow label="Preço base s/IVA (objeto principal)" value={pick(payloadRoot, ["PrecoBaseSemIVA", "precoBaseSemIVA"]) ?? fromDetail(["Preço base s/IVA"]) ?? ""} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 detail-rows">
            <p className="text-xs font-semibold text-gray-800">Lote — LOT-0001</p>
            <DetailRow label="Identificador do lote" value={rawFrom(lot1, "id") ?? pick(p, ["identificadorLote1"]) ?? lot1Parsed?.id ?? ""} />
            <DetailRow label="Descrição do lote" value={rawFrom(lot1, "descricao") ?? pick(p, ["descricaoLote1"]) ?? lot1Parsed?.descricao ?? ""} />
            <DetailRow label="Preço base s/IVA (lote)" value={rawFrom(lot1, "precoBaseSemIva") ?? pick(p, ["precoBaseLote1"]) ?? lot1Parsed?.preco ?? ""} />
            <DetailRow label="CPV (lote)" value={rawFrom(lot1, "cpv") ?? pick(p, ["cpvLote1"]) ?? lot1Parsed?.cpv ?? ""} mono />
          </div>
          <div className="space-y-2 detail-rows">
            <p className="text-xs font-semibold text-gray-800">Lote — LOT-0002</p>
            <DetailRow label="Identificador do lote" value={rawFrom(lot2, "id") ?? pick(p, ["identificadorLote2"]) ?? lot2Parsed?.id ?? ""} />
            <DetailRow label="Descrição do lote" value={rawFrom(lot2, "descricao") ?? pick(p, ["descricaoLote2"]) ?? lot2Parsed?.descricao ?? ""} />
            <DetailRow label="Preço base s/IVA (lote)" value={rawFrom(lot2, "precoBaseSemIva") ?? pick(p, ["precoBaseLote2"]) ?? lot2Parsed?.preco ?? ""} />
            <DetailRow label="CPV (lote)" value={rawFrom(lot2, "cpv") ?? pick(p, ["cpvLote2"]) ?? lot2Parsed?.cpv ?? ""} mono />
          </div>
        </div>

        <SectionTitle number={7} title="Indicações adicionais" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Aquisição conjunta? (Sim/Não)" value={rawBool(payloadRoot, "aquisicaoConjunta") ?? pick(payloadRoot, ["aquisicaoConjunta"]) ?? fromDetail(["O contrato envolve aquisição conjunta (satisfação de várias entidades)?"]) ?? ""} />
          <DetailRow label="Central de compras? (Sim/Não)" value={rawBool(payloadRoot, "centralCompras") ?? pick(payloadRoot, ["centralCompras"]) ?? fromDetail(["O contrato é adjudicado por uma central de compras?"]) ?? ""} />
        </div>

        <SectionTitle number={8} title="Técnicas" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Acordo-quadro" value={pick(payloadRoot, ["acordoQuadro", "DescrAcordoQuadro"]) ?? fromDetail(["O concurso destina-se à celebração de um acordo-quadro?"]) ?? ""} />
          <DetailRow label="Leilão eletrónico? (Sim/Não)" value={pick(payloadRoot, ["leilaoEletronico"]) ?? fromDetail(["É utilizado um leilão eletrónico?"]) ?? ""} />
          <DetailRow label="Fase de negociação? (Sim/Não)" value={pick(payloadRoot, ["faseNegociacao"]) ?? fromDetail(["É adotada uma fase de negociação?"]) ?? ""} />
          <DetailRow label="Sistema de aquisição dinâmico" value={pick(payloadRoot, ["sistemAquisicaoDinamico", "SADinamico"]) ?? fromDetail(["Sistema de Aquisição Dinâmico"]) ?? ""} />
        </div>

        <SectionTitle number={9} title="Local da execução do contrato (Procedimento)" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="País (procedimento)" value={pick(payloadRoot, ["paisExecucao"]) ?? fromSec9(["País"]) ?? ""} />
          <DetailRow label="NUT III (procedimento)" value={pick(payloadRoot, ["nutIIIExecucao"]) ?? fromSec9(["NUT III"]) ?? ""} />
          <DetailRow label="Localidade (procedimento)" value={pick(payloadRoot, ["localidadeExecucao", "localExecucao"]) ?? fromSec9(["Localidade"]) ?? ""} />
          <DetailRow label="Distrito (procedimento)" value={pick(payloadRoot, ["distritoExecucao"]) ?? fromSec9(["Distrito"]) ?? ""} />
          <DetailRow label="Concelho (procedimento)" value={pick(payloadRoot, ["concelhoExecucao"]) ?? fromSec9(["Concelho"]) ?? ""} />
          <DetailRow label="Freguesia (procedimento)" value={pick(payloadRoot, ["frEguesiasExecucao"]) ?? fromSec9(["Freguesia"]) ?? ""} />
        </div>

        <SectionTitle number={10} title="Prazo de execução" />
        <div className="space-y-2 detail-rows">
          <DetailRow
            label="Prazo de execução do contrato"
            value={ann.proposal_deadline_days != null ? `${ann.proposal_deadline_days} dias` : pick(payloadRoot, ["PrazoPropostas", "prazoExecucao"]) ?? fromDetail(["Prazo de execução do contrato"]) ?? ""}
          />
          <DetailRow label="Previsão de renovações" value={pick(payloadRoot, ["previsaoRenovacoes"]) ?? fromDetail(["Previsão de renovações"]) ?? ""} />
        </div>

        <SectionTitle number={11} title="Fundos" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Fundos da União Europeia" value={pick(payloadRoot, ["fundosUE", "fundosUniao"]) ?? fromSec11(["Têm fundos EU?"]) ?? fromDetail(["Têm fundos EU?"]) ?? ""} />
        </div>

        <SectionTitle number={12} title="Documentos de habilitação" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Habilitação para exercício da atividade profissional" value={pick(payloadRoot, ["habilitacaoAtividade", "documentosHabilitacao"]) ?? fromSec12(["Habilitação para o exercício da atividade profissional"]) ?? ""} />
        </div>

        <SectionTitle number={13} title="Condições de participação" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Condições de participação" value={pick(p, ["condicoesParticipacao"]) ?? ""} />
        </div>

        <SectionTitle number={14} title="Apresentação de propostas" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Plataforma eletrónica" value={pick(payloadRoot, ["plataformaEletronica"]) ?? fromDetail(["Plataforma eletrónica utilizada pela entidade adjudicante"]) ?? ""} />
          <DetailRow label="URL de apresentação" value={pick(payloadRoot, ["urlApresentacao"]) ?? fromDetail(["URL para Apresentação"]) ?? ""} />
          <DetailRow label="Propostas variantes" value={pick(payloadRoot, ["propostasVariantes"]) ?? fromDetail(["Admissibilidade da apresentação de propostas variantes"]) ?? ""} />
        </div>

        <SectionTitle number={15} title="Prazos da proposta" />
        <div className="space-y-2 detail-rows">
          <DetailRow
            label="Prazo para apresentação de propostas"
            value={ann.proposal_deadline_at ? new Date(ann.proposal_deadline_at).toLocaleDateString("pt-PT") : pick(payloadRoot, ["prazoApresentacaoPropostas"]) ?? fromDetail(["Prazo para apresentação das propostas"]) ?? ""}
          />
          <DetailRow label="Prazo de manutenção das propostas" value={pick(payloadRoot, ["prazoManutencaoPropostas"]) ?? fromDetail(["Prazo durante o qual os concorrentes são obrigados a manter as respetivas propostas"]) ?? ""} />
          <DetailRow label="Subcontratação na proposta" value={pick(payloadRoot, ["subcontratacaoProposta"]) ?? fromDetail(["Indicação de Subcontratação na Proposta"]) ?? ""} />
        </div>

        <SectionTitle number={16} title="Caução" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Prestação de caução" value={pick(payloadRoot, ["prestacaoCaucao", "caucao"]) ?? fromDetail(["Prestação de caução"]) ?? ""} />
        </div>

        <SectionTitle number={17} title="Peças do procedimento" />
        <div className="space-y-2 detail-rows">
          <DetailRowLink label="Link para acesso às peças do concurso" href={piecesUrl ?? ""} />
        </div>

        <SectionTitle number={18} title="Outros requisitos" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Contratos reservados" value={pick(payloadRoot, ["contratosReservados"]) ?? fromSec18(["Informação sobre contratos reservados. Aplica-se a contratos reservados (54º-A)?"]) ?? ""} />
        </div>

        <SectionTitle number={19} title="Critério de adjudicação" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Tipo de critério" value={pick(payloadRoot, ["tipoCriterio", "criterioAdjudicacao"]) ?? fromSec19(["Multifator", "Monofator"]) ?? ""} />
          <DetailRow label="Nome do critério" value={pick(payloadRoot, ["nomeCriterio"]) ?? fromSec19(["Nome"]) ?? ""} />
          <DetailRow label="Outro nome do critério" value={pick(payloadRoot, ["outroNomeCriterio"]) ?? fromSec19(["Outro nome"]) ?? ""} />
        </div>

        <SectionTitle number={20} title="Condições do contrato" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Faturação eletrónica" value={pick(payloadRoot, ["faturacaoEletronica"]) ?? fromDetail(["Faturação Eletrónica"]) ?? ""} />
          <DetailRow
            label="Obrigação de subcontratação"
            value={pick(payloadRoot, ["obrigacaoSubcontratacao"]) ?? fromDetail(["Obrigação de Subcontratação"]) ?? (subcontractCode ? "Não aplicável" : "")}
          />
          <DetailRow label="Código da obrigação de subcontratação" value={subcontractCode ?? ""} />
        </div>

        <SectionTitle number={21} title="Compra pública estratégica" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Compra pública estratégica" value={pick(payloadRoot, ["compraPublicaEstrategica"]) ?? fromSec21(["Compra Pública Estratégica"]) ?? fromDetail(["Compra Pública Estratégica"]) ?? ""} />
          <DetailRow label="Descrição do processo estratégico" value={pick(payloadRoot, ["descricaoProcessoEstrategico"]) ?? ""} />
          <DetailRow label="Critérios ecológicos" value={pick(payloadRoot, ["criteriosEcologicos"]) ?? ""} />
          <DetailRow label="Categorias da estratégia nacional" value={pick(payloadRoot, ["categoriasEstrategiaNacional"]) ?? ""} />
        </div>

        <SectionTitle number={22} title="Acessibilidade e mobilidade" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Diretiva veículos não poluentes" value={pick(p, ["diretivaVeiculosNaoPoluentes"]) ?? ""} />
          <DetailRow label="Critério de acessibilidade" value={pick(p, ["criterioAcessibilidade"]) ?? ""} />
        </div>

        <SectionTitle number={23} title="Informações adicionais" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Contrato adequado para PME" value={pick(payloadRoot, ["contratoAdequadoPME"]) ?? fromSec23(["Contrato adequado para PME"]) ?? fromDetail(["Contrato adequado para PME"]) ?? ""} />
          <DetailRow label="Cobertura ACP" value={pick(payloadRoot, ["coberturaACP"]) ?? fromSec23(["Cobertura ACP (Acordo dos Contratos Públicos da Organização Mundial do Comércio)"]) ?? fromDetail(["Cobertura ACP (Acordo dos Contratos Públicos da Organização Mundial do Comércio)"]) ?? ""} />
        </div>

        <SectionTitle number={24} title="Órgão de recursos administrativos" />
        <div className="space-y-2 detail-rows">
          <DetailRow label="Designação" value={pick(payloadRoot, ["designacaoOrgaoRecursos"]) ?? fromSec24(["Designação"]) ?? ""} />
          <DetailRow label="Endereço" value={pick(payloadRoot, ["moradaOrgaoRecursos"]) ?? fromSec24(["Endereço"]) ?? ""} />
          <DetailRow label="Código postal" value={pick(payloadRoot, ["codigoPostalOrgaoRecursos"]) ?? fromSec24(["Código postal"]) ?? ""} />
          <DetailRow label="Localidade" value={pick(payloadRoot, ["localidadeOrgaoRecursos"]) ?? fromSec24(["Localidade"]) ?? ""} />
          <DetailRow label="Telefone" value={pick(payloadRoot, ["telefoneOrgaoRecursos"]) ?? fromSec24(["Telefone"]) ?? ""} />
          <DetailRow label="Fax" value={pick(payloadRoot, ["faxOrgaoRecursos"]) ?? fromSec24(["Fax"]) ?? ""} />
          <DetailRow label="Endereço eletrónico" value={pick(payloadRoot, ["emailOrgaoRecursos"]) ?? fromSec24(["Endereço eletrónico", "Endereço Eletrónico"]) ?? ""} />
        </div>

        <SectionTitle number={25} title="Serviço de mediação" />
        <div className="space-y-2">
          <DetailRow label="Serviço de mediação" value={pick(p, ["servicoMediacao"]) ?? ""} />
          <DetailRow label="Contacto" value={pick(p, ["contactoMediacao"]) ?? ""} />
        </div>

        <SectionTitle number={26} title="Publicação no portal" />
        <div className="space-y-2">
          <DetailRow label="Nº DR" value={ann.dr_announcement_no ?? ""} />
          <DetailRowLink label="URL do anúncio" href={piecesUrl ?? ""} />
        </div>

        <SectionTitle number={27} title="Estado e versionamento" />
        <div className="space-y-2">
          <DetailRow label="Estado efetivo" value={STATUS_LABEL[displayStatus] ?? displayStatus} />
          <DetailRow label="Fonte" value={ann.source ?? ""} />
          <DetailRow label="Atualizado em" value={ann.updated_at ? new Date(ann.updated_at).toLocaleString("pt-PT") : ""} />
        </div>

        <SectionTitle number={28} title="Autor do anúncio" />
        <div className="space-y-2">
          <DetailRow label="Nome" value={pick(payloadRoot, ["nomeAutorAnuncio", "autorAnuncio"]) ?? fromSec28(["Nome"]) ?? ""} />
          <DetailRow label="Cargo" value={pick(payloadRoot, ["cargoAutorAnuncio"]) ?? fromSec28(["Cargo"]) ?? ""} />
        </div>
      </div>
    </div>
  );
}
