import { supabase, supabaseConfigurado } from "./supabaseClient";

function verificarCliente() {
  if (!supabaseConfigurado || !supabase) {
    throw new Error("Supabase todavía no está configurado.");
  }
}

export async function guardarDatosNube(userId, plan) {
  verificarCliente();
  const { error } = await supabase.from("app_state").upsert(
    {
      user_id: userId,
      plan_data: plan || {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function guardarHistorialNube(userId, historial) {
  verificarCliente();
  if (!Array.isArray(historial) || historial.length === 0) return;

  const registros = historial.map((registro) => ({
    id: registro.id,
    user_id: userId,
    medication_id: registro.medicamentoId || null,
    medication_name: registro.medicamento || "Medicamento",
    dose: registro.dosis || "",
    moment_id: registro.momentoId || null,
    moment_name: registro.momento || null,
    status: registro.estado,
    scheduled_at: registro.fechaProgramada || null,
    registered_at: registro.fechaHora || new Date().toISOString(),
    local_date: registro.fecha,
  }));

  const { error } = await supabase
    .from("dose_history")
    .upsert(registros, { onConflict: "id" });
  if (error) throw error;
}

export async function guardarRecetaNube(userId, receta) {
  verificarCliente();
  if (!receta?.id) throw new Error("La receta no tiene identificador.");

  const { error } = await supabase.from("recipe_history").upsert(
    {
      id: receta.id,
      user_id: userId,
      file_name: receta.nombreArchivo || "receta",
      file_type: receta.tipoArchivo || null,
      doctor_name: receta.medico || null,
      patient_name: receta.paciente || null,
      prescription_date: receta.fechaReceta || null,
      read_at: receta.leidaEn || new Date().toISOString(),
      confidence: Number.isFinite(Number(receta.confianza))
        ? Number(receta.confianza)
        : null,
      needs_review: Boolean(receta.requiereRevision),
      warnings: Array.isArray(receta.advertencias) ? receta.advertencias : [],
      extracted_data: receta.datos || {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function eliminarRecetaNube(userId, recetaId) {
  verificarCliente();
  const { error } = await supabase
    .from("recipe_history")
    .delete()
    .eq("user_id", userId)
    .eq("id", recetaId);
  if (error) throw error;
}

export async function cargarRecetasNube(userId) {
  verificarCliente();
  const { data, error } = await supabase
    .from("recipe_history")
    .select(
      "id, file_name, file_type, doctor_name, patient_name, prescription_date, read_at, confidence, needs_review, warnings, extracted_data",
    )
    .eq("user_id", userId)
    .order("read_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    nombreArchivo: r.file_name,
    tipoArchivo: r.file_type,
    medico: r.doctor_name,
    paciente: r.patient_name,
    fechaReceta: r.prescription_date,
    leidaEn: r.read_at,
    confianza: r.confidence,
    requiereRevision: r.needs_review,
    advertencias: r.warnings || [],
    datos: r.extracted_data || {},
  }));
}

export async function cargarDatosNube(userId) {
  verificarCliente();

  const [estadoResultado, historialResultado, recetasResultado] = await Promise.all([
    supabase
      .from("app_state")
      .select("plan_data")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("dose_history")
      .select(
        "id, medication_id, medication_name, dose, moment_id, moment_name, status, scheduled_at, registered_at, local_date",
      )
      .eq("user_id", userId)
      .order("registered_at", { ascending: false })
      .limit(1000),
    supabase
      .from("recipe_history")
      .select(
        "id, file_name, file_type, doctor_name, patient_name, prescription_date, read_at, confidence, needs_review, warnings, extracted_data",
      )
      .eq("user_id", userId)
      .order("read_at", { ascending: false })
      .limit(500),
  ]);

  if (estadoResultado.error) throw estadoResultado.error;
  if (historialResultado.error) throw historialResultado.error;
  if (recetasResultado.error) throw recetasResultado.error;

  return {
    plan: estadoResultado.data?.plan_data || null,
    historial: (historialResultado.data || []).map((registro) => ({
      id: registro.id,
      medicamentoId: registro.medication_id,
      medicamento: registro.medication_name,
      dosis: registro.dose || "",
      momentoId: registro.moment_id,
      momento: registro.moment_name,
      estado: registro.status,
      fechaProgramada: registro.scheduled_at,
      fecha: registro.local_date,
      fechaHora: registro.registered_at,
    })),
    recetas: (recetasResultado.data || []).map((r) => ({
      id: r.id,
      nombreArchivo: r.file_name,
      tipoArchivo: r.file_type,
      medico: r.doctor_name,
      paciente: r.patient_name,
      fechaReceta: r.prescription_date,
      leidaEn: r.read_at,
      confianza: r.confidence,
      requiereRevision: r.needs_review,
      advertencias: r.warnings || [],
      datos: r.extracted_data || {},
    })),
  };
}
