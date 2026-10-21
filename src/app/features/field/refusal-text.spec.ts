import { refusalText } from './refusal-text';

describe('refusalText', () => {
  it('explains event_not_allowed in plain words and keeps unknown kinds visible', () => {
    expect(refusalText('Unable to record failure', 'event_not_allowed')).toContain(
      'cannot be updated now',
    );
    expect(refusalText('Unable to record failure', 'event_not_allowed')).not.toContain(
      'event_not_allowed',
    );
    expect(refusalText('Unable to update status', 'something_new')).toBe(
      'Unable to update status: something_new',
    );
  });
});
