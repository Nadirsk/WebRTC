#!/usr/bin/env node
/**
 * Token lifetime and metering:
 *   - tokenWillExpire fires before expiry; renewToken() keeps the session alive
 *   - without renewal the session ends with reason tokenExpired
 *   - participant-minutes per project match how long people actually stayed, split audio/video
 *
 *   node tools/p1/session-life.mjs
 */
import {
  check,
  eventsOf,
  harnessPage,
  joinIn,
  launchBrowser,
  project,
  sleep,
  startCluster,
  summary,
  token,
  waitForEvent,
} from './lib.mjs';

const app = project('Session test');
const other = project('Other project');
// Warn 5 s before expiry instead of 30 s so the test stays short.
const cluster = await startCluster({ nodes: 2, projects: [app, other], env: { TOKEN_WARNING_SECONDS: '5' } });
const browser = await launchBrowser();
const config = { appId: app.appId, allocatorUrl: cluster.allocatorUrl };

try {
  const page = await harnessPage(browser, cluster);
  const startedAt = Date.now();

  // ---------------------------------------------------------------- tokens
  const renewer = await joinIn(page, 'renewer', config, { channel: 'tok', uid: 'renewer', token: token(app, { channel: 'tok', uid: 'renewer', ttl: 12 }) });
  const lapser = await joinIn(page, 'lapser', config, { channel: 'tok', uid: 'lapser', token: token(app, { channel: 'tok', uid: 'lapser', ttl: 12 }) });
  check('two clients joined with 12-second tokens', !renewer.error && !lapser.error, renewer.error ?? lapser.error ?? '');
  const fresh = token(app, { channel: 'tok', uid: 'renewer', ttl: 3600 });
  await page.evaluate((tok) => {
    const c = window.harness.clients.renewer;
    c.on('tokenWillExpire', () => void c.renewToken(tok));
  }, fresh);

  check('tokenWillExpire fires about 5 s before expiry', await waitForEvent(page, 'renewer', 'tokenWillExpire', '() => true', 12_000));
  check('without renewal the session ends: tokenExpired', await waitForEvent(page, 'lapser', 'connectionStateChanged', "(ev) => ev.data[0] === 'disconnected' && ev.data[2] === 'tokenExpired'", 12_000));
  await sleep(3000);
  const renewedState = await page.evaluate(() => window.harness.clients.renewer.connectionState);
  check('the renewed client is still connected after the old expiry', renewedState === 'connected', renewedState);
  const wrong = await page.evaluate(
    (tok) => window.harness.clients.renewer.renewToken(tok).then(() => 'ok', (e) => e.code),
    token(app, { channel: 'tok', uid: 'someone-else', ttl: 3600 }),
  );
  check("renewing with another user's token is refused", wrong === 'wrong_uid', wrong);
  await page.evaluate(() => window.harness.clients.renewer.leave());

  // ---------------------------------------------------------------- metering
  // Two users talk for ~20 s; one also sends video for ~10 s. Another project has one user for ~10 s.
  const meterStart = Date.now();
  await joinIn(page, 'm1', config, { channel: 'meter', uid: 'm1', token: token(app, { channel: 'meter', uid: 'm1' }) }, { tone: true });
  await joinIn(page, 'm2', config, { channel: 'meter', uid: 'm2', token: token(app, { channel: 'meter', uid: 'm2' }) });
  await joinIn(page, 'o1', { appId: other.appId, allocatorUrl: cluster.allocatorUrl }, { channel: 'meter', uid: 'o1', token: token(other, { channel: 'meter', uid: 'o1' }) });
  await page.evaluate(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
    const ctx = canvas.getContext('2d');
    setInterval(() => {
      ctx.fillStyle = `hsl(${Date.now() % 360} 60% 50%)`;
      ctx.fillRect(0, 0, 320, 240);
    }, 50);
    window.__video = await window.harness.clients.m1.publish(canvas.captureStream(15).getVideoTracks()[0]);
  });
  await sleep(10_000);
  await page.evaluate(() => window.__video.close());
  await page.evaluate(() => window.harness.clients.o1.leave());
  await sleep(10_000);
  await page.evaluate(() => Promise.all([window.harness.clients.m1.leave(), window.harness.clients.m2.leave()]));
  const meterSeconds = (Date.now() - meterStart) / 1000;
  await sleep(2000); // events flush every second

  const usage = await cluster.internal(`/internal/usage?appId=${app.appId}&from=${meterStart - 1000}&to=${Date.now()}`);
  const expected = (2 * meterSeconds) / 60;
  const meter = usage.byChannel.find((c) => c.channel === 'meter');
  check(
    'participant-minutes match time in the channel (±5%)',
    meter && Math.abs(meter.minutes - expected) / expected < 0.05,
    `${meter?.minutes} min measured, ${expected.toFixed(2)} expected`,
  );
  // m1 sent video for 10 s and m2 received it for about as long: ~20 video-seconds.
  check('video minutes cover the time video was on (~0.33 min)', Math.abs(usage.videoMinutes - 20 / 60) < 0.08, `${usage.videoMinutes} video min`);
  check('audio minutes are the rest', Math.abs(usage.audioMinutes + usage.videoMinutes - usage.totalMinutes) < 0.02, `${usage.audioMinutes} audio + ${usage.videoMinutes} video = ${usage.totalMinutes}`);
  const otherUsage = await cluster.internal(`/internal/usage?appId=${other.appId}&from=${meterStart - 1000}&to=${Date.now()}`);
  check('the other project is billed only for its own user (~0.17 min)', Math.abs(otherUsage.totalMinutes - 10 / 60) < 0.05, `${otherUsage.totalMinutes} min, ${otherUsage.sessions} session`);

  const whole = await cluster.internal(`/internal/usage?appId=${app.appId}&from=${startedAt - 1000}&to=${Date.now()}`);
  check('token sessions are metered too', whole.byChannel.some((c) => c.channel === 'tok' && c.sessions >= 2), JSON.stringify(whole.byChannel));
  const events = await eventsOf(page, 'm2');
  check('no SDK exceptions', !events.some((e) => e.name === 'exception'));
} catch (error) {
  check(`unexpected error: ${error.stack}`, false);
} finally {
  await browser.close();
  await cluster.stop();
  summary('session-life');
}
