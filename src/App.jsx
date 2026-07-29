import React, { useEffect, useRef, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";
import {
  Upload,
  Loader2,
  Pill,
  CalendarClock,
  AlertCircle,
  Plus,
  Trash2,
  Clock,
  Stethoscope,
  X,
  BellRing,
  ExternalLink,
  CalendarPlus,
} from "lucide-react";

const API_URL =
  "https://plan-salud-server-production.up.railway.app/api/leer-receta";

const MOMENTOS = [
  { id: "manana", label: "Mañana", sub: "06:00–11:59" },
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

function hashId(texto) {
  let hash = 0;

  for (let i = 0; i < texto.length; i += 1) {
    hash = ((hash << 5) - hash + texto.charCodeAt(i)) | 0;
  }

  return (Math.abs(hash) % 2000000000) + 1;
}

function siguienteFecha(hora, minuto, diasAdelante = 0) {
  const fecha = new Date();

  fecha.setDate(fecha.getDate() + diasAdelante);
  fecha.setHours(hora, minuto, 0, 0);

  if (diasAdelante === 0 && fecha.getTime() <= Date.now()) {
    fecha.setDate(fecha.getDate() + 1);
  }

  return fecha;
}

function fechaGoogle(fecha) {
  return fecha
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function colorPara(nombre = "") {
  let hash = 0;

  for (let i = 0; i < nombre.length; i += 1) {
    hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
  }

  return PALETA[Math.abs(hash) % PALETA.length];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const resultado = String(reader.result || "");
      resolve(resultado.split(",")[1]);
    };

    reader.onerror = () => {
      reject(new Error("No se pudo leer el archivo"));
    };

    reader.readAsDataURL(file);
  });
}

export default function PlanSalud() {
  const [imagenPreview, setImagenPreview] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(null);
  const [vista, setVista] = useState("subir");
  const [medEditando, setMedEditando] = useState(null);
  const [avisoAlarmas, setAvisoAlarmas] = useState(null);

  const fileInput = useRef(null);

  useEffect(() => {
    async function cargarDatosGuardados() {
      try {
        const resultado = await Preferences.get({
          key: "plan-salud:datos",
        });

        if (resultado.value) {
          setDatos(JSON.parse(resultado.value));
          setVista("horario");
        }
      } catch (err) {
        console.error("No se pudieron cargar los datos guardados", err);
      }
    }

    cargarDatosGuardados();
  }, []);

  async function guardar(nuevosDatos) {
    setDatos(nuevosDatos);

    try {
      await Preferences.set({
        key: "plan-salud:datos",
        value: JSON.stringify(nuevosDatos),
      });
    } catch (err) {
      console.error("No se pudo guardar el plan", err);
    }
  }

  async function manejarArchivo(file) {
    if (!file) return;

    setError(null);
    setCargando(true);

    try {
      const base64 = await fileToBase64(file);

      if (imagenPreview) {
        URL.revokeObjectURL(imagenPreview);
      }

      setImagenPreview(URL.createObjectURL(file));

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imagen: base64,
          mediaType: file.type || "image/jpeg",
        }),
      });

      if (!response.ok) {
        let mensajeServidor = "";

        try {
          const contenido = await response.json();
          mensajeServidor = contenido?.error || contenido?.message || "";
        } catch {
          mensajeServidor = "";
        }

        throw new Error(
          mensajeServidor ||
            `El servidor respondió con estado ${response.status}`
        );
      }

      const parsed = await response.json();

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      const ahora = Date.now();

      const medicamentos = (parsed.medicamentos || []).map(
        (medicamento, indice) => ({
          id: `med-${ahora}-${indice}`,
          nombre: medicamento.nombre || "Medicamento",
          dosis: medicamento.dosis || "",
          momentos:
            Array.isArray(medicamento.momentos) &&
            medicamento.momentos.length > 0
              ? medicamento.momentos
              : ["manana"],
          duracion_dias: medicamento.duracion_dias || null,
          indicaciones: medicamento.indicaciones || "",
        })
      );

      const citas = (parsed.citas || []).map((cita, indice) => ({
        id: `cita-${ahora}-${indice}`,
        ...cita,
      }));

      await guardar({
        ...parsed,
        medicamentos,
        citas,
      });

      setVista("horario");
    } catch (err) {
      console.error("Error leyendo la receta:", err);

      setError(
        err.message ||
          "No se pudo leer la receta. Revisa tu conexión o prueba con una foto más nítida."
      );
    } finally {
      setCargando(false);
    }
  }

  function toggleMomento(medId, momentoId) {
    if (!datos) return;

    const medicamentos = (datos.medicamentos || []).map((medicamento) => {
      if (medicamento.id !== medId) return medicamento;

      const momentosActuales = medicamento.momentos || [];
      const seleccionado = momentosActuales.includes(momentoId);

      return {
        ...medicamento,
        momentos: seleccionado
          ? momentosActuales.filter((id) => id !== momentoId)
          : [...momentosActuales, momentoId],
      };
    });

    guardar({
      ...datos,
      medicamentos,
    });
  }

  function eliminarMed(medId) {
    if (!datos) return;

    guardar({
      ...datos,
      medicamentos: (datos.medicamentos || []).filter(
        (medicamento) => medicamento.id !== medId
      ),
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
      ...(datos || {}),
      medicamentos: [...(datos?.medicamentos || []), nuevo],
      citas: datos?.citas || [],
    };

    guardar(nuevosDatos);
    setMedEditando(nuevo.id);
    setVista("horario");
  }

  function actualizarCampoMed(medId, campo, valor) {
    if (!datos) return;

    guardar({
      ...datos,
      medicamentos: (datos.medicamentos || []).map((medicamento) =>
        medicamento.id === medId
          ? {
              ...medicamento,
              [campo]: valor,
            }
          : medicamento
      ),
    });
  }

  function eliminarCita(citaId) {
    if (!datos) return;

    guardar({
      ...datos,
      citas: (datos.citas || []).filter((cita) => cita.id !== citaId),
    });
  }

  function construirUrlGoogleCalendar(med, momentoId) {
    const horario = HORAS_MOMENTO[momentoId];

    if (!horario) return null;

    const inicio = siguienteFecha(horario.hora, horario.minuto);
    const fin = new Date(inicio.getTime() + 15 * 60 * 1000);

    const cantidad = Math.max(
      1,
      Math.min(Number(med.duracion_dias) || 30, 365)
    );

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `Tomar ${med.nombre}`,
      dates: `${fechaGoogle(inicio)}/${fechaGoogle(fin)}`,
      details:
        [med.dosis, med.indicaciones, "Creado desde Mi Plan de Salud"]
          .filter(Boolean)
          .join("\n") || "Recordatorio de medicamento",
      recur: `RRULE:FREQ=DAILY;COUNT=${cantidad}`,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function abrirGoogleCalendar(med, momentoId) {
    const url = construirUrlGoogleCalendar(med, momentoId);

    if (!url) {
      setAvisoAlarmas({
        tipo: "error",
        texto: "No se pudo preparar el evento de Google Calendar.",
      });
      return;
    }

    window.open(url, "_blank");
  }

  function abrirPrimerEventoGoogleCalendar() {
    const medicamentos = datos?.medicamentos || [];

    for (const medicamento of medicamentos) {
      for (const momentoId of medicamento.momentos || []) {
        abrirGoogleCalendar(medicamento, momentoId);

        setAvisoAlarmas({
          tipo: "ok",
          texto:
            "Google Calendar se abrió con el primer evento. Guarda el evento y usa los botones de cada medicamento para agregar los demás horarios.",
        });

        return;
      }
    }

    setAvisoAlarmas({
      tipo: "error",
      texto: "No hay horarios seleccionados para Google Calendar.",
    });
  }

  async function programarAlarmas() {
    if (!datos?.medicamentos?.length) {
      setAvisoAlarmas({
        tipo: "error",
        texto:
          "Agrega al menos un medicamento antes de activar las alarmas.",
      });
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      setAvisoAlarmas({
        tipo: "error",
        texto:
          "Las alarmas locales solo funcionan dentro de la APK instalada.",
      });
      return;
    }

    try {
      setAvisoAlarmas(null);

      const permiso = await LocalNotifications.requestPermissions();

      if (permiso.display !== "granted") {
        setAvisoAlarmas({
          tipo: "error",
          texto:
            "Android no concedió permiso para mostrar notificaciones. Actívalo desde Ajustes → Aplicaciones → Mi Plan de Salud → Notificaciones.",
        });
        return;
      }

      const pendientes = await LocalNotifications.getPending();

      const idsGuardados = await Preferences.get({
        key: "plan-salud:notificaciones",
      });

      let idsAnteriores = [];

      try {
        idsAnteriores = idsGuardados.value
          ? JSON.parse(idsGuardados.value)
          : [];
      } catch {
        idsAnteriores = [];
      }

      const idsPendientes = (pendientes.notifications || []).map(
        (notificacion) => notificacion.id
      );

      const idsParaCancelar = [
        ...new Set([...idsAnteriores, ...idsPendientes]),
      ];

      if (idsParaCancelar.length > 0) {
        await LocalNotifications.cancel({
          notifications: idsParaCancelar.map((id) => ({ id })),
        });
      }

      const notificaciones = [];

      for (const medicamento of datos.medicamentos) {
        const duracion = Math.max(
          1,
          Math.min(Number(medicamento.duracion_dias) || 7, 30)
        );

        for (const momentoId of medicamento.momentos || []) {
          const horario = HORAS_MOMENTO[momentoId];

          if (!horario) continue;

          for (let dia = 0; dia < duracion; dia += 1) {
            const fecha = siguienteFecha(
              horario.hora,
              horario.minuto,
              dia
            );

            const id = hashId(
              `${medicamento.id}-${momentoId}-${fecha
                .toISOString()
                .slice(0, 10)}`
            );

            notificaciones.push({
              id,
              title: `Hora de tomar ${medicamento.nombre}`,
              body:
                [medicamento.dosis, medicamento.indicaciones]
                  .filter(Boolean)
                  .join(" · ") ||
                `Toma programada para las ${horario.label}`,
              schedule: {
                at: fecha,
                allowWhileIdle: true,
              },
              sound: "default",
              actionTypeId: "",
              extra: {
                medicamentoId: medicamento.id,
                momento: momentoId,
              },
            });
          }
        }
      }

      if (notificaciones.length === 0) {
        throw new Error("No hay horarios seleccionados");
      }

      /*
       * Android limita el número de alarmas pendientes.
       * Se programan como máximo 60 para evitar fallos.
       */
      const notificacionesLimitadas = notificaciones.slice(0, 60);

      await LocalNotifications.schedule({
        notifications: notificacionesLimitadas,
      });

      await Preferences.set({
        key: "plan-salud:notificaciones",
        value: JSON.stringify(
          notificacionesLimitadas.map(
            (notificacion) => notificacion.id
          )
        ),
      });

      setAvisoAlarmas({
        tipo: "ok",
        texto: `${notificacionesLimitadas.length} alarmas del teléfono programadas correctamente. Google Calendar se mantiene como una opción separada.`,
      });
    } catch (err) {
      console.error("No se pudieron programar las alarmas:", err);

      setAvisoAlarmas({
        tipo: "error",
        texto:
          "No se pudieron programar las alarmas. Revisa los permisos de notificaciones, alarmas y ahorro de batería.",
      });
    }
  }

  const medicamentos = datos?.medicamentos || [];
  const citas = datos?.citas || [];

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui",
        background: "#F1EEE4",
        minHeight: "100vh",
        color: "#1C2B24",
      }}
    >
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');

          * {
            box-sizing: border-box;
          }

          button {
            font-family: inherit;
            cursor: pointer;
          }

          input,
          textarea {
            font-family: inherit;
          }

          ::selection {
            background: #B87333;
            color: white;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

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
        {["subir", "horario"].map((opcion) => (
          <button
            key={opcion}
            onClick={() => setVista(opcion)}
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              border: "1px solid #1E3F35",
              background:
                vista === opcion ? "#1E3F35" : "transparent",
              color: vista === opcion ? "#F1EEE4" : "#1E3F35",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {opcion === "subir" ? "Nueva receta" : "Mi horario"}
          </button>
        ))}
      </nav>

      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: 20,
        }}
      >
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
              Sube una foto clara de la receta. La aplicación
              transcribirá los medicamentos y preparará los horarios
              sugeridos.
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
                {cargando
                  ? "Leyendo la receta..."
                  : "Toca para subir una foto"}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "#8A9A90",
                  marginTop: 4,
                }}
              >
                JPG o PNG
              </div>

              {cargando && (
                <Loader2
                  size={20}
                  style={{
                    marginTop: 12,
                    animation: "spin 1s linear infinite",
                  }}
                />
              )}
            </div>

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(evento) =>
                manejarArchivo(evento.target.files?.[0])
              }
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
                <AlertCircle
                  size={18}
                  style={{
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                />

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
              <Plus size={16} />
              Agregar un medicamento manualmente
            </button>
          </div>
        )}

        {vista === "horario" && (
          <div>
            {!datos ||
            (medicamentos.length === 0 && citas.length === 0) ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  color: "#8A9A90",
                }}
              >
                <Pill size={28} style={{ marginBottom: 10 }} />

                <div>
                  Todavía no hay ningún plan. Sube una receta para
                  empezar.
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

                    {DIAS.map((dia) => (
                      <div
                        key={dia}
                        style={{
                          textAlign: "center",
                          fontSize: 11,
                          color: "#9DB8AC",
                          fontWeight: 600,
                          paddingBottom: 4,
                        }}
                      >
                        {dia}
                      </div>
                    ))}

                    {MOMENTOS.map((momento) => (
                      <React.Fragment key={momento.id}>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#C4915C",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {momento.label}
                        </div>

                        {DIAS.map((dia) => {
                          const medsMomento = medicamentos.filter(
                            (medicamento) =>
                              (medicamento.momentos || []).includes(
                                momento.id
                              )
                          );

                          return (
                            <div
                              key={`${dia}-${momento.id}`}
                              style={{
                                background:
                                  "rgba(241,238,228,0.06)",
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
                              {medsMomento.map((medicamento) => (
                                <span
                                  key={medicamento.id}
                                  title={medicamento.nombre}
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: colorPara(
                                      medicamento.nombre
                                    ),
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
                    background: "#FFF7E8",
                    border: "1px solid #D9B98C",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <BellRing
                      size={20}
                      color="#B87333"
                      style={{
                        marginTop: 2,
                        flexShrink: 0,
                      }}
                    />

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                        }}
                      >
                        Recordatorios del tratamiento
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: "#6B7A70",
                          marginTop: 3,
                          lineHeight: 1.5,
                        }}
                      >
                        Puedes activar notificaciones en el teléfono o
                        agregar los horarios a Google Calendar.
                      </div>

                      <button
                        onClick={programarAlarmas}
                        style={{
                          marginTop: 10,
                          width: "100%",
                          padding: "11px 12px",
                          borderRadius: 9,
                          border: "none",
                          background: "#B87333",
                          color: "white",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 7,
                        }}
                      >
                        <BellRing size={16} />
                        Activar alarmas del teléfono
                      </button>

                      <button
                        onClick={abrirPrimerEventoGoogleCalendar}
                        style={{
                          marginTop: 8,
                          width: "100%",
                          padding: "11px 12px",
                          borderRadius: 9,
                          border: "1px solid #B87333",
                          background: "#FFFDF8",
                          color: "#8A5A3B",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 7,
                        }}
                      >
                        <CalendarPlus size={16} />
                        Agregar a Google Calendar
                      </button>

                      {avisoAlarmas && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            lineHeight: 1.5,
                            color:
                              avisoAlarmas.tipo === "ok"
                                ? "#276749"
                                : "#9C4A2E",
                          }}
                        >
                          {avisoAlarmas.texto}
                        </div>
                      )}
                    </div>
                  </div>
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
                    <Plus size={14} />
                    Agregar
                  </button>
                </div>

                {medicamentos.map((medicamento) => (
                  <div
                    key={medicamento.id}
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
                          background: colorPara(medicamento.nombre),
                          marginTop: 5,
                          flexShrink: 0,
                        }}
                      />

                      <div style={{ flex: 1 }}>
                        {medEditando === medicamento.id ? (
                          <input
                            value={medicamento.nombre}
                            onChange={(evento) =>
                              actualizarCampoMed(
                                medicamento.id,
                                "nombre",
                                evento.target.value
                              )
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
                            onClick={() =>
                              setMedEditando(medicamento.id)
                            }
                            style={{
                              fontWeight: 600,
                              fontSize: 15,
                              color: "#1E3F35",
                            }}
                          >
                            {medicamento.nombre}
                          </div>
                        )}

                        <div
                          style={{
                            fontSize: 13,
                            color: "#6B7A70",
                            marginTop: 2,
                          }}
                        >
                          {medicamento.dosis ||
                            "Sin dosis especificada"}

                          {medicamento.duracion_dias
                            ? ` · ${medicamento.duracion_dias} días`
                            : ""}
                        </div>

                        {medicamento.indicaciones && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#8A9A90",
                              marginTop: 2,
                              fontStyle: "italic",
                            }}
                          >
                            {medicamento.indicaciones}
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            marginTop: 8,
                          }}
                        >
                          {MOMENTOS.map((momento) => {
                            const activo = (
                              medicamento.momentos || []
                            ).includes(momento.id);

                            return (
                              <button
                                key={momento.id}
                                onClick={() =>
                                  toggleMomento(
                                    medicamento.id,
                                    momento.id
                                  )
                                }
                                style={{
                                  fontSize: 11,
                                  padding: "4px 10px",
                                  borderRadius: 14,
                                  border: `1px solid ${
                                    activo
                                      ? "#1E3F35"
                                      : "#D8D2BC"
                                  }`,
                                  background: activo
                                    ? "#1E3F35"
                                    : "transparent",
                                  color: activo
                                    ? "#F1EEE4"
                                    : "#8A9A90",
                                  fontWeight: 600,
                                }}
                              >
                                {momento.label}
                              </button>
                            );
                          })}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            marginTop: 8,
                          }}
                        >
                          {(medicamento.momentos || []).map(
                            (momentoId) => (
                              <button
                                key={`calendar-${medicamento.id}-${momentoId}`}
                                onClick={() =>
                                  abrirGoogleCalendar(
                                    medicamento,
                                    momentoId
                                  )
                                }
                                style={{
                                  fontSize: 10.5,
                                  padding: "5px 8px",
                                  borderRadius: 8,
                                  border:
                                    "1px solid #B87333",
                                  background: "transparent",
                                  color: "#8A5A3B",
                                  fontWeight: 600,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <ExternalLink size={12} />
                                Google Calendar ·{" "}
                                {
                                  HORAS_MOMENTO[momentoId]
                                    ?.label
                                }
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          eliminarMed(medicamento.id)
                        }
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

                {citas.length > 0 && (
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

                    {citas.map((cita) => (
                      <div
                        key={cita.id}
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
                          style={{
                            marginTop: 2,
                            flexShrink: 0,
                          }}
                        />

                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              color: "#1E3F35",
                            }}
                          >
                            {cita.motivo || "Consulta"}
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              color: "#6B7A70",
                              marginTop: 2,
                            }}
                          >
                            {[cita.fecha, cita.hora, cita.lugar]
                              .filter(Boolean)
                              .join(" · ") || "Sin datos"}
                          </div>
                        </div>

                        <button
                          onClick={() => eliminarCita(cita.id)}
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
                  <Clock
                    size={16}
                    style={{
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  />

                  <span>
                    Este pastillero es una guía visual y no reemplaza
                    la indicación médica ni farmacéutica.
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
