import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Deliberately checks file targets, not URL availability, Markdown anchors or prose.
export function markdownOutsideFences(text) {
  let fence;
  return text.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = undefined;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

export function checkMarkdownLinks(root, files) {
  const errors = [];
  let links = 0;
  for (const file of files) {
    if (!file.endsWith('.md') || !existsSync(path.join(root, file))) continue;
    const source = markdownOutsideFences(readFileSync(path.join(root, file), 'utf8'));
    for (const match of source.matchAll(/\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      let target = match[1].replace(/^<|>$/g, '');
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(target)) continue;
      const line = source.slice(0, match.index).split('\n').length;
      try {
        target = decodeURIComponent(target.split('#')[0]);
      } catch {
        errors.push(`${file}:${line}: invalid link encoding`);
        continue;
      }
      if (!target) continue;
      links++;
      if (!existsSync(path.resolve(root, path.dirname(file), target))) {
        errors.push(`${file}:${line}: missing file ${target}`);
      }
    }
  }
  return { errors, links };
}

// Repo skills use single-line name and JSON-quoted description (valid YAML).
// Restricting this format keeps the check dependency-free on a fresh clone.
function skillMetadata(root, file, errors) {
  if (!existsSync(path.join(root, file))) {
    errors.push(`${file}: missing skill`);
    return undefined;
  }
  const source = readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const header = source.match(/^---\nname: ([a-z0-9]+(?:-[a-z0-9]+)*)\ndescription: ("[^\n]*")\n---\n/);
  if (!header || header[1].length > 64) {
    errors.push(`${file}: expected name and a single-line JSON-quoted description`);
    return undefined;
  }
  try {
    const description = JSON.parse(header[2]);
    if (!description.trim() || description.length > 1024) throw new Error('description length');
    return { name: header[1], description, source };
  } catch {
    errors.push(`${file}: invalid description`);
    return undefined;
  }
}

export function checkAgentEntrypoints(root) {
  const errors = [];
  const claude = path.join(root, 'CLAUDE.md');
  if (!existsSync(path.join(root, 'AGENTS.md'))) errors.push('AGENTS.md: missing entrypoint');
  if (!existsSync(claude) || !/^@AGENTS\.md\s*$/m.test(markdownOutsideFences(readFileSync(claude, 'utf8')))) {
    errors.push('CLAUDE.md: must import @AGENTS.md outside a code fence');
  }
  const directories = (dir) => existsSync(path.join(root, dir))
    ? readdirSync(path.join(root, dir), { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name)
    : [];
  const names = directories('.agents/skills');
  if (!names.length) errors.push('.agents/skills: no project skills');
  for (const name of names) {
    const sourcePath = `.agents/skills/${name}/SKILL.md`;
    const adapterPath = `.claude/skills/${name}/SKILL.md`;
    const source = skillMetadata(root, sourcePath, errors);
    const adapter = skillMetadata(root, adapterPath, errors);
    if (source && source.name !== name) errors.push(`${sourcePath}: name must match folder`);
    if (source && adapter && (source.name !== adapter.name || source.description !== adapter.description)) {
      errors.push(`${adapterPath}: metadata differs from canonical skill`);
    }
    if (adapter && !adapter.source.includes(`](../../../${sourcePath})`)) {
      errors.push(`${adapterPath}: missing link to canonical skill`);
    }
  }
  for (const name of directories('.claude/skills')) {
    if (!names.includes(name)) errors.push(`.claude/skills/${name}: adapter has no canonical skill`);
  }
  return { errors, skills: names.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  }).split('\0').filter(Boolean);
  const unique = [...new Set(files)];
  const links = checkMarkdownLinks(root, unique);
  const agents = checkAgentEntrypoints(root);
  const errors = [...links.errors, ...agents.errors];
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${unique.filter((file) => file.endsWith('.md') && existsSync(path.join(root, file))).length} Markdown files, ${links.links} relative file links, ${agents.skills} skill/adapter pairs.`);
    console.log('Not checked: anchors, external URLs, business claims, automatic discovery in an AI host.');
  }
}
