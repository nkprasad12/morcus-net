import { assert } from "@/common/assert";

export const LatinWorks = {
  PLINY_NATURAL_HISTORY: "phi0978.phi001.perseus-lat2",
  APULEIUS_METAMORPHOSES: "phi1212.phi002.perseus-lat1",
  LIVY_AUC: "phi0914.phi001.perseus-lat2",
  // PLAUTUS_AMPHITRYO: "phi0119.phi001.perseus-lat2",
  CAESAR_DBG: "phi0448.phi001.perseus-lat2",
  CAESAR_BELLUM_CIVILIS: "phi0448.phi002.perseus-lat2",
  CICERO_PRO_QUINCTIO: "phi0474.phi001.perseus-lat2",
  CICERO_PRO_QUINTO_ROSCIO: "phi0474.phi003.perseus-lat2",
  CICERO_DIVINATIO_IN_Q_CAECILIUM: "phi0474.phi004.perseus-lat2",
  CICERO_PRO_FONTEIO: "phi0474.phi007.perseus-lat2",
  CICERO_PRO_A_CAECINA: "phi0474.phi008.perseus-lat2",
  CICERO_DE_LEGE_AGRARIA: "phi0474.phi011.perseus-lat2",
  CICERO_PRO_RABIRIO: "phi0474.phi012.perseus-lat2",
  CICERO_IN_CATILINAM: "phi0474.phi013.perseus-lat2",
  CICERO_PRO_SULLA: "phi0474.phi015.perseus-lat2",
  CICERO_PRO_ARCHIA_POETA: "phi0474.phi016.perseus-lat2",
  CICERO_PRO_L_FLACCO: "phi0474.phi017.perseus-lat2",
  CICERO_CUM_POPULO_GRATIAS_EGI: "phi0474.phi018.perseus-lat2",
  CICERO_CUM_SENATUI_GRATIAS_EGIT: "phi0474.phi019.perseus-lat2",
  CICERO_DE_DOMO_SUA: "phi0474.phi020.perseus-lat2",
  CICERO_DE_HARUSPICUM_RESP: "phi0474.phi021.perseus-lat2",
  CICERO_PRO_P_SESTIO: "phi0474.phi022.perseus-lat2",
  CICERO_IN_P_VATINIUM: "phi0474.phi023.perseus-lat2",
  CICERO_PRO_M_CAELIO: "phi0474.phi024.perseus-lat2",
  CICERO_DE_PROVINCIIS_CONSULARIBUS: "phi0474.phi025.perseus-lat2",
  CICERO_PRO_BALBO: "phi0474.phi026.perseus-lat2",
  CICERO_IN_PISONEM: "phi0474.phi027.perseus-lat2",
  CICERO_PRO_PLANCIO: "phi0474.phi028.perseus-lat2",
  CICERO_PRO_SCAURO: "phi0474.phi029.perseus-lat2",
  CICERO_PRO_RABIRIO_POSTUMO: "phi0474.phi030.perseus-lat2",
  CICERO_PRO_ANNIO_MILONE: "phi0474.phi031.perseus-lat2",
  CICERO_PRO_M_MARCELLO: "phi0474.phi032.perseus-lat2",
  CICERO_PRO_Q_LIGARIO: "phi0474.phi033.perseus-lat2",
  CICERO_PRO_REGE_DEIOTARO: "phi0474.phi034.perseus-lat2",
  CICERO_PHILLIPPICAE: "phi0474.phi035.perseus-lat2",
  CICERO_DE_INVENTIONE: "phi0474.phi036.perseus-lat2",
  CICERO_DE_ORATORE: "phi0474.phi037.perseus-lat2",
  CICERO_DE_PARTITIONE_ORATORIA: "phi0474.phi038.perseus-lat2",
  CICERO_BRUTUS: "phi0474.phi039.perseus-lat2",
  CICERO_ORATOR: "phi0474.phi040.perseus-lat2",
  CICERO_DE_OPTIMO_GENERE_ORATORUM: "phi0474.phi041.perseus-lat2",
  // Skipped 42 b/c it had a textpart without an n
  CICERO_DE_RE_PUBLICA: "phi0474.phi043.perseus-lat2",
  // 44 is missing?
  CICERO_ACADEMICA: "phi0474.phi045.perseus-lat2",
  CICERO_LUCULLUS: "phi0474.phi046.perseus-lat2",
  CICERO_DE_FINIBUS: "phi0474.phi048.perseus-lat2",
  CICERO_DE_SENECTUTE: "phi0474.phi051.perseus-lat2",
  CICERO_DE_AMICITIA: "phi0474.phi052.perseus-lat2",
  CICERO_DE_FATO: "phi0474.phi054.perseus-lat2",
  CICERO_DE_OFFICIIS: "phi0474.phi055.perseus-lat2",
  CICERO_TIMAEUS: "phi0474.phi072.perseus-lat2",
  PHAEDRUS_FABULAE: "phi0975.phi001.perseus-lat2",
  CATULLUS: "phi0472.phi001.perseus-lat2",
  OVID_AMORES: "phi0959.phi001.perseus-lat2",
  OVID_EPISTULAE: "phi0959.phi002.perseus-lat2",
  OVID_MEDICAMINA: "phi0959.phi003.perseus-lat2",
  OVID_ARS_AMATORIA: "phi0959.phi004.perseus-lat2",
  TACITUS_AGRICOLA: "phi1351.phi001.perseus-lat2",
  TACITUS_GERMANIA: "phi1351.phi002.perseus-lat1",
  TACITUS_DIALOGUS: "phi1351.phi003.perseus-lat1",
  JUVENAL_SATURAE: "phi1276.phi001.perseus-lat2",
  SALLUST_CATALINA1: "phi0631.phi001.perseus-lat4",
  SALLUST_JUGURTHA: "phi0631.phi002.perseus-lat4",
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
  PETRONIUS_SATYRICON: "phi0972.phi001.perseus-lat2",
  AMMIANUS_MARCELLINUS: "stoa0023.stoa001.perseus-lat2",
  TIBULLUS_ELEGIAE: "phi0660.phi001.perseus-lat2",
  SUPLICIA_CARMINA: "phi0660.phi003.perseus-lat2",
  PRUDENTIUS_PERISTEPHANON: "stoa0238.stoa001.perseus-lat2",
  MUNICIUS_OCTAVIUS: "stoa0203.stoa001.perseus-lat2",
  CURTIUS_RUFUS: "phi0860.phi001.perseus-lat2",
  SENECA_ELDER_CONTROVERSIAE: "phi1014.phi001.perseus-lat1",
  SENECA_ELDER_FRAGMENTA: "phi1014.phi004.perseus-lat1",
  SENECA_APOCOLOCYNTOSIS: "phi1017.phi011.perseus-lat2",
  SENECA_DE_CLEMENTIA: "phi1017.phi014.perseus-lat2",
  VALERIUS_MAXIMUS: "phi1038.phi001.perseus-lat1",
  FLORUS_EPITOME: "phi1242.phi001.perseus-lat1",
  PLINY_LETTERS: "phi1318.phi001.perseus-lat1",
  TACITUS_HISTORIAE: "phi1351.phi004.perseus-lat2",
  SENECA_DE_BREVITATE_VITAE: "stoa0255.stoa004.perseus-lat2",
  TERTULLIAN_DE_SPECTACULIS: "stoa0275.stoa027.perseus-lat2",
  TERTULLIAN_AD_UXOREM: "stoa0276.stoa002.opp-lat1",
  // Phase 1 (Cluster A) onboarding. Each was checked to have a clean V1
  // citation hierarchy, no text outside the citable rows beyond title and book
  // headings, unique row and page ids, and no duplicate in Hypotactic or PHI.
  PSEUDO_CAESAR_DE_BELLO_AFRICO: "phi0426.phi001.perseus-lat1",
  PSEUDO_CAESAR_DE_BELLO_ALEXANDRINO: "phi0428.phi001.perseus-lat1",
  PSEUDO_CAESAR_DE_BELLO_HISPANIENSI: "phi0430.phi001.perseus-lat1",
  CICERO_PRO_TULLIO: "phi0474.phi006.perseus-lat2",
  CICERO_DE_IMPERIO_CN_POMPEI: "phi0474.phi009.perseus-lat2",
  CICERO_PRO_CLUENTIO: "phi0474.phi010.perseus-lat2",
  CICERO_PRO_MURENA: "phi0474.phi014.perseus-lat2",
  CICERO_DE_NATURA_DEORUM: "phi0474.phi050.perseus-lat2",
  // Müller's Teubner text. `-lat4` (Falconer) waits for speaker support.
  CICERO_DE_DIVINATIONE: "phi0474.phi053.perseus-lat3",
  PROPERTIUS_ELEGIAE: "phi0620.phi001.perseus-lat3",
  OVID_EX_PONTO: "phi0959.phi009.perseus-lat2",
  VALERIUS_FLACCUS_ARGONAUTICA: "phi1035.phi001.perseus-lat2",
  VITRUVIUS_DE_ARCHITECTURA: "phi1056.phi001.perseus-lat2",
  APULEIUS_APOLOGIA: "phi1212.phi001.perseus-lat1",
  APULEIUS_FLORIDA: "phi1212.phi003.perseus-lat2",
  GELLIUS_NOCTES_ATTICAE: "phi1254.phi001.perseus-lat2",
  MARTIAL_EPIGRAMMATA: "phi1294.phi002.perseus-lat2",
  TERTULLIAN_APOLOGETICUM: "stoa0275.stoa009.perseus-lat2",

  // Phase 2B/2C: Cicero (Orationes, Philosophica, Rhetorica, Epistulae)
  CICERO_PRO_ROSCIO_AMERINO: "phi0474.phi002.perseus-lat2",
  CICERO_IN_VERREM: "phi0474.phi005.perseus-lat2",
  CICERO_TOPICA: "phi0474.phi042.perseus-lat2",
  CICERO_PARADOXA_STOICORUM: "phi0474.phi047.perseus-lat2",
  CICERO_TUSCULANAE_DISPUTATIONES: "phi0474.phi049.perseus-lat2",
  CICERO_EPISTULAE_AD_FAMILIARES: "phi0474.phi056.perseus-lat2",
  CICERO_EPISTULAE_AD_ATTICUM: "phi0474.phi057.perseus-lat2",
  CICERO_EPISTULAE_AD_QUINTUM_FRATREM: "phi0474.phi058.perseus-lat2",
  CICERO_EPISTULAE_AD_BRUTUM: "phi0474.phi059.perseus-lat2",

  // Phase 2B: Quintus Tullius Cicero
  QUINTUS_CICERO_COMMENTARIOLUM_PETITIONIS: "phi0478.phi003.perseus-lat2",

  // Phase 2B: Cornelius Nepos
  NEPOS_HAMILCAR: "phi0588.abo022.perseus-lat2",
  NEPOS_HANNIBAL: "phi0588.abo023.perseus-lat2",
  NEPOS_ATTICUS: "phi0588.abo025.perseus-lat2",

  // Phase 2B: Sallust
  SALLUST_HISTORIAE_FRAGMENTA: "phi0631.phi003.perseus-lat2",

  // Phase 2B: Appendix Vergiliana
  APPENDIX_VERGILIANA_DIRAE: "phi0692.phi001.perseus-lat1",
  APPENDIX_VERGILIANA_LYDIA: "phi0692.phi002.perseus-lat1",
  APPENDIX_VERGILIANA_CULEX: "phi0692.phi003.perseus-lat1",
  APPENDIX_VERGILIANA_COPA: "phi0692.phi005.perseus-lat1",
  APPENDIX_VERGILIANA_ELEGIAE_IN_MAECENATEM: "phi0692.phi006.perseus-lat1",
  APPENDIX_VERGILIANA_CIRIS: "phi0692.phi007.perseus-lat1",
  APPENDIX_VERGILIANA_PRIAPEA: "phi0692.phi008.perseus-lat1",
  APPENDIX_VERGILIANA_CATALEPTON: "phi0692.phi009.perseus-lat1",
  APPENDIX_VERGILIANA_MORETUM: "phi0692.phi011.perseus-lat1",
  APPENDIX_VERGILIANA_DE_INSTITUTIONE_VIRI_BONI: "phi0692.phi012.perseus-lat1",
  APPENDIX_VERGILIANA_DE_EST_ET_NON: "phi0692.phi013.perseus-lat1",

  // Phase 2B: Columella
  COLUMELLA_RES_RUSTICA: "phi0845.phi002.perseus-lat3",

  // Phase 2B/2C: Petronius
  PETRONIUS_FRAGMENTA: "phi0972.phi001f.perseus-lat1",
  PETRONIUS_POEMS: "phi0972.phi001p.perseus-lat1",

  // Phase 2B: Quintilian
  QUINTILIAN_INSTITUTIO_ORATORIA: "phi1002.phi001.perseus-lat2",

  // Phase 2B/2C: Seneca the Younger (De Beneficiis & Epistulae Morales)
  SENECA_DE_BENEFICIIS: "phi1017.phi013.perseus-lat2",
  SENECA_EPISTULAE_MORALES: "phi1017.phi015.perseus-lat2",

  // Phase 2B: Silius Italicus
  SILIUS_ITALICUS_PUNICA: "phi1345.phi001.perseus-lat2",

  // Phase 2B: Tacitus
  TACITUS_ANNALES: "phi1351.phi005.perseus-lat1",

  // Phase 2B: Apicius
  APICIUS_DE_RE_COQUINARIA: "phi2003.phi001.perseus-lat1",

  // Phase 2B: Historia Augusta
  HISTORIA_AUGUSTA_HADRIAN: "phi2331.phi001.perseus-lat2",
  HISTORIA_AUGUSTA_AELIUS: "phi2331.phi002.perseus-lat2",
  HISTORIA_AUGUSTA_ANTONINUS_PIUS: "phi2331.phi003.perseus-lat2",
  HISTORIA_AUGUSTA_MARCUS_AURELIUS: "phi2331.phi004.perseus-lat2",
  HISTORIA_AUGUSTA_VERUS: "phi2331.phi005.perseus-lat2",
  HISTORIA_AUGUSTA_AVIDIUS_CASSIUS: "phi2331.phi006.perseus-lat2",
  HISTORIA_AUGUSTA_COMMODUS: "phi2331.phi007.perseus-lat2",
  HISTORIA_AUGUSTA_PERTINAX: "phi2331.phi008.perseus-lat2",
  HISTORIA_AUGUSTA_DIDIUS_JULIANUS: "phi2331.phi009.perseus-lat2",
  HISTORIA_AUGUSTA_SEVERUS: "phi2331.phi010.perseus-lat2",
  HISTORIA_AUGUSTA_PESCENNIUS_NIGER: "phi2331.phi011.perseus-lat2",
  HISTORIA_AUGUSTA_CLODIUS_ALBINUS: "phi2331.phi012.perseus-lat2",
  HISTORIA_AUGUSTA_CARACALLA: "phi2331.phi013.perseus-lat2",
  HISTORIA_AUGUSTA_GETA: "phi2331.phi014.perseus-lat2",
  HISTORIA_AUGUSTA_MACRINUS: "phi2331.phi015.perseus-lat2",
  HISTORIA_AUGUSTA_DIADUMENUS: "phi2331.phi016.perseus-lat2",
  HISTORIA_AUGUSTA_ELAGABALUS: "phi2331.phi017.perseus-lat2",
  HISTORIA_AUGUSTA_SEVERUS_ALEXANDER: "phi2331.phi018.perseus-lat2",
  HISTORIA_AUGUSTA_MAXIMINI_DUO: "phi2331.phi019.perseus-lat2",
  HISTORIA_AUGUSTA_GORDIANI_TRES: "phi2331.phi020.perseus-lat2",
  HISTORIA_AUGUSTA_MAXIMUS_ET_BALBINUS: "phi2331.phi021.perseus-lat2",
  HISTORIA_AUGUSTA_VALERIANI_DUO: "phi2331.phi022.perseus-lat2",
  HISTORIA_AUGUSTA_GALLIENI_DUO: "phi2331.phi023.perseus-lat2",
  HISTORIA_AUGUSTA_TYRANNI_TRIGINTA: "phi2331.phi024.perseus-lat2",
  HISTORIA_AUGUSTA_CLAUDIUS: "phi2331.phi025.perseus-lat2",
  HISTORIA_AUGUSTA_AURELIANUS: "phi2331.phi026.perseus-lat2",
  HISTORIA_AUGUSTA_TACITUS: "phi2331.phi027.perseus-lat2",
  HISTORIA_AUGUSTA_PROBUS: "phi2331.phi028.perseus-lat2",
  HISTORIA_AUGUSTA_QUADRIGAE_TYRANNORUM: "phi2331.phi029.perseus-lat2",
  HISTORIA_AUGUSTA_CARUS_CARINUS_NUMERIANUS: "phi2331.phi030.perseus-lat2",

  // Phase 2C: Augustine
  AUGUSTINE_EPISTULAE_SELECTIONS: "stoa0040.stoa011.perseus-lat2",

  // Phase 2B: Ausonius
  AUSONIUS_BISSULA: "stoa0045.stoa001.perseus-lat2",
  AUSONIUS_PROFESSORES: "stoa0045.stoa004.perseus-lat2",
  AUSONIUS_CUPIDO_CRUCIATUS: "stoa0045.stoa005.perseus-lat2",
  AUSONIUS_DE_HEREDIOLO: "stoa0045.stoa006.perseus-lat2",
  AUSONIUS_EPHEMERIS: "stoa0045.stoa008.perseus-lat2",
  AUSONIUS_EPICEDION: "stoa0045.stoa009.perseus-lat2",
  AUSONIUS_EPIGRAMMATA: "stoa0045.stoa010.perseus-lat2",
  AUSONIUS_EPISTULAE: "stoa0045.stoa011.perseus-lat2",
  AUSONIUS_EPITAPHIA: "stoa0045.stoa012.perseus-lat2",
  AUSONIUS_GENETHLIACON: "stoa0045.stoa013.perseus-lat2",
  AUSONIUS_GRATIARUM_ACTIO: "stoa0045.stoa014.perseus-lat2",
  AUSONIUS_GRIPHUS: "stoa0045.stoa015.perseus-lat2",
  AUSONIUS_LUDUS_SEPTEM_SAPIENTUM: "stoa0045.stoa018.perseus-lat2",
  AUSONIUS_MOSELLA: "stoa0045.stoa019.perseus-lat2",
  AUSONIUS_ORATIO: "stoa0045.stoa020.perseus-lat2",
  AUSONIUS_ORDO_URBIUM_NOBILIUM: "stoa0045.stoa021.perseus-lat2",
  AUSONIUS_PARENTALIA: "stoa0045.stoa022.perseus-lat2",
  AUSONIUS_PRECATIONES: "stoa0045.stoa026.perseus-lat2",
  AUSONIUS_VERSUS_PASCHALES: "stoa0045.stoa027.perseus-lat2",
  AUSONIUS_TECHNOPAEGNION: "stoa0045.stoa028.perseus-lat2",

  // Phase 2B: Boethius
  BOETHIUS_DE_CONSOLATIONE_PHILOSOPHIAE: "stoa0058.stoa001.perseus-lat2",
  BOETHIUS_QUOMODO_SUBSTANTIAE: "stoa0058.stoa003.perseus-lat1",
  BOETHIUS_DE_FIDE_CATHOLICA: "stoa0058.stoa006.perseus-lat1",
  BOETHIUS_CONTRA_EUTYCHEN_ET_NESTORIUM: "stoa0058.stoa023.perseus-lat1",
  BOETHIUS_DE_TRINITATE: "stoa0058.stoa025.perseus-lat1",
  BOETHIUS_UTRUM_PATER_ET_FILIUS: "stoa0058.stoa028.perseus-lat1",

  // Phase 2B: Cato the Elder
  CATO_DE_AGRI_CULTURA: "stoa0079.stoa001.perseus-lat1",

  // Phase 2B: Claudian
  CLAUDIAN_DE_BELLO_GILDONICO: "stoa0089.stoa002.perseus-lat2",
  CLAUDIAN_DE_BELLO_GOTHICO: "stoa0089.stoa003.perseus-lat2",
  CLAUDIAN_DE_RAPTU_PROSERPINAE: "stoa0089.stoa005.perseus-lat2",
  CLAUDIAN_EPITHALAMIUM_HONORII: "stoa0089.stoa006.perseus-lat2",
  CLAUDIAN_FESCENNINA: "stoa0089.stoa007.perseus-lat2",
  CLAUDIAN_IN_RUFINUM: "stoa0089.stoa009.perseus-lat2",
  CLAUDIAN_PANEGYRICUS_HONORII_III: "stoa0089.stoa010.perseus-lat2",
  CLAUDIAN_PANEGYRICUS_HONORII_IV: "stoa0089.stoa011.perseus-lat2",
  CLAUDIAN_PANEGYRICUS_HONORII_VI: "stoa0089.stoa012.perseus-lat2",
  CLAUDIAN_PANEGYRICUS_MANLIO_THEODORO: "stoa0089.stoa013.perseus-lat2",
  CLAUDIAN_PANEGYRICUS_PROBINO_ET_OLYBRIO: "stoa0089.stoa014.perseus-lat2",

  // Phase 2B: Jerome
  JEROME_EPISTULAE_SELECTIONS: "stoa0162.stoa004.perseus-lat2",

  // Phase 2B: Prudentius
  PRUDENTIUS_PSYCHOMACHIA: "stoa0238.stoa002.perseus-lat2",
  PRUDENTIUS_PRAEFATIO: "stoa0238.stoa003.perseus-lat2",
  PRUDENTIUS_CATHEMERINON: "stoa0238.stoa004.perseus-lat2",
  PRUDENTIUS_APOTHEOSIS: "stoa0238.stoa005.perseus-lat2",
  PRUDENTIUS_HAMARTIGENIA: "stoa0238.stoa006.perseus-lat2",
  PRUDENTIUS_CONTRA_SYMMACHUM: "stoa0238.stoa007.perseus-lat2",
  PRUDENTIUS_DITTOCHAEON: "stoa0238.stoa008.perseus-lat2",
  PRUDENTIUS_EPILOGUS: "stoa0238.stoa009.perseus-lat2",

  // Phase 2B: Seneca the Younger (Dialogi)
  SENECA_DE_CONSOLATIONE_AD_HELVIAM: "stoa0255.stoa006.perseus-lat2",
  SENECA_DE_CONSOLATIONE_AD_MARCIAM: "stoa0255.stoa007.perseus-lat2",
  SENECA_DE_CONSOLATIONE_AD_POLYBIUM: "stoa0255.stoa008.perseus-lat2",
  SENECA_DE_CONSTANTIA: "stoa0255.stoa009.perseus-lat2",
  SENECA_DE_IRA: "stoa0255.stoa010.perseus-lat2",
  SENECA_DE_OTIO: "stoa0255.stoa011.perseus-lat2",
  SENECA_DE_PROVIDENTIA: "stoa0255.stoa012.perseus-lat2",
  SENECA_DE_TRANQUILLITATE_ANIMI: "stoa0255.stoa013.perseus-lat2",
  SENECA_DE_VITA_BEATA: "stoa0255.stoa014.perseus-lat2",

  // Phase 2B: Sidonius Apollinaris
  SIDONIUS_APOLLINARIS_EPISTULAE: "stoa0261.stoa002.perseus-lat1",

  // Not onboarded:
  // - Suetonius, the ten lives phi1348.abo013-abo022: PHI JSON already ships
  //   all twelve lives (`lat1348.001`, Ihm).
  // - Celsus, De Medicina (phi0836.phi002.perseus-lat4): waits so that -lat6
  //   (Marx) can be onboarded in Phase 2C/4.
};

export const EnglishTranslations: Record<string, string> = {
  [LatinWorks.SALLUST_CATALINA1]: "phi0631.phi001.perseus-eng2",
  [LatinWorks.LIVY_AUC]: "phi0914.phi001.perseus-eng3",
  [LatinWorks.OVID_AMORES]: "phi0959.phi001.perseus-eng2",
  [LatinWorks.CICERO_DE_LEGE_AGRARIA]: "phi0474.phi011.perseus-eng2",
  [LatinWorks.CICERO_PRO_RABIRIO]: "phi0474.phi012.perseus-eng3",
  [LatinWorks.CICERO_DE_AMICITIA]: "phi0474.phi052.perseus-eng2",
} satisfies { [K in keyof typeof LatinWorks]?: string };

/**
 * Retired work ids, mapped to the id of the work that replaces them.
 *
 * Perseus occasionally re-editions a file under a new id (bumping
 * `-lat1` to `-lat2` when the text is re-encoded from the same edition).
 * Reader URLs and saved spots can name a work by its id, so the reader resolves
 * these old ids to their successors. Add an entry here whenever an onboarded id
 * changes in an upstream sync; never remove one.
 */
export const WORK_ID_ALIASES: Readonly<Record<string, string>> = {
  // canonical-latinLit 0700a6b7 (2026-10): Cicero's rhetorica and philosophica
  // and Tacitus' Agricola re-encoded as `-lat2` from the same editions.
  "phi0474.phi036.perseus-lat1": LatinWorks.CICERO_DE_INVENTIONE,
  "phi0474.phi037.perseus-lat1": LatinWorks.CICERO_DE_ORATORE,
  "phi0474.phi038.perseus-lat1": LatinWorks.CICERO_DE_PARTITIONE_ORATORIA,
  "phi0474.phi039.perseus-lat1": LatinWorks.CICERO_BRUTUS,
  "phi0474.phi040.perseus-lat1": LatinWorks.CICERO_ORATOR,
  "phi0474.phi041.perseus-lat1": LatinWorks.CICERO_DE_OPTIMO_GENERE_ORATORUM,
  "phi0474.phi043.perseus-lat1": LatinWorks.CICERO_DE_RE_PUBLICA,
  "phi0474.phi046.perseus-lat1": LatinWorks.CICERO_LUCULLUS,
  "phi0474.phi048.perseus-lat1": LatinWorks.CICERO_DE_FINIBUS,
  "phi0474.phi051.perseus-lat1": LatinWorks.CICERO_DE_SENECTUTE,
  "phi0474.phi054.perseus-lat1": LatinWorks.CICERO_DE_FATO,
  "phi0474.phi055.perseus-lat1": LatinWorks.CICERO_DE_OFFICIIS,
  "phi0474.phi072.perseus-lat1": LatinWorks.CICERO_TIMAEUS,
  "phi1351.phi001.perseus-lat1": LatinWorks.TACITUS_AGRICOLA,
};

/** Returns the current id for `workId`, following `WORK_ID_ALIASES`. */
export function resolveWorkIdAlias(workId: string): string {
  return WORK_ID_ALIASES[workId] ?? workId;
}

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
