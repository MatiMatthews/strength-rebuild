import { exerciseCatalog } from '../../data/seeds/exercises';

export const equipmentAliases: Readonly<Record<string, string>> = {
  Barra: 'barbell', Mancuernas: 'dumbbells', Banco: 'bench', Bandas: 'bands',
};
export const equipmentLabels: Readonly<Record<string, string>> = {
  barbell: 'Barra', dumbbells: 'Mancuernas', bench: 'Banco', bands: 'Bandas',
  'incline-bench': 'Banco inclinado', 'pull-up-bar': 'Barra de dominadas',
  'cable-machine': 'Poleas', 'smith-machine': 'Máquina Smith', box: 'Caja',
  'leg-extension-machine': 'Máquina de extensión de piernas', 'leg-curl-machine': 'Máquina de curl femoral',
  blocks: 'Bloques', bodyweight: 'Peso corporal',
};
export const patternLabels: Readonly<Record<string, string>> = {
  'horizontal-push': 'Empuje horizontal', 'vertical-push': 'Empuje vertical',
  'horizontal-pull': 'Tracción horizontal', 'vertical-pull': 'Tracción vertical',
  squat: 'Sentadilla', 'knee-extension': 'Extensión de rodilla', 'knee-flexion': 'Flexión de rodilla',
  hinge: 'Bisagra de cadera', 'anti-extension': 'Control de extensión', 'anti-rotation': 'Control de rotación',
  activation: 'Activación', mobility: 'Movilidad', power: 'Potencia',
};
export const capabilityLabels: Readonly<Record<string, string>> = {
  chest: 'Pecho', anchor: 'Ejercicio principal', shoulders: 'Hombros', back: 'Espalda', legs: 'Piernas',
  quadriceps: 'Cuádriceps', hamstrings: 'Isquiotibiales', 'posterior-chain': 'Cadena posterior',
  core: 'Tronco', activation: 'Activación', mobility: 'Movilidad', power: 'Potencia',
};
export const requirementKinds = { EXACT: 'Ejercicio concreto', PATTERN: 'Patrón de movimiento', CAPABILITY: 'Capacidad o grupo muscular' } as const;
export const restrictionLabels: Readonly<Record<string, string>> = {
  'sin impacto': 'Sin impacto', lumbar: 'Demanda lumbar baja', abdominal: 'Demanda abdominal baja',
};
export const catalogEquipment = [...new Set(exerciseCatalog.flatMap(item => item.equipment))];
export const normalizeEquipment = (value: string) => equipmentAliases[value] ?? value;
const requirementAliases: Readonly<Record<string, string>> = {
  'PATTERN:Empuje horizontal': 'horizontal-push', 'CAPABILITY:Potencia de tren inferior': 'power',
};
export const normalizeRequirement = (kind: string, value: string) => requirementAliases[`${kind}:${value.trim()}`] ?? value.trim();
export function requirementOptions(kind: string) {
  const catalog = exerciseCatalog.filter(item => item.pattern !== 'review');
  if (kind === 'EXACT') return catalog.map(item => ({ value: item.id, label: item.name }));
  if (kind !== 'PATTERN' && kind !== 'CAPABILITY') return [];
  const labels = kind === 'PATTERN' ? patternLabels : capabilityLabels;
  return [...new Set(catalog.flatMap(item => kind === 'PATTERN' ? [item.pattern] : item.tags))]
    .map(value => ({ value, label: labels[value] ?? value }));
}
