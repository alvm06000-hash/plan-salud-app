import React, { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { supabase, supabaseConfigurado } from "./supabaseClient";
import {
  cargarDatosNube,
  guardarDatosNube,
  guardarHistorialNube,
  guardarRecetaNube,
  eliminarRecetaNube,
  crearInvitacionCuidador,
  aceptarInvitacionCuidador,
  cargarCirculoCuidado,
  revocarVinculoCuidador,
  cargarPacienteCompartido,
  crearAlertaDosisPendiente,
  resolverAlertasDosis,
  cargarAlertasCuidado,
  marcarAlertaCuidadoLeida,
} from "./cloudService";
import {
  AlertCircle,
  BarChart3,
  Cloud,
  LogIn,
  LogOut,
  RefreshCw,
  User,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleX,
  Clock,
  History,
  Search,
  ExternalLink,
  FileText,
  Loader2,
  Pill,
  Plus,
  Stethoscope,
  Trash2,
  Upload,
  X,
  Users,
  UserPlus,
  Copy,
  ShieldAlert,
  Share2,
  Eye,
  Flame,
  Trophy,
  Target,
  Award,
} from "lucide-react";

const API_URL =
  "https://plan-salud-server-production.up.railway.app/api/leer-receta";
const INTERACCIONES_URL =
  "https://plan-salud-server-production.up.railway.app/api/analizar-interacciones";

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

function momentoCercano() {
  const hora = new Date().getHours();
  if (hora < 12) return "manana";
  if (hora < 18) return "tarde";
  return "noche";
}

function fechaLocalClave(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export default function PlanSalud() {
  const [imagenPreview, setImagenPreview] = useState(null);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(null);
  const [vista, setVista] = useState("subir");
  const [medEditando, setMedEditando] = useState(null);
  const [avisoAlarmas, setAvisoAlarmas] = useState(null);
  const [mostrarOpcionesAlarmas, setMostrarOpcionesAlarmas] = useState(false);
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [historialRecetas, setHistorialRecetas] = useState([]);
  const [busquedaRecetas, setBusquedaRecetas] = useState("");
  const [fechaFiltroRecetas, setFechaFiltroRecetas] = useState("");
  const [recetaExpandida, setRecetaExpandida] = useState(null);
  const [sesion, setSesion] = useState(null);
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [modoRegistro, setModoRegistro] = useState(false);
  const [authCargando, setAuthCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [estadoNube, setEstadoNube] = useState("");
  const [analizandoInteracciones, setAnalizandoInteracciones] = useState(false);
  const [resultadoInteracciones, setResultadoInteracciones] = useState(null);
  const [circuloCuidado, setCirculoCuidado] = useState([]);
  const [codigoInvitacion, setCodigoInvitacion] = useState("");
  const [codigoParaAceptar, setCodigoParaAceptar] = useState("");
  const [relacionCuidador, setRelacionCuidador] = useState("Familiar");
  const [mensajeFamilia, setMensajeFamilia] = useState("");
  const [pacienteCompartido, setPacienteCompartido] = useState(null);
  const [cargandoFamilia, setCargandoFamilia] = useState(false);
  const [actualizadoCuidadorEn, setActualizadoCuidadorEn] = useState(null);
  const [mostrarDetallesEstadisticas, setMostrarDetallesEstadisticas] = useState(false);
  const [alertasCuidado, setAlertasCuidado] = useState([]);
  const [cargandoAlertas, setCargandoAlertas] = useState(false);
  const [minutosAvisoCuidador, setMinutosAvisoCuidador] = useState(30);
  const [mostrarHistorialAlertas, setMostrarHistorialAlertas] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await Preferences.get({ key: "plan-salud:datos" });
        if (res?.value) {
          setDatos(JSON.parse(res.value));
          setVista("horario");
        }

        const historialGuardado = await Preferences.get({
          key: "plan-salud:historial",
        });
        if (historialGuardado?.value) {
          setHistorial(JSON.parse(historialGuardado.value));
        }

        const recetasGuardadas = await Preferences.get({
          key: "plan-salud:recetas",
        });
        if (recetasGuardadas?.value) {
          setHistorialRecetas(JSON.parse(recetasGuardadas.value));
        }

        const demoraGuardada = await Preferences.get({ key: "plan-salud:demora-cuidador" });
        if (demoraGuardada?.value) setMinutosAvisoCuidador(Number(demoraGuardada.value) || 30);
      } catch (e) {
        console.error("No se pudieron recuperar los datos guardados", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!supabaseConfigurado) return undefined;

    let activo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (activo) setSesion(data.session || null);
    });

    const { data } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion || null);
    });

    return () => {
      activo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function guardar(nuevosDatos) {
    setDatos(nuevosDatos);
    try {
      await Preferences.set({
        key: "plan-salud:datos",
        value: JSON.stringify(nuevosDatos),
      });

      if (sesion?.user?.id && supabaseConfigurado) {
        guardarDatosNube(sesion.user.id, nuevosDatos).catch((errorNube) => {
          console.error("No se pudo sincronizar el plan con la nube", errorNube);
        });
      }
    } catch (e) {
      console.error("No se pudo guardar el plan", e);
    }
  }

  async function guardarRecetaEnHistorial(receta) {
    const nuevasRecetas = [
      receta,
      ...historialRecetas.filter((item) => item.id !== receta.id),
    ].sort((a, b) => new Date(b.leidaEn) - new Date(a.leidaEn));

    setHistorialRecetas(nuevasRecetas);
    await Preferences.set({
      key: "plan-salud:recetas",
      value: JSON.stringify(nuevasRecetas),
    });

    if (sesion?.user?.id && supabaseConfigurado) {
      guardarRecetaNube(sesion.user.id, receta).catch((errorNube) => {
        console.error("No se pudo guardar la receta en la nube", errorNube);
      });
    }
  }

  async function eliminarRecetaHistorial(recetaId) {
    const nuevasRecetas = historialRecetas.filter((item) => item.id !== recetaId);
    setHistorialRecetas(nuevasRecetas);
    await Preferences.set({
      key: "plan-salud:recetas",
      value: JSON.stringify(nuevasRecetas),
    });
    if (recetaExpandida === recetaId) setRecetaExpandida(null);

    if (sesion?.user?.id && supabaseConfigurado) {
      eliminarRecetaNube(sesion.user.id, recetaId).catch((errorNube) => {
        console.error("No se pudo eliminar la receta de la nube", errorNube);
      });
    }
  }

  async function manejarArchivo(file) {
    if (!file) return;

    const esPdf =
      file.type === "application/pdf" ||
      file.name?.toLowerCase().endsWith(".pdf");
    const esImagen = file.type?.startsWith("image/");

    if (!esPdf && !esImagen) {
      setError("Formato no compatible. Usa una imagen JPG/PNG/WEBP o un archivo PDF.");
      return;
    }

    // El archivo viaja como Base64 dentro de JSON. 15 MB evita superar
    // el límite de 30 MB del backend después de la conversión.
    if (file.size > 15 * 1024 * 1024) {
      setError("El archivo es demasiado grande. El máximo permitido es 15 MB.");
      return;
    }

    setError(null);
    setCargando(true);
    setArchivoSeleccionado({ nombre: file.name, esPdf });

    try {
      const b64 = await fileToBase64(file);
      setImagenPreview(esPdf ? null : URL.createObjectURL(file));

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagen: b64,
          mediaType: esPdf ? "application/pdf" : file.type || "image/jpeg",
          nombreArchivo: file.name || (esPdf ? "receta.pdf" : "receta.jpg"),
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
        frecuencia_literal: m.frecuencia_literal || null,
        via: m.via || null,
        confianza: Number(m.confianza ?? 0),
        requiere_revision: Boolean(m.requiere_revision),
      }));

      parsed.citas = (parsed.citas || []).map((c, i) => ({
        id: `cita-${Date.now()}-${i}`,
        ...c,
      }));

      const recetaHistorial = {
        id: `receta-${Date.now()}`,
        nombreArchivo: file.name || (esPdf ? "receta.pdf" : "receta.jpg"),
        tipoArchivo: esPdf ? "application/pdf" : file.type || "image/jpeg",
        medico: parsed.medico || null,
        paciente: parsed.paciente || null,
        fechaReceta: parsed.fecha || null,
        leidaEn: new Date().toISOString(),
        confianza: Number(parsed.confianza_global ?? 0),
        requiereRevision: Boolean(parsed.requiere_revision),
        advertencias: Array.isArray(parsed.advertencias) ? parsed.advertencias : [],
        datos: parsed,
      };

      await guardar(parsed);
      await guardarRecetaEnHistorial(recetaHistorial);
      setVista("horario");
    } catch (e) {
      console.error("Error completo al leer receta:", e);
      setError(
        e?.message ||
          "No se pudo leer la receta por un error desconocido.",
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

  async function guardarHistorial(nuevoHistorial) {
    setHistorial(nuevoHistorial);
    try {
      await Preferences.set({
        key: "plan-salud:historial",
        value: JSON.stringify(nuevoHistorial),
      });

      if (sesion?.user?.id && supabaseConfigurado) {
        guardarHistorialNube(sesion.user.id, nuevoHistorial).catch((errorNube) => {
          console.error("No se pudo sincronizar el historial con la nube", errorNube);
        });
      }
    } catch (e) {
      console.error("No se pudo guardar el historial", e);
    }
  }

  function fechaProgramadaPara(momentoId, fechaBase = new Date()) {
    const horario = HORAS_MOMENTO[momentoId] || HORAS_MOMENTO.noche;
    const fecha = new Date(fechaBase);
    fecha.setHours(horario.hora, horario.minuto, 0, 0);
    return fecha;
  }

  async function actualizarAlertasCuidado({ notificar = false } = {}) {
    if (!sesion?.user?.id || !supabaseConfigurado) return;
    setCargandoAlertas(true);
    try {
      const nuevas = await cargarAlertasCuidado(150);
      setAlertasCuidado(nuevas);

      if (notificar && Capacitor.isNativePlatform()) {
        const guardadas = await Preferences.get({ key: "plan-salud:alertas-notificadas" });
        const idsNotificados = new Set(guardadas?.value ? JSON.parse(guardadas.value) : []);
        const pendientes = nuevas.filter((a) => a.caregiver_id === sesion.user.id && a.status === "active" && !idsNotificados.has(a.id));
        if (pendientes.length) {
          const permiso = await LocalNotifications.requestPermissions();
          if (permiso.display === "granted") {
            await LocalNotifications.schedule({ notifications: pendientes.slice(0, 5).map((a, i) => ({
              id: hashId(`alerta-cuidador-${a.id}`),
              title: "Alerta del círculo de cuidado",
              body: a.message,
              schedule: { at: new Date(Date.now() + 1200 + i * 500) },
              extra: { alertId: a.id, ownerId: a.owner_id },
            })) });
          }
          pendientes.forEach((a) => idsNotificados.add(a.id));
          await Preferences.set({ key: "plan-salud:alertas-notificadas", value: JSON.stringify([...idsNotificados].slice(-500)) });
        }
      }
    } catch (e) {
      console.error("No se pudieron cargar las alertas de cuidado", e);
    } finally {
      setCargandoAlertas(false);
    }
  }

  async function evaluarDosisPendientes() {
    if (!sesion?.user?.id || !datos?.medicamentos?.length || !supabaseConfigurado) return;
    const ahora = new Date();
    const hoy = fechaLocalClave(ahora);
    for (const med of datos.medicamentos) {
      for (const momentoId of med.momentos || []) {
        const programada = fechaProgramadaPara(momentoId, ahora);
        const vencimiento = new Date(programada.getTime() + minutosAvisoCuidador * 60 * 1000);
        if (ahora < vencimiento) continue;
        const yaRegistrada = historial.some((r) => r.fecha === hoy && r.medicamentoId === med.id && r.momentoId === momentoId);
        if (yaRegistrada) continue;
        try {
          await crearAlertaDosisPendiente({
            medicationId: med.id, medicationName: med.nombre, dose: med.dosis || "",
            momentId: momentoId, momentName: MOMENTOS.find((m) => m.id === momentoId)?.label || momentoId,
            scheduledAt: programada.toISOString(), localDate: hoy, alertType: "missed",
          });
        } catch (e) { console.error("No se pudo crear alerta pendiente", e); }
      }
    }
  }

  async function cambiarDemoraCuidador(valor) {
    const minutos = Number(valor) || 30;
    setMinutosAvisoCuidador(minutos);
    await Preferences.set({ key: "plan-salud:demora-cuidador", value: String(minutos) });
  }

  async function registrarDosis(medicamento, estado) {
    const ahora = new Date();
    const momentoId = momentoCercano();
    const registro = {
      id: `registro-${Date.now()}`,
      medicamentoId: medicamento.id,
      medicamento: medicamento.nombre,
      dosis: medicamento.dosis || "",
      momentoId,
      momento: MOMENTOS.find((m) => m.id === momentoId)?.label || momentoId,
      estado,
      fecha: fechaLocalClave(ahora),
      fechaHora: ahora.toISOString(),
      fechaProgramada: fechaProgramadaPara(momentoId, ahora).toISOString(),
    };

    await guardarHistorial([registro, ...historial].slice(0, 500));
    if (sesion?.user?.id && supabaseConfigurado) {
      try {
        if (estado === "tomado") {
          await resolverAlertasDosis({ medicationId: medicamento.id, momentId, localDate: registro.fecha });
        } else {
          await crearAlertaDosisPendiente({
            medicationId: medicamento.id, medicationName: medicamento.nombre, dose: medicamento.dosis || "",
            momentId, momentName: registro.momento, scheduledAt: registro.fechaProgramada,
            localDate: registro.fecha, alertType: "omitted",
          });
        }
      } catch (e) { console.error("No se pudo actualizar la alerta del cuidador", e); }
    }
    setAvisoAlarmas({
      tipo: "ok",
      texto:
        estado === "tomado"
          ? `${medicamento.nombre} registrado como tomado.`
          : `${medicamento.nombre} registrado como omitido.`,
    });
  }

  async function borrarHistorialHoy() {
    const hoy = fechaLocalClave();
    await guardarHistorial(historial.filter((r) => r.fecha !== hoy));
  }

  async function autenticar(evento) {
    evento.preventDefault();

    if (!supabaseConfigurado) {
      setEstadoNube("Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.");
      return;
    }

    if (!correo.trim() || clave.length < 6) {
      setEstadoNube("Ingresa un correo válido y una contraseña de al menos 6 caracteres.");
      return;
    }

    setAuthCargando(true);
    setEstadoNube("");

    try {
      const resultado = modoRegistro
        ? await supabase.auth.signUp({ email: correo.trim(), password: clave })
        : await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });

      if (resultado.error) throw resultado.error;

      setEstadoNube(
        modoRegistro
          ? "Cuenta creada. Revisa tu correo si Supabase solicita confirmación."
          : "Sesión iniciada correctamente.",
      );
      setClave("");
    } catch (e) {
      setEstadoNube(e.message || "No se pudo completar el acceso.");
    } finally {
      setAuthCargando(false);
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    setEstadoNube("Sesión cerrada.");
  }

  async function sincronizarNube() {
    if (!sesion?.user?.id || !supabaseConfigurado) return;

    setSincronizando(true);
    setEstadoNube("Sincronizando...");

    try {
      const remoto = await cargarDatosNube(sesion.user.id);

      const planFinal = remoto.plan || datos || { medicamentos: [], citas: [] };
      const historialRemoto = remoto.historial || [];
      const recetasRemotas = remoto.recetas || [];
      const mapa = new Map();

      [...historialRemoto, ...historial].forEach((registro) => {
        mapa.set(registro.id, registro);
      });

      const historialFinal = [...mapa.values()].sort(
        (a, b) => new Date(b.fechaHora) - new Date(a.fechaHora),
      );

      const mapaRecetas = new Map();
      [...recetasRemotas, ...historialRecetas].forEach((receta) => {
        mapaRecetas.set(receta.id, receta);
      });
      const recetasFinales = [...mapaRecetas.values()].sort(
        (a, b) => new Date(b.leidaEn) - new Date(a.leidaEn),
      );

      await Preferences.set({
        key: "plan-salud:datos",
        value: JSON.stringify(planFinal),
      });
      await Preferences.set({
        key: "plan-salud:historial",
        value: JSON.stringify(historialFinal),
      });
      await Preferences.set({
        key: "plan-salud:recetas",
        value: JSON.stringify(recetasFinales),
      });

      setDatos(planFinal);
      setHistorial(historialFinal);
      setHistorialRecetas(recetasFinales);

      await guardarDatosNube(sesion.user.id, planFinal);
      await guardarHistorialNube(sesion.user.id, historialFinal);
      await Promise.all(
        recetasFinales.map((receta) => guardarRecetaNube(sesion.user.id, receta)),
      );

      setEstadoNube("Sincronización automática al día.");
    } catch (e) {
      console.error(e);
      setEstadoNube(e.message || "No se pudo sincronizar con la nube.");
    } finally {
      setSincronizando(false);
    }
  }

  // Sincronización automática: descarga al iniciar sesión y al volver
  // a tener conexión o regresar a la aplicación. Los cambios locales ya se
  // suben automáticamente desde guardar() y guardarHistorial().
  useEffect(() => {
    if (!sesion?.user?.id || !supabaseConfigurado) return undefined;

    const temporizador = window.setTimeout(() => {
      sincronizarNube();
    }, 700);

    return () => window.clearTimeout(temporizador);
  }, [sesion?.user?.id]);

  useEffect(() => {
    if (!sesion?.user?.id || !supabaseConfigurado) return undefined;

    const sincronizarSiCorresponde = () => {
      if (navigator.onLine) sincronizarNube();
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") sincronizarSiCorresponde();
    };

    window.addEventListener("online", sincronizarSiCorresponde);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    return () => {
      window.removeEventListener("online", sincronizarSiCorresponde);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [sesion?.user?.id, datos, historial, historialRecetas]);

  async function analizarInteracciones() {
    const medicamentos = (datos?.medicamentos || []).map((m) => ({
      nombre: m.nombre,
      dosis: m.dosis || "",
      indicaciones: m.indicaciones || "",
    }));

    if (medicamentos.length < 2) {
      setResultadoInteracciones({
        nivel_general: "sin_datos",
        resumen: "Agrega al menos dos medicamentos para realizar la comparación.",
        interacciones: [],
        duplicidades: [],
        advertencias: [],
      });
      return;
    }

    setAnalizandoInteracciones(true);
    try {
      const response = await fetch(INTERACCIONES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicamentos }),
      });
      const contenido = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(contenido.error || `Error ${response.status}`);
      setResultadoInteracciones(contenido);
    } catch (e) {
      setResultadoInteracciones({
        nivel_general: "error",
        resumen: e.message || "No se pudo analizar las interacciones.",
        interacciones: [],
        duplicidades: [],
        advertencias: [],
      });
    } finally {
      setAnalizandoInteracciones(false);
    }
  }

  async function actualizarCirculoCuidado() {
    if (!sesion?.user?.id || !supabaseConfigurado) return;
    setCargandoFamilia(true);
    try {
      const circulo = await cargarCirculoCuidado();
      setCirculoCuidado(circulo);
    } catch (e) {
      setMensajeFamilia(e.message || "No se pudo cargar el círculo de cuidado.");
    } finally {
      setCargandoFamilia(false);
    }
  }

  async function generarInvitacionCuidador() {
    if (!sesion?.user?.id) return;
    setCargandoFamilia(true);
    setMensajeFamilia("");
    try {
      const codigo = await crearInvitacionCuidador(relacionCuidador);
      setCodigoInvitacion(codigo);
      setMensajeFamilia("Código creado. Compártelo únicamente con la persona de confianza.");
      await actualizarCirculoCuidado();
    } catch (e) {
      setMensajeFamilia(e.message || "No se pudo crear la invitación.");
    } finally {
      setCargandoFamilia(false);
    }
  }

  async function aceptarCodigoCuidador() {
    const codigo = codigoParaAceptar.trim().toUpperCase();
    if (!codigo) return;
    setCargandoFamilia(true);
    setMensajeFamilia("");
    try {
      await aceptarInvitacionCuidador(codigo);
      setCodigoParaAceptar("");
      setMensajeFamilia("Vínculo aceptado. Ya puedes consultar el plan compartido.");
      await actualizarCirculoCuidado();
    } catch (e) {
      setMensajeFamilia(e.message || "No se pudo aceptar el código.");
    } finally {
      setCargandoFamilia(false);
    }
  }

  async function verPacienteCompartido(ownerId, ownerEmail, silencioso = false) {
    if (!silencioso) setCargandoFamilia(true);
    try {
      const contenido = await cargarPacienteCompartido(ownerId);
      setPacienteCompartido({ ...contenido, ownerId, ownerEmail });
      setActualizadoCuidadorEn(new Date());
      if (!silencioso) setMensajeFamilia("Panel del cuidador actualizado.");
    } catch (e) {
      if (!silencioso) setMensajeFamilia(e.message || "No se pudo abrir el plan compartido.");
    } finally {
      if (!silencioso) setCargandoFamilia(false);
    }
  }

  async function eliminarVinculoCuidador(linkId) {
    if (!window.confirm("¿Deseas revocar este acceso compartido?")) return;
    try {
      await revocarVinculoCuidador(linkId);
      setPacienteCompartido(null);
      await actualizarCirculoCuidado();
    } catch (e) {
      setMensajeFamilia(e.message || "No se pudo revocar el acceso.");
    }
  }

  async function compartirCodigo() {
    if (!codigoInvitacion) return;

    const texto =
      `Te invito a acompañar mi tratamiento en Mi pastillero semanal.\n\n` +
      `Código de invitación: ${codigoInvitacion}\n\n` +
      `Instala la aplicación, crea tu cuenta y entra en Familia → Aceptar una invitación.`;

    try {
      setMensajeFamilia("");
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: "Invitación a mi círculo de cuidado",
          text: texto,
          dialogTitle: "Compartir código de invitación",
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "Invitación a mi círculo de cuidado", text: texto });
        return;
      }
      await navigator.clipboard.writeText(texto);
      setMensajeFamilia("Invitación copiada al portapapeles.");
    } catch (e) {
      if (e?.name !== "AbortError") setMensajeFamilia("No se pudo compartir el código.");
    }
  }

  useEffect(() => {
    if (sesion?.user?.id && vista === "familia") actualizarCirculoCuidado();
  }, [sesion?.user?.id, vista]);

  useEffect(() => {
    if (!sesion?.user?.id) return undefined;
    actualizarAlertasCuidado({ notificar: true });
    evaluarDosisPendientes();
    const id = window.setInterval(() => {
      actualizarAlertasCuidado({ notificar: true });
      evaluarDosisPendientes();
    }, 60000);
    return () => window.clearInterval(id);
  }, [sesion?.user?.id, datos, historial, minutosAvisoCuidador]);

  useEffect(() => {
    if (vista !== "familia" || !pacienteCompartido?.ownerId) return undefined;
    const id = window.setInterval(() => {
      verPacienteCompartido(
        pacienteCompartido.ownerId,
        pacienteCompartido.ownerEmail,
        true,
      );
    }, 30000);
    return () => window.clearInterval(id);
  }, [vista, pacienteCompartido?.ownerId]);

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

      // En Android se crea un canal con sonido y prioridad alta.
      await LocalNotifications.createChannel({
        id: "recordatorios-medicamentos",
        name: "Recordatorios de medicamentos",
        description: "Avisos para tomar los medicamentos programados",
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: "default",
      });

      // Esta notificación permite comprobar el funcionamiento sin esperar
      // hasta las 08:00, 14:00 o 20:00.
      const notificacionPrueba = {
        id: 2147483000,
        title: "Prueba de Mi Plan de Salud",
        body: "Si recibes este mensaje, las alarmas locales funcionan correctamente.",
        channelId: "recordatorios-medicamentos",
        schedule: {
          at: new Date(Date.now() + 10000),
          allowWhileIdle: true,
        },
        sound: "default",
        extra: {
          tipo: "prueba",
        },
      };

      const notificacionesConCanal = notificaciones.map((notificacion) => ({
        ...notificacion,
        channelId: "recordatorios-medicamentos",
        sound: "default",
      }));

      await LocalNotifications.schedule({
        notifications: [notificacionPrueba, ...notificacionesConCanal],
      });

      await Preferences.set({
        key: "plan-salud:notificaciones",
        value: JSON.stringify([
          notificacionPrueba.id,
          ...notificacionesConCanal.map((n) => n.id),
        ]),
      });

      setAvisoAlarmas({
        tipo: "ok",
        texto:
          `${notificacionesConCanal.length} alarmas programadas. ` +
          "Recibirás una notificación de prueba en 10 segundos.",
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

  const hoy = fechaLocalClave();
  const historialHoy = historial.filter((registro) => registro.fecha === hoy);
  const recetasFiltradas = historialRecetas.filter((receta) => {
    const texto = `${receta.nombreArchivo || ""} ${receta.medico || ""} ${receta.paciente || ""} ${(receta.datos?.medicamentos || []).map((m) => m.nombre).join(" ")}`.toLowerCase();
    const coincideTexto = texto.includes(busquedaRecetas.trim().toLowerCase());
    const fechaLectura = receta.leidaEn ? fechaLocalClave(new Date(receta.leidaEn)) : "";
    const coincideFecha = !fechaFiltroRecetas || fechaLectura === fechaFiltroRecetas;
    return coincideTexto && coincideFecha;
  });
  const tomadasHoy = historialHoy.filter((registro) => registro.estado === "tomado").length;
  const omitidasHoy = historialHoy.filter((registro) => registro.estado === "omitido").length;
  const totalRegistradas = historial.length;
  const totalTomadas = historial.filter((registro) => registro.estado === "tomado").length;
  const totalOmitidas = historial.filter((registro) => registro.estado === "omitido").length;
  const cumplimiento = totalRegistradas
    ? Math.round((totalTomadas / totalRegistradas) * 100)
    : 0;
  const desdeHace7Dias = new Date();
  desdeHace7Dias.setDate(desdeHace7Dias.getDate() - 6);
  desdeHace7Dias.setHours(0, 0, 0, 0);
  const historial7Dias = historial.filter(
    (registro) => new Date(registro.fechaHora) >= desdeHace7Dias,
  );
  const tomadas7Dias = historial7Dias.filter((registro) => registro.estado === "tomado").length;
  const cumplimiento7Dias = historial7Dias.length
    ? Math.round((tomadas7Dias / historial7Dias.length) * 100)
    : 0;

  const metaSemanal = 90;
  const omitidas7Dias = historial7Dias.filter((registro) => registro.estado === "omitido").length;
  const diasConRegistro7 = new Set(historial7Dias.map((registro) => registro.fecha)).size;
  const medicamentosActivos = datos?.medicamentos?.length || 0;

  const resumenPorDia = historial.reduce((acumulado, registro) => {
    const clave = registro.fecha || fechaLocalClave(new Date(registro.fechaHora));
    if (!acumulado[clave]) acumulado[clave] = { tomadas: 0, omitidas: 0 };
    if (registro.estado === "tomado") acumulado[clave].tomadas += 1;
    if (registro.estado === "omitido") acumulado[clave].omitidas += 1;
    return acumulado;
  }, {});

  function sumarDias(fecha, cantidad) {
    const copia = new Date(fecha);
    copia.setDate(copia.getDate() + cantidad);
    return copia;
  }

  function calcularRachaActual() {
    let racha = 0;
    let cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    const claveHoy = fechaLocalClave(cursor);
    if (!resumenPorDia[claveHoy]) cursor = sumarDias(cursor, -1);
    for (let i = 0; i < 3650; i += 1) {
      const clave = fechaLocalClave(cursor);
      const dia = resumenPorDia[clave];
      if (!dia || dia.tomadas === 0 || dia.omitidas > 0) break;
      racha += 1;
      cursor = sumarDias(cursor, -1);
    }
    return racha;
  }

  function calcularMejorRacha() {
    const diasValidos = Object.entries(resumenPorDia)
      .filter(([, valor]) => valor.tomadas > 0 && valor.omitidas === 0)
      .map(([fecha]) => fecha)
      .sort();
    let mejor = 0;
    let actual = 0;
    let anterior = null;
    diasValidos.forEach((fecha) => {
      const actualFecha = new Date(`${fecha}T12:00:00`);
      if (anterior) {
        const diferencia = Math.round((actualFecha - anterior) / 86400000);
        actual = diferencia === 1 ? actual + 1 : 1;
      } else actual = 1;
      mejor = Math.max(mejor, actual);
      anterior = actualFecha;
    });
    return mejor;
  }

  const rachaActual = calcularRachaActual();
  const mejorRacha = calcularMejorRacha();
  const nivelAdherencia = cumplimiento7Dias >= 90
    ? { etiqueta: "Excelente", color: "#2F7D4A", fondo: "#E8F5EC", mensaje: "¡Excelente adherencia esta semana!" }
    : cumplimiento7Dias >= 70
      ? { etiqueta: "Bueno", color: "#B7791F", fondo: "#FFF4D8", mensaje: "Vas bien; estás cerca de tu meta." }
      : cumplimiento7Dias >= 50
        ? { etiqueta: "Regular", color: "#C56A1A", fondo: "#FFF0E0", mensaje: "Aún puedes recuperar el ritmo esta semana." }
        : { etiqueta: "Riesgo", color: "#B93838", fondo: "#FDE8E8", mensaje: "Revisa las dosis pendientes y tu horario." };

  const logros = [
    { titulo: "Primera semana", detalle: "7 días", conseguido: mejorRacha >= 7, icono: "📅" },
    { titulo: "30 dosis seguidas", detalle: "Constancia", conseguido: totalTomadas >= 30, icono: "💊" },
    { titulo: "Un mes sin olvidos", detalle: "30 días", conseguido: mejorRacha >= 30, icono: "🏅" },
    { titulo: "Excelente adherencia", detalle: "+90%", conseguido: cumplimiento7Dias >= 90, icono: "❤️" },
    { titulo: "Cuidado compartido", detalle: "En familia", conseguido: circuloCuidado.length > 0, icono: "👨‍👩‍👧" },
  ];

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
        @keyframes crecerBarra { from { width: 0; } }
        @keyframes aparecerDetalles { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
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
          flexWrap: "wrap",
        }}
      >
        {["subir", "horario", "recetas", "familia"].map((v) => (
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
            {v === "subir" ? "Nueva receta" : v === "horario" ? "Mi horario" : v === "recetas" ? "Historial" : "Familia"}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: 20 }}>
        <section
          style={{
            background: "#FFFDF8",
            border: "1px solid #E5DFC9",
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#1E3F35" }}>
            <Cloud size={18} /> Base de datos en la nube
          </div>

          {!supabaseConfigurado ? (
            <div style={{ marginTop: 8, fontSize: 12.5, color: "#9C4A2E", lineHeight: 1.5 }}>
              Falta configurar Supabase en el archivo <strong>.env</strong>.
            </div>
          ) : sesion ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#5B6B60" }}>
                <User size={15} /> {sesion.user.email}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <button
                  onClick={sincronizarNube}
                  disabled={sincronizando}
                  style={{ padding: 10, borderRadius: 9, border: "none", background: "#1E3F35", color: "white", fontWeight: 700 }}
                >
                  <RefreshCw size={14} style={{ marginRight: 5, verticalAlign: "middle" }} />
                  {sincronizando ? "Sincronizando" : "Sincronizar"}
                </button>
                <button
                  onClick={cerrarSesion}
                  style={{ padding: 10, borderRadius: 9, border: "1px solid #B87333", background: "transparent", color: "#8A5A3B", fontWeight: 700 }}
                >
                  <LogOut size={14} style={{ marginRight: 5, verticalAlign: "middle" }} /> Salir
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={autenticar} style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="Correo electrónico"
                autoComplete="email"
                style={{ padding: 10, borderRadius: 9, border: "1px solid #D8D2BC" }}
              />
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Contraseña (mínimo 6 caracteres)"
                autoComplete={modoRegistro ? "new-password" : "current-password"}
                style={{ padding: 10, borderRadius: 9, border: "1px solid #D8D2BC" }}
              />
              <button
                type="submit"
                disabled={authCargando}
                style={{ padding: 10, borderRadius: 9, border: "none", background: "#1E3F35", color: "white", fontWeight: 700 }}
              >
                <LogIn size={14} style={{ marginRight: 5, verticalAlign: "middle" }} />
                {authCargando ? "Procesando..." : modoRegistro ? "Crear cuenta" : "Iniciar sesión"}
              </button>
              <button
                type="button"
                onClick={() => setModoRegistro((valor) => !valor)}
                style={{ border: "none", background: "transparent", color: "#8A5A3B", fontSize: 12, fontWeight: 600 }}
              >
                {modoRegistro ? "Ya tengo una cuenta" : "Crear una cuenta nueva"}
              </button>
            </form>
          )}

          {estadoNube && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#5B6B60", lineHeight: 1.4 }}>
              {estadoNube}
            </div>
          )}
        </section>

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
              Subí una foto o un PDF claro de la receta. La transcribo y armo
              el pastillero con los horarios sugeridos — después podés ajustar
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
              ) : archivoSeleccionado?.esPdf ? (
                <div style={{ marginBottom: 12 }}>
                  <FileText size={44} color="#B87333" />
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6B7A70" }}>
                    {archivoSeleccionado.nombre}
                  </div>
                </div>
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
                {cargando ? "Leyendo la receta..." : "Tocá para subir una foto o PDF"}
              </div>
              <div style={{ fontSize: 12, color: "#8A9A90", marginTop: 4 }}>
                JPG, PNG, WEBP o PDF · máximo 15 MB
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
              accept="image/*,application/pdf,.pdf"
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


        {vista === "recetas" && (
          <section>
            <div
              style={{
                background: "#FFFDF8",
                border: "1px solid #E5DFC9",
                borderRadius: 14,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#1E3F35" }}>
                <History size={18} /> Historial de recetas
              </div>
              <div style={{ fontSize: 12.5, color: "#6B7A70", marginTop: 5 }}>
                {historialRecetas.length} receta{historialRecetas.length === 1 ? "" : "s"} guardada{historialRecetas.length === 1 ? "" : "s"} localmente y en la nube.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 8, marginTop: 12 }}>
                <div style={{ position: "relative" }}>
                  <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: "#7B8B81" }} />
                  <input
                    value={busquedaRecetas}
                    onChange={(e) => setBusquedaRecetas(e.target.value)}
                    placeholder="Buscar medicamento, médico o archivo"
                    style={{ width: "100%", padding: "10px 10px 10px 32px", borderRadius: 9, border: "1px solid #D8D2BC" }}
                  />
                </div>
                <input
                  type="date"
                  value={fechaFiltroRecetas}
                  onChange={(e) => setFechaFiltroRecetas(e.target.value)}
                  style={{ padding: 10, borderRadius: 9, border: "1px solid #D8D2BC" }}
                />
              </div>
              {(busquedaRecetas || fechaFiltroRecetas) && (
                <button
                  onClick={() => { setBusquedaRecetas(""); setFechaFiltroRecetas(""); }}
                  style={{ marginTop: 8, border: "none", background: "transparent", color: "#8A5A3B", fontWeight: 600, fontSize: 12 }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {recetasFiltradas.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "#7B8B81" }}>
                <FileText size={28} style={{ marginBottom: 8 }} />
                <div>No se encontraron recetas.</div>
              </div>
            ) : (
              recetasFiltradas.map((receta) => {
                const abierta = recetaExpandida === receta.id;
                const medicamentosReceta = receta.datos?.medicamentos || [];
                return (
                  <article
                    key={receta.id}
                    style={{ background: "#FFFDF8", border: "1px solid #E5DFC9", borderRadius: 13, padding: 14, marginBottom: 10 }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <FileText size={20} color="#B87333" style={{ marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#1E3F35", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {receta.nombreArchivo || "Receta médica"}
                        </div>
                        <div style={{ color: "#6B7A70", fontSize: 12, marginTop: 3 }}>
                          {new Date(receta.leidaEn).toLocaleString()} · {medicamentosReceta.length} medicamento{medicamentosReceta.length === 1 ? "" : "s"}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          <span style={{ fontSize: 11, padding: "4px 7px", borderRadius: 20, background: receta.requiereRevision ? "#FCEEE8" : "#E5F2EA", color: receta.requiereRevision ? "#9C4A2E" : "#245A43" }}>
                            {receta.requiereRevision ? "Requiere revisión" : "Lectura verificada"}
                          </span>
                          {Number.isFinite(Number(receta.confianza)) && (
                            <span style={{ fontSize: 11, padding: "4px 7px", borderRadius: 20, background: "#F1EEE4", color: "#5B6B60" }}>
                              Confianza: {Math.round(Number(receta.confianza))}%
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => eliminarRecetaHistorial(receta.id)} aria-label="Eliminar receta" style={{ border: "none", background: "transparent", color: "#B87333", padding: 4 }}>
                        <Trash2 size={17} />
                      </button>
                    </div>

                    <button
                      onClick={() => setRecetaExpandida(abierta ? null : receta.id)}
                      style={{ width: "100%", marginTop: 10, padding: 8, borderRadius: 8, border: "1px solid #D8D2BC", background: "transparent", color: "#1E3F35", fontWeight: 600 }}
                    >
                      {abierta ? "Ocultar detalles" : "Ver detalles"}
                    </button>

                    {abierta && (
                      <div style={{ marginTop: 12, borderTop: "1px solid #E5DFC9", paddingTop: 12, fontSize: 12.5, color: "#45574D" }}>
                        <div><strong>Médico:</strong> {receta.medico || "No identificado"}</div>
                        <div style={{ marginTop: 4 }}><strong>Paciente:</strong> {receta.paciente || "No identificado"}</div>
                        <div style={{ marginTop: 4 }}><strong>Fecha de receta:</strong> {receta.fechaReceta || "No identificada"}</div>
                        {receta.advertencias?.length > 0 && (
                          <div style={{ marginTop: 10, padding: 9, borderRadius: 8, background: "#FCEEE8", color: "#8D422C" }}>
                            <strong>Datos por revisar:</strong>
                            <ul style={{ margin: "5px 0 0", paddingLeft: 18 }}>
                              {receta.advertencias.map((aviso, i) => <li key={`${receta.id}-aviso-${i}`}>{aviso}</li>)}
                            </ul>
                          </div>
                        )}
                        <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
                          {medicamentosReceta.map((med, i) => (
                            <div key={`${receta.id}-med-${i}`} style={{ padding: 9, borderRadius: 8, background: "#F6F3EA" }}>
                              <strong>{med.nombre || "Medicamento"}</strong>
                              <div>{[med.dosis, med.frecuencia_literal, med.indicaciones].filter(Boolean).join(" · ") || "Sin indicaciones legibles"}</div>
                              {Number.isFinite(Number(med.confianza)) && <div style={{ marginTop: 3, color: "#718077" }}>Confianza: {Math.round(Number(med.confianza))}%</div>}
                            </div>
                          ))}
                        </div>
                        {receta.datos?.transcripcion_literal && (
                          <details style={{ marginTop: 10 }}>
                            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Transcripción literal</summary>
                            <div style={{ whiteSpace: "pre-wrap", marginTop: 7, padding: 9, background: "#F6F3EA", borderRadius: 8 }}>
                              {receta.datos.transcripcion_literal}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        )}


        {vista === "familia" && (
          <section>
            {!sesion ? (
              <div style={{ padding: 24, borderRadius: 14, background: "#FFFDF8", border: "1px solid #E5DFC9", color: "#5B6B60" }}>
                Inicia sesión para compartir el seguimiento con un familiar o cuidador.
              </div>
            ) : (
              <>
                <div style={{ background: "#FFFDF8", border: "1px solid #E5DFC9", borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#1E3F35", fontWeight: 700 }}>
                    <Users size={19} /> Círculo de cuidado
                  </div>
                  <p style={{ color: "#65756B", fontSize: 12.5, lineHeight: 1.5 }}>
                    Un cuidador autorizado podrá consultar medicamentos, historial de dosis y recetas. No podrá editar tu tratamiento.
                  </p>
                  <label style={{ fontSize: 12, color: "#5B6B60" }}>Relación</label>
                  <input value={relacionCuidador} onChange={(e) => setRelacionCuidador(e.target.value)} placeholder="Ej.: Hija, esposo, cuidador" style={{ width: "100%", padding: 10, borderRadius: 9, border: "1px solid #D8D2BC", margin: "5px 0 9px" }} />
                  <button onClick={generarInvitacionCuidador} disabled={cargandoFamilia} style={{ width: "100%", padding: 11, border: "none", borderRadius: 9, background: "#1E3F35", color: "white", fontWeight: 700 }}>
                    <UserPlus size={16} style={{ verticalAlign: "middle", marginRight: 6 }} /> Crear código de invitación
                  </button>
                  {codigoInvitacion && (
                    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "#E8F2ED", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#5B6B60" }}>Código temporal</div>
                      <div style={{ fontFamily: "monospace", fontSize: 26, letterSpacing: 4, fontWeight: 800, color: "#1E3F35", margin: "4px 0 8px" }}>{codigoInvitacion}</div>
                      <button onClick={compartirCodigo} style={{ border: "1px solid #1E3F35", background: "transparent", borderRadius: 8, padding: "7px 12px", color: "#1E3F35", fontWeight: 700 }}>
                        <Share2 size={15} style={{ verticalAlign: "middle", marginRight: 5 }} /> Compartir
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ background: "#FFFDF8", border: "1px solid #E5DFC9", borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: "#1E3F35" }}>Aceptar una invitación</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                    <input value={codigoParaAceptar} onChange={(e) => setCodigoParaAceptar(e.target.value.toUpperCase())} maxLength={8} placeholder="CÓDIGO" style={{ flex: 1, padding: 10, borderRadius: 9, border: "1px solid #D8D2BC", textTransform: "uppercase", letterSpacing: 2 }} />
                    <button onClick={aceptarCodigoCuidador} disabled={cargandoFamilia} style={{ padding: "10px 14px", borderRadius: 9, border: "none", background: "#B87333", color: "white", fontWeight: 700 }}>Aceptar</button>
                  </div>
                </div>

                {mensajeFamilia && <div style={{ marginBottom: 12, padding: 10, borderRadius: 9, background: "#F6F3EA", color: "#5B6B60", fontSize: 12.5 }}>{mensajeFamilia}</div>}

                <div style={{ background: "#FFFDF8", border: "1px solid #E5DFC9", borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, color: "#1E3F35" }}><BellRing size={18} /> Centro de alertas</div>
                    <button onClick={() => actualizarAlertasCuidado({ notificar: false })} disabled={cargandoAlertas} style={{ border: "none", background: "#E8F2ED", color: "#1E3F35", borderRadius: 8, padding: 7 }}><RefreshCw size={16} /></button>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <label style={{ color: "#65756B", fontSize: 12 }}>Avisar al cuidador después de</label>
                    <select value={minutosAvisoCuidador} onChange={(e) => cambiarDemoraCuidador(e.target.value)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #D8D2BC", background: "white", color: "#1E3F35" }}>
                      <option value={10}>10 minutos</option><option value={30}>30 minutos</option><option value={60}>60 minutos</option>
                    </select>
                  </div>
                  {(() => {
                    const propias = alertasCuidado.filter((a) => a.caregiver_id === sesion.user.id);
                    const activas = propias.filter((a) => a.status === "active");
                    const visibles = mostrarHistorialAlertas ? propias : activas.slice(0, 4);
                    return <div style={{ marginTop: 11 }}>
                      {visibles.length === 0 ? <div style={{ padding: 10, borderRadius: 9, background: "#F4F6F1", color: "#718078", fontSize: 12 }}>No hay alertas pendientes.</div> : <div style={{ display: "grid", gap: 7 }}>{visibles.map((a) => <button key={a.id} onClick={async () => { if (!a.read_at) { await marcarAlertaCuidadoLeida(a.id); actualizarAlertasCuidado(); } }} style={{ textAlign: "left", border: "1px solid #E9D5CD", borderRadius: 9, padding: 9, background: a.status === "active" ? "#FFF0EB" : "#F5F5F1", color: "#5A4038" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 700, fontSize: 12 }}><AlertCircle size={15} /> {a.medication_name}</div>
                        <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.4 }}>{a.message}</div>
                        <div style={{ marginTop: 4, color: "#8B756C", fontSize: 10.5 }}>{new Date(a.created_at).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {a.status === "active" ? "Pendiente" : "Resuelta"}</div>
                      </button>)}</div>}
                      {propias.length > 4 && <button onClick={() => setMostrarHistorialAlertas((v) => !v)} style={{ marginTop: 8, width: "100%", border: "none", background: "transparent", color: "#B87333", fontWeight: 700 }}>{mostrarHistorialAlertas ? "Ocultar historial" : `Ver historial (${propias.length})`}</button>}
                    </div>;
                  })()}
                  <div style={{ marginTop: 9, color: "#7B8B81", fontSize: 10.5, lineHeight: 1.4 }}>Las alertas se revisan cada minuto mientras la aplicación está abierta. La notificación push con la aplicación completamente cerrada requerirá Firebase Cloud Messaging en la siguiente actualización técnica.</div>
                </div>

                <div style={{ background: "#FFFDF8", border: "1px solid #E5DFC9", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontWeight: 700, color: "#1E3F35", marginBottom: 8 }}>Personas vinculadas</div>
                  {circuloCuidado.length === 0 ? <div style={{ color: "#7B8B81", fontSize: 12.5 }}>Todavía no hay vínculos activos.</div> : circuloCuidado.map((vinculo) => (
                    <div key={vinculo.id} style={{ display: "flex", gap: 9, alignItems: "center", padding: "10px 0", borderTop: "1px solid #EEE8D8" }}>
                      <Users size={17} color="#B87333" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#1E3F35", fontSize: 12.5 }}>{vinculo.otro_email || "Usuario"}</div>
                        <div style={{ color: "#78877E", fontSize: 11.5 }}>{vinculo.rol === "cuidador" ? "Cuidas a esta persona" : "Puede consultar tu plan"} · {vinculo.relacion || "Familiar"} · {vinculo.estado}</div>
                      </div>
                      {vinculo.rol === "cuidador" && ["accepted", "aceptado"].includes(String(vinculo.estado || "").toLowerCase()) && (
                        <button
                          onClick={() => verPacienteCompartido(vinculo.owner_id, vinculo.otro_email)}
                          title="Ver panel del paciente"
                          aria-label="Ver panel del paciente"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            border: "1px solid #1E3F35",
                            background: "#E8F2ED",
                            color: "#1E3F35",
                            borderRadius: 8,
                            padding: "7px 9px",
                            fontWeight: 700,
                            fontSize: 11.5,
                          }}
                        >
                          <Eye size={17} /> Ver panel
                        </button>
                      )}
                      <button onClick={() => eliminarVinculoCuidador(vinculo.id)} style={{ border: "none", background: "transparent", color: "#9C4A2E" }}><Trash2 size={17} /></button>
                    </div>
                  ))}
                </div>

                {pacienteCompartido && (() => {
                  const registros = pacienteCompartido.historial || [];
                  const medicamentos = pacienteCompartido.plan?.medicamentos || [];
                  const recetas = pacienteCompartido.recetas || [];
                  const hace7Dias = Date.now() - 7 * 24 * 60 * 60 * 1000;
                  const ultimos7 = registros.filter((r) => new Date(r.fechaHora).getTime() >= hace7Dias);
                  const tomadas7 = ultimos7.filter((r) => r.estado === "tomado").length;
                  const omitidas7 = ultimos7.filter((r) => r.estado === "omitido").length;
                  const cumplimiento7 = ultimos7.length ? Math.round((tomadas7 / ultimos7.length) * 100) : 0;
                  const omisionesRecientes = registros.filter((r) => r.estado === "omitido").slice(0, 5);

                  return (
                    <div style={{ marginTop: 14, background: "#1E3F35", color: "#F1EEE4", borderRadius: 16, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div>
                          <strong>Panel de {pacienteCompartido.ownerEmail}</strong>
                          <div style={{ fontSize: 11.5, color: "#B8C9C0", marginTop: 2 }}>
                            Solo lectura · actualización automática cada 30 segundos
                          </div>
                          {actualizadoCuidadorEn && <div style={{ fontSize: 10.5, color: "#91B3A4", marginTop: 2 }}>Actualizado {actualizadoCuidadorEn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button onClick={() => verPacienteCompartido(pacienteCompartido.ownerId, pacienteCompartido.ownerEmail)} disabled={cargandoFamilia} title="Actualizar" style={{ border: "none", background: "rgba(255,255,255,.08)", borderRadius: 8, padding: 7, color: "white" }}><RefreshCw size={17} /></button>
                          <button onClick={() => setPacienteCompartido(null)} style={{ border: "none", background: "transparent", color: "white" }}><X size={18} /></button>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 13 }}>
                        {[
                          ["Cumplimiento 7 días", `${cumplimiento7}%`],
                          ["Medicamentos", medicamentos.length],
                          ["Dosis tomadas", tomadas7],
                          ["Dosis omitidas", omitidas7],
                        ].map(([label, value]) => <div key={label} style={{ background: "rgba(255,255,255,.08)", padding: 10, borderRadius: 10 }}><div style={{ fontSize: 10.5, color: "#AFC5BA" }}>{label}</div><div style={{ fontSize: 22, fontFamily: "'Fraunces', serif", marginTop: 2 }}>{value}</div></div>)}
                      </div>

                      {omisionesRecientes.length > 0 && <div style={{ marginTop: 12, padding: 11, borderRadius: 10, background: "#5B342C", border: "1px solid #9C604C" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}><AlertCircle size={17} /> Alertas recientes</div>
                        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                          {omisionesRecientes.map((h) => <div key={h.id} style={{ fontSize: 11.5 }}><strong>{h.medicamento}</strong> · {h.momento || "Horario"} · omitida {new Date(h.fechaHora).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>)}
                        </div>
                      </div>}

                      <div style={{ marginTop: 14, fontWeight: 700 }}>Medicamentos actuales</div>
                      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        {medicamentos.length === 0 ? <div style={{ fontSize: 12, color: "#B8C9C0" }}>No hay medicamentos registrados.</div> : medicamentos.map((m) => <div key={m.id} style={{ padding: 9, borderRadius: 9, background: "rgba(255,255,255,.08)" }}><strong>{m.nombre}</strong><div style={{ fontSize: 12, color: "#C8D6CF", marginTop: 2 }}>{[m.dosis, m.indicaciones].filter(Boolean).join(" · ") || "Sin indicaciones"}</div><div style={{ fontSize: 10.5, color: "#9EB5AA", marginTop: 3 }}>{(m.momentos || []).map((id) => MOMENTOS.find((x) => x.id === id)?.label).filter(Boolean).join(" · ") || "Sin horario"}</div></div>)}
                      </div>

                      <div style={{ marginTop: 14, fontWeight: 700 }}>Actividad reciente</div>
                      <div style={{ marginTop: 7, display: "grid", gap: 6 }}>
                        {registros.slice(0, 8).map((h) => <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, background: "rgba(255,255,255,.05)", borderRadius: 8, padding: 8 }}>{h.estado === "tomado" ? <CheckCircle2 size={15} color="#78C49A" /> : <CircleX size={15} color="#E59A7B" />}<span style={{ flex: 1 }}><strong>{h.medicamento}</strong> · {h.momento || "Horario"}</span><span style={{ color: "#AFC5BA", fontSize: 10.5 }}>{new Date(h.fechaHora).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div>)}
                        {registros.length === 0 && <div style={{ fontSize: 12, color: "#B8C9C0" }}>Todavía no hay dosis registradas.</div>}
                      </div>

                      <div style={{ marginTop: 14, fontWeight: 700 }}>Recetas compartidas</div>
                      <div style={{ marginTop: 7, display: "grid", gap: 6 }}>
                        {recetas.slice(0, 5).map((r) => <div key={r.id} style={{ padding: 9, borderRadius: 8, background: "rgba(255,255,255,.05)" }}><div style={{ display: "flex", gap: 7, alignItems: "center" }}><FileText size={15} /><strong style={{ fontSize: 11.5 }}>{r.nombreArchivo || "Receta"}</strong></div><div style={{ fontSize: 10.5, color: "#AFC5BA", marginTop: 3 }}>{r.fechaReceta || new Date(r.leidaEn).toLocaleDateString()} · Confianza {r.confianza ?? "—"}%{r.requiereRevision ? " · Requiere revisión" : ""}</div></div>)}
                        {recetas.length === 0 && <div style={{ fontSize: 12, color: "#B8C9C0" }}>No hay recetas compartidas.</div>}
                      </div>

                      <div style={{ marginTop: 13, padding: 9, background: "rgba(255,255,255,.06)", borderRadius: 9, color: "#B8C9C0", fontSize: 10.5, lineHeight: 1.45 }}>Este panel ayuda al seguimiento familiar. Ante omisiones repetidas o dudas sobre el tratamiento, comunícate con el paciente y consulta a un profesional de salud. No modifiques medicamentos desde esta vista.</div>
                    </div>
                  );
                })()}
              </>
            )}
          </section>
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

                <div style={{ background: "#FFF8EA", border: "1px solid #D7BE8A", borderRadius: 14, padding: 14, marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#1E3F35" }}><ShieldAlert size={18} color="#B87333" /> Detector de interacciones</div>
                  <p style={{ fontSize: 12.5, color: "#68776E", lineHeight: 1.45 }}>Compara los medicamentos del plan y señala posibles interacciones o duplicidades. Es una ayuda informativa y debe confirmarse con un médico o farmacéutico.</p>
                  <button onClick={analizarInteracciones} disabled={analizandoInteracciones} style={{ width: "100%", padding: 10, borderRadius: 9, border: "none", background: "#B87333", color: "white", fontWeight: 700 }}>{analizandoInteracciones ? "Analizando..." : "Analizar medicamentos"}</button>
                  {resultadoInteracciones && <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: resultadoInteracciones.nivel_general === "alto" ? "#FCE8E4" : resultadoInteracciones.nivel_general === "moderado" ? "#FFF0D9" : "#E7F2EC", color: "#44564C", fontSize: 12.5 }}>
                    <strong>{resultadoInteracciones.resumen}</strong>
                    {(resultadoInteracciones.interacciones || []).map((item, i) => <div key={`int-${i}`} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(0,0,0,.08)" }}><strong>{item.medicamentos?.join(" + ")}</strong> · {item.nivel}<div>{item.descripcion}</div><div style={{ marginTop: 3 }}><em>Acción:</em> {item.accion}</div></div>)}
                    {(resultadoInteracciones.duplicidades || []).map((item, i) => <div key={`dup-${i}`} style={{ marginTop: 8 }}><strong>Posible duplicidad:</strong> {item.descripcion}</div>)}
                    {(resultadoInteracciones.advertencias || []).map((a, i) => <div key={`adv-${i}`} style={{ marginTop: 6 }}>⚠️ {a}</div>)}
                  </div>}
                </div>

                <div style={{ background: "#FFFDF8", border: "1px solid #E5DFC9", borderRadius: 16, padding: 16, marginBottom: 18, boxShadow: "0 8px 24px rgba(30,63,53,.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, color: "#1E3F35", fontSize: 18 }}>
                        <BarChart3 size={20} color="#B87333" /> Cumplimiento semanal
                      </div>
                      <div style={{ fontSize: 12.5, color: "#68776E", marginTop: 4 }}>Tu progreso de los últimos 7 días</div>
                    </div>
                    <div style={{ background: nivelAdherencia.fondo, color: nivelAdherencia.color, borderRadius: 999, padding: "7px 10px", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>
                      {nivelAdherencia.etiqueta}
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <div style={{ height: 30, borderRadius: 999, background: "#E8E8E3", overflow: "hidden", position: "relative" }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, cumplimiento7Dias))}%`, height: "100%", borderRadius: 999, background: nivelAdherencia.color, animation: "crecerBarra .8s ease-out", transition: "width .45s ease", display: "flex", justifyContent: "flex-end", alignItems: "center", minWidth: cumplimiento7Dias > 0 ? 48 : 0, paddingRight: cumplimiento7Dias > 0 ? 10 : 0, color: "white", fontWeight: 800, fontSize: 14 }}>
                        {cumplimiento7Dias > 0 ? `${cumplimiento7Dias}%` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#7C8981", marginTop: 5 }}><span>0%</span><span>50%</span><span>100%</span></div>
                    <div style={{ marginTop: 10, background: nivelAdherencia.fondo, color: "#41554A", borderRadius: 10, padding: "9px 10px", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span>{nivelAdherencia.mensaje}</span><strong style={{ color: nivelAdherencia.color, whiteSpace: "nowrap" }}>Meta: {metaSemanal}%</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMostrarDetallesEstadisticas((valor) => !valor)}
                    aria-expanded={mostrarDetallesEstadisticas}
                    style={{
                      width: "100%",
                      marginTop: 13,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #C9D7D0",
                      background: mostrarDetallesEstadisticas ? "#1E3F35" : "#F4F8F6",
                      color: mostrarDetallesEstadisticas ? "#FFFFFF" : "#1E3F35",
                      fontWeight: 800,
                      fontSize: 12.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      cursor: "pointer",
                    }}
                  >
                    <span>{mostrarDetallesEstadisticas ? "Ocultar detalles" : "Ver detalles"}</span>
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        transform: mostrarDetallesEstadisticas ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform .25s ease",
                        fontSize: 15,
                      }}
                    >
                      ▾
                    </span>
                  </button>

                  {mostrarDetallesEstadisticas && (
                    <div style={{ animation: "aparecerDetalles .25s ease-out" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 9, marginTop: 14 }}>
                    {[
                      { etiqueta: "Dosis tomadas", valor: tomadas7Dias, sub: `${cumplimiento7Dias}%`, color: "#2F7D4A", fondo: "#EEF7F0", icono: <CheckCircle2 size={17} /> },
                      { etiqueta: "Dosis omitidas", valor: omitidas7Dias, sub: historial7Dias.length ? `${Math.round((omitidas7Dias / historial7Dias.length) * 100)}%` : "0%", color: "#B93838", fondo: "#FFF1F1", icono: <CircleX size={17} /> },
                      { etiqueta: "Medicamentos activos", valor: medicamentosActivos, sub: "tratamientos", color: "#2867A0", fondo: "#EEF5FB", icono: <Pill size={17} /> },
                      { etiqueta: "Días con registro", valor: `${diasConRegistro7}/7`, sub: "últimos 7 días", color: "#B7791F", fondo: "#FFF7E6", icono: <CalendarClock size={17} /> },
                    ].map((item) => (
                      <div key={item.etiqueta} style={{ background: item.fondo, borderRadius: 12, padding: 11, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: item.color, fontSize: 11.5, fontWeight: 700 }}>{item.icono}{item.etiqueta}</div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 27, color: "#1E3F35", lineHeight: 1.1, marginTop: 7 }}>{item.valor}</div>
                        <div style={{ color: item.color, fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 9, marginTop: 10 }}>
                    <div style={{ border: "1px solid #F0D4A2", background: "#FFF8E9", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#80531A", fontWeight: 800, fontSize: 12.5 }}><Flame size={18} /> Racha actual</div>
                      <div style={{ fontFamily: "'Fraunces', serif", color: "#1E3F35", fontSize: 27, marginTop: 6 }}>{rachaActual} <span style={{ fontFamily: "inherit", fontSize: 13 }}>días</span></div>
                    </div>
                    <div style={{ border: "1px solid #D8C9EF", background: "#F7F1FF", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#6944A0", fontWeight: 800, fontSize: 12.5 }}><Trophy size={18} /> Mejor racha</div>
                      <div style={{ fontFamily: "'Fraunces', serif", color: "#1E3F35", fontSize: 27, marginTop: 6 }}>{mejorRacha} <span style={{ fontFamily: "inherit", fontSize: 13 }}>días</span></div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#F6F4EC" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, color: "#1E3F35", fontSize: 12.5 }}><Target size={17} color={nivelAdherencia.color} /> Nivel de adherencia: <span style={{ color: nivelAdherencia.color }}>{nivelAdherencia.etiqueta}</span></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginTop: 9 }}>
                      {[{l:"Riesgo",c:"#B93838"},{l:"Regular",c:"#C56A1A"},{l:"Bueno",c:"#D7A522"},{l:"Excelente",c:"#2F7D4A"}].map((n) => <div key={n.l}><div style={{ height: 6, borderRadius: 999, background: n.c }} /><div style={{ fontSize: 9.5, textAlign: "center", color: "#64746B", marginTop: 4 }}>{n.l}</div></div>)}
                    </div>
                  </div>

                  <div style={{ marginTop: 13 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#1E3F35", fontWeight: 800, fontSize: 13 }}><Award size={17} color="#B87333" /> Logros</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 7, marginTop: 8 }}>
                      {logros.map((logro) => (
                        <div key={logro.titulo} style={{ padding: 9, borderRadius: 10, border: logro.conseguido ? "1px solid #CFE3D6" : "1px solid #E5E1D7", background: logro.conseguido ? "#EDF7F0" : "#F6F4EF", opacity: logro.conseguido ? 1 : .62 }}>
                          <div style={{ fontSize: 18 }}>{logro.icono}</div><div style={{ fontSize: 10.5, fontWeight: 800, color: "#1E3F35", marginTop: 3 }}>{logro.titulo}</div><div style={{ fontSize: 9.5, color: logro.conseguido ? "#2F7D4A" : "#7A8880", marginTop: 2 }}>{logro.conseguido ? "Conseguido" : logro.detalle}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    background: "#FFFDF8",
                    border: "1px solid #E5DFC9",
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 18,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, color: "#1E3F35" }}>
                        <History size={17} /> Historial de hoy
                      </div>
                      <div style={{ fontSize: 12.5, color: "#6B7A70", marginTop: 4 }}>
                        {tomadasHoy} tomadas · {omitidasHoy} omitidas
                      </div>
                    </div>
                    {historialHoy.length > 0 && (
                      <button onClick={borrarHistorialHoy} style={{ border: "none", background: "transparent", color: "#9C4A2E", fontSize: 11.5, fontWeight: 600 }}>
                        Limpiar hoy
                      </button>
                    )}
                  </div>

                  {historialHoy.length === 0 ? (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: "#8A9A90" }}>
                      Aún no registraste ninguna dosis hoy.
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
                      {historialHoy.slice(0, 8).map((registro) => (
                        <div key={registro.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                          {registro.estado === "tomado" ? (
                            <CheckCircle2 size={16} color="#276749" />
                          ) : (
                            <CircleX size={16} color="#9C4A2E" />
                          )}
                          <span style={{ flex: 1 }}>
                            <strong>{registro.medicamento}</strong> · {registro.momento}
                          </span>
                          <span style={{ color: "#8A9A90", fontSize: 11 }}>
                            {new Date(registro.fechaHora).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ))}
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

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 7,
                            marginTop: 10,
                          }}
                        >
                          <button
                            onClick={() => registrarDosis(m, "tomado")}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 5,
                              padding: "8px 7px",
                              borderRadius: 9,
                              border: "none",
                              background: "#276749",
                              color: "white",
                              fontSize: 11.5,
                              fontWeight: 700,
                            }}
                          >
                            <CheckCircle2 size={14} /> Tomado
                          </button>
                          <button
                            onClick={() => registrarDosis(m, "omitido")}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 5,
                              padding: "8px 7px",
                              borderRadius: 9,
                              border: "1px solid #C4915C",
                              background: "transparent",
                              color: "#9C4A2E",
                              fontSize: 11.5,
                              fontWeight: 700,
                            }}
                          >
                            <CircleX size={14} /> Omitir
                          </button>
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
