import { Input } from "@/components/ui/input";

/**
 * Ciudad como texto libre con autocompletado nativo (<datalist>).
 * Las sugerencias salen de las ciudades ya cargadas de la empresa
 * (distinct sites.city), pasadas por prop. Server o Client Component.
 */
export function CityInput({
  name = "city",
  id = "city",
  defaultValue = "",
  suggestions = [],
  required = false,
  disabled = false,
  placeholder,
}: {
  name?: string;
  id?: string;
  defaultValue?: string;
  suggestions?: string[];
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const listId = `${id}-cities`;
  const unique = [...new Set(suggestions.map((s) => s.trim()).filter(Boolean))].sort();
  return (
    <>
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        list={unique.length ? listId : undefined}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
      />
      {unique.length ? (
        <datalist id={listId}>
          {unique.map((city) => (
            <option key={city} value={city} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}
