"use client";

import { useEffect, useMemo, useState } from "react";
import MercadoSingleSelect from "@/components/MercadoSingleSelect";

type LocationOptionsByCountry = Record<string, Record<string, string[]>>;

type MercadoLocationFiltersProps = {
  locationOptionsByCountry: LocationOptionsByCountry;
  defaultCountry: string;
  defaultDistrict: string;
  defaultMunicipality: string;
};

/**
 * Mapa de correção de nomes para garantir acentuação correta.
 * Chave: Versão normalizada (sem acentos, uppercase).
 * Valor: Versão correta (com acentos, capitalizada).
 */
const DISTRICT_CORRECTION_MAP: Record<string, string> = {
  AVEIRO: "Aveiro",
  BEJA: "Beja",
  BRAGA: "Braga",
  BRAGANCA: "Bragança",
  CASTELO_BRANCO: "Castelo Branco",
  COIMBRA: "Coimbra",
  EVORA: "Évora",
  FARO: "Faro",
  GUARDA: "Guarda",
  LEIRIA: "Leiria",
  LISBOA: "Lisboa",
  PORTALEGRE: "Portalegre",
  PORTO: "Porto",
  SANTAREM: "Santarém",
  SETUBAL: "Setúbal",
  VIANA_DO_CASTELO: "Viana do Castelo",
  VILA_REAL: "Vila Real",
  VISEU: "Viseu",
  "REGIAO AUTONOMA DA MADEIRA": "Região Autónoma da Madeira",
  "REGIAO AUTONOMA DOS ACORES": "Região Autónoma dos Açores",
};

const MUNICIPALITY_CORRECTION_MAP: Record<string, string> = {
  ABRANTES: "Abrantes",
  AGUEDA: "Águeda",
  ALANDROAL: "Alandroal",
  ALBERGARIA_A_VELHA: "Albergaria-a-Velha",
  ALBUFEIRA: "Albufeira",
  ALCACER_DO_SAL: "Alcácer do Sal",
  ALCOBACA: "Alcobaça",
  ALCOCHETE: "Alcochete",
  ALCOUTIM: "Alcoutim",
  ALENQUER: "Alenquer",
  ALFANDEGA_DA_FE: "Alfândega da Fé",
  ALIJO: "Alijó",
  ALJEZUR: "Aljezur",
  ALJUSTREL: "Aljustrel",
  ALMADA: "Almada",
  ALMEIDA: "Almeida",
  ALMEIRIM: "Almeirim",
  ALMODOVAR: "Almodôvar",
  ALPIARCA: "Alpiarça",
  ALTER_DO_CHAO: "Alter do Chão",
  ALVAIAZERE: "Alvaiázere",
  ALVITO: "Alvito",
  AMADORA: "Amadora",
  AMARANTE: "Amarante",
  AMARES: "Amares",
  ANADIA: "Anadia",
  ANGRA_DO_HEROISMO: "Angra do Heroísmo",
  ANSIÃO: "Ansião",
  ARCOS_DE_VALDEVEZ: "Arcos de Valdevez",
  ARGANIL: "Arganil",
  ARMAAMAR: "Armamar",
  AROUCA: "Arouca",
  ARRAIOLOS: "Arraiolos",
  ARRONCHES: "Arronches",
  ARRUDA_DOS_VINHOS: "Arruda dos Vinhos",
  AVEIRO: "Aveiro",
  AVIZ: "Avis",
  AZAMBUJA: "Azambuja",
  BAIÃO: "Baião",
  BARCELOS: "Barcelos",
  BARREIRO: "Barreiro",
  BATALHA: "Batalha",
  BEJA: "Beja",
  BELMONTE: "Belmonte",
  BENAVENTE: "Benavente",
  BOMBARRAL: "Bombarral",
  BORBA: "Borba",
  BOTICAS: "Boticas",
  BRAGA: "Braga",
  BRAGANCA: "Bragança",
  CABECEIRAS_DE_BASTO: "Cabeceiras de Basto",
  CADAVAL: "Cadaval",
  CALDAS_DA_RAINHA: "Caldas da Rainha",
  CALHETA: "Calheta",
  CAMARA_DE_LOBOS: "Câmara de Lobos",
  CAMINHA: "Caminha",
  "CAMPO MAIOR": "Campo Maior",
  CANTANHEDE: "Cantanhede",
  CARRAZEDA_DE_ANSIÃES: "Carrazeda de Ansiães",
  CARREGAL_DO_SAL: "Carregal do Sal",
  CARTAXO: "Cartaxo",
  CASCAIS: "Cascais",
  CASTANHEIRA_DE_PERA: "Castanheira de Pera",
  CASTELO_BRANCO: "Castelo Branco",
  CASTELO_DE_PAIVA: "Castelo de Paiva",
  CASTELO_DE_VIDE: "Castelo de Vide",
  CASTRO_DAIRE: "Castro Daire",
  CASTRO_MARIM: "Castro Marim",
  CASTRO_VERDE: "Castro Verde",
  CELORICO_DA_BEIRA: "Celorico da Beira",
  CELORICO_DE_BASTO: "Celorico de Basto",
  CHAMUSCA: "Chamusca",
  CHAVES: "Chaves",
  CINFÃES: "Cinfães",
  COIMBRA: "COIMBRA",
  CONDEIXA_A_NOVA: "Condeixa-a-Nova",
  CONSTANCIA: "Constância",
  CORUCHE: "Coruche",
  COVILHA: "Covilhã",
  CRATO: "Crato",
  CUBA: "Cuba",
  ELVAS: "Elvas",
  ENTRONCAMENTO: "Entroncamento",
  ESPOSENDE: "Esposende",
  ESTARREJA: "Estarreja",
  ESTREMOZ: "Estremoz",
  EVORA: "Évora",
  FAFE: "Fafe",
  FARO: "Faro",
  FELGUEIRAS: "Felgueiras",
  FERREIRA_DO_ALENTEJO: "Ferreira do Alentejo",
  FERREIRA_DO_ZEZERE: "Ferreira do Zêzere",
  FIGUEIRA_DA_FOZ: "Figueira da Foz",
  FIGUEIRA_DE_CASTELO_RODRIGO: "Figueira de Castelo Rodrigo",
  FIGUEIRO_DOS_VINHOS: "Figueiró dos Vinhos",
  FORNOS_DE_ALGODRES: "Fornos de Algodres",
  FREIXO_DE_ESPADA_A_CINTA: "Freixo de Espada à Cinta",
  FRONTEIRA: "Fronteira",
  FUNCHAL: "Funchal",
  FUNDAO: "Fundão",
  GOLLEGA: "Golegã",
  GONDOMAR: "Gondomar",
  GOUVEIA: "Gouveia",
  GRANDOLA: "Grândola",
  GUARDA: "Guarda",
  GUIMARAES: "Guimarães",
  IDANHA_A_NOVA: "Idanha-a-Nova",
  ILHAVO: "Ílhavo",
  LAGOS: "Lagos",
  LAMEGO: "Lamego",
  LEIRIA: "Leiria",
  LISBOA: "Lisboa",
  LOULÉ: "Loulé",
  LOURES: "Loures",
  LOURINHÃ: "Lourinhã",
  LOUSÃ: "Lousã",
  LOUSADA: "Lousada",
  MAÇÃO: "Mação",
  MACEDO_DE_CAVALEIROS: "Macedo de Cavaleiros",
  MACHICO: "Machico",
  MAIA: "Maia",
  MANGUALDE: "Mangualde",
  MANTEIGAS: "Manteigas",
  MARCO_DE_CANAVESES: "Marco de Canaveses",
  MARINHA_GRANDE: "Marinha Grande",
  MATOSINHOS: "Matosinhos",
  MEALHADA: "Mealhada",
  MÊDA: "Mêda",
  MELGACO: "Melgaço",
  MERTOLA: "Mértola",
  MESAO_FRIO: "Mesão Frio",
  MIRA: "Mira",
  MIRANDA_DO_CORVO: "Miranda do Corvo",
  MIRANDA_DO_DOURO: "Miranda do Douro",
  MIRANDELA: "Mirandela",
  MOGADOURO: "Mogadouro",
  MOITA: "Moita",
  MONCAO: "Monção",
  MONCHIQUE: "Monchique",
  MONDIM_DE_BASTO: "Mondim de Basto",
  MONFORTE: "Monforte",
  MONTIJO: "Montijo",
  MONTEMOR_O_NOVO: "Montemor-o-Novo",
  MONTEMOR_O_VELHO: "Montemor-o-Velho",
  MOURA: "Moura",
  MOURAO: "Mourão",
  MURCA: "Murça",
  MURTOSA: "Murtosa",
  NAZARE: "Nazaré",
  NELAS: "Nelas",
  NISA: "Nisa",
  NORDESTE: "Nordeste",
  OBIDOS: "Óbidos",
  ODEMIRA: "Odemira",
  OIRAS: "Oeiras",
  OLEIROS: "Oleiros",
  OLHAO: "Olhão",
  OLIVEIRA_DO_BAIRRO: "Oliveira do Bairro",
  OLIVEIRA_DO_HOSPITAL: "Oliveira do Hospital",
  OUREM: "Ourém",
  OURIQUE: "Ourique",
  OVAR: "Ovar",
  PACOS_DE_FERREIRA: "Paços de Ferreira",
  PALMELA: "Palmela",
  PAMPILHOSA_DA_SERRA: "Pampilhosa da Serra",
  PAREDES: "Paredes",
  PENACVA: "Penacova",
  PENAFIEI: "Penafiel",
  PENAMACOR: "Penamacor",
  PENEDONO: "Penedono",
  PENELA: "Penela",
  PENICHE: "Peniche",
  PESO_DA_REGUA: "Peso da Régua",
  PINHEL: "Pinhel",
  POMBAL: "Pombal",
  PONTA_DELGADA: "Ponta Delgada",
  PONTA_DO_SOL: "Ponta do Sol",
  PONTE_DA_BARCA: "Ponte da Barca",
  PONTE_DE_LIMA: "Ponte de Lima",
  PONTE_DE_SOR: "Ponte de Sor",
  PORTALEGRE: "Portalegre",
  PORTEL: "Portel",
  PORTIMAO: "Portimão",
  PORTO: "Porto",
  PORTO_DE_MOS: "Porto de Mós",
  PORTO_MONIZ: "Porto Moniz",
  PORTO_SANTO: "Porto Santo",
  POVOA_DE_LANHOSO: "Póvoa de Lanhoso",
  POVOA_DE_VARZIM: "Póvoa de Varzim",
  POVOACAO: "Povoação",
  PROENCA_A_NOVA: "Proença-a-Nova",
  REDONDO: "Redondo",
  REGUENGOS_DE_MONSARAZ: "Reguengos de Monsaraz",
  RESENDE: "Resende",
  RIBEIRA_BRAVA: "Ribeira Brava",
  RIBEIRA_DE_PENA: "Ribeira de Pena",
  RIBEIRA_GRANDE: "Ribeira Grande",
  SABROSA: "Sabrosa",
  SABUGAL: "Sabugal",
  "SALVATERRA DE MAGOS": "Salvaterra de Magos",
  SANTA_COMBA_DAO: "Santa Comba Dão",
  SANTA_CRUZ: "Santa Cruz",
  SANTA_CRUZ_DA_GRACIOSA: "Santa Cruz da Graciosa",
  SANTA_CRUZ_DAS_FLORES: "Santa Cruz das Flores",
  SANTA_MARIA_DA_FEIRA: "Santa Maria da Feira",
  SANTA_MARTA_DE_PENAGUIAO: "Santa Marta de Penaguião",
  SANTAREM: "Santarém",
  SANTIAGO_DO_CACEM: "Santiago do Cacém",
  SANTO_TIRSO: "Santo Tirso",
  SAO_BRAS_DE_ALPORTEL: "São Brás de Alportel",
  SAO_JOAO_DA_MADEIRA: "São João da Madeira",
  SAO_JOAO_DA_PESQUEIRA: "São João da Pesqueira",
  SAO_PEDRO_DO_SUL: "São Pedro do Sul",
  SAO_ROQUE_DO_PICO: "São Roque do Pico",
  SAO_VICENTE: "São Vicente",
  SATAO: "Sátão",
  SEIA: "Seia",
  SEIXAL: "Seixal",
  SERNANCELHE: "Sernancelhe",
  SERPA: "Serpa",
  SERTÃ: "Sertã",
  SESIMBRA: "Sesimbra",
  SETUBAL: "Setúbal",
  SEVER_DO_VOUGA: "Sever do Vouga",
  SILVES: "Silves",
  SINES: "Sines",
  SINTRA: "Sintra",
  SOURE: "Soure",
  SOUSEL: "Sousel",
  TABUA: "Tábua",
  TABUACO: "Tabuaço",
  TAROUCA: "Tarouca",
  TAVIRA: "Tavira",
  TERRAS_DE_BOURO: "Terras de Bouro",
  TOMAR: "Tomar",
  TONDELA: "Tondela",
  TORRE_DE_MONCORVO: "Torre de Moncorvo",
  TORRES_NOVAS: "Torres Novas",
  TORRES_VEDRAS: "Torres Vedras",
  TRANCOSO: "Trancoso",
  TROFA: "Trofa",
  VAGOS: "Vagos",
  VALENCA: "Valença",
  VALONGO: "Valongo",
  VALPACOS: "Valpaços",
  VELAS: "Velas",
  VENDAS_NOVAS: "Vendas Novas",
  VIANA_DO_ALENTEJO: "Viana do Alentejo",
  VIANA_DO_CASTELO: "Viana do Castelo",
  VIDIGUEIRA: "Vidigueira",
  VIEIRA_DO_MINHO: "Vieira do Minho",
  VILA_DO_BISPO: "Vila do Bispo",
  VILA_DO_CONDE: "Vila do Conde",
  VILA_DO_PORTO: "Vila Porto",
  VILA_FLOR: "Vila Flor",
  VILA_FRANCA_DE_XIRA: "Vila Franca de Xira",
  VILA_FRANCA_DO_CAMPO: "Vila Franca do Campo",
  VILA_NOVA_DA_BARQUINHA: "Vila Nova da Barquinha",
  VILA_NOVA_DE_CERVEIRA: "Vila Nova de Cerveira",
  VILA_NOVA_DE_FAMALICAO: "Vila Nova de Famalicão",
  VILA_NOVA_DE_FOZ_COA: "Vila Nova de Foz Côa",
  VILA_NOVA_DE_GAIA: "Vila Nova de Gaia",
  VILA_NOVA_DE_PAIVA: "Vila Nova de Paiva",
  VILA_NOVA_DE_POIARES: "Vila Nova de Poiares",
  VILA_POUCA_DE_AGUIAR: "Vila Pouca de Aguiar",
  VILA_REAL: "Vila Real",
  VILA_REAL_DE_SANTO_ANTONIO: "Vila Real de Santo António",
  VILA_VELHA_DE_RODAO: "Vila Velha de Ródão",
  VILA_VERDE: "Vila Verde",
  VILA_VICOSA: "Vila Viçosa",
  VIMIOSO: "Vimioso",
  VINHAIS: "Vinhais",
  VISEU: "Viseu",
  VIZELA: "Vizela",
  VOUZELA: "Vouzela",
};

/** Normaliza string removendo acentos e convertendo para uppercase para comparação de chave */
function normalizeString(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

/** Retorna o nome corrigido do distrito ou o original caso não encontre no mapa */
function getCorrectDistrictName(name: string): string {
  if (!name || name === "all") return name;
  const key = normalizeString(name);
  return DISTRICT_CORRECTION_MAP[key] || name;
}

/** Retorna o nome corrigido do concelho ou o original caso não encontre no mapa */
function getCorrectMunicipalityName(name: string): string {
  if (!name || name === "all") return name;
  const key = normalizeString(name);
  return MUNICIPALITY_CORRECTION_MAP[key] || name;
}

function sortValues(values: string[]): string[] {
  return [...values].sort((a, b) => {
    if (a === "Portugal") return -1;
    if (b === "Portugal") return 1;
    return a.localeCompare(b, "pt-PT");
  });
}

function getDistrictOptions(
  locationOptionsByCountry: LocationOptionsByCountry,
  country: string,
): string[] {
  if (country === "all") return [];
  return sortValues(Object.keys(locationOptionsByCountry[country] ?? {}));
}

function getMunicipalityOptions(
  locationOptionsByCountry: LocationOptionsByCountry,
  country: string,
  district: string,
): string[] {
  if (country === "all" || district === "all") return [];
  return sortValues(locationOptionsByCountry[country]?.[district] ?? []);
}

function resolveSelection(
  locationOptionsByCountry: LocationOptionsByCountry,
  countryOptions: string[],
  defaultCountry: string,
  defaultDistrict: string,
  defaultMunicipality: string,
) {
  const country =
    defaultCountry !== "all" && countryOptions.includes(defaultCountry)
      ? defaultCountry
      : "all";

  const districtOptions = getDistrictOptions(locationOptionsByCountry, country);
  const district =
    country !== "all" &&
    defaultDistrict !== "all" &&
    districtOptions.includes(defaultDistrict)
      ? defaultDistrict
      : "all";

  const municipalityOptions = getMunicipalityOptions(
    locationOptionsByCountry,
    country,
    district,
  );
  const municipality =
    country !== "all" &&
    district !== "all" &&
    defaultMunicipality !== "all" &&
    municipalityOptions.includes(defaultMunicipality)
      ? defaultMunicipality
      : "all";

  return { country, district, municipality };
}

export default function MercadoLocationFilters({
  locationOptionsByCountry,
  defaultCountry,
  defaultDistrict,
  defaultMunicipality,
}: MercadoLocationFiltersProps) {
  const countryOptions = useMemo(
    () => sortValues(Object.keys(locationOptionsByCountry)),
    [locationOptionsByCountry],
  );

  const initialSelection = useMemo(
    () =>
      resolveSelection(
        locationOptionsByCountry,
        countryOptions,
        defaultCountry,
        defaultDistrict,
        defaultMunicipality,
      ),
    [
      locationOptionsByCountry,
      countryOptions,
      defaultCountry,
      defaultDistrict,
      defaultMunicipality,
    ],
  );

  const [country, setCountry] = useState(initialSelection.country);
  const [district, setDistrict] = useState(initialSelection.district);
  const [municipality, setMunicipality] = useState(
    initialSelection.municipality,
  );

  useEffect(() => {
    setCountry(initialSelection.country);
    setDistrict(initialSelection.district);
    setMunicipality(initialSelection.municipality);
  }, [
    initialSelection.country,
    initialSelection.district,
    initialSelection.municipality,
  ]);

  const districtOptions = useMemo(
    () => getDistrictOptions(locationOptionsByCountry, country),
    [locationOptionsByCountry, country],
  );

  const municipalityOptions = useMemo(
    () => getMunicipalityOptions(locationOptionsByCountry, country, district),
    [locationOptionsByCountry, country, district],
  );

  const districtDisabled = country === "all" || districtOptions.length === 0;
  const municipalityDisabled =
    districtDisabled || district === "all" || municipalityOptions.length === 0;

  const hasPortugal = countryOptions.includes("Portugal");
  const otherCountryOptions = countryOptions.filter((option) => option !== "Portugal");

  const countrySelectOptions = [
    { value: "all", label: "Todos" },
    ...(hasPortugal ? [{ value: "Portugal", label: "Portugal" }] : []),
    ...(hasPortugal && otherCountryOptions.length > 0
      ? [{ value: "__separator__", label: "--------------------", disabled: true }]
      : []),
    ...otherCountryOptions.map((option) => ({ value: option, label: option })),
  ];

  const districtSelectOptions = districtDisabled
    ? [{ value: "all", label: "Selecione um país" }]
    : [
        { value: "all", label: "Todos" },
        ...districtOptions.map((option) => ({
          value: option,
          label: getCorrectDistrictName(option),
        })),
      ];

  const municipalitySelectOptions = municipalityDisabled
    ? [{ value: "all", label: "Selecione um distrito" }]
    : [
        { value: "all", label: "Todos" },
        ...municipalityOptions.map((option) => ({
          value: option,
          label: getCorrectMunicipalityName(option),
        })),
      ];

  return (
    <>
      <MercadoSingleSelect
        name="country"
        label="País"
        options={countrySelectOptions}
        defaultValue={country}
        value={country}
        onChange={(nextCountry) => {
          setCountry(nextCountry);
          setDistrict("all");
          setMunicipality("all");
        }}
      />

      <MercadoSingleSelect
        name="district"
        label="Distrito"
        options={districtSelectOptions}
        defaultValue={district}
        value={district}
        disabled={districtDisabled}
        onChange={(nextDistrict) => {
          setDistrict(nextDistrict);
          setMunicipality("all");
        }}
      />

      <MercadoSingleSelect
        name="municipality"
        label="Concelho"
        options={municipalitySelectOptions}
        defaultValue={municipality}
        value={municipality}
        disabled={municipalityDisabled}
        onChange={(nextMunicipality) => {
          setMunicipality(nextMunicipality);
        }}
      />
    </>
  );
}
