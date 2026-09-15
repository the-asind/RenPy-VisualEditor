import { chromium } from '@playwright/test';

const baseUrl = process.env.PROJECT_GRAPH_PROFILE_URL || 'http://localhost:5137';
const username = process.env.PROJECT_GRAPH_PROFILE_USER;
const password = process.env.PROJECT_GRAPH_PROFILE_PASSWORD;
const projectName = process.env.PROJECT_GRAPH_PROFILE_PROJECT || 'PleaseBeAHuman';
const interaction = process.env.PROJECT_GRAPH_PROFILE_INTERACTION || 'zoom';
const toggleLabel = process.env.PROJECT_GRAPH_PROFILE_TOGGLE || 'Spatial window';
const queryToggleParam = process.env.PROJECT_GRAPH_PROFILE_QUERY_TOGGLE || '';
const panSweeps = Math.max(1, Number.parseInt(process.env.PROJECT_GRAPH_PROFILE_PAN_SWEEPS || '1', 10) || 1);
const zoomOutBefore = Math.max(0, Number.parseInt(process.env.PROJECT_GRAPH_PROFILE_ZOOM_OUT_BEFORE || '0', 10) || 0);

if (!username || !password) {
  throw new Error('PROJECT_GRAPH_PROFILE_USER and PROJECT_GRAPH_PROFILE_PASSWORD are required.');
}

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const summarizeProfile = (profile) => {
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  let busyMs = 0;
  let appSelfMs = 0;

  for (let index = 0; index < profile.samples.length; index += 1) {
    const node = nodesById.get(profile.samples[index]);
    const durationMs = (profile.timeDeltas[index] || 0) / 1000;
    if (!node || node.callFrame.functionName === '(idle)') {
      continue;
    }
    busyMs += durationMs;
    if (node.callFrame.url.includes('localhost:5137') || node.callFrame.url.includes('127.0.0.1:5137')) {
      appSelfMs += durationMs;
    }
  }

  return {
    appSelfMs: Math.round(appSelfMs * 1000) / 1000,
    busyMs: Math.round(busyMs * 1000) / 1000,
  };
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});

await page.goto(`${baseUrl}/login`);
await page.locator('input[autocomplete="username"]').fill(username);
await page.locator('input[autocomplete="current-password"]').fill(password);
await page.locator('button[type="submit"]').click();
await page.waitForURL((url) => url.pathname === '/');

await page.getByText(projectName, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
const projectRow = page.locator('.main-menu-project-summary').filter({ hasText: projectName });
if ((await projectRow.count()) !== 1) {
  throw new Error(`Expected one project named ${projectName}.`);
}
await projectRow.click();
await page.waitForURL((url) => url.pathname === '/editor');
const editorUrl = new URL(page.url());
editorUrl.searchParams.set('devPerf', '1');
await page.goto(editorUrl.toString());
await page.getByTestId('project-graph-dev-perf').waitFor({ state: 'visible' });

const cdp = await context.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });

const results = [];
let baselineEditedContent = null;
for (const toggleEnabled of [true, false, true, false, true, false]) {
  if (queryToggleParam) {
    const sampleUrl = new URL(editorUrl);
    sampleUrl.searchParams.set(queryToggleParam, toggleEnabled ? '1' : '0');
    await page.goto(sampleUrl.toString());
  } else {
    await page.reload();
  }
  await page.getByTestId('project-graph-dev-perf').waitFor({ state: 'visible' });
  if (!queryToggleParam) {
    const toggle = page
      .locator('.project-graph-canvas__dev-toggle')
      .filter({ hasText: toggleLabel })
      .locator('input[type="checkbox"]');
    if ((await toggle.count()) !== 1) {
      throw new Error(`Expected one ${toggleLabel} toggle.`);
    }
    await toggle.setChecked(toggleEnabled);
  }
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  for (let step = 0; step < zoomOutBefore; step += 1) {
    await zoomOut.click();
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(900);

  const panelBefore = await page.getByTestId('project-graph-dev-perf').innerText();
  const domNodesBefore = await page.locator('.react-flow__node').count();
  await page.evaluate(() => {
    window.__projectGraphProfileFrames = [];
    window.__projectGraphProfileRunning = true;
    let previous = performance.now();
    const sample = (now) => {
      if (!window.__projectGraphProfileRunning) {
        return;
      }
      window.__projectGraphProfileFrames.push(now - previous);
      previous = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await cdp.send('Profiler.start');

  if (interaction === 'pan') {
    const paneBox = await page.locator('.react-flow__pane').boundingBox();
    if (!paneBox) {
      throw new Error('React Flow pane is not measurable.');
    }
    const startX = paneBox.x + paneBox.width * 0.82;
    const startY = paneBox.y + paneBox.height * 0.82;
    for (let sweep = 0; sweep < panSweeps; sweep += 1) {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      for (let step = 1; step <= 28; step += 1) {
        await page.mouse.move(startX - step * 28, startY - Math.sin(step / 3) * 45);
        await page.waitForTimeout(28);
      }
      await page.mouse.up();
    }
  } else if (interaction === 'edit') {
    const scenarioNodes = page.locator('.react-flow__node-scenarioNode');
    const scenarioNodeCount = await scenarioNodes.count();
    if (scenarioNodeCount === 0) {
      throw new Error('Expected at least one visible scenario node.');
    }
    await scenarioNodes.nth(0).click({ force: true });
    const editor = page.getByLabel('Edit scenario node content');
    await editor.waitFor({ state: 'visible' });
    const originalContent = await editor.inputValue();
    if (baselineEditedContent === null) {
      baselineEditedContent = originalContent;
    } else if (originalContent !== baselineEditedContent) {
      throw new Error('The profiled scenario content was not restored by the previous sample.');
    }
    for (let edit = 0; edit < 8; edit += 1) {
      await editor.fill(`${originalContent}\n# projection profile ${edit}`);
      await page.waitForTimeout(180);
      await editor.fill(originalContent);
      await page.waitForTimeout(180);
    }
    await editor.fill(originalContent);
    await page.waitForTimeout(750);
    if ((await editor.inputValue()) !== originalContent) {
      throw new Error('The profiled scenario editor did not restore its original content.');
    }
  } else {
    for (let step = 0; step < 5; step += 1) {
      await zoomOut.click();
      await page.waitForTimeout(220);
    }
  }
  await page.waitForTimeout(300);

  const { profile } = await cdp.send('Profiler.stop');
  const frameDurations = await page.evaluate(() => {
    window.__projectGraphProfileRunning = false;
    return window.__projectGraphProfileFrames || [];
  });
  const cpu = summarizeProfile(profile);
  results.push({
    toggleEnabled,
    ...cpu,
    averageFrameMs:
      Math.round((frameDurations.reduce((sum, frameMs) => sum + frameMs, 0) / Math.max(1, frameDurations.length)) * 1000) /
      1000,
    longFrames: frameDurations.filter((frameMs) => frameMs >= 50).length,
    maxFrameMs: Math.round(Math.max(0, ...frameDurations) * 1000) / 1000,
    domNodesBefore,
    panelBefore,
    panelAfter: await page.getByTestId('project-graph-dev-perf').innerText(),
  });
}

if (interaction === 'edit' && baselineEditedContent !== null) {
  await page.reload();
  await page.getByTestId('project-graph-dev-perf').waitFor({ state: 'visible' });
  const scenarioNodes = page.locator('.react-flow__node-scenarioNode');
  await scenarioNodes.nth(0).click({ force: true });
  const editor = page.getByLabel('Edit scenario node content');
  await editor.waitFor({ state: 'visible' });
  if ((await editor.inputValue()) !== baselineEditedContent) {
    throw new Error('The profiled scenario content did not persist its restored value after reload.');
  }
}

const byState = (enabled) => results.filter((result) => result.toggleEnabled === enabled);
const summary = Object.fromEntries(
  [true, false].map((enabled) => {
    const samples = byState(enabled);
    return [
      enabled ? 'toggleOn' : 'toggleOff',
      {
        medianAppSelfMs: median(samples.map((sample) => sample.appSelfMs)),
        medianAverageFrameMs: median(samples.map((sample) => sample.averageFrameMs)),
        medianBusyMs: median(samples.map((sample) => sample.busyMs)),
        medianDomNodesBefore: median(samples.map((sample) => sample.domNodesBefore)),
        medianLongFrames: median(samples.map((sample) => sample.longFrames)),
        medianMaxFrameMs: median(samples.map((sample) => sample.maxFrameMs)),
      },
    ];
  }),
);

await cdp.send('Profiler.disable');
await browser.close();

console.log(
  JSON.stringify(
    {
      consoleErrors,
      editorUrl: editorUrl.toString(),
      interaction,
      panSweeps,
      queryToggleParam,
      toggleLabel,
      zoomOutBefore,
      results,
      summary,
    },
    null,
    2,
  ),
);
