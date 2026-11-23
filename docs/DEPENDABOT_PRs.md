# Revisión de actualizaciones de dependencias

> **Revisión:** 2026-11-20  
> **Estado:** PR #32, #33 y #34 integradas en main; sus workflows de CI terminaron correctamente.

## Cambios integrados

| PR | Cambio | Verificación |
|---|---|---|
| [#32](https://github.com/FelipeRoma04/LabRepSys/pull/32) | actions/checkout 7.0.1 | CI y despliegue de Pages |
| [#33](https://github.com/FelipeRoma04/LabRepSys/pull/33) | actions/setup-node 7.1.0 | CI y despliegue de Pages |
| [#34](https://github.com/FelipeRoma04/LabRepSys/pull/34) | 11 actualizaciones npm minor/patch | lint, 298 pruebas y build |

Las Actions usadas en los workflows están fijadas a SHA completos. Dependabot revisa npm y GitHub Actions semanalmente. Las PR #35 y #36, de catálogos/semillas y salvaguardas demo, también quedaron integradas, pero no son actualizaciones de Dependabot.

La auditoría local de dependencias reportó dos vulnerabilidades moderadas; el workflow falla ante nivel alto o crítico. No se aplicó una actualización forzada.
