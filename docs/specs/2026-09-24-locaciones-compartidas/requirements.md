# Requisitos

## LOCSHARE-R1 — Una locación, varios clientes

- **LOCSHARE-R1.1** — Una locación de la empresa puede vincularse a proyectos de **cualquier**
  cliente de esa empresa, no sólo del cliente que la creó.
- **LOCSHARE-R1.2** — Al armar un proyecto, se pueden elegir locaciones ya existentes de otros
  clientes de la empresa, con el mismo alcance que hoy (país y zonas del proyecto, no archivadas).
- **LOCSHARE-R1.3** — Vincular una locación a otro cliente **no la copia**: hay una sola ficha.

## LOCSHARE-R2 — La identidad es compartida

- **LOCSHARE-R2.1** — Editar la dirección, el nombre, la ubicación, el contacto o las notas físicas
  de una locación se refleja en todos los proyectos que la usan, de todos los clientes.
- **LOCSHARE-R2.2** — La historia de cambios de la ficha es una sola.

## LOCSHARE-R3 — El código del local es del cliente

- **LOCSHARE-R3.1** — Cada cliente tiene **su** código (`external_ref`) para una locación; puede ser
  distinto entre clientes o no existir.
- **LOCSHARE-R3.2** — El código sigue siendo único por cliente: dos locaciones del mismo cliente no
  pueden tener el mismo código.
- **LOCSHARE-R3.3** — En los proyectos de un cliente se ve el código de **ese** cliente, nunca el de
  otro.
- **LOCSHARE-R3.4** — Importar con códigos reconoce como ya existentes las locaciones que el cliente
  ya tiene vinculadas, sean propias o compartidas.

## LOCSHARE-R4 — Documentos y requisitos, por cliente

- **LOCSHARE-R4.1** — Un documento o requisito subido en el contexto de un cliente queda de ese
  cliente.
- **LOCSHARE-R4.2** — Quien opera un proyecto de un cliente **no** ve los documentos ni requisitos de
  otro cliente sobre la misma locación (coordinador e instalador). El gerente los ve todos.
- **LOCSHARE-R4.3** — La ficha de la locación muestra qué clientes la usan.

## LOCSHARE-R5 — No se rompe lo existente

- **LOCSHARE-R5.1** — Toda locación existente queda vinculada a su cliente de origen, con su código,
  y todo el historial (proyectos, documentos, requisitos, cambios) sigue intacto.
- **LOCSHARE-R5.2** — Cambiar el cliente de un proyecto sigue exigiendo que sus locaciones estén
  vinculadas al cliente nuevo.
- **LOCSHARE-R5.3** — El aislamiento entre empresas no cambia.

## Criterios de aceptación

- **AC-LOCSHARE-A** — Una locación creada para el cliente A se vincula a un proyecto del cliente B de
  la misma empresa; los `sites` del proyecto de B se crean con la misma dirección.
- **AC-LOCSHARE-B** — Editar la dirección de esa locación cambia la dirección en los `sites` de los
  proyectos de A y de B.
- **AC-LOCSHARE-C** — El `site` del proyecto de A muestra el código de A y el del proyecto de B, el
  de B, aunque sean distintos.
- **AC-LOCSHARE-D** — El coordinador de un proyecto de B no ve los documentos que A subió a la misma
  locación (pgTAP); el gerente sí ve ambos.
- **AC-LOCSHARE-E** — Intentar vincular una locación de **otra empresa** falla.
- **AC-LOCSHARE-F** — Antes y después de la migración: mismas cantidades de locaciones, vínculos,
  documentos, requisitos y eventos (conteo verificado).
