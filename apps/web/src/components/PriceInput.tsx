"use client";

export default function PriceInput({
  name,
  defaultValue,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <input
      name={name}
      type="number"
      min="0"
      step="1"
      defaultValue={defaultValue}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === "-" || e.key === "+") e.preventDefault();
      }}
      onInput={(e) => {
        const input = e.currentTarget;
        if (Number(input.value) < 0) input.value = "0";
      }}
      className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all w-full"
    />
  );
}
