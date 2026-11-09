import { withNote } from './auction-notifications.js';

// ADR 0083: the Admin resume reason is quoted after the standard text.
describe('withNote', () => {
  const body = 'Sách thử tiếp tục sau khi quản trị viên xem xét.';
  it('keeps the body alone without a note', () => {
    expect(withNote(body)).toBe(body);
    expect(withNote(body, '   ')).toBe(body);
  });
  it('quotes a short note whole, on one line', () => {
    expect(withNote(body, 'Đã xác minh\n lại tài khoản.')).toBe(
      `${body} Lời nhắn của quản trị viên: “Đã xác minh lại tài khoản.”`,
    );
  });
  it('shortens a long note so the body stays within 400 characters', () => {
    const out = withNote(body, 'ạ'.repeat(1000));
    expect([...out].length).toBeLessThanOrEqual(400);
    expect(out.startsWith(`${body} Lời nhắn của quản trị viên: “`)).toBe(true);
    expect(out.endsWith('…”')).toBe(true);
  });
  it('drops the note when the body leaves no room', () => {
    const long = 'x'.repeat(395);
    expect(withNote(long, 'Một lời nhắn đủ dài.')).toBe(long);
  });
});
