import {describe, expect, test} from '@jest/globals';
import { readLatinFile } from '@/common/perseus_parser'

const DBG_ROOT = 'data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml'

describe('sum module', () => {
  test('adds 1 + 2 to equal 3', () => {
    readLatinFile(DBG_ROOT)
  });
});