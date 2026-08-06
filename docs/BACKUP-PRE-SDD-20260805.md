# Backup previo a la evolución SDD

Creado: 05-08-2026  
Commit preservado: `d4a5e7c65376884975af905b9d7b93d417114a7f`  
Rama de backup: `backup/pre-sdd-20260805`  
Tag de backup: `backup-pre-sdd-20260805-d4a5e7c`  
Rama de desarrollo: `feat/sdd-evolution-20260805`

Este backup representa el código de la aplicación antes de comenzar la implementación de los pedidos de la reunión del 04-08-2026. Los documentos SDD se crearon después de ese commit y viven en la rama de desarrollo.

## Verificar sin cambiar el worktree

```powershell
git show --stat backup-pre-sdd-20260805-d4a5e7c
git diff backup-pre-sdd-20260805..feat/sdd-evolution-20260805
```

## Volver temporalmente al backup

Antes de cambiar de rama, guardar o confirmar cualquier modificación que se quiera conservar. Luego:

```powershell
git switch backup/pre-sdd-20260805
```

## Crear una rama nueva desde el backup

Esta es la opción más segura para investigar o hacer un rollback sin mover la rama de desarrollo:

```powershell
git switch -c restore/pre-sdd-20260805 backup-pre-sdd-20260805-d4a5e7c
```

No borrar la rama ni el tag hasta que todas las releases SDD hayan superado el período de observación en producción.
