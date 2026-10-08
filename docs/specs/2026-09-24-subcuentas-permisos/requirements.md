# Requisitos

## SUBCTA-R1 — El gerente crea subcuentas

- **SUBCTA-R1.1** — Sólo el gerente **dueño** de una empresa puede invitar a una persona
  administrativa como subcuenta de esa empresa.
- **SUBCTA-R1.2** — La invitación se acepta por link, igual que la de instalador: la persona
  invitada crea su contraseña y queda con su propia cuenta.
- **SUBCTA-R1.3** — El rol de la cuenta nueva lo decide el servidor a partir de la invitación,
  nunca el formulario de alta.
- **SUBCTA-R1.4** — Una subcuenta puede ver y ajustar sus propios permisos como información (no
  puede otorgárselos a sí misma ni a otra).

## SUBCTA-R2 — Qué hace una subcuenta por defecto

- **SUBCTA-R2.1** — Una subcuenta recién creada opera proyectos, órdenes, agenda, locaciones,
  clientes, convocatorias y equipo exactamente igual que el gerente dueño.
- **SUBCTA-R2.2** — Una subcuenta **no** ve lo que la empresa le cobra al cliente (importes
  comerciales, bloque 8) salvo que el dueño se lo habilite.
- **SUBCTA-R2.3** — Una subcuenta **no** puede cambiar la configuración de la empresa (hoy: el
  mínimo de fotos de cierre) salvo que el dueño se lo habilite.
- **SUBCTA-R2.4** — Una subcuenta **nunca** puede invitar, ver los permisos de, ni editar a otra
  subcuenta, tenga o no el permiso de finanzas o de configuración.

## SUBCTA-R3 — El dueño otorga permisos

- **SUBCTA-R3.1** — El dueño puede activar o desactivar, para cada subcuenta, el permiso de ver
  importes comerciales y el de cambiar la configuración de la empresa, por separado.
- **SUBCTA-R3.2** — El cambio de permiso se refleja de inmediato: no hace falta que la subcuenta
  vuelva a iniciar sesión.
- **SUBCTA-R3.3** — El dueño puede otorgar el permiso ya en la invitación, para no tener que
  hacerlo en dos pasos.

## SUBCTA-R4 — Aislamiento entre empresas

- **SUBCTA-R4.1** — El dueño de una empresa no puede invitar subcuentas para otra empresa, ni ver
  ni tocar los permisos de las subcuentas de otra empresa.
- **SUBCTA-R4.2** — Una subcuenta nunca alcanza datos de otra empresa: sigue siendo
  `auth_is_company_manager` con el mismo `company_id`, sin cambios en ese punto.

## Criterios de aceptación

- **AC-SUBCTA-A** — Con la sesión del dueño, invitar una subcuenta produce un link; abrirlo sin
  sesión permite crear la cuenta con contraseña propia y termina en el tablero de empresa.
- **AC-SUBCTA-B** — Esa subcuenta, recién creada y sin ningún permiso, puede crear un proyecto y
  una orden, pero al pedir el listado de finanzas o guardar la configuración de la empresa, la base
  lo rechaza.
- **AC-SUBCTA-C** — El dueño activa el permiso de finanzas para esa subcuenta; sin que vuelva a
  iniciar sesión, la subcuenta ya ve los importes.
- **AC-SUBCTA-D** — Una subcuenta con los dos permisos activados igual no puede invitar a otra
  subcuenta ni ver la lista de subcuentas de la empresa: la base lo rechaza.
- **AC-SUBCTA-E** — El dueño de la empresa B no ve ni puede tocar las subcuentas ni sus permisos en
  la empresa A.
- **AC-SUBCTA-F** — Toda cuenta de `company_manager` que ya existía antes de esta migración sigue
  operando exactamente igual (queda como dueña de su empresa).
