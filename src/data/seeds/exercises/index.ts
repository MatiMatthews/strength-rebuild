import type { RepositoryDatabase } from '../../repositories';

export const EXERCISE_CATALOG_VERSION = 1;

type Demand = 'low' | 'moderate' | 'high';
type Skill = 'beginner' | 'intermediate' | 'advanced';
type Impact = 'none' | 'low' | 'moderate' | 'high';

export interface SeedExercise {
  id: string;
  name: string;
  pattern: string;
  equipment: string[];
  skill: Skill;
  impact: Impact;
  braceDemand: Demand;
  lumbarDemand: Demand;
  instructions: string[];
  tags: string[];
  media: {
    uri: string;
    type: 'image';
    license: { spdx: 'CC0-1.0'; source: string; attribution: string };
  };
}

const media = (id: string): SeedExercise['media'] => ({
  uri: `assets/exercises/${id}.svg`,
  type: 'image',
  license: {
    spdx: 'CC0-1.0',
    source: 'Strength Rebuild original offline exercise diagrams, catalog v1',
    attribution: 'Strength Rebuild contributors',
  },
});

const exercise = (
  id: string, name: string, pattern: string, equipment: string[], skill: Skill, impact: Impact,
  braceDemand: Demand, lumbarDemand: Demand, instructions: string[], tags: string[],
): SeedExercise => ({ id, name, pattern, equipment, skill, impact, braceDemand, lumbarDemand, instructions, tags, media: media(id) });

export const exerciseCatalog: readonly SeedExercise[] = [
  exercise('barbell-bench-press', 'Press banca', 'horizontal-push', ['barbell', 'bench'], 'intermediate', 'none', 'moderate', 'low', ['Apoya cabeza, espalda y pies.', 'Baja con control y empuja sin perder los apoyos.'], ['chest', 'anchor']),
  exercise('incline-dumbbell-press', 'Press inclinado con mancuernas', 'horizontal-push', ['dumbbells', 'incline-bench'], 'beginner', 'none', 'low', 'low', ['Fija los pies y el respaldo.', 'Baja las mancuernas con control y exhala al subir.'], ['chest']),
  exercise('seated-dumbbell-press', 'Press hombro sentado', 'vertical-push', ['dumbbells', 'bench'], 'beginner', 'none', 'moderate', 'low', ['Usa respaldo alto y costillas controladas.', 'Empuja sobre la cabeza sin arquear la zona lumbar.'], ['shoulders']),
  exercise('strict-pull-up', 'Dominada estricta', 'vertical-pull', ['pull-up-bar'], 'intermediate', 'none', 'moderate', 'low', ['Parte desde brazos extendidos y hombros activos.', 'Sube sin impulso y baja con control.'], ['back', 'anchor']),
  exercise('neutral-lat-pulldown', 'Jalón neutro', 'vertical-pull', ['cable-machine'], 'beginner', 'none', 'low', 'low', ['Mantén el torso estable.', 'Lleva el agarre hacia el pecho y vuelve sin balanceo.'], ['back']),
  exercise('chest-supported-row', 'Remo con pecho apoyado', 'horizontal-pull', ['dumbbells', 'incline-bench'], 'beginner', 'none', 'low', 'low', ['Apoya el pecho y mantén el cuello neutro.', 'Rema hacia las costillas sin despegar el torso.'], ['back']),
  exercise('smith-box-squat', 'Smith squat a caja', 'squat', ['smith-machine', 'box'], 'intermediate', 'none', 'high', 'moderate', ['Ajusta la caja a una profundidad controlable.', 'Desciende con control, toca suave y sube manteniendo rodillas alineadas.'], ['legs', 'anchor']),
  exercise('leg-extension', 'Extensión de piernas', 'knee-extension', ['leg-extension-machine'], 'beginner', 'none', 'low', 'low', ['Alinea la rodilla con el eje de la máquina.', 'Extiende sin bloquear y regresa con control.'], ['quadriceps']),
  exercise('seated-leg-curl', 'Curl femoral sentado', 'knee-flexion', ['leg-curl-machine'], 'beginner', 'none', 'low', 'low', ['Ajusta el respaldo para mantener la cadera apoyada.', 'Flexiona sin impulso y controla el retorno.'], ['hamstrings']),
  exercise('block-deadlift', 'Peso muerto desde bloques', 'hinge', ['barbell', 'blocks'], 'advanced', 'none', 'high', 'high', ['Acerca la barra y crea tensión antes de despegar.', 'Extiende cadera y rodillas sin hiperextender al finalizar.'], ['posterior-chain', 'anchor']),
  exercise('dead-bug', 'Dead bug', 'anti-extension', ['bodyweight'], 'beginner', 'none', 'moderate', 'low', ['Mantén respiración continua y espalda cómoda.', 'Extiende una extremidad por vez sin perder el control.'], ['core']),
  exercise('bird-dog', 'Bird-dog', 'anti-rotation', ['bodyweight'], 'beginner', 'none', 'low', 'low', ['Parte en cuatro apoyos con columna neutra.', 'Extiende brazo y pierna opuestos sin rotar el tronco.'], ['core']),
  exercise('bodyweight-activation', 'Activación general', 'activation', ['bodyweight'], 'beginner', 'none', 'low', 'low', ['Ponte de pie con apoyo estable y espacio libre.', 'Alterna marcha y círculos de brazos con movimientos suaves.', 'Respira continuo y mantén el abdomen ligeramente activo.', 'Evita acelerar o encoger los hombros.', 'Detente o reduce el rango si aparece dolor, mareo o pérdida de equilibrio.'], ['activation']),
  exercise('thoracic-mobility', 'Movilidad torácica', 'mobility', ['bodyweight'], 'beginner', 'none', 'low', 'low', ['Colócate de lado o en cuatro apoyos con la pelvis estable.', 'Rota desde la parte alta de la espalda sin forzar el cuello.', 'Exhala al abrir y toma aire al volver.', 'Evita compensar arqueando la zona lumbar.', 'Reduce el rango o detente ante dolor agudo u hormigueo.'], ['mobility']),
  exercise('hip-mobility', 'Movilidad de cadera', 'mobility', ['bodyweight'], 'beginner', 'none', 'low', 'low', ['Usa una postura estable y apóyate si lo necesitas.', 'Mueve la cadera lentamente dentro de un rango cómodo.', 'Respira sin bloquear el abdomen.', 'Evita girar la rodilla o rebotar al final del rango.', 'Acorta el recorrido o detente si hay pinzamiento o dolor.'], ['mobility']),
  exercise('shoulder-mobility', 'Movilidad de hombros', 'mobility', ['bodyweight'], 'beginner', 'none', 'low', 'low', ['Ponte erguido con costillas y cuello relajados.', 'Eleva y rota los brazos lentamente sin perder la postura.', 'Exhala durante el tramo de mayor esfuerzo.', 'Evita arquear la espalda o encoger los hombros.', 'Reduce el rango o detente si aparece dolor o adormecimiento.'], ['mobility']),
  exercise('low-volume-jump', 'Salto de bajo volumen', 'power', ['bodyweight'], 'intermediate', 'moderate', 'moderate', 'low', ['Elige una superficie despejada y aterriza con ambos pies.', 'Despega con intención y cae suave flexionando cadera y rodillas.', 'Toma aire antes del salto y exhala al estabilizar.', 'Evita aterrizar rígido o dejar que las rodillas colapsen.', 'Cambia por una elevación de talones o detente ante dolor o inestabilidad.'], ['power']),
  exercise('pallof-press', 'Press Pallof', 'anti-rotation', ['bands'], 'beginner', 'none', 'moderate', 'low', ['Ancla la banda al costado y adopta una base estable.', 'Extiende los brazos sin permitir que el tronco rote.', 'Exhala al extender y mantén el abdomen activo.', 'Evita inclinarte hacia el anclaje o elevar los hombros.', 'Acércate al anclaje o detente si no puedes mantener la postura sin dolor.'], ['core']),
  exercise('session-review', 'Revisión de sesión', 'review', ['bodyweight'], 'beginner', 'none', 'low', 'low', ['Siéntate o permanece de pie en una posición cómoda.', 'Repasa esfuerzo, técnica y molestias antes de cerrar.', 'Respira con calma mientras evalúas cada respuesta.', 'Evita minimizar dolor o marcar datos que no recuerdas.', 'Si hay dolor preocupante, no continúes y sigue la orientación de seguridad local.'], ['review']),
];

export async function seedExerciseCatalog(db: RepositoryDatabase, timestamp = new Date().toISOString()) {
  await db.withTransactionAsync(async () => {
    for (const item of exerciseCatalog) {
      await db.runAsync(
        `INSERT INTO exercise (id, schema_version, created_at, updated_at, name, movement_pattern, equipment,
          skill_level, impact, brace_demand, lumbar_demand, instructions_json)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version, updated_at = excluded.updated_at,
          name = excluded.name, movement_pattern = excluded.movement_pattern, equipment = excluded.equipment,
          skill_level = excluded.skill_level, impact = excluded.impact, brace_demand = excluded.brace_demand,
          lumbar_demand = excluded.lumbar_demand, instructions_json = excluded.instructions_json`,
        item.id, timestamp, timestamp, item.name, item.pattern, JSON.stringify(item.equipment), item.skill, item.impact,
        item.braceDemand, item.lumbarDemand, JSON.stringify(item.instructions),
      );
      await db.runAsync(
        `INSERT INTO exercise_media (id, schema_version, created_at, updated_at, exercise_id, uri, media_type, license_metadata_json)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, uri = excluded.uri,
          media_type = excluded.media_type, license_metadata_json = excluded.license_metadata_json`,
        `${item.id}-image`, timestamp, timestamp, item.id, item.media.uri, item.media.type, JSON.stringify(item.media.license),
      );
      for (const tag of item.tags) {
        await db.runAsync(
          `INSERT INTO exercise_tag (id, schema_version, created_at, updated_at, exercise_id, tag)
           VALUES (?, 1, ?, ?, ?, ?) ON CONFLICT(exercise_id, tag) DO UPDATE SET updated_at = excluded.updated_at`,
          `${item.id}-${tag}`, timestamp, timestamp, item.id, tag,
        );
      }
    }
    await db.runAsync(
      `INSERT INTO app_setting (id, schema_version, created_at, updated_at, key, value_json)
       VALUES ('exercise-catalog-version', 1, ?, ?, 'exercise_catalog_version', ?)
       ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, value_json = excluded.value_json`,
      timestamp, timestamp, JSON.stringify(EXERCISE_CATALOG_VERSION),
    );
  });
}
