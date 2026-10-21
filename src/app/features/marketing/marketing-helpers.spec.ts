import { imageUrlProblem } from './image-url';
import { instantOrOriginal, instantToIstInput, istInputToInstant } from './ist-datetime';
import { parsePincodes } from './pincodes';

describe('imageUrlProblem (same rule as the API)', () => {
  const hosts = ['cdn.forumhospital.com'];

  it('accepts an empty URL and an https URL on an allowed host or subdomain', () => {
    expect(imageUrlProblem('', hosts)).toBeNull();
    expect(imageUrlProblem('https://cdn.forumhospital.com/a.png', hosts)).toBeNull();
    expect(imageUrlProblem('https://img.cdn.forumhospital.com/a.png', hosts)).toBeNull();
    expect(imageUrlProblem('HTTPS://CDN.FORUMHOSPITAL.COM/a.png', hosts)).toBeNull();
  });

  it('refuses http, credentials, other hosts, look-alike hosts, bad URLs and over-long URLs', () => {
    expect(imageUrlProblem('http://cdn.forumhospital.com/a.png', hosts)).toMatch(/HTTPS/);
    expect(imageUrlProblem('https://user:pass@cdn.forumhospital.com/a.png', hosts)).toMatch(
      /username/,
    );
    expect(imageUrlProblem('https://example.test/a.png', hosts)).toMatch(/not in the allowed/);
    expect(imageUrlProblem('https://evilcdn.forumhospital.com.example.test/a.png', hosts)).toMatch(
      /not in the allowed/,
    );
    expect(imageUrlProblem('https://xcdn.forumhospital.com/a.png', hosts)).toMatch(
      /not in the allowed/,
    );
    expect(imageUrlProblem('not a url', hosts)).toMatch(/Invalid/);
    expect(imageUrlProblem(`https://cdn.forumhospital.com/${'a'.repeat(2100)}`, hosts)).toMatch(
      /2048/,
    );
  });

  it('with no allow-list any https host is acceptable', () => {
    expect(imageUrlProblem('https://example.test/a.png', [])).toBeNull();
  });
});

describe('IST date helpers', () => {
  it('shows a stored instant as IST wall time whatever the browser timezone', () => {
    expect(instantToIstInput('2026-11-01T10:00:00.000Z')).toBe('2026-11-01T15:30');
    expect(instantToIstInput('2026-11-01T20:00:00.000Z')).toBe('2026-11-02T01:30'); // crosses midnight
    expect(instantToIstInput(null)).toBe('');
    expect(instantToIstInput('garbage')).toBe('');
  });

  it('round-trips: showing and re-sending an instant does not move it', () => {
    for (const iso of [
      '2026-11-01T10:00:00.000Z',
      '2026-12-31T18:29:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ]) {
      expect(istInputToInstant(instantToIstInput(iso))).toBe(iso);
    }
  });

  it('converts an edited IST input to the matching instant', () => {
    expect(istInputToInstant('2026-11-01T15:30')).toBe('2026-11-01T10:00:00.000Z');
    expect(istInputToInstant('')).toBeNull();
    expect(istInputToInstant('2026-11-01')).toBeNull();
  });

  it('keeps an untouched instant exactly as stored, seconds included, and converts only edits', () => {
    const stored = '2026-11-01T10:00:42.000Z';
    expect(instantOrOriginal(instantToIstInput(stored), stored)).toBe(stored);
    expect(instantOrOriginal('2026-11-01T16:00', stored)).toBe('2026-11-01T10:30:00.000Z');
    expect(instantOrOriginal('', stored)).toBeNull();
    expect(instantOrOriginal('2026-11-01T16:00', null)).toBe('2026-11-01T10:30:00.000Z');
  });
});

describe('parsePincodes', () => {
  it('returns distinct valid pincodes and reports every invalid entry instead of dropping it', () => {
    expect(parsePincodes('560001, 560002\n560001')).toEqual({
      pincodes: ['560001', '560002'],
      invalid: [],
    });
    expect(parsePincodes('56001 560002')).toEqual({ pincodes: ['560002'], invalid: ['56001'] });
    expect(parsePincodes('060001, abcdef, 5600012')).toEqual({
      pincodes: [],
      invalid: ['060001', 'abcdef', '5600012'],
    });
    expect(parsePincodes('  ')).toEqual({ pincodes: [], invalid: [] });
  });
});
