"use client";

import { useEffect, useMemo, useState } from "react";
import InfoPopover from "./InfoPopover";

type LocationOptionsByCountry = Record<string, Record<string, string[]>>;

type MercadoLocationFiltersProps = {
  locationOptionsByCountry: LocationOptionsByCountry;
  defaultCountry: string;
  defaultDistrict: string;
  defaultMunicipality: string;
};

function sortValues(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, "pt-PT"));
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
  const [municipality, setMunicipality] = useState(initialSelection.municipality);

  useEffect(() => {
    setCountry(initialSelection.country);
    setDistrict(initialSelection.district);
    setMunicipality(initialSelection.municipality);
  }, [initialSelection.country, initialSelection.district, initialSelection.municipality]);

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

  return (
    <div className="md:col-span-3">
      <div className="flex items-center gap-1 mb-1">
        <p className="block text-xs text-gray-500">Local de Execução</p>
        <InfoPopover text="Filtre por país, distrito e concelho do local de execução." />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">País</label>
          <select
            name="country"
            value={country}
            onChange={(event) => {
              setCountry(event.target.value);
              setDistrict("all");
              setMunicipality("all");
            }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
          >
            <option value="all">Todos</option>
            {countryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Distrito</label>
          <select
            name="district"
            value={district}
            disabled={districtDisabled}
            onChange={(event) => {
              setDistrict(event.target.value);
              setMunicipality("all");
            }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white w-full disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="all">{districtDisabled ? "Selecione um país" : "Todos"}</option>
            {districtOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Concelho</label>
          <select
            name="municipality"
            value={municipality}
            disabled={municipalityDisabled}
            onChange={(event) => {
              setMunicipality(event.target.value);
            }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all bg-white w-full disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="all">
              {municipalityDisabled ? "Selecione um distrito" : "Todos"}
            </option>
            {municipalityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
