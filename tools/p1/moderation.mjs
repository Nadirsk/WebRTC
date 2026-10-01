#!/usr/bin/env node
/**
 * One room spread over three nodes (capacity 1 per node forces it), driven through the web SDK:
 *   - audio crosses node links (cascading)
 *   - host controls work on participants connected to other nodes
 *   - kick with ban, end of channel
 *
 *   node tools/p1/moderation.mjs
 */
import {
  check,
  eventsOf,
  harnessPage,
  peakKbps,
  joinIn,
  launchBrowser,
  project,
  sleep,
  startCluster,
  summary,
  token,
  waitForEvent,
} from './lib.mjs';

const app = project('Moderation test');
const cluster = await startCluster({ nodes: 3, capacity: 1, projects: [app] });
const browser = await launchBrowser();
const channel = 'town-hall';
const config = { appId: app.appId, allocatorUrl: cluster.allocatorUrl };
const joinAs = (page, uid, role, maxRole = role, extra = {}) =>
  joinIn(page, uid, config, { channel, uid, role, displayName: uid, token: token(app, { channel, uid, role: maxRole }) }, extra);

try {
  const page = await harnessPage(browser, cluster);

  const host = await joinAs(page, 'host', 'host');
  const speaker = await joinAs(page, 'speaker', 'speaker', 'speaker', { tone: true });
  const listener = await joinAs(page, 'listener', 'audience', 'speaker');
  check('host, speaker and listener joined', !host.error && !speaker.error && !listener.error, [host, speaker, listener].map((j) => j.error ?? j.nodeId).join(', '));
  check('each is on a different node', new Set([host.nodeId, speaker.nodeId, listener.nodeId]).size === 3, `${host.nodeId} / ${speaker.nodeId} / ${listener.nodeId}`);

  await sleep(2500);
  const listenerKbps = await peakKbps(page, 'listener');
  const hostKbps = await peakKbps(page, 'host');
  check("listener hears the speaker across nodes", listenerKbps > 0, `${listenerKbps} kbps`);
  check('host hears the speaker across nodes', hostKbps > 0, `${hostKbps} kbps`);
  const users = await page.evaluate(() => window.harness.clients.listener.remoteUsers.map((u) => `${u.uid}:${u.role}`).sort());
  check('listener sees both other participants with roles', users.join(',') === 'host:host,speaker:speaker', users.join(','));

  const stats = await Promise.all(cluster.nodes.map((n) => fetch(`${n.url}/api/stats`).then((r) => r.json())));
  const links = stats.map((s) => s.rooms[0]?.links.length ?? 0);
  check('every node links to the other two', links.every((l) => l === 2), links.join('/'));

  // Mute across nodes.
  await page.evaluate(() => window.harness.clients.host.muteRemoteUser('speaker', 'audio'));
  check('speaker is told a host muted them', await waitForEvent(page, 'speaker', 'mutedByHost'));
  check('listener sees the speaker muted', await waitForEvent(page, 'listener', 'userMuted', '(ev) => ev.data[2] === true'));
  await page.evaluate(() => window.harness.clients.speaker.muteLocalAudio(false));
  check('speaker can unmute; listener sees it', await waitForEvent(page, 'listener', 'userMuted', '(ev) => ev.data[2] === false'));

  // Role changes across nodes.
  await page.evaluate(() => window.harness.clients.host.setRemoteUserRole('listener', 'speaker'));
  check('host brings the listener on stage', await waitForEvent(page, 'listener', 'roleChanged', "(ev) => ev.data[0] === 'speaker' && ev.data[1] === true"));
  check('host sees the new role', await waitForEvent(page, 'host', 'userUpdated', "(ev) => ev.data[0].uid === 'listener' && ev.data[0].role === 'speaker'"));
  const promoteHost = await page.evaluate(() => window.harness.clients.host.setRemoteUserRole('listener', 'host').then(() => 'ok', (e) => e.code));
  check("host cannot give a role the user's token does not allow", promoteHost === 'role_not_allowed', promoteHost);
  await page.evaluate(() => window.harness.clients.host.setRemoteUserRole('speaker', 'audience'));
  check('host moves the speaker off stage', await waitForEvent(page, 'speaker', 'roleChanged', "(ev) => ev.data[0] === 'audience'"));
  check("speaker's track is gone for the others", await waitForEvent(page, 'host', 'trackUnsubscribed', "(ev) => ev.data[0].uid === 'speaker'"));
  const notHost = await page.evaluate(() => window.harness.clients.listener.muteRemoteUser('host').then(() => 'ok', (e) => e.code));
  check('a speaker cannot use host controls', notHost === 'not_host', notHost);

  // Kick with a ban, across nodes.
  await page.evaluate(() => window.harness.clients.host.removeRemoteUser('listener', { banSeconds: 60 }));
  check('removed user is disconnected with reason "kicked"', await waitForEvent(page, 'listener', 'connectionStateChanged', "(ev) => ev.data[0] === 'disconnected' && ev.data[2] === 'kicked'"));
  check('others see the removed user leave', await waitForEvent(page, 'host', 'userLeft', "(ev) => ev.data[0].uid === 'listener'"));
  // The uid decides the ban, so rejoin with the same uid under another harness name.
  const rejoinSame = await page.evaluate(
    async (config, channel, tok) => {
      const c = window.harness.create('listener2', config);
      return c.join({ channel, uid: 'listener', token: tok }).then(() => 'joined', (e) => e.code);
    },
    config,
    channel,
    token(app, { channel, uid: 'listener', role: 'speaker' }),
  );
  check('banned user cannot rejoin', rejoinSame === 'banned', rejoinSame);

  // Same uid from a second device replaces the first session.
  const second = await page.evaluate(
    async (config, channel, tok) => {
      const c = window.harness.create('speaker-2nd-device', config);
      return c.join({ channel, uid: 'speaker', token: tok }).then(() => 'joined', (e) => e.code);
    },
    config,
    channel,
    token(app, { channel, uid: 'speaker', role: 'speaker' }),
  );
  check('same uid joining again is accepted', second === 'joined', second);
  check('the older session ends with reason "replaced"', await waitForEvent(page, 'speaker', 'connectionStateChanged', "(ev) => ev.data[2] === 'replaced'"));

  // End for everyone.
  await page.evaluate(() => window.harness.clients.host.endChannel());
  check('end of channel reaches users on other nodes', await waitForEvent(page, 'speaker-2nd-device', 'connectionStateChanged', "(ev) => ev.data[2] === 'channelEnded'"));
  await sleep(1000);
  const after = await Promise.all(cluster.nodes.map((n) => fetch(`${n.url}/api/stats`).then((r) => r.json())));
  check('no rooms left on any node', after.every((s) => s.totals.rooms === 0), after.map((s) => s.totals.rooms).join('/'));

  const hostEvents = await eventsOf(page, 'host');
  check('no SDK exceptions on the host', !hostEvents.some((e) => e.name === 'exception'), JSON.stringify(hostEvents.filter((e) => e.name === 'exception')));
} catch (error) {
  check(`unexpected error: ${error.stack}`, false);
} finally {
  await browser.close();
  await cluster.stop();
  summary('moderation');
}
