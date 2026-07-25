import { provincesFor } from "@/lib/domain/geography";
import type { Country } from "@/types/database";

/**
 * Selector de provincia (AR) / estado (BR) desde la lista fija del país.
 * Es un <select> nativo — sirve en Server y Client Components.
 */
export function ProvinceSelect({
  country,
  name = "state",
  id = "province",
  defaultValue = "",
  required = false,
  disabled = false,
  includeEmpty = false,
  emptyLabel = "Todas",
  className,
}: {
  country: Country;
  name?: string;
  id?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  includeEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const provinces = provincesFor(country);
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      required={required}
      disabled={disabled}
      className={
        className ??
        "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
    >
      {includeEmpty ? <option value="">{emptyLabel}</option> : null}
      {provinces.map((province) => (
        <option key={province} value={province}>
          {province}
        </option>
      ))}
    </select>
  );
}
