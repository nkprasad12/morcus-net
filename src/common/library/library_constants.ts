const CAESAR_DBG = "data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";
const CAESAR_BELLUM_CIVILIS =
  "data/phi0448/phi002/phi0448.phi002.perseus-lat2.xml";
const PHAEDRUS_FABULAE = "data/phi0975/phi001/phi0975.phi001.perseus-lat2.xml";
const CATULLUS = "data/phi0472/phi001/phi0472.phi001.perseus-lat2.xml";

const OVID_AMORES = "data/phi0959/phi001/phi0959.phi001.perseus-lat2.xml";
const TACITUS_GERMANIA = "data/phi1351/phi002/phi1351.phi002.perseus-lat1.xml";
const JUVENAL_SATURAE = "data/phi1276/phi001/phi1276.phi001.perseus-lat2.xml";
const SALLUST_CATALINA1 = "data/phi0631/phi001/phi0631.phi001.perseus-lat4.xml";
const DE_AMICITIA = "data/phi0474/phi052/phi0474.phi052.perseus-lat2.xml";
const DE_RERUM_NATURA = "data/phi0550/phi001/phi0550.phi001.perseus-lat1.xml";
const NEPOS_MILTIADES = "data/phi0588/abo001/phi0588.abo001.perseus-lat2.xml";
const NEPOS_THEMISTOCLES =
  "data/phi0588/abo002/phi0588.abo002.perseus-lat2.xml";
const AMMIANUS_MARCELLINUS =
  "data/stoa0023/stoa001/stoa0023.stoa001.perseus-lat2.xml";

// Two supported works are checked in to the repo itself for the sake of unit testing.
export const LOCAL_REPO_WORKS = [CAESAR_DBG, PHAEDRUS_FABULAE];

export const ALL_SUPPORTED_WORKS = LOCAL_REPO_WORKS.concat([
  // Remove these next two for now, since it has strange optional
  // nested elements that are not marked in the CTS header
  // "data/phi0472/phi001/phi0472.phi001.perseus-lat2.xml",
  // "data/phi0893/phi001/phi0893.phi001.perseus-lat2.xml",

  // Remove this for now, since it has whitespace between elements.
  // "data/phi1318/phi001/phi1318.phi001.perseus-lat1.xml",
  OVID_AMORES,
  TACITUS_GERMANIA,
  JUVENAL_SATURAE,
  SALLUST_CATALINA1,
  DE_AMICITIA,
  CAESAR_BELLUM_CIVILIS,
  CATULLUS,
  DE_RERUM_NATURA,
  NEPOS_MILTIADES,
  NEPOS_THEMISTOCLES,
  AMMIANUS_MARCELLINUS,
]);
