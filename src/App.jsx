import React, { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  Clock,
  ExternalLink,
  Loader2,
  Pill,
  Plus,
  Stethoscope,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const API_URL =
  "https://plan-salud-server-production.up.railway.app/api/leer-receta";

const MOMENTOS = [
  { id: "manana", label: "Mañana", sub: "6:00–11:59" },
  { id: "tarde", label: "Tarde", sub: "12:00–17:59" },
  { id: "noche", label: "Noche", sub: "18:00–23:59" },
];

const HORAS_MOMENTO = {
  manana: { hora: 8, minuto: 0, label: "08:00" },
  tarde: { hora: 14, minuto: 0, label: "14:00" },
  noche: { hora: 20, minuto: 0, label: "20:00" },
};

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const PALETA = [
  "#1E3F35",
  "#B87333",
  "#5B7B6F",
  "#8A5A3B",
  "#3D6B5E",
  "#C4915C",
];

function colorPara(nombre = "Medicamento") {
  let h = 0;
  for (let i = 0; i < nombre.length; i += 1) {
    h = nombre.charCodeAt(i) + ((h << 5) - h);
  }
  return PALETA[Math.abs(h) % PALETA.length];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

function siguienteFecha(hora, minuto, diasExtra = 0) {
  const fecha = new Date();
  fecha.setSeconds(0, 0);
  fecha.setHours(hora, minuto, 0, 0);

  if (fecha.getTime() <= Date.now()) {
    fecha.setDate(fecha.getDate() + 1);
  }

  fecha.setDate(fecha.getDate() + diasExtra);
  return fecha;
}

function hashId(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i += 1) {
    hash = (hash * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483647 || 1;
}

function formatoGoogleCalendar(fecha) {
  return fecha.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function abrirGoogleCalendar(medicamento, momentoId) {
  const horario = HORAS_MOMENTO[momentoId];
  if (!horario) return;

  const inicio = siguienteFecha(horario.hora, horario.minuto);
  const fin = new Date(inicio.getTime() + 15 * 60 * 1000);
  const duracion = Math.max(
    1,
    Math.min(Number(medicamento.duracion_dias) || 7, 365),
  );

  const titulo = `Tomar ${medicamento.nombre}`;
  const detalles = [medicamento.dosis, medicamento.indicaciones]
    .filter(Boolean)
    .join(" · ");

  const recurrencia = `RRULE:FREQ=DAILY;COUNT=${duracion}`;
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", titulo);
  url.searchParams.set(
    "dates",
    `${formatoGoogleCalendar(inicio)}/${formatoGoogleCalendar(fin)}`,
  );
  url.searchParams.set("details", detalles || "Recordatorio de medicamento");
  url.searchParams.set("recur", recurrencia);

  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

export default function PlanSalud() {
  const [imagenPreview, setImagenPreview] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(null);
  const [vista, setVista] = useState("subir");
  const [medEditando, setMedEditando] = useState(null);
  const [avisoAlarmas, setAvisoAlarmas] = useState(null);
  const [mostrarOpcionesAlarmas, setMostrarOpcionesAlarmas] = useState(false);
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await Preferences.get({ key: "plan-salud:datos" });
        if (res?.value) {
          setDatos(JSON.parse(res.value));
          setVista("horario");
        }
      } catch (e) {
        console.error("No se pudieron recuperar los datos guardados", e);
      }
    })();
  }, []);

  async function guardar(nuevosDatos) {
    setDatos(nuevosDatos);
    try {
      await Preferences.set({
        key: "plan-salud:datos",
        value: JSON.stringify(nuevosDatos),
      });
    } catch (e) {
      console.error("No se pudo guardar el plan", e);
    }
  }

  async function manejarArchivo(file) {
    if (!file) return;

    setError(null);
    setCargando(true);

    try {
      const b64 = await fileToBase64(file);
      setImagenPreview(URL.createObjectURL(file));

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagen: b64,
          mediaType: file.type || "image/jpeg",
        }),
      });

      if (!response.ok) {
        const detalle = await response.text();
        throw new Error(
          `El servidor respondió ${response.status}: ${detalle.slice(0, 200)}`,
        );
      }

      const parsed = await response.json();

      if (parsed.error) {
        setError(parsed.error);
        return;
      }

      parsed.medicamentos = (parsed.medicamentos || []).map((m, i) => ({
        id: `med-${Date.now()}-${i}`,
        nombre: m.nombre || "Medicamento",
        dosis: m.dosis || "",
        momentos:
          Array.isArray(m.momentos) && m.momentos.length
            ? m.momentos
            : ["manana"],
        duracion_dias: m.duracion_dias || null,
        indicaciones: m.indicaciones || "",
      }));

      parsed.citas = (parsed.citas || []).map((c, i) => ({
        id: `cita-${Date.now()}-${i}`,
        ...c,
      }));

      await guardar(parsed);
      setVista("horario");
    } catch (e) {
      console.error(e);
      setError(
        "No se pudo leer la receta. Revisá tu conexión o probá con una foto más nítida.",
      );
    } finally {
      setCargando(false);
    }
  }

  function toggleMomento(medId, momentoId) {
    if (!datos) return;

    const nuevosDatos = {
      ...datos,
      medicamentos: datos.medicamentos.map((m) => {
        if (m.id !== medId) return m;
        const tiene = m.momentos.includes(momentoId);
        return {
          ...m,
          momentos: tiene
            ? m.momentos.filter((x) => x !== momentoId)
            : [...m.momentos, momentoId],
        };
      }),
    };

    guardar(nuevosDatos);
  }

  function eliminarMed(medId) {
    if (!datos) return;
    guardar({
      ...datos,
      medicamentos: datos.medicamentos.filter((m) => m.id !== medId),
    });
  }

  function agregarMedManual() {
    const nuevo = {
      id: `med-${Date.now()}`,
      nombre: "Nuevo medicamento",
      dosis: "",
      momentos: ["manana"],
      duracion_dias: null,
      indicaciones: "",
    };

    const nuevosDatos = {
      ...(datos || { medicamentos: [], citas: [] }),
      medicamentos: [...(datos?.medicamentos || []), nuevo],
    };

    guardar(nuevosDatos);
    setMedEditando(nuevo.id);
    setVista("horario");
  }

  function actualizarCampoMed(medId, campo, valor) {
    if (!datos) return;
    guardar({
      ...datos,
      medicamentos: datos.medicamentos.map((m) =>
        m.id === medId ? { ...m, [campo]: valor } : m,
      ),
    });
  }

  function eliminarCita(citaId) {
    if (!datos) return;
    guardar({
      ...datos,
      citas: (datos.citas || []).filter((c) => c.id !== citaId),
    });
  }

  async function programarAlarmasTelefono() {
    if (!datos?.medicamentos?.length) {
      setAvisoAlarmas({
        tipo: "error",
        texto: "Agregá al menos un medicamento antes de activar las alarmas.",
      });
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      setAvisoAlarmas({
        tipo: "error",
        texto: "Las alarmas locales solo funcionan en la APK instalada.",
      });
      return;
    }

    try {
      const permiso = await LocalNotifications.requestPermissions();

      if (permiso.display !== "granted") {
        setAvisoAlarmas({
          tipo: "error",
          texto: "Android no concedió permiso para mostrar notificaciones.",
        });
        return;
      }

      const anteriores = await Preferences.get({
        key: "plan-salud:notificaciones",
      });

      const idsAnteriores = anteriores.value
        ? JSON.parse(anteriores.value)
        : [];

      if (idsAnteriores.length) {
        await LocalNotifications.cancel({
          notifications: idsAnteriores.map((id) => ({ id })),
        });
      }

      const notificaciones = [];

      for (const med of datos.medicamentos) {
        const dias = Math.max(
          1,
          Math.min(Number(med.duracion_dias) || 7, 30),
        );

        for (const momentoId of med.momentos || []) {
          const horario = HORAS_MOMENTO[momentoId];
          if (!horario) continue;

          for (let dia = 0; dia < dias; dia += 1) {
            const at = siguienteFecha(horario.hora, horario.minuto, dia);
            const id = hashId(
              `${med.id}-${momentoId}-${at.toISOString().slice(0, 10)}`,
            );

            notificaciones.push({
              id,
              title: `Hora de tomar ${med.nombre}`,
              body:
                [med.dosis, med.indicaciones].filter(Boolean).join(" · ") ||
                `Toma programada para las ${horario.label}`,
              schedule: {
                at,
                allowWhileIdle: true,
              },
              extra: {
                medicamentoId: med.id,
                momento: momentoId,
              },
            });
          }
        }
      }

      if (!notificaciones.length) {
        throw new Error("No hay horarios seleccionados");
      }

      await LocalNotifications.schedule({ notifications: notificaciones });

      await Preferences.set({
        key: "plan-salud:notificaciones",
        value: JSON.stringify(notificaciones.map((n) => n.id)),
      });

      setAvisoAlarmas({
        tipo: "ok",
        texto: `${notificaciones.length} alarmas locales programadas en el teléfono.`,
      });
      setMostrarOpcionesAlarmas(false);
    } catch (e) {
      console.error("No se pudieron programar las alarmas", e);
      setAvisoAlarmas({
        tipo: "error",
        texto:
          "No se pudieron programar las alarmas. Revisá los permisos de notificaciones, alarmas exactas y batería.",
      });
    }
  }

  function mostrarEventosGoogleCalendar() {
    if (!datos?.medicamentos?.length) {
      setAvisoAlarmas({
        tipo: "error",
        texto: "Agregá al menos un medicamento antes de usar Google Calendar.",
      });
      return;
    }

    setMostrarCalendario(true);
    setMostrarOpcionesAlarmas(false);
    setAvisoAlarmas({
      tipo: "ok",
      texto:
        "Elegí cada medicamento y horario para agregarlo a Google Calendar.",
    });
  }

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui",
        background: "#F1EEE4",
        minHeight: "100vh",
        color: "#1C2B24",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        input, textarea { font-family: inherit; }
        ::selection { background: #B87333; color: white; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <header
        style={{
          background: "#1E3F35",
          color: "#F1EEE4",
          padding: "28px 20px 22px",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
            }}
          >
            <Stethoscope size={20} color="#C4915C" />
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                letterSpacing: 1.5,
                color: "#9DB8AC",
                textTransform: "uppercase",
              }}
            >
              Asistente de recetas
            </span>
          </div>
          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 32,
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Mi pastillero semanal
          </h1>
        </div>
      </header>

      <nav
        style={{
          maxWidth: 640,
          margin: "0 auto",
          display: "flex",
          gap: 8,
          padding: "16px 20px 0",
        }}
      >
        {["subir", "horario"].map((v) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              border: "1px solid #1E3F35",
              background: vista === v ? "#1E3F35" : "transparent",
              color: vista === v ? "#F1EEE4" : "#1E3F35",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {v === "subir" ? "Nueva receta" : "Mi horario"}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: 20 }}>
        {vista === "subir" && (
          <div>
            <p
              style={{
                color: "#4A5C53",
                fontSize: 14,
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              Subí una foto clara de la receta. La transcribo y armo el
              pastillero con los horarios sugeridos — después podés ajustar
              cada toma a mano.
            </p>

            <div
              onClick={() => fileInput.current?.click()}
              style={{
                border: "2px dashed #B87333",
                borderRadius: 16,
                padding: "40px 20px",
                textAlign: "center",
                background: "#FFFDF8",
                cursor: "pointer",
              }}
            >
              {imagenPreview ? (
                <img
                  src={imagenPreview}
                  alt="Receta subida"
                  style={{
                    maxWidth: "100%",
                    maxHeight: 220,
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                />
              ) : (
                <Upload
                  size={32}
                  color="#B87333"
                  style={{ marginBottom: 10 }}
                />
              )}
              <div
                style={{
                  fontWeight: 600,
                  color: "#1E3F35",
                  fontSize: 15,
                }}
              >
                {cargando ? "Leyendo la receta..." : "Tocá para subir una foto"}
              </div>
              <div style={{ fontSize: 12, color: "#8A9A90", marginTop: 4 }}>
                JPG o PNG
              </div>
              {cargando && (
                <Loader2
                  size={20}
                  style={{ marginTop: 12, animation: "spin 1s linear infinite" }}
                />
              )}
            </div>

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => manejarArchivo(e.target.files?.[0])}
            />

            {error && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  marginTop: 16,
                  padding: 14,
                  background: "#FCEEE8",
                  borderRadius: 10,
                  color: "#9C4A2E",
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 14 }}>{error}</span>
              </div>
            )}

            <button
              onClick={agregarMedManual}
              style={{
                marginTop: 16,
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #1E3F35",
                background: "transparent",
                color: "#1E3F35",
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Plus size={16} /> O cargar un medicamento manualmente
            </button>
          </div>
        )}

        {vista === "horario" && (
          <div>
            {!datos ||
            (datos.medicamentos.length === 0 &&
              (!datos.citas || datos.citas.length === 0)) ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  color: "#8A9A90",
                }}
              >
                <Pill size={28} style={{ marginBottom: 10 }} />
                <div>
                  Todavía no hay ningún plan. Subí una receta para empezar.
                </div>
              </div>
            ) : (
              <>
                <div
                  style={{
                    background: "#1E3F35",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 20,
                    overflowX: "auto",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      letterSpacing: 1,
                      color: "#9DB8AC",
                      textTransform: "uppercase",
                      marginBottom: 10,
                    }}
                  >
                    Semana tipo
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "56px repeat(7, 1fr)",
                      gap: 4,
                      minWidth: 460,
                    }}
                  >
                    <div />
                    {DIAS.map((d) => (
                      <div
                        key={d}
                        style={{
                          textAlign: "center",
                          fontSize: 11,
                          color: "#9DB8AC",
                          fontWeight: 600,
                          paddingBottom: 4,
                        }}
                      >
                        {d}
                      </div>
                    ))}

                    {MOMENTOS.map((mo) => (
                      <React.Fragment key={mo.id}>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#C4915C",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {mo.label}
                        </div>
                        {DIAS.map((d) => {
                          const meds = (datos.medicamentos || []).filter((m) =>
                            m.momentos.includes(mo.id),
                          );
                          return (
                            <div
                              key={d + mo.id}
                              style={{
                                background: "rgba(241,238,228,0.06)",
                                borderRadius: 8,
                                minHeight: 40,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 3,
                                flexWrap: "wrap",
                                padding: 4,
                              }}
                            >
                              {meds.map((m) => (
                                <span
                                  key={m.id}
                                  title={m.nombre}
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: colorPara(m.nombre),
                                    display: "inline-block",
                                  }}
                                />
                              ))}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    background: "#FFF8EA",
                    border: "1px solid #D7BE8A",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 20,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <BellRing size={22} color="#B87333" />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 16,
                          color: "#1E3F35",
                        }}
                      >
                        Recordatorios
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#6B7A70",
                          marginTop: 3,
                        }}
                      >
                        Elegí alarmas locales del teléfono o eventos de Google
                        Calendar.
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setMostrarOpcionesAlarmas((valorActual) => !valorActual)
                    }
                    style={{
                      marginTop: 12,
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "#B87333",
                      color: "white",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <BellRing size={17} /> Activar o actualizar alarmas
                  </button>

                  {mostrarOpcionesAlarmas && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      <button
                        onClick={programarAlarmasTelefono}
                        style={{
                          padding: "11px 8px",
                          borderRadius: 10,
                          border: "1px solid #1E3F35",
                          background: "#1E3F35",
                          color: "white",
                          fontWeight: 600,
                        }}
                      >
                        Alarmas del teléfono
                      </button>

                      <button
                        onClick={mostrarEventosGoogleCalendar}
                        style={{
                          padding: "11px 8px",
                          borderRadius: 10,
                          border: "1px solid #B87333",
                          background: "transparent",
                          color: "#8A5A3B",
                          fontWeight: 600,
                        }}
                      >
                        Google Calendar
                      </button>
                    </div>
                  )}

                  {avisoAlarmas && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 9,
                        fontSize: 12.5,
                        background:
                          avisoAlarmas.tipo === "ok" ? "#E5F2EA" : "#FCEEE8",
                        color:
                          avisoAlarmas.tipo === "ok" ? "#245A43" : "#9C4A2E",
                      }}
                    >
                      {avisoAlarmas.texto}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <h2
                    style={{
                      fontFamily: "'Fraunces', serif",
                      fontSize: 18,
                      margin: 0,
                      color: "#1E3F35",
                    }}
                  >
                    Medicamentos
                  </h2>
                  <button
                    onClick={agregarMedManual}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#B87333",
                      fontSize: 13,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Plus size={14} /> Agregar
                  </button>
                </div>

                {(datos.medicamentos || []).map((m) => (
                  <div
                    key={m.id}
                    style={{
                      background: "#FFFDF8",
                      border: "1px solid #E5DFC9",
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: colorPara(m.nombre),
                          marginTop: 5,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        {medEditando === m.id ? (
                          <input
                            value={m.nombre}
                            onChange={(e) =>
                              actualizarCampoMed(m.id, "nombre", e.target.value)
                            }
                            onBlur={() => setMedEditando(null)}
                            autoFocus
                            style={{
                              fontWeight: 600,
                              fontSize: 15,
                              border: "1px solid #B87333",
                              borderRadius: 6,
                              padding: "4px 8px",
                              width: "100%",
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => setMedEditando(m.id)}
                            style={{
                              fontWeight: 600,
                              fontSize: 15,
                              color: "#1E3F35",
                            }}
                          >
                            {m.nombre}
                          </div>
                        )}

                        <div
                          style={{
                            fontSize: 13,
                            color: "#6B7A70",
                            marginTop: 2,
                          }}
                        >
                          {m.dosis || "sin dosis especificada"}
                          {m.duracion_dias ? ` · ${m.duracion_dias} días` : ""}
                        </div>

                        {m.indicaciones && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#8A9A90",
                              marginTop: 2,
                              fontStyle: "italic",
                            }}
                          >
                            {m.indicaciones}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            marginTop: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          {MOMENTOS.map((mo) => {
                            const activo = m.momentos.includes(mo.id);
                            return (
                              <button
                                key={mo.id}
                                onClick={() => toggleMomento(m.id, mo.id)}
                                style={{
                                  fontSize: 11,
                                  padding: "4px 10px",
                                  borderRadius: 14,
                                  border: `1px solid ${
                                    activo ? "#1E3F35" : "#D8D2BC"
                                  }`,
                                  background: activo ? "#1E3F35" : "transparent",
                                  color: activo ? "#F1EEE4" : "#8A9A90",
                                  fontWeight: 600,
                                }}
                              >
                                {mo.label}
                              </button>
                            );
                          })}
                        </div>

                        {mostrarCalendario && (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                              marginTop: 10,
                            }}
                          >
                            {(m.momentos || []).map((momentoId) => {
                              const horario = HORAS_MOMENTO[momentoId];
                              if (!horario) return null;
                              return (
                                <button
                                  key={`${m.id}-${momentoId}`}
                                  onClick={() =>
                                    abrirGoogleCalendar(m, momentoId)
                                  }
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "6px 9px",
                                    borderRadius: 9,
                                    border: "1px solid #B87333",
                                    background: "transparent",
                                    color: "#8A5A3B",
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                  }}
                                >
                                  <ExternalLink size={13} /> Google Calendar ·{" "}
                                  {horario.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => eliminarMed(m.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#C4915C",
                          padding: 4,
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {datos.citas && datos.citas.length > 0 && (
                  <>
                    <h2
                      style={{
                        fontFamily: "'Fraunces', serif",
                        fontSize: 18,
                        margin: "20px 0 10px",
                        color: "#1E3F35",
                      }}
                    >
                      Próximas citas
                    </h2>

                    {datos.citas.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          background: "#FFFDF8",
                          border: "1px solid #E5DFC9",
                          borderRadius: 12,
                          padding: 14,
                          marginBottom: 10,
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                        }}
                      >
                        <CalendarClock
                          size={18}
                          color="#B87333"
                          style={{ marginTop: 2, flexShrink: 0 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              color: "#1E3F35",
                            }}
                          >
                            {c.motivo || "Consulta"}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#6B7A70",
                              marginTop: 2,
                            }}
                          >
                            {[c.fecha, c.hora, c.lugar]
                              .filter(Boolean)
                              .join(" · ") || "Sin datos"}
                          </div>
                        </div>
                        <button
                          onClick={() => eliminarCita(c.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#C4915C",
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </>
                )}

                <div
                  style={{
                    marginTop: 24,
                    padding: 14,
                    background: "#EFE8D8",
                    borderRadius: 10,
                    fontSize: 12.5,
                    color: "#5B6B60",
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <Clock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Este pastillero es una guía visual, no reemplaza la
                    indicación médica ni farmacéutica.
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
