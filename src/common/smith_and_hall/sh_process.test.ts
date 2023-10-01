import { processArticle } from './sh_process';

describe('processArticle', () => {
  it('should process a single sense article', () => {
    const rawArticle = {
      keys: ['foo'],
      text: [
        'foo',
        '',
        'bar',
      ],
    };
    const expected = {
      keys: ['foo'],
      blurb: '',
      senses: [
        {
          text: 'bar',
          examples: [],
          tags: [],
        },
      ],
    };
    expect(processArticle(rawArticle)).toEqual(expected);
  });

  it('should process a multi-sense article', () => {
    const rawArticle = {
      keys: ['foo'],
      text: [
        'foo',
        '',
        'bar',
        '',
        'baz',
      ],
    };
    const expected = {
      keys: ['foo'],
      blurb: '',
      senses: [
        {
          text: 'bar',
          examples: [],
          tags: [],
        },
        {
          text: 'baz',
          examples: [],
          tags: [],
        },
      ],
    };
    expect(processArticle(rawArticle)).toEqual(expected);
  });

  it('should process an article with tags and examples', () => {
    const rawArticle = {
      keys: ['foo'],
      text: [
        'foo',
        '',
        'bar',
        '  - example 1',
        '  - example 2',
        '  -tag1',
        '  -tag2',
        '',
        'baz',
      ],
    };
    const expected = {
      keys: ['foo'],
      blurb: '',
      senses: [
        {
          text: 'bar',
          examples: ['example 1', 'example 2'],
          tags: ['tag1', 'tag2'],
        },
        {
          text: 'baz',
          examples: [],
          tags: [],
        },
      ],
    };
    expect(processArticle(rawArticle)).toEqual(expected);
  });
});