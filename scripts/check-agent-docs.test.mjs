import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkAgentEntrypoints, checkMarkdownLinks } from './check-agent-docs.mjs';

// Small disposable fixtures, no access to application data/configuration.
function fixture(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'latlai-docs-check-'));
  const write = (name, body) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), body);
  };
  for (const [name, body] of Object.entries(files)) write(name, body);
  return { root, write };
}

test('relative links resolve from each document, including encoded names; examples and remote URLs are excluded', () => {
  const { root } = fixture({
    'docs/guide.md': '[ok](<../A B.md>)\n[encoded](../A%20B.md#heading)\n[web](https://example.com/no.md)\n```md\n[example](absent.md)\n```\n~~~md\n[example](other.md)\n~~~\n[broken](missing.md)\n',
    'A B.md': '# Exists\n',
  });
  const result = checkMarkdownLinks(root, ['docs/guide.md']);
  assert.equal(result.links, 3);
  assert.deepEqual(result.errors, ['docs/guide.md:10: missing file missing.md']);
});

test('malformed URL encoding reports a diagnostic instead of crashing', () => {
  const { root } = fixture({ 'README.md': '[bad](bad%XX.md)' });
  assert.match(checkMarkdownLinks(root, ['README.md']).errors[0], /invalid link encoding/);
});

function agentFixture() {
  const header = '---\nname: demo\ndescription: "A focused task"\n---\n';
  return fixture({
    'AGENTS.md': '# Common rules',
    'CLAUDE.md': '@AGENTS.md\n',
    '.agents/skills/demo/SKILL.md': `${header}\nInstructions.\n`,
    '.claude/skills/demo/SKILL.md': `${header}\n[Read](../../../.agents/skills/demo/SKILL.md)\n`,
  });
}

test('shared entrypoints pass; divergent adapter metadata fails', () => {
  const { root, write } = agentFixture();
  assert.deepEqual(checkAgentEntrypoints(root), { errors: [], skills: 1 });
  write('.claude/skills/demo/SKILL.md', '---\nname: demo\ndescription: "Different trigger"\n---\n[Read](../../../.agents/skills/demo/SKILL.md)');
  assert.match(checkAgentEntrypoints(root).errors[0], /metadata differs/);
});

test('a literal import example does not count as the Claude entrypoint', () => {
  const { root, write } = agentFixture();
  write('CLAUDE.md', '```\n@AGENTS.md\n```\n');
  assert.match(checkAgentEntrypoints(root).errors[0], /must import/);
});

test('wrong adapter target and orphan adapter fail', () => {
  const { root, write } = agentFixture();
  write('.claude/skills/demo/SKILL.md', '---\nname: demo\ndescription: "A focused task"\n---\n[Read](../../../wrong.md)');
  write('.claude/skills/orphan/SKILL.md', '# Orphan');
  const result = checkAgentEntrypoints(root);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /missing link/);
  assert.match(result.errors[1], /no canonical/);
});
