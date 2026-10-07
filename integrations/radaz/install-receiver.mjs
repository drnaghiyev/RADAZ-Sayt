import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!existsSync(path.join(repo,'lib/import-sources.ts')))throw Error('Pass the RADAZ source checkout path.');
const file=path.join(repo,'app/page.tsx');let source=readFileSync(file,'utf8');
if(!source.includes("import { importFromRadazSite }")){
  const anchor='  const dropSources = async';
  if(!source.includes(anchor))throw Error('RADAZ import entrypoint changed. Review integration before applying.');
  const hook=`  const siteImportStarted = useRef(false);
  useEffect(() => {
    if (!ready || detachedMode || siteImportStarted.current) return;
    if (!new URLSearchParams(window.location.hash.slice(1)).has('radaz-ticket')) return;
    siteImportStarted.current = true;
    const allowed = (process.env.NEXT_PUBLIC_RADAZ_SITE_ORIGINS || '').split(',').map(value => value.trim());
    void importFromRadazSite(openSources, setStatus, allowed).catch(error => setStatus(error instanceof Error ? error.message : String(error)));
  }, [ready, detachedMode]);
`;
  source=source.replace("'use client';","'use client';\nimport { importFromRadazSite } from '@/lib/site-import';");
  source=source.replace(anchor,hook+anchor);
  writeFileSync(file,source);
}
copyFileSync(fileURLToPath(new URL('./site-import.ts',import.meta.url)),path.join(repo,'lib/site-import.ts'));
console.log('RADAZ receiver installed. Set NEXT_PUBLIC_RADAZ_SITE_ORIGINS to the exact website origin and rebuild RADAZ.');
