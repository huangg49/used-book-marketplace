import { AssistTimings } from './assist-timings.js';
describe('safe AI stage timings', () => {
  it('adds repeated model calls and records failed stages without content', async () => {
    let ms = 0;
    const timings = new AssistTimings(() => ms);
    await timings.measure('images', async () => {
      ms += 5;
    });
    await timings.measure('model', async () => {
      ms += 8;
    });
    await expect(
      timings.measure('model', async () => {
        ms += 9;
        throw new Error('private content');
      }),
    ).rejects.toThrow();
    expect(timings.header()).toBe(
      'ai_images;dur=5.0, ai_model;dur=17.0, ai_total;dur=22.0',
    );
  });
});
