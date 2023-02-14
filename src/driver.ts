import { readLatinFile } from '@/common/perseus_parser'
import { startServer } from '@/server/main'

const DBG_ROOT = 'data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml'

const content = readLatinFile(DBG_ROOT).toString();
startServer(content);
