# Requisitos

1. El enlace de invitación debe abrir una pantalla coherente con la landing, el mail y el login de Se Instala.
2. La pantalla debe tener una ilustración propia, distinta de la del mail y del login, orientada al alta del instalador.
3. En escritorio debe presentar escena y formulario en dos columnas; en móvil debe mostrar primero el formulario y luego la escena.
4. Los estados de token inválido, alta, rol incompatible y aceptación deben compartir el mismo marco visual.
5. No se debe modificar la validación del token, el alta, la aceptación, los roles ni las acciones de Supabase.
6. Los textos visibles deben estar disponibles en español y portugués mediante `next-intl`.
7. La imagen debe estar optimizada para web y cargarse con `next/image`.
8. Debe mantener navegación por teclado, foco visible, texto alternativo y respeto por `prefers-reduced-motion`.
9. El cambio no debe tocar el módulo de finanzas ni otros frentes activos.
