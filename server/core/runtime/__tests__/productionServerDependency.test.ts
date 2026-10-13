import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Guards the runtime dependency closure for the existing staging Dockerfile. */
describe('production server dependency boundary', () => {
  const source = readFileSync(new URL('../../../../server.ts', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'));
  const dockerfile = readFileSync(new URL('../../../../Dockerfile.staging', import.meta.url), 'utf8');
  const dockerignore = readFileSync(new URL('../../../../Dockerfile.staging.dockerignore', import.meta.url), 'utf8');

  it('does not eagerly import the development-only Vite module', () => {
    expect(pkg.devDependencies.vite).toBeTruthy();
    expect(pkg.dependencies?.vite).toBeUndefined();
    expect(source).not.toMatch(/(?:^|\n)\s*import\s+[^\n]*\sfrom\s+[\x27\x22]vite[\x27\x22]/);
    expect(source).toContain("await import('vite')");
  });

  it('builds an image whose runtime stage omits dev dependencies', () => {
    expect(dockerfile).toContain('npm ci --omit=dev');
    expect(dockerfile).toContain('CMD ["node", "dist/server.cjs"]');
    expect(dockerignore).toMatch(/^\.env\.\*$/m);
    expect(dockerignore).toMatch(/^\.git$/m);
  });
});
