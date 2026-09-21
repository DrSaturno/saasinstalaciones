import { z } from "zod";

/**
 * Una regla por TIPO de dato, compartida por el formulario y el servidor.
 *
 * Antes cada pantalla decidía la suya: el teléfono admitía 40 caracteres en
 * clientes y 80 en locales, la dirección 200, 250 o 300 según dónde se
 * cargara, y el nombre de una persona 80, 120 o 150. Peor: casi ningún
 * formulario repetía en el navegador los límites del servidor, así que el
 * navegador dejaba enviar algo que el servidor rechazaba con un «Datos
 * inválidos» que no decía qué campo. Con una sola definición, el `maxLength`
 * del input y el `.max()` del esquema salen del mismo número y no pueden
 * divergir.
 *
 * Criterio para unificar: se tomó el límite MÁS AMPLIO que ya existía, nunca
 * uno más chico. Achicar dejaría sin poder editar datos ya guardados. Y ningún
 * límite supera lo que la base acepta: si el servidor deja pasar algo que la
 * columna rechaza, el error vuelve a ser genérico («No se pudo completar la
 * operación»).
 *
 * Lo que es propio de una sola entidad (el nombre de un proyecto, el título de
 * una orden) sigue viviendo en su esquema: acá va sólo lo que se repite.
 */
export const FIELD = {
  /** Nombre de una persona: quien se registra, el gerente, un contacto. */
  personName: { min: 2, max: 150 },
  /** Cualquier email, obligatorio u opcional. 254 es el máximo práctico del estándar. */
  email: { max: 254 },
  phone: { max: 80 },
  address: { max: 300 },
  city: { max: 120 },
  /**
   * Contraseñas nuevas. 72 no es arbitrario: bcrypt ignora lo que sigue, así
   * que una más larga daría la falsa impresión de ser más segura.
   */
  password: { min: 8, max: 72 },
} as const;

export const LATITUDE = { min: -90, max: 90 } as const;
export const LONGITUDE = { min: -180, max: 180 } as const;

/**
 * Techo de toda columna de plata: son `numeric(14, 2)`, o sea doce cifras
 * enteras. Un monto más grande no «entra» en la base y el insert falla con un
 * error que el usuario no puede entender.
 */
export const MONEY_MAX = 999_999_999_999.99;

/**
 * Fotos mínimas para cerrar una orden. La fija la empresa y la puede pisar
 * cada proyecto: es la misma regla en los dos formularios.
 */
export const COMPLETION_PHOTOS = { min: 0, max: 20 } as const;

/** Email obligatorio. */
export const requiredEmail = () =>
  z.string().trim().max(FIELD.email.max).pipe(z.email());

/**
 * Email opcional: vacío o válido. Es un `refine` y no una unión con `""`
 * porque la unión produce un error anidado que después no se puede traducir a
 * «el email no es válido»: sólo dice que ninguna de las dos opciones encajó.
 */
export const optionalEmail = () =>
  z
    .string()
    .trim()
    .max(FIELD.email.max)
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "invalidEmail",
    });

export const personName = () =>
  z.string().trim().min(FIELD.personName.min).max(FIELD.personName.max);

export const newPassword = () =>
  z.string().min(FIELD.password.min).max(FIELD.password.max);
