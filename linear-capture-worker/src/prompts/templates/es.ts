import type { PromptTemplates } from './index.js';

export const es: PromptTemplates = {
  imageRef: (count: number) => (count > 1 ? `Analice estas ${count} capturas de pantalla` : 'Analice esta captura de pantalla'),
  analyzeInstruction: 'y genere información del problema Linear.',
  titleRules: `## Reglas del título (¡Muy importante!)

**Clasificación de colaboración interna vs solicitud externa**:

1. **Colaboración interna** (sin prefijo, solo contenido):
   - Interfaz de mensajería interna Slack, Teams u otra visible
   - Terminología de trabajo interno como "equipo", "proyecto", "reunión", "revisión", "compartir"
   - Nombres de miembros del equipo Geniefy identificables
   - Solicitud de trabajo sin nombre de empresa externa específico

   Formato: Contenido de solicitud específico (máx. 40 caracteres, sin prefijo)
   Ejemplos:
   - "Solicitud de revisión del plan de estudios del taller"
   - "Organización y compartición de herramientas Red Team"
   - "Agregar 20 páginas a materiales educativos"
   - "Revisión de PPT y entrega para mañana"

2. **Solicitud de cliente externo** (incluir nombre de empresa):
   - Nombre de empresa externa claramente visible
   - Empresa identificable por dominio de correo electrónico
   - Palabras clave de solicitud externa como "cotización", "propuesta", "contrato", "pedido"

   Formato: [Nombre de empresa] Contenido de solicitud específico (máx. 40 caracteres)
   Ejemplos:
   - "[Hyundai] Solicitud de plan de estudios del taller y guía de capacitación"
   - "[Samsung] Solicitud de cotización de capacitación en IA (antes del 1/20)"
   - "[Kakao] Solicitud adicional de 20 páginas de PPT de taller personalizado"

3. **Casos poco claros**:
   - Sin nombre de empresa y distinción interna/externa poco clara
   - Escribir solo el contenido en lugar de [Solicitud externa] (evitar sobreclasificación)

**Notas importantes**:
- "Geniefy" es nuestra empresa, nunca incluir en el título
- En caso de duda, escribir solo el contenido de la solicitud sin prefijo
- Usar [Solicitud externa] solo cuando el cliente externo está claramente identificado
- Conectar múltiples solicitudes con &
- Incluir fecha límite si es aplicable`,
  descriptionTemplate: `## Reglas de descripción (¡Puntos de viñeta obligatorios!)
Escriba todo el contenido en formato de viñeta (-).

### Plantilla
## Resumen
- (Solicitud/problema principal en una línea)

## Detalles
- (Contenido identificado 1)
- (Contenido identificado 2)
- (Texto importante en formato "cita" si es aplicable)

## Tareas pendientes
- [ ] (Acción requerida 1)
- [ ] (Acción requerida 2)`,
  userInstructionSection: (instruction: string) => `
---
## ⚠️ Instrucciones del usuario (¡Debe aplicarse primero!)
Debe reflejar el siguiente contenido en el título y la descripción:

> ${instruction.trim()}

Si se proporcionan instrucciones del usuario, prioricelas sobre el contenido de la captura de pantalla al crear el problema.
---`,
  contextSection: {
    header: '## Análisis adicional\nSeleccione los valores más apropiados según el contenido.',
    projectsHeader: '### Proyectos disponibles',
    priorityHeader: '### Niveles de prioridad',
    priorityLevels: `- 1 (Urgente): Errores, interrupciones, solicitudes urgentes
- 2 (Alto): Errores importantes, se requiere procesamiento rápido
- 3 (Medio): Solicitudes generales, mejoras (predeterminado)
- 4 (Bajo): Mejoras menores, se pueden hacer más tarde`,
    estimateHeader: '### Puntos de estimación (Estimación de trabajo)',
    estimateLevels: `- 1: Muy pequeño (cambios de configuración, ediciones de texto)
- 2: Pequeño (correcciones de errores simples)
- 3: Medio (modificaciones de características)
- 5: Grande (desarrollo de nuevas características)
- 8: Muy grande (trabajos importantes)`,
    noProjects: '(Ninguno)',
  },
  jsonFormat: {
    title: 'Título',
    description: 'Descripción (markdown)',
  },
  slackAnalyze: 'Analice la siguiente conversación de Slack y genere información del problema Linear.',
  slackPermalink: 'Conversación original de Slack',
  jsonFormatHeader: 'Formato de respuesta JSON (sin bloques de código markdown):',
  outputLanguageInstruction: 'IMPORTANTE: DEBE escribir el título Y la descripción en español. Incluso si la captura de pantalla contiene texto coreano u otro idioma, DEBE traducir todo al español.',
};
