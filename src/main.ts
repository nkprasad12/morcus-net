import { readLatinFile } from './common/perseus_parser'

const DBG_ROOT = 'data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml'

console.log(readLatinFile(DBG_ROOT).toString());
