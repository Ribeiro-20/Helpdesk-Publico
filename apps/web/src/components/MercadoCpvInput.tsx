"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import InfoPopover from "@/components/InfoPopover";



export default function MercadoCpvInput({
  defaultValue,
}: {
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setValue((current) => {
      if (defaultValue === "" && current !== "") return "";
      return current;
    });
  }, [defaultValue]);



  function submitForm(delayMs: number, overrideCpv?: string) {
    if (submitTimerRef.current) {
      clearTimeout(submitTimerRef.current);
    }
    submitTimerRef.current = setTimeout(() => {
      const form = wrapperRef.current?.closest("form");
      if (!(form instanceof HTMLFormElement)) return;
      
      const formData = new FormData(form);
      const params = new URLSearchParams();
      
      formData.forEach((val, key) => {
        if (typeof val === "string" && val.trim() !== "") {
          if (key === "cpv" && overrideCpv !== undefined) return;
          if (val && val !== "all") {
            params.set(key, val);
          }
        }
      });
      
      const cpvToSet = overrideCpv !== undefined ? overrideCpv : formData.get("cpv");
      if (typeof cpvToSet === "string" && cpvToSet.trim() !== "") {
        params.set("cpv", cpvToSet.trim());
      }
      
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    }, delayMs);
  }

  useEffect(() => {
    const form = wrapperRef.current?.closest("form");
    if (!form) return;
    
    const submitHandler = (e: SubmitEvent) => {
      e.preventDefault();
      submitForm(0);
    };
    
    form.addEventListener("submit", submitHandler);
    return () => form.removeEventListener("submit", submitHandler);
  }, [pathname, router]);

  function handleChange(nextValue: string) {
    setValue(nextValue);

    // Auto-search without reloading the page or losing focus
    submitForm(0, nextValue);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-1 mb-1">
        <label
          htmlFor="mercado-cpv"
          className="block text-xs text-gray-400"
        >
          CPV
        </label>
        <InfoPopover
          text="Escreva o inicio do codigo (ex: 331). A pesquisa filtra por prefixo de CPV, como no BASE."
          ariaLabel="Ajuda CPV"
        />
      </div>

      <input
        id="mercado-cpv"
        name="cpv"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        autoComplete="off"
        placeholder="CPV (ex: 331 ou 45000000)"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
      />

    </div>
  );
}
