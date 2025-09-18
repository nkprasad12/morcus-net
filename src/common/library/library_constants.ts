import { assert } from "@/common/assert";

export const LatinWorks = {
  // PLAUTUS_AMPHITRYO: "phi0119.phi001.perseus-lat2",
  CAESAR_DBG: "phi0448.phi001.perseus-lat2",
  CAESAR_BELLUM_CIVILIS: "phi0448.phi002.perseus-lat2",
  CICERO_PRO_QUINCTIO: "phi0474.phi001.perseus-lat2",
  CICERO_PRO_QUINTO_ROSCIO: "phi0474.phi003.perseus-lat2",
  CICERO_DE_LEGE_AGRARIA: "phi0474.phi011.perseus-lat2",
  CICERO_DE_OFFICIIS: "phi0474.phi055.perseus-lat1",
  CICERO_PRO_RABIRIO: "phi0474.phi012.perseus-lat2",
  PHAEDRUS_FABULAE: "phi0975.phi001.perseus-lat2",
  CATULLUS: "phi0472.phi001.perseus-lat2",
  OVID_AMORES: "phi0959.phi001.perseus-lat2",
  OVID_EPISTULAE: "phi0959.phi002.perseus-lat2",
  OVID_MEDICAMINA: "phi0959.phi003.perseus-lat2",
  OVID_ARS_AMATORIA: "phi0959.phi004.perseus-lat2",
  TACITUS_AGRICOLA: "phi1351.phi001.perseus-lat1",
  TACITUS_GERMANIA: "phi1351.phi002.perseus-lat1",
  TACITUS_DIALOGUS: "phi1351.phi003.perseus-lat1",
  JUVENAL_SATURAE: "phi1276.phi001.perseus-lat2",
  SALLUST_CATALINA1: "phi0631.phi001.perseus-lat4",
  DE_AMICITIA: "phi0474.phi052.perseus-lat2",
  DE_RERUM_NATURA: "phi0550.phi001.perseus-lat1",
  NEPOS_MILTIADES: "phi0588.abo001.perseus-lat2",
  NEPOS_THEMISTOCLES: "phi0588.abo002.perseus-lat2",
  NEPOS_ARISTIDES: "phi0588.abo003.perseus-lat2",
  NEPOS_PAUSANIAS: "phi0588.abo004.perseus-lat2",
  NEPOS_CIMON: "phi0588.abo005.perseus-lat2",
  NEPOS_LYSANDER: "phi0588.abo006.perseus-lat2",
  NEPOS_ALCIBIADES: "phi0588.abo007.perseus-lat2",
  NEPOS_THRASYBULUS: "phi0588.abo008.perseus-lat2",
  NEPOS_CONON: "phi0588.abo009.perseus-lat2",
  NEPOS_DION: "phi0588.abo010.perseus-lat2",
  NEPOS_IPHICRATES: "phi0588.abo011.perseus-lat2",
  NEPOS_CABRIAS: "phi0588.abo012.perseus-lat2",
  NEPOS_TIMOTHEUS: "phi0588.abo013.perseus-lat2",
  NEPOS_DATAMES: "phi0588.abo014.perseus-lat2",
  NEPOS_EPAMINONDAS: "phi0588.abo015.perseus-lat2",
  NEPOS_PELOPIDAS: "phi0588.abo016.perseus-lat2",
  NEPOS_AGESILAUS: "phi0588.abo017.perseus-lat2",
  NEPOS_EUMENES: "phi0588.abo018.perseus-lat2",
  NEPOS_PHOCION: "phi0588.abo019.perseus-lat2",
  NEPOS_TIMOLEON: "phi0588.abo020.perseus-lat2",
  NEPOS_DE_REGIBUS: "phi0588.abo021.perseus-lat2",
  // Nepos after this has some new tags:
  // <abbr ><expan><ex>Gaio</ex></expan>C.</abbr>
  // that we don't handle yet. But it doesn't look too hard.
  AMMIANUS_MARCELLINUS: "stoa0023.stoa001.perseus-lat2",
  TIBULLUS_ELEGIAE: "phi0660.phi001.perseus-lat2",
  SUPLICIA_CARMINA: "phi0660.phi003.perseus-lat2",
  PRUDENTIUS_PERISTEPHANON: "stoa0238.stoa001.perseus-lat2",
  MUNICIUS_OCTAVIUS: "stoa0203.stoa001.perseus-lat2",
};

export const EnglishTranslations: Record<string, string> = {
  [LatinWorks.SALLUST_CATALINA1]: "phi0631.phi001.perseus-eng2",
  [LatinWorks.OVID_AMORES]: "phi0959.phi001.perseus-eng2",
  [LatinWorks.CICERO_DE_LEGE_AGRARIA]: "phi0474.phi011.perseus-eng2",
  [LatinWorks.CICERO_PRO_RABIRIO]: "phi0474.phi012.perseus-eng3",
} satisfies { [K in keyof typeof LatinWorks]?: string };

function toPerseusPath(workId: string): string {
  const parts = workId.split(".");
  assert(parts.length === 3, () => `Invalid work ID: ${workId}`);
  return `data/${parts[0]}/${parts[1]}/${workId}.xml`;
}

// Two supported works are checked in to the repo itself for the sake of unit testing.
export const LOCAL_REPO_WORKS = [
  toPerseusPath(LatinWorks.CAESAR_DBG),
  toPerseusPath(LatinWorks.PHAEDRUS_FABULAE),
];

export const ALL_SUPPORTED_WORKS = [
  ...Object.values(LatinWorks).map(toPerseusPath),
  ...Object.values(EnglishTranslations).map(toPerseusPath),
];
