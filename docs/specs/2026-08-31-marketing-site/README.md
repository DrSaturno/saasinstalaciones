# Portada pública de Se Instala

Estado: implementación en `feat/marketing-site-sdd`, pendiente de validación visual del usuario  
Fecha: 2026-08-31  
Método: Spec-Driven Development (SDD)

## Objetivo

Construir la portada pública de `seinstala.com.ar` a partir del mockup aprobado, con la marca vigente **Se Instala**, la paleta del producto y una implementación web real: contenido accesible, responsive, indexable y traducible, no una captura convertida en página.

## Aislamiento del trabajo paralelo

- La implementación vive en un worktree y una rama exclusivos.
- La base es `main@8fc5912`.
- No se modifican rutas, componentes, acciones ni modelos del módulo de finanzas.
- No se toca Supabase, migraciones, RLS, Auth, Storage ni infraestructura.
- Los componentes nuevos se encapsulan en `components/marketing/` y los estilos en un CSS Module.
- Los textos nuevos viven en fragmentos `messages/marketing/` para no editar los
  mismos bloques de traducción que finanzas está modificando en paralelo.
- La integración se limita a la portada pública, sus textos y activos existentes.

## Documentos

- [Requisitos](./requirements.md)
- [Diseño](./design.md)
- [Plan de tareas](./tasks.md)

## Definición de terminado

La portada está terminada cuando reproduce la jerarquía del mockup en desktop y mobile, conserva los CTA funcionales, tiene paridad es-AR/pt-BR, pasa type-check/lint/tests/build y cuenta con evidencia visual en al menos 1440 px y 375 px.
