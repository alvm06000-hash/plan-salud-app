# Mi Plan de Salud 2.0

Esta versión incorpora:

- Alarmas locales de Android mediante `@capacitor/local-notifications`.
- Botones para crear eventos recurrentes en Google Calendar.
- Recordatorios predeterminados: mañana 08:00, tarde 14:00 y noche 20:00.

## Generar la APK

Sube todos los archivos a la raíz del repositorio `plan-salud-app`. GitHub Actions ejecutará el flujo **Build APK**. Al finalizar, descarga el artefacto `plan-salud-debug-apk` e instala `app-debug.apk`.

## Uso

1. Abre **Mi horario**.
2. Pulsa **Activar o actualizar alarmas** y concede permiso de notificaciones.
3. Para Google Calendar, pulsa el botón correspondiente a cada horario y confirma **Guardar** en Google Calendar.
4. Después de modificar medicamentos u horarios, vuelve a pulsar **Activar o actualizar alarmas**.

Las alarmas locales se programan hasta por 30 días por medicamento. Si la receta no indica duración, se programan 7 días. Google Calendar usa 30 días cuando la duración no está indicada.
