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
      plan,
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
    medicamento_id: registro.medicamentoId || null,
    medicamento: registro.medicamento || "Medicamento",
    dosis: registro.dosis || "",
    momento_id: registro.momentoId || null,
    momento: registro.momento || null,
    estado: registro.estado,
    fecha: registro.fecha,
    fecha_hora: registro.fechaHora,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("dose_history")
    .upsert(registros, { onConflict: "id" });

  if (error) throw error;
}

export async function cargarDatosNube(userId) {
  verificarCliente();

  const [{ data: estado, error: errorEstado }, { data: historial, error: errorHistorial }] =
    await Promise.all([
      supabase
        .from("app_state")
        .select("plan")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("dose_history")
        .select(
          "id, medicamento_id, medicamento, dosis, momento_id, momento, estado, fecha, fecha_hora",
        )
        .eq("user_id", userId)
        .order("fecha_hora", { ascending: false })
        .limit(1000),
    ]);

  if (errorEstado) throw errorEstado;
  if (errorHistorial) throw errorHistorial;

  return {
    plan: estado?.plan || null,
    historial: (historial || []).map((registro) => ({
      id: registro.id,
      medicamentoId: registro.medicamento_id,
      medicamento: registro.medicamento,
      dosis: registro.dosis,
      momentoId: registro.momento_id,
      momento: registro.momento,
      estado: registro.estado,
      fecha: registro.fecha,
      fechaHora: registro.fecha_hora,
    })),
  };
}
